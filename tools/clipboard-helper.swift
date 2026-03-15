import AppKit
import Foundation

struct ClipboardState: Codable {
    let changeCount: Int
    let text: String
}

struct ClipboardClearResult: Codable {
    let afterChangeCount: Int
    let beforeChangeCount: Int
    let beforeTextLength: Int
    let matched: Bool
}

func emitJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(value),
          let text = String(data: data, encoding: .utf8) else {
        fputs("failed to encode JSON\n", stderr)
        exit(1)
    }

    print(text)
}

func readStdinText() -> String {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    return String(data: data, encoding: .utf8) ?? ""
}

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    fputs("missing clipboard helper command\n", stderr)
    exit(1)
}

let pasteboard = NSPasteboard.general

func currentState() -> ClipboardState {
    ClipboardState(
        changeCount: pasteboard.changeCount,
        text: pasteboard.string(forType: .string) ?? ""
    )
}

switch command {
case "read":
    emitJSON(currentState())

case "write":
    let text = readStdinText()
    pasteboard.clearContents()
    guard pasteboard.setString(text, forType: .string) else {
        fputs("failed to write clipboard string\n", stderr)
        exit(1)
    }
    emitJSON(currentState())

case "clear-if-match":
    guard args.count >= 2, let expectedChangeCount = Int(args[1]) else {
        fputs("missing expected changeCount\n", stderr)
        exit(1)
    }

    let expectedText = readStdinText()
    let beforeState = currentState()

    if beforeState.changeCount == expectedChangeCount && beforeState.text == expectedText {
        pasteboard.clearContents()
        let afterState = currentState()
        emitJSON(
            ClipboardClearResult(
                afterChangeCount: afterState.changeCount,
                beforeChangeCount: beforeState.changeCount,
                beforeTextLength: beforeState.text.count,
                matched: true
            )
        )
    } else {
        emitJSON(
            ClipboardClearResult(
                afterChangeCount: beforeState.changeCount,
                beforeChangeCount: beforeState.changeCount,
                beforeTextLength: beforeState.text.count,
                matched: false
            )
        )
    }

default:
    fputs("unknown clipboard helper command: \(command)\n", stderr)
    exit(1)
}
