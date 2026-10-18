import { holidaysOf, eventsOf } from './holidays.mjs';
import { subjectWord } from './words.mjs';

export const END_MARK = 'КОНЕЦ';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function textKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const FOREIGN_SPELLS = [
  'люмос', 'lumos', 'обливиэйт', 'обливиэйшн', 'obliviate', 'экспеллиармус', 'expelliarmus', 'экспекто патронум',
  'expecto patronum', 'авада кедавра', 'avada kedavra', 'круцио', 'crucio', 'империо', 'imperio', 'протего', 'protego',
  'акцио', 'accio', 'вингардиум', 'wingardium', 'левиоса', 'риддикулус', 'riddikulus', 'петрификус', 'petrificus',
  'алохомора', 'alohomora', 'остолбеней', 'stupefy', 'легилименс', 'legilimens', 'сектумсемпра', 'sectumsempra',
  'инсендио', 'incendio', 'силенцио', 'silencio', 'репаро', 'reparo', 'эпискей', 'episkey', 'редукто', 'reducto',
  'морсмордре', 'morsmordre', 'империус', 'фините инкантатем', 'finite incantatem', 'ступефай', 'экспульсо',
  'фулгури', 'патронум',
];

const SPELL_RE = new RegExp(`(?<![\p{L}])(?:${FOREIGN_SPELLS.map((w) => w.replace(' ', '\s+')).join('|')})`, 'iu');

export function foreignSpell(text) {
  const m = SPELL_RE.exec(String(text == null ? '' : text).replace(/ё/gi, 'е'));
  return m ? m[0] : '';
}

function stems(s) {
  return new Set(textKey(s).split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
}

export function similar(a, b) {
  const x = textKey(a);
  const y = textKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const sa = stems(a);
  const sb = stems(b);
  if (!sa.size || !sb.size) return false;
  let common = 0;
  for (const w of sa) if (sb.has(w)) common += 1;
  return common / (sa.size + sb.size - common) >= 0.5;
}

export function mixedAlphabet(text) {
  return Array.from(String(text == null ? '' : text).matchAll(/\p{L}+/gu))
    .some(([w]) => /\p{Script=Cyrillic}/u.test(w) && /\p{Script=Latin}/u.test(w));
}

export function worldPreset(state, preset) {
  return preset;
}

export function worldRealities(state, preset) {
  const p = worldPreset(state, preset && typeof preset === 'object' ? preset : {});
  const vocab = p.vocab || {};
  const out = [];
  if (p.displayName) out.push(`заведение: ${p.displayName}`);
  const words = [['teacher', 'преподаватель'], ['period', 'занятие'], ['term', 'семестр'], ['examPeriod', 'сессия']]
    .map(([k, w]) => (vocab[k] ? `${w} — «${vocab[k]}»` : '')).filter(Boolean);
  if (words.length) out.push(`здесь это называется так: ${words.join('; ')}`);
  const subjects = ((state && state.subjects) || []).map((s) => s && s.name).filter(Boolean).slice(0, 6);
  if (subjects.length) out.push(`${subjectWord(p, 'many')}: ${subjects.join(', ')}`);
  const days = [...holidaysOf(p), ...eventsOf(state)].map((h) => h.name).filter(Boolean).slice(0, 6);
  if (days.length) out.push(`праздники и события: ${[...new Set(days)].join(', ')}`);
  return out;
}

export function calendarNames(state, preset) {
  const out = [];
  for (const h of [...holidaysOf(worldPreset(state, preset)), ...eventsOf(state)]) {
    const name = h && str(h.name);
    if (name && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 20);
}

const oneLine = (v, max) => str(v).replace(/\s+/g, ' ').slice(0, max).trim();

export function cutText(text, max) {
  const t = String(text == null ? '' : text).trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max / 2 && /[\p{L}\p{N}]/u.test(t[max]) ? cut.slice(0, at) : cut).replace(/[\s,;:\-–—]+$/u, '').trim();
}

const LABEL_ECHO = /(?:^|[\s,;(])(?:нрав|роль)\s*(?:[:«»]|$)/iu;

export function goodProfile(v, { min = 3, max = 400 } = {}) {
  const raw = oneLine(String(v == null ? '' : v).replace(/[*`]+/g, ''), 4000).replace(/^\s*(?:нрав|роль|характер)\s*[:—–-]\s*/iu, '');
  if (raw.length < min || raw.includes(END_MARK) || /["„“”|]/.test(raw) || LABEL_ECHO.test(raw) || mixedAlphabet(raw)) return '';
  const count = (re) => (raw.match(re) || []).length;
  if (count(/\p{Script=Latin}/gu) > count(/\p{Script=Cyrillic}/gu)) return '';
  return cutText(raw, max);
}
