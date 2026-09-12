import Foundation

struct SafeFailure: Codable, LocalizedError { let code: String; let message: String; var errorDescription: String? { message } }
struct Capabilities: Decodable { let contextWindow: Int?; let images: Bool?; let tools: Bool?; let efforts: [String]?; let defaultEffort: String? }
struct ModelEvidence: Decodable { let liveVerified: Bool?; let note: String?; let inheritedVerifiedEfforts: [String]? }
struct GatewayModel: Decodable, Identifiable {
    let id: String; let provider: String; let upstream: String; let name: String; let capabilities: Capabilities
    let compatible: Bool; let compatibilityReason: String; let availability: String; let enabled: Bool
    let refreshedAt: Double; let firstSeenAt: Double?; let wasApplied: Bool?; let evidence: ModelEvidence?
}
struct SelectedModel: Decodable { let id: String; let effort: String? }
struct ProviderState: Decodable { let scope: String?; let refreshedAt: Double?; let error: SafeFailure?; let status: String? }
struct RegistryState: Decodable {
    let revision: Int; let appliedRevision: Int?; let models: [GatewayModel]; let appliedModels: [GatewayModel]
    let providers: [String: ProviderState]; let selection: SelectedModel?
}
struct IntegrationState: Decodable {
    let installed: Bool; let restartRequired: Bool?; let transaction: String?; let conflicts: [String]
    let codexHome: String?; let error: SafeFailure?; let nativeCredentialStore: String?
}
struct SettingsState: Decodable { let codexHome: String; let codexCLI: String? }
struct CLIPaths: Decodable { let codex: String?; let devin: String?; let grok: String? }
struct RouteState: Decodable {
    let startedAt: Double; let result: String; let provider: String?; let model: String?; let selector: String?; let effort: String?; let finishedAt: Double?; let httpStatus: Int?
}
struct HelperState: Decodable {
    let version: Int; let gateway: String; let error: SafeFailure?; let port: Int; let registry: RegistryState
    let workerStates: [String: String]; let lastRoute: RouteState?; let integration: IntegrationState; let settings: SettingsState; let clis: CLIPaths
    let homeDisagreement: Bool; let pendingCatalog: Bool; let nativePaused: Bool
}
