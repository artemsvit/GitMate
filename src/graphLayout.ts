// Assigns each commit a lane and the line segments to draw, in the style of Git Graph.
// Lanes are reused when they free up, so a lane that passes through a row keeps its column.
export interface LayoutInput { hash: string; parents: string[] }
export interface Segment { from: number; to: number; color: number; half: 'top' | 'bottom' | 'full' }
export interface LayoutRow { lane: number; color: number; segments: Segment[]; width: number }

export function layoutGraph(commits: LayoutInput[]): { rows: LayoutRow[]; lanes: number } {
  const lanes: (string | null)[] = []; const colors: number[] = [];
  let nextColor = 0; let maxLanes = 0;
  const free = (except = -1) => { const index = lanes.findIndex((value, i) => value === null && i !== except); return index === -1 ? lanes.length : index; };
  const rows = commits.map(commit => {
    const segments: Segment[] = [];
    let lane = lanes.indexOf(commit.hash); const continued = lane !== -1;
    if (!continued) { lane = free(); lanes[lane] = commit.hash; colors[lane] = nextColor++; }
    const color = colors[lane];
    // Lines entering from above: this commit's lane, other lanes that waited for it (merge targets), and lanes passing by.
    lanes.forEach((value, index) => {
      if (value === null) return;
      if (index === lane) { if (continued) segments.push({ from: index, to: lane, color: colors[index], half: 'top' }); }
      else if (value === commit.hash) { segments.push({ from: index, to: lane, color: colors[index], half: 'top' }); lanes[index] = null; }
      else segments.push({ from: index, to: index, color: colors[index], half: 'full' });
    });
    // Lines leaving below: the first parent continues this lane; other parents join an existing lane or open a new one.
    if (!commit.parents.length) lanes[lane] = null;
    commit.parents.forEach((parent, position) => {
      let target: number;
      // The first parent always continues this lane; if another lane also waits for it, the lines meet at the parent's row.
      if (position === 0) { target = lane; lanes[lane] = parent; }
      else {
        target = lanes.indexOf(parent);
        if (target === -1) { target = free(lane); lanes[target] = parent; colors[target] = nextColor++; }
      }
      segments.push({ from: lane, to: target, color: position === 0 ? color : colors[target], half: 'bottom' });
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    const width = Math.max(lane + 1, ...segments.map(segment => Math.max(segment.from, segment.to) + 1));
    maxLanes = Math.max(maxLanes, width);
    return { lane, color, segments, width };
  });
  return { rows, lanes: maxLanes };
}
