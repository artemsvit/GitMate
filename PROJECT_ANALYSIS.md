# Git Mate project analysis

Reviewed on 12 October 2026. Source: [artemsvit/GitMate](https://github.com/artemsvit/GitMate).

## Setup completed

- Local checkout: `/Users/artsvit/Develop/Gitler`.
- Branch: `master`. Commit: `3063fa8cff9698291865053e5a49faf4fc42f936`.
- Full Git history fetched: 33 commits. All advertised branches and tags fetched. The remote currently has one branch and no tags. No submodules or Git LFS configuration were found.
- Installed project dependencies with Node 26.7.0 and npm 11.19.0.
- The original `npm ci` failed because the lockfile omitted Electron, electron-builder, electron-updater, and their dependency trees. `npm install` repaired `package-lock.json` without changing dependency declarations. A subsequent `npm ci --ignore-scripts --dry-run` passed.
- npm withheld dependency install scripts. Electron's official installer downloaded its archive, but extraction did not finish correctly in this environment. The downloaded archive was extracted with system `unzip`, and the package's executable path was recorded. `electron --version` now returns `v33.4.11`.
- Built frontend assets in `dist/` and the backend in `server/index.cjs`. These outputs and `node_modules/` are ignored by Git.
- No application source was changed. The lockfile repair and this report remain local and uncommitted.

## What the project does

Git Mate is a macOS-focused Electron Git client. It discovers local repositories, displays changes and history, stages files, commits, switches branches, and runs fetch, pull, and push. It also manages remote URLs, SSH diagnostics, a dedicated SSH key, global Git identity, and suggested commit messages.

| Layer | Main files | Responsibility |
| --- | --- | --- |
| Desktop shell | `electron/main.cjs`, `electron/preload.cjs` | Window, folder picker, backend startup, updater |
| Interface | `src/App.tsx`, `src/components/` | Repository sidebar, workspace, diffs, settings, Copilot |
| HTTP API | `server/index.ts` | Express routes and production static files |
| Git operations | `server/gitService.ts` | simple-git, SSH, Git config |
| Discovery | `server/scanner.ts` | Recursive folder traversal with ignored folders |
| Commit suggestions | `server/aiService.ts` | String-based heuristics and optional Ollama/LM Studio requests |
| Release | `electron-builder.yml`, `.github/workflows/release.yml` | macOS installers, signing, notarization, GitHub releases |

React 19, TypeScript 7, Vite 8, Tailwind 4, Express 5, and simple-git 4 are installed. Electron 33 and electron-builder 25 form the desktop toolchain. There is one package manifest for the frontend, backend, and packaging tools.

The default “Embedded Neural Engine” is a deterministic heuristic implementation. It uses string checks and regular expressions; it does not load a neural model or parse an abstract syntax tree. External model support probes local Ollama and LM Studio services.

## Verification

| Check | Result |
| --- | --- |
| `npm ls --depth=0` | Pass; declared top-level dependencies installed |
| Lockfile consistency dry run | Pass after repair |
| `npm run build` | Pass; Vite and esbuild |
| `tsc --noEmit` | Fail; seven errors listed below |
| Electron executable | Pass; version 33.4.11 |
| HTTP smoke checks | Pass; frontend, repository details, scan, AI status returned 200 |
| Browser check | Interface loaded Git Mate, branch, changed lockfile, and diff |
| Git fixtures | Confirmed count errors, partial staging visibility issue, blank untracked diff, lock deletion |
| React Doctor | 40/100; 1 error and 115 warnings; automated findings require individual review |
| npm audit | 18 affected packages: 1 critical, 13 high, 4 moderate |
| `git diff --check` | Pass |

The HTTP smoke server was forced to `127.0.0.1:43001` through a temporary harness. This does not change the application's normal binding. Temporary Git fixtures were removed after checks. No real repositories were staged, committed, pulled, or pushed by these checks.

Native application startup, packaged `.app` execution, signed installers, updater delivery, remote writes, and external model generation were not verified. There is no test script or dedicated automated test suite in the checkout.

## Findings, in priority order

### 1. High: API exposes local Git and system operations without access checks

`server/index.ts:39` enables unrestricted CORS. `server/index.ts:442` calls `listen` without a loopback host. No authentication, Origin validation, or repository allowlist protects operations. HTTP checks confirmed `Access-Control-Allow-Origin: *` for an arbitrary supplied Origin.

The API accepts arbitrary repository paths and exposes commits, pushes, branch changes, SSH-key regeneration, and global Git config updates. Bind explicitly to loopback, validate Host and Origin, add a per-session authorization token, and restrict repository paths. LAN access also depends on the host firewall and network. Browser access depends on browser network protections; CORS itself currently permits it.

### 2. High: shell interpolation allows command injection

`server/gitService.ts:584-590` inserts Git identity values into shell commands and escapes only double quotes. Shell substitutions and backticks remain active. `server/gitService.ts:604` inserts an unvalidated host into an SSH shell command. `server/index.ts:79-81` builds a shell command with a supplied folder path inside a single-quoted AppleScript argument.

These are high-confidence source findings; no injection payload was executed. Replace shell strings with `execFile` or `spawn` and argument arrays. Validate host names, port ranges, and request types.

### 3. High: read operations delete potentially active Git locks

`server/gitService.ts:48-54` deletes `.git/index.lock` after only 10 seconds. `getGit` runs this even before reading repository status. A temporary fixture confirmed that reading a summary removed a 30-second-old lock.

A running Git operation can own a lock for longer than 10 seconds. Removing it allows conflicting writes. Stop automatic lock deletion; report the lock and require a separate, informed recovery action.

### 4. High: dependency audit findings need desktop-toolchain updates

The local npm audit identifies 18 affected packages. `tar` is marked critical, and Electron plus packaging dependencies carry high findings. The production-dependency-only audit reports zero, but Electron is classified as a development dependency despite being the desktop runtime. Audit suggests major upgrades to Electron 44.7.0 and electron-builder 26.15.3. These are registry recommendations, not validated migration choices.

Upgrade deliberately, then test startup, packaging, signing, notarization, and updating. Audit counts include transitive dependency chains and do not mean 18 independently exploitable application defects. No forced dependency upgrade was applied.

### 5. Medium: partially staged changes and file counts are wrong

`server/gitService.ts:108-109` double-counts staged new files and excludes unstaged edits when the same file is also staged. `getRepoDetails` merges both states into one record with `isStaged: true`; `src/components/MainWorkspace.tsx:344-345` then excludes that record from the unstaged list.

Fixture: one staged new file, one file with staged and unstaged edits, and one untracked file. Expected counts: two staged and two unstaged paths. Actual counts: three staged and one unstaged. Represent index and working-tree changes independently using Git's status records.

### 6. Medium: untracked files have no preview

`server/gitService.ts:241-251` uses `git diff` for all previews. Git does not include untracked content in ordinary diffs. A temporary untracked text file returned an empty diff. The commit-suggestion route can also report “no changes detected” when only untracked files exist.

Add bounded, binary-aware untracked previews with validated paths. Keep staged commit suggestions separate from unrelated working-tree content.

### 7. Medium: the build bypasses seven TypeScript errors

Vite and esbuild transpile without running the TypeScript checker. Current errors:

- `server/aiService.ts:150,173`: model can be undefined.
- `server/gitService.ts:77`: `spawnOptions.env` is outside the supported type.
- `server/gitService.ts:456`: invalid `pushUrl` and `fetchUrl` properties, two errors.
- `src/components/Sidebar.tsx:242`: a click event is passed to a callback expecting a folder path.
- `src/main.tsx:4`: missing CSS import declaration.

The Finder click issue can pass a MouseEvent as the default path and break the browser fallback. Add a typecheck script and run it in CI before packaging.

The SSH configuration error also has a runtime consequence: the installed simple-git implementation only accepts `uid` and `gid` from `spawnOptions`, so this code's `env` is discarded. The dedicated Git Mate key selection is therefore not applied through this path. Its documented environment API also has guards for `GIT_SSH_COMMAND`; use the supported configuration and verify the selected key with a controlled SSH fixture.

### 8. Medium: API-supplied AI endpoint can send code away from the device

`server/aiService.ts:110` accepts a request-supplied endpoint and posts diff content to it when an external engine is detected. This weakens the README's strict local-only privacy claim. Restrict endpoints to explicitly trusted local destinations and enforce that boundary on the server.

### 9. Medium: default panels crowd the main workspace

The browser inspection at roughly 980 pixels wide showed a 420-pixel sidebar and 380-pixel Copilot leaving a very narrow workspace. Toolbar controls and the diff were clipped. The native window minimum is 960 pixels, so this width is within the intended desktop range, although native behavior was not tested.

Use a minimum workspace width and collapse secondary panels when needed. React Doctor also reports missing labels and keyboard interactions. These findings need a focused accessibility review before counting them as confirmed defects.

### 10. Maintenance and release gaps

- `npm run dev` starts the API and Vite but does not launch Electron. Vite is configured for port 3000; README says 5173. Electron dev mode assumes port 3000, while Vite may choose another port if it is occupied.
- Both TypeScript and CommonJS Electron entry files exist. Only `main.cjs` and `preload.cjs` are selected by the current entrypoint; their TypeScript counterparts differ.
- `preload.cjs` exposes `checkUpdates`, but the active main process has no matching IPC handler.
- `electron-updater` is declared as a development dependency. Packaged dependency pruning may omit it and silently disable updating because the require failure is caught. Packaging must verify its presence.
- Release CI runs `npm ci`, so the original committed lockfile blocks it. It also lacks typechecking and behavioral tests.
- The README describes a standalone backend executable, but the build produces a CommonJS bundle with external dependencies.
- Scan summaries use unbounded `Promise.all`, while each repository starts multiple Git commands. Large-directory behavior needs measurement before performance claims.

## Recommended next work

1. Protect API access and remove shell injection paths and automatic lock deletion.
2. Correct Git state handling and add fixture tests for partial staging, new files, renames, conflicts, and empty repositories.
3. Resolve TypeScript errors and add typechecking and tests to CI.
4. Update the Electron toolchain and validate the complete macOS release flow.
5. Improve panel sizing, accessibility, and commit-suggestion accuracy.

## Local development

```sh
cd /Users/artsvit/Develop/Gitler
npm run dev
```

Vite normally serves the interface on `http://localhost:3000`; the API uses port 3001. The security findings above describe the current development and production backend behavior.
