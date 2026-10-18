import { normName } from './stop-names.mjs';

export const ROSTERS = ['basic', 'extended'];

export const DATA_FILES = { students: 'students.json', staff: 'staff.json', school: 'school.json' };

export function normalizeRoster(v) {
  return v === 'extended' ? 'extended' : 'basic';
}

export async function loadRosterData(read) {
  const [students, staff, school] = await Promise.all(Object.values(DATA_FILES).map((f) => read(f)));
  return { students, staff, school };
}

const list = (v) => (Array.isArray(v) ? v : []);

function trimTies(person, alive) {
  const out = { ...person };
  if (Array.isArray(person.ties)) out.ties = person.ties.filter((t) => t && alive.has(t.to));
  if (Array.isArray(person.secrets)) {
    out.secrets = person.secrets.map((s) => (s && Array.isArray(s.known) ? { ...s, known: s.known.filter((id) => alive.has(id)) } : s));
  }
  return out;
}

export function createRoster(data, opts = {}) {
  const mode = normalizeRoster(opts.roster);
  const school = (data && data.school) || {};
  const rawStudents = list(data && data.students && data.students.students);
  const rawTeachers = list(data && data.staff && data.staff.teachers);
  const rawStaff = list(data && data.staff && data.staff.staff);

  const students = rawStudents.filter((s) => mode === 'extended' || s.roster !== 'extended');
  const alive = new Set([...students, ...rawTeachers, ...rawStaff].map((p) => p.id));

  const all = [
    ...students.map((p) => ({ ...trimTies(p, alive), role: 'student' })),
    ...rawTeachers.map((p) => ({ ...trimTies(p, alive), role: 'teacher' })),
    ...rawStaff.map((p) => ({ ...trimTies(p, alive), role: 'staff' })),
  ];
  const byId = new Map(all.map((p) => [p.id, p]));
  const hidden = new Set(rawStudents.filter((s) => !students.includes(s)).map((s) => s.id));

  const names = (p) => [p.name, p.short, ...list(p.aliases)].map(normName).filter(Boolean);
  const index = all.map((p) => ({ p, names: [...new Set(names(p))] }));

  function matches(query, role) {
    const key = normName(query);
    if (!key) return [];
    const pool = role ? index.filter((x) => x.p.role === role) : index;
    const exact = pool.filter((x) => x.names.includes(key));
    if (exact.length) return exact.map((x) => x.p);
    const words = key.split(' ');
    if (words.some((w) => w.length < 3)) return [];
    return pool.filter((x) => x.names.some((n) => {
      const have = n.split(' ');
      return words.every((w) => have.includes(w));
    })).map((x) => x.p);
  }

  return {
    mode,
    school,
    houses: list(school.houses),
    subjects: list(school.subjects),
    extras: list(school.extras),
    grid: school.grid || {},
    students: all.filter((p) => p.role === 'student'),
    teachers: all.filter((p) => p.role === 'teacher'),
    staff: all.filter((p) => p.role === 'staff'),
    people: all,
    get: (id) => byId.get(String(id)) || null,
    has: (id) => byId.has(String(id)),
    isHidden: (id) => hidden.has(String(id)),
    house: (id) => list(school.houses).find((h) => h.id === id) || null,
    subject: (id) => list(school.subjects).find((s) => s.id === id) || null,
    studentsOf: (grade, house) => all.filter((p) => p.role === 'student' && p.grade === Number(grade) && (!house || p.house === house)),
    findAll: (name, role) => matches(name, role),
    find(name, role) {
      const hit = matches(name, role);
      return hit.length === 1 ? hit[0] : null;
    },
  };
}
