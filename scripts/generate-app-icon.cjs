const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
        width: 1024px;
        height: 1024px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .app-squircle {
        position: relative;
        width: 824px;
        height: 824px;
        border-radius: 185px;
        background: linear-gradient(180deg, #1c1c20 0%, #0d0d10 100%);
        border: 3px solid rgba(255, 255, 255, 0.12);
        box-shadow:
          0 32px 64px -16px rgba(0, 0, 0, 0.75),
          0 16px 32px -8px rgba(0, 0, 0, 0.5),
          inset 0 1px 2px rgba(255, 255, 255, 0.2),
          inset 0 -2px 4px rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      /* One wide, soft glow with a gradual falloff; two stacked glows made the center look muddy. */
      .inner-glow {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 760px;
        height: 760px;
        background: radial-gradient(circle, rgba(192, 132, 252, 0.16) 0%, rgba(192, 132, 252, 0.09) 28%, rgba(168, 85, 247, 0.04) 50%, transparent 70%);
        pointer-events: none;
      }
      .terminal-svg {
        position: relative;
        width: 540px;
        height: 540px;
        z-index: 2;
        filter: drop-shadow(0 0 36px rgba(192, 132, 252, 0.22));
      }
    </style>
  </head>
  <body>
    <div class="app-squircle">
      <div class="inner-glow"></div>
      <svg class="terminal-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="violetGradient" x1="4" y1="5" x2="20" y2="19" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#E9D5FF"/>
            <stop offset="50%" stop-color="#C084FC"/>
            <stop offset="100%" stop-color="#A855F7"/>
          </linearGradient>
        </defs>
        <polyline points="4 17 10 11 4 5" stroke="url(#violetGradient)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="19" x2="20" y2="19" stroke="url(#violetGradient)" stroke-width="2.3" stroke-linecap="round"/>
      </svg>
    </div>
  </body>
  </html>
  `;

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  await new Promise(resolve => setTimeout(resolve, 800));

  const image = await win.webContents.capturePage();
  const buildDir = path.join(__dirname, '../build');
  const masterPngPath = path.join(buildDir, 'icon.png');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  fs.writeFileSync(masterPngPath, image.toPNG());
  console.log('Master icon generated at:', masterPngPath);

  // Copy to public, landing, dist
  const targets = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../landing/icon.png'),
    path.join(__dirname, '../dist/icon.png')
  ];
  for (const t of targets) {
    fs.copyFileSync(masterPngPath, t);
    console.log('Copied icon to:', t);
  }

  // Generate icon.iconset and icon.icns for macOS
  const iconsetDir = path.join(buildDir, 'icon.iconset');
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });

  const iconSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 }
  ];

  for (const item of iconSizes) {
    const dest = path.join(iconsetDir, item.name);
    execSync(`sips -z ${item.size} ${item.size} "${masterPngPath}" --out "${dest}"`, { stdio: 'ignore' });
  }

  const icnsPath = path.join(buildDir, 'icon.icns');
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });
  console.log('Successfully compiled Apple ICNS icon at:', icnsPath);

  // Clean up iconset directory
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  app.quit();
});
