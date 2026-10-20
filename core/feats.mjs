import { milestones, milestoneDetail } from './milestones.mjs';
import { normalizeFeats } from './state.mjs';
import { hash } from './feed.mjs';
import { DIE } from './exams.mjs';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];

export const FEAT_FAMILIES = [
  { id: 'love', labelKey: 'achFamLove' },
  { id: 'teach', labelKey: 'achFamTeach' },
  { id: 'chaos', labelKey: 'achFamChaos' },
  { id: 'fame', labelKey: 'achFamFame' },
  { id: 'people', labelKey: 'achFamPeople' },
  { id: 'study', labelKey: 'achFamStudy' },
  { id: 'events', labelKey: 'achFamEvents' },
  { id: 'life', labelKey: 'achFamLife' },
  { id: 'shame', labelKey: 'achFamShame' },
];

export const MOMENTS_FAMILY = { id: 'moments', labelKey: 'achFamMoments' };

export const FREE_EVERY = 8;

const ROWS = [
  ['kiss', 'love', '💋', 'common', 0, 'ach', 'Первый поцелуй', 'Поцелуйте того, кто вам дорог, — по-настоящему, а не в мечтах.', 'Даже скатерть-самобранка деликатно отвернулась.'],
  ['date', 'love', '🌹', 'rare', 0, 'ach', 'Свидание за околицей', 'Сходите с тем, кто вам дорог, на настоящее свидание — хоть в Мраморское, хоть на башню под звёзды — и пусть оба это признают.', 'Это больше не «случайно встретились у колодца».'],
  ['outed', 'love', '📢', 'rare', 0, 'ach', 'Вся Молва в курсе', 'Признайтесь в отношениях при всех — или попадитесь так, что отпираться поздно.', 'Сорока на хвосте уже всё принесла.'],
  ['makeup', 'love', '🕊️', 'rare', 1, 'ach', 'Помириться на глазах у горницы', 'Поссорьтесь с тем, кто вам дорог, на людях — и помиритесь, пока все смотрят.', 'Трапезная требует вторую серию.'],
  ['loveSpite', 'love', '💔', 'epic', 1, 'ach', 'Выбрать сердце назло', 'Выберите того, кто вам дорог, хотя это стоит вам чего-то важного.', 'Здравый смысл улетел сорокой и не обещал вернуться.'],
  ['jealous', 'love', '💚', 'rare', 0, 'ach', 'Ревность на всю горницу', 'Заставьте того, кто вам дорог, ревновать — громко и при всех.', 'Третий лишний уже бежит из трапезной.'],
  ['correctTeacher', 'teach', '✏️', 'rare', 0, 'ach', 'Поймать наставника на ошибке', 'Поймайте наставника на ошибке — и пусть он признает, что вы правы.', 'Сегодня экзаменовали по обе стороны стола.'],
  ['board', 'teach', '📝', 'common', 0, 'ach', 'Вести урок вместо наставника', 'Объясните тему всему классу вместо наставника.', 'Баба-Яга присела на лавку и слушает с интересом.'],
  ['helpTeacher', 'teach', '🩹', 'rare', 1, 'ach', 'Выручить наставника', 'Помогите наставнику с бедой, которая не про учёбу.', 'Оценку за это не ставят. Зато пирог пришлют.'],
  ['favorite', 'teach', '⭐', 'rare', 0, 'state', 'Любимчик наставника', 'Добейтесь самого тёплого отношения наставника.', 'Вам теперь прощают опоздания. Наверное.'],
  ['nemesis', 'teach', '😤', 'rare', 1, 'state', 'Бельмо на глазу', 'Доведите наставника до того, что он вас не выносит.', 'У него дёргается бровь при вашем имени.'],
  ['disrupt', 'chaos', '💥', 'rare', 0, 'ach', 'Сорвать урок', 'Сделайте так, чтобы урок продолжить было невозможно.', 'Наставник ушёл заваривать успокоительный сбор.'],
  ['firstSkip', 'chaos', '🏃', 'common', 1, 'state', 'Сбежать с урока', 'Прогуляйте занятие без уважительной причины.', 'Присутствовали исключительно духовно.'],
  ['ghost', 'chaos', '👻', 'rare', 1, 'state', 'Стать невидимкой', 'Прогуляйте десять занятий.', 'Кузя уже путает вас с домовым.'],
  ['trespass', 'chaos', '🚪', 'rare', 1, 'ach', 'Заглянуть, куда не велено', 'Проникните туда, куда ход закрыт: в чулан, на чердак или в чужое крыло терема.', 'Замок на двери сделал вид, что спит.'],
  ['breakForFriend', 'chaos', '🔓', 'rare', 0, 'ach', 'Нарушить ради своих', 'Нарушьте правило, чтобы выручить друга, — и выручите.', 'Устав пострадал, друг — нет.'],
  ['rewriteRules', 'chaos', '📜', 'legendary', 1, 'ach', 'Новый пункт в школьных правилах', 'Натворите такого, что из-за вас придётся поменять школьные правила.', 'Прокопьич вписал пункт в журнал — вашим именем.'],
  ['onTheEdge', 'chaos', '⚠️', 'rare', 1, 'state', 'На ковре у Хозяйки', 'Получите последнее предупреждение от ректора, Хозяйки Медной горы.', 'Вас знают в лицо там, куда лучше не попадать.'],
  ['nightPatrol', 'chaos', '🌙', 'rare', 1, 'ach', 'Пережить ночной обход', 'Проберитесь по терему после отбоя (23:00) и вернитесь в горницу, не попавшись на обходе Кота Баюна.', 'Кот допел колыбельную, а вы так и не уснули.'],
  ['gossip', 'fame', '🗣️', 'common', 0, 'code', 'Попасть в Молву', 'Станьте темой разговоров в Молве.', 'Теперь обсуждают не только меню трапезной.'],
  ['wrongRumor', 'fame', '🌀', 'rare', 0, 'ach', 'Узнать о себе новое', 'Услышьте о себе слух, который переврал всё.', 'Версия для публики, с бонусными сценами.'],
  ['killRumor', 'fame', '🤐', 'rare', 0, 'ach', 'Опровергнуть слух', 'Публично опровергните ложный слух о себе.', 'Поправка догнала сплетню, но запыхалась.'],
  ['famous', 'fame', '🌟', 'rare', 1, 'ach', 'Слава бежит впереди', 'Встретьте человека, который уже наслышан о ваших подвигах.', 'Автографы — после ужина.'],
  ['chatQueen', 'fame', '👑', 'epic', 0, 'code', 'Весь день на языке у Молвы', 'Будьте главной темой Молвы весь день.', 'Молву хоть вашим именем называй.'],
  ['magpieUnmask', 'fame', '🪶', 'epic', 0, 'code', 'Вычислить Сороку', 'Узнайте, кто на самом деле пишет безымянные записки «Сороки на хвосте».', 'Почерк выдал, перо — тем более.'],
  ['buryHatchet', 'people', '🪓', 'rare', 0, 'ach', 'Закопать топор войны', 'Помиритесь с давним недругом.', 'Просьба не выкапывать до Масленицы.'],
  ['keepPromise', 'people', '🤞', 'rare', 1, 'ach', 'Сдержать неудобное обещание', 'Выполните обещание, когда выполнить его стало очень трудно.', 'Слово оказалось крепче Медной горы.'],
  ['kuzyaFriend', 'people', '🏠', 'rare', 0, 'ach', 'Подружиться с Кузей', 'Заслужите доверие домовёнка Кузи: пусть он поделится находкой или тайной терема.', 'Теперь вам оставляют блюдечко со сметаной.'],
  ['faculty', 'people', '🦅', 'rare', 0, 'ach', 'Постоять за честь факультета', 'Встаньте при всех за свой факультет-птицу — в споре, на лапте или на общем сборе: защитите его честь словом или делом.', 'Птица на гербе расправила крылья.'],
  ['firstTop', 'study', '💯', 'common', 0, 'state', 'Высший балл в ведомость', 'Получите высшую оценку.', 'Журналу нечего добавить.'],
  ['debtCleared', 'study', '✂️', 'common', 0, 'state', 'Отрубить хвост', 'Пересдайте то, что было завалено.', 'Одной причиной для кошмаров меньше.'],
  ['retakeWin', 'study', '🔁', 'common', 0, 'state', 'Взять со второй', 'Завалите искус, а потом всё-таки сдайте.', 'Первая попытка была разминкой.'],
  ['cleanWeek', 'study', '📅', 'common', 0, 'state', 'Неделя без прогулов', 'Проучитесь неделю без единого прогула.', 'Петушок гордится вами.'],
  ['cleanSession', 'study', '🏅', 'rare', 0, 'state', 'Четверть без хвостов', 'Сдайте все искусы четверти с первого раза.', 'Пересдачи скучают без вас.'],
  ['autoPass', 'study', '🎟️', 'rare', 0, 'state', 'Зачёт автоматом', 'Получите оценку без искуса.', 'Искус даже не узнал о вашем существовании.'],
  ['brilliant', 'study', '🏆', 'epic', 0, 'state', 'Сдать на ура', 'Сдайте искус с огромным запасом.', 'Комиссия аплодирует стоя, Илья Муромец — громче всех.'],
  ['hackMethod', 'study', '🔧', 'rare', 0, 'ach', 'Решить не по учебнику', 'Решите задачу способом, которого нет в учебнике, — и пусть его признают.', 'Учебник нервно перелистывается.'],
  ['carryTeam', 'study', '🏋️', 'rare', 0, 'ach', 'Вытянуть всех на себе', 'Спасите общее дело, когда остальные уже сдались.', 'Товарищи делают вид, что так и было задумано.'],
  ['luckyRoll', 'study', '🎲', 'epic', 0, 'code', 'Выбросить невозможное', 'Пройдите испытание кубиком, у которого почти не было шансов.', 'Кубик выбрал самый наглый исход.'],
  ['firstJump', 'study', '💨', 'rare', 0, 'ach', 'Первый скачок', 'Трансгрессируйте на занятии с Кивриным — пусть и недалеко.', 'Приземление засчитано, кусты — нет.'],
  ['licence', 'study', '📇', 'epic', 0, 'ach', 'Лицензия на трансгрессию', 'Сдайте экзамен и получите лицензию на трансгрессию.', 'Теперь хоть в Мраморское и обратно, пока чай не остыл.'],
  ['finalTrial', 'study', '🎓', 'epic', 0, 'ach', 'Выпускной искус', 'Сдайте выпускной искус перед Купалой.', 'Школа вздохнула. Кощей — тоже, и почти с гордостью.'],
  ['stargazing', 'study', '🔭', 'common', 0, 'ach', 'Ночь на башне', 'Позанимайтесь звездочтением на башне в любой вечер или ночь, когда уже стемнело.', 'Звёзды подмигнули. Одна — Жар-птице.'],
  ['invited', 'events', '💌', 'common', 0, 'code', 'Позвали на праздник', 'Получите личное приглашение на праздник: кто-то из школы зовёт вас, и вы это услышали.', 'В списке гостей — знакомое имя.'],
  ['madeIt', 'events', '🚀', 'rare', 0, 'ach', 'Добраться назло всему', 'Придите на праздник, несмотря на все препятствия.', 'Распутица проиграла всухую.'],
  ['dance', 'events', '💃', 'common', 0, 'ach', 'Выйти в круг', 'Станцуйте с кем-нибудь на празднике.', 'Хоровод получил нового бойца.'],
  ['savedParty', 'events', '🎉', 'epic', 0, 'ach', 'Спасти праздник', 'Спасите праздник, который вот-вот сорвётся.', 'Каравай уцелел — благодаря вам.'],
  ['kupalaWreath', 'events', '🌼', 'rare', 0, 'ach', 'Венок на Купалу', 'Сплетите венок и пустите его по воде в Купальскую ночь.', 'Венок поплыл. Дальше — как судьба решит.'],
  ['maslenitsa', 'events', '🥞', 'common', 0, 'ach', 'Блин на Масленицу', 'Отведайте блинов на Масленицу — хоть с вареньем, хоть со сметаной.', 'Магия пахнет блинами, и это не фигура речи.'],
  ['svyatki', 'events', '🔔', 'common', 0, 'ach', 'Святочные колядки', 'Походите на Святки по горницам с колядками.', 'Пряник дали. Угостили бы и вас, но уже съели.'],
  ['laptaGame', 'life', '🏐', 'common', 0, 'ach', 'Выйти на поле', 'Сыграйте в летучую лапту за свой факультет — на тренировке или в матче, хоть один розыгрыш.', 'Добрыня доволен. Мяч — не очень.'],
  ['laptaWin', 'life', '🥇', 'rare', 0, 'ach', 'Победа в лапте', 'Принесите факультету победу в летучей лапте: победа в тренировочном матче тоже считается.', 'Трибуны хлопают крыльями — птицы тоже.'],
  ['waxFortune', 'life', '🕯️', 'common', 0, 'ach', 'Гадание на воске', 'Погадайте у Солохи на воске и выслушайте, что вышло.', 'Воск растёкся так многозначительно, что Солоха замолчала.'],
  ['buffetDebt', 'life', '🥧', 'common', 0, 'ach', 'В долг у Лисы', 'Возьмите в буфете у Лисы Патрикеевны что-нибудь в кредит.', 'Лиса помнит каждый долг. Каждый.'],
  ['spillSecret', 'shame', '🤭', 'rare', 1, 'ach', 'Выболтать свой секрет', 'Случайно раскройте свой секрет при всех.', 'Секрет вылетел сорокой и не вернулся.'],
  ['wrongAddressee', 'shame', '📨', 'common', 1, 'ach', 'Письмо не той сороке', 'Отправьте личное письмо не тому человеку.', 'Сорока донесла. Вопрос только — до кого.'],
  ['caughtSneaking', 'shame', '🕵️', 'common', 1, 'ach', 'Попасться Баюну', 'Попробуйте незаметно выйти из терема после отбоя — и попадитесь.', 'Баюн запел раньше, чем вы дошли до двери.'],
  ['critFail', 'shame', '💀', 'rare', 1, 'state', 'Провалиться с размахом', 'Провалите испытание так, что это войдёт в школьные байки.', 'Даже провал вышел с размахом.'],
];


export const FEATS = ROWS.map(([id, fam, emoji, rarity, secret, src, name, desc, quip]) => ({
  id, fam, emoji, rarity, secret: secret === 1, src, name, desc, quip,
}));

const BY_ID = new Map(FEATS.map((f) => [f.id, f]));
export const featById = (id) => BY_ID.get(id) || null;
export const isSecretFeat = (id) => Boolean(BY_ID.get(id) && BY_ID.get(id).secret);

const lower = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

export function achIdOf(word) {
  const w = lower(word);
  const hit = FEATS.find((f) => f.src === 'ach' && lower(f.id) === w);
  return hit ? hit.id : '';
}

const RARITY_WORDS = {
  common: ['common', 'обычная', 'обычный', 'обычное'],
  rare: ['rare', 'редкая', 'редкий', 'редкое'],
  epic: ['epic', 'эпическая', 'эпический', 'эпическое', 'эпик'],
  legendary: ['legendary', 'легендарная', 'легендарный', 'легендарное'],
};

export function rarityOf(word) {
  const w = lower(word).replace(/[.!]+$/, '');
  return Object.keys(RARITY_WORDS).find((k) => RARITY_WORDS[k].includes(w)) || '';
}

export const MOMENT_WORDS = ['момент', 'moment'];

export const momentId = (name) => `moment:${hash(lower(name))}`;

export function featText(id, preset) {
  const f = featById(id);
  const own = preset && preset.phrases && preset.phrases.feats && preset.phrases.feats[id];
  const pick = (key) => (own && typeof own[key] === 'string' && own[key].trim() ? own[key].trim() : (f ? f[key] : ''));
  return { name: pick('name'), desc: pick('desc'), quip: pick('quip') };
}

export function earnedFeats(state, preset, { char = '' } = {}) {
  if (!state || typeof state !== 'object') return [];
  const out = [];
  for (const m of milestones(state, preset)) {
    const f = featById(m.kind);
    if (!f) continue;
    const t = featText(f.id, preset);
    out.push({
      id: m.id, feat: f.id, kind: 'state', fam: f.fam, emoji: f.emoji, rarity: f.rarity, secret: f.secret,
      name: t.name, desc: t.desc, quip: t.quip, detail: milestoneDetail(m, state, preset),
      when: m.when || null, why: '',
      ...(m.subjectId ? { subjectId: m.subjectId } : {}), ...(m.teacherId ? { teacherId: m.teacherId } : {}),
    });
  }
  for (const it of normalizeFeats(state.feats).items) {
    if (it.moment) {
      out.push({
        id: it.id, kind: 'moment', fam: MOMENTS_FAMILY.id, emoji: it.moment.emoji, rarity: it.moment.rarity, secret: false,
        name: it.moment.name, desc: it.moment.desc, quip: '', detail: '', when: it.when || null, why: it.why, src: it.src || '',
      });
      continue;
    }
    const f = featById(it.id);
    if (!f) continue;
    const t = featText(f.id, preset);
    out.push({
      id: f.id, feat: f.id, kind: f.src, fam: f.fam, emoji: f.emoji, rarity: f.rarity, secret: f.secret,
      name: t.name, desc: t.desc, quip: t.quip, detail: '', when: it.when || null, why: it.why, src: it.src || '',
    });
  }
  const order = (e) => (e.feat ? FEATS.findIndex((f) => f.id === e.feat) : FEATS.length);
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.when && b.e.when && a.e.when !== b.e.when) return a.e.when < b.e.when ? -1 : 1;
      if (Boolean(a.e.when) !== Boolean(b.e.when)) return a.e.when ? -1 : 1;
      return (order(a.e) - order(b.e)) || (a.i - b.i);
    })
    .map((x) => x.e);
}

export function featLine(e) {
  return e ? [e.name, e.detail].filter(Boolean).join(': ') : '';
}

export function tickFeats(state) {
  const f = normalizeFeats(state && state.feats);
  return { ...state, feats: { ...f, n: f.n + 1 } };
}

export function momentDue(state, ahead = 0) {
  const f = normalizeFeats(state && state.feats);
  const last = Math.max(0, ...f.items.filter((i) => i.moment).map((i) => i.n));
  return f.n + ahead - last >= FREE_EVERY;
}

export function featsKnow(state, ahead = 0) {
  const f = normalizeFeats(state && state.feats);
  return {
    owned: f.items.filter((i) => !i.moment).map((i) => i.id),
    moments: f.items.filter((i) => i.moment).map((i) => lower(i.moment.name)),
    momentOk: momentDue(state, ahead),
  };
}

export function placeFeat(next, ev, { src = '', day = '' } = {}) {
  const f = normalizeFeats(next.feats);
  let item;
  if (ev.moment) {
    const name = lower(ev.moment.name);
    if (f.items.some((i) => i.moment && lower(i.moment.name) === name)) return null;
    if (!momentDue(next)) return null;
    item = { id: ev.id || momentId(ev.moment.name), moment: ev.moment, why: '' };
  } else {
    if (!achIdOf(ev.id) || f.items.some((i) => i.id === ev.id)) return null;
    item = { id: ev.id, why: ev.why || '' };
  }
  f.items.push({ ...item, src, when: day, n: f.n });
  next.feats = normalizeFeats(f);
  return next.feats.items.some((i) => i.id === item.id) ? { kind: 'feat', id: item.id } : null;
}

export function revertFeat(state, receipt) {
  if (!receipt || !state.feats) return state;
  const f = normalizeFeats(state.feats);
  return { ...state, feats: { ...f, items: f.items.filter((i) => i.id !== receipt.id) } };
}

export function revertFeatSource(state, src) {
  if (!src || !state.feats) return state;
  const f = normalizeFeats(state.feats);
  const items = f.items.filter((i) => i.src !== src);
  return items.length === f.items.length ? state : { ...state, feats: { ...f, items } };
}

const aboutHeroine = (state) => ((state.feed && state.feed.items) || []).filter((x) => x && x.kind === 'reaction' && x.heroine === true);

export const QUEEN_POSTS = 8;
export const QUEEN_VOICES = 3;

const chanceOf = (dc) => Math.max(0, Math.min(DIE, DIE - dc + 1)) / DIE;

export const LUCKY_CHANCE = 0.1;

function luckyRoll(state) {
  let day = null;
  for (const item of (state.exams && state.exams.items) || []) {
    const rolls = Array.isArray(item.rolls) ? item.rolls : [];
    rolls.forEach((r, idx) => {
      if (!r || !['success', 'critSuccess'].includes(r.tier) || r.saved || !Number.isFinite(r.roll) || !Number.isFinite(r.dc)) return;
      if (r.roll < r.dc || chanceOf(r.dc) > LUCKY_CHANCE) return;
      if (idx === rolls.length - 1 && item.modelOverride && String(item.outcome) !== String(r.value)) return;
      if (day === null || (r.day && (!day || r.day < day))) day = r.day || '';
    });
  }
  return day;
}

function chatQueen(state) {
  const days = new Map();
  for (const x of aboutHeroine(state)) {
    const d = x.at && x.at.day;
    if (!d) continue;
    const row = days.get(d) || { n: 0, who: new Set() };
    row.n += 1;
    const voice = x.who;
    if (voice) row.who.add(voice);
    days.set(d, row);
  }
  const hit = [...days.entries()].filter(([, r]) => r.n >= QUEEN_POSTS && r.who.size >= QUEEN_VOICES).map(([d]) => d).sort();
  return hit.length ? hit[0] : null;
}

function codeFeats(state) {
  const out = {};
  const today = (state.calendar && state.calendar.day) || '';
  const mine = aboutHeroine(state);
  if (mine.length) out.gossip = (mine[0].at && mine[0].at.day) || today;
  const queen = chatQueen(state);
  if (queen) out.chatQueen = queen;
  const inv = state.invites;
  if (inv && ((inv.pending && inv.pending.played) || (Array.isArray(inv.done) && inv.done.length))) out.invited = today;
  const authors = state.feed && state.feed.revealed && state.feed.revealed.authors;
  if (Array.isArray(authors) && authors.length) out.magpieUnmask = today;
  const lucky = luckyRoll(state);
  if (lucky !== null) out.luckyRoll = lucky || today;
  return out;
}

export function syncFeats(state, { src = '' } = {}) {
  if (!state || typeof state !== 'object') return state;
  const have = new Set(normalizeFeats(state.feats).items.map((i) => i.id));
  const fresh = Object.entries(codeFeats(state)).filter(([id]) => !have.has(id));
  if (!fresh.length) return state;
  const f = normalizeFeats(state.feats);
  for (const [id, day] of fresh) f.items.push({ id, src, when: day, why: '', n: f.n });
  return { ...state, feats: normalizeFeats(f) };
}

const CHECKS = {
  jealous: (g) => `someone dear to ${g('her', 'him')} (not a mentor or a passer-by) openly shows jealousy in front of witnesses: gets angry, puts a rival in place, leads ${g('her', 'him')} away, makes a scene over ${g('her', 'his')} deed or someone else's attention to ${g('her', 'him')}. The jealousy is the other person's reaction but ${g('her', 'his')} achievement`,
  correctTeacher: (g) => `${g('she', 'he')} pointed out a mentor's mistake and in the narrator's reply the mentor admitted ${g('her', 'his')} rightness`,
};

const GOOD_MOMENTS = [
  'Обратить провал в номер — превратите собственную ошибку в шутку, над которой смеётся вся трапезная',
  'Перехитрить экзаменатора — найдите в правилах лазейку, которую никто не замечал',
  'Спасти чужую репутацию — возьмите на себя чужой промах при свидетелях',
  'Выйти сухим из воды — объясните невероятное так, что вам поверили',
];
const BAD_MOMENTS = [
  '«Первый поцелуй» за поцелуй — такое уже есть в каталоге',
  '«Высший балл в ведомость» за просто хороший ответ',
  '«Закопать топор войны» за одну мысль о мире',
];

export function featsPromptLines(state, preset, { char = '', heroine = 'героиня', ahead = 0, gender = 'f' } = {}) {
  const g = (f, m) => (gender === 'm' ? m : f);
  const have = new Set(normalizeFeats(state && state.feats).items.map((i) => i.id));
  const open = FEATS.filter((f) => f.src === 'ach' && !have.has(f.id));
  const free = momentDue(state, ahead);
  if (!open.length && !free) return { context: [], rules: [] };
  const context = [];
  const rules = [];
  if (open.length) {
    context.push('Achievements not yet earned (id — condition):', ...open.map((f) => `- ${f.id} — ${CHECKS[f.id] ? CHECKS[f.id](g) : featText(f.id, preset).desc}`));
    rules.push(
      `- ach=id:reason: an achievement of ${heroine} from the list above; reason = a short phrase from the text on what happened. Only what happened in the narrator's reply: the player's line is an attempt, and what the player wrote for others («mentor admitted», «he invited me») does not count until the narrator shows it. Not an intention, dream, rumor or another person's deed ${heroine} had no part in. One listed achievement per reply.`,
    );
  }
  if (free) {
    rules.push(
      `- Free moment: ach=moment:emoji:Title:Description:rarity. Allowed now: if in the narrator's reply ${heroine} did something vivid, funny, wild, bold or heroic (prank, show, stunt, unexpected move), propose a moment, even if the same reply has a listed achievement (the moment describes another detail); not for an ordinary turn or what an achievement already covers. Title: a 2–5-word Russian verb phrase with a cheeky tone, school words only (одноклассник, урок, наставник, четверть; never «сокурсник», «курс», «семестр», «пара»). Description: one Steam-style sentence on what the player did, tied to a real scene detail. Rarity: common or rare (epic only for a major consequence). Good titles: ${GOOD_MOMENTS.map((m) => `«${m}»`).join('; ')}. Bad: ${BAD_MOMENTS.join('; ')}.`,
    );
  }
  return { context, rules };
}
