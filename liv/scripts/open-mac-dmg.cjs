const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const distDir = path.resolve(__dirname, "..", "dist")
const dryRun = process.argv.includes("--dry-run")

function listDmgs(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listDmgs(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".dmg")) {
      files.push(fullPath)
    }
  }

  return files
}

function getNewestFile(paths) {
  if (!paths.length) return null
  return paths
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].filePath
}

try {
  const dmgFiles = listDmgs(distDir)
  const newestDmg = getNewestFile(dmgFiles)

  if (!newestDmg) {
    console.warn(`[open-mac-dmg] No .dmg found in ${distDir}`)
    if (fs.existsSync(distDir)) {
      if (!dryRun) {
        execFileSync("open", [distDir], { stdio: "ignore" })
      }
      console.log(`[open-mac-dmg] Opened folder: ${distDir}`)
      process.exit(0)
    }
    process.exit(1)
  }

  if (!dryRun) {
    execFileSync("open", ["-R", newestDmg], { stdio: "ignore" })
  }
  console.log(`[open-mac-dmg] Selected artifact: ${newestDmg}`)
} catch (error) {
  console.error("[open-mac-dmg] Failed:", error.message)
  process.exit(1)
}
