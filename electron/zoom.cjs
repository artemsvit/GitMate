const fs = require('node:fs');
const path = require('node:path');
const levels = [80, 90, 100, 110, 125];
function installZoom(app, ipcMain, checkSender, getWindow) {
  const file = path.join(app.getPath('userData'), 'appearance.json');
  let zoom = 100;
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')).zoom; if (levels.includes(value)) zoom = value; } catch {}
  const apply = value => {
    if (!levels.includes(value)) throw new Error('Unsupported interface zoom.');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify({ zoom: value }), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    zoom = value; const window = getWindow(); window?.webContents.setZoomFactor(value / 100); window?.webContents.send('zoom-changed', value); return value;
  };
  ipcMain.handle('get-zoom', event => { checkSender(event); return zoom; });
  ipcMain.handle('set-zoom', (event, value) => { checkSender(event); return apply(value); });
  return window => {
    window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(zoom / 100));
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.meta || input.control)) return;
      const key = input.key.toLowerCase();
      if (!['+', '=', '-', '0'].includes(key)) return;
      event.preventDefault(); const index = levels.indexOf(zoom);
      apply(key === '0' ? 100 : levels[Math.max(0, Math.min(levels.length - 1, index + (key === '-' ? -1 : 1)))]);
    });
  };
}
module.exports = { levels, installZoom };
