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
  remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
}

export interface FileChange {
  path: string;
  indexStatus: string;
  workingDirStatus: string;
  isStaged: boolean;
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
}

export interface LocalAIStatus {
  available: boolean;
  provider: 'ollama' | 'lmstudio' | 'none';
  endpoint: string;
  models: string[];
  activeModel: string;
}

export interface AICommitResult {
  message: string;
  source: 'local-ai' | 'smart-heuristic';
  provider: string;
  model: string;
}
