import Foundation

public protocol AccountStoring: Sendable {
    func loadRegistry() async throws -> AccountRegistry
    func profile(id: UUID) async throws -> AccountProfile
    func activeCredentialExists() async -> Bool
    func clearActiveCredential() async throws
    func activeCodexHome() async -> URL
    func saveCurrentCredential() async throws
    func activateTargetCredential(id: UUID) async throws
    func restoreActiveCredential(id: UUID) async throws
    func commitActiveAccountID(_ id: UUID) async throws
}

public actor AccountStore: AccountStoring {
    public let baseURL: URL
    public let activeHomeURL: URL

    private let fileManager: FileManager
    private var registry: AccountRegistry?

    public init(
        baseURL: URL? = nil,
        activeHomeURL: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        let applicationSupportURL = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        if let baseURL {
            self.baseURL = baseURL
        } else {
            self.baseURL = applicationSupportURL.appending(
                path: "Codex Switchboard",
                directoryHint: .isDirectory
            )
        }
        self.activeHomeURL = activeHomeURL
            ?? ProcessInfo.processInfo.environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) }
            ?? fileManager.homeDirectoryForCurrentUser.appending(path: ".codex", directoryHint: .isDirectory)
    }

    private var accountsURL: URL { baseURL.appending(path: "accounts.json") }
    private var profilesURL: URL { baseURL.appending(path: "accounts", directoryHint: .isDirectory) }

    public func loadRegistry() throws -> AccountRegistry {
        try prepareDirectories()
        if let registry { return registry }
        guard fileManager.fileExists(atPath: accountsURL.path) else {
            registry = .empty
            return .empty
        }
        let loaded = try Self.decoder.decode(AccountRegistry.self, from: readChecked(accountsURL))
        registry = loaded
        return loaded
    }

    public func profile(id: UUID) throws -> AccountProfile {
        let registry = try loadRegistry()
        guard let profile = registry.accounts.first(where: { $0.id == id }) else {
            throw AccountStoreError.profileNotFound
        }
        return profile
    }

    public func profileHome(id: UUID) -> URL {
        profilesURL.appending(path: id.uuidString, directoryHint: .isDirectory)
    }

    public func activeCodexHome() -> URL { activeHomeURL }

    public func activeCredentialExists() -> Bool {
        fileManager.fileExists(atPath: activeHomeURL.appending(path: "auth.json").path)
    }

    public func createProfileDirectory(id: UUID) throws -> URL {
        try prepareDirectories()
        let directory = profileHome(id: id)
        try checkPath(directory)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: false)
        try restrictPermissions(directory, directory: true)
        try secureAtomicWrite(Data("cli_auth_credentials_store = \"file\"\n".utf8), to: directory.appending(path: "config.toml"))
        return directory
    }

    public func importCurrentProfile(_ profile: AccountProfile) throws {
        let source = activeHomeURL.appending(path: "auth.json")
        guard fileManager.fileExists(atPath: source.path) else {
            throw AccountStoreError.activeCredentialMissing
        }
        _ = try createProfileDirectory(id: profile.id)
        try copyCredential(from: source, to: profileHome(id: profile.id).appending(path: "auth.json"))

        var current = try loadRegistry()
        current.accounts.append(profile)
        current.activeAccountID = profile.id
        try saveRegistry(current)
    }

    public func addProfile(_ profile: AccountProfile) throws {
        let authURL = profileHome(id: profile.id).appending(path: "auth.json")
        guard fileManager.fileExists(atPath: authURL.path) else {
            throw AccountStoreError.targetCredentialMissing
        }
        try restrictPermissions(authURL, directory: false)
        var current = try loadRegistry()
        let identity = AccountIdentity(accountID: profile.accountID, email: profile.email)
        guard !current.accounts.contains(where: { identity.matches($0) }) else {
            throw AccountStoreError.duplicateAccount
        }
        current.accounts.append(profile)
        try saveRegistry(current)
    }

    public func discardUnregisteredProfile(id: UUID) throws {
        guard try !loadRegistry().accounts.contains(where: { $0.id == id }) else { return }
        let directory = profileHome(id: id)
        if fileManager.fileExists(atPath: directory.path) { try removeProfileDirectory(directory) }
    }

    public func registerActiveIdentity(_ identity: AccountIdentity) throws {
        let current = try loadRegistry()
        if let profile = current.accounts.first(where: { identity.matches($0) }) {
            try copyCredential(from: activeHomeURL.appending(path: "auth.json"),
                               to: profileHome(id: profile.id).appending(path: "auth.json"))
            try commitActiveAccountID(profile.id)
        } else {
            try importCurrentProfile(AccountProfile(id: UUID(), displayName: identity.suggestedDisplayName,
                email: identity.email, accountID: identity.accountID, createdAt: Date(), lastUsedAt: Date()))
        }
    }

    public func removeAccount(id: UUID) throws {
        var current = try loadRegistry()
        guard current.activeAccountID != id else {
            throw AccountStoreError.cannotRemoveActiveAccount
        }
        guard current.accounts.contains(where: { $0.id == id }) else {
            throw AccountStoreError.profileNotFound
        }
        let original = current
        current.accounts.removeAll(where: { $0.id == id })
        try saveRegistry(current)
        do {
            try removeProfileDirectory(profileHome(id: id))
        } catch {
            let removalError = error
            do {
                try saveRegistry(original)
            } catch {
                throw NSError(domain: "CodexAccountSwitcher.AccountStore", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "\(removalError.localizedDescription) Restoring the account list also failed: \(error.localizedDescription)",
                ])
            }
            throw removalError
        }
    }

    public func saveCurrentCredential() throws {
        let current = try loadRegistry()
        guard let activeID = current.activeAccountID else {
            throw AccountStoreError.activeProfileMissing
        }
        guard current.accounts.contains(where: { $0.id == activeID }) else {
            throw AccountStoreError.activeProfileMissing
        }
        let source = activeHomeURL.appending(path: "auth.json")
        guard fileManager.fileExists(atPath: source.path) else {
            throw AccountStoreError.activeCredentialMissing
        }
        try copyCredential(from: source, to: profileHome(id: activeID).appending(path: "auth.json"))
    }

    public func activateTargetCredential(id: UUID) throws {
        try installCredential(id: id)
    }

    public func clearActiveCredential() throws {
        try checkPath(activeHomeURL.appending(path: "auth.json"))
        try fileManager.removeItem(at: activeHomeURL.appending(path: "auth.json"))
    }

    public func restoreActiveCredential(id: UUID) throws {
        try installCredential(id: id)
    }

    private func installCredential(id: UUID) throws {
        _ = try profile(id: id)
        let source = profileHome(id: id).appending(path: "auth.json")
        guard fileManager.fileExists(atPath: source.path) else {
            throw AccountStoreError.targetCredentialMissing
        }

        try checkPath(activeHomeURL)
        try fileManager.createDirectory(at: activeHomeURL, withIntermediateDirectories: true)
        let destination = activeHomeURL.appending(path: "auth.json")
        let bytes = try readChecked(source)
        try secureAtomicWrite(bytes, to: destination)
    }

    public func commitActiveAccountID(_ id: UUID) throws {
        var current = try loadRegistry()
        guard let index = current.accounts.firstIndex(where: { $0.id == id }) else {
            throw AccountStoreError.profileNotFound
        }
        current.activeAccountID = id
        current.accounts[index].lastUsedAt = Date()
        try saveRegistry(current)
    }

    private func saveRegistry(_ value: AccountRegistry) throws {
        try writeJSON(value, to: accountsURL)
        registry = value
    }

    private func prepareDirectories() throws {
        try checkPath(baseURL)
        try checkPath(profilesURL)
        try fileManager.createDirectory(at: baseURL, withIntermediateDirectories: true)
        try restrictPermissions(baseURL, directory: true)
        try fileManager.createDirectory(at: profilesURL, withIntermediateDirectories: true)
        try restrictPermissions(profilesURL, directory: true)
    }

    private func copyCredential(from source: URL, to destination: URL) throws {
        let bytes = try readChecked(source)
        try secureAtomicWrite(bytes, to: destination)
    }

    private func checkPath(_ path: URL) throws {
        try SecureFiles.check(path)
    }

    private func readChecked(_ path: URL) throws -> Data {
        try checkPath(path)
        return try SecureFiles.read(path)
    }

    private func removeProfileDirectory(_ path: URL) throws {
        func checkTree(_ directory: URL) throws {
            try SecureFiles.check(directory)
            for child in try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isDirectoryKey]) {
                try SecureFiles.check(child)
                if try child.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true { try checkTree(child) }
            }
        }
        try checkTree(path)
        try fileManager.removeItem(at: path)
    }

    private func secureAtomicWrite(_ bytes: Data, to destination: URL) throws {
        try SecureFiles.write(bytes, to: destination)
    }

    private func restrictPermissions(_ path: URL, directory: Bool) throws {
        try SecureFiles.check(path)
        try fileManager.setAttributes([.posixPermissions: directory ? 0o700 : 0o600], ofItemAtPath: path.path)
    }

    private func writeJSON<T: Encodable>(_ value: T, to destination: URL) throws {
        let bytes = try Self.encoder.encode(value)
        try secureAtomicWrite(bytes, to: destination)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
