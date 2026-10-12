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
        background: #09090b;
        color: #faf9f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 28px 24px 24px;
        overflow: hidden;
        user-select: none;
        position: relative;
      }
      .bg-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 380px;
        height: 220px;
        background: radial-gradient(circle, rgba(192, 132, 252, 0.14) 0%, transparent 70%);
        pointer-events: none;
      }
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
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: #18181b;
        border: 1px solid rgba(255, 255, 255, 0.14);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }
      .logo-svg {
        width: 14px;
        height: 14px;
      }
      .brand-name {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #ffffff;
      }
      .version-tag {
        font-size: 10px;
        font-family: monospace;
        color: #c084fc;
        background: #18181b;
        border: 1px solid rgba(192, 132, 252, 0.3);
        padding: 2px 7px;
        border-radius: 50px;
      }
      .subtitle {
        font-size: 11px;
        color: #71717a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .arrow-container {
        position: absolute;
        top: 190px;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }
      .arrow-svg {
        width: 72px;
        height: 36px;
        filter: drop-shadow(0 0 12px rgba(192, 132, 252, 0.5));
      }
      .footer {
        font-size: 10px;
        color: #52525b;
        font-family: monospace;
        letter-spacing: 0.05em;
        z-index: 10;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow"></div>
    <div class="header">
      <div class="brand-row">
        <div class="logo-box">
          <svg class="logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="4 17 10 11 4 5" stroke="#c084fc" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="12" y1="19" x2="20" y2="19" stroke="#c084fc" stroke-width="2.3" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="brand-name">Gitler</span>
        <span class="version-tag">v1.0.0</span>
      </div>
      <div class="subtitle">Drag Gitler into Applications folder to install</div>
    </div>

    <div class="arrow-container">
      <svg class="arrow-svg" viewBox="0 0 72 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 18H62" stroke="#c084fc" stroke-width="3" stroke-linecap="round"/>
        <path d="M48 6L64 18L48 30" stroke="#c084fc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <div class="footer">GITLER • NATIVE APPLE SILICON &amp; INTEL MACOS</div>
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
    .replace('padding: 28px 24px 24px;', 'padding: 56px 48px 48px;')
    .replace('width: 24px;\n        height: 24px;', 'width: 48px;\n        height: 48px;')
    .replace('width: 14px;\n        height: 14px;', 'width: 28px;\n        height: 28px;')
    .replace('font-size: 16px;', 'font-size: 32px;')
    .replace('font-size: 10px;', 'font-size: 20px;')
    .replace('font-size: 11px;', 'font-size: 22px;')
    .replace('top: 190px;', 'top: 380px;')
    .replace('width: 72px;', 'width: 144px;')
    .replace('height: 36px;', 'height: 72px;')
    .replace('stroke-width="3"', 'stroke-width="6"');

  await win2x.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html2x));
  await new Promise(r => setTimeout(r, 400));
  const image2x = await win2x.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../build/background@2x.png'), image2x.toPNG());

  console.log('DMG background generated successfully with consistent UI branding!');
  app.quit();
});
