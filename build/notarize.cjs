const { notarize } = require("@electron/notarize");
const path = require("path");
const fs = require("fs");

// Load .env.local if it exists
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const match = line.match(/^([^=]+)="?([^"]*)"?$/);
      if (match) process.env[match[1]] = match[2];
    });
}

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  // Skip notarization if credentials are not set (e.g. local dev builds)
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log("Skipping notarization — APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not set.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log("Notarization complete.");
};
