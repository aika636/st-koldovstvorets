import { normalizeFeed, hash } from './feed.mjs';
import { diffDays } from './time.mjs';
import { feedAuthors, mindOf, openTies, SHARP_TIES } from './authors.mjs';
import { nameStems, hasStem } from './secrets.mjs';

export const MAGPIE = 'Сорока на хвосте';

export const ANON_TONES = ['sharp', 'invent', 'warn', 'defend', 'crush', 'rumor'];

export const ANON_WINDOW = 10;
export const ANON_PER_TARGET = 1;
export const ONE_OFF_GAP = 15;
export const CRUSH_GAP = 30;
export const CLUE_GAP = 5;
export const CLUE_AGE = [2, 14];
export const FACT_DAYS = 2;

const GLEB_EVERY = 3;
const VENIAMIN_EVERY = 4;
const SEVA_EVERY = 5;
const PASHA_EVERY = 7;

const MAGPIE_RE = /^(?:сорока(?: на хвосте)?|аноним(?:ка)?|без подписи)$/iu;

export const isMagpieName = (raw) => MAGPIE_RE.test(String(raw == null ? '' : raw).replace(/[«»"“”„[\]()~@*_]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim());

export const issueOfItem = (x) => Number((String((x && x.src) || '').match(/^molva-(\d+)/) || [])[1]) || 0;

export const TONE_TEXT = {
  sharp: 'колкая записка: шпилька, обида, упрёк по делу; без угроз и унижения, а язвительность в рамках характера',
  invent: 'выдумка, чтобы казаться осведомлённым: правдоподобная, подана как «я слышал», но это не факт',
  warn: 'предупреждение: по-доброму, с заботой — осторожнее с…',
  defend: 'заступничество: коротко и твёрдо за того, о ком недавно написали гадость',
  crush: 'признание тайного поклонника: неловкое, тёплое, без подписи и без давления',
  rumor: 'подслушанное: чужой разговор, пересказанный неточно',
};

function anonRoots(state) {
  return normalizeFeed(state && state.feed).items.filter((x) => x.kind === 'reaction' && !x.parent && x.chan === 'anon' && x.anon);
}

// журнал записок: свой компактный список переживает вытеснение ленты, записки из ленты дополняют его
export function anonLog(state) {
  const stored = normalizeFeed(state && state.feed).molva.anon;
  const ids = new Set(stored.map((n) => n.id));
  const roots = anonRoots(state).filter((x) => !ids.has(x.id));
  return [...stored, ...roots.map((x) => ({ id: x.id, author: x.who, target: x.anon.target, tone: x.anon.tone, fact: x.anon.fact, issue: issueOfItem(x) }))];
}

export function anonBlocked(state, target, issue, tones = ['sharp', 'invent']) {
  if (!target) return false;
  const hits = anonLog(state).filter((n) => n.target === target && tones.includes(n.tone) && issue - n.issue < ANON_WINDOW);
  return hits.length >= ANON_PER_TARGET;
}

function ago(state, author, tone, issue) {
  const mine = anonLog(state).filter((n) => n.author === author && (!tone || n.tone === tone));
  return mine.length ? issue - Math.max(...mine.map((n) => n.issue)) : Infinity;
}

// срок следующей записки: промежуток every-1..every+1 (в среднем every), стабильный для чата и выпуска (без случайности: ходы переигрываются)
function due(state, author, every, issue) {
  const last = ago(state, author, '', issue);
  if (last === Infinity) return issue % every === 0;
  const seed = `${author}|${issue - last}|${(state && state.calendar && state.calendar.termStart) || ''}`;
  return last >= every - 1 + (parseInt(hash(seed), 36) % 3);
}

function recentFacts(state) {
  const day = state && state.calendar && state.calendar.day;
  return normalizeFeed(state && state.feed).items.filter((x) => x.kind === 'fact' && x.status !== 'expired' && !x.private && !x.rumor && x.at && x.at.day
    && daysBetween(x.at.day, day) >= 0 && daysBetween(x.at.day, day) <= FACT_DAYS);
}

function daysBetween(a, b) {
  try {
    const d = diffDays(a, b);
    return Number.isFinite(d) ? d : -1;
  } catch {
    return -1;
  }
}

const personsIn = (f, roster) => (f.about || []).filter((id) => id !== '@heroine' && roster.get(id) && roster.get(id).role === 'student');

const HAND_KEYS = ['letters', 'slant', 'press', 'tool', 'quirk'];

// приметы почерка, которые есть ещё у кого-то из состава: одна примета не называет автора
export function sharedHand(person, roster) {
  const hand = (person && person.hand) || {};
  const others = ((roster && roster.students) || []).filter((s) => s.id !== person.id && s.hand);
  return HAND_KEYS.filter((k) => hand[k] && others.some((s) => s.hand[k] === hand[k]));
}

export function cluesFor(person, roster) {
  person = person || {};
  const house = person.house && roster && roster.house ? roster.house(person.house) : null;
  const out = sharedHand(person, roster)
    .sort((a, b) => (hash(`${person.id}|${a}`) < hash(`${person.id}|${b}`) ? -1 : 1))
    .slice(0, 2)
    .map((k) => ({ kind: 'hand', text: person.hand[k], finder: 'draft', spent: false }));
  const coarse = hash(`${person.id}|clue`).length % 2 === 0;
  if (house && person.grade && coarse) out.push({ kind: 'room', text: `записку видели в горнице ${house.name} ${person.grade} класса`, finder: 'wax', spent: false });
  else if (house) out.push({ kind: 'ink', text: `чернила цвета «${house.color}», а бумага из лавки Лисы`, finder: 'magpie', spent: false });
  else out.push({ kind: 'ink', text: 'бумага из лавки Лисы, а чернила самые обычные', finder: 'magpie', spent: false });
  return out;
}

export function planNotes(state, roster, ctx = {}) {
  if (!roster) return [];
  const issue = ctx.issue || normalizeFeed(state && state.feed).molva.issue + 1;
  const feed = normalizeFeed(state && state.feed);
  const open = new Set(feed.revealed.authors);
  const facts = recentFacts(state);
  const students = feedAuthors(state, roster, { stop: ctx.stop }).filter((a) => a.role === 'student' && !open.has(a.id));
  const byId = new Map(students.map((a) => [a.id, a]));
  const log = anonLog(state);
  const fresh = (author) => !log.some((n) => n.author === author && n.issue === issue);
  const out = [];
  const add = (author, target, tone, why, extra = {}) => {
    const a = byId.get(author);
    if (!a || out.length >= 1 || !fresh(author)) return false;
    if (target && target !== '@heroine' && (!roster.get(target) || target === author)) return false;
    if (['sharp', 'invent'].includes(tone) && anonBlocked(state, target, issue)) return false;
    out.push({ author, target, tone, why, ...extra });
    return true;
  };
  const sharpNow = log.filter((n) => ['sharp', 'invent'].includes(n.tone) && issue - n.issue <= 2 && n.target && n.target !== '@heroine');

  // по-доброму: заступничество, признание, предупреждение
  for (const n of sharpNow) {
    if (ago(state, 'dana', 'defend', issue) > ONE_OFF_GAP && n.author !== 'dana' && n.target !== 'dana' && !log.some((x) => x.tone === 'defend' && x.target === n.target && issue - x.issue < ANON_WINDOW)) {
      if (add('dana', n.target, 'defend', `недавно в «Сороке» написали гадость о ${roster.get(n.target).short}`)) break;
    }
  }
  if (!out.length) {
    for (const a of students) {
      const m = mindOf(state, a.id);
      if (m.love === 'careful' && ago(state, a.id, 'crush', issue) > CRUSH_GAP && (issue % 4 === 1)) {
        if (add(a.id, '@heroine', 'crush', 'тайное чувство к героине')) break;
      }
    }
  }
  if (!out.length) {
    for (const a of students) {
      const m = mindOf(state, a.id);
      if (!m.fan || ago(state, a.id, 'warn', issue) <= ONE_OFF_GAP || issue % 4 !== 3) continue;
      const risk = students.find((s) => (mindOf(state, s.id).jealous || {}).to === '@heroine');
      if (risk && add(a.id, '@heroine', 'warn', `остеречь от ${risk.name}`, { about: risk.id })) break;
    }
  }

  // Глеб пишет по лору регулярно: колко, но не унижая
  const turns = {};
  turns.gleb = () => {
    if (!byId.has('gleb') || !due(state, 'gleb', GLEB_EVERY, issue)) return;
    const gleb = roster.get('gleb');
    const picks = openTies(gleb).filter((t) => SHARP_TIES.has(t.kind) && byId.has(t.to)).map((t) => t.to);
    const lastAt = (id) => Math.max(0, ...log.filter((n) => n.author === 'gleb' && n.target === id).map((n) => n.issue));
    const target = picks.filter((id) => !anonBlocked(state, id, issue)).sort((a, b) => lastAt(a) - lastAt(b))[0];
    if (target) add('gleb', target, 'sharp', `его вечные колкости: ${(openTies(gleb).find((t) => t.to === target) || {}).note || 'мелкая стычка'}`);
  };
  // Вениамин портит чужую репутацию, оставаясь ни при чём
  turns.veniamin = () => {
    if (!byId.has('veniamin') || !due(state, 'veniamin', VENIAMIN_EVERY, issue)) return;
    const hit = facts.flatMap((f) => personsIn(f, roster)).find((id) => id !== 'veniamin' && !anonBlocked(state, id, issue));
    if (hit) add('veniamin', hit, 'sharp', 'подпортить чужую репутацию, самому оставшись ни при чём');
  };
  // Сева выдумывает, чтобы казаться осведомлённым
  turns.seva = () => {
    if (!byId.has('seva') || !due(state, 'seva', SEVA_EVERY, issue)) return;
    const hit = facts.flatMap((f) => personsIn(f, roster)).find((id) => id !== 'seva' && !anonBlocked(state, id, issue));
    if (hit) add('seva', hit, 'invent', 'выдумать подробность, чтобы казаться осведомлённым');
  };
  // Паша стравливает: тонкий манипулятор
  turns.pasha = () => {
    if (!byId.has('pasha') || !due(state, 'pasha', PASHA_EVERY, issue)) return;
    const pasha = byId.get('pasha');
    const pair = students.find((a) => a.id !== 'pasha' && a.tier === 'near' && openTies(roster.get(a.id)).some((t) => SHARP_TIES.has(t.kind) && byId.has(t.to) && t.to !== 'pasha' && !anonBlocked(state, a.id, issue)));
    if (pair && pasha) {
      const rival = openTies(roster.get(pair.id)).find((t) => SHARP_TIES.has(t.kind) && byId.has(t.to) && t.to !== 'pasha');
      add('pasha', pair.id, 'sharp', `подбросить подозрение между ${pair.name} и ${nameOf(roster, rival.to)}`);
    }
  };
  // голоса чередуются: тот, кто писал последним, ходит после остальных
  const order = ['gleb', 'veniamin', 'seva', 'pasha'];
  const lastWriter = log.filter((n) => order.includes(n.author)).sort((x, y) => y.issue - x.issue)[0];
  if (lastWriter) order.push(...order.splice(order.indexOf(lastWriter.author), 1));
  for (const id of order) if (!out.length) turns[id]();
  // обиженный или ревнивый: один выпад после конкретного конфликта, без серии
  if (!out.length) {
    for (const f of facts) {
      const clash = (f.act && f.act.kind === 'конфликт') || /^clash=/.test(f.factRef || '');
      const [aggressor, offended] = f.about || [];
      if (!clash || !byId.has(offended) || !roster.get(aggressor) || aggressor === '@heroine') continue;
      if (['gleb', 'veniamin', 'seva', 'pasha', 'dana'].includes(offended)) continue;
      if (log.some((n) => n.fact === f.id)) continue;
      if (ago(state, offended, 'sharp', issue) <= ONE_OFF_GAP || anonBlocked(state, aggressor, issue)) continue;
      if (add(offended, aggressor, 'sharp', 'обида после недавней ссоры, один выпад без продолжения', { fact: f.id })) break;
    }
  }
  return out.map((n, i) => {
    const person = roster.get(n.author) || byId.get(n.author);
    const why = hasStem(n.why, nameStems(person)) ? 'у автора на это свои причины' : n.why;
    return { ...n, why, id: `к${i + 1}`, clues: cluesFor(person, roster) };
  });
}

const nameOf = (roster, id) => (roster.get(id) || {}).short || id;

export function surfaceClue(state, issue) {
  const feed = normalizeFeed(state && state.feed);
  if (feed.molva.clueAt && issue - feed.molva.clueAt < CLUE_GAP) return null;
  const open = new Set(feed.revealed.authors);
  const pick = feed.items
    .filter((x) => x.kind === 'reaction' && !x.parent && x.chan === 'anon' && x.anon && !open.has(x.who) && x.status !== 'taken'
      && x.anon.clues.some((c) => !c.spent) && issue - issueOfItem(x) >= CLUE_AGE[0] && issue - issueOfItem(x) <= CLUE_AGE[1] && issueOfItem(x) > 0)
    .sort((a, b) => issueOfItem(a) - issueOfItem(b))[0];
  return pick ? pick.id : null;
}

export function putClueOut(state, id, issue) {
  const feed = normalizeFeed(state && state.feed);
  const live = state.feed;
  const item = live.items.find((x) => x.id === id);
  if (!item || !item.anon) return false;
  const at = item.anon.clues.findIndex((c) => !c.spent);
  if (at < 0) return false;
  item.anon.clues[at].spent = true;
  item.anon.clueOut = at;
  item.status = 'new';
  item.read = false;
  live.molva = { ...feed.molva, clueAt: issue };
  return true;
}
