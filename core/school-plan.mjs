import { termAt } from './time.mjs';
import { cutWords } from './classmates.mjs';

export const GRADES = [11, 12];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const normalizeGrade = (v) => (Number(v) === 12 ? 12 : 11);

const firstClause = (s, max) => cutWords(String(s || '').split(/[;(]/)[0], max);

export function teacherFromRoster(t) {
  const surface = t.voice && t.voice.surface;
  return {
    id: t.id,
    name: t.name,
    traits: surface ? [cutWords(surface, 60)] : [],
    post: firstClause(t.post, 60),
    looks: t.looks || '',
    aliases: (t.aliases || []).filter((a) => a !== t.name),
  };
}

export function subjectsOfGrade(roster, grade) {
  const seen = [];
  for (const day of DAYS) for (const id of (roster.grid[grade] || {})[day] || []) if (id && !seen.includes(id)) seen.push(id);
  return seen.map((id) => roster.subject(id)).filter(Boolean);
}

export function sideSubjectsOfGrade(roster, grade) {
  const school = roster.school || {};
  const ids = [];
  for (const t of Object.values(school.afternoonSpring || {})) if (t && t.subject && Number(t.grade) === grade) ids.push(t.subject);
  const sky = school.evening && school.evening.astronomy;
  if (sky && sky.subject && sky[grade]) ids.push(sky.subject);
  for (const x of school.extras || []) if (x.subject && (x.grades || []).includes(grade)) ids.push(x.subject);
  const main = new Set(subjectsOfGrade(roster, grade).map((s) => s.id));
  return [...new Set(ids)].filter((id) => !main.has(id)).map((id) => roster.subject(id)).filter(Boolean);
}

export function planFromRoster(roster, opts = {}) {
  const grade = normalizeGrade(opts.grade);
  const subjects = [...subjectsOfGrade(roster, grade), ...sideSubjectsOfGrade(roster, grade)].map((s) => ({ id: s.id, name: s.name, teacherId: (s.teachers || [])[0] || null, ...(s.term === 'spring' ? { season: 'spring' } : {}) }));
  const teachers = roster.teachers.map(teacherFromRoster);
  const schedule = {};
  DAYS.forEach((d, i) => { schedule[String(i + 1)] = [...((roster.grid[grade] || {})[d] || [])]; });
  return { subjects, teachers, schedule };
}

export function schoolMismatch(state, roster) {
  if (!state || !roster) return false;
  const ids = new Set(roster.subjects.map((s) => s.id));
  const own = Array.isArray(state.subjects) ? state.subjects : [];
  if (!own.length) return false;
  if (!own.every((s) => ids.has(s.id))) return true;
  const have = new Set(own.map((s) => s.id));
  return sideSubjectsOfGrade(roster, normalizeGrade(state.grade)).some((s) => !have.has(s.id));
}

const SPRING_TERM = 3;

export function isSpring(preset, state, day) {
  const at = termAt(preset, state, day);
  return at.inside && at.index === SPRING_TERM;
}

export function dayEvents(roster, state, preset, day = state.calendar.day) {
  const grade = normalizeGrade(state.grade);
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow];
  const school = roster.school;
  const out = [];
  const spring = isSpring(preset, state, day);
  const trans = school.afternoonSpring && school.afternoonSpring[key];
  if (spring && trans) {
    out.push(trans.grade === grade
      ? { when: 'afternoon', text: trans.text, subjectId: trans.subject }
      : { when: 'afternoon', text: 'Самостоятельная практика.' });
  } else if (school.afternoon && school.afternoon[key]) {
    out.push({ when: 'afternoon', text: afternoonText(school.afternoon[key], spring) });
  }
  const ev = school.evening || {};
  if (ev.astronomy && ev.astronomy[grade] === key) {
    out.push({ when: 'evening', text: `Звездочтение: ${ev.astronomy.place}.`, subjectId: ev.astronomy.subject });
  }
  return out;
}

function afternoonText(text, spring) {
  const parts = String(text).split(/\s*;\s*/);
  const pick = parts.find((p) => (spring ? /^весной/i : /^осенью/i).test(p));
  if (pick) return pick.replace(/^(осенью|весной)\s*[—-]\s*/i, '').replace(/^./, (c) => c.toUpperCase());
  return text;
}
