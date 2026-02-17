// @ts-check

/** @type {import('electron-builder').Configuration} */
module.exports = {
  afterPack: "./scripts/after-pack.cjs",
  appId: "app.liv",
  productName: "Liv",
  directories: {
    buildResources: "build",
  },
  files: [
    "!**/.vscode/*",
    "!src/*",
    "!scripts/*",
    "!electron.vite.config.{js,ts,mjs,cjs}",
    "!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}",
    "!{.env,.env.*,.npmrc,pnpm-lock.yaml}",
    "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",
    "!*.{js,cjs,mjs,ts}",
    "!components.json",
    "!.prettierrc",
    "!liv-rs/*",
  ],
  asarUnpack: [
    "resources/**",
    "node_modules/@egoist/electron-panel-window/**",
    "node_modules/bindings/**",
    "node_modules/file-uri-to-path/**",
    "node_modules/sqlite3/**",
  ],
  extraResources: [
    {
      from: "node_modules/sqlite3",
      to: "app.asar.unpacked/node_modules/sqlite3",
      filter: ["**/*"],
    },
  ],
  win: {
    executableName: "liv",
  },
  nsis: {
    artifactName: "${name}-${version}-setup.${ext}",
    shortcutName: "${productName}",
    uninstallDisplayName: "${productName}",
    createDesktopShortcut: "always",
  },
  mac: {
    binaries: [
      `resources/bin/liv-rs${process.platform === "darwin" ? "" : ".exe"}`,
    ],
    artifactName: "${productName}-${version}-${arch}.${ext}",
    entitlementsInherit: "build/entitlements.mac.plist",
    extendInfo: [
      {
        NSCameraUsageDescription:
          "Application requests access to the device's camera.",
      },
      {
        NSMicrophoneUsageDescription:
          "Application requests access to the device's microphone.",
      },
      {
        NSDocumentsFolderUsageDescription:
          "Application requests access to the user's Documents folder.",
      },
      {
        NSDownloadsFolderUsageDescription:
          "Application requests access to the user's Downloads folder.",
      },
      {
        NSScreenCaptureDescription:
          "Application requests access to screen recording for auto-journal context capture.",
      },
    ],
    notarize: process.env.APPLE_TEAM_ID
      ? {
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
  },
  dmg: {
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  linux: {
    target: ["AppImage", "snap", "deb"],
    maintainer: "electronjs.org",
    category: "Utility",
  },
  appImage: {
    artifactName: "${name}-${version}.${ext}",
  },
  npmRebuild: true,
  publish: {
    provider: "github",
    owner: "liv-app",
    repo: "liv",
  },
  removePackageScripts: true,
}
