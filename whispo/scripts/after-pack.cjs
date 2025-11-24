// @ts-check
const { execSync } = require("child_process")
const path = require("path")

/**
 * afterPack hook to sign the app ad-hoc and remove quarantine attributes on macOS
 * This allows the whispo-rs binary to work without Apple Developer ID
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  if (process.platform === "darwin") {
    const appPath = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
    )

    // Ad-hoc sign the app (allows consistent identity for permissions)
    console.log("Ad-hoc signing app:", appPath)
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`)
      console.log("Ad-hoc signing completed successfully")
    } catch (error) {
      console.warn("Failed to ad-hoc sign app:", error.message)
    }

    // Remove quarantine attributes
    console.log("Removing quarantine attributes from:", appPath)
    try {
      execSync(`xattr -cr "${appPath}"`)
      console.log("Quarantine attributes removed successfully")
    } catch (error) {
      console.warn("Failed to remove quarantine attributes:", error.message)
    }
  }
}
