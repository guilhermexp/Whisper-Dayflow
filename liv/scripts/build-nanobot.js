#!/usr/bin/env node

/**
 * Build script for the nanobot Python gateway.
 *
 * Uses PyInstaller to create a single-file binary that can be bundled
 * with the Electron app. The binary is placed in resources/nanobot-bin/{platform}/.
 *
 * Usage:
 *   node scripts/build-nanobot.js
 *
 * Prerequisites:
 *   - Python 3.10+
 *   - pip install pyinstaller
 *   - pip install -r resources/nanobot/requirements.txt
 */

const { execSync } = require("child_process")
const path = require("path")
const fs = require("fs")

const ROOT = path.resolve(__dirname, "..")
const NANOBOT_DIR = path.join(ROOT, "resources", "nanobot")
const GATEWAY_SCRIPT = path.join(NANOBOT_DIR, "gateway.py")
const NANOBOT_REF = path.join(ROOT, "nanobot-ref")

const platformDir = () => {
  const platform = process.platform
  const arch = process.arch
  return `${platform}-${arch}`
}

const OUTPUT_DIR = path.join(ROOT, "resources", "nanobot-bin", platformDir())

function main() {
  console.log("=== Nanobot Gateway Build ===")
  console.log(`Platform: ${platformDir()}`)
  console.log(`Gateway: ${GATEWAY_SCRIPT}`)
  console.log(`Output:  ${OUTPUT_DIR}`)

  if (!fs.existsSync(GATEWAY_SCRIPT)) {
    console.error(`Gateway script not found: ${GATEWAY_SCRIPT}`)
    process.exit(1)
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  // Check Python
  try {
    const version = execSync("python3 --version", { encoding: "utf8" }).trim()
    console.log(`Python: ${version}`)
  } catch {
    console.error("Python 3 not found. Please install Python 3.10+.")
    process.exit(1)
  }

  // Check PyInstaller
  try {
    execSync("python3 -m PyInstaller --version", {
      encoding: "utf8",
      stdio: "pipe",
    })
  } catch {
    console.log("Installing PyInstaller...")
    execSync("python3 -m pip install pyinstaller", { stdio: "inherit" })
  }

  // Install dependencies
  console.log("Installing Python dependencies...")
  execSync(`python3 -m pip install -r ${path.join(NANOBOT_DIR, "requirements.txt")}`, {
    stdio: "inherit",
  })

  // Build with PyInstaller
  console.log("Building with PyInstaller...")
  const pyinstallerCmd = [
    "python3 -m PyInstaller",
    "--onefile",
    "--name liv-nanobot-gateway",
    `--distpath "${OUTPUT_DIR}"`,
    `--workpath "${path.join(ROOT, "build", "nanobot-build")}"`,
    `--specpath "${path.join(ROOT, "build", "nanobot-build")}"`,
    // Add nanobot-ref as data
    `--add-data "${NANOBOT_REF}${path.delimiter}nanobot-ref"`,
    // Add tools and skills
    `--add-data "${path.join(NANOBOT_DIR, "tools")}${path.delimiter}tools"`,
    `--add-data "${path.join(NANOBOT_DIR, "skills")}${path.delimiter}skills"`,
    `--add-data "${path.join(NANOBOT_DIR, "config_bridge.py")}${path.delimiter}."`,
    `--add-data "${path.join(NANOBOT_DIR, "jobs.json")}${path.delimiter}."`,
    // Hidden imports
    "--hidden-import uvicorn",
    "--hidden-import fastapi",
    "--hidden-import httpx",
    "--hidden-import litellm",
    // Clean build
    "--clean",
    "--noconfirm",
    `"${GATEWAY_SCRIPT}"`,
  ].join(" ")

  execSync(pyinstallerCmd, {
    stdio: "inherit",
    cwd: NANOBOT_DIR,
  })

  console.log(`\nBuild complete: ${OUTPUT_DIR}`)
  console.log("Include this binary in electron-builder extraResources config.")
}

main()
