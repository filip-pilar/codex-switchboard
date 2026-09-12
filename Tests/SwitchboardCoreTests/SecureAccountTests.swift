import Foundation
import Testing
import Darwin
@testable import SwitchboardCore

struct SecureAccountTests {
    @Test func refusesSymlinkedCredentialAndAncestor() async throws {
        let root = URL(fileURLWithPath: "/private/tmp/switchboard-account-\(UUID())")
        try SecureFiles.directory(root); defer { try? FileManager.default.removeItem(at: root) }
        let target = root.appending(path: "secret"), link = root.appending(path: "link")
        try SecureFiles.write(Data("private fixture".utf8), to: target)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
        #expect(throws: Error.self) { try SecureFiles.read(link) }
        #expect(throws: Error.self) { try SecureFiles.write(Data("overwrite".utf8), to: link) }
        let directory = root.appending(path: "dir"), directoryLink = root.appending(path: "dirlink")
        try SecureFiles.directory(directory); try FileManager.default.createSymbolicLink(at: directoryLink, withDestinationURL: directory)
        #expect(throws: Error.self) { try SecureFiles.write(Data(), to: directoryLink.appending(path: "auth.json")) }
        #expect(try SecureFiles.read(target) == Data("private fixture".utf8))
    }
    @Test func actualStoreRollsBackWrongIdentityAndKeepsPrivateProfiles() async throws {
        let root = URL(fileURLWithPath: "/private/tmp/switchboard-account-\(UUID())")
        try SecureFiles.directory(root); defer { try? FileManager.default.removeItem(at: root) }
        let active = root.appending(path: "active"), data = root.appending(path: "app")
        try SecureFiles.directory(active)
        let original = AccountProfile(id: UUID(), displayName: "Original", email: "same@example.test", accountID: "original", createdAt: Date())
        let target = AccountProfile(id: UUID(), displayName: "Target", email: "same@example.test", accountID: "target", createdAt: Date())
        let store = AccountStore(baseURL: data, activeHomeURL: active)
        try SecureFiles.write(Data("original".utf8), to: active.appending(path: "auth.json"))
        try await store.importCurrentProfile(original)
        let home = try await store.createProfileDirectory(id: target.id)
        #expect(try String(data: SecureFiles.read(home.appending(path: "config.toml")), encoding: .utf8) == "cli_auth_credentials_store = \"file\"\n")
        try SecureFiles.write(Data("wrong-account".utf8), to: home.appending(path: "auth.json"))
        try await store.addProfile(target)
        let service = SwitchService(desktop: NoDesktop(), store: store, codex: FileIdentity())
        await #expect(throws: OperationError.self) { try await service.switchAccount(to: target.id) }
        #expect(try String(data: SecureFiles.read(active.appending(path: "auth.json")), encoding: .utf8) == "original")
        #expect(try await store.loadRegistry().activeAccountID == original.id)
        #expect(try await store.loadRegistry().accounts.count == 2)
        let attributes = try FileManager.default.attributesOfItem(atPath: home.appending(path: "auth.json").path)
        #expect((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        try SecureFiles.write(Data("target".utf8), to: home.appending(path: "auth.json"))
        try await service.switchAccount(to: target.id)
        #expect(try await store.loadRegistry().activeAccountID == target.id)
        #expect(try String(data: SecureFiles.read(active.appending(path: "auth.json")), encoding: .utf8) == "target")
    }
}
private struct NoDesktop: DesktopControlling {
    func closeDesktop() async throws {}
    func reopenDesktop() async throws {}
}
private struct FileIdentity: CodexIdentityReading {
    func readIdentity(profileHome: URL) async throws -> AccountIdentity {
        let id = String(data: try SecureFiles.read(profileHome.appending(path: "auth.json")), encoding: .utf8)!
        return AccountIdentity(accountID: id, email: "same@example.test")
    }
}
