// swift-tools-version: 6.2
import PackageDescription
let package = Package(
    name: "CodexSwitchboard",
    platforms: [.macOS(.v26)],
    products: [.executable(name: "SwitchboardApp", targets: ["SwitchboardApp"]), .library(name: "SwitchboardCore", targets: ["SwitchboardCore"])],
    targets: [
        .target(name: "SwitchboardCore"),
        .executableTarget(name: "SwitchboardApp", dependencies: ["SwitchboardCore"]),
        .testTarget(name: "SwitchboardCoreTests", dependencies: ["SwitchboardCore"])
    ],
    swiftLanguageModes: [.v5]
)
