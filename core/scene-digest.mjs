import { normalizeFeed } from './feed.mjs';
import { cutText } from './feed-text.mjs';
import { nameStems, hasStem } from './secrets.mjs';

export const DIGEST_MAX = 4;

export const digestMaxOf = (raw) => {
  if (raw === null || raw === undefined || raw === '') return DIGEST_MAX;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 8) : DIGEST_MAX;
};


const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function roleOf(p, roster) {
  if (p.role === 'student') {
    const house = roster.house(p.house);
    return `${ordinal(p.grade)}-grade student${house ? `, ${house.name}` : ''}`;
  }
  return cutText(String(p.post || (p.role === 'teacher' ? 'teacher' : 'staff')).split(/\s*;\s*/)[0], 60);
}

// Только кто рядом: имя, класс, факультет (роль — у взрослых); внешность и характер даёт лорбук.
export const digestOf = (p, roster) => `${p.short || p.name} (${roleOf(p, roster)})`;

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

// said — последние реплики чата: в сцене только названные в них (без текста — все отмеченные).
export function sceneIds(state, roster, { max = DIGEST_MAX, teacherId = '', said = '' } = {}) {
  if (!state || !roster || max <= 0) return [];
  const today = state.calendar && state.calendar.day;
  const seen = Object.entries(normalizeFeed(state.feed).seen)
    .filter(([id, v]) => roster.has(id) && v.day === today && present(roster.get(id), v, state) && (!said || hasStem(said, nameStems(roster.get(id))))).map(([id]) => id).reverse();
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
