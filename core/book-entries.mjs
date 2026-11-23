const line = (v, max = Infinity) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const identity = (v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
const keysOf = (v) => [...new Set(list(v).map((x) => line(x)).filter(Boolean))];

export function bookEntries(book, bookName) {
  if (!object(book) || !book.entries || typeof book.entries !== 'object') return [];
  const embedded = Array.isArray(book.entries);
  const out = [];
  for (const [id, e] of Object.entries(book.entries)) {
    if (!object(e) || e.disable === true || e.enabled === false) continue;
    const uid = embedded ? e.id ?? id : e.uid ?? id;
    if (!identity(uid)) continue;
    const keys = keysOf([...(list(e.key ?? e.keys)), ...(list(e.keysecondary ?? e.secondary_keys))]);
    const title = line(e.comment) || line(e.name) || keys[0] || '';
    const content = typeof e.content === 'string' ? e.content : '';
    if (!title && !content) continue;
    out.push({ book: line(bookName) || line(book.name), uid, title, keys, content });
  }
  return out;
}
