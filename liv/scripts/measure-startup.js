// @ts-check
import { spawn } from "child_process"
import { readFileSync, existsSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Thresholds in milliseconds
const COLD_START_THRESHOLD = 3000
const HOT_START_THRESHOLD = 1000

/**
 * Parse command line arguments
 * @returns {{ help: boolean, cold: boolean, hot: boolean }}
 */
const parseArgs = () => {
  const args = process.argv.slice(2)
  return {
    help: args.includes("--help") || args.includes("-h"),
    cold: args.includes("--cold"),
    hot: args.includes("--hot"),
  }
}

/**
 * Show usage information
 */
const showHelp = () => {
  console.log(`
Liv Startup Performance Measurement Tool

Usage:
  node measure-startup.js [options]

Options:
  --help, -h    Show this help message
  --cold        Measure cold start performance (< ${COLD_START_THRESHOLD}ms)
  --hot         Measure hot start performance (< ${HOT_START_THRESHOLD}ms)

Examples:
  node measure-startup.js --cold
  node measure-startup.js --hot

Description:
  Launches the Electron app and measures startup time by parsing
  performance logs. Exits with code 0 if within threshold, code 1
  if exceeds threshold or measurement fails.

Thresholds:
  Cold start: < ${COLD_START_THRESHOLD}ms
  Hot start:  < ${HOT_START_THRESHOLD}ms
  `)
}

/**
 * Extract startup time from log output
 * @param {string} logOutput
 * @returns {number | null} Startup time in milliseconds, or null if not found
 */
const extractStartupTime = (logOutput) => {
  // Look for the "startup-complete" marker which indicates full startup
  const match = logOutput.match(/\[Perf\] startup-complete: ([\d.]+)ms/)
  if (match && match[1]) {
    return parseFloat(match[1])
  }
  return null
}

/**
 * Launch Electron app and measure startup time
 * @param {boolean} isColdStart
 * @returns {Promise<number>} Startup time in milliseconds
 */
const measureStartup = (isColdStart) => {
  return new Promise((resolve, reject) => {
    const livDir = path.join(__dirname, "..")
    const electronPath = path.join(livDir, "node_modules", ".bin", "electron")

    // Check if we're in development or production
    let appPath
    if (existsSync(path.join(livDir, "out", "main", "index.js"))) {
      appPath = path.join(livDir, "out", "main", "index.js")
    } else {
      reject(new Error("App not built. Run 'npm run build' first."))
      return
    }

    console.log(`Launching Electron app for ${isColdStart ? "cold" : "hot"} start measurement...`)

    let logBuffer = ""
    let startupTime = null
    let timeout

    const electron = spawn(electronPath, [appPath], {
      cwd: livDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    })

    // Capture stdout
    electron.stdout?.on("data", (data) => {
      const output = data.toString()
      logBuffer += output

      // Check if we found the startup-complete marker
      const time = extractStartupTime(logBuffer)
      if (time !== null && startupTime === null) {
        startupTime = time
        // Give a bit more time for graceful shutdown
        setTimeout(() => {
          electron.kill("SIGTERM")
        }, 500)
      }
    })

    // Capture stderr
    electron.stderr?.on("data", (data) => {
      const output = data.toString()
      logBuffer += output

      // Also check stderr for performance markers
      const time = extractStartupTime(logBuffer)
      if (time !== null && startupTime === null) {
        startupTime = time
        setTimeout(() => {
          electron.kill("SIGTERM")
        }, 500)
      }
    })

    electron.on("error", (error) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to launch Electron: ${error.message}`))
    })

    electron.on("close", (code) => {
      clearTimeout(timeout)

      if (startupTime !== null) {
        resolve(startupTime)
      } else {
        // Try to find any performance markers in the output
        console.log("\nLog output (last 500 chars):")
        console.log(logBuffer.slice(-500))
        reject(
          new Error(
            "Could not find startup-complete marker in logs. Make sure the app is instrumented with performance monitoring.",
          ),
        )
      }
    })

    // Set a timeout to kill the process if it takes too long
    timeout = setTimeout(() => {
      electron.kill("SIGTERM")
      reject(new Error("Timeout: App did not start within 15 seconds"))
    }, 15000)
  })
}

/**
 * Main function
 */
const main = async () => {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  if (!args.cold && !args.hot) {
    console.error("Error: Please specify --cold or --hot")
    console.error("Run with --help for usage information")
    process.exit(1)
  }

  const isColdStart = args.cold
  const threshold = isColdStart ? COLD_START_THRESHOLD : HOT_START_THRESHOLD
  const startType = isColdStart ? "Cold" : "Hot"

  try {
    const startupTime = await measureStartup(isColdStart)

    console.log(`\n${"=".repeat(50)}`)
    console.log(`${startType} Start Performance Results`)
    console.log(`${"=".repeat(50)}`)
    console.log(`Startup time: ${startupTime.toFixed(2)}ms`)
    console.log(`Threshold:    ${threshold}ms`)
    console.log(`Status:       ${startupTime <= threshold ? "✓ PASS" : "✗ FAIL"}`)
    console.log(`${"=".repeat(50)}\n`)

    if (startupTime > threshold) {
      console.error(
        `Performance regression detected: ${startType} start exceeded threshold by ${(startupTime - threshold).toFixed(2)}ms`,
      )
      process.exit(1)
    }

    process.exit(0)
  } catch (error) {
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

main()
