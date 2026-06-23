const { notarize } = require('@electron/notarize');

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  const appleTeamId = process.env.APPLE_TEAM_ID || '4Y7KA339Z3';

  // Skip on CI-less local builds without creds
  const hasAppleIdCreds = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const hasApiKeyCreds = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
  if (!hasAppleIdCreds && !hasApiKeyCreds) {
    console.warn('[notarize] Skipping notarization, no Apple credentials found.');
    return;
  }

  console.log('[notarize] Submitting for notarization…');

  await notarize({
    appBundleId: 'com.photopti.app',
    appPath: `${appOutDir}/${appName}.app`,
    tool: hasApiKeyCreds ? 'notarytool' : 'altool',
    teamId: appleTeamId,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    key: process.env.APPLE_API_KEY,
    keyId: process.env.APPLE_API_KEY_ID,
    issuer: process.env.APPLE_API_ISSUER,
  });

  console.log('[notarize] Notarization complete.');
};
