function installMenu(app, Menu, checkForUpdates) {
  const updateItem = { label: 'Check for Updates…', click: () => { checkForUpdates(); } };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // The package name is lowercase, so the product name is set explicitly on these labels.
    { label: 'Git Mate', submenu: [
      { role: 'about', label: 'About Git Mate' }, updateItem, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide', label: 'Hide Git Mate' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { role: 'quit', label: 'Quit Git Mate' }
    ] },
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));
  app.dock?.setMenu(Menu.buildFromTemplate([updateItem]));
}
module.exports = { installMenu };
