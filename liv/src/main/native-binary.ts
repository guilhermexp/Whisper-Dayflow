import path from "path"

export const LIV_RS_BINARY_PATH = path
  .join(
    __dirname,
    `../../resources/bin/liv-rs${process.env.IS_MAC ? "" : ".exe"}`,
  )
  .replace("app.asar", "app.asar.unpacked")
