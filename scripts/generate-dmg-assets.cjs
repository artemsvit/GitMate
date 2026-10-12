const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.dock && app.dock.hide();

app.whenReady().then(async () => {
  const iconPath = path.join(__dirname, '../build/icon.png');
  const iconBase64 = fs.readFileSync(iconPath).toString('base64');

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
        padding: 26px 24px 20px;
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
        width: 114px;
        height: 114px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.65);
        border: 1.5px dashed rgba(168, 85, 247, 0.3);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
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
        gap: 9px;
      }
      .logo-img {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.18));
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
        left: 270px;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        z-index: 10;
      }
      .arrow-svg {
        width: 76px;
        height: 36px;
        filter: drop-shadow(0 2px 8px rgba(124, 58, 237, 0.25));
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
        <img class="logo-img" src="data:image/png;base64,${iconBase64}" alt="Gitler" />
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

  // Render in offscreen window
  const win = new BrowserWindow({
    width: 540,
    height: 380,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: true }
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  await new Promise(r => setTimeout(r, 600));
  const rawImage = await win.webContents.capturePage();
  const rawSize = rawImage.getSize();

  // Ensure exact pixel sizes: 1x = 540x380, 2x = 1080x760
  let image1x;
  let image2x;

  if (rawSize.width === 1080) {
    image2x = rawImage;
    image1x = rawImage.resize({ width: 540, height: 380, quality: 'best' });
  } else if (rawSize.width === 540) {
    image1x = rawImage;
    image2x = rawImage.resize({ width: 1080, height: 760, quality: 'best' });
  } else {
    image1x = rawImage.resize({ width: 540, height: 380, quality: 'best' });
    image2x = rawImage.resize({ width: 1080, height: 760, quality: 'best' });
  }

  const bgPath = path.join(__dirname, '../build/background.png');
  const bg2xPath = path.join(__dirname, '../build/background@2x.png');

  fs.writeFileSync(bgPath, image1x.toPNG());
  fs.writeFileSync(bg2xPath, image2x.toPNG());

  console.log(`Generated DMG background: 1x (${image1x.getSize().width}x${image1x.getSize().height}) and 2x (${image2x.getSize().width}x${image2x.getSize().height})`);
  app.quit();
});
