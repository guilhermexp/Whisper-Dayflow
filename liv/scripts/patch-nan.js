/**
 * Patch nan to work with Electron 39 / Node 22 where v8::Object::SetPrototype was removed.
 * We swap to SetPrototypeV2 in nan_maybe_43_inl.h. Idempotent: only patches if original text is found.
 */
import fs from "fs"
import path from "path"
import url from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

function patchNan() {
  let nanPath
  try {
    // Resolve the installed nan location (works with pnpm's symlinks)
    nanPath = path.resolve(path.dirname(require.resolve("nan/package.json")), "nan_maybe_43_inl.h")
  } catch (err) {
    console.warn("[patch-nan] Could not resolve nan:", err.message)
    return
  }

  const originalSnippet = "return obj->SetPrototype(isolate->GetCurrentContext(), prototype);"
  const patchedSnippet = [
    "#if NODE_MODULE_VERSION >= 139  // Node 22 / Electron 39 removed SetPrototype",
    "  return obj->SetPrototypeV2(isolate->GetCurrentContext(), prototype);",
    "#else",
    "  return obj->SetPrototype(isolate->GetCurrentContext(), prototype);",
    "#endif",
  ].join("\n")

  let content = fs.readFileSync(nanPath, "utf8")
  if (content.includes(patchedSnippet)) {
    console.log("[patch-nan] Already patched")
    return
  }
  if (!content.includes(originalSnippet)) {
    console.warn("[patch-nan] Expected snippet not found; skipping")
    return
  }

  content = content.replace(originalSnippet, patchedSnippet)
  fs.writeFileSync(nanPath, content, "utf8")
  console.log("[patch-nan] Applied SetPrototypeV2 patch")
}

patchNan()
