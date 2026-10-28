import { normName } from './stop-names.mjs';

export const SUGGEST_MIN = 3;

const BOUND = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;

function patternOf(name) {
  const n = normName(name);
  const BS = String.fromCharCode(92);
  const word = (w) => [...w].map((c) => ('.*+?^${}()|[]'.includes(c) ? BS + c : c)).join('') + (/^[а-я]{5,}$/.test(w) ? '[а-я]{0,3}' : '');
  const esc = n.split(' ').map(word).join(BS + 's+');
  const tail = '';
  return new RegExp(`${BOUND}${esc}${tail}${END}`, 'iu');
}

function namesOf(student, shared) {
  return [...new Set([student.name, ...(student.aliases || [])].map(normName).filter((n) => n.length >= 3 && !shared.has(n)))];
}

export function findExtended(data, entries) {
  const all = (data && data.students && data.students.students) || [];
  const count = new Map();
  for (const p of all) for (const n of new Set([p.name, p.short, ...(p.aliases || [])].map(normName))) count.set(n, (count.get(n) || 0) + 1);
  const staff = (data && data.staff) || {};
  for (const p of [...(staff.teachers || []), ...(staff.staff || [])]) for (const n of new Set([p.name, p.short, ...(p.aliases || [])].map(normName))) count.set(n, (count.get(n) || 0) + 1);
  const shared = new Set([...count].filter(([, c]) => c > 1).map(([n]) => n));
  const texts = (Array.isArray(entries) ? entries : []).map((e) => ({
    head: normName([e && e.title, ...((e && e.keys) || [])].join(' ')),
    body: normName(e && e.content),
  }));
  const found = [];
  for (const p of all.filter((s) => s.roster === 'extended')) {
    const names = namesOf(p, shared);
    const hits = new Set();
    let strong = false;
    for (const n of names) {
      const re = patternOf(n);
      if (texts.some((t) => re.test(t.head) || re.test(t.body))) {
        hits.add(n);
        if (n.includes(' ')) strong = true;
      }
    }
    if (strong || hits.size >= 2) found.push({ id: p.id, name: p.name });
  }
  return { found, count: found.length, suggest: found.length >= SUGGEST_MIN };
}
