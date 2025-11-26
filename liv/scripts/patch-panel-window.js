// Patches @egoist/electron-panel-window to ignore backgroundColor KVO removal on macOS 15+
// so AppKit does not crash with "Cannot remove an observer ... because it is not registered".
// This runs after dependencies are installed.
import fs from "fs"
import path from "path"

const target = path.join(
  process.cwd(),
  "node_modules",
  "@egoist",
  "electron-panel-window",
  "functions_mac.mm",
)

const guardSnippet =
  '  // On macOS 15, AppKit tries to remove a KVO observer for `backgroundColor`\n' +
  '  // on NSTitlebar/Section views when the window class is swapped to PROPanel.\n' +
  '  // That observer was never added, so allow this removal call to be a no-op.\n' +
  '  if ([keyPath isEqualToString:@"backgroundColor"]) {\n' +
  "    return;\n" +
  "  }\n\n"

try {
  const original = fs.readFileSync(target, "utf8")

  if (original.includes("backgroundColor") && original.includes("On macOS 15")) {
    console.log("[patch-panel-window] already patched")
    process.exit(0)
  }

  const needle =
    '  if ([keyPath isEqualToString:@"_titlebarBackdropGroupName"]) {\n' +
    '    // NSLog(@"removeObserver ignored");\n' +
    "    return;\n" +
    "  }\n\n"

  if (!original.includes(needle)) {
    console.error("[patch-panel-window] Expected marker not found; aborting patch")
    process.exit(1)
  }

  const patched = original.replace(needle, needle + guardSnippet)
  fs.writeFileSync(target, patched, "utf8")
  console.log("[patch-panel-window] applied")
} catch (err) {
  console.error("[patch-panel-window] failed:", err)
  process.exit(1)
}
