# Git Mate — Packaging, Embedded AI & GitHub Release Strategy

This document outlines the architecture for embedding on-device AI models into Git Mate, building and packaging native macOS `.app` and `.dmg` installers, Apple Notarization, Sparkle auto-updates, and the GitHub release strategy.

---

## 1. Embedded AI Architecture

### The Trade-off: Model Size vs. App Footprint
- Full 8B models (like `qwen2.5:8b` or Gemma 4 MLX) range from **4.5 GB to 8.5 GB** in file size. Embedding an 8GB model directly into the installer `.dmg` makes downloads heavy for first-time users.
- **The Ideal Hybrid Desktop Architecture**:
  1. **Built-in Compact Model (~350MB – 800MB)**:
     - Bundle `Qwen2.5-Coder-0.5B-Instruct-Q4_K_M.gguf` (~390 MB) or `1.5B-Instruct-Q4_K_M.gguf` (~980 MB) directly inside the `.app` bundle (`Contents/Resources/models/`).
     - Uses `llama.cpp` or `node-llama-cpp` compiled for Apple Silicon Metal GPU acceleration.
     - **Result**: Git Mate works 100% offline out-of-the-box with zero setup, zero dependencies, and instant inference for commit generation.
  2. **Host Daemon Auto-Discovery (Ollama / MLX)**:
     - Git Mate automatically checks `http://127.0.0.1:11434` (Ollama) and `http://127.0.0.1:1234` (LM Studio).
     - If the user has larger models installed (e.g. `qwen3.5:0.8b-mlx`, `qwen2.5:7b-instruct`, `gemma2:2b`), Git Mate uses them seamlessly for higher reasoning depth.
  3. **On-Demand 1-Click Downloader**:
     - Users can choose to download larger 7B/8B models directly inside Git Mate's Settings modal, storing weights in `~/Library/Application Support/Gitler/models/`.

---

## 2. Native macOS Packaging (`.app` & `.dmg`)

Git Mate is configured with **Electron** and **Electron-Builder**:
- **Output**: Native macOS universal / Apple Silicon `.app` and a drag-and-drop `.dmg` installer.
- **Vibrancy**: macOS native translucent background (`vibrancy: 'under-window'`).
- **Unified Titlebar**: Traffic lights integrated into the top bar (`titleBarStyle: 'hiddenInset'`).
- **Configuration**: Located in [`electron-builder.yml`](file:///Users/asvit/Desktop/Gitler/electron-builder.yml).

### Build Commands:
```bash
# 1. Build frontend & backend
npm run build

# 2. Package into macOS .app and .dmg
npx electron-builder --mac dmg --publish never
```
Output files will be generated in `release/`:
- `release/Gitler-1.0.0-arm64.dmg`
- `release/Gitler-1.0.0-arm64-mac.zip`

---

## 3. Apple Notarization & Code Signing

To distribute Git Mate outside the Mac App Store without Gatekeeper warnings (*"Git Mate cannot be opened because Apple cannot check it for malicious software"*), Apple Developer ID signing and Notarization are required.

### Required GitHub Secrets:
Add these secrets in **GitHub Repository Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions**:

| Secret Name | Description | Where to find |
| :--- | :--- | :--- |
| `APPLE_ID` | Your Apple Developer email address | Apple ID account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (format: `xxxx-xxxx-xxxx-xxxx`) | [appleid.apple.com](https://appleid.apple.com) $\rightarrow$ Sign-In and Security |
| `APPLE_TEAM_ID` | 10-character Team ID | [developer.apple.com/account](https://developer.apple.com/account) |
| `APPLE_CERTIFICATE` | Base64-encoded `Developer ID Application.p12` certificate | Export from macOS Keychain Access |
| `APPLE_CERTIFICATE_PASSWORD` | Password protecting the exported `.p12` file | Password you set during export |

The release workflow ([`.github/workflows/release.yml`](file:///Users/asvit/Desktop/Gitler/.github/workflows/release.yml)) automatically handles:
- Creating a temporary keychain on the GitHub runner.
- Codesigning with hardened runtime enabled (`--options runtime`).
- Submitting the `.dmg` to Apple's `notarytool` notary service.
- Stapling the notarization ticket to the `.dmg` file (`xcrun stapler staple`).

---

## 4. Sparkle & Auto-Update Mechanism

Git Mate is configured with **`electron-updater`**, which follows the Sparkle protocol:
- Every time a GitHub Release is published with a new tag (e.g. `v1.0.1`), GitHub Actions uploads:
  - `Git Mate-x.x.x-arm64.dmg`
  - `Git Mate-x.x.x-arm64-mac.zip`
  - `latest-mac.yml` (Sparkle manifest with SHA512 hashes and release notes)
- When the user launches Git Mate, it queries `latest-mac.yml` on GitHub in the background.
- If a new version is detected, it downloads the delta update and prompts the user: *"New version available — Restart to install"*.

---

## 5. Promotional Landing Page

A promotional landing page is built in [`landing/`](file:///Users/asvit/Desktop/Gitler/landing/):
- **Live Local Preview**: Open **[http://localhost:3001/landing](http://localhost:3001/landing)** in your browser right now!
- **Features Highlighted**:
  - Hero header with Warp Dev Tools design system.
  - Interactive live app mockup reproducing Git Mate's 3-pane interface and commit generator.
  - Download `.dmg` call-to-action button and Homebrew tap command.
  - Privacy guarantee (100% offline, zero cloud telemetry).
- **Free Hosting Options**:
  - **GitHub Pages**: Can be served from the `landing/` directory or a `gh-pages` branch.
  - **Cloudflare Pages / Vercel**: Connect the repository and set the root directory to `landing`.

---

## 6. GitHub Repository Setup & Release Flow

To initialize and publish Git Mate to GitHub:

```bash
# 1. Add your GitHub remote repository (replace with your repo URL):
git remote add origin https://github.com/artemsvitelskyi/Gitler.git

# 2. Push the master branch to GitHub:
git push -u origin master

# 3. Trigger your first release:
git tag v1.0.0
git push origin v1.0.0
```

Once pushed, GitHub Actions will:
1. Trigger `.github/workflows/release.yml`.
2. Compile and package Git Mate into `Git Mate-1.0.0-arm64.dmg`.
3. Sign and notarize with Apple.
4. Publish the GitHub Release with direct download links and release notes.
