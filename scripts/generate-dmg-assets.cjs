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
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%);
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 30px 24px 22px;
        overflow: hidden;
        user-select: none;
        position: relative;
      }
      .bg-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 480px;
        height: 300px;
        background: radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.08) 0%, rgba(124, 58, 237, 0.02) 45%, transparent 70%);
        pointer-events: none;
      }
      .slot-glow-left, .slot-glow-right {
        position: absolute;
        top: 195px;
        transform: translate(-50%, -50%);
        width: 120px;
        height: 120px;
        border-radius: 28px;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(241, 245, 249, 0.4) 60%, transparent 80%);
        pointer-events: none;
      }
      .slot-glow-left { left: 130px; }
      .slot-glow-right { left: 410px; }
      .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 7px;
        z-index: 10;
      }
      .brand-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .logo-img {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
      }
      .brand-name {
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -0.025em;
        color: #0f172a;
      }
      .version-tag {
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
        border: 1px solid rgba(124, 58, 237, 0.2);
        padding: 2px 8px;
        border-radius: 50px;
      }
      .subtitle {
        font-size: 12px;
        color: #64748b;
        font-weight: 500;
        letter-spacing: -0.01em;
      }
      .arrow-container {
        position: absolute;
        top: 195px;
        left: 270px;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 10;
      }
      .arrow-svg {
        width: 82px;
        height: 32px;
        filter: drop-shadow(0 2px 8px rgba(124, 58, 237, 0.22));
      }
      .drag-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
        padding: 3px 10px;
        border-radius: 20px;
        border: 1px solid rgba(124, 58, 237, 0.18);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .footer {
        font-size: 10px;
        color: #94a3b8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
        letter-spacing: 0.08em;
        z-index: 10;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow"></div>
    <div class="slot-glow-left"></div>
    <div class="slot-glow-right"></div>

    <div class="header">
      <div class="brand-row">
        <img class="logo-img" src="data:image/png;base64,${iconBase64}" alt="Git Mate" />
        <span class="brand-name">Git Mate</span>
        <span class="version-tag">v${require('../package.json').version}</span>
      </div>
      <div class="subtitle">Drag Git Mate into Applications folder to install</div>
    </div>

    <div class="arrow-container">
      <svg class="arrow-svg" viewBox="0 0 84 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="84" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#a855f7"/>
            <stop offset="100%" stop-color="#7c3aed"/>
          </linearGradient>
        </defs>
        <path d="M6 16H72" stroke="url(#arrowGrad)" stroke-width="3" stroke-linecap="round"/>
        <path d="M58 6L74 16L58 26" stroke="url(#arrowGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="drag-label">DRAG TO INSTALL</span>
    </div>

    <div class="footer">GITLER • LOCAL GIT CLIENT FOR MACOS</div>
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
  const bgTiffPath = path.join(__dirname, '../build/background.tiff');

  fs.writeFileSync(bgPath, image1x.toPNG());
  fs.writeFileSync(bg2xPath, image2x.toPNG());

  // Compile multi-resolution TIFF for Finder Retina support
  const { execSync } = require('child_process');
  try {
    execSync(`tiffutil -cathidpicheck "${bgPath}" "${bg2xPath}" -out "${bgTiffPath}"`);
    console.log(`Generated multi-resolution background.tiff`);
  } catch (err) {
    console.warn('Could not run tiffutil:', err.message);
  }

  console.log(`Generated DMG background: 1x (${image1x.getSize().width}x${image1x.getSize().height}) and 2x (${image2x.getSize().width}x${image2x.getSize().height})`);
  app.quit();
});
