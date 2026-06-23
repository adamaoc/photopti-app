const path = require("path");
const { notarize } = require("@electron/notarize");

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const hasAppleIdCredentials = Boolean(
    process.env.APPLE_ID &&
      process.env.APPLE_APP_SPECIFIC_PASSWORD &&
      process.env.APPLE_TEAM_ID
  );
  const hasApiKeyCredentials = Boolean(
    process.env.APPLE_API_KEY &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER
  );

  if (!hasAppleIdCredentials && !hasApiKeyCredentials) {
    console.warn("[notarize] Skipping notarization: credentials are not configured.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const credentials = hasApiKeyCredentials
    ? {
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      }
    : {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      };

  console.log("[notarize] Submitting for notarization…");
  await notarize({
    appBundleId: "com.adamaoc.photopti",
    appPath: path.join(appOutDir, `${appName}.app`),
    ...credentials,
  });
  console.log("[notarize] Notarization complete.");
};
