import { presetGender } from './gender.mjs';
import { labelFor, findTeacher } from './state.mjs';
import { relationMemory, relationLabel, relationOf, findPerson, scaleOff } from './relations.mjs';
import { tieTarget, classmateStart } from './classmates.mjs';
import { stableLooks } from './portraits.mjs';
import { normalizeFeed, openDeals } from './feed.mjs';
import { diffDays } from './time.mjs';
import { composeAll, contentWords, essenceWords } from './lore-keys.mjs';

export const CATEGORIES = ['charter', 'people', 'places', 'chronicle'];

export const KEEP_EDITED = 'edited';
export const KEEP_UNCHANGED = 'unchanged';
export const KEEP_FOREIGN = 'foreign';

export const SKIP_CAP = 'cap';

export const DEFAULTS = {
  maxEntries: 60,
  charsPerToken: 3,
};

export const DEFAULT_TEMPLATES = {
  teacherBasics: '{name} — {teacher}{here}.',
  teacherHere: ', ведёт «{subject}»',
  teacherTraits: 'Характер: {traits}.',
  teacherPost: 'Должность: {post}.',
  teacherLikes: 'Любит: {likes}.',
  teacherSecret: 'Тайна (героиня не знает; проявлять только намёками, прямо не раскрывать): {secret}.',
  addendumScope: "Scope: facts from this chat; identity and appearance come from the player's lorebook.",
  addendumRole: 'Роль здесь: {role}.',
  addendumTeacher: '{teacher}, ведёт «{subject}»',
  dealLine: 'Open case with {who}: {what}.',
  rumorClaim: 'An unverified anonymous claim is circulating: {claim}.',
  rumorPublic: 'Public event: {claim}.',
  rumorSay: 'What people say (individual opinions):',
  charterRules: '{institution}. Несданное превращается в {debtPlural}; за прогулы и {debtPlural} следует {warning}, крайняя мера — {expulsion}. Репутация героини сейчас: {reputation}.',
  worldTerms: '«{term}» — часть учебного года. «{period}» — единица расписания. «{examPeriod}» — время итогов. «{gradebook}» — документ с оценками. «{debt}» — несданное. «{warning}» — вызов за прогулы и долги. «{expulsion}» — крайняя мера.',
  place: '{name}. {note}',
  npc: '{name}. {note}',
  classmate: '{name}.',
  classmateClub: 'Кружок: {club}.',
  classmateDesire: 'Хочет: {desire}.',
  classmateTie: 'Связь: {tie}.',
  classmateTieLine: '{who} — {what}',
  classmateHeroine: 'героиня',
  classmateProblem: 'Что не ладится: {problem}.',
  classmateRelation: 'К героине: {relation}.',
  classmateMemory: 'Помнит: {memory}.',
};

const MALE_TEMPLATES = {
  teacherSecret: 'Тайна (герой не знает; проявлять только намёками, прямо не раскрывать): {secret}.',
  classmateHeroine: 'герой',
  classmateRelation: 'К герою: {relation}.',
  charterRules: '{institution}. Несданное превращается в {debtPlural}; за прогулы и {debtPlural} следует {warning}, крайняя мера — {expulsion}. Репутация героя сейчас: {reputation}.',
};

export function fingerprint(text) {
  const s = String(text == null ? '' : text);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2654435761) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12);
}

export function estimateTokens(text, preset) {
  return tokensOfChars(String(text == null ? '' : text).length, preset);
}

function tokensOfChars(chars, preset) {
  const per = numberOr(limitsOf(preset).lorebookCharsPerToken, DEFAULTS.charsPerToken);
  return chars === 0 ? 0 : Math.ceil(chars / Math.max(1, per));
}

export function measure(entries, preset) {
  const list = entries || [];
  const chars = list.reduce((n, e) => n + String(e.content || '').length, 0);
  return { entries: list.length, chars, tokens: tokensOfChars(chars, preset) };
}

export function entryCap(preset, opts = {}) {
  return numberOr(opts.maxEntries, numberOr(limitsOf(preset).maxLorebookEntries, DEFAULTS.maxEntries));
}

function sectionsText(sections) {
  return sections.filter(([, text]) => String(text || '').trim()).map(([head, text]) => `[${head}]\n${String(text).trim()}`).join('\n\n');
}

const HEROINE = '@heroine';

export function personKind(person) {
  if (!person) return 'own';
  if (person.source === 'lorebook' || person.source === 'card' || person.lorebook || person.loreLink) return 'lore';
  return 'own';
}

const isTeacherOf = (state, p) => Boolean(p && (state.teachers || []).some((t) => t.id === p.id));

function startOf(state, p, preset) {
  return isTeacherOf(state, p) ? numberOr(preset && preset.relations && preset.relations.start, 0) : classmateStart(preset);
}

function storyOf(state, p, preset, vars) {
  const phrase = (tpl, extra) => fill(templateOf(preset, tpl), { ...vars, ...extra });
  const memory = relationMemory(state, p.id, preset).map((m) => bare(m.reason)).filter(Boolean);
  const moved = relationMemory(state, p.id, preset).length > 0
    || (personKind(p) === 'own' && relationOf(state, p.id) !== startOf(state, p, preset));
  const deals = openDeals(state, p.id).filter((d) => !d.intent && d.b).map((d) => {
    const other = d.a === p.id ? d.b : d.a;
    const who = other === HEROINE ? templateOf(preset, 'classmateHeroine') : ((findPerson(state, other) || {}).name || '');
    return who ? phrase('dealLine', { who, what: bare(d.what) }) : '';
  }).filter(Boolean);
  return {
    memory,
    deals,
    relation: moved && !scaleOff(state) ? relationLabel(state, p.id, preset) : '',
  };
}

function personEntry(state, p, preset) {
  if (!p) return null;
  const teacher = isTeacherOf(state, p);
  const kind = personKind(p);
  const vars = vocabVars(preset);
  const phrase = (tpl, key, value) => (bare(value) ? fill(templateOf(preset, tpl), { ...vars, [key]: bare(value) }) : '');
  const subject = teacher ? (state.subjects || []).find((s) => s.teacherId === p.id) : null;
  const subjectName = subject && subject.name ? subject.name : '';
  const story = storyOf(state, p, preset, vars);
  const relation = phrase('classmateRelation', 'relation', story.relation);
  const memory = phrase('classmateMemory', 'memory', story.memory.join('; '));
  const uid = teacher ? `koldo:teacher:${p.id}` : classmateUid(p.id);
  const base = { uid, category: 'people', title: p.name, spec: { type: 'person', name: p.name, aliases: p.aliases || [] }, order: teacher ? 50 : 45 };

  if (kind === 'lore') {
    const role = subjectName ? fill(templateOf(preset, 'addendumRole'), { ...vars, role: fill(templateOf(preset, 'addendumTeacher'), { ...vars, subject: subjectName }) }) : '';
    const facts = [role, relation, memory, ...story.deals].filter(Boolean);
    if (!facts.length) return null;
    const cpt = numberOr(limitsOf(preset).lorebookCharsPerToken, DEFAULTS.charsPerToken);
    const head = `[KOLDO CONTINUITY ADDENDUM — ${p.name}]\n${templateOf(preset, 'addendumScope')}\n`;
    return entry({
      ...base,
      kind: 'addendum',
      quiet: true,
      content: head + capText(facts, Math.max(60, ADDENDUM_TOKENS * cpt - head.length), '\n'),
    });
  }

  const club = phrase('classmateClub', 'club', p.club);
  const looks = bare(stableLooks(p.looks));
  const tie = tieLine(state, p, preset, vars);
  const basics = teacher
    ? fill(templateOf(preset, 'teacherBasics'), { ...vars, name: p.name, here: subjectName ? fill(templateOf(preset, 'teacherHere'), { subject: subjectName }) : '' })
    : fill(templateOf(preset, 'classmate'), { ...vars, name: p.name });
  const post = teacher ? phrase('teacherPost', 'post', p.post) : '';
  const personality = [
    teacher ? phrase('teacherTraits', 'traits', (p.traits || []).join(', ')) : '',
    teacher ? phrase('teacherLikes', 'likes', p.likes) : '',
  ].filter(Boolean).join(' ');
  const sections = [
    ['NAME AND BASICS', [basics, post, club].filter(Boolean).join(' ')],
    ['APPEARANCE', looks],
    ['PERSONALITY', personality],
    ['RELATIONSHIPS', [tie, relation, memory].filter(Boolean).join(' ')],
    ['BACKGROUND', teacher ? phrase('teacherSecret', 'secret', p.secret) : ''],
    ['CURRENT SITUATION', [phrase('classmateDesire', 'desire', p.desire), phrase('classmateProblem', 'problem', p.problem), ...story.deals].filter(Boolean).join(' ')],
  ];
  if (!teacher && sections.slice(1).every(([, t]) => !t) && !club) return null;
  return entry({ ...base, kind: 'npc', content: sectionsText(sections) });
}

function tieLine(state, p, preset, vars) {
  if (!p.tie) return '';
  const target = tieTarget(state, p.tie.to);
  const who = target.kind === 'heroine' ? templateOf(preset, 'classmateHeroine') : target.name;
  const tie = who && bare(p.tie.what)
    ? fill(templateOf(preset, 'classmateTieLine'), { ...vars, who, what: bare(p.tie.what) })
    : (who || p.tie.what || '');
  return bare(tie) ? fill(templateOf(preset, 'classmateTie'), { ...vars, tie: bare(tie) }) : '';
}

export const ADDENDUM_TOKENS = 150;

export function teacherEntry(state, teacherId, preset) {
  const e = personEntry(state, findTeacher(state, teacherId), preset);
  return e ? withKeys([e], {}, { state })[0] : null;
}

export const classmateUid = (id) => `koldo:classmate:${id}`;

export function classmateEntry(state, id, preset) {
  const e = personEntry(state, ((state && state.classmates) || []).find((x) => x && x.id === id), preset);
  return e ? withKeys([e], {}, { state })[0] : null;
}

function capText(parts, max, sep = ' ') {
  let out = '';
  for (const p of parts) {
    const next = out ? `${out}${sep}${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  return out || String(parts[0] || '').slice(0, max);
}

const lorebookPhrases = (preset) => (preset && preset.phrases && preset.phrases.lorebook) || {};

function englishCharter(state, preset, vars) {
  const ph = lorebookPhrases(preset);
  const tpl = typeof ph.charterEn === 'string' ? ph.charterEn.trim() : '';
  if (!tpl) return null;
  const value = state.reputation ? state.reputation.value : 0;
  const labels = reputationLabels(preset);
  const at = labels.findIndex((l) => value <= l.upTo);
  const en = Array.isArray(ph.reputationEn) ? bare(ph.reputationEn[at < 0 ? labels.length - 1 : at]) : '';
  const inst = bare(state.survey && state.survey.institution);
  const place = inst && !/[А-Яа-яЁё]/.test(inst) ? `${inst.charAt(0).toUpperCase()}${inst.slice(1)}.` : '';
  const rules = fill(tpl, { ...vars, heroine: '{{user}}', reputation: en || labelFor(labels, value) });
  return [place, rules].filter(Boolean).join(' ');
}

export function heroineEntry(state) {
  if (!state || !state.grade) return null;
  const house = bare(state.survey && state.survey.faculty);
  const head = `{{user}} is a ${state.grade}th-year student${house ? ` of the ${house} house` : ''}.`;
  const m = state.survey && state.survey.gender === 'm';
  const [she, her] = m ? ['He', 'His'] : ['She', 'Her'];
  const body = state.heroStart === 'old'
    ? `${she} has studied here for years and knows the school, its people and its customs.${state.past ? ` ${her} past may be mentioned: ${bare(state.past)}.` : ''} No romantic past is assumed.`
    : `${she} is new: transferred from home schooling, knows the basics of magic but not the local life. First scenes: arrival, the dean, settling in.`;
  return entry({
    uid: 'koldo:heroine',
    category: 'charter',
    kind: 'charter',
    title: 'Героиня',
    spec: { type: 'none' },
    constant: true,
    content: sectionsText([['HEROINE', `${head} ${body}`]]),
    order: 95,
    lang: 'en',
  });
}

export function charterEntry(state, preset) {
  const vars = vocabVars(preset);
  const english = englishCharter(state, preset, vars);
  const rules = english === null ? fill(templateOf(preset, 'charterRules'), {
    ...vars,
    institution: (state.survey && state.survey.institution) || '',
    reputation: labelFor(reputationLabels(preset), state.reputation ? state.reputation.value : 0),
  }).replace(/^\s*\.\s*/, '') : english;
  const content = sectionsText([
    ['KOLDO RULES', english === null ? rules : rules],
  ]);

  return entry({
    uid: 'koldo:charter',
    category: 'charter',
    kind: 'charter',
    title: 'Устав',
    spec: { type: 'none' },
    constant: true,
    content,
    order: 100,
    ...(english === null ? {} : { lang: 'en' }),
  });
}

const TERM_KEYS = ['term', 'period', 'periodPlural', 'examPeriod', 'gradebook', 'debt', 'debtPlural', 'warning', 'expulsion'];

export function vocabEntry(state, preset) {
  const vars = vocabVars(preset);
  const defs = lorebookPhrases(preset).termsEn;
  if (defs && typeof defs === 'object') {
    const keys = Object.keys(defs).filter((k) => bare(vars[k]) && bare(defs[k]));
    const lines = [...new Set(keys.map((k) => `${bare(vars[k])} = ${bare(defs[k])}.`))];
    if (!lines.length) return null;
    const terms = [...new Set(keys.flatMap((k) => [bare(vars[k]), bare(vars[`${k}Plural`])]).filter(Boolean))];
    return entry({
      uid: 'koldo:vocab',
      category: 'charter',
      kind: 'vocab',
      title: 'Слова мира',
      spec: { type: 'vocab', terms },
      content: sectionsText([['WORLD TERMS', lines.join('\n')]]),
      order: 90,
      lang: 'en',
    });
  }
  const terms = [...new Set(TERM_KEYS.map((k) => bare(vars[k])).filter(Boolean))];
  if (terms.length < 3) return null;
  return entry({
    uid: 'koldo:vocab',
    category: 'charter',
    kind: 'vocab',
    title: 'Слова мира',
    spec: { type: 'vocab', terms },
    content: sectionsText([['WORLD TERMS', fill(templateOf(preset, 'worldTerms'), vars)]]),
    order: 90,
  });
}

const TITLE_WORD = /^(?:who|which|that|and|professor|prof|head|headmaster|headmistress|master|mister|mr|mrs|ms|miss|madam|madame|sir|lord|lady|dr|doctor|deputy|class|house|of|the)$/i;

function latinName(list) {
  const latin = (Array.isArray(list) ? list : []).map((x) => String(x || '').trim())
    .filter((x) => /^[A-Z][A-Za-z'’ .-]*$/.test(x) && x.length >= 3)
    .filter((x) => !x.split(/\s+/).some((w) => TITLE_WORD.test(w)) && x.split(/\s+/).every((w) => /^[A-Z]/.test(w)));
  return latin.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length)[0] || '';
}

export function acceptedSpellings(state, cache) {
  const out = [];
  const people = [...((state && state.teachers) || []).map((p) => [p, `koldo:teacher:${p && p.id}`]), ...((state && state.classmates) || []).map((p) => [p, classmateUid(p && p.id)])];
  for (const [p, uid] of people) {
    if (!p || !p.name || !/[А-Яа-яЁё]/.test(p.name)) continue;
    const en = latinName(p.aliases) || latinName(cache && cache[uid] && cache[uid].hints && cache[uid].hints.latin);
    if (en) out.push({ ru: p.name, en });
  }
  return out.slice(0, 40);
}

export const ANON_VOICE = 'anonymous note';

export const RUMOR_RULES = { loud: 2, voices: 2, keepDays: 14, max: 5, quote: 120 };

const PURE_REACTION = /^(?:а?х[ах]*а[ах]*|ха[ха]*|ого+|ух+|вау+|лол|кек|ору+|ага|мда+|жиза|\+\d*)$/iu;

function substance(text) {
  const bareText = String(text || '').replace(/@\S+/g, ' ').replace(/[\p{Extended_Pictographic}️‍]/gu, ' ').replace(/\s+/g, ' ').trim();
  const letters = bareText.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && !PURE_REACTION.test(bareText.replace(/[^\p{L}\p{N}+]/gu, '')) ? bareText : '';
}

function clipQuote(text, max) {
  const t = String(text || '').replace(/[«»]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '')}…`;
}

function rumorTopics(state, opts = {}) {
  const feed = normalizeFeed(state && state.feed);
  const today = state && state.calendar && state.calendar.day;
  if (!today) return [];
  const items = feed.items;
  const byId = new Map(items.map((x) => [x.id, x]));
  const facts = new Map(items.filter((x) => x.kind === 'fact').map((x) => [x.id, x]));
  const refOf = (r) => {
    const own = r.occ && r.occ.kind === 'event' ? r.occ.ref : '';
    if (own || !r.parent) return own;
    const up = byId.get(r.parent);
    return up && up.occ && up.occ.kind === 'event' ? up.occ.ref : '';
  };
  const topics = new Map();
  const topic = (ref) => {
    if (!topics.has(ref)) topics.set(ref, { ref, fact: facts.get(ref) || null, replies: [], first: Infinity });
    return topics.get(ref);
  };
  items.forEach((x, i) => {
    if (x.kind === 'fact') {
      if (x.rumor === true) { const t = topic(x.id); t.first = Math.min(t.first, i); }
      return;
    }
    const ref = refOf(x);
    if (!ref) return;
    const t = topic(ref);
    t.replies.push({ r: x, i });
    t.first = Math.min(t.first, i);
  });
  const known = nameStems(state, opts);
  const speaker = (r) => (r.chan === 'anon' ? ANON_VOICE : r.who ? preferredName(findPerson(state, r.who), r.who) : '');
  const mentions = (text) => String(text).split(/[^\p{L}]+/u).some((w) => w.length >= 4 && known.has(w.toLowerCase().replace(/ё/g, 'е').slice(0, 5)));
  const out = [];
  for (const t of topics.values()) {
    const { fact } = t;
    if (/^prep/.test(t.ref) || (fact && (fact.minor || fact.status === 'expired' || /^prep:/.test(fact.src)))) continue;
    const claim = bare(fact ? fact.gist || fact.text : (t.replies.find((p) => p.r.factText) || { r: {} }).r.factText);
    if (!claim) continue;
    const unverified = fact ? fact.rumor === true : t.replies.some((p) => p.r.rumor);
    if (fact && fact.private && !unverified) continue;
    const days = [fact && fact.at.day, ...t.replies.map((p) => p.r.at.day)].filter(Boolean).sort();
    const age = days.length ? diffDays(days[days.length - 1], today) : -1;
    if (!(age >= 0 && age <= RUMOR_RULES.keepDays)) continue;
    const seenText = new Set();
    const voices = [];
    for (const { r, i } of t.replies) {
      const s = substance(r.text);
      const who = speaker(r);
      if (!s || !who || seenText.has(s.toLowerCase())) continue;
      seenText.add(s.toLowerCase());
      voices.push({ who, key: r.chan === 'anon' ? `anon:${r.who}` : who, text: r.text, i, hit: mentions(r.text) ? 1 : 0 });
    }
    const authors = new Set(voices.map((v) => v.key)).size;
    const loud = Math.max(numberOr(fact && fact.loud, 0), ...t.replies.filter((p) => !p.r.parent).map((p) => numberOr(p.r.loud, 0)));
    const ok = unverified ? loud >= RUMOR_RULES.loud || authors >= RUMOR_RULES.voices : authors >= RUMOR_RULES.voices;
    if (!ok) continue;
    const first = [...voices].sort((a, b) => b.hit - a.hit || a.i - b.i)[0];
    const second = first && [...voices].filter((v) => v.key !== first.key).sort((a, b) => b.hit - a.hit || b.i - a.i)[0];
    const quotes = [first, second].filter(Boolean).sort((a, b) => a.i - b.i);
    out.push({ ref: t.ref, claim, unverified, loud, authors, first: t.first, quotes });
  }
  return out
    .sort((a, b) => b.loud - a.loud || b.authors - a.authors || a.first - b.first)
    .slice(0, RUMOR_RULES.max)
    .sort((a, b) => a.first - b.first);
}

function preferredName(p, fallback) {
  if (!p) return fallback;
  return latinName(p.aliases) || p.name || fallback;
}

function nameStems(state, opts = {}) {
  const names = [...(state && state.teachers || []), ...(state && state.classmates || [])].flatMap((p) => [p && p.name, ...((p && p.aliases) || [])]);
  const n = opts.names || {};
  names.push(...[].concat(n.user || []), ...[].concat(n.char || []));
  const out = new Set();
  for (const w of names.filter((x) => typeof x === 'string').join(' ').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}]+/u)) if (w.length >= 4) out.add(w.slice(0, 5));
  return out;
}

function rumorHints(h, known) {
  const isName = (w) => /^[A-ZА-ЯЁ]/.test(String(w || '')) || known.has(String(w || '').toLowerCase().replace(/ё/g, 'е').slice(0, 5));
  const named = (t) => String(t || '').split(/[^\p{L}]+/u).some((w) => w.length >= 4 && known.has(w.toLowerCase().replace(/ё/g, 'е').slice(0, 5)));
  return {
    ...h,
    stems: (Array.isArray(h.stems) ? h.stems : []).filter((s) => !isName(s && s.stem)),
    latin: (Array.isArray(h.latin) ? h.latin : []).filter((t) => !named(t)),
    seen: [],
  };
}

function topicWords(claim, known) {
  const words = String(claim || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean).slice(1).filter((w) => !/^[A-ZА-ЯЁ]/.test(w.replace(/^[^\p{L}]+/u, '')));
  return contentWords(words.join(' ')).filter((w) => !known.has(w.toLowerCase().replace(/ё/g, 'е').slice(0, 5)));
}

export function rumorEntries(state, preset, opts = {}) {
  const known = nameStems(state, opts);
  return rumorTopics(state, opts).map((r) => {
    const short = r.claim.replace(/\s*\([^)]*\)/g, '').trim();
    const title = short.length > 60 ? `${short.slice(0, 57).replace(/\s+\S*$/, '')}…` : short;
    const head = [
      `[${r.unverified ? 'RUMOR' : 'COHORT TALK'} — ${title || r.claim}]`,
      fill(templateOf(preset, r.unverified ? 'rumorClaim' : 'rumorPublic'), { claim: r.claim }),
    ].join('\n');
    const tail = r.quotes.length ? [templateOf(preset, 'rumorSay'), ...r.quotes.map((q) => `- ${q.who}: «${clipQuote(q.text, RUMOR_RULES.quote)}»`)].join('\n') : '';
    return entry({
      uid: `koldo:rumor:${r.ref}`,
      category: 'chronicle',
      kind: 'rumor',
      title: `Слух: ${title || r.claim}`,
      spec: { type: 'event', words: topicWords(r.claim, known), people: [] },
      quiet: true,
      content: tail ? `${head}\n${tail}` : head,
      tail,
      order: 12,
    });
  });
}

export function suggestedEntry(raw, preset) {
  if (!raw || !raw.name) return null;
  const place = raw.kind === 'places';
  const id = String(raw.id || raw.name).trim();

  const e = entry({
    uid: `koldo:${place ? 'place' : 'npc'}:${id}`,
    category: place ? 'places' : 'people',
    kind: 'suggested',
    title: String(raw.name),
    spec: place ? { type: 'event', words: [String(raw.name)] } : { type: 'person', name: String(raw.name), aliases: [] },
    content: fill(templateOf(preset, place ? 'place' : 'npc'), {
      ...vocabVars(preset),
      name: String(raw.name),
      note: String(raw.note || ''),
    }).trim(),
    order: place ? 40 : 45,
    origin: 'suggested',
  });
  return withKeys([e], {}, {})[0];
}

function keyContext(state, opts = {}) {
  const roleWords = new Set();
  for (const t of state.teachers || []) {
    for (const w of String(t.post || '').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}]+/u)) if (w.length >= 3) roleWords.add(w);
  }
  const names = opts.names || {};
  const exclude = [...[].concat(names.user || []), ...[].concat(names.char || [])].filter(Boolean);
  const feed = (state && state.feed) || {};
  const essence = essenceWords([names.essence, feed.heroineTemper].filter(Boolean).join(' '));
  return { roleWords, exclude, chatText: opts.chatText || '', essenceWords: essence };
}

export function withKeys(entries, hints = {}, ctx = {}) {
  const map = composeAll(entries.map((e) => ({ uid: e.uid, spec: e.spec, hints: hints[e.uid] || null })), keyContext(ctx.state || {}, ctx));
  return entries.map((e) => ({ ...e, keys: map.get(e.uid) || [] }));
}

export function buildEntries(state, preset, opts = {}) {
  const people = [...(state.teachers || []), ...(state.classmates || [])]
    .map((p) => personEntry(state, p, preset))
    .filter(Boolean);
  const chronicle = [
    ...rumorEntries(state, preset, opts),
  ];
  const all = [charterEntry(state, preset), heroineEntry(state), vocabEntry(state, preset), ...people, ...chronicle].filter(Boolean);
  return withKeys(all, {}, { ...opts, state }).filter((e) => e.constant || e.keys.length);
}

export function localizeEntries(entries, cache, opts = {}) {
  const hints = {};
  const known = nameStems(opts.state, opts);
  const done = entries.map((e) => {
    const c = cache && cache[e.uid];
    if (!c || c.src !== e.fingerprint || !c.en) return e;
    if (c.hints) hints[e.uid] = e.kind === 'rumor' ? rumorHints(c.hints, known) : c.hints;
    return { ...e, src: e.fingerprint, content: c.en, fingerprint: fingerprint(c.en), lang: 'en' };
  });
  return withKeys(done, hints, { ...opts, state: opts.state });
}

export function diffEntries(entries, snapshot, preset, opts = {}) {
  const have = new Map((snapshot || []).map((s) => [s.uid, s]));
  const cap = entryCap(preset, opts);
  const create = [];
  const update = [];
  const keep = [];
  const skipped = [];
  const evict = [];
  const list = entries || [];

  const flexible = (e) => e.category === 'chronicle' && !e.constant && !isHandEdited(have.get(e.uid));
  const planned = new Set(list.map((e) => e.uid));
  const flexSet = new Set(list.filter(flexible).map((e) => e.uid));
  const isFlex = (e) => flexSet.has(e.uid);
  let room = cap - [...have.keys()].filter((u) => !planned.has(u)).length - list.filter((e) => have.has(e.uid) && !isFlex(e)).length;
  const fixedNew = new Set();
  for (const e of list) {
    if (have.has(e.uid) || isFlex(e) || room <= 0) continue;
    fixedNew.add(e.uid);
    room -= 1;
  }
  const flex = list.filter((e) => flexSet.has(e.uid));
  const ranked = [...flex.filter((e) => e.kind !== 'rumor'), ...flex.filter((e) => e.kind === 'rumor').reverse()];
  const stay = new Set(ranked.slice(0, Math.max(room, 0)).map((e) => e.uid));

  for (const e of list) {
    const was = have.get(e.uid);

    if (!was) {
      if (fixedNew.has(e.uid) || stay.has(e.uid)) create.push(e);
      else skipped.push({ uid: e.uid, category: e.category, reason: SKIP_CAP });
      continue;
    }

    have.delete(e.uid);
    if (isFlex(e) && !stay.has(e.uid)) {
      evict.push({ uid: e.uid, category: e.category });
      continue;
    }
    if (isHandEdited(was)) {
      keep.push({ uid: e.uid, reason: KEEP_EDITED, entry: e });
    } else if (String(was.content) === e.content && keysSettled(was, e)) {
      keep.push({ uid: e.uid, reason: KEEP_UNCHANGED, entry: e });
    } else {
      update.push(e);
    }
  }

  for (const s of have.values()) keep.push({ uid: s.uid, reason: KEEP_FOREIGN });

  return { create, update, keep, skipped, evict };
}

export function keysSettled(was, e) {
  if (!Array.isArray(was.keys)) return true;
  if (was.keys.join('\n') === e.keys.join('\n')) return true;
  return keysEdited(was);
}

export function keysEdited(was) {
  return Boolean(was && was.keysMark && Array.isArray(was.keys) && fingerprint(was.keys.join('\n')) !== String(was.keysMark));
}

export function isHandEdited(snapshotEntry) {
  if (!snapshotEntry) return false;
  if (snapshotEntry.edited === true) return true;
  if (!snapshotEntry.fingerprint) return false;
  return fingerprint(snapshotEntry.content) !== String(snapshotEntry.fingerprint);
}

export function buildLorebook(state, preset, opts = {}) {
  const built = buildEntries(state, preset, opts);
  const entries = opts.cache ? localizeEntries(built, opts.cache, { ...opts, state }) : built;
  const diff = diffEntries(entries, opts.snapshot, preset, opts);

  const suggest = [
    ...(opts.places || []).map((p) => suggestedEntry({ ...p, kind: 'places' }, preset)),
    ...(opts.npcs || []).map((n) => suggestedEntry({ ...n, kind: 'people' }, preset)),
  ].filter(Boolean).filter((e) => !(opts.snapshot || []).some((s) => s.uid === e.uid));

  const kept = diff.keep.map((k) => k.entry || snapshotAsEntry(opts.snapshot, k.uid)).filter(Boolean);
  const after = [...diff.create, ...diff.update, ...kept];
  const cap = entryCap(preset, opts);
  const m = measure(after, preset);

  return {
    ...diff,
    suggest,
    entries,
    measure: { ...m, cap, withinCap: m.entries <= cap },
  };
}

export function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function entry(raw) {
  const content = String(raw.content || '').trim();
  return {
    uid: raw.uid,
    category: raw.category,
    kind: raw.kind || 'npc',
    title: String(raw.title || '').trim(),
    spec: raw.spec || { type: 'none' },
    quiet: Boolean(raw.quiet),
    keys: (raw.keys || []).filter((k) => String(k || '').trim()).map(String),
    content,
    constant: Boolean(raw.constant),
    order: numberOr(raw.order, 0),
    origin: raw.origin || 'own',
    fingerprint: fingerprint(content),
    ...(raw.day ? { day: raw.day } : {}),
    ...(raw.tail ? { tail: String(raw.tail) } : {}),
    ...(raw.lang ? { lang: String(raw.lang) } : {}),
  };
}

function bare(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().replace(/[\s.;,]+$/, '');
}

function templateOf(preset, name) {
  const ph = (preset && preset.phrases && preset.phrases.lorebook) || {};
  const own = presetGender(preset) === 'm' ? MALE_TEMPLATES[name] : '';
  return ph[name] || own || DEFAULT_TEMPLATES[name] || '';
}

function vocabVars(preset) {
  const v = (preset && preset.vocab) || {};
  const out = {};
  for (const [k, value] of Object.entries(v)) out[k] = String(value == null ? '' : value);
  return out;
}

const limitsOf = (preset) => (preset && preset.limits) || {};
const reputationLabels = (preset) => (preset && preset.reputation && preset.reputation.labels) || [];

function snapshotAsEntry(snapshot, uid) {
  const s = (snapshot || []).find((x) => x.uid === uid);
  return s ? { uid: s.uid, category: 'chronicle', keys: [], content: String(s.content || '') } : null;
}

function numberOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function personKeys(person, ctx = {}) {
  if (!person || !person.name) return [];
  return withKeys([{ uid: 'person', spec: { type: 'person', name: person.name, aliases: person.aliases || [] } }], {}, ctx)[0].keys;
}
