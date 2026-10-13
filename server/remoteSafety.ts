export function redactRemote(value: string): string {
  return value.replace(/(https?:\/\/)[^/@\s]+@/gi, '$1')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)\b/g, '[token hidden]');
}
export function shellQuote(value: string): string { return "'" + value.replace(/'/g, "'\\''") + "'"; }
