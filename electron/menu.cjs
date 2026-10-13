function installMenu(app, Menu, checkForUpdates) {
  const updateItem = { label: 'Check for Updates…', click: () => { checkForUpdates(); } };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: 'about' }, updateItem, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { role: 'quit' }
    ] },
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));
  app.dock?.setMenu(Menu.buildFromTemplate([updateItem]));
}
module.exports = { installMenu };
