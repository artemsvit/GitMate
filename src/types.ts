export interface RepoSummary {
  name: string;
  path: string;
  currentBranch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  stagedCount: number;
  unstagedCount: number;
  tracking?: string | null;
  remotes: { name: string; fetchUrl?: string; pushUrl?: string; pushUrls: string[]; hasEmbeddedCredentials: boolean }[];
  sync?: { pullRemote?: string; pullBranch?: string; pushRemote?: string; pushBranch?: string };
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
  // Linked worktrees of this repository (main repositories only). A missing one has no summary fields beyond path and name.
  worktrees?: WorktreeSummary[];
  // Set when this summary describes a linked worktree.
  worktree?: Worktree;
}

export interface Worktree { path: string; head: string | null; branch: string | null; detached: boolean; bare: boolean; locked: string | null; prunable: string | null; main: boolean }
export type WorktreeSummary = RepoSummary & { worktree: Worktree; missing?: boolean };
export interface Stash { ref: string; hash: string; date: number; subject: string }

export interface FileChange {
  path: string;
  indexStatus: string;
  workingDirStatus: string;
  isStaged: boolean;
  isUnstaged: boolean;
  originalPath?: string;
}

export interface RepoDetails extends RepoSummary {
  files: FileChange[];
  branches: {
    all: string[];
    current: string;
    local: string[];
    remote: string[];
  };
  recentCommits: {
    hash: string;
    message: string;
    author_name: string;
    date: string;
  }[];
  pending?: 'merge' | 'cherry-pick' | 'revert' | null;
  worktreeList?: Worktree[];
  stashes?: Stash[];
}
// Result of a repository action: what happened, and the refreshed details.
export interface ActionResult { result: { ok?: boolean; message?: string; needsConfirmation?: boolean; conflict?: string } & Record<string, any>; updated: RepoDetails }

export interface LocalAIStatus {
  available: boolean;
  provider: 'embedded' | 'ollama' | 'lmstudio' | 'none';
  endpoint: string;
  models: string[];
  activeModel: string;
  mode?: 'embedded' | 'external';
  hasExternal?: boolean;
  externalProvider?: 'ollama' | 'lmstudio' | 'none';
  externalEndpoint?: string;
  externalModels?: string[];
  externalActiveModel?: string;
  externalSources?: { provider: 'ollama' | 'lmstudio'; endpoint: string; models: string[] }[];
}

export interface AICommitResult {
  message: string;
  source: 'embedded' | 'local-ai' | 'smart-heuristic';
  provider: string;
  model: string;
}

export interface ProviderAccount {
  connected: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  instanceUrl?: string;
  authMethod?: 'token' | 'gh_cli' | 'ssh';
  sshKeySynced?: boolean;
  lastChecked?: string;
}

export interface ProvidersStatus {
  github: ProviderAccount;
  gitlab: ProviderAccount;
  gitea: ProviderAccount;
}
