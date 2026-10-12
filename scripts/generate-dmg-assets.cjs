const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.dock && app.dock.hide();

app.whenReady().then(async () => {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
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
        padding: 36px 24px 28px;
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
        background: radial-gradient(circle, rgba(203, 176, 247, 0.12) 0%, transparent 70%);
        pointer-events: none;
      }
      .header {
        text-align: center;
        z-index: 10;
      }
      .title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #ffffff;
        margin-bottom: 4px;
      }
      .subtitle {
        font-size: 11px;
        color: #71717a;
        font-family: monospace;
      }
      .arrow-container {
        position: absolute;
        top: 175px;
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
        filter: drop-shadow(0 0 12px rgba(203, 176, 247, 0.5));
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
      <div class="title">Drag Gitler to Applications</div>
      <div class="subtitle">Install Gitler for macOS</div>
    </div>

    <div class="arrow-container">
      <svg class="arrow-svg" viewBox="0 0 72 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 18H62" stroke="#cbb0f7" stroke-width="3" stroke-linecap="round"/>
        <path d="M48 6L64 18L48 30" stroke="#cbb0f7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <div class="footer">GITLER v1.0.0 • APPLE SILICON &amp; INTEL UNIVERSAL</div>
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
  // Wait a moment for styles to apply
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

  const html2x = htmlContent.replace('width: 540px;', 'width: 1080px;').replace('height: 380px;', 'height: 760px;').replace('font-size: 15px;', 'font-size: 30px;').replace('font-size: 11px;', 'font-size: 22px;').replace('font-size: 10px;', 'font-size: 20px;').replace('top: 175px;', 'top: 350px;').replace('width: 72px;', 'width: 144px;').replace('height: 36px;', 'height: 72px;');
  await win2x.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html2x));
  await new Promise(r => setTimeout(r, 400));
  const image2x = await win2x.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../build/background@2x.png'), image2x.toPNG());

  console.log('DMG background generated successfully!');
  app.quit();
});
