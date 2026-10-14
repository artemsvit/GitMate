const fs = require('node:fs');
const path = require('node:path');

// Moves the app data folder from the earlier "gitler" name once.
// Electron creates the new folder before this code runs, so "already has data" is judged by content, not by existence.
function migrateUserData(appData, current) {
  const previous = path.join(appData, 'gitler');
  if (current === previous || !fs.existsSync(previous)) return false;
  const hasData = ['Local Storage', 'appearance.json', 'updates.json'].some(name => fs.existsSync(path.join(current, name)));
  if (hasData) return false;
  const startup = `${current}.startup-${process.pid}`;
  if (fs.existsSync(current)) fs.renameSync(current, startup);
  try { fs.renameSync(previous, current); }
  catch (error) { if (fs.existsSync(startup)) fs.renameSync(startup, current); throw error; }
  fs.rmSync(startup, { recursive: true, force: true });
  return true;
}
module.exports = { migrateUserData };
