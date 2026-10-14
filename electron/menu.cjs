// Standard macOS menus. Commands go to the window as "menu-command" messages; the zoom keys are handled in zoom.cjs,
// so their menu items only display the shortcut (registerAccelerator: false) and do not trigger twice.
function installMenu(app, Menu, checkForUpdates, send = () => {}) {
  const updateItem = { label: 'Check for Updates…', click: () => { checkForUpdates(); } };
  const command = (label, accelerator, name) => ({ label, accelerator, click: () => send(name) });
  const shown = (label, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => {} });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // The package name is lowercase, so the product name is set explicitly on these labels.
    { label: 'Git Mate', submenu: [
      { role: 'about', label: 'About Git Mate' }, updateItem, { type: 'separator' },
      command('Settings…', 'Command+,', 'settings'), { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide', label: 'Hide Git Mate' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { role: 'quit', label: 'Quit Git Mate' }
    ] },
    { label: 'File', submenu: [
      command('Open Folder…', 'Command+O', 'open-folder'),
      command('Rescan Repositories', 'Command+R', 'rescan'),
      { type: 'separator' }, { role: 'close' }
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' },
      command('Find Repository', 'Command+F', 'find')
    ] },
    { label: 'View', submenu: [
      command('Changes', 'Command+1', 'tab-changes'), command('History', 'Command+2', 'tab-history'),
      command('Remotes', 'Command+3', 'tab-branches'), command('Graph', 'Command+4', 'tab-graph'),
      { type: 'separator' }, command('Show or Hide AI Copilot', 'Alt+Command+C', 'toggle-copilot'),
      { type: 'separator' }, shown('Zoom In', 'Command+Plus'), shown('Zoom Out', 'Command+-'), shown('Actual Size', 'Command+0'),
      { type: 'separator' }, { role: 'togglefullscreen' }
    ] },
    { role: 'windowMenu' }
  ]));
  app.dock?.setMenu(Menu.buildFromTemplate([updateItem]));
}
module.exports = { installMenu };
