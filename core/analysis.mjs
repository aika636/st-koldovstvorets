import { parseMarker, keepMarkerKinds, markerKeys, partyOf, salvageMarker, cardDisplayName, splitNewRole, MARKER_RE, HEROINE, SOCIAL_TEXT_MAX } from './parse-marker.mjs';
import { normName } from './stop-names.mjs';
import { isPerson } from './classmates.mjs';
import { sittableExams, kindOf } from './exams.mjs';
import { teacherOfSubject } from './state.mjs';
import { holidaysAhead, holidaysOn } from './holidays.mjs';
import { addDays } from './time.mjs';
import { dayPlan } from './schedule.mjs';
import { EVENT_HORIZON } from './parse-marker.mjs';
import { SCENE_KINDS, sceneText, sceneAbout, personWord } from './scene.mjs';
import { heroGender } from './gender.mjs';
import { subjectWord, upFirst } from './words.mjs';
import { reactionCap, loudCap, LOUDNESS, hash, postRef } from './feed.mjs';
import { isPrepToken, prepTokenOf, prepTokenText, prepTokens } from './prep.mjs';
import { featText, featById, featsPromptLines } from './feats.mjs';

export const ANALYSIS_KINDS = ['grade', 'completion', 'rel', 'attendance', 'event', 'pause', 'fame', ...SCENE_KINDS];

export const ANALYSIS_LIMITS = { reply: 6000, user: 5000, reason: 60 };

const systemOf = (gender) => [
  `You are a school registrar. You get a fragment of a role-play about a ${gender === 'm' ? 'male' : 'female'} final-year student, plus lists of subjects, mentors and students.`,
  `Record only what actually happened in the fragment to ${gender === 'm' ? 'him' : 'her'} and the people around; never invent, omit anything you are unsure of.`,
  'Answer in two blocks: block 1 is one service-marker line, block 2 is «Слышно:» (how loud it was and who saw); then a «Кратко:» line.',
  'Write all free-text values (reasons, descriptions, event names, the summary) in Russian.',
  'Do not write school posts or replies: a separate call composes gossip.',
].join(' ');

export const SOCIAL_LIMITS = { met: 8, clash: 4, act: 4, rumor: 3, new: 3, looks: 6, deal: 4, prep: 3, feat: 1, moment: 1, fame: 1, open: 1, unmask: 1 };

export const REACTION_LIMITS = { text: 200, minLetters: 3 };

export const SOMEONE = 'someone';

export const REPLY_LIMITS = { perPost: 2, total: 4 };

export function replyCap(loud) {
  return loudCap(Number.isInteger(loud) ? loud : 1, REPLY_LIMITS.total);
}

export function someoneWord(preset) {
  const own = preset && preset.vocab && preset.vocab.someone;
  return typeof own === 'string' && own.trim() ? own.trim() : 'кто-то в школе';
}

export function buildAnalysisPrompt(state, preset, input = {}) {
  const gender = heroGender(state, input.heroine);
  const g = (f, m) => (gender === 'm' ? m : f);
  const heroine = str(input.heroine) || g('the heroine', 'the hero');
  const subjects = (state.subjects || []).map((s) => {
    const t = teacherOfSubject(state, s.id);
    return `- ${s.id} — ${s.name || s.id}${t ? ` — ${t.id}` : ''}`;
  });
  const alsoLine = (p) => {
    const ru = /[а-яё]/i.test(p.name || '');
    const flat = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[«»"]/g, '');
    const words = flat(p.name || '').split(/\s+/);
    const list = Array.isArray(p.aliases) ? p.aliases.filter((a) => typeof a === 'string' && a.trim() && (!ru || /[а-яё]/i.test(a)) && !words.includes(flat(a))) : [];
    return list.length ? ` (aka: ${list.join(', ')})` : '';
  };
  const teachers = (state.teachers || []).map((t) => `- ${t.id} — ${t.name || t.id}${alsoLine(t)}`);
  const course = (Array.isArray(state.classmates) ? state.classmates : []).filter((c) => c && c.id).map((c) => {
    const about = classmateLine(c);
    return `- ${c.id} — ${c.name || c.id}${alsoLine(c)}${about ? ` — ${about}` : ''}`;
  });
  const values = ((preset.grades && preset.grades.values) || []).map((g) => g.value);

  const lines = [];
  if (input.statusLine) lines.push(`Calendar: ${input.statusLine}`);
  const latinCards = (Array.isArray(input.cardNames) ? input.cardNames : []).filter((n) => typeof n === 'string' && /[a-z]/i.test(n) && !/[а-яё]/i.test(n));
  if (latinCards.length && /[а-яё]/i.test(str(input.reply))) {
    lines.push(`Name the card character (${latinCards.join(', ')}) in Russian as in the reply, not in Latin: in keys (@card/name) and in «Кратко».`);
  }
  lines.push(`${upFirst(subjectWord(preset, 'many'))} (id — name — mentor id):`, ...subjects);
  lines.push('Mentors (id — name):', ...teachers);
  lines.push('Students (id — name — about):', ...(course.length ? course : ['- none yet']));
  const bare = [...(state.teachers || []), ...(Array.isArray(state.classmates) ? state.classmates : [])].filter((p) => p && p.id && !str(p.looks));
  if (bare.length) lines.push(`No recorded appearance: ${bare.slice(0, 40).map((p) => p.id).join(', ')}.`);
  if (values.length) lines.push(`Grade values: ${values.join(', ')}.`);
  const debts = (state.subjects || []).filter((subject) => subject.debt);
  lines.push(`Current debts: ${debts.length ? debts.map((subject) => subject.id).join(', ') : 'none'}.`);
  const exams = input.exams === false ? [] : todaysExamLines(state, preset);
  if (exams.length) {
    lines.push(`Scheduled today: ${exams.join('; ')}. If it was passed or failed in the fragment, record the outcome as grade for that subject.`);
  }
  const lessons = lessonLines(state, preset);
  if (lessons.length) lines.push(`Today's lessons (id — name — mentor id): ${lessons.join('; ')}.`);
  const hooks = (Array.isArray(input.hooks) ? input.hooks : []).filter((h) => h && h.id && h.text).slice(0, 3);
  if (hooks.length) lines.push('Hooks the player gave the narrator (id — what):', ...hooks.map((h) => `- ${h.id} — ${clip(h.text, 200)}`));
  const preps = (Array.isArray(input.preps) ? input.preps : []).filter((n) => n && n.id && n.text).slice(0, 3);
  if (preps.length) lines.push('NPC intentions (id — who — what):', ...preps.map((n) => `- ${n.id} — ${clip(n.text, 200)}`));
  const known = knownEventLines(state, preset);
  lines.push(`Already planned (do not repeat): ${known.length ? known.join('; ') : 'nothing'}.`);
  const feats = input.feats === false ? { context: [], rules: [] } : featsPromptLines(state, preset, { char: [].concat(input.cardNames || [])[0] || '', heroine, gender, ahead: input.feats && input.feats.ahead ? 1 : 0 });
  lines.push(...feats.context);
  lines.push('');
  const said = clipAnalysisReply(stripForeignMarkup(str(input.userText)), ANALYSIS_LIMITS.user);
  if (said) {
    lines.push(`The player's line before the reply is also part of the fragment: it says what ${heroine} does.`, '"""', said, '"""', '');
  }
  lines.push('Narrator reply:', '"""', clipAnalysisReply(stripForeignMarkup(input.reply)), '"""', '');
  lines.push(
    'Block 1. What happened, as one service-marker line:',
    `<!-- [KOLDO grade=subject:score:reason rel=person:minor+:reason skip=subject late=subject event=+3:name met=student clash=who:with:reason act=who:what:with:kind:access:reach rumor=about:claim looks=who:description open=who unmask=who deal=who:to:what fame=+:reason${feats.rules.length ? ' ach=id:reason' : ''}] -->`,
    'Block 1 rules. Everywhere: write only what the text states, not its likely consequences (an apology is not a reconciliation, a frown is not a quarrel); read the whole fragment; ids come from the lists above; keys may repeat; no time or date except days in event; nobody outside the lists (except act names, see act); open, unmask and fame at most once per reply.',
    `- grade: ${heroine} got a grade, passed or failed a test or exam, or a mentor explicitly rated ${g('her', 'his')} work in class (named a score, praised or scolded with a verdict): 2–5 by meaning (scolding 2, redo 2–3, fine 3–4, praise 5) for the subject of that lesson (see today's lessons); reason in 3–5 words, e.g. grade=subject:4:похвалил за чёткие знаки. One grade per lesson, none without an explicit rating, never for others. If the subject is unclear, do not guess it from an unnamed mentor; one good answer gives no grades for other subjects. Results may sit in the background, a memory or someone's line, even in a domestic or romantic scene.`,
    ...(said ? [`- The player's line counts: what ${heroine} did there (an action, words said aloud, a visible result) happened unless the reply contradicts it — a brilliant answer in class, an exploded cauldron, a kiss, a dance, a fight: write act, fame, grade and the rest from it too. Intention, thought, dream, question and an unfinished attempt (${g('попыталась', 'попытался')}) did not happen. Witnesses named in the player's line are witnesses: judge access from both texts. One event shown in both texts is one key.`] : []),
    `- completion=all:grade, completion=debts:grade, completion=id:grade: an explicit statement that all exams/tests are passed, all debts closed, or a named listed subject passed. "All" must be said about ${heroine}'s own exams (wish, plan, "not all yet", others' results do not count). Top marks = the highest grade on the scale; no exact grade — «зачёт» if on the scale; never invent a number. An answer at the board stays grade; do not duplicate completion with grade for the same items.`,
    `- rel: a mentor's or student's attitude to ${heroine} noticeably changed: minor+/minor- (slightly), major+/major- (strongly); reason in 2–3 words.`,
    `- skip: ${heroine} skipped a lesson; late: was late. Only on a direct statement; a date jump, day off, end of exam week, home scene or no lessons shown prove nothing, never infer from the calendar.`,
    `- event=+days:name: a holiday, party, ball, concert, trip, date or other event said to be coming; days from the scene (0 today, 1 tomorrow; a run +5..+6). Detention, punishment or an assignment to specific people is deal. Skip it if beyond ${EVENT_HORIZON} days, undated, past or already planned.`,
    ...pauseRules(state),
    '- met: students and mentors present in the scene (speaking, acting or described as there), comma-separated. Only mentioned, recalled, discussed or rumored people are not present.',
    `- clash=who:with:reason (2–3 words): a plain spat between students; ${heroine} is @heroine. A real quarrel is better an act with kind «конфликт».`,
    `- act=who:what:with:kind:access:reach, optionally say="detail": one per outwardly observable action (no thoughts, feelings or motives) of the main pair (${heroine} and the card character), together or apart, or of other students.`,
    '  who/with: id, @heroine or @card/name; with is empty for a solo action. A person outside the lists: write the name as is only if next to the main pair or acting alone; never anonymous («кто-то», a crowd).',
    '  what: short, in Russian, as in the text, with no added gestures or details.',
    '  kind, one Russian word: близость, конфликт, помощь, отказ, достижение, провал, уход, появление. конфликт is only quarrel, abuse, threat, insult, fight, attack; holding, pulling close, catching up, anxious questioning, scolding out of fear in a romantic or caring scene is близость or помощь; in doubt, not конфликт.',
    `  access, one Russian word, per action: на людях — any witness in the room or near (even two or three); наедине — nobody near; подслушали — the two think they are alone but the text has someone hiding, peeping or eavesdropping (then no private for it). Public stays на людях even if the pair was alone afterwards. Secret acts (planted note, theft, blackmail) that only ${heroine} saw are наедине even in a crowd.`,
    '  reach, one Russian word: многие — a crowd, a hall, a full corridor; несколько — a couple of witnesses; неизвестно.',
    '  with: whom the action is aimed at, named in the text by name or unambiguous role (healed a beast — the beast); not someone merely mentioned, nearby or from another line. Never match a title or nickname («староста», «старик») to a listed person by guess: leave empty. Words and deeds belong to who said or did them.',
    '  One act per event: a same-kind reply by the same pair ("hugged back") is not separate, a reply of another kind is (insulted — slapped). A loud public mishap of a main character alone (fell off a broom, punished, lost points) is an act too (провал, уход or появление).',
    '  say: a short verbatim quote or visible detail from the text; none — omit.',
    `  Example: act=@heroine:${g('обняла', 'обнял')} при всех:@card/Имя:близость:на людях:многие:"Только не отпускай"; act=@heroine:${g('сдала', 'сдал')} зачёт с первого раза::достижение:на людях:несколько.`,
    "  Which acts: from the player's line and the reply together; new first (a gesture continued from earlier turns is not new). Do not lose public deeds unrelated to the pair: reading out a letter or news, open defiance, mockery, refusal to obey, a mentor's intervention or punishment (stopped, scolded, took points, summoned) or arrival mid-scene — each its own act (a mentor id fits as who). Usually 1–3, at most four; priority: in front of witnesses, then the pair's, then the rest; merge small gestures of one scene.",
    '- rumor=about:claim: a rumor spread or retold in the fragment; about = id or @heroine; claim continues «говорят, что <он/она> …»: rumor=sokolova:списала контрольную.',
    `- looks=id:description${bare.length ? ' (only for people in "No recorded appearance")' : ''}: appearance described in the reply. Start with who it is and apparent age, then hair, eyes, face, height, clothes, marks; up to 160 characters, only what is written, lasting traits only (not traces, dirt, blood, bruises, lipstick, pose, expression). Not described — no key; never for ${heroine} or the card character.`,
    `- deal=who:to:what: a commitment between people (promise, debt, joint project, item to return). who = the one who owes or is assigned detention, punishment or a fine; to = whom they owe (detention given to ${heroine}: who=@heroine, to=the one who assigned it). Closed: deal-=who:to:what.`,
    "- open=id: the text says or shows outright that a person's secret became known to others (a hidden relationship, true face, what they hid). A hint, suspicion, guess or rumor is not open.",
    `- unmask=id: ${heroine} learned who writes the anonymous «Сорока на хвосте» notes (thrown, nailed to the board, found). A guess without proof is not unmask.`,
    `- fame: only if ${heroine} personally did something in public that made witnesses treat ${g('her', 'him')} better (fame=+:reason) or worse (fame=-:reason): ${g('защитила, победила, блеснула', 'защитил, победил, блеснул')} in class / ${g('сорвалась, опозорилась, нарушила', 'сорвался, опозорился, нарушил')} a known rule. A quarrel or closeness alone, anything in private, a retelling or memory is not fame.`,
    ...(hooks.length ? [`- played=id: a hook from "Hooks" actually came up in the fragment. An invitation hook came up only if the inviter himself invites ${heroine}; if someone else is invited, or he says he was invited — omit.`] : []),
    ...(preps.length ? ['- prep=id:done or prep=id:failed: an intention from "NPC intentions" was explicitly fulfilled (done) or fell through (failed) in this fragment; expectations and plans do not count.'] : []),
    ...feats.rules,
    '- Nothing happened — the empty marker <!-- [KOLDO] -->.',
    '',
    'Block 2. Слышно: how loud this will be at school and whether it was public. It changes nothing in the ledger; no posts, replies or nicknames. Lines:',
    'Слышно:',
    'loud=0..3',
    'private=marker key numbers',
    'Block 2 rules. loud: 0 quiet (ordinary grade, chat), 1 noticeable, 2 loud (public skipping, quarrel), 3 the whole school (scandal, confession from the stage). private: only what happened without witnesses (closed-door talk, whisper, secret meeting): 1-based ordinal numbers of block 1 keys, comma-separated, e.g. private=2,3; leave out public ones; none — no line.',
    '',
    `Last line: «Кратко:» and one sentence on what happened in the fragment with ${heroine}'s studies and the people around (lessons, grades, mentors, skipping, classmates) — or «к учёбе не относится».`,
  );
  return { system: systemOf(gender), user: lines.join('\n') };
}

const TEXT_TAGS = 'b|i|u|s|em|strong|del|ins|sub|sup|small|big|mark|span|p|br|hr|div|font|center|blockquote|q|code|pre|a|ul|ol|li|details|summary|h[1-6]';

const IMG_RE = /<img(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/gi;

const FOREIGN_BLOCK_RE = new RegExp(`<(?!(?:${TEXT_TAGS})[\\s>/])([a-z][\\w-]*)(?:\\s[^>]*)?>[\\s\\S]*?</\\1\\s*>`, 'gi');

export function stripForeignMarkup(text) {
  if (typeof text !== 'string' || !text) return '';
  return text
    .replace(IMG_RE, '')
    .replace(FOREIGN_BLOCK_RE, '')
    .replace(/<(div|p|span|center)\b[^>]*>\s*<\/\1>/gi, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function classmateLine(c) {
  const parts = [];
  if (str(c.desire)) parts.push(`хочет ${str(c.desire)}`);
  if (str(c.problem)) parts.push(str(c.problem));
  return parts.join('; ').slice(0, 140);
}

function pauseRules(state) {
  const day = state && state.calendar && state.calendar.day;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(day)) ? ` Scene day: ${day} (YYYY-MM-DD).` : '';
  return [
    `- pause=days:name: classes HAVE STOPPED: the text says outright that holidays began, the school closed or there are no classes (quarantine, all lessons cancelled). days = days without classes counting the scene day (a week — 7; until the 20th — through the 20th inclusive). No end named — pause=open:name. Classes resumed — pause=end.${today}`,
    '  Only a direct, completed fact; a wish, guess, rumor, memory, undecided plan or one cancelled lesson or day is not pause. Yes: «Школу закрыли на неделю из-за потопа» — pause=7:закрытие из-за потопа; «Занятий нет до весны» — pause=open:каникулы до весны. No: «Скорее бы каникулы». Write it once, in the reply that announced it; do not repeat a running period from "Already planned" unless its term changed.',
  ];
}

function knownEventLines(state, preset) {
  const day = state && state.calendar && state.calendar.day;
  if (!day) return [];
  try {
    const now = holidaysOn(preset, day, state).map((h) => `${h.name} (идёт сейчас${h.open ? ', до отмены' : h.pause ? `, до ${dayWord(h.to)}` : ''})`);
    const ahead = holidaysAhead(preset, day, EVENT_HORIZON + 1, state).map((a) => `${a.holiday.name} (+${a.days})`);
    return [...now, ...ahead].slice(0, 12);
  } catch {
    return [];
  }
}

function lessonLines(state, preset) {
  const seen = new Set();
  return dayPlan(state, preset).filter((p) => !seen.has(p.subjectId) && seen.add(p.subjectId)).map((p) => `${p.subjectId} — ${p.name}${p.teacherId ? ` — ${p.teacherId}` : ''}`);
}

function todaysExamLines(state, preset) {
  let items = [];
  try {
    items = sittableExams(state, preset);
  } catch {
    return [];
  }
  return items.map((item) => {
    const kind = kindOf(preset, item.kind);
    const subject = (state.subjects || []).find((s) => s.id === item.subjectId);
    return `${(kind && kind.name) || item.kind}: ${(subject && subject.name) || item.subjectId} (${item.subjectId})`;
  });
}

export function parseAnalysis(raw, lexicon, opts = {}) {
  const postsOn = !opts || opts.posts !== false;
  let text = String(raw || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  let found = new RegExp(MARKER_RE.source, 'i').test(text);
  let partial = false;
  if (!found) {
    const saved = salvageMarker(text);
    if (saved) {
      text = text.slice(0, saved.start) + saved.marker + text.slice(saved.end);
      found = true;
      partial = saved.partial;
    }
  }
  const tokens = [];
  const rejected = [];
  const byNumber = [];
  const counts = {};
  const evOf = new Map();
  const hookIds = new Set((Array.isArray(lexicon && lexicon.hooks) ? lexicon.hooks : []).map((h) => h && h.id).filter(Boolean));
  for (const k of markerKeys(text)) {
    if (COMPOSED_KEYS.includes(k.name)) continue;
    if (PREP_KEYS.includes(k.name)) {
      byNumber.push(null);
      const r = readPrep(k.value, lexicon);
      if (r.error) rejected.push({ raw: k.raw, reason: r.error });
      else if (!tokens.includes(r.token)) {
        if ((counts.prep || 0) >= SOCIAL_LIMITS.prep) rejected.push({ raw: k.raw, reason: `больше ${SOCIAL_LIMITS.prep} ключей prep на один ответ` });
        else {
          counts.prep = (counts.prep || 0) + 1;
          tokens.push(r.token);
        }
      }
      continue;
    }
    if (PLAYED_KEYS.includes(k.name)) {
      byNumber.push(null);
      for (const id of String(k.value || '').split(/[,\s]+/).map((v) => v.replace(/[[\]()«»"]/g, '').trim().toLowerCase()).filter(Boolean)) {
        const t = `played=${id}`;
        if (!hookIds.has(id)) rejected.push({ raw: t, reason: 'такого повода секретарю не давали' });
        else if (!tokens.includes(t)) tokens.push(t);
      }
      continue;
    }
    if (!k.kind) {
      byNumber.push(null);
      continue;
    }
    if (!k.value) {
      rejected.push({ raw: k.raw, reason: 'пустое значение' });
      byNumber.push(null);
      continue;
    }
    const parsed = parseMarker(analysisMarker([k.raw]), lexicon);
    rejected.push(...parsed.rejected);
    let first = null;
    for (const ev of parsed.events) {
      const t = tokenOf(ev);
      if (!t) continue;
      evOf.set(t, ev);
      const kind = ev.kind === 'feat' && ev.moment ? 'moment' : ev.kind;
      const limit = SOCIAL_LIMITS[kind];
      if (!tokens.includes(t)) {
        if (limit !== undefined && (counts[kind] || 0) >= limit) {
          rejected.push({ raw: k.raw, reason: `больше ${limit} ключей ${kind} на один ответ` });
          continue;
        }
        counts[kind] = (counts[kind] || 0) + 1;
        tokens.push(t);
      }
      first = first || t;
    }
    byNumber.push(first);
  }

  const lookers = new Set();
  for (const t of [...tokens]) {
    const ev = evOf.get(t);
    if (!ev || ev.kind !== 'looks') continue;
    const people = [...arr(lexicon.classmates), ...arr(lexicon.teachers)];
    const named = ev.personId ? people.find((p) => p && p.id === ev.personId) : people.find((p) => p && isPerson(p, ev.name));
    const fresh = !named && [...evOf.values()].some((e) => e.kind === 'new' && isPerson({ name: e.name }, ev.name));
    const waiting = !named && !fresh && arr(lexicon.candidates).some((p) => p && isPerson(p, ev.name));
    const key = named ? named.id : normName(ev.name);
    const reason = !named && !fresh && !waiting ? `нет такого человека: «${ev.name}»`
      : named && named.looks ? `у «${named.name || named.id}» внешность уже есть`
        : lookers.has(key) ? 'внешность этого человека уже записана' : '';
    if (!reason) { lookers.add(key); continue; }
    tokens.splice(tokens.indexOf(t), 1);
    byNumber.forEach((x, i) => { if (x === t) byNumber[i] = null; });
    rejected.push({ raw: t, reason });
  }
  tokens.sort((a, b) => a.startsWith('looks=') - b.startsWith('looks='));

  const pairKey = (ev) => [ev.a, ev.b].sort().join('|');
  const conflicts = new Map();
  for (const t of tokens) {
    const ev = evOf.get(t);
    if (ev && ev.kind === 'act' && ev.type === 'конфликт' && ev.b) conflicts.set(pairKey(ev), t);
  }
  const verbStem = (what) => String(what || '').toLowerCase().replace(/ё/g, 'е').trim().split(/\s+/)[0].slice(0, 4);
  const acts = new Map();
  for (const t of [...tokens]) {
    const ev = evOf.get(t);
    if (!ev || ev.kind !== 'act' || !ev.b) continue;
    const twin = acts.get(`${ev.type}|${ev.b}|${ev.a}`);
    const counter = twin && ev.type === 'конфликт' && verbStem(ev.what) !== verbStem((evOf.get(twin) || {}).what);
    if (!twin || counter) { acts.set(`${ev.type}|${ev.a}|${ev.b}`, t); continue; }
    tokens.splice(tokens.indexOf(t), 1);
    byNumber.forEach((x, i) => { if (x === t) byNumber[i] = twin; });
    rejected.push({ raw: t, reason: 'то же действие в ответ уже записано' });
  }
  for (const t of [...tokens]) {
    const ev = evOf.get(t);
    const twin = ev && ev.kind === 'clash' ? conflicts.get(pairKey(ev)) : null;
    if (!twin) continue;
    tokens.splice(tokens.indexOf(t), 1);
    byNumber.forEach((x, i) => { if (x === t) byNumber[i] = twin; });
    rejected.push({ raw: t, reason: 'уже есть act-конфликт' });
  }

  const loudMatch = /(?<![\p{L}\d_])(?:loud|громкость)\s*[=:]\s*([0-3])/iu.exec(text);
  const loud = loudMatch ? Number(loudMatch[1]) : null;
  const cap = loudCap(loud === null ? 1 : loud, reactionCap(lexicon));
  const reactions = [];
  const seenText = new Set();
  const slots = [];
  for (const value of postsOn ? reactionValues(text) : []) {
    const r = readReaction(value, tokens, byNumber, lexicon);
    const raw = `react=${value}`;
    slots.push(null);
    if (r.error) {
      rejected.push({ raw, reason: r.error });
      continue;
    }
    const key = textKey(r.text);
    if (seenText.has(key)) {
      rejected.push({ raw, reason: 'повтор реакции' });
      continue;
    }
    if (reactions.length >= cap) {
      rejected.push({ raw, reason: `реакций больше, чем стоит событие (до ${cap})` });
      continue;
    }
    seenText.add(key);
    const t = reactionToken(r);
    reactions.push(t);
    slots[slots.length - 1] = t;
  }

  const replies = [];
  const perPost = new Map();
  const voices = new Map();
  const replyMax = replyCap(loud === null ? 1 : loud);
  for (const value of postsOn ? reactionValues(text, REPLY_WORDS) : []) {
    const raw = `reply=${value}`;
    const a = readReply(value, slots, lexicon);
    if (a.error) {
      rejected.push({ raw, reason: a.error });
      continue;
    }
    const key = textKey(a.text);
    if (seenText.has(key)) {
      rejected.push({ raw, reason: 'повтор реплики' });
      continue;
    }
    if (replies.length >= replyMax) {
      rejected.push({ raw, reason: `ответов больше, чем стоит событие (до ${replyMax})` });
      continue;
    }
    if ((perPost.get(a.parent) || 0) >= REPLY_LIMITS.perPost) {
      rejected.push({ raw, reason: `под одним постом — до ${REPLY_LIMITS.perPost} ответов` });
      continue;
    }
    const me = voiceOf(a.who);
    const heard = voices.get(a.parent) || [];
    if (me && me === a.parentVoice && !a.answered && !heard.some((v) => v !== me)) {
      rejected.push({ raw, reason: 'автор поста отвечает сам себе' });
      continue;
    }
    seenText.add(key);
    perPost.set(a.parent, (perPost.get(a.parent) || 0) + 1);
    voices.set(a.parent, [...heard, me]);
    replies.push(replyToken(a));
  }
  const privates = [];
  for (const value of reactionValues(text, PRIVATE_WORDS)) {
    for (const ref of value.split(/[\s,;]+/).map((v) => v.replace(/[#№[\]()]/g, '').trim()).filter(Boolean)) {
      const n = /^\d{1,2}$/.test(ref) ? Number(ref) : 0;
      const fact = n >= 1 && n <= byNumber.length ? byNumber[n - 1] : null;
      const t = fact ? `private=${factRef(fact)}` : '';
      if (!t) rejected.push({ raw: `private=${ref}`, reason: `нет факта номер ${ref} — нечему быть наедине` });
      else if (!privates.includes(t)) privates.push(t);
    }
  }
  const posted = reactions.length > 0 || replies.length > 0;
  if (posted) tokens.push(...reactions, ...replies);
  tokens.push(...privates);
  if (posted || (loud !== null && (loud >= 2 || rejected.length > 0 || tokens.some(isFactToken)))) tokens.push(`loud=${loud === null ? 1 : loud}`);

  const m = /кратко\s*[:：]\s*(.+)/i.exec(text);
  const summary = m ? tidySummary(m[1].replace(/<!--[\s\S]*?-->/g, ''), lexicon) : '';
  return { found, partial, tokens, summary, rejected };
}

export function tidySummary(text, lexicon) {
  let out = String(text || '').trim();
  out = out.replace(/@(?:card|who)\//g, '');
  out = out.replace(/^(?:к\s+учёбе\s+не\s+относится[\s:.,;—–-]*)+/i, '').trim();
  const names = (lexicon && lexicon.names) || {};
  const lang = ((lexicon && lexicon.survey) || {}).lang || (lexicon && lexicon.lang);
  for (const person of Array.isArray(names.cast) ? names.cast : []) {
    const all = [person && person.name, ...((person && person.aliases) || [])].filter((n) => typeof n === 'string' && n.trim());
    const own = cardDisplayName('', all[0], [person], lang);
    if (!own) continue;
    for (const n of all) {
      if (n === own || /[а-яё]/i.test(n) === /[а-яё]/i.test(own)) continue;
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu'), () => own);
    }
  }
  return out.slice(0, 300);
}

const COMPOSED_KEYS = ['react', 'реакция', 'reply', 'ответ', 'loud', 'громкость', 'private', 'наедине'];

const PRIVATE_WORDS = ['private', 'наедине'];

const REACT_WORDS = ['react', 'реакция'];
const REPLY_WORDS = ['reply', 'ответ'];

function textKey(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const PLAYED_KEYS = ['played', 'сыграно', 'сыгран'];

const PREP_KEYS = ['prep', 'намерение'];
const PREP_RESULTS = { done: 'done', сбылось: 'done', исполнено: 'done', failed: 'failed', сорвалось: 'failed', сорвано: 'failed' };

function readPrep(value, lexicon) {
  const [raw, word = ''] = String(value || '').split(':').map((x) => x.replace(/[[\]()«»"]/g, '').trim());
  const id = raw.toLowerCase();
  const result = PREP_RESULTS[word.toLowerCase()];
  if (!result) return { error: 'исход намерения — done или failed' };
  if (!arr(lexicon && lexicon.preps).some((n) => n && n.id === id)) return { error: 'такого намерения секретарю не давали' };
  return { token: prepTokenOf(id, result) };
}

const CHANNEL_WORDS = {
  chat: ['chat', 'чат', 'чат курса', 'course', 'факт'],
  anon: ['anon', 'анон', 'анонимка', 'аноним', 'слух', 'rumor'],
};

const SOMEONE_WORDS = ['someone', 'кто-то', 'кто то', 'кто-то с потока', 'кто то с потока', 'кто-то с курса', 'кто-то в школе', 'anyone', 'somebody'];

function channelOf(word) {
  const w = String(word || '').toLowerCase().replace(/ё/g, 'е').replace(/[[\]()«»"]/g, '').trim();
  for (const [chan, words] of Object.entries(CHANNEL_WORDS)) if (words.includes(w)) return chan;
  return null;
}

function reactionValues(text, words = REACT_WORDS) {
  const out = [];
  const re = new RegExp(`(?<![\\p{L}\\d_])(?:${words.join('|')})\\s*=\\s*([^\\n]*)`, 'giu');
  for (const m of text.matchAll(re)) {
    let v = m[1];
    const stop = v.search(/-->|\s[\p{L}\d_-]{1,24}\s*=/u);
    if (stop >= 0) v = v.slice(0, stop);
    v = v.replace(/\]{1,2}\s*$/, '').trim();
    if (v) out.push(v);
  }
  return out;
}

function readReaction(value, tokens, byNumber, lexicon) {
  const fields = value.split(':');
  const ref = fields[0].replace(/[#№[\]()]/g, '').trim().toLowerCase();
  let fact = null;
  if (/^\d{1,2}$/.test(ref)) {
    const n = Number(ref);
    if (n < 1 || n > byNumber.length) return { error: `нет факта номер ${n}` };
    fact = byNumber[n - 1];
    if (!fact) return { error: `факт номер ${n} не записан — реакция без опоры` };
  } else if (ref) {
    fact = tokens.find((t) => t.startsWith(`${ref}=`) && isFactToken(t)) || null;
    if (!fact) return { error: `нет факта «${ref}»` };
  } else {
    return { error: 'реакция без ссылки на факт' };
  }
  let who = '';
  let chan = 'chat';
  let rest;
  if (channelOf(fields[1])) {
    chan = channelOf(fields[1]);
    rest = fields.slice(2);
  } else if (channelOf(fields[2])) {
    who = fields[1];
    chan = channelOf(fields[2]);
    rest = fields.slice(3);
  } else {
    who = fields[1];
    rest = fields.slice(2);
  }
  const author = authorOf(who, lexicon);
  if (author.error) return { error: author.error };
  const text = reactionText(rest.join(':'));
  if ((text.match(/\p{L}/gu) || []).length < REACTION_LIMITS.minLetters) return { error: 'у реакции нет текста' };
  return { fact, who: author.id, chan, text };
}

function readReply(value, slots, lexicon) {
  const fields = value.split(':');
  const ref = fields[0].replace(/[#№[\]()«»"]/g, '').trim().toLowerCase();
  let parent;
  let chan;
  let parentVoice;
  let answered = false;
  const own = /^(?:r|р|реакция\s*)?(\d{1,2})$/u.exec(ref);
  const old = /^(?:f|ф)\s*(\d{1,2})$/u.exec(ref);
  if (own) {
    const n = Number(own[1]);
    if (n < 1 || n > slots.length) return { error: `нет поста номер ${n} — ответ без ветки` };
    const post = slots[n - 1];
    if (!post) return { error: `пост номер ${n} не записан — ответ без ветки` };
    parent = `r.${hash(post)}`;
    const r = reactionOf(post);
    chan = r.chan;
    parentVoice = voiceOf(r.who);
  } else if (old) {
    const post = arr(lexicon && lexicon.feedPosts).find((p) => p && p.ref === `f${Number(old[1])}`);
    if (!post) return { error: `нет поста «${ref}» в ленте — ответ без ветки` };
    parent = `f.${postRef(post.id)}`;
    chan = post.chan === 'anon' ? 'anon' : 'chat';
    parentVoice = voiceOf(post.who);
    answered = Number(post.replies) > 0;
  } else {
    return { error: 'ответ без поста' };
  }
  let rest = fields.slice(1);
  let who = '';
  if (rest.length > 1) {
    who = rest[0];
    rest = rest.slice(1);
    if (rest.length > 1 && channelOf(rest[0])) rest = rest.slice(1);
  }
  const author = authorOf(who, lexicon);
  if (author.error) return { error: author.error };
  const text = reactionText(rest.join(':'));
  if ((text.match(/\p{L}/gu) || []).length < REACTION_LIMITS.minLetters) return { error: 'у ответа нет текста' };
  return { parent, who: author.id, chan, text, parentVoice, answered };
}

function voiceOf(who) {
  return who && who !== SOMEONE ? who : '';
}

function authorOf(raw, lexicon) {
  const w = String(raw || '').replace(/\([^()]*\)\s*$/, '').replace(/[[\]()«»"~]/g, '').trim();
  const low = w.toLowerCase().replace(/ё/g, 'е');
  if (!w || SOMEONE_WORDS.includes(low) || low === someoneWord(lexicon).toLowerCase().replace(/ё/g, 'е')) return { id: SOMEONE };
  const party = partyOf(w, lexicon);
  if (party.id === HEROINE) return { error: 'героиня — не реакция курса' };
  return { id: party.id || SOMEONE };
}

function reactionText(raw) {
  let t = String(raw || '')
    .replace(/-->|[=[\]<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«"“„']+|[»"”']+$/g, '')
    .trim();
  if (t.length > REACTION_LIMITS.text) {
    const cut = t.slice(0, REACTION_LIMITS.text);
    const at = cut.lastIndexOf(' ');
    t = `${(at > REACTION_LIMITS.text / 2 ? cut.slice(0, at) : cut).trim()}…`;
  }
  return t;
}

export function unparsedNames(rejected) {
  const out = [];
  for (const r of Array.isArray(rejected) ? rejected : []) {
    const m = /неизвестный (?:человек|преподаватель):\s*«([^»]+)»/u.exec(String((r && r.reason) || ''));
    const name = m ? m[1].trim().replace(/^@(?:card|who)\//, '') : '';
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 6);
}

export function unparsedLeft(names, tokens, people = []) {
  const known = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    if (typeof t === 'string' && t.startsWith('new=')) known.add(normName(splitNewRole(t.slice(4)).name));
  }
  for (const p of people) for (const n of [p && p.name, ...((p && p.aliases) || [])]) if (n) known.add(normName(n));
  return (Array.isArray(names) ? names : []).filter((n) => !known.has(normName(n)));
}

export function factRef(token) {
  return hash(String(token || ''));
}

function authorFrom(field) {
  return { who: String(field || '') || SOMEONE };
}

export function reactionToken({ fact, who, chan, text }) {
  return `react=${factRef(fact)}:${who || SOMEONE}:${chan === 'anon' ? 'anon' : 'chat'}:${reactionText(text)}`;
}

export function replyToken({ parent, who, chan, text }) {
  return `reply=${parent}:${who || SOMEONE}:${chan === 'anon' ? 'anon' : 'chat'}:${reactionText(text)}`;
}

export function isReactToken(token) {
  return /^react=/.test(String(token || ''));
}

export function isReplyToken(token) {
  return /^reply=/.test(String(token || ''));
}

export function replyOf(token, tokens = []) {
  const m = /^reply=([rf]\.[0-9a-z]+):([^:]*):(chat|anon):([\s\S]+)$/.exec(String(token || ''));
  if (!m) return null;
  const own = m[1].startsWith('r.');
  const post = own ? (tokens || []).find((t) => isReactToken(t) && hash(t) === m[1].slice(2)) || null : null;
  return { parent: m[1], ...authorFrom(m[2]), chan: m[3], text: m[4], post, feed: own ? '' : m[1].slice(2) };
}

export function repliesOf(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];
  return list.filter(isReplyToken).map((t) => replyOf(t, list)).filter((a) => a && (a.post || a.feed)).map((a) => ({
    parent: a.post ? { token: a.post } : { ref: a.feed },
    who: a.who, chan: a.chan, text: a.text,
  }));
}

export function isLoudToken(token) {
  return /^loud=/.test(String(token || ''));
}

export function isPrivateToken(token) {
  return /^private=/.test(String(token || ''));
}

export function privateRefs(tokens) {
  return new Set((Array.isArray(tokens) ? tokens : []).filter(isPrivateToken).map((t) => t.slice(8)).filter(Boolean));
}

export { isPrepToken, prepTokens };

export function isPlayedToken(token) {
  return /^played=/.test(String(token || ''));
}

export function playedOf(tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter(isPlayedToken).map((t) => t.slice(7)).filter(Boolean);
}

export function isFactToken(token) {
  return Boolean(token) && !isReactToken(token) && !isReplyToken(token) && !isLoudToken(token) && !isPlayedToken(token) && !isPrivateToken(token) && !isPrepToken(token);
}

export function reactionOf(token, tokens = []) {
  const m = /^react=([^:]+):([^:]*):(chat|anon):([\s\S]+)$/.exec(String(token || ''));
  if (!m) return null;
  const fact = (tokens || []).find((t) => isFactToken(t) && factRef(t) === m[1]) || null;
  return { ref: m[1], ...authorFrom(m[2]), chan: m[3], text: m[4], fact, token: String(token) };
}

export function reactionsOf(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];
  return list.filter(isReactToken).map((t) => reactionOf(t, list)).filter((r) => r && r.fact);
}

export function loudOf(tokens) {
  const t = (tokens || []).find(isLoudToken);
  const n = t ? Number(t.slice(5)) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

export function pruneReactions(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  const refs = new Set(tokens.filter(isFactToken).map(factRef));
  const withReacts = tokens.filter((t) => {
    if (!isReactToken(t)) return true;
    const r = reactionOf(t);
    return Boolean(r && refs.has(r.ref));
  });
  const posts = new Set(withReacts.filter(isReactToken).map((t) => hash(t)));
  const kept = withReacts.filter((t) => {
    if (!isReplyToken(t)) return true;
    const a = replyOf(t);
    return Boolean(a && (a.feed || posts.has(a.parent.slice(2))));
  });
  const left = kept.filter((t) => !isPrivateToken(t) || refs.has(t.slice(8)));
  return left.some((t) => isReactToken(t) || isReplyToken(t) || isFactToken(t)) ? left : left.filter((t) => !isLoudToken(t));
}

export function dropTokenAt(tokens, index) {
  if (!Array.isArray(tokens)) return tokens;
  const left = tokens.filter((_, i) => i !== index);
  if (isFactToken(tokens[index]) && !left.some(isFactToken)) return pruneReactions(left.filter((t) => !isLoudToken(t)));
  return pruneReactions(left);
}

export function tokenOf(ev) {
  if (!ev || !ANALYSIS_KINDS.includes(ev.kind)) return null;
  if (ev.kind === 'grade') {
    const why = cleanReason(ev.why).replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
    return `grade=${ev.subjectId}:${ev.value}${why ? `:${why}` : ''}`;
  }
  if (ev.kind === 'completion') return `completion=${ev.scope}:${ev.value}`;
  if (ev.kind === 'attendance') return `${ev.status === 'late' ? 'late' : 'skip'}=${ev.subjectId}`;
  if (ev.kind === 'event') {
    const name = cleanReason(ev.name).replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    return `event=+${ev.days}${ev.until > ev.days ? `..+${ev.until}` : ''}:${name}`;
  }
  if (ev.kind === 'pause') {
    if (ev.end) return 'pause=end';
    const name = cleanReason(ev.name).replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
    return `pause=${ev.days ? ev.days : 'open'}${name ? `:${name}` : ''}`;
  }
  if (ev.kind === 'fame') {
    const why = cleanReason(ev.why, SOCIAL_TEXT_MAX.why).replace(/:/g, ' ');
    return `fame=${ev.sign < 0 ? '-' : '+'}${why ? `:${why}` : ''}`;
  }
  if (ev.kind === 'met') return `met=${ev.personId}`;
  if (ev.kind === 'open' || ev.kind === 'unmask') return `${ev.kind}=${ev.personId}`;
  if (ev.kind === 'clash') {
    const reason = cleanReason(ev.reason);
    return `clash=${ev.a}:${ev.b}${reason ? `:${reason}` : ''}`;
  }
  if (ev.kind === 'act') {
    const plain = (v, max, glue) => cleanReason(v, max).replace(/\s*:\s*/g, glue).replace(/["«»“”„]/g, '').trim();
    const what = plain(ev.what, 80, ' ');
    if (!what) return null;
    const say = plain(ev.say, 100, ' — ');
    return `act=${ev.a}:${what}:${ev.b || ''}:${ev.type}:${ev.access || 'на людях'}:${ev.reach || 'неизвестно'}${say ? `:"${say}"` : ''}`;
  }
  if (ev.kind === 'rumor') {
    const what = cleanReason(ev.text, 100);
    return what ? `rumor=${ev.about}:${what}` : null;
  }
  if (ev.kind === 'new') {
    const name = cleanReason(ev.name).replace(/:/g, ' ').trim();
    const role = [ev.role === 'teacher' ? 'teacher' : '', ev.canon ? 'canon' : ''].filter(Boolean).join(',');
    return name ? `new=${name}${role ? `:${role}` : ''}` : null;
  }
  if (ev.kind === 'looks') {
    const text = cleanReason(ev.text, SOCIAL_TEXT_MAX.looks);
    const who = ev.personId || cleanReason(ev.name).replace(/:/g, ' ').trim();
    return text && who ? `looks=${who}:${text}` : null;
  }
  if (ev.kind === 'deal') {
    const what = cleanReason(ev.what);
    return what ? `deal${ev.closed ? '-' : ''}=${ev.a}:${ev.b}:${what}` : null;
  }
  if (ev.kind === 'feat') {
    const plain = (v, max) => cleanReason(v, max).replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
    if (ev.moment) {
      const m = ev.moment;
      const [emoji, name, desc] = [plain(m.emoji, 16), plain(m.name, 50), plain(m.desc, 160)];
      return emoji && name && desc ? `ach=момент:${emoji}:${name}:${desc}:${m.rarity}` : null;
    }
    const why = plain(ev.why, 100);
    return why && ev.id ? `ach=${ev.id}:${why}` : null;
  }
  const sign = ev.delta < 0 ? '-' : '+';
  const strength = ev.impact ? `${ev.impact}${sign}` : `${sign}${Math.abs(ev.delta)}`;
  const reason = cleanReason(ev.reason);
  return `rel=${ev.teacherId}:${strength}${reason ? `:${reason}` : ''}`;
}

function cleanReason(reason, max = ANALYSIS_LIMITS.reason) {
  return str(reason)
    .replace(/-->|[=[\]<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function analysisMarker(tokens) {
  const list = (tokens || []).filter(Boolean);
  return `<!-- [KOLDO${list.length ? ` ${list.join(' ')}` : ''}] -->`;
}

export function effectiveText(text, tokens) {
  const src = String(text || '');
  if (!Array.isArray(tokens)) return src;
  return `${keepMarkerKinds(src, ['time'])}\n${analysisMarker(tokens.filter(isFactToken))}`;
}

export const ANON_WHO = 'без подписи';

export function tokenText(token, lexicon, { known = false, brief = false, day = '', today = '' } = {}) {
  const people = [...arr(lexicon.teachers).map((t) => ({ ...t, teacher: true })), ...arr(lexicon.classmates)];
  const heroine = lexicon.names && typeof lexicon.names.user === 'string' ? lexicon.names.user.trim() : '';
  const gender = heroGender(lexicon, heroine);
  if (isReactToken(token)) {
    const r = reactionOf(token);
    if (!r) return String(token);
    if (r.chan === 'anon') return `${ANON_WHO}: «${r.text}»`;
    return `${authorWord(r, people, heroine, lexicon, gender)}: «${r.text}»`;
  }
  if (isReplyToken(token)) {
    const a = replyOf(token);
    if (!a) return String(token);
    const who = a.chan === 'anon' ? ANON_WHO : authorWord(a, people, heroine, lexicon, gender);
    return `${who}: «${a.text}»`;
  }
  if (isLoudToken(token)) {
    const row = LOUDNESS.find((l) => l.level === loudOf([token]));
    return row ? row.word : String(token);
  }
  if (isPrivateToken(token)) return 'наедине, без свидетелей';
  if (isPrepToken(token)) return prepTokenText(token, lexicon.preps);
  if (isPlayedToken(token)) {
    const hook = arr(lexicon.hooks).find((h) => h && h.id === token.slice(7));
    if (hook && hook.plate) return hook.plate;
    return hook ? `повод сыгран: ${hook.text}` : 'повод сыгран';
  }
  const ev = tokenEvent(token, lexicon);
  if (!ev) return String(token);
  if (ev.kind === 'feat') return featPlate(ev, lexicon);
  if (SCENE_KINDS.includes(ev.kind)) return sceneText(ev, people, heroine, gender);
  const subject = (id) => {
    const s = (lexicon.subjects || []).find((x) => x.id === id);
    return (s && s.name) || id;
  };
  if (ev.kind === 'grade') return `оценка: ${subject(ev.subjectId)} — ${ev.value}${ev.why ? ` (${ev.why})` : ''}`;
  if (ev.kind === 'fame') return `Слава: ${ev.sign < 0 ? 'ниже' : 'выше'}${ev.why ? ` — ${ev.why}` : ''}`;
  if (ev.kind === 'completion') return `Сдано: ${ev.scope === 'all' ? 'все зачёты и экзамены' : ev.scope === 'debts' ? 'все текущие хвосты' : subject(ev.scope)} — ${ev.value}`;
  if (ev.kind === 'attendance') return `${ev.status === 'late' ? 'опоздание' : 'прогул'}: ${subject(ev.subjectId)}`;
  if (ev.kind === 'event') {
    const span = ev.until > ev.days ? ` (${daysWord(ev.until - ev.days + 1)})` : '';
    const head = known ? 'уже в планах: ' : brief ? 'в планы: ' : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const from = addDays(day, ev.days);
      const last = addDays(day, Math.max(ev.until, ev.days));
      const past = /^\d{4}-\d{2}-\d{2}$/.test(today) && today > last ? ' — уже прошло' : '';
      return `${head}${ev.name} — ${daysText(ev.days)}, ${dayWord(from)}${span}${past}`;
    }
    return `${head}${ev.name} — ${daysText(ev.days)}${span}`;
  }
  if (ev.kind === 'pause') {
    if (ev.end) return 'занятия возобновились';
    const name = ev.name ? `${ev.name} — ` : '';
    return `${name}занятий нет ${ev.days ? daysWord(ev.days) : 'до отмены'}`;
  }
  if (ev.kind === 'rel') {
    const t = people.find((x) => x.id === ev.teacherId);
    const who = (t && t.name) || ev.teacherId;
    const dir = ev.delta > 0 ? 'теплее' : 'холоднее';
    const how = ev.impact === 'major' ? 'заметно' : ev.impact === 'minor' ? 'немного' : '';
    return `${who}: ${dir}${how ? ` (${how})` : ''}${ev.reason ? ` — ${ev.reason}` : ''}`;
  }
  return String(token);
}

function featPlate(ev, lexicon) {
  const own = ev.moment || featText(ev.id, lexicon);
  const emoji = ev.moment ? ev.moment.emoji : (featById(ev.id) || {}).emoji;
  const mark = emoji ? `${emoji} ` : '';
  return `ачивка: ${mark}${own.name}${ev.why ? ` — ${ev.why}` : ''}`;
}

export function talkParts(token, lexicon) {
  const people = [...arr(lexicon.teachers).map((t) => ({ ...t, teacher: true })), ...arr(lexicon.classmates)];
  const heroine = lexicon.names && typeof lexicon.names.user === 'string' ? lexicon.names.user.trim() : '';
  const gender = heroGender(lexicon, heroine);
  const r = isReactToken(token) ? reactionOf(token) : isReplyToken(token) ? replyOf(token) : null;
  if (!r) return null;
  if (r.chan === 'anon') return { who: ANON_WHO, say: r.text, style: 'anon' };
  const who = authorWord(r, people, heroine, lexicon, gender);
  return { who, say: r.text, style: r.who === SOMEONE || !r.who ? 'anon' : 'person' };
}

export function tokenAbout(token, lexicon) {
  const ev = tokenEvent(token, lexicon);
  if (ev && SCENE_KINDS.includes(ev.kind)) {
    const people = [...arr(lexicon.teachers).map((t) => ({ ...t, teacher: true })), ...arr(lexicon.classmates)];
    const heroine = lexicon.names && typeof lexicon.names.user === 'string' ? lexicon.names.user.trim() : '';
  const gender = heroGender(lexicon, heroine);
    return sceneAbout(ev, people, heroine, gender);
  }
  return tokenText(token, lexicon, { brief: true });
}

function authorWord(r, people, heroine, lexicon, gender = 'f') {
  return r.who === SOMEONE || !r.who ? someoneWord(lexicon) : personWord(r.who, people, heroine, gender);
}

function daysText(n) {
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === 2) return 'послезавтра';
  return `через ${daysWord(n)}`;
}

const MONTHS_GEN = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function dayWord(day) {
  const [, m, d] = String(day).split('-').map(Number);
  return `${d} ${MONTHS_GEN[m] || ''}`.trim();
}

function daysWord(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const word = a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b > 1 && b < 5 ? 'дня' : 'дней';
  return `${n} ${word}`;
}

export function tokenEvent(token, lexicon) {
  return parseMarker(analysisMarker([token]), lexicon).events[0] || null;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function clipAnalysisReply(text, limit = ANALYSIS_LIMITS.reply) {
  const source = str(text);
  if (source.length <= limit) return source;
  const separator = '\n[… часть текста опущена …]\n';
  const budget = Math.max(0, limit - separator.length * 3);
  const edge = Math.floor(budget / 4);
  const middle = source.slice(edge, source.length - edge);
  const relevant = middle.split(/\n\s*\n|(?<=[.!?])\s+/u)
    .filter((part) => /экзамен|зач[её]т|хвост|оценк|отметк|профессор|преподавател|прогул|опозда|сдал|сдан|сдач|праздн|(?<![а-яё])бал(?!л)|вечеринк|концерт|ярмарк|фестивал|турнир|поход|свидани|через .{0,12}(дн|недел)|завтра|послезавтра|в (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)|ссор|ругал|скандал|слух|сплетн|говорят|обещал|одолжил|верн[её]т|конспект|exam|grade|passed/iu.test(part))
    .join('\n');
  return [source.slice(0, edge), relevant.slice(0, budget - edge * 2), source.slice(-edge)]
    .filter(Boolean).join(separator);
}

function clip(text, limit) {
  const s = str(text);
  return s.length > limit ? `…${s.slice(s.length - limit)}` : s;
}
