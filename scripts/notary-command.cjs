const { execFileSync } = require('node:child_process');
module.exports = argumentsList => {
  const credentials = ['--apple-id', process.env.APPLE_ID, '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', process.env.APPLE_TEAM_ID];
  try { return execFileSync('xcrun', ['notarytool', ...argumentsList, ...credentials], { encoding: 'utf8', timeout: 1800000 }); }
  catch { throw new Error('Apple notarization command failed. Check the configured credentials and Apple service status. No release was published.'); }
};
