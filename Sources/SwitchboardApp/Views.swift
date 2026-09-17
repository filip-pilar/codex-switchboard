import SwiftUI
import SwitchboardCore

private func timestamp(_ milliseconds: Double?) -> String {
    guard let milliseconds else { return "Never" }
    return Date(timeIntervalSince1970: milliseconds / 1000).formatted(date: .abbreviated, time: .shortened)
}

struct SwitchboardPopover: View {
    @ObservedObject var model: AppModel
    private var families: [String: [GatewayModel]] { Dictionary(grouping: model.availableTargets, by: \.familyKey) }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Switchboard").font(.headline)
                Spacer()
                Label(model.gatewayTitle, systemImage: "circle.fill")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Divider()
            if model.availableTargets.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Choose your models").font(.headline)
                    Text(model.state?.registry.models.isEmpty != false ? "Connect a provider to get started." : "Apply your models in Setup.").foregroundStyle(.secondary)
                    Button("Set Up…") { model.showManage(model.state?.registry.models.isEmpty != false ? "Connections" : "Setup") }
                }
            } else {
                Picker("Model", selection: Binding(get: { model.selected?.familyKey ?? "" }, set: { key in
                    guard let entries = families[key], let entry = entries.first(where: { $0.reasoningName.lowercased().hasPrefix("medium") }) ?? entries.first else { return }
                    model.select(entry.id)
                })) {
                    Text("Choose a model").tag("")
                    ForEach(families.keys.sorted(), id: \.self) { key in
                        if let entry = families[key]?.first {
                            Text("\(entry.familyName) · \(entry.provider == "devin" ? "Devin" : "Grok")").tag(key)
                        }
                    }
                }.disabled(model.busy != nil)
                if let selected = model.selected, let variants = families[selected.familyKey], variants.count > 1 {
                    Picker("Reasoning", selection: Binding(get: { selected.id }, set: { model.select($0) })) {
                        ForEach(variants.sorted { $0.reasoningOrder < $1.reasoningOrder }) { entry in
                            Text(entry.reasoningName.isEmpty ? "Default" : entry.reasoningName).tag(entry.id)
                        }
                    }.disabled(model.busy != nil)
                } else if let selected = model.selected, let efforts = selected.capabilities.efforts, !efforts.isEmpty {
                    Picker("Reasoning", selection: Binding(get: { model.state?.registry.selection?.effort ?? "" }, set: { model.select(selected.id, effort: $0) })) {
                        ForEach(efforts, id: \.self) { Text($0.capitalized).tag($0) }
                    }.disabled(model.busy != nil)
                }
                if let selected = model.selected, families[selected.familyKey]?.count == 1, !selected.reasoningName.isEmpty {
                    LabeledContent("Reasoning", value: selected.reasoningName).foregroundStyle(.secondary)
                }
                Text("Use “Switchboard selection” in Codex.").font(.caption).foregroundStyle(.secondary)
            }
            Divider()
            HStack {
                Image(systemName: "person.crop.circle").font(.title2).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.activeAccount?.displayName ?? "No saved account")
                    Text(model.activeAccount == nil ? "Add or import a Codex login" : (model.identityVerified ? "Active account" : "Identity needs verification"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    ForEach(model.accounts.filter { $0.id != model.activeAccountID }) { account in
                        Button("Switch to \(account.displayName)…") { model.switchAccount(account) }.disabled(model.busy != nil)
                    }
                    Button("Manage Accounts…") { model.showManage("Accounts") }
                } label: { Text("Switch") }
                .menuStyle(.borderlessButton).fixedSize().accessibilityLabel("Accounts")
            }
            if model.state?.integration.restartRequired == true {
                Button("Restart needed…") { model.showManage("Setup") }
            }
            OperationStatus(model: model, showFeedback: false)
            Divider()
            HStack {
                Button("Settings…") { model.showManage() }
                Spacer()
                Button("Open Codex") { model.openCodex() }
                Button { model.requestQuit() } label: { Image(systemName: "power") }
                    .help("Quit Switchboard").accessibilityLabel("Quit Switchboard")
            }.controlSize(.small)
        }
        .padding(18).frame(width: 360)
    }
}

private struct OperationStatus: View {
    @ObservedObject var model: AppModel
    var showFeedback = true
    var body: some View {
        if let busy = model.busy {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text(busy)
                if model.signingIn { Button("Cancel") { model.cancelLogin() } }
            }.font(.callout)
        }
        if let error = model.failure ?? model.state?.error?.message ?? model.state?.integration.error?.message {
            Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red)
                .font(.callout).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        } else if showFeedback, let feedback = model.feedback {
            Text(feedback).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
        }
    }
}

private struct DetailDisclosureStyle: DisclosureGroupStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                configuration.isExpanded.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: configuration.isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2.weight(.semibold)).frame(width: 10)
                    configuration.label
                    Spacer()
                }.contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityValue(configuration.isExpanded ? "Expanded" : "Collapsed")
            if configuration.isExpanded { configuration.content }
        }
    }
}

struct ManagementView: View {
    @ObservedObject var model: AppModel
    private let destinations = [("Models", "square.stack"), ("Accounts", "person.crop.circle"), ("Connections", "network"), ("Setup", "slider.horizontal.3")]
    var body: some View {
        NavigationSplitView {
            List(selection: $model.tab) {
                ForEach(destinations, id: \.0) { title, symbol in
                    Label(title, systemImage: symbol).tag(title)
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 160, ideal: 175, max: 210)
            .safeAreaInset(edge: .bottom) {
                Label(model.gatewayTitle, systemImage: model.state?.gateway == "running" ? "checkmark.circle" : "circle.dashed")
                    .font(.caption).foregroundStyle(.secondary).padding(16).frame(maxWidth: .infinity, alignment: .leading)
            }
        } detail: {
            VStack(spacing: 0) {
                HStack {
                    Text(model.tab).font(.title2.weight(.semibold))
                    Spacer()
                    Button { model.showMenu() } label: { Image(systemName: "menubar.rectangle") }
                        .help("Show menu").accessibilityLabel("Show menu")
                }.padding(.horizontal, 24).padding(.vertical, 18)
                ZStack {
                    page("Models") { ModelsView(model: model) }
                    page("Accounts") { AccountsView(model: model) }
                    page("Connections") { ConnectionsView(model: model) }
                    page("Setup") { SetupView(model: model) }
                }

                if model.busy != nil || model.failure != nil || model.state?.error != nil || model.state?.integration.error != nil || model.feedback != nil {
                    Divider()
                    VStack(alignment: .leading) { OperationStatus(model: model) }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                }
            }
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .frame(minWidth: 760, minHeight: 540)
    }
    private func page<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        Form { content() }
            .formStyle(.grouped).disclosureGroupStyle(DetailDisclosureStyle())
            .opacity(model.tab == title ? 1 : 0)
            .allowsHitTesting(model.tab == title)
            .disabled(model.tab != title)
            .accessibilityHidden(model.tab != title)
    }

}

struct ModelsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        Section {
            LabeledContent("Codex model picker") {
                Button("Refresh") { model.refreshModels() }.disabled(model.busy != nil)
            }
            if model.state?.pendingCatalog == true {
                LabeledContent("Changes ready to apply") {
                    Button("Review Setup…") { model.showManage("Setup") }
                }
            }
        } footer: { Text("Choose which models appear in Codex. Apply changes in Setup.") }
        if model.state?.registry.models.isEmpty != false {
            ContentUnavailableView {
                Label("No models yet", systemImage: "square.stack")
            } description: {
                Text("Connect Devin or Grok to see available models.")
            } actions: {
                Button("Connect a Provider…") { model.showManage("Connections") }
            }
        } else {
            ForEach(["devin", "grok"], id: \.self) { provider in
                let entries = model.state?.registry.models.filter { $0.provider == provider } ?? []
                if !entries.isEmpty {
                    Section(provider == "devin" ? "Devin" : "Grok") {
                        let visible = entries.filter { $0.enabled || ($0.compatible && $0.availability == "advertised") }
                        let families = Dictionary(grouping: visible, by: { $0.familyName })
                        ForEach(families.keys.sorted(), id: \.self) { name in
                            let variants = families[name] ?? []
                            if variants.count == 1, let entry = variants.first {
                                ModelRow(model: model, entry: entry)
                            } else {
                                DisclosureGroup {
                                    ForEach(variants.sorted { $0.reasoningOrder < $1.reasoningOrder }) { entry in ModelRow(model: model, entry: entry, title: entry.reasoningName) }
                                } label: {
                                    HStack {
                                        Text(name)
                                        Spacer()
                                        let count = variants.filter(\.enabled).count
                                        Text(count == 0 ? "Choose reasoning" : "\(count) selected")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        let unavailable = entries.filter { !$0.enabled && (!$0.compatible || $0.availability != "advertised") }
                        if !unavailable.isEmpty {
                            DisclosureGroup("Unavailable models (\(unavailable.count))") {
                                ForEach(unavailable) { entry in ModelRow(model: model, entry: entry) }
                            }.foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

private extension GatewayModel {
    var familyKey: String { provider + "/" + familyName }
    var reasoningName: String {
        let label = name.components(separatedBy: " · ").first ?? name
        return String(label.dropFirst(familyName.count)).trimmingCharacters(in: .whitespaces)
    }
    var reasoningOrder: Int {
        ["no thinking", "low", "medium", "high", "xhigh", "max"].firstIndex {
            reasoningName.lowercased().hasPrefix($0)
        } ?? 6
    }
    var familyName: String {
        let label = name.components(separatedBy: " · ").first ?? name
        return label.replacingOccurrences(of: #"\s+(?:No Thinking|(?:Low|Medium|High|XHigh|Max)(?: Thinking)?)$"#, with: "", options: [.regularExpression, .caseInsensitive])
    }
}

private struct ModelRow: View {
    @ObservedObject var model: AppModel
    let entry: GatewayModel
    var title: String? = nil
    @State private var expanded = false
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Toggle(title ?? entry.familyName, isOn: Binding(get: { entry.enabled }, set: { model.setEnabled(entry, $0) }))
                    .toggleStyle(.switch).controlSize(.small)
                    .disabled(model.busy != nil || !entry.compatible || (!entry.enabled && entry.availability != "advertised"))
                Button { expanded.toggle() } label: { Image(systemName: "info.circle").foregroundStyle(.secondary) }
                    .buttonStyle(.borderless).help("About \(entry.name)").accessibilityLabel("About \(entry.name)")
            }
            if !entry.compatible || entry.availability != "advertised" {
                Text(entry.availability == "advertised" ? entry.compatibilityReason : "Unavailable for this connection")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .popover(isPresented: $expanded) {
            VStack(alignment: .leading, spacing: 10) {
                Text(entry.name).font(.headline)
                LabeledContent("Model ID", value: entry.upstream).textSelection(.enabled)
                LabeledContent("Tools", value: capability(entry.capabilities.tools))
                LabeledContent("Images", value: capability(entry.capabilities.images))
                LabeledContent("Context", value: entry.capabilities.contextWindow.map { $0.formatted() } ?? "Unknown")
                LabeledContent("Reasoning", value: entry.capabilities.efforts?.map(\.capitalized).joined(separator: ", ") ?? "Provider default")
                if let note = entry.evidence?.note { Text(note).foregroundStyle(.secondary) }
            }.font(.callout).padding(18).frame(width: 330)
        }
    }
    private func capability(_ value: Bool?) -> String { value.map { $0 ? "Supported" : "Not supported" } ?? "Unknown" }
}

struct AccountsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        Section {
            HStack {
                Button("Add Account…") { model.addAccount() }
                Spacer()
                Button("Import Current Login") { model.importCurrent() }.disabled(!model.canUseAccounts)
            }.disabled(model.busy != nil || model.state == nil)
            if !model.canUseAccounts {
                Text("Your login uses Keychain. Add an account, then enable file storage in Setup → Advanced.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        } footer: { Text("Switching accounts restarts Codex. Finish active tasks first.") }
        if model.accounts.isEmpty {
            ContentUnavailableView("No saved accounts", systemImage: "person.crop.circle", description: Text("Add an account or import your current Codex login."))
        } else {
            Section("Saved accounts") {
                ForEach(model.accounts) { account in
                    HStack(spacing: 12) {
                        Text(account.initials).font(.callout.weight(.medium)).foregroundStyle(.secondary)
                            .frame(width: 34, height: 34).background(.quaternary, in: Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text(account.displayName)
                            if let email = account.email { Text(email).font(.caption).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        if model.activeAccountID == account.id {
                            Text(model.identityVerified ? "Active" : "Verify identity").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Button("Switch…") { model.switchAccount(account) }
                            Menu {
                                Button("Remove Account…", role: .destructive) { model.removeAccount(account) }
                            } label: { Image(systemName: "ellipsis") }
                            .menuStyle(.borderlessButton).fixedSize().accessibilityLabel("Options for \(account.displayName)")
                        }
                    }.padding(.vertical, 4).disabled(model.busy != nil)
                }
            }
        }
        if model.activeAccount != nil {
            Section {
                LabeledContent(model.usageStale ? "Usage · needs refresh" : "Usage") {
                    Button("Refresh") { model.refreshUsage() }.disabled(model.busy != nil)
                }
                ForEach(Array(model.usageWindows.enumerated()), id: \.offset) { _, window in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(window.windowDurationMins == 10080 ? "Weekly" : "\(window.windowDurationMins / 60)-hour window")
                            Spacer()
                            Text("\(Int(max(0, min(100, 100 - window.usedPercent))))% remaining").foregroundStyle(.secondary)
                        }
                        ProgressView(value: max(0, min(100, 100 - window.usedPercent)), total: 100)
                        Text("Resets \(Date(timeIntervalSince1970: window.resetsAt).formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                }
            }
        }
    }
}

struct ConnectionsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        ForEach(["devin", "grok"], id: \.self) { provider in
            Section(provider == "devin" ? "Devin" : "Grok") {
                ConnectionRow(model: model, provider: provider)
            }
        }
        if model.state?.integration.installed != true && model.state?.registry.providers.values.contains(where: { $0.status == "connected" }) == true {
            Button("Choose Models…") { model.showManage("Models") }
        }
        Text("Signing in again cancels that provider’s active requests.")
            .font(.callout).foregroundStyle(.secondary)
    }
}

struct ConnectionRow: View {
    @ObservedObject var model: AppModel
    let provider: String
    private var state: ProviderState? { model.state?.registry.providers[provider] }
    private var hasCLI: Bool { (provider == "devin" ? model.state?.clis.devin : model.state?.clis.grok) != nil }
    private var status: String {
        if let worker = model.state?.workerStates[provider], ["needs_attention", "restarting", "reconnecting"].contains(worker) {
            return worker.replacingOccurrences(of: "_", with: " ").capitalized
        }
        return (state?.status ?? "Not connected").replacingOccurrences(of: "_", with: " ").capitalized
    }
    var body: some View {
        HStack {
            Text(status)
            Spacer()
            if !hasCLI {
                Button("Install CLI…") { model.connect(provider) }
            } else if state?.status == "connected" {
                Button("Refresh") { model.refreshModels(provider) }
            } else {
                Button("Sign In…") { model.connect(provider) }
            }
            if hasCLI {
                Menu("Options") {
                    Button("Use Existing Login") { model.refreshModels(provider) }
                    Button("Sign In Again…") { model.connect(provider) }
                }.fixedSize()
            }
        }.disabled(model.busy != nil || model.state == nil)
        if let error = state?.error { Text(error.message).font(.callout).foregroundStyle(.orange) }
    }

}

struct SetupView: View {
    @ObservedObject var model: AppModel
    @State private var advanced = false
    @State private var migration = false
    @State private var providerOnly = false
    @State private var nativeFileStorage = false
    @State private var confirmHome = false
    @State private var home = ""
    @State private var cli = ""
    @State private var loadedPaths = false
    private var installed: Bool { model.state?.integration.installed == true }
    private var connected: Bool { model.state?.registry.providers.values.contains { $0.status == "connected" } == true }
    private var chosen: Int {
        model.state?.registry.models.filter {
            $0.enabled && $0.compatible && $0.availability == "advertised" && model.state?.registry.providers[$0.provider]?.status == "connected"
        }.count ?? 0
    }
    var body: some View {
        Group {
        if model.state == nil {
            Section { ProgressView("Loading setup…") }
        } else if !installed {
            Section {
                LabeledContent("Provider", value: connected ? "Connected" : "Not connected")
                LabeledContent("Models", value: "\(chosen) selected")
                if !connected {
                    Button("Connect a Provider…") { model.showManage("Connections") }.buttonStyle(.borderedProminent)
                } else if chosen == 0 {
                    Button("Choose Models…") { model.showManage("Models") }.buttonStyle(.borderedProminent)
                } else {
                    Button("Enable in Codex…") { apply() }.buttonStyle(.borderedProminent)
                        .disabled(model.busy != nil || (!migration && model.state?.integration.conflicts.isEmpty == false) || (model.state?.homeDisagreement == true && !confirmHome))
                }
            } footer: { Text("Your native models stay available. You choose when to restart Codex.") }
        } else {
            Section {
                Label(model.state?.integration.restartRequired == true ? "Restart to finish setup" : (model.state?.integration.error != nil || model.state?.error != nil ? "Setup needs attention" : (model.state?.gateway == "running" ? "Switchboard is ready" : "Integration enabled · " + model.gatewayTitle.lowercased())),
                      systemImage: model.state?.integration.restartRequired == true ? "arrow.clockwise" : "checkmark.circle")
                    .font(.headline)
                Text("In Codex’s model picker, choose “Switchboard selection” to follow your menu-bar choice.").foregroundStyle(.secondary)
                HStack {
                    Button("Open Codex") { model.openCodex() }.buttonStyle(.borderedProminent)
                    Button("Show Menu") { model.showMenu() }
                }
                if model.state?.pendingCatalog == true {
                    LabeledContent("Model changes waiting") { Button("Apply Changes…") { apply() }.disabled(model.busy != nil) }
                }
            }
        }
        if let integration = model.state?.integration, !integration.conflicts.isEmpty {
            Section(integration.installed ? "Settings changed" : "Existing integration") {
                ForEach(integration.conflicts, id: \.self) { Text($0).font(.callout.monospaced()) }
                if !integration.installed { Toggle("Replace existing integration", isOn: $migration) }
                Text("Your previous setup is saved for Restore.").font(.caption).foregroundStyle(.secondary)
            }
        }
        if model.state?.integration.restartRequired == true {
            Section {
                LabeledContent("Restart required") { Button("I’ve Restarted Codex") { model.acknowledgeRestart() }.disabled(model.busy != nil) }
                Text("Restart Codex and existing CLI sessions to load changes.").font(.callout).foregroundStyle(.secondary)
            }
        }
        Section {
            Toggle("Launch at login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
        }
        Section {
            DisclosureGroup("Advanced", isExpanded: $advanced) {
                Toggle("Set up without a native Codex login", isOn: $providerOnly).disabled(model.state?.integration.installed == true)
                Text("External providers only. Native models and automatic approval review need a Codex login.").font(.caption).foregroundStyle(.secondary)
                Toggle("Store native accounts in private files", isOn: $nativeFileStorage)
                Text("For Keychain users: add an account first. This changes Codex credential storage when you apply setup; it does not copy Keychain credentials.").font(.caption).foregroundStyle(.secondary)
                TextField("Codex home", text: $home)
                TextField("Codex runtime", text: $cli, prompt: Text("Automatic"))
                if model.state?.homeDisagreement == true { Text("This home differs from the CLI’s current home.").foregroundStyle(.orange) }
                Toggle("Desktop uses this Codex home", isOn: $confirmHome)
                Button("Save Paths") { model.updateSettings(home: home, cli: cli) }.disabled(model.busy != nil || model.state == nil || model.state?.integration.installed == true)
                if model.state?.integration.installed == true { Text("Restore integration before changing paths.").font(.caption).foregroundStyle(.secondary) }
            }
        }
        Section("Support") {
            Button("Copy Diagnostics") { model.copyDiagnostics() }.disabled(model.busy != nil || model.state == nil)
            if let route = model.state?.lastRoute {
                DisclosureGroup("Last request") {
                    LabeledContent("Provider", value: (route.provider ?? "Unknown").capitalized)
                    LabeledContent("Model", value: route.selector ?? "Auxiliary request")
                    LabeledContent("Result", value: route.result.replacingOccurrences(of: "_", with: " ").capitalized)
                    LabeledContent("Time", value: timestamp(route.finishedAt ?? route.startedAt))
                }
            }
            if model.state?.integration.installed == true {
                Button("Restore Previous Setup…") { model.restore() }.disabled(model.busy != nil)
                Text("Keeps saved accounts. Restart Codex after restoring.").font(.caption).foregroundStyle(.secondary)
            }
        }
        }
        .onAppear { loadPaths() }
        .onChange(of: model.state?.settings.codexHome) { _, _ in loadPaths() }
    }
    private func loadPaths() {
        guard !loadedPaths, let settings = model.state?.settings else { return }
        home = settings.codexHome
        cli = settings.codexCLI ?? ""
        loadedPaths = true
        if model.state?.homeDisagreement == true { advanced = true }
    }
    private func apply() {
        model.apply(migration: migration, providerOnly: providerOnly && !installed,
                    nativeFileStorage: nativeFileStorage, confirmHome: confirmHome)
    }
}
