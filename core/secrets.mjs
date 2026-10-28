export const SECRET_TIE = 'secret-couple';

const words = (text) => String(text == null ? '' : text).toLowerCase().replace(/ё/g, 'е').match(/\p{L}+/gu) || [];
const stem = (w, n = 5) => w.slice(0, n);

export function partnersOf(p) {
  return (p && Array.isArray(p.ties) ? p.ties : []).filter((t) => t && t.kind === SECRET_TIE).map((t) => t.to);
}

function publicText(p) {
  const { limits: _limits, ...v } = (p && p.voice) || {};
  return [p && p.summary, p && p.speech, ...Object.values(v), ...((p && p.interests) || [])].join(' ');
}

export function secretStems(p) {
  const open = new Set(words(publicText(p)).map((w) => stem(w)));
  const out = new Set();
  for (const s of (p && p.secrets) || []) {
    for (const w of words(s && s.text)) if (w.length >= 7 && !open.has(stem(w))) out.add(stem(w));
  }
  return out;
}

export function heavyStems(p) {
  const out = new Set();
  for (const h of (p && p.heavy) || []) for (const w of words(h)) if (w.length >= 6) out.add(stem(w));
  return out;
}

export function nameStems(person) {
  const out = new Set();
  for (const n of [person && person.name, person && person.short, ...((person && person.aliases) || [])]) {
    for (const w of words(n)) if (w.length >= 3 && /[а-яе]/.test(w)) out.add(stem(w, Math.max(3, Math.min(5, w.length - 1))));
  }
  return out;
}

export const hasStem = (text, set) => words(text).some((w) => [...set].some((s) => w.startsWith(s)));

export function cleanVoiceText(text, p, roster) {
  const partners = partnersOf(p).map((id) => roster && roster.get(id)).filter(Boolean);
  const names = new Set(partners.flatMap((x) => [...nameStems(x)]));
  const leaks = new Set([...secretStems(p), ...heavyStems(p)]);
  return String(text == null ? '' : text).split(/\s*;\s*/)
    .filter((part) => part && !hasStem(part, names) && !hasStem(part, leaks))
    .join('; ');
}
