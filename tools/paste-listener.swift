import AppKit
import ApplicationServices
import Foundation

let shouldCheckOnly = CommandLine.arguments.contains("--check")
let shouldPrompt = CommandLine.arguments.contains("--prompt")
let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: shouldPrompt] as CFDictionary
let trusted = AXIsProcessTrustedWithOptions(options)

print("trusted=\(trusted ? "true" : "false")")
fflush(stdout)

if shouldCheckOnly {
    exit(trusted ? 0 : 1)
}

if !trusted {
    print("permission=denied")
    fflush(stdout)
    exit(1)
}

let monitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
    guard let characters = event.charactersIgnoringModifiers?.lowercased() else {
        return
    }

    let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
    let isCommandV = flags.contains(.command) && characters == "v"
    let isControlV = flags.contains(.control) && characters == "v"

    if isCommandV || isControlV {
        print("event=paste-shortcut")
        fflush(stdout)
    }
}

if monitor == nil {
    print("monitor=unavailable")
    fflush(stdout)
    exit(1)
}

print("listener=ready")
fflush(stdout)

RunLoop.current.run()
