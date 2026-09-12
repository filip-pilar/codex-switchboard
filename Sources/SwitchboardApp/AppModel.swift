import SwiftUI
import AppKit
import Foundation
import ServiceManagement
import SwitchboardCore

@MainActor
final class AppModel: ObservableObject {
    @Published var state: HelperState?
    @Published var busy: String?
    @Published var feedback: String?
    @Published var failure: String?
    @Published var accounts: [AccountProfile] = []
    @Published var activeAccountID: UUID?
    @Published var identityVerified = false
    @Published var usageWindows: [RateLimitWindow] = []
    @Published var usageFetchedAt: Date?
    @Published var usageStale = true
    @Published var tab = "Models"
    @Published var launchAtLogin = SMAppService.mainApp.status == .enabled
    @Published var signingIn = false
    let helper = HelperClient()
    private var accountStore: AccountStore?
    private var accountHome: String?
    private var operationTask: Task<Void, Never>?
    private var authProcess: Process?
    private var window: NSWindow?
    private var helperRestarts = 0
    private var quitting = false
    var allowsTermination: Bool { quitting }
    var showMenuAction: ((NSView?) -> Void)?
    func showMenu() { showMenuAction?(window?.contentView) }
    private var usageTimer: Task<Void, Never>?
    let desktop = DesktopController()

    init() {
        helper.onState = { [weak self] value in self?.state = value }
        helper.onExit = { [weak self] in self?.recoverHelper() }
        Task { await bootstrap() }
    }
    var selected: GatewayModel? { state?.registry.models.first { $0.id == state?.registry.selection?.id } }
    var availableTargets: [GatewayModel] {
        guard let registry = state?.registry else { return [] }
        let applied = Set(registry.appliedModels.map(\.id))
        return registry.models.filter { $0.enabled && $0.compatible && $0.availability == "advertised" && applied.contains($0.id) }
    }
    var activeAccount: AccountProfile? { accounts.first { $0.id == activeAccountID } }
    var gatewayTitle: String {
        switch state?.gateway { case "running": return "Running"; case "starting": return "Starting"; case "stopped": return "Not enabled"; default: return "Needs Attention" }
    }
    var canUseAccounts: Bool { state?.integration.nativeCredentialStore != "keyring" }
    private func bootstrap() async {
        do {
            try helper.start()
            state = try await helper.state("initialize")
            try await loadAccounts()
            if state?.integration.installed != true && window == nil { tab = "Setup"; showManage() }
            usageTimer?.cancel()
            usageTimer = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(300))
                    guard !Task.isCancelled, let self else { return }
                    if self.busy == nil && self.activeAccount != nil { self.refreshUsage() }
                }
            }
        } catch { failure = userMessage(error) }
    }
    private func recoverHelper() {
        guard !quitting else { return }
        helperRestarts += 1
        failure = "The helper stopped. Codex routing is unavailable until it restarts."
        guard helperRestarts <= 3 else { failure = "The helper stopped repeatedly. Reopen Switchboard and copy safe diagnostics if the problem continues."; return }
        Task { try? await Task.sleep(for: .seconds(pow(2.0, Double(helperRestarts)))); await bootstrap() }
    }
    func showManage(_ selectedTab: String? = nil) {
        if let selectedTab { tab = selectedTab }
        if window == nil {
            let newWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 850, height: 650), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            newWindow.title = "Codex Switchboard"
            newWindow.contentView = NSHostingView(rootView: ManagementView(model: self))
            newWindow.minSize = NSSize(width: 720, height: 520)
            newWindow.isReleasedWhenClosed = false; newWindow.center(); window = newWindow
        }
        NSApp.activate(ignoringOtherApps: true); window?.makeKeyAndOrderFront(nil)
    }
    func perform(_ label: String, _ action: @escaping @MainActor () async throws -> Void) {
        guard busy == nil else { return }
        busy = label; failure = nil; feedback = nil
        operationTask = Task {
            defer { busy = nil; operationTask = nil; signingIn = false }
            do { try await action() } catch is CancellationError { feedback = "Sign-in cancelled." } catch { failure = userMessage(error) }
        }
    }
    func command(_ op: String, values: [String: Any] = [:]) async throws { state = try await helper.state(op, values: values) }
    func refreshModels(_ provider: String? = nil) { perform("Refreshing models…") { try await self.command("refresh", values: provider.map { ["provider": $0] } ?? [:]) } }
    func setEnabled(_ model: GatewayModel, _ value: Bool) { perform("Staging catalog change…") { try await self.command("enable", values: ["id": model.id, "enabled": value]) } }
    func select(_ id: String, effort: String? = nil) {
        guard let model = availableTargets.first(where: { $0.id == id }) else { return }
        let level = effort ?? model.capabilities.defaultEffort
        perform("Updating next request…") {
            try await self.command("select", values: ["id": id, "effort": level as Any? ?? NSNull()])
            self.feedback = "The next switchboard-selected request uses \(model.name)\(level.map { " · \($0.capitalized)" } ?? " · upstream default")."
        }
    }
    func apply(migration: Bool, providerOnly: Bool, nativeFileStorage: Bool, confirmHome: Bool) {
        let alert = NSAlert(); alert.messageText = migration ? "Migrate Codex to Switchboard?" : "Apply Switchboard models?"
        alert.informativeText = "This updates the selected Codex home's endpoint and model catalog, preserving an owned restore snapshot. Finish active tasks before restarting Codex. You can apply now and restart it yourself."
        alert.addButton(withTitle: "Apply, Restart Later"); alert.addButton(withTitle: "Apply and Restart Codex"); alert.addButton(withTitle: "Cancel")
        let response = alert.runModal(); guard response != .alertThirdButtonReturn else { return }
        perform("Applying integration…") {
            if providerOnly {
                guard let home = self.state?.settings.codexHome else { throw SafeFailure(code: "not_ready", message: "Wait for the helper to start.") }
                if try await self.codex().authenticationPresent(profileHome: URL(fileURLWithPath: home)) {
                    throw SafeFailure(code: "native_auth_present", message: "The official runtime found an existing native login. Provider-only setup will not replace it, including a Keychain-backed login.")
                }
            }
            try await self.command("apply", values: ["migration": migration, "providerOnly": providerOnly, "nativeAuthAbsentVerified": providerOnly, "nativeFileStorage": nativeFileStorage, "confirmHome": confirmHome])
            if response == .alertSecondButtonReturn {
                try await self.desktop.closeDesktop(); try await self.desktop.reopenDesktop(); try await self.command("acknowledgeRestart")
                self.feedback = "Integration applied and Codex reopened. Choose a Switchboard entry in its model picker."
            } else { self.feedback = "Integration applied. Restart Codex when your active tasks are finished, then choose a Switchboard model in its picker." }
        }
    }
    func acknowledgeRestart() { perform("Updating restart state…") { try await self.command("acknowledgeRestart"); self.feedback = "Restart marked complete." } }
    func restore(quitAfter: Bool = false) {
        guard let integration = state?.integration else { return }
        var resolutions: [String: String] = [:]
        for key in integration.conflicts {
            let alert = NSAlert(); alert.messageText = "Restore conflict: \(key)"
            alert.informativeText = "This owned key changed after installation. Choose whether to keep its current value or restore the value from before Switchboard. Unrelated settings are preserved."
            alert.addButton(withTitle: "Keep Current"); alert.addButton(withTitle: "Restore Original"); alert.addButton(withTitle: "Cancel")
            let answer = alert.runModal(); if answer == .alertThirdButtonReturn { return }
            resolutions[key] = answer == .alertFirstButtonReturn ? "keep" : "restore"
        }
        perform("Restoring integration…") {
            try await self.command("restore", values: ["resolutions": resolutions])
            self.feedback = "Integration restored. Saved native accounts remain available. Restart Codex before continuing."
            if quitAfter { self.quitNow() }
        }
    }
    func updateSettings(home: String, cli: String) { perform("Saving advanced settings…") { try await self.command("settings", values: ["codexHome": home, "codexCLI": cli]); try await self.loadAccounts() } }
    func connect(_ provider: String) {
        let path = provider == "devin" ? state?.clis.devin : state?.clis.grok
        guard let path else { NSWorkspace.shared.open(provider == "devin" ? DevinCLI.installURL : GrokCLI.installURL); return }
        perform("Waiting for \(provider == "devin" ? "Devin" : "Grok / xAI") sign-in…") {
            self.signingIn = true
            try await self.command("beginReconnect", values: ["provider": provider])
            do {
                let executable: URL, args: [String]
                if provider == "devin" {
                    guard let driver = Bundle.main.url(forResource: "devin-auth-pty", withExtension: nil) else { throw SafeFailure(code: "login_helper_missing", message: "The bundled Devin login helper is missing.") }
                    executable = driver; args = [path, "0"]
                } else { executable = URL(fileURLWithPath: path); args = ["--no-auto-update", "login"] }
                try await self.runLogin(executable: executable, arguments: args)
                try await self.command("endReconnect", values: ["provider": provider])
            } catch {
                try? await self.command("endReconnect", values: ["provider": provider]); throw error
            }
        }
    }
    private func runLogin(executable: URL, arguments: [String]) async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                let process = Process(); process.executableURL = executable; process.arguments = arguments
                var environment = ProcessInfo.processInfo.environment
                environment.removeValue(forKey: "XAI_API_KEY"); environment.removeValue(forKey: "GROK_API_KEY")
                process.environment = environment; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
                process.terminationHandler = { [weak self] child in
                    Task { @MainActor in
                        self?.authProcess = nil
                        if child.terminationReason == .exit && child.terminationStatus == 0 { continuation.resume() }
                        else { continuation.resume(throwing: SafeFailure(code: "login_incomplete", message: "Official CLI sign-in did not complete. Reconnect to try again.")) }
                    }
                }
                do { try process.run(); authProcess = process } catch { continuation.resume(throwing: error); return }
                Task { @MainActor [weak self, weak process] in
                    try? await Task.sleep(for: .seconds(600))
                    if let process, self?.authProcess === process, process.isRunning { process.terminate() }
                }
            }
        } onCancel: { Task { @MainActor [weak self] in self?.authProcess?.terminate() } }
    }
    func cancelLogin() { operationTask?.cancel(); authProcess?.terminate() }
    private func store() throws -> AccountStore {
        guard let home = state?.settings.codexHome else { throw SafeFailure(code: "not_ready", message: "Wait for the helper to start.") }
        if accountStore == nil || accountHome != home {
            accountHome = home
            let key = home.data(using: .utf8)!.base64EncodedString().replacingOccurrences(of: "/", with: "_")
            accountStore = AccountStore(baseURL: helper.dataDirectory.appending(path: "native/\(key)", directoryHint: .isDirectory), activeHomeURL: URL(fileURLWithPath: home))
        }
        return accountStore!
    }
    private func codex() -> CodexClient { CodexClient(locator: CodexExecutableLocator(explicitURL: state?.clis.codex.map { URL(fileURLWithPath: $0) }), clientVersion: "0.1.0") }
    func loadAccounts() async throws {
        let registry = try await store().loadRegistry(); accounts = registry.accounts; activeAccountID = registry.activeAccountID; identityVerified = false
    }
    func addAccount() {
        perform("Waiting for Codex sign-in…") {
            self.signingIn = true
            let store = try self.store(), id = UUID(), home = try await store.createProfileDirectory(id: id)
            do {
                let identity = try await self.codex().login(profileHome: home)
                _ = try SecureFiles.read(home.appending(path: "auth.json"), limit: 1024 * 1024)
                let verified = try await self.codex().readIdentity(profileHome: home)
                guard identity == verified else { throw SafeFailure(code: "identity_changed", message: "The signed-in identity changed before verification. The account was not registered.") }
                try await store.addProfile(AccountProfile(id: id, displayName: identity.suggestedDisplayName, email: identity.email, accountID: identity.accountID, createdAt: Date()))
                try await self.loadAccounts(); self.feedback = "Account saved and verified. Your active native login has not changed."
            } catch { try? await store.discardUnregisteredProfile(id: id); throw error }
        }
    }
    func importCurrent() {
        perform("Verifying current Codex login…") {
            guard self.canUseAccounts else { throw SafeFailure(code: "keyring_login", message: "This Codex home uses Keychain credentials. Add an account through official sign-in, then explicitly enable file-backed account storage in Setup. Switchboard does not read Keychain secrets.") }
            let store = try self.store(), activeHome = await store.activeCodexHome()
            let bytes = try SecureFiles.read(activeHome.appending(path: "auth.json"), limit: 1024 * 1024)
            if let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], object["OPENAI_API_KEY"] as? String == "codex-switchboard-local-only" { throw SafeFailure(code: "native_login_required", message: "Add a native account through official sign-in first.") }
            let current = try await self.codex().readIdentity(profileHome: activeHome)
            let id = UUID(), profileHome = try await store.createProfileDirectory(id: id)
            do {
                try SecureFiles.write(bytes, to: profileHome.appending(path: "auth.json"))
                let verified = try await self.codex().readIdentity(profileHome: profileHome)
                guard current == verified else { throw SafeFailure(code: "identity_mismatch", message: "The active runtime and file-backed credential identify different accounts. No saved account was changed. Add a fresh official login.") }
                let existing = try await store.loadRegistry().accounts.first { current.matches($0) }
                if existing != nil { try await store.discardUnregisteredProfile(id: id); try await store.registerActiveIdentity(current) }
                else { try await store.addProfile(AccountProfile(id: id, displayName: current.suggestedDisplayName, email: current.email, accountID: current.accountID, createdAt: Date())); try await store.commitActiveAccountID(id) }
                try await self.loadAccounts(); self.identityVerified = true; self.feedback = "Current login imported and verified."
            } catch { try? await store.discardUnregisteredProfile(id: id); throw error }
        }
    }
    func refreshUsage() {
        perform("Reading native account usage…") {
            guard let profile = self.activeAccount, self.canUseAccounts else { throw SafeFailure(code: "native_login_required", message: "Import or switch to a verified native account first.") }
            let home = try await self.store().activeCodexHome()
            do {
                let identity = try await self.codex().readIdentity(profileHome: home)
                guard identity.matches(profile) else { self.identityVerified = false; throw SafeFailure(code: "active_identity_changed", message: "Codex's active identity changed outside Switchboard. Import Current Login before switching.") }
                self.identityVerified = true
                self.usageWindows = try await self.codex().readUsageWindows(profileHome: home)
                self.usageFetchedAt = Date(); self.usageStale = false
            } catch { self.usageStale = true; throw error }
        }
    }
    func switchAccount(_ profile: AccountProfile) {
        let alert = NSAlert(); alert.messageText = "Switch to \(profile.displayName)?"
        alert.informativeText = "Finish active Desktop tasks and close existing Codex CLI sessions. Codex will quit normally, the native credential will be verified and switched, and the same app will reopen. A failed verification restores the prior credential."
        alert.addButton(withTitle: "Switch and Restart Codex"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        perform("Switching native account…") {
            guard self.canUseAccounts else { throw SafeFailure(code: "keyring_login", message: "Enable file-backed native account storage explicitly in Setup before switching this Keychain-backed home.") }
            let store = try self.store()
            try await self.command("pauseNative")
            do {
                try await SwitchService(desktop: self.desktop, store: store, codex: self.codex()).switchAccount(to: profile.id)
                try await self.command("resumeNative"); try await self.loadAccounts(); self.identityVerified = true; self.usageWindows = []; self.usageStale = true
                do { try await self.command("nativeChanged") } catch { self.feedback = "Account switched and verified. Native model refresh is pending; retry from Models." }
                self.feedback = self.feedback ?? "Account switched and verified. Start new CLI sessions to use it."
            } catch { try? await self.command("resumeNative"); try? await self.loadAccounts(); throw error }
        }
    }
    func removeAccount(_ profile: AccountProfile) {
        let alert = NSAlert(); alert.messageText = "Remove saved account \(profile.displayName)?"; alert.informativeText = "This deletes its local saved profile. The active account cannot be removed."; alert.addButton(withTitle: "Remove Saved Profile"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        perform("Removing saved profile…") { try await self.store().removeAccount(id: profile.id); try await self.loadAccounts() }
    }
    func openCodex() { Task { do { try await desktop.reopenDesktop() } catch { failure = userMessage(error) } } }
    func copyDiagnostics() {
        perform("Copying safe diagnostics…") {
            let data = try await self.helper.request("diagnostics")
            let object = try JSONSerialization.jsonObject(with: data)
            let pretty = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(String(decoding: pretty, as: UTF8.self), forType: .string)
            self.feedback = "Safe diagnostics copied. They contain readiness, versions, and route metadata only."
        }
    }
    func setLaunchAtLogin(_ enabled: Bool) {
        do { if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }; launchAtLogin = SMAppService.mainApp.status == .enabled }
        catch { failure = "macOS could not change Launch at Login. Check System Settings → General → Login Items." }
    }
    func requestQuit() {
        guard busy == nil else { failure = "Finish or cancel the current operation before quitting."; return }
        if state?.integration.installed == true {
            let alert = NSAlert(); alert.messageText = "Codex currently depends on Switchboard"
            alert.informativeText = "Quitting stops the gateway. Restore integration first to return Codex to its previous configuration."
            alert.addButton(withTitle: "Cancel"); alert.addButton(withTitle: "Quit"); alert.addButton(withTitle: "Restore Then Quit")
            switch alert.runModal() { case .alertSecondButtonReturn: quitNow(); case .alertThirdButtonReturn: restore(quitAfter: true); default: break }
        } else { quitNow() }
    }
    private func quitNow() { quitting = true; usageTimer?.cancel(); helper.stop(); NSApp.terminate(nil) }
    private func userMessage(_ error: Error) -> String {
        if let safe = error as? SafeFailure { return safe.message }
        if let operation = error as? OperationError { return "Native account operation failed at \(operation.stage?.rawValue ?? "verification"). The prior credential is restored when activation verification fails. \(operation.localizedDescription)" }
        if let error = error as? AccountStoreError { return error.localizedDescription }
        if error is DecodingError { return "The helper returned an incompatible state. Rebuild or reinstall Switchboard." }
        if error is CodexClientError { return "The official Codex account operation did not complete. Check sign-in and the selected runtime, then retry." }
        return "The operation could not be completed safely. Check protected paths, the selected CLI, and connection state."
    }
}
