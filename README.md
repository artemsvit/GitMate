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
The output file will be generated in `release/Gitler-1.1.0-arm64.dmg`.

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

## Check a provider connection

Open **Command Center & Settings → Git Providers & Auth** and use **Test connection** on a provider card. The result distinguishes server reachability from account access. This check does not upload keys or change repositories.

Local repositories work offline. Remote Git operations use the repository's fetch or push URL and its SSH key or HTTPS Git credentials. An account token verifies the provider API; it does not by itself configure Git authentication. Use **Remote → Test Connection** to verify repository read access. A successful read check does not prove push permission.

For local servers, macOS may ask for **Local Network** permission on the first connection. Allow Gitler to reach your server. If access was denied, enable Gitler in **System Settings → Privacy & Security → Local Network** and retry. Gitler does not change the Mac's privacy settings or use a child process to bypass permission.

Provider requests verify TLS certificates and reject redirects to other origins before forwarding a token. Packaged executables use a stable app-specific UUID to support macOS permission tracking.

## Sync and working-tree previews

Gitler opens maximized. Choose **Sync remote** before fetching or pulling, and choose a single **Push destination** before pushing. A remote can have a fetch URL and several push URLs on different servers; these are shown separately. Pull follows the selected remote and uses a fast-forward, so it does not silently merge diverged history.

**Commit Changes** saves a commit locally. **Commit & Push** then publishes to the selected destination. Gitler reads that remote branch back and compares its commit with the local commit before reporting a verified push. A rejected push leaves the local commit intact.

Connected provider tokens are supplied privately to Git through a credential helper. Existing Git helpers remain available as fallback. The interface hides legacy credentials embedded in URLs. Use **Authorize** with a replacement token to verify the account and remove credentials from the selected server's remote URLs. Revoke any token that has appeared in a screenshot or shared log.

Selecting a changed PNG, JPEG, GIF, WebP, SVG, ICO, or BMP shows its image preview. Staged previews read the Git index; working-tree previews read the current file. **Show diff** switches back to text. SVG files are loaded as images, without inserting their markup into the application. Previews are limited to 10 MiB and stay inside the selected repository.


### Copilot chat and interface controls

Copilot has separate **Commit** and **Chat** tabs. Commit suggestions work without a model download. Chat requires macOS 14 or newer; Git features retain macOS 12 support. Chat uses Qwen3-4B Q4_K_M locally after a one-time 2.5 GB download. Download progress, cancellation, resume, and checksum verification are built in. The model is stored under `~/.gitler/models` and survives app updates.

Chat can review changes, explain a commit, and summarize repository code. It reads the selected repository by default. Add other scanned repositories explicitly through the context selector. Context sources and truncation are shown with replies. Chat cannot edit files, run commands, commit, or push. Conversations are saved per repository under `~/.gitler/conversations`; use New chat or Delete chat to manage them.

Settings → Appearance includes 80%, 90%, 100%, 110%, and 125% interface zoom. Cmd− and Cmd+ change the level; Cmd0 returns to 100%. The setting is saved across launches. Application updates in the same Appearance tab provide Check for Updates, Download Update, and Restart & Install.

### Push to several destinations

**Fetch / pull from** chooses one remote. **Push to** selects one or more destinations and saves the selection per repository. Workspace Push and Copilot Commit & Push use the same destinations. A commit is created only once, then its exact SHA is pushed and verified separately at each selected destination. Repeated URLs are deduplicated. A failure does not stop the other pushes. **Retry failed destinations** retries the same commit and rejects the retry if local HEAD changed. Changed or removed remote URLs require reselection. Gitler never force pushes automatically.

### Stable release process

The package version drives application labels, installer artwork, and landing download links. Stable release tags must match it. The release workflow builds Apple Silicon artifacts, requires signing and notarization credentials, signs nested native code, staples the app before archiving, notarizes and staples the DMG, and verifies the app inside both formats. Final metadata, blockmaps, and SHA-256 checksums are generated after stapling.

CI uploads a **draft** release. Before publishing it as Latest, download and compare every asset, test Gatekeeper installation, and verify updating the existing installed version through a temporary feed serving those exact artifacts. Failed notarization or updater verification blocks publication. Manual workflow runs require an existing version tag. Notarization submission results and logs are preserved as CI artifacts.

If a release-tooling fix is needed after tagging, dispatch the release workflow with the unchanged application tag and an explicit `tooling_ref` commit. Only finalization and distribution validation scripts come from that commit. Application code, dependencies, signing, and tests still use the tagged source. Record both commits in the release notes.

The desktop runtime is pinned to Electron 43.7.9 to retain macOS 12 support. Packaging checks the actual Mach-O deployment targets of the executable and Electron framework; a runtime requiring a newer system stops the build. The Copilot native model runtime requires macOS 14 and is loaded only when Chat is supported.
