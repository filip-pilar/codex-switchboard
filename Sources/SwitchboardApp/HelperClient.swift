import AppKit
import Foundation
import CryptoKit
import SwitchboardCore

@MainActor
final class HelperClient {
    var onState: ((HelperState) -> Void)?
    var onExit: (() -> Void)?
    private var process: Process?
    private var input: FileHandle?
    private var buffer = Data()
    private var nextID = 1
    private var intentionalStop = false
    private var pending: [Int: (CheckedContinuation<Data, Error>, Task<Void, Never>)] = [:]
    let dataDirectory: URL

    init() {
        let override = ProcessInfo.processInfo.environment["SWITCHBOARD_DATA_DIR"]
        dataDirectory = override.map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Application Support/Codex Switchboard", directoryHint: .isDirectory)
    }
    func start() throws {
        guard process == nil else { return }
        intentionalStop = false
        try SecureFiles.directory(dataDirectory)
        guard let bundled = Bundle.main.url(forResource: "switchboard-helper", withExtension: nil) else { throw SafeFailure(code: "helper_missing", message: "The bundled helper is missing. Rebuild or reinstall Codex Switchboard.") }
        let bytes = try SecureFiles.read(bundled, limit: 160 * 1024 * 1024)
        let expected = SHA256.hash(data: bytes)
        let binDirectory = dataDirectory.appending(path: "bin", directoryHint: .isDirectory)
        try SecureFiles.directory(binDirectory)
        let executable = binDirectory.appending(path: "switchboard-helper")
        let current = try? SecureFiles.read(executable, limit: 160 * 1024 * 1024)
        if current.map({ SHA256.hash(data: $0) }) != expected {
            let ownerURL = dataDirectory.appending(path: "helper.lock/owner.json")
            if let data = try? SecureFiles.read(ownerURL), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let pid = object["pid"] as? Int32, pid > 1, kill(pid, 0) == 0 {
                throw SafeFailure(code: "helper_already_running", message: "Another Switchboard instance is running. Quit it before updating this helper.")
            }
            try SecureFiles.write(bytes, to: executable, mode: 0o700)
        }
        guard SHA256.hash(data: try SecureFiles.read(executable, limit: 160 * 1024 * 1024)) == expected else { throw SafeFailure(code: "helper_hash_mismatch", message: "The installed helper did not pass its bundle hash check.") }
        let child = Process(), stdinPipe = Pipe(), stdoutPipe = Pipe()
        child.executableURL = executable
        child.arguments = ["--control"]
        var environment = ProcessInfo.processInfo.environment
        environment["SWITCHBOARD_DATA_DIR"] = dataDirectory.path
        environment["PATH"] = environment["PATH"] ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        for key in environment.keys where key.hasPrefix("CODEIUM_") || key.hasPrefix("WINDSURFAPI_") || ["API_KEY", "DATA_DIR", "GROK_API_KEY", "XAI_API_KEY"].contains(key) { environment.removeValue(forKey: key) }
        child.environment = environment
        child.standardInput = stdinPipe; child.standardOutput = stdoutPipe; child.standardError = FileHandle.nullDevice
        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            Task { @MainActor in self?.receive(data) }
        }
        child.terminationHandler = { [weak self] _ in Task { @MainActor in self?.terminated() } }
        try child.run()
        process = child; input = stdinPipe.fileHandleForWriting
    }
    private func receive(_ data: Data) {
        buffer.append(data)
        if buffer.count > 8 * 1024 * 1024 { stop(); return }
        while let newline = buffer.firstIndex(of: 10) {
            let line = Data(buffer[..<newline]); buffer.removeSubrange(...newline)
            guard let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
            if let state = object["status"], let encoded = try? JSONSerialization.data(withJSONObject: state), let decoded = try? JSONDecoder().decode(HelperState.self, from: encoded) { onState?(decoded) }
            if let event = object["event"] as? String, event == "fatal" { terminated(); continue }
            guard let id = object["requestID"] as? Int, let (continuation, timeout) = pending.removeValue(forKey: id) else { continue }
            timeout.cancel()
            if let error = object["error"], let encoded = try? JSONSerialization.data(withJSONObject: error), let decoded = try? JSONDecoder().decode(SafeFailure.self, from: encoded) { continuation.resume(throwing: decoded) }
            else if let result = object["result"], let encoded = try? JSONSerialization.data(withJSONObject: result) { continuation.resume(returning: encoded) }
            else { continuation.resume(throwing: SafeFailure(code: "invalid_helper_reply", message: "The helper returned an unsupported reply.")) }
        }
    }
    func request(_ operation: String, values: [String: Any] = [:], timeout: UInt64 = 100) async throws -> Data {
        guard let input, process?.isRunning == true else { throw SafeFailure(code: "helper_stopped", message: "The bundled helper is not running. Reopen Switchboard.") }
        let id = nextID; nextID += 1
        var message = values; message["op"] = operation; message["requestID"] = id
        var data = try JSONSerialization.data(withJSONObject: message); data.append(10)
        return try await withCheckedThrowingContinuation { continuation in
            let timer = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: timeout * 1_000_000_000)
                guard !Task.isCancelled, let entry = self?.pending.removeValue(forKey: id) else { return }
                entry.0.resume(throwing: SafeFailure(code: "helper_timeout", message: "The operation timed out. Check its current status before retrying."))
            }
            pending[id] = (continuation, timer)
            do { try input.write(contentsOf: data) } catch { pending.removeValue(forKey: id); timer.cancel(); continuation.resume(throwing: error) }
        }
    }
    func state(_ operation: String, values: [String: Any] = [:]) async throws -> HelperState {
        let decoded = try JSONDecoder().decode(HelperState.self, from: await request(operation, values: values))
        onState?(decoded); return decoded
    }
    private func terminated() {
        guard process != nil || !pending.isEmpty else { return }
        process = nil; input = nil; buffer.removeAll()
        let items = pending.values; pending.removeAll()
        for (continuation, timeout) in items { timeout.cancel(); continuation.resume(throwing: SafeFailure(code: "helper_stopped", message: "The bundled helper stopped. The app will retry with bounded backoff.")) }
        if !intentionalStop { onExit?() }
    }
    func stop() {
        intentionalStop = true
        try? input?.close(); input = nil
        process?.terminate()
    }
}
