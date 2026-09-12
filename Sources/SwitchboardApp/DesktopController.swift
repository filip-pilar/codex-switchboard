import AppKit
import Foundation
import SwitchboardCore

final class DesktopController: DesktopControlling, @unchecked Sendable {
    private let lock = NSLock()
    private var lastApplication: URL?
    static let identifiers = ["com.openai.codex", "com.openai.chat"]
    static func applicationURL() -> URL? {
        let running = NSWorkspace.shared.runningApplications.first { application in
            guard let url = application.bundleURL else { return false }
            return ["ChatGPT.app", "Codex.app"].contains(url.lastPathComponent) && application.bundleIdentifier?.hasPrefix("com.openai.") == true
        }
        if let url = running?.bundleURL { return url }
        return ["/Applications/ChatGPT.app", "/Applications/Codex.app"].map { URL(fileURLWithPath: $0) }.first { FileManager.default.fileExists(atPath: $0.path) }
    }
    private func remember(_ url: URL?) { lock.lock(); lastApplication = url; lock.unlock() }
    private func remembered() -> URL? { lock.lock(); defer { lock.unlock() }; return lastApplication }
    func closeDesktop() async throws {
        let url = await MainActor.run { Self.applicationURL() }
        remember(url)
        let running = await MainActor.run { NSWorkspace.shared.runningApplications.filter { $0.bundleURL == url } }
        for app in running {
            let accepted = await MainActor.run { app.terminate() }
            if !accepted && !app.isTerminated { throw SafeFailure(code: "desktop_refused_quit", message: "Codex declined to quit. Finish or stop its active tasks, then switch again. No credential was changed.") }
        }
        let deadline = Date().addingTimeInterval(30)
        while running.contains(where: { !$0.isTerminated }) {
            if Date() >= deadline { throw SafeFailure(code: "desktop_still_running", message: "Codex did not quit within 30 seconds. Complete its quit dialog, then retry. No credential was changed.") }
            try await Task.sleep(for: .milliseconds(100))
        }
        // Query executable names only; never inspect process arguments or secrets.
        let result = try ProcessRunner.run(executable: URL(fileURLWithPath: "/bin/ps"), arguments: ["-axo", "pid=,comm="], timeout: 5)
        guard result.status == 0, !result.timedOut else { throw SafeFailure(code: "cli_check_failed", message: "Could not check for active Codex CLI sessions. The account switch stopped before credentials changed.") }
        let hasCLI = result.stdout.split(separator: "\n").contains { line in
            let executable = line.trimmingCharacters(in: .whitespaces).split(maxSplits: 1, whereSeparator: { $0.isWhitespace }).last.map(String.init) ?? ""
            return URL(fileURLWithPath: executable).lastPathComponent == "codex"
        }
        guard !hasCLI else { throw SafeFailure(code: "cli_still_running", message: "A Codex CLI process is still running. Close existing CLI sessions and switch again. No credential was changed.") }
    }
    func reopenDesktop() async throws {
        guard let url = remembered() ?? Self.applicationURL() else { throw SafeFailure(code: "desktop_missing", message: "Install or locate Codex Desktop before reopening it.") }
        let configuration = NSWorkspace.OpenConfiguration(); configuration.activates = true
        _ = try await NSWorkspace.shared.openApplication(at: url, configuration: configuration)
    }
}
