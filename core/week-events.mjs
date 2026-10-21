import { addDays } from './time.mjs';

const MATCH_WINDOWS = [['09-14', '09-30'], ['10-22', '11-14'], ['11-17', '12-10'], ['03-10', '03-31'], ['04-08', '04-30'], ['05-05', '05-29']];

const PATROL_WINDOWS = [['10-01', '10-12'], ['01-24', '02-14'], ['04-04', '04-25']];

const hash = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};

function drawDay(day, key, [from, to], ok = () => true) {
  const md = day.slice(5);
  if (md < from || md > to) return false;
  const year = day.slice(0, 4);
  const days = [];
  for (let d = `${year}-${from}`; d <= `${year}-${to}`; d = addDays(d, 1)) if (ok(d)) days.push(d);
  return days[hash(`${key}${year}`) % days.length] === day;
}

export function matchOn(day, houses, ok) {
  const at = MATCH_WINDOWS.findIndex((w, i) => drawDay(day, `m${i}`, w, ok));
  if (at < 0 || houses.length < 2) return null;
  const pairs = houses.flatMap((a, i) => houses.slice(i + 1).map((b) => [a, b]));
  const [a, b] = pairs[(hash(`p${day.slice(0, 4)}${at < 3}`) + (at % 3) * 2) % pairs.length];
  return { kind: 'match', text: `Матч летучей лапты ${a.name} — ${b.name}, судит Добрыня.` };
}

export function saturdayOn(day, ok) {
  if (PATROL_WINDOWS.some((w, i) => drawDay(day, `b${i}`, w, ok))) {
    return { kind: 'patrol', text: 'Обход границы школы пешком с Ильёй Муромцем: старшие подновляют черту.' };
  }
  if (hash(`a${day}`) % 6 === 0) return { kind: 'alchemy', text: 'Алхимия у Данилы-мастера — факультатив, по желанию.' };
  return null;
}
