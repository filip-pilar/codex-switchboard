import Foundation
import Darwin
import AppKit

public enum JSONValue: Decodable, Sendable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public var objectValue: [String: JSONValue]? {
        guard case let .object(value) = self else { return nil }
        return value
    }

    public var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }

    public var doubleValue: Double? {
        guard case let .number(value) = self else { return nil }
        return value
    }

    public var intValue: Int? { doubleValue.flatMap(Int.init(exactly:)) }

    public var boolValue: Bool? {
        guard case let .bool(value) = self else { return nil }
        return value
    }

    subscript(key: String) -> JSONValue? { objectValue?[key] }
}

private struct RPCRemoteError: Decodable, Sendable {
    public let code: Int?
    public let message: String
}

private struct RPCEnvelope: Decodable, Sendable {
    public let id: Int?
    public let method: String?
    public let params: JSONValue?
    public let result: JSONValue?
    public let error: RPCRemoteError?
}

private final class LinePump: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer = Data()
    private var lines: [Data] = []
    private var waiters: [CheckedContinuation<Data?, any Error>] = []
    private var isFinished = false

    public init(handle: FileHandle) {
        handle.readabilityHandler = { [weak self] readable in
            guard let self else { return }
            let data = readable.availableData
            guard !data.isEmpty else {
                self.finish()
                return
            }
            self.consume(data)
        }
    }

    private func consume(_ data: Data) {
        lock.lock()
        buffer.append(data)
        if buffer.count > 4 * 1024 * 1024 { buffer.removeAll(); lock.unlock(); finish(); return }
        var parsedLines: [Data] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = Data(buffer[..<newline])
            buffer.removeSubrange(...newline)
            if !line.isEmpty { parsedLines.append(line) }
        }
        lock.unlock()
        for line in parsedLines {
            deliver(line)
        }
    }

    public func next() async throws -> Data? {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if !lines.isEmpty {
                let line = lines.removeFirst()
                lock.unlock()
                continuation.resume(returning: line)
            } else if isFinished {
                lock.unlock()
                continuation.resume(returning: nil)
            } else {
                waiters.append(continuation)
                lock.unlock()
            }
        }
    }

    private func deliver(_ line: Data) {
        lock.lock()
        if !waiters.isEmpty {
            let waiter = waiters.removeFirst()
            lock.unlock()
            waiter.resume(returning: line)
        } else {
            if lines.count >= 256 { lock.unlock(); finish(); return }
            lines.append(line)
            lock.unlock()
        }
    }

    public func finish() {
        lock.lock()
        guard !isFinished else { lock.unlock(); return }
        isFinished = true
        if !buffer.isEmpty {
            lines.append(buffer)
            buffer.removeAll()
        }
        let pending = waiters
        waiters.removeAll()
        let deliveries = pending.map { _ in lines.isEmpty ? nil : lines.removeFirst() }
        lock.unlock()
        for (waiter, data) in zip(pending, deliveries) { waiter.resume(returning: data) }
    }
}

private final class StderrDrain: @unchecked Sendable {
    private let lock = NSLock()

    private var isFinished = false
    private var waiters: [CheckedContinuation<String, Never>] = []

    public func finishedMessage() async -> String {
        await withCheckedContinuation { continuation in
            lock.lock()
            if isFinished {
                let message = "The Codex runtime exited unexpectedly."
                lock.unlock()
                continuation.resume(returning: message)
            } else {
                waiters.append(continuation)
                lock.unlock()
            }
        }
    }

    public func finish() {
        lock.lock()
        guard !isFinished else { lock.unlock(); return }
        isFinished = true
        let message = "The Codex runtime exited unexpectedly."
        let pending = waiters
        waiters.removeAll()
        lock.unlock()
        pending.forEach { $0.resume(returning: message) }
    }

    public init(handle: FileHandle) {
        handle.readabilityHandler = { [weak self] readable in
            guard let self else { return }
            let data = readable.availableData
            guard !data.isEmpty else {
                readable.readabilityHandler = nil
                self.finish()
                return
            }
            // Discard raw stderr; it is not diagnostic output.
        }
    }
}

private actor JSONRPCSession {
    private let process: Process
    private let input: FileHandle
    private let output: FileHandle
    private let errorOutput: FileHandle
    private let pump: LinePump
    private let stderrDrain: StderrDrain
    private let decoder = JSONDecoder()
    private var didTimeout = false
    private var pendingNotifications: [RPCEnvelope] = []

    public init(executableURL: URL, profileHome: URL, environment inheritedEnvironment: [String: String]) throws {
        let process = Process()
        let inputPipe = Pipe()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.executableURL = executableURL
        process.arguments = ["app-server", "--stdio"]
        var environment = inheritedEnvironment
        environment["CODEX_HOME"] = profileHome.path
        process.environment = environment
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        let pump = LinePump(handle: outputPipe.fileHandleForReading)
        let stderrDrain = StderrDrain(handle: errorPipe.fileHandleForReading)
        self.process = process
        input = inputPipe.fileHandleForWriting
        output = outputPipe.fileHandleForReading
        errorOutput = errorPipe.fileHandleForReading
        self.pump = pump
        self.stderrDrain = stderrDrain

        do {
            try process.run()
        } catch {
            throw CodexClientError.processLaunchFailed(error.localizedDescription)
        }
    }

    public func initialize(timeout: Duration, clientVersion: String) async throws {
        try send([
            "method": "initialize",
            "id": 0,
            "params": [
                "clientInfo": [
                    "name": "codex_account_switcher",
                    "title": "Codex Account Switcher",
                    "version": clientVersion,
                ],
            ],
        ])
        _ = try await response(id: 0, timeout: timeout)
        try send(["method": "initialized", "params": [:]])
    }

    public func request(
        method: String,
        id: Int,
        params: [String: Any] = [:],
        timeout: Duration
    ) async throws -> JSONValue {
        try send(["method": method, "id": id, "params": params])
        let envelope = try await response(id: id, timeout: timeout)
        guard let result = envelope.result else { throw CodexClientError.malformedResponse }
        return result
    }

    public func notification(method: String, timeout: Duration) async throws -> JSONValue {
        let envelope = try await receive(
            where: { $0.method == method && $0.id == nil },
            timeout: timeout
        )
        return envelope.params ?? .object([:])
    }

    public func stop() async -> Bool {
        output.readabilityHandler = nil
        errorOutput.readabilityHandler = nil
        try? input.close()
        if process.isRunning {
            process.terminate()
        }
        pump.finish()
        stderrDrain.finish()
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(3))
        while process.isRunning && clock.now < deadline {
            // Cancellation still waits for our own runtime to exit; a new profile
            // operation must not race a lingering process on the same auth file.
            await Task.detached { try? await Task.sleep(for: .milliseconds(20)) }.value
        }
        if process.isRunning {
            // Only the account RPC child created by this session, never Desktop
            // or a user's existing CLI. Do not permit it to race credential writes.
            _ = Darwin.kill(process.processIdentifier, SIGKILL)
            let forcedDeadline = clock.now.advanced(by: .seconds(1))
            while process.isRunning && clock.now < forcedDeadline {
                await Task.detached { try? await Task.sleep(for: .milliseconds(20)) }.value
            }
        }
        return !process.isRunning
    }

    private func response(id: Int, timeout: Duration) async throws -> RPCEnvelope {
        try await receive(where: { $0.id == id }, timeout: timeout)
    }

    private func receive(
        where predicate: @escaping @Sendable (RPCEnvelope) -> Bool,
        timeout: Duration
    ) async throws -> RPCEnvelope {
        if let index = pendingNotifications.firstIndex(where: predicate) {
            return pendingNotifications.remove(at: index)
        }
        didTimeout = false
        let timeoutTask = Task { [weak self] in
            do {
                try await Task.sleep(for: timeout)
                await self?.triggerTimeout()
            } catch {
                // Cancellation means a response arrived before the deadline.
            }
        }
        defer { timeoutTask.cancel() }

        while let line = try await pump.next() {
            let message: RPCEnvelope
            do {
                message = try decoder.decode(RPCEnvelope.self, from: line)
            } catch {
                throw CodexClientError.malformedResponse
            }
            if predicate(message) {
                if let error = message.error {
                    throw CodexClientError.remoteError(code: error.code, message: "The official Codex runtime rejected the account operation.")
                }
                return message
            }
            // Login completion can arrive before the login/start response.
            if message.method == "account/login/completed", message.id == nil {
                guard pendingNotifications.count < 256 else { throw CodexClientError.malformedResponse }
            pendingNotifications.append(message)
                if pendingNotifications.count > 16 { pendingNotifications.removeFirst() }
            }
        }
        if didTimeout { throw CodexClientError.timeout }
        let details = await stderrDrain.finishedMessage()
        if didTimeout { throw CodexClientError.timeout }
        if !details.isEmpty { throw CodexClientError.connectionClosedWithDetails(details) }
        throw CodexClientError.connectionClosed
    }

    private func triggerTimeout() {
        didTimeout = true
        output.readabilityHandler = nil
        errorOutput.readabilityHandler = nil
        if process.isRunning { process.terminate() }
        pump.finish()
        stderrDrain.finish()
    }

    private func send(_ object: [String: Any]) throws {
        guard JSONSerialization.isValidJSONObject(object) else {
            throw CodexClientError.malformedResponse
        }
        var data = try JSONSerialization.data(withJSONObject: object)
        data.append(0x0A)
        try input.write(contentsOf: data)
    }
}

public struct CodexExecutableLocator: Sendable {
    public let explicitURL: URL?

    public init(explicitURL: URL? = nil) {
        self.explicitURL = explicitURL
    }

    public func locate(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        if let explicitURL, isExecutable(explicitURL.path) {
            return explicitURL
        }
        let command = environment["CODEX_CLI_PATH"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        let executable = command.flatMap { $0.isEmpty ? nil : $0 } ?? "codex"
        if command == nil {
            for path in ["/Applications/ChatGPT.app/Contents/Resources/codex", "/Applications/Codex.app/Contents/Resources/codex"] where isExecutable(path) {
                return URL(fileURLWithPath: path)
            }
        }
        if executable.contains("/") {
            guard executable.hasPrefix("/"), isExecutable(executable) else {
                throw CodexClientError.processLaunchFailed("CODEX_CLI_PATH is not executable: \(executable)")
            }
            return URL(fileURLWithPath: executable)
        }
        if let path = environment["PATH"]?
            .split(separator: ":")
            .filter({ $0.hasPrefix("/") })
            .map({ String($0) + "/" + executable })
            .first(where: isExecutable)
        {
            return URL(fileURLWithPath: path)
        }
        throw CodexClientError.executableNotFound
    }

    public func launchConfiguration() throws -> (executable: URL, environment: [String: String]) {
        var environment = ProcessInfo.processInfo.environment
        let existing = environment["PATH"] ?? ""
        environment["PATH"] = existing + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        return (try locate(environment: environment), environment)
    }

    private func isExecutable(_ path: String) -> Bool {
        FileManager.default.isExecutableFile(atPath: path)
    }
}

public protocol AccountClient: CodexIdentityReading {
    func readUsageWindows(profileHome: URL) async throws -> [RateLimitWindow]
    func login(profileHome: URL) async throws -> AccountIdentity
}

public struct CodexClient: AccountClient {
    public let locator: CodexExecutableLocator
    public let requestTimeout: Duration
    public let clientVersion: String
    private let openBrowser: @Sendable (URL) async throws -> Void

    public init(locator: CodexExecutableLocator = .init(), requestTimeout: Duration = .seconds(20),
                clientVersion: String = "0.1.12",
                openBrowser: @escaping @Sendable (URL) async throws -> Void = { url in try await CodexClient.defaultOpenBrowser(url) }) {
        self.locator = locator
        self.requestTimeout = requestTimeout
        self.clientVersion = clientVersion
        self.openBrowser = openBrowser
    }

    public static func defaultOpenBrowser(_ url: URL) async throws {
        guard await MainActor.run(body: { NSWorkspace.shared.open(url) }) else {
            throw CodexClientError.loginFailed("The sign-in page could not be opened.")
        }
    }

    public func authenticationPresent(profileHome: URL) async throws -> Bool {
        let result = try await withSession(profileHome: profileHome) { session in
            try await session.request(method: "account/read", id: 1, params: ["refreshToken": false], timeout: requestTimeout)
        }
        guard let account = result["account"] else { throw CodexClientError.malformedResponse }
        if case .null = account { return false }
        guard account.objectValue != nil else { throw CodexClientError.malformedResponse }
        return true
    }

    public func readIdentity(profileHome: URL) async throws -> AccountIdentity {
        let result = try await withSession(profileHome: profileHome) { session in
            try await session.request(
                method: "account/read",
                id: 1,
                params: ["refreshToken": false],
                timeout: requestTimeout
            )
        }
        return try parseIdentity(result)
    }

    public func readUsageWindows(profileHome: URL) async throws -> [RateLimitWindow] {
        let result = try await withSession(profileHome: profileHome) { session in
            try await session.request(method: "account/rateLimits/read", id: 1, timeout: requestTimeout)
        }
        return parseWindows(result)
    }

    public func login(profileHome: URL) async throws -> AccountIdentity {
        let launch = try locator.launchConfiguration()
        let session = try JSONRPCSession(executableURL: launch.executable, profileHome: profileHome, environment: launch.environment)
        return try await withTaskCancellationHandler {
            do {
                try await session.initialize(timeout: requestTimeout, clientVersion: clientVersion)
                let start = try await session.request(
                    method: "account/login/start",
                    id: 1,
                    params: [
                        "type": "chatgpt",
                        "useHostedLoginSuccessPage": true,
                        "appBrand": "codex",
                    ],
                    timeout: requestTimeout
                )
                guard let authURLString = start["authUrl"]?.stringValue,
                      let authURL = URL(string: authURLString)
                else {
                    throw CodexClientError.malformedResponse
                }
                try await openBrowser(authURL)

                let completion = try await session.notification(
                    method: "account/login/completed",
                    timeout: .seconds(600)
                )
                guard completion["success"]?.boolValue == true else {
                    throw CodexClientError.loginFailed(
                        "The official browser sign-in did not complete."
                    )
                }
                let identityValue = try await session.request(
                    method: "account/read",
                    id: 2,
                    params: ["refreshToken": false],
                    timeout: requestTimeout
                )
                let identity = try parseIdentity(identityValue)
                guard await session.stop() else { throw CodexClientError.processLaunchFailed("The account runtime did not stop; no profile was activated.") }
                return identity
            } catch {
                _ = await session.stop()
                if Task.isCancelled { throw CancellationError() }
                throw error
            }
        } onCancel: {
            Task { _ = await session.stop() }
        }
    }

    private func withSession<T: Sendable>(
        profileHome: URL,
        operation: (JSONRPCSession) async throws -> T
    ) async throws -> T {
        let launch = try locator.launchConfiguration()
        let session = try JSONRPCSession(executableURL: launch.executable, profileHome: profileHome, environment: launch.environment)
        do {
            try await session.initialize(timeout: requestTimeout, clientVersion: clientVersion)
            let result = try await operation(session)
            guard await session.stop() else { throw CodexClientError.processLaunchFailed("The account runtime did not stop; no credential handoff is safe.") }
            return result
        } catch {
            _ = await session.stop()
            throw error
        }
    }

    private func parseIdentity(_ value: JSONValue) throws -> AccountIdentity {
        guard let account = value["account"]?.objectValue else {
            throw CodexClientError.identityUnavailable
        }
        let accountID = account["accountId"]?.stringValue
            ?? account["accountID"]?.stringValue
            ?? account["chatgptAccountId"]?.stringValue
            ?? account["id"]?.stringValue
        let email = account["email"]?.stringValue
        guard accountID != nil || email != nil else {
            throw CodexClientError.identityUnavailable
        }
        return AccountIdentity(accountID: accountID, email: email)
    }

    private func parseWindows(_ value: JSONValue) -> [RateLimitWindow] {
        guard let bucket = value["rateLimitsByLimitId"]?["codex"] ?? value["rateLimits"] else {
            return []
        }
        return [bucket["primary"], bucket["secondary"]].compactMap(parseWindow)
    }

    private func parseWindow(_ value: JSONValue?) -> RateLimitWindow? {
        guard let value,
              let used = value["usedPercent"]?.doubleValue,
              let duration = value["windowDurationMins"]?.intValue
                ?? value["durationMinutes"]?.intValue,
              let reset = value["resetsAt"]?.doubleValue
        else {
            return nil
        }
        return RateLimitWindow(
            usedPercent: used,
            windowDurationMins: duration,
            resetsAt: reset
        )
    }
}
