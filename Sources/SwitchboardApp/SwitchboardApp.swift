import SwiftUI
import AppKit

@main
struct SwitchboardApp: App {
    @NSApplicationDelegateAdaptor(SwitchboardDelegate.self) private var delegate
    var body: some Scene { Settings { EmptyView() } }
}

@MainActor
final class SwitchboardDelegate: NSObject, NSApplicationDelegate {
    private var model: AppModel!
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let identifier = Bundle.main.bundleIdentifier,
           let existing = NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
            .first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            existing.activate(options: [.activateAllWindows])
            NSApp.terminate(nil)
            return
        }
        NSApp.setActivationPolicy(.accessory)
        model = AppModel()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let icon = NSImage(named: "StatusIconTemplate")
                ?? NSImage(systemSymbolName: "arrow.triangle.branch", accessibilityDescription: "Codex Switchboard")
            icon?.size = NSSize(width: 20, height: 20)
            icon?.isTemplate = true
            button.image = icon
            button.toolTip = "Codex Switchboard"
            button.target = self; button.action = #selector(togglePopover)
        }
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: SwitchboardPopover(model: model))
        model.showMenuAction = { [weak self] sourceView in
            guard let self, let view = sourceView else { return }
            self.presentPopover(relativeTo: NSRect(x: view.bounds.midX, y: view.isFlipped ? 60 : view.bounds.maxY - 60, width: 1, height: 1), of: view)
        }
    }
    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown { popover.performClose(nil); return }
        presentPopover(relativeTo: button.bounds, of: button)
    }
    private func presentPopover(relativeTo rect: NSRect, of view: NSView) {
        if popover.isShown { popover.performClose(nil) }
        let fitting = popover.contentViewController?.view.fittingSize ?? NSSize(width: 360, height: 360)
        popover.contentSize = NSSize(width: 360, height: min(700, max(280, fitting.height)))
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: rect, of: view, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if model == nil || model?.allowsTermination == true { return .terminateNow }
        DispatchQueue.main.async { [weak self] in self?.model?.requestQuit() }
        return .terminateCancel
    }
}
