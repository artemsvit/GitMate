const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.dock && app.dock.hide();

app.whenReady().then(async () => {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 540px;
        height: 380px;
        background: #ffffff;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%);
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 26px 24px 22px;
        overflow: hidden;
        user-select: none;
        position: relative;
        border: 1px solid rgba(0, 0, 0, 0.06);
      }
      .bg-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 460px;
        height: 280px;
        background: radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, rgba(124, 58, 237, 0.03) 40%, transparent 70%);
        pointer-events: none;
      }
      .drop-target-left, .drop-target-right {
        position: absolute;
        top: 190px;
        transform: translate(-50%, -50%);
        width: 144px;
        height: 144px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.7);
        border: 1.5px dashed rgba(168, 85, 247, 0.25);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        pointer-events: none;
      }
      .drop-target-left { left: 130px; }
      .drop-target-right { left: 410px; }
      .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        z-index: 10;
      }
      .brand-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .logo-box {
        width: 26px;
        height: 26px;
        border-radius: 7px;
        background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 10px rgba(124, 58, 237, 0.35);
      }
      .logo-svg {
        width: 15px;
        height: 15px;
      }
      .brand-name {
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #0f172a;
      }
      .version-tag {
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
        border: 1px solid rgba(124, 58, 237, 0.22);
        padding: 2px 7px;
        border-radius: 50px;
      }
      .subtitle {
        font-size: 11px;
        color: #64748b;
        font-weight: 500;
      }
      .arrow-container {
        position: absolute;
        top: 190px;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        z-index: 10;
      }
      .arrow-svg {
        width: 84px;
        height: 40px;
        filter: drop-shadow(0 2px 10px rgba(124, 58, 237, 0.3));
      }
      .drag-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
        padding: 2px 8px;
        border-radius: 20px;
        border: 1px solid rgba(124, 58, 237, 0.2);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .footer {
        font-size: 10px;
        color: #94a3b8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
        letter-spacing: 0.06em;
        z-index: 10;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow"></div>
    <div class="drop-target-left"></div>
    <div class="drop-target-right"></div>

    <div class="header">
      <div class="brand-row">
        <div class="logo-box">
          <svg class="logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="4 17 10 11 4 5" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="19" x2="20" y2="19" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="brand-name">Gitler</span>
        <span class="version-tag">v1.0.0</span>
      </div>
      <div class="subtitle">Drag Gitler into Applications folder to install</div>
    </div>

    <div class="arrow-container">
      <svg class="arrow-svg" viewBox="0 0 84 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="84" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#a855f7"/>
            <stop offset="100%" stop-color="#7c3aed"/>
          </linearGradient>
        </defs>
        <path d="M6 20H72" stroke="url(#arrowGrad)" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M56 8L74 20L56 32" stroke="url(#arrowGrad)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="drag-label">DRAG TO INSTALL</span>
    </div>

    <div class="footer">GITLER • NATIVE ON-DEVICE GIT CLIENT FOR MACOS</div>
  </body>
  </html>
  `;

  // Render 1x (540x380)
  const win = new BrowserWindow({
    width: 540,
    height: 380,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: true }
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  await new Promise(r => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../build/background.png'), image.toPNG());

  // Render 2x (1080x760)
  const win2x = new BrowserWindow({
    width: 1080,
    height: 760,
    show: false,
    frame: false,
    webPreferences: { offscreen: true }
  });

  const html2x = htmlContent
    .replace('width: 540px;', 'width: 1080px;')
    .replace('height: 380px;', 'height: 760px;')
    .replace('padding: 26px 24px 22px;', 'padding: 52px 48px 44px;')
    .replace('width: 144px;\n        height: 144px;\n        border-radius: 28px;', 'width: 288px;\n        height: 288px;\n        border-radius: 56px;')
    .replace('left: 130px;', 'left: 260px;')
    .replace('left: 410px;', 'left: 820px;')
    .replace('top: 190px;', 'top: 380px;')
    .replace('top: 190px;', 'top: 380px;')
    .replace('width: 26px;\n        height: 26px;\n        border-radius: 7px;', 'width: 52px;\n        height: 52px;\n        border-radius: 14px;')
    .replace('width: 15px;\n        height: 15px;', 'width: 30px;\n        height: 30px;')
    .replace('font-size: 17px;', 'font-size: 34px;')
    .replace('font-size: 10px;', 'font-size: 20px;')
    .replace('font-size: 11px;', 'font-size: 22px;')
    .replace('width: 84px;\n        height: 40px;', 'width: 168px;\n        height: 80px;')
    .replace('stroke-width="3.5"', 'stroke-width="7"')
    .replace('stroke-width="3.5"', 'stroke-width="7"')
    .replace('font-size: 9px;', 'font-size: 18px;')
    .replace('padding: 2px 8px;', 'padding: 4px 16px;')
    .replace('font-size: 10px;', 'font-size: 20px;');

  await win2x.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html2x));
  await new Promise(r => setTimeout(r, 400));
  const image2x = await win2x.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../build/background@2x.png'), image2x.toPNG());

  console.log('DMG light background generated successfully!');
  app.quit();
});
