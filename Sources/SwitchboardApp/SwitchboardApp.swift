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
        NSApp.setActivationPolicy(.accessory)
        model = AppModel()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "arrow.triangle.branch", accessibilityDescription: "Codex Switchboard")
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
        let fitting = popover.contentViewController?.view.fittingSize ?? NSSize(width: 405, height: 700)
        popover.contentSize = NSSize(width: 405, height: min(800, max(580, fitting.height)))
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: rect, of: view, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if model?.allowsTermination == true { return .terminateNow }
        DispatchQueue.main.async { [weak self] in self?.model?.requestQuit() }
        return .terminateCancel
    }
}
