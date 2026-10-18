import { normalizeFeed } from './feed.mjs';
import { partnersOf, secretStems, heavyStems, nameStems, hasStem } from './secrets.mjs';
import { cutText } from './feed-text.mjs';

export const DIGEST_MAX = 4;
export const DIGEST_SUMMARY = 170;
export const DIGEST_SPEECH = 70;

export const digestMaxOf = (raw) => {
  if (raw === null || raw === undefined || raw === '') return DIGEST_MAX;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 8) : DIGEST_MAX;
};

const LISTING = /^В списках\s*[—–-]/u;
const TAIL = /[\s,;:—–-]+$/u;

function safeSentences(text, p, roster) {
  const partners = partnersOf(p).map((id) => roster.get(id)).filter(Boolean);
  const names = new Set(partners.flatMap((x) => [...nameStems(x)]));
  const leaks = new Set([...secretStems(p), ...heavyStems(p)]);
  return String(text == null ? '' : text).split(/(?<=[.!?])\s+/).filter((s) => s && !LISTING.test(s) && !hasStem(s, names) && !hasStem(s, leaks));
}

function pack(parts, max, glue) {
  let out = '';
  for (const s of parts) {
    const next = out ? `${out}${glue}${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

// Целые фразы; если первая не влезает — части по «;» и «,», и только потом обрезка по слову.
function fit(sentences, max, glue = ' ') {
  const whole = pack(sentences, max, glue);
  if (whole) return whole;
  const first = sentences[0] || '';
  const clauses = pack(first.split(/\s*;\s+/), max, '; ') || pack(first.split(/,\s+/), max, ', ');
  return (clauses || cutText(first, max)).replace(TAIL, '');
}

function roleOf(p, roster) {
  if (p.role === 'student') {
    const house = roster.house(p.house);
    return `${p.gender === 'f' ? 'ученица' : 'ученик'} ${p.grade} класса${house ? `, ${house.name}` : ''}`;
  }
  return fit([String(p.post || (p.role === 'teacher' ? 'преподаватель' : 'персонал'))], 80);
}

export function digestOf(p, roster) {
  const full = String(p.summary || '');
  const own = [p.name, p.short].find((n) => n && full.startsWith(`${n}.`));
  const summary = fit(safeSentences(own ? full.slice(own.length + 1).trim() : full, p, roster), DIGEST_SUMMARY);
  const speech = fit(safeSentences(p.speech, p, roster), DIGEST_SPEECH).replace(/[.]$/, '');
  const head = `${p.short || p.name} (${roleOf(p, roster)})`;
  return [head, summary && ` — ${summary}`, speech && ` Говорит: ${speech[0].toLowerCase()}${speech.slice(1)}.`].filter(Boolean).join('');
}

export const PRESENT_MIN = 90;

const minutesOf = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Ученик, названный сегодня, считается в сцене; преподаватель и персонал — только если отмечены недавно.
function present(p, v, state) {
  if (!p || p.role === 'student') return true;
  const now = minutesOf(state.calendar && state.calendar.time);
  const at = minutesOf(v.time);
  return now === null || at === null || (now >= at && now - at <= PRESENT_MIN);
}

export function sceneIds(state, roster, { max = DIGEST_MAX, teacherId = '' } = {}) {
  if (!state || !roster || max <= 0) return [];
  const today = state.calendar && state.calendar.day;
  const seen = Object.entries(normalizeFeed(state.feed).seen)
    .filter(([id, v]) => roster.has(id) && v.day === today && present(roster.get(id), v, state)).map(([id]) => id).reverse();
  const out = [];
  const teacher = teacherId && roster.get(teacherId) ? teacherId : '';
  if (teacher) out.push(teacher);
  for (const id of seen) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, max);
}

export function sceneDigests(state, roster, opts = {}) {
  return sceneIds(state, roster, opts).map((id) => ({ id, text: digestOf(roster.get(id), roster) }));
}
