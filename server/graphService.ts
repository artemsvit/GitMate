import { simpleGit } from 'simple-git';

export interface GraphRef { name: string; type: 'head' | 'branch' | 'remote' | 'tag' }
export interface GraphCommit { hash: string; parents: string[]; author: string; email: string; date: number; subject: string; refs: GraphRef[] }
const field = '\x1f'; const record = '\x1e';
const hashPattern = /^[0-9a-f]{7,40}$/i;

// "HEAD -> main, origin/main, tag: v1.0" → typed refs. The remote's symbolic HEAD is noise in a graph.
export function parseRefs(decoration: string, remotes: string[]): GraphRef[] {
  const refs: GraphRef[] = [];
  for (const raw of decoration.split(',').map(part => part.trim()).filter(Boolean)) {
    if (raw.startsWith('tag: ')) refs.push({ name: raw.slice(5), type: 'tag' });
    else if (raw.startsWith('HEAD -> ')) { refs.push({ name: 'HEAD', type: 'head' }); refs.push({ name: raw.slice(8), type: 'branch' }); }
    else if (raw === 'HEAD') refs.push({ name: 'HEAD', type: 'head' });
    else if (remotes.some(remote => raw.startsWith(remote + '/'))) { if (!raw.endsWith('/HEAD')) refs.push({ name: raw, type: 'remote' }); }
    else refs.push({ name: raw, type: 'branch' });
  }
  return refs;
}

export async function getGraph(repoPath: string, options: { limit?: number; skip?: number; branch?: string } = {}) {
  const git = simpleGit(repoPath);
  const limit = Math.min(Math.max(Number(options.limit) || 300, 1), 1000); const skip = Math.max(Number(options.skip) || 0, 0);
  const remotes = (await git.raw(['remote'])).split('\n').filter(Boolean);
  // Full names avoid the short form of refs/remotes/origin/HEAD, which is just "origin".
  const refs = (await git.raw(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'])).split('\n').filter(name => name && !name.endsWith('/HEAD'));
  const local = refs.filter(name => name.startsWith('refs/heads/')).map(name => name.slice('refs/heads/'.length));
  const branches = refs.map(name => name.replace(/^refs\/(?:heads|remotes)\//, ''));
  let head: string | null = null;
  try { head = (await git.raw(['rev-parse', 'HEAD'])).trim(); } catch {}
  if (options.branch && !branches.includes(options.branch)) throw new Error('Unknown branch.');
  // Without a branch filter the graph shows local branches, remote branches, tags, and HEAD, but not stashes.
  const range = options.branch ? ['--end-of-options', options.branch] : ['--branches', '--remotes', '--tags', ...(head ? ['HEAD'] : [])];
  if (!head && !branches.length) return { commits: [], branches, local, head, hasMore: false };
  const output = await git.raw(['log', '--date-order', `--max-count=${limit + 1}`, `--skip=${skip}`, `--format=%H${field}%P${field}%an${field}%ae${field}%at${field}%s${field}%D${record}`, ...range]);
  const commits: GraphCommit[] = output.split(record).map(entry => entry.replace(/^\n/, '')).filter(Boolean).map(entry => {
    const [hash, parents, author, email, date, subject, decoration] = entry.split(field);
    return { hash, parents: parents ? parents.split(' ') : [], author, email, date: Number(date), subject, refs: parseRefs(decoration || '', remotes) };
  });
  return { commits: commits.slice(0, limit), branches, local, head, hasMore: commits.length > limit };
}

export async function getCommitDetails(repoPath: string, hash: string) {
  if (!hashPattern.test(hash)) throw new Error('Invalid commit identifier.');
  const git = simpleGit(repoPath);
  const [meta] = (await git.raw(['log', '-1', `--format=%H${field}%P${field}%an${field}%ae${field}%at${field}%cn${field}%ct${field}%B`, '--end-of-options', hash])).split(record);
  const [full, parents, author, email, date, committer, committed, ...body] = meta.split(field);
  // Merges are compared with their first parent, which matches what the merge brought into the branch.
  const numstat = await git.raw(['show', '--format=', '--numstat', '-M', '--diff-merges=first-parent', '--end-of-options', full]);
  const files = numstat.split('\n').filter(Boolean).map(line => {
    const [added, removed, ...name] = line.split('\t');
    const path = name.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/^.* => /, '');
    return { path, added: added === '-' ? null : Number(added), removed: removed === '-' ? null : Number(removed) };
  });
  return { hash: full, parents: parents ? parents.split(' ') : [], author, email, date: Number(date), committer, committed: Number(committed), message: body.join(field).trim(), files };
}

export async function getCommitFileDiff(repoPath: string, hash: string, file: string) {
  const details = await getCommitDetails(repoPath, hash);
  if (!details.files.some(entry => entry.path === file)) throw new Error('That file is not part of this commit.');
  return simpleGit(repoPath).raw(['--literal-pathspecs', 'show', '--format=', '-M', '--diff-merges=first-parent', '--end-of-options', details.hash, '--', file]);
}
