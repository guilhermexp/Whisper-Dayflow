const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const rootDir = path.resolve(__dirname, "..")
const rsDir = path.join(rootDir, "liv-rs")
const resourcesBinDir = path.join(rootDir, "resources", "bin")
const binaryName = process.platform === "win32" ? "liv-rs.exe" : "liv-rs"
const sourceBinary = path.join(rsDir, "target", "release", binaryName)
const targetBinary = path.join(resourcesBinDir, binaryName)

fs.mkdirSync(resourcesBinDir, { recursive: true })

const build = spawnSync("cargo", ["build", "-r"], {
  cwd: rsDir,
  stdio: "inherit",
})

if (build.status !== 0) {
  process.exit(build.status ?? 1)
}

if (!fs.existsSync(sourceBinary)) {
  console.error(`[build-rs] Binary not found: ${sourceBinary}`)
  process.exit(1)
}

fs.copyFileSync(sourceBinary, targetBinary)
console.log(`[build-rs] Copied ${sourceBinary} -> ${targetBinary}`)
