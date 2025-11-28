/**
 * Ensure entities subpaths used by htmlparser2/parse5 exist (entities/decode, entities/escape).
 * Creates small shims redirecting to lib/*.js if missing.
 */
import fs from "fs"
import path from "path"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

function ensureShim(name, target) {
  let libPath
  try {
    libPath = require.resolve(target)
  } catch (err) {
    console.warn("[patch-entities] Could not resolve target", target, ":", err.message)
    return
  }
  const pkgDir = path.resolve(path.dirname(libPath), "..")
  const shimPath = path.join(pkgDir, `${name}.js`)
  if (fs.existsSync(shimPath)) {
    const content = fs.readFileSync(shimPath, "utf8")
    if (content.includes(target)) {
      console.log(`[patch-entities] ${name}.js already present`)
      return
    }
  }
  fs.writeFileSync(shimPath, `module.exports = require("${target}");\n`, "utf8")
  console.log(`[patch-entities] Created entities/${name}.js shim`)
}

function patchExports() {
  let libPath
  try {
    libPath = require.resolve("entities/lib/decode.js")
  } catch (err) {
    console.warn("[patch-entities] Could not resolve entities/lib/decode.js:", err.message)
    return
  }
  const pkgPath = path.resolve(path.dirname(libPath), "..", "package.json")
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  pkg.exports = pkg.exports || {}
  const needsDecode = !pkg.exports["./decode"]
  const needsEscape = !pkg.exports["./escape"]
  if (!needsDecode && !needsEscape) {
    console.log("[patch-entities] exports already contain decode/escape")
    return
  }
  pkg.exports["./decode"] = "./lib/decode.js"
  pkg.exports["./escape"] = "./lib/escape.js"
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8")
  console.log("[patch-entities] Added decode/escape to entities exports")
}

patchExports()
ensureShim("decode", "entities/lib/decode.js")
ensureShim("escape", "entities/lib/escape.js")
