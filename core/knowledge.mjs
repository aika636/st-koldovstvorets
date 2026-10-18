import { openTies, isWarmTie } from './authors.mjs';
import { heavyStems, secretStems, partnersOf, nameStems, hasStem } from './secrets.mjs';

const LESSON_RE = /урок|занят|контрольн|экзамен|искус|зач[её]т|оценк|отметк|лапт|тренировк|практик|лекци/iu;
const WING_RE = /горниц|спальн|крыл[оеа]|отбой|ночью|ночн|кроват|общежит|печ[ьи]\b/iu;
const VILLAIN_STEMS = ['кашевск', 'экстрасенс'];
const LOVE_RE = /(?<![\p{L}])(?:вместе|пара|парой|парочк\p{L}*|роман\p{L}*|любов\p{L}*|любит|влюбл\p{L}*|встречаются|целуются|тайно|тайна)(?![\p{L}])/iu;

export const KNOW_NAMES_MAX = 5;

const stemSet = (text) => new Set((String(text || '').toLowerCase().replace(/ё/g, 'е').match(/\p{L}{5,}/gu) || []).map((w) => w.slice(0, 5)));

function place(state, roster, id) {
  if (id === '@heroine') return { grade: Number(state && state.grade) || 0, house: (state && state.house) || '', hero: true };
  const p = roster && roster.get(id);
  return p ? { grade: p.grade || 0, house: p.house || '', role: p.role } : null;
}

function atNight(fact) {
  const m = /^(\d{1,2}):\d{2}/.exec(String(fact && fact.at && fact.at.time) || '');
  if (!m) return false;
  const h = Number(m[1]);
  return h >= 23 || h < 6;
}

const NIGHT_DUTY = ['bayun', 'kuzya'];

export function knowersOf(fact, state, roster) {
  const f = fact || {};
  const text = [f.gist, f.text, f.act && f.act.say].join(' ');
  const students = roster ? roster.students : [];
  const parts = (f.about || []).map((id) => ({ id, at: place(state, roster, id) })).filter((x) => x.at);
  const saw = new Set(parts.filter((x) => !x.at.hero && x.at.role === 'student').map((x) => x.id));
  const how = new Map([...saw].map((id) => [id, 'saw']));
  const mark = (id, kind) => { if (!how.has(id)) how.set(id, kind); };
  const reach = f.act && f.act.reach ? f.act.reach : (f.loud ?? 1) >= 2 ? 'многие' : 'неизвестно';
  const lesson = LESSON_RE.test(text);
  const wing = WING_RE.test(text);
  const rumor = f.rumor === true;
  const horns = parts.filter((x) => x.at.grade);
  const sameGrade = (g) => students.filter((s) => s.grade === g);
  const sameHorn = (g, h) => students.filter((s) => s.grade === g && s.house === h);
  const sameHouse = (h) => students.filter((s) => s.house === h);
  let scope = 'few';
  if (!rumor) {
    if (lesson) {
      for (const x of horns) for (const s of sameGrade(x.at.grade)) mark(s.id, 'near');
      scope = 'class';
    } else if (wing) {
      for (const x of horns) for (const s of reach === 'многие' ? sameHouse(x.at.house) : sameHorn(x.at.grade, x.at.house)) mark(s.id, 'near');
      scope = 'wing';
    } else if (reach === 'многие') {
      for (const x of horns) for (const s of [...sameGrade(x.at.grade), ...sameHouse(x.at.house)]) mark(s.id, 'near');
      scope = 'crowd';
    } else {
      for (const x of horns) for (const s of sameHorn(x.at.grade, x.at.house)) mark(s.id, 'near');
    }
  } else {
    for (const x of horns) for (const s of sameHorn(x.at.grade, x.at.house)) if (!saw.has(s.id)) mark(s.id, 'near');
    scope = 'overheard';
  }
  if (!rumor) {
    const loud3 = (f.loud ?? 1) >= 3;
    const aware = [...how.keys()];
    for (const s of students) {
      if (how.has(s.id)) continue;
      if (loud3 || aware.some((id) => openTies(roster.get(id)).some((t) => isWarmTie(t) && t.to === s.id) || openTies(s).some((t) => isWarmTie(t) && t.to === id))) mark(s.id, 'told');
    }
  }
  const words = stemSet(text);
  const night = atNight(fact);
  for (const p of [...roster.staff, ...roster.teachers]) {
    const notices = stemSet(`${(p.voice && p.voice.notices) || ''} ${Array.isArray(p.notices) ? p.notices.join(' ') : ''}`);
    if ([...notices].some((w) => words.has(w)) || (night && NIGHT_DUTY.includes(p.id))) mark(p.id, 'duty');
  }
  const ids = [...how.keys()];
  return { ids, how, scope, rumor };
}

export function describeKnowers(k, roster, limit = KNOW_NAMES_MAX) {
  const names = (kind) => [...k.how].filter(([, v]) => v === kind).map(([id]) => (roster.get(id) || {}).short).filter(Boolean);
  const cut = (list) => (list.length > limit ? `${list.slice(0, limit).join(', ')} и ещё ${list.length - limit}` : list.join(', '));
  const parts = [];
  const saw = names('saw');
  if (saw.length) parts.push(`участники: ${cut(saw)}`);
  const near = names('near');
  if (k.rumor) parts.push('подслушано: целиком знает только тот, кто стоял рядом; остальные — по записке без подписи, неточно');
  else if (near.length) {
    const label = k.scope === 'class' ? 'был рядом весь класс' : k.scope === 'wing' ? 'рядом была горница или крыло' : k.scope === 'crowd' ? 'видели многие' : 'рядом были';
    parts.push(`${label}: ${cut(near)}`);
  }
  const told = names('told');
  if (told.length && !k.rumor) parts.push(`со слов друзей и близких: ${cut(told)}`);
  const duty = names('duty');
  if (duty.length) parts.push(`по службе: ${cut(duty)}`);
  return parts.join('; ') || 'кто-то видел';
}

export function leakReason(text, { roster, revealed } = {}) {
  const raw = String(text == null ? '' : text);
  const low = raw.toLowerCase().replace(/ё/g, 'е');
  if (VILLAIN_STEMS.some((s) => low.includes(s))) return 'это не знают ни ученики, ни школа';
  if (!roster) return '';
  const open = new Set((revealed && revealed.secrets) || []);
  const named = (p) => hasStem(raw, nameStems(p));
  for (const p of roster.people) {
    if (!named(p)) continue;
    if (hasStem(raw, heavyStems(p))) return `тяжёлая тема «${p.short || p.name}» в молву не выносится`;
    if (!open.has(p.id) && hasStem(raw, secretStems(p))) return `тайна «${p.short || p.name}» ещё не раскрыта`;
    for (const q of partnersOf(p)) {
      const partner = roster.get(q);
      if (!partner || open.has(p.id) || open.has(q) || !named(partner)) continue;
      if (LOVE_RE.test(raw)) return `связь «${p.short || p.name}» и «${partner.short || partner.name}» ещё не раскрыта`;
    }
  }
  return '';
}

export { stemSet };
