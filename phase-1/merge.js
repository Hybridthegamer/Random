// Shared by the browser (app.js) and the sync API (api/sync.js).
//
// A doc is { version, entries[], standings[], usedDrafts[] }. Every entry and
// standings snapshot carries `updatedAt`; deletes are kept as tombstones
// ({ deleted: true }) so a delete on one device beats a stale copy on another.

// `calls` is the model scorecard: one record per market (id = market slug), capped to the newest MAX_CALLS.
export const blankDoc = () => ({ version: 2, entries: [], standings: [], usedDrafts: [], calls: [] });
const MAX_CALLS = 1500;

const stamp = x => Number(x.updatedAt) || Number(x.submittedAt) || Number(x.postedAt) || Number(x.at) || 0;

export function normaliseDoc(d) {
  const b = blankDoc();
  if (!d || typeof d !== "object") return b;
  b.entries = (Array.isArray(d.entries) ? d.entries : [])
    .filter(e => e && typeof e.id === "string")
    .map(e => ({ ...e, updatedAt: stamp(e) }));
  b.standings = (Array.isArray(d.standings) ? d.standings : [])
    .filter(s => s && Number(s.at))
    .map(s => ({ ...s, at: Number(s.at), updatedAt: stamp(s) }));
  b.usedDrafts = (Array.isArray(d.usedDrafts) ? d.usedDrafts : []).filter(x => typeof x === "string");
  b.calls = (Array.isArray(d.calls) ? d.calls : [])
    .filter(c => c && typeof c.id === "string" && Number(c.at))
    .map(c => ({ ...c, updatedAt: stamp(c) }));
  return b;
}

// Newest `updatedAt` wins per key; on a tie a tombstone wins, so deletes stick.
function mergeBy(a, b, key) {
  const out = new Map();
  for (const x of [...a, ...b]) {
    const k = key(x);
    const cur = out.get(k);
    if (!cur || x.updatedAt > cur.updatedAt || (x.updatedAt === cur.updatedAt && x.deleted && !cur.deleted)) out.set(k, x);
  }
  return [...out.values()];
}

export function mergeDocs(a, b) {
  a = normaliseDoc(a);
  b = normaliseDoc(b);
  return {
    version: 2,
    entries: mergeBy(a.entries, b.entries, x => x.id),
    standings: mergeBy(a.standings, b.standings, x => String(x.at)),
    usedDrafts: [...new Set([...a.usedDrafts, ...b.usedDrafts])],
    calls: mergeBy(a.calls, b.calls, x => x.id).sort((x, y) => x.at - y.at).slice(-MAX_CALLS),
  };
}
