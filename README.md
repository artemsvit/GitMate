# ⚡ Gitler

> **The Modern, Local-First Git Command Center & Multi-Repository Manager with AI Copilot**

[![Platform](https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon%20%7C%20Intel)-6e3ad6?style=flat-square&logo=apple)](https://github.com/artemsvit/Gitler)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Zero Telemetry](https://img.shields.io/badge/Privacy-100%25%20Local%20%26%20Private-10b981?style=flat-square)](https://github.com/artemsvit/Gitler)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

**Gitler** is a blazingly fast, privacy-first desktop application designed for developers who juggle dozens of local Git repositories across GitHub, Gitea, GitLab, and self-hosted servers. It combines deep working-tree inspection, native file staging, smart diff visualization, and an on-device AI Copilot into a unified 3-pane command center.

---

## ✨ Features at a Glance

### 📂 Multi-Repository Command Sidebar
* **Live Status Detection**: Instant badges for **Dirty** (uncommitted edits), **Ahead** (commits pending push), **Behind** (remote commits pending pull), and **Clean** states.
* **Filter Dropdown**: Quick drop list to isolate repositories by status (`ALL`, `DIRTY`, `AHEAD`, `BEHIND`, `CLEAN`).
* **Multi-Level Folder Discovery**: Scan arbitrary local directories (e.g. `~/Desktop`, `~/Projects`) up to 5 levels deep.
* **Smooth Draggable Panels**: Resizable left sidebar and right Copilot drawer with persistent width saving.

### 🤖 On-Device AI Copilot & Semantic Commit Studio
* **Conventional Commit Generation**: Analyzes staged diffs and drafts conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`) for review.
* **Dual-Engine Architecture**:
  * **Built-in Commit Suggestions**: Local, deterministic rules that draft messages from staged changes. No neural model is loaded.
  * **External Daemon (Ollama / LM Studio)**: Connects directly to local models (`llama3`, `qwen2.5-coder`, `mistral`) on `http://127.0.0.1:11434`.
* **Zero Telemetry**: No diffs, code tokens, or private credentials ever leave your machine.

### 🌐 Unified Git Providers & SSH Authorization
* **Dedicated Gitler SSH Key**: Generates a clean `ed25519 (gitler-app)` keypair (`~/.ssh/gitler_ed25519`) specifically for Gitler.
* **Gitea & Self-Hosted Ready**: 1-click **Copy Public Key** button to paste into your Gitea profile (**Settings → SSH / GPG Keys**), unlocking push/pull access across all your self-hosted repositories.
* **Live Host Connection Tester**: Test SSH reachability to any host (e.g., `192.168.0.102:222`) in real time.
* **GitHub & GitLab Integration**: Automatically detects macOS Keychain helpers (`osxkeychain`), SSH agent keys, and GitHub CLI authorization.

### ⚙️ Command Center & Global Preferences
* **Git Identity Manager**: View and edit global Git author settings (`user.name`, `user.email`, `init.defaultBranch`) in one place.
* **Warp-Inspired Visual Themes**: Switch seamlessly between **Obsidian Dark** and **Paper Light** themes with high-contrast alert design.
* **Top-Aligned Stable Windows**: Dialogs maintain a steady viewport position to eliminate jumping when toggling between settings tabs.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: v22.12.0 or later (Node 24 recommended)
* **npm**: v9.0.0 or later
* **Git**: System Git installed (`git --version`)

### Installation & Local Development

1. **Clone the repository:**
   ```bash
   git clone git@github.com:artemsvit/Gitler.git
   cd Gitler
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development environment:**
   ```bash
   npm run dev
   ```
   * Runs the Express Git backend on `http://localhost:3001`
   * Runs the Vite React frontend on `http://localhost:3000`
   * You can open `http://localhost:3000` in your browser or launch via Electron.

---

## 🛠️ Building & Packaging

### Production Build
Compile both the frontend bundle and backend CommonJS bundle (with runtime npm dependencies):
```bash
npm run build
```

### Build Native macOS App (`.app`)
Generates an unpacked macOS application bundle in `release/mac-arm64/Gitler.app`:
```bash
npm run dist:dir
```
*You can immediately launch and test the app with:*
```bash
open release/mac-arm64/Gitler.app
```

### Build macOS Installer (`.dmg`)
Generate a distributable Apple Silicon & Intel DMG installer:
```bash
npm run dist:mac
```
The output file will be generated in `release/Gitler-1.0.0-arm64.dmg`.

---

## 📁 Project Structure

```
Gitler/
├── electron/
│   ├── main.cjs               # Electron main process (lifecycle, window, autostart)
│   └── preload.cjs            # Secure context bridge
├── server/
│   ├── index.ts               # Express API server (REST endpoints)
│   ├── gitService.ts          # Simple-Git integration, SSH runner, diagnostics
│   ├── aiService.ts           # On-device semantic commit generator & Ollama bridge
│   └── scanner.ts             # Recursive repository filesystem discovery
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx        # Repository list, search, status filter dropdown
│   │   ├── MainWorkspace.tsx  # Central staged/unstaged changes, diff viewer, commit box
│   │   ├── AICopilotPanel.tsx # Right drawer AI Copilot & model inspector
│   │   ├── SettingsModal.tsx  # Unified Command Center (Providers, AI, Identity, Theme)
│   │   ├── RemoteAuthModal.tsx# Per-repo remote URL manager & protocol switcher
│   │   ├── DiffViewer.tsx     # High-contrast file diff inspector
│   │   └── StatusBar.tsx      # Bottom status, active branch, and AI status pill
│   ├── App.tsx                # App state orchestrator & 3-pane responsive layout
│   └── index.css              # Obsidian Dark & Paper Light styling with Tailwind v4
├── electron-builder.yml       # macOS packaging, hardened runtime, and DMG config
├── package.json               # Scripts, dependencies, and build directives
└── vite.config.ts             # Vite build & Tailwind plugin config
```

---

## 🔒 Privacy & Security First

* **No Telemetry**: Gitler does not collect usage analytics, crash reports, or diagnostic telemetry.
* **No Account Snooping**: Gitler does not inspect or expose personal work credentials, keys, or configurations from `~/.ssh`. Dedicated keys are created with the neutral `gitler-app` identifier.
* **Native Keychain**: Credentials leverage macOS's secure Keychain Access (`osxkeychain`) and native SSH agents.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

Developed with ❤️ by **Artem Svitelskyi**.

## Local checks and access

```sh
npm run check          # TypeScript and temporary Git fixture tests
npm run dev:desktop    # Build and launch Electron
npm run dist:dir       # Build a local macOS app without publishing
npm run verify:package # Check runtime files and updater in the packaged app
```

The API binds to `127.0.0.1`. The interface obtains a per-process session token, and API requests require it. Host and Origin checks reject unrelated websites. Repository operations accept only canonical paths found during an authorized scan. The development interface uses port 3000 and stops if that port is occupied.

Stage files before generating a message or committing. Partially staged files appear in both lists, with separate index and working-tree previews. Gitler leaves Git lock files in place. Untracked text previews stop at 256 KiB; binary files show a notice. External suggestions use the detected local Ollama or LM Studio endpoint and reject redirects.

Local packaging does not prove signing, notarization, or update delivery. Those checks require the release credentials and a published release.
