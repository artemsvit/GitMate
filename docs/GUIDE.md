# Git Mate guide

Detailed behavior notes. For an overview, see the [README](../README.md).

## Local checks and access

```sh
npm run check          # TypeScript and temporary Git fixture tests
npm run dev:desktop    # Build and launch Electron
npm run dist:dir       # Build a local macOS app without publishing
npm run verify:package # Check runtime files and updater in the packaged app
```

The API binds to `127.0.0.1`. The interface obtains a per-process session token, and API requests require it. Host and Origin checks reject unrelated websites. Repository operations accept only canonical paths found during an authorized scan. The development interface uses port 3000 and stops if that port is occupied.

Stage files before generating a message or committing. Partially staged files appear in both lists, with separate index and working-tree previews. Git Mate leaves Git lock files in place. Untracked text previews stop at 256 KiB; binary files show a notice. External suggestions use the detected local Ollama or LM Studio endpoint and reject redirects.

Local packaging does not prove signing, notarization, or update delivery. Those checks require the release credentials and a published release.

## Check a provider connection

Open **Settings → Accounts** and use **Test connection** on a provider card. The result distinguishes server reachability from account access. This check does not upload keys or change repositories.

Local repositories work offline. Remote Git operations use the repository's fetch or push URL and its SSH key or HTTPS Git credentials. An account token verifies the provider API; it does not by itself configure Git authentication. Use **Remote → Test Connection** to verify repository read access. A successful read check does not prove push permission.

For local servers, macOS may ask for **Local Network** permission on the first connection. Allow Git Mate to reach your server. If access was denied, enable Git Mate in **System Settings → Privacy & Security → Local Network** and retry. Git Mate does not change the Mac's privacy settings or use a child process to bypass permission.

Provider requests verify TLS certificates and reject redirects to other origins before forwarding a token. Packaged executables use a stable app-specific UUID to support macOS permission tracking.

For GitLab, create a fine-grained personal access token. Under **Add resource permissions → User**, choose the **User** resource and **Read** permission. Git Mate uses `GET /api/v4/user` to verify your account. A token limited to project or repository access can fail this check with `insufficient_granular_scope`. Grant repository permissions separately for the projects you want to fetch or push; SSH-key management also requires its own permissions.

## Sync and working-tree previews

Git Mate opens maximized. Choose **Sync remote** before fetching or pulling, and choose a single **Push destination** before pushing. A remote can have a fetch URL and several push URLs on different servers; these are shown separately. Pull follows the selected remote and uses a fast-forward, so it does not silently merge diverged history.

**Commit Changes** saves a commit locally. **Commit & Push** then publishes to the selected destination. Git Mate reads that remote branch back and compares its commit with the local commit before reporting a verified push. A rejected push leaves the local commit intact.

Connected provider tokens are supplied privately to Git through a credential helper. Existing Git helpers remain available as fallback. The interface hides legacy credentials embedded in URLs. Use **Authorize** with a replacement token to verify the account and remove credentials from the selected server's remote URLs. Revoke any token that has appeared in a screenshot or shared log.

Selecting a changed PNG, JPEG, GIF, WebP, SVG, ICO, or BMP shows its image preview. Staged previews read the Git index; working-tree previews read the current file. **Show diff** switches back to text. SVG files are loaded as images, without inserting their markup into the application. Previews are limited to 10 MiB and stay inside the selected repository.

## Copilot chat and interface controls

Copilot has separate **Commit** and **Chat** tabs. Commit suggestions use the selected on-device model when it is downloaded and supported, following Conventional Commits or the plain style the repository already uses. Without the model, Git Mate suggests a header from built-in rules and lists the changed files. Chat requires macOS 14 or newer; Git features retain macOS 12 support.

In **Settings → AI Models**, choose the AI source. **Git Mate Local AI** runs a downloaded model on this Mac: Qwen3.5 0.8B (0.5 GB, needs 4 GB memory), Qwen3.5 2B (1.3 GB, needs 8 GB), Qwen3.5 4B (2.7 GB, needs 8 GB), Qwen3.5 9B (5.7 GB, needs 16 GB, up to a 32K-token context), or Qwen3.6 27B (16.8 GB, needs 32 GB). Git Mate suggests a model based on memory and preserves your saved choice. You can download, pause, switch, and delete models there.

**LM Studio / Ollama** uses a model already running on this Mac (ports 1234 and 11434); cloud-hosted Ollama models are not listed, so code stays on this Mac.

The AI Copilot title shows the model in use. Git Mate removes the earlier Qwen3-4B file after the new download finishes. Download progress, cancellation, resume, and checksum verification are built in. The model is stored under `~/.gitmate/models` and survives app updates.

Chat can review changes, explain a commit, and summarize repository code. It reads the selected repository by default. Add other scanned repositories explicitly through the context selector. Context sources and truncation are shown with replies. Chat cannot edit files, run commands, commit, or push. Conversations are saved per repository under `~/.gitmate/conversations`; use New chat or Delete chat to manage them.

Settings → Appearance includes 80%, 90%, 100%, 110%, and 125% interface zoom. Cmd− and Cmd+ change the level; Cmd0 returns to 100%. The setting is saved across launches. The Appearance & App section shows the update status and a switch for automatic downloads. **Check for Updates…** (also in the Git Mate menu and the Dock menu) opens the update window with release notes, Skip This Version, Remind Me Later, and Install Update.

## Push to several destinations

**Fetch / pull from** chooses one remote. **Push to** selects one or more destinations and saves the selection per repository. Workspace Push and Copilot Commit & Push use the same destinations. A commit is created only once, then its exact SHA is pushed and verified separately at each selected destination. Repeated URLs are deduplicated. A failure does not stop the other pushes. **Retry failed destinations** retries the same commit and rejects the retry if local HEAD changed. Changed or removed remote URLs require reselection. Git Mate never force pushes automatically.

## Stable release process

The package version drives application labels, installer artwork, and landing download links. Stable release tags must match it. The release workflow builds Apple Silicon artifacts, requires signing and notarization credentials, signs nested native code, staples the app before archiving, notarizes and staples the DMG, and verifies the app inside both formats. Final metadata, blockmaps, and SHA-256 checksums are generated after stapling.

CI creates new releases as **drafts**. When rebuilding an existing release, it preserves that release's draft or public status. Before publishing it as Latest, download and compare every asset, test Gatekeeper installation, and verify updating the existing installed version through a temporary feed serving those exact artifacts. Failed notarization or updater verification blocks publication. Manual workflow runs require an existing version tag. Notarization submission results and logs are preserved as CI artifacts.

If a release-tooling fix is needed after tagging, dispatch the release workflow with the unchanged application tag and an explicit `tooling_ref` commit. Only finalization and distribution validation scripts come from that commit. Application code, dependencies, signing, and tests use the selected source ref, which defaults to the tag. Record both commits in the release notes.

To rebuild an existing release with a source fix, dispatch the workflow with its existing `tag` and the full commit SHA as `source_ref`. The package version must still match the tag. The workflow replaces the release files only after signing, notarization, and distribution validation pass. This does not move the tag or create a new version. Users already on that version must reinstall to receive the rebuilt app; automatic updates require a newer version.

The desktop runtime is pinned to Electron 43.7.9 to retain macOS 12 support. Packaging checks the actual Mach-O deployment targets of the executable and Electron framework; a runtime requiring a newer system stops the build. The Copilot native model runtime requires macOS 14 and is loaded only when Chat is supported.

## Public repository hygiene

Keep account tokens, private SSH keys, signing certificates, passwords, local app data, and private screenshots outside the repository. Credential templates must contain examples only. Review `git diff --cached` before committing; ignore rules do not remove files that are already staged or tracked.

The Secret scan workflow checks Git history on pushes and pull requests with a checksum-verified Gitleaks release. Findings are redacted. Release credentials are supplied only to the steps that need them; dependency installation and ordinary builds do not receive Apple secrets.

To avoid publishing your personal email in future commits, copy your exact GitHub noreply address from **GitHub Settings → Emails** and use it as the author and committer email. This does not change old commits. Removing personal data from existing history needs a separate plan because it changes commit IDs and can affect release tags and other clones.

If a real credential is exposed, revoke or rotate it first. Deleting the file or adding an ignore rule does not invalidate the credential or remove historical copies. Follow [GitHub’s sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
