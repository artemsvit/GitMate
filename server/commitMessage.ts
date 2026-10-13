// Shared commit-message instructions, diff preparation, and output cleanup for every model provider.

export const commitInstructions = `You write Git commit messages that follow Conventional Commits 1.0 and common Git best practice.

Header: <type>(<scope>): <description>
- type is one of:
  feat (new capability for users), fix (corrects wrong or broken behavior), refactor (code change with no behavior change),
  perf (faster or lighter), docs (documentation only), test (tests only), build (build system or dependencies),
  ci (CI configuration), style (formatting only, no logic change), chore (maintenance), revert.
- scope is one short lowercase noun for the affected area, such as a module, package, or directory.
  Omit the scope and its parentheses when the change spans unrelated areas.
- description uses the imperative mood ("add", not "added" or "adds"), starts lowercase, has no trailing period,
  and completes the sentence "If applied, this commit will ...". Aim for 50 characters; never exceed 72 for the whole header.
- Describe the effect of the change, not the files touched. Prefer "fix crash when remote has no branches"
  over "update gitService.ts".

Body (optional):
- Omit the body when the header fully explains a small change.
- Otherwise add one blank line after the header, then explain what changed and why: the problem, the motivation,
  or the user-visible effect. Do not narrate the code line by line.
- Use "- " bullets for several distinct changes, at most 4 bullets, or one short paragraph. Keep the body under 8 lines.
- Bullets describe behavior and effects. Do not start bullets with file names, and do not wrap identifiers in backticks.
- When a change makes existing behavior correct (a failure, wrong state, crash, or leak), the type is fix, even if new code was added.

Breaking changes: when the diff removes or incompatibly changes a public API, configuration, or command behavior,
add "!" before the colon and end with a footer "BREAKING CHANGE: <what users must do>".

Accuracy:
- State only what the diff shows. Never invent motivations, issue numbers, ticket links, test results, or file names.
- If the staged changes contain unrelated work, describe the main change in the header and list the rest in the body.
- If the request names a different header convention for this repository, follow it instead of the header rules above.

Write exactly one commit message. Output only that message text. No code fences, quotes, labels, or commentary.`;

const skippedFile = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|Gemfile\.lock|composer\.lock|poetry\.lock|uv\.lock|go\.sum|Podfile\.lock)$|\.min\.(?:js|css)$|\.map$|(?:^|\/)(?:dist|build|out|vendor)\//i;

export interface DiffFile { path: string; added: number; removed: number; binary: boolean; skipped: boolean; text: string }

export function splitDiff(diff: string): DiffFile[] {
  return diff.split(/^(?=diff --git )/m).filter(part => part.startsWith('diff --git ')).map(text => {
    const header = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    const target = header.match(/ b\/(.+)$/)?.[1] ?? header.replace(/^diff --git a\//, '');
    let added = 0, removed = 0;
    for (const line of text.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return { path: target, added, removed, binary: /^Binary files /m.test(text) || /^GIT binary patch/m.test(text), skipped: skippedFile.test(target), text };
  });
}

// Gives every file a fair share of the budget so one large file cannot hide the others.
export function prepareDiff(diff: string, budget = 24000) {
  const files = splitDiff(diff);
  const summary = files.map(file => `${file.path} (+${file.added} -${file.removed})${file.binary ? ' binary' : file.skipped ? ' generated or lock file, content omitted' : ''}`).join('\n');
  const readable = files.filter(file => !file.binary && !file.skipped);
  let remaining = Math.max(2000, budget - summary.length); let truncated = false; const parts: string[] = [];
  readable.forEach((file, index) => {
    const share = Math.floor(remaining / (readable.length - index));
    const text = file.text.length > share ? file.text.slice(0, share) + '\n[... rest of this file\'s diff omitted]' : file.text;
    if (file.text.length > share) truncated = true;
    parts.push(text); remaining -= Math.min(text.length, share);
  });
  if (!files.length && diff.trim()) parts.push(diff.slice(0, budget));
  return { summary, text: parts.join('\n'), truncated };
}

const conventional = /^(?:feat|fix|refactor|perf|docs|test|build|ci|style|chore|revert|release)(?:\([^)]*\))?!?: \S/i;
// A repository follows Conventional Commits when most of its recent subjects do; otherwise the model copies its plain style.
export function usesConventionalCommits(subjects: string[]) {
  const recent = subjects.filter(Boolean).filter(subject => !/^Merge /.test(subject)).slice(0, 8);
  return recent.length < 3 || recent.filter(subject => conventional.test(subject)).length * 2 >= recent.length;
}

export function buildCommitPrompt(options: { repoName: string; diff: string; changedFiles: string[]; recentSubjects?: string[]; budget?: number }) {
  const prepared = prepareDiff(options.diff, options.budget);
  const recent = (options.recentSubjects || []).filter(Boolean).slice(0, 8);
  return [
    `Repository: ${options.repoName}`,
    recent.length ? `Recent commit subjects in this repository. Use them only as style examples; they describe other changes, so never reuse their wording:\n${recent.map(subject => `- ${subject}`).join('\n')}` : '',
    usesConventionalCommits(recent) ? '' : 'Header convention for this repository: it does not use Conventional Commits. Write the header as one capitalized imperative sentence with no type, no scope, no colon, and no trailing period, like the recent subjects above.',
    `Staged files (+added -removed lines):\n${prepared.summary || options.changedFiles.join('\n')}`,
    `Staged diff${prepared.truncated ? ' (some long file diffs are shortened)' : ''}:\n${prepared.text}`,
    'Write the commit message for these staged changes.'
  ].filter(Boolean).join('\n\n');
}

function wrap(line: string, width = 72) {
  if (line.length <= width) return [line];
  const bullet = line.match(/^(\s*(?:[-*]|\d+\.)\s+)/)?.[1] || '';
  const indent = ' '.repeat(bullet.length); const words = line.slice(bullet.length).split(/\s+/);
  const lines: string[] = []; let current = bullet;
  for (const word of words) {
    const prefix = lines.length ? indent : bullet;
    if (current.length > prefix.length && (current + ' ' + word).length > width) { lines.push(current); current = indent + word; }
    else current = current.length > prefix.length ? `${current} ${word}` : prefix + word;
  }
  lines.push(current);
  return lines;
}

export function finalizeCommitMessage(raw: string) {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\r\n/g, '\n').trim();
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  text = text.replace(/^(?:commit message|message)\s*:\s*\n?/i, '').replace(/^["'`]+|["'`]+$/g, '').trim();
  const lines = text.split('\n').map(line => line.replace(/\s+$/, ''));
  const headerIndex = lines.findIndex(line => line.trim());
  if (headerIndex === -1) return '';
  let header = lines[headerIndex].trim().replace(/\.+$/, '');
  header = header.replace(/^(\w+)(?:\(([^)]*)\))?(!?):\s*/, (_m, type, scope, bang) => `${type.toLowerCase()}${scope ? `(${scope.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()})` : ''}${bang}: `)
    .replace(/^(\w+(?:\([^)]*\))?!?: )([A-Z])(?=[a-z])/, (_m, prefix, first) => prefix + first.toLowerCase());
  if (header.length > 72) {
    const cut = header.slice(0, 72);
    // Prefer ending at a clause boundary so the header stays a complete phrase.
    const clause = [...cut.matchAll(/,\s|\s(?:by|so|so that|when|while|because|to avoid|instead of|after|before|via|using)\s/gi)].map(match => match.index!).filter(index => index >= 25).pop();
    header = clause !== undefined ? cut.slice(0, clause) : cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 72);
    // Never end a shortened header on a connecting word such as "for" or "and".
    while (/\s(?:a|an|the|and|or|for|to|of|in|on|with|by|from|into|via|when|while|after|before|that)$/i.test(header)) header = header.replace(/\s+\S+$/, '');
    header = header.replace(/[\s,;:-]+$/, '');
  }
  // Keep only the first message when a model writes several.
  const rest = lines.slice(headerIndex + 1);
  const next = rest.findIndex((line, index) => index > 0 && !rest[index - 1].trim() && conventional.test(line.trim()));
  const body = (next === -1 ? rest : rest.slice(0, next)).join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  if (!body) return header;
  const wrapped = body.replace(/`([^`\n]+)`/g, '$1').split('\n').flatMap(line => /^\s*(?:BREAKING CHANGE|[\w-]+):\s/.test(line) && !/^\s*[-*]/.test(line) ? [line] : wrap(line));
  return `${header}\n\n${wrapped.join('\n')}`;
}
