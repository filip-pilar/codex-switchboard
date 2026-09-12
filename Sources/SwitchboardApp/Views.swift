import SwiftUI
import SwitchboardCore

private func timestamp(_ milliseconds: Double?) -> String {
    guard let milliseconds else { return "Never" }
    return Date(timeIntervalSince1970: milliseconds / 1000).formatted(date: .abbreviated, time: .shortened)
}
private func capability(_ value: Bool?) -> String { value.map { $0 ? "Yes" : "No" } ?? "Unknown" }

struct SwitchboardPopover: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 9) {
                Circle().fill(model.state?.gateway == "running" ? Color.green : Color.orange).frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Codex Switchboard").font(.headline)
                    Text(model.gatewayTitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Open Codex") { model.openCodex() }.controlSize(.small)
            }
            Divider()
            VStack(alignment: .leading, spacing: 8) {
                Text("Switchboard selection").font(.subheadline.weight(.semibold))
                if model.availableTargets.isEmpty {
                    Text("Connect a provider and apply its models in Setup.").font(.callout).foregroundStyle(.secondary)
                } else {
                    Picker("Model", selection: Binding(get: { model.state?.registry.selection?.id ?? "" }, set: { model.select($0) })) {
                        ForEach(model.availableTargets) { Text($0.name).tag($0.id) }
                    }
                    if let efforts = model.selected?.capabilities.efforts, !efforts.isEmpty {
                        Picker("Reasoning", selection: Binding(get: { model.state?.registry.selection?.effort ?? "" }, set: { model.select(model.selected!.id, effort: $0) })) {
                            ForEach(efforts, id: \.self) { Text($0.capitalized).tag($0) }
                        }
                    } else { Text("Reasoning: upstream default").font(.caption).foregroundStyle(.secondary) }
                    Text("Next request: \(model.selected?.name ?? "Choose a model")\(model.state?.registry.selection?.effort.map { " · \($0.capitalized)" } ?? "")").font(.caption.weight(.medium))
                }
                Text("In Codex, choose “Switchboard selection” to follow this menu. Direct model entries keep their own selection.").font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.disabled(model.busy != nil)
            Divider()
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("Codex account").font(.subheadline.weight(.semibold)); Spacer()
                    Button("Add") { model.addAccount() }.controlSize(.small)
                    Button("Manage") { model.showManage("Accounts") }.controlSize(.small)
                }
                if let account = model.activeAccount {
                    HStack { Text(account.displayName); Text(model.identityVerified ? "Verified" : "Verify identity").font(.caption).foregroundStyle(model.identityVerified ? Color.green : Color.secondary) }
                    if let window = model.usageWindows.first {
                        Text("\(Int(max(0, min(100, 100 - window.usedPercent))))% remaining · resets \(Date(timeIntervalSince1970: window.resetsAt).formatted(date: .abbreviated, time: .shortened))\(model.usageStale ? " · stale" : "")").font(.caption).foregroundStyle(.secondary)
                    } else { Text("Usage unknown · refresh in Accounts").font(.caption).foregroundStyle(.secondary) }
                    Menu("Switch Account…") { ForEach(model.accounts.filter { $0.id != model.activeAccountID }) { account in Button(account.displayName) { model.switchAccount(account) } } }.controlSize(.small)
                } else {
                    Text("No saved active account").font(.callout)
                    Button("Import Current Login") { model.importCurrent() }.controlSize(.small)
                }
            }.disabled(model.busy != nil)
            Divider()
            VStack(alignment: .leading, spacing: 7) {
                Text("Connections").font(.subheadline.weight(.semibold))
                ConnectionRow(model: model, provider: "devin", compact: true)
                ConnectionRow(model: model, provider: "grok", compact: true)
            }
            Divider()
            VStack(alignment: .leading, spacing: 4) {
                Text("Last request").font(.subheadline.weight(.semibold))
                if let route = model.state?.lastRoute {
                    Text("\((route.provider ?? "unknown").capitalized) · \(route.selector ?? "Auxiliary request")").font(.caption).lineLimit(2)
                    Text("\(route.result.replacingOccurrences(of: "_", with: " ").capitalized) · \(timestamp(route.finishedAt ?? route.startedAt))").font(.caption).foregroundStyle(.secondary)
                } else { Text("No request observed in this app session.").font(.caption).foregroundStyle(.secondary) }
            }
            if let busy = model.busy { HStack { ProgressView().controlSize(.small); Text(busy).font(.caption); if model.signingIn { Button("Cancel") { model.cancelLogin() }.controlSize(.small) } } }
            if let error = model.failure ?? model.state?.error?.message { Text(error).font(.caption).foregroundStyle(.red).lineLimit(4) }
            if model.state?.integration.restartRequired == true { Button("Restart needed — open Setup") { model.showManage("Setup") }.font(.caption) }
            HStack {
                Button("Manage…") { model.showManage() }
                Spacer()
                Toggle("Launch at Login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) })).toggleStyle(.checkbox).font(.caption)
                Button("Quit") { model.requestQuit() }
            }.controlSize(.small)
        }.padding(18).frame(width: 405)
    }
}

struct ConnectionRow: View {
    @ObservedObject var model: AppModel
    let provider: String
    var compact = false
    private var state: ProviderState? { model.state?.registry.providers[provider] }
    private var name: String { provider == "devin" ? "Devin" : "Grok / xAI" }
    private var workerProblem: String? {
        guard let status = model.state?.workerStates[provider], ["needs_attention", "restarting", "reconnecting"].contains(status) else { return nil }
        return status.replacingOccurrences(of: "_", with: " ").capitalized
    }
    private var ready: Bool { state?.status == "connected" && workerProblem == nil }
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Image(systemName: ready ? "checkmark.circle.fill" : "circle.dashed").foregroundStyle(ready ? Color.green : Color.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(compact ? .callout : .headline)
                    Text(ready ? "Official CLI session · models advertised" : (workerProblem ?? state?.status ?? "Not connected").replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(ready ? "Reconnect" : "Connect") { model.connect(provider) }.disabled(model.busy != nil)
            }
            if !compact {
                Text(provider == "grok" ? "Linked Premium+ entitlement is checked through the official xAI CLI. No X developer keys are used. Usage is unknown unless the official interface reports it." : "Uses the current official Devin CLI identity. Reconnecting replaces this provider's active identity. Subscription usage is unknown.").font(.callout).foregroundStyle(.secondary)
                Text("Last model refresh: \(timestamp(state?.refreshedAt))").font(.caption).foregroundStyle(.secondary)
                if let error = state?.error { Text(error.message).font(.caption).foregroundStyle(.orange) }
                Button("Import / Refresh Current CLI Session") { model.refreshModels(provider) }.disabled(model.busy != nil)
            }
        }
    }
}

struct ManagementView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "arrow.triangle.branch").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading) { Text("Codex Switchboard").font(.title2.weight(.semibold)); Text("One menu for native accounts and external models").foregroundStyle(.secondary).font(.callout) }
                Spacer()
                Button("Show Menu") { model.showMenu() }.controlSize(.small)
                Label(model.gatewayTitle, systemImage: model.state?.gateway == "running" ? "checkmark.circle.fill" : "circle.dashed").foregroundStyle(model.state?.gateway == "running" ? Color.green : Color.secondary)
            }.padding(22)
            Picker("Manage", selection: $model.tab) { ForEach(["Models", "Accounts", "Connections", "Setup"], id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented).padding(.horizontal, 22).padding(.bottom, 16)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch model.tab {
                    case "Accounts": AccountsView(model: model)
                    case "Connections": ConnectionsView(model: model)
                    case "Setup": SetupView(model: model)
                    default: ModelsView(model: model)
                    }
                }.padding(22).frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            VStack(alignment: .leading, spacing: 5) {
                if let busy = model.busy { HStack { ProgressView().controlSize(.small); Text(busy); if model.signingIn { Button("Cancel Sign-in") { model.cancelLogin() } } } }
                if let failure = model.failure ?? model.state?.error?.message { Text(failure).foregroundStyle(.red).textSelection(.enabled) }
                else if let feedback = model.feedback { Text(feedback).foregroundStyle(.secondary).textSelection(.enabled) }
                HStack { Button("Copy Safe Diagnostics") { model.copyDiagnostics() }.disabled(model.busy != nil); Spacer(); Text("Local only · 127.0.0.1:9477").foregroundStyle(.secondary) }
            }.font(.caption).padding(14)
        }.frame(minWidth: 720, minHeight: 520)
    }
}

struct ModelsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) { Text("Models").font(.title3.weight(.semibold)); Text("Enable compatible discoveries without an inference test. Applying picker changes requires a Codex restart.").font(.callout).foregroundStyle(.secondary) }
            Spacer(); Button("Refresh Models") { model.refreshModels() }.disabled(model.busy != nil)
        }
        if model.state?.pendingCatalog == true {
            HStack { Label("Catalog changes pending", systemImage: "arrow.clockwise"); Spacer(); Button("Apply and Restart Codex…") { model.showManage("Setup") } }.padding(12).background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        }
        if model.state?.registry.models.isEmpty != false { ContentUnavailableView("Connect a provider", systemImage: "point.3.connected.trianglepath.dotted", description: Text("Devin and Grok discovery will populate this list. Your native Codex models are preserved when applying setup.")) }
        else {
            ForEach([false, true], id: \.self) { newOnly in
                let rows = model.state?.registry.models.filter { ($0.wasApplied != true && !$0.enabled) == newOnly } ?? []
                if !rows.isEmpty {
                    Text(newOnly ? "New models" : "Your models").font(.headline)
                    ForEach(rows) { entry in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 3) { Text(entry.name).font(.headline); Text(entry.upstream).font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled) }
                                Spacer()
                                Toggle("Show in Codex", isOn: Binding(get: { entry.enabled }, set: { model.setEnabled(entry, $0) })).toggleStyle(.switch).controlSize(.small).disabled(model.busy != nil || !entry.compatible || (!entry.enabled && entry.availability != "advertised"))
                            }
                            HStack(spacing: 18) { Text("Tools: \(capability(entry.capabilities.tools))"); Text("Images: \(capability(entry.capabilities.images))"); Text("Context: \(entry.capabilities.contextWindow.map { String($0.formatted()) } ?? "Unknown")") }.font(.caption).foregroundStyle(.secondary)
                            Text("Reasoning: \(entry.capabilities.efforts?.map(\.capitalized).joined(separator: ", ") ?? "Unknown — upstream default")").font(.caption).foregroundStyle(.secondary)
                            Text(entry.availability == "advertised" ? entry.compatibilityReason : "Unavailable for this connection · no fallback").font(.caption).foregroundStyle(entry.compatible && entry.availability == "advertised" ? Color.secondary : Color.orange)
                            if let note = entry.evidence?.note { Text(note).font(.caption).foregroundStyle(.secondary) }
                        }.padding(14).background(.background, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(.quaternary))
                    }
                }
            }
        }
        Text("Unknown context limits use a conservative 32,768-token local budget. This is not a provider capacity claim. External compaction and private continuation across providers are unsupported; start a new task when requested.").font(.caption).foregroundStyle(.secondary)
    }
}

struct AccountsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        HStack { Text("Native Codex accounts").font(.title3.weight(.semibold)); Spacer(); Button("Import Current Login") { model.importCurrent() }; Button("Add Account…") { model.addAccount() }.buttonStyle(.borderedProminent) }.disabled(model.busy != nil)
        Text("Each saved login lives in its own private Codex home. Switching verifies the identity, closes and reopens Desktop, and refuses active CLI sessions. There is no automatic account rotation.").foregroundStyle(.secondary)
        if !model.canUseAccounts { Label("Keychain-backed login: add a fresh account, then explicitly enable file-backed storage in Setup.", systemImage: "key").foregroundStyle(.orange) }
        ForEach(model.accounts) { account in
            HStack {
                Text(account.initials).font(.headline).frame(width: 40, height: 40).background(.tint.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 3) { Text(account.displayName).font(.headline); Text(account.email ?? "Verified native account").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                if model.activeAccountID == account.id { Label(model.identityVerified ? "Active · verified" : "Active · verify", systemImage: "checkmark.circle").font(.caption); Button("Refresh Usage") { model.refreshUsage() } }
                else { Button("Switch…") { model.switchAccount(account) }; Button("Remove…") { model.removeAccount(account) } }
            }.padding(12).background(.background, in: RoundedRectangle(cornerRadius: 10)).disabled(model.busy != nil)
        }
        if model.accounts.isEmpty { ContentUnavailableView("No saved accounts", systemImage: "person.crop.circle.badge.plus", description: Text("Import your current file-backed login or add an account using official Codex sign-in. No active credential is changed by adding an account.")) }
        if !model.usageWindows.isEmpty {
            Text("Usage windows\(model.usageStale ? " · stale" : "")").font(.headline)
            ForEach(Array(model.usageWindows.enumerated()), id: \.offset) { _, window in
                VStack(alignment: .leading, spacing: 5) {
                    HStack { Text("\(window.windowDurationMins / 60) hour window"); Spacer(); Text("\(Int(max(0, min(100, 100 - window.usedPercent))))% remaining") }
                    ProgressView(value: max(0, min(100, 100 - window.usedPercent)), total: 100)
                    Text("Resets \(Date(timeIntervalSince1970: window.resetsAt).formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                }
            }
        } else { Text("Usage unknown until the official runtime reports a window. No counters are inferred from conversations.").font(.caption).foregroundStyle(.secondary) }
    }
}

struct ConnectionsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        Text("Official CLI connections").font(.title3.weight(.semibold))
        ConnectionRow(model: model, provider: "devin").padding(16).background(.background, in: RoundedRectangle(cornerRadius: 12))
        ConnectionRow(model: model, provider: "grok").padding(16).background(.background, in: RoundedRectangle(cornerRadius: 12))
        Text("Login, refresh, and logout remain owned by the official CLIs. Switchboard reads their protected sessions. Reconnecting pauses only that provider and cancels its active requests; native and other-provider routes remain available.").font(.callout).foregroundStyle(.secondary)
    }
}

struct SetupView: View {
    @ObservedObject var model: AppModel
    @State private var migration = false
    @State private var providerOnly = false
    @State private var nativeFileStorage = false
    @State private var confirmHome = false
    @State private var home = ""
    @State private var cli = ""
    var body: some View {
        Text(model.state?.integration.installed == true ? "Integration enabled" : "Set up Codex integration").font(.title3.weight(.semibold))
        Text("Switchboard keeps Codex's native provider and adds clearly labeled external picker entries. Apply setup once; subsequent menu model and reasoning changes affect the next “Switchboard selection” request.").foregroundStyle(.secondary)
        if let integration = model.state?.integration, !integration.conflicts.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(integration.installed ? "Owned settings changed" : "Existing integration detected").font(.headline)
                ForEach(integration.conflicts, id: \.self) { Text($0).font(.caption.monospaced()) }
                if !integration.installed { Toggle("Migrate explicitly and preserve the current setup for Restore", isOn: $migration) }
            }.padding(14).background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
        }
        if model.state?.integration.restartRequired == true {
            Label("Restart Codex to load the applied catalog. Existing CLI sessions also need to restart.", systemImage: "arrow.clockwise").foregroundStyle(.orange)
            Button("I Have Restarted Codex") { model.acknowledgeRestart() }.disabled(model.busy != nil)
        }
        Toggle("Provider-only setup when no native credential exists", isOn: $providerOnly).disabled(model.state?.integration.installed == true)
        Text("Creates only a local sentinel login when auth.json is absent. It is never sent upstream. Native models and automatic native approval review require a real Codex login; manual approval is available in Codex.").font(.caption).foregroundStyle(.secondary)
        Toggle("Use file-backed native account storage (explicit Keychain migration)", isOn: $nativeFileStorage)
        Text("Use this after adding a fresh native account if the current home uses Keychain. Switchboard never extracts Keychain secrets. Restore returns the previous credential-storage setting.").font(.caption).foregroundStyle(.secondary)
        HStack {
            Button("Apply and Restart Codex…") { model.apply(migration: migration, providerOnly: providerOnly && model.state?.integration.installed != true, nativeFileStorage: nativeFileStorage, confirmHome: confirmHome) }.buttonStyle(.borderedProminent)
            if model.state?.integration.installed == true { Button("Restore Integration…") { model.restore() } }
            Spacer(); Button("Open Codex") { model.openCodex() }
        }.disabled(model.busy != nil || model.state == nil)
        Divider()
        DisclosureGroup("Advanced") {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Codex home", text: $home).textFieldStyle(.roundedBorder)
                TextField("Codex runtime (blank for Desktop runtime)", text: $cli).textFieldStyle(.roundedBorder)
                if model.state?.homeDisagreement == true { Text("The selected home differs from the inherited CLI home.").foregroundStyle(.orange) }
                Toggle("I confirmed that Desktop uses this Codex home", isOn: $confirmHome)
                Button("Save Advanced Settings") { model.updateSettings(home: home, cli: cli) }.disabled(model.busy != nil || model.state?.integration.installed == true)
                Text("Restore integration before changing homes. Default gateway port: 9477, bound only to 127.0.0.1. The helper never takes over another listener.").font(.caption).foregroundStyle(.secondary)
            }.padding(.top, 10)
        }
        Divider()
        Text("Restore and recovery").font(.headline)
        Text("Restore compares each owned setting before writing and asks how to resolve conflicts. It keeps saved accounts and unrelated settings. Private backups live under Application Support/Codex Switchboard/backups. After restore, restart Codex before quitting Switchboard.").font(.callout).foregroundStyle(.secondary)
        Text("Approval and long-task limits").font(.headline)
        Text("The native approval reviewer remains native. Provider failures never trigger cross-provider fallback. Images are advertised only for the reviewed Astra path. External compaction or an unsafe private continuation stops with an instruction to start a new task.").font(.callout).foregroundStyle(.secondary)
        .onAppear { home = model.state?.settings.codexHome ?? ""; cli = model.state?.settings.codexCLI ?? "" }
    }
}
