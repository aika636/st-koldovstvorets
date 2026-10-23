import { GRADES } from '../core/state.mjs';
import { oldStartErrors } from '../core/classmates.mjs';
import { romanceCandidates } from '../core/romance.mjs';
import { EXAM_RULES } from '../core/exams.mjs';
import {
  el, section, runAction, setStatus, call, safe, renderPanel, mounted, uiLabels, artImg,
} from './common.js';

export const REL_OFF_TEXT = {
  label: 'Не отслеживать отношения',
  hint: 'Секретарь не записывает отношения, рассказчик их не получает, записанное замораживается, а не удаляется. Ачивки «Любимчик наставника» и «Бельмо на глазу» при этом не открываются.',
};

export const EXAM_RULE_VIEW = [
  { id: 'story', label: 'Сюжет', hint: 'исход тот, что случился в сцене; не сыгранное к концу недели искусов — остаётся долгом' },
  { id: 'dice', label: 'Кубик', hint: 'бросок против сложности, если сцена исход не назвала' },
];

let uid = 0;
const nextId = (prefix) => `${prefix}_${(uid += 1)}`;

export const CLOSE_MAX = 5;
export const PAST_LIMIT = 200;

export const START_TEXT = {
  section: 'Начало игры',
  hero: 'Героиня',
  heroM: 'Герой',
  heroNote: 'Имя берётся из персоны таверны.',
  gender: 'Обращение',
  genderHint: 'Определяет местоимения и окончания в текстах',
  genderF: 'Она',
  genderM: 'Он',
  grade: 'Класс',
  gradeHint: 'Класс определяет уроки и сетку на неделю.',
  house: 'Факультет',
  houseHint: 'Факультет даёт декана, крыло терема и круг знакомых. Обряд распределения не проводится.',
  houseNone: 'Выберите факультет.',
  startKind: 'Старт',
  startNew: 'Новенькая',
  startNewHint: 'Перевелась с домашнего обучения: знает основы волшбы, но не местный быт. Первые сцены: прибытие, декан, заселение.',
  startOld: 'Давняя ученица',
  startOldHint: 'Учится здесь давно: у неё могут быть близкие, напряжение и прошлое, о котором можно упоминать. Всё по желанию.',
  startNewM: 'Новенький',
  startNewHintM: 'Перевёлся с домашнего обучения: знает основы волшбы, но не местный быт. Первые сцены: прибытие, декан, заселение.',
  startOldM: 'Давний ученик',
  startOldHintM: 'Учится здесь давно: у него могут быть близкие, напряжение и прошлое, о котором можно упоминать. Всё по желанию.',
  close: 'Близкие (по желанию, до пяти)',
  closeHint: 'Ученики выбранного состава из обоих классов: стартовое отношение тёплое. Можно никого не отмечать.',
  groupOwn: 'Ваш класс ({grade})',
  groupOther: 'Другой класс ({grade})',
  groupMentors: 'Наставники',
  tension: 'С кем напряжение (по желанию)',
  tensionHint: 'Стартовое отношение прохладное. Подойдёт ученик любого класса или наставник. Романтическое прошлое никому не назначается.',
  tensionNone: '— ни с кем —',
  past: 'Что о прошлом можно упоминать',
  pastHint: 'Одна строка: например, «росла у бабушки-знахарки, с отцом не ладится».',
  roster: 'Состав',
  firstDay: 'Первый день игры',
  firstIntro: 'Ознакомительный',
  firstIntroHint: 'Уроков нет: заселение, прогулка по терему и двору, знакомства. Занятия начнутся со следующего учебного дня.',
  firstStudy: 'Учебный',
  firstStudyHint: 'Уроки по расписанию с первого звонка.',
  examRule: 'Кто решает исход зачёта или искуса',
  rosterBasic: 'Обычный ({n} учеников)',
  rosterExtended: 'Расширенный ({n})',
  love: 'Кто к ней неравнодушен',
  loveM: 'Кто к нему неравнодушен',
  loveHint: 'Необязательно: выбранный (из любого класса выбранного состава) будет заинтересован с первых сцен. Остальное сложится в игре.',
  loveNone: 'никто заранее — сложится в игре',
  rosterBasicHint: 'Основные ученики карточки.',
  rosterExtendedHint: 'Основные и дополнительные ученики.',
  rosterSuggest: 'Похоже, подключена расширенная карточка',
  rosterChecking: 'Смотрю подключённые книги мира…',
  day: 'Дата начала игры',
  dayWhen: 'Откуда начать',
  dayYear: 'С начала учебного года (1 сентября)',
  dayYearHint: 'Первый учебный день: школьная жизнь с нуля.',
  dayChat: 'С того места, где сейчас чат',
  dayChatHint: 'Расширение подключено посреди истории: игра начнётся с текущего сообщения, дата берётся из последних сообщений.',
  dayChatGoing: 'Чат уже идёт и дата в нём распознана: предлагаем начать с этого места. Игра начнётся с текущего сообщения.',
  dayFromChat: 'Дата взята из чата: {matched}. Её можно поправить: подойдёт любой день учебного года.',
  dayChatNone: 'В последних сообщениях дату распознать не удалось. Поставьте её вручную: подойдёт любой день учебного года.',
  dayFromPick: 'Дата — {date}. Если в сюжете называют дату из другого года, календарь переедет в её год сам, пока в игре ещё ничего не произошло.',
  dayMid: 'Четверть и расписание берутся по календарю школы. Всё, что было раньше этой даты, не пересчитывается: ни праздники, ни прогулы, ни слухи, ни старые сообщения чата.',
  midOldSuggest: 'Старт посреди года: возможно, лучше подойдёт «Давняя ученица», героиня уже освоилась в школе. Выбор за вами.',
  midOldSuggestM: 'Старт посреди года: возможно, лучше подойдёт «Давний ученик», герой уже освоился в школе. Выбор за вами.',
  dayFromPreset: 'Дата — {date}, начало учебного года в сюжете школы. Если в сюжете называют дату из другого года, календарь переедет в её год сам, пока в игре ещё ничего не произошло.',
  button: 'Начать игру',
  again: 'Начать заново',
  againNote: 'Оценки, отношения и слухи этой игры будут стерты, школа соберётся заново.',
  ok: 'Игра начата.',
  running: 'Игра идёт: {grade} класс, {house}.',
  rosterNow: 'Состав: {roster}.',
  rosterNowBasic: 'обычный',
  rosterNowExtended: 'расширенный',
  upgrade: 'Перейти на расширенный состав',
  upgradeAsk: 'К игре добавятся дополнительные ученики: сцены, слухи и знакомства смогут их касаться. Обратно на обычный состав перейти нельзя — только новой игрой. Перейти?',
  upgradeYes: 'Да, перейти',
  upgradeNo: 'Нет',
  upgradeOk: 'Состав расширен.',
  extendedOnly: 'Вернуться к обычному составу можно только новой игрой.',
  stale: 'В этом сохранении расписание, предметы или преподаватели расходятся с данными школы. Пересборка заменит их готовыми, оценки по совпавшим предметам и отношения к преподавателям останутся.',
  rebuild: 'Пересобрать школу из данных',
  rebuildOk: 'Школа пересобрана.',
  noData: 'Данные школы не прочитаны: проверьте папку data у расширения.',
};

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateRu = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${Number(m[1])} года` : 'выбранный день';
};

const fill = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export function startView(input) {
  const { state, roster, draft = {}, hero = {}, hint = {}, suggest = null } = input || {};
  const started = Boolean(state && state.started);
  const grade = GRADES.includes(draft.grade) ? draft.grade : (GRADES.includes(state && state.grade) ? state.grade : 11);
  const houseId = draft.house !== undefined ? draft.house : (state && state.house) || '';
  const gender = ['f', 'm'].includes(draft.gender) ? draft.gender : (['f', 'm'].includes(hero.gender) ? hero.gender : 'f');
  const m = gender === 'm' ? 'M' : '';
  const heroStart = draft.heroStart === 'old' ? 'old' : 'new';
  const mode = draft.roster === 'extended' ? 'extended' : 'basic';
  const houses = roster ? roster.houses.map((h) => {
    const dean = roster.get(h.dean);
    return {
      id: h.id, name: h.name, stone: h.stone, color: h.color, motto: h.motto,
      dean: dean ? dean.name : '', active: h.id === houseId,
    };
  }) : [];

  const houseName = (id) => (roster && roster.house(id) ? roster.house(id).name : '');
  const students = roster ? roster.students : [];
  const mentors = roster ? roster.teachers : [];
  const pool = [...students.filter((p) => p.grade === grade), ...students.filter((p) => p.grade !== grade)];
  const close = (draft.close || []).filter((id, i, a) => pool.some((p) => p.id === id) && a.indexOf(id) === i).slice(0, CLOSE_MAX);
  const tension = (pool.some((p) => p.id === draft.tension) || mentors.some((p) => p.id === draft.tension)) && !close.includes(draft.tension) ? draft.tension : '';
  const past = typeof draft.past === 'string' ? draft.past.slice(0, PAST_LIMIT) : '';
  const lovePool = roster ? romanceCandidates(roster, null, gender, { manual: true }) : [];
  const love = lovePool.some((p) => p.id === draft.love) ? draft.love : '';
  const person = (p) => ({
    id: p.id, name: p.name, house: houseName(p.house), grade: p.grade || 0,
    label: houseName(p.house) ? `${p.name} (${houseName(p.house)})` : p.name,
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru') || (a.id < b.id ? -1 : 1);
  const byClass = (list) => [
    { id: 'own', label: fill(START_TEXT.groupOwn, { grade }), items: list.filter((p) => p.grade === grade).map(person).sort(byName) },
    { id: 'other', label: fill(START_TEXT.groupOther, { grade: grade === 11 ? 12 : 11 }), items: list.filter((p) => p.grade !== grade).map(person).sort(byName) },
  ].filter((g) => g.items.length);
  const closeGroups = byClass(students).map((g) => ({ ...g, items: g.items.map((p) => ({ ...p, on: close.includes(p.id) })) }));
  const mentorLabel = (p) => (p.post ? `${p.name} — ${String(p.post).split(/[:;,—]/)[0].trim().slice(0, 40)}` : p.name);
  const tensionGroups = [
    ...byClass(students.filter((p) => !close.includes(p.id))),
    ...(mentors.length ? [{ id: 'mentors', label: START_TEXT.groupMentors, items: mentors.map((p) => ({ id: p.id, name: p.name, house: '', grade: 0, label: mentorLabel(p) })) }] : []),
  ];
  const loveGroups = [{ id: 'all', label: '', items: lovePool.map(person).sort(byName) }].filter((g) => g.items.length);

  const blockers = [];
  if (!roster) blockers.push(START_TEXT.noData);
  else if (!houses.some((h) => h.active)) blockers.push(START_TEXT.houseNone);
  if (roster && heroStart === 'old') blockers.push(...oldStartErrors(roster, { heroStart, grade, close, tension }));

  const examBy = EXAM_RULES.includes(draft.examBy) ? draft.examBy : (state && EXAM_RULES.includes(state.examBy) ? state.examBy : 'story');
  const firstDay = ['intro', 'study'].includes(draft.firstDay) ? draft.firstDay : 'intro';
  const relOff = typeof draft.relOff === 'boolean' ? draft.relOff : Boolean(state && state.relOff);
  const counts = (input && input.counts) || { basic: 18, extended: 35 };
  const suggested = Boolean(suggest && suggest.suggest);
  const current = started && roster && state.house ? houseName(state.house) : '';
  return {
    started,
    stale: Boolean(input && input.stale),
    heroName: String(hero.name || '').trim(),
    gender,
    grade,
    grades: GRADES.map((g) => ({ id: g, label: `${g} класс`, active: g === grade })),
    houses,
    house: houseId,
    heroStart,
    starts: [
      { id: 'new', label: START_TEXT[`startNew${m}`], hint: START_TEXT[`startNewHint${m}`], active: heroStart === 'new' },
      { id: 'old', label: START_TEXT[`startOld${m}`], hint: START_TEXT[`startOldHint${m}`], active: heroStart === 'old' },
    ],
    examBy,
    relOff,
    examRules: EXAM_RULE_VIEW.map((r) => ({ ...r, active: r.id === examBy })),
    firstDay,
    firstDays: [
      { id: 'intro', label: START_TEXT.firstIntro, hint: START_TEXT.firstIntroHint, active: firstDay === 'intro' },
      { id: 'study', label: START_TEXT.firstStudy, hint: START_TEXT.firstStudyHint, active: firstDay === 'study' },
    ],
    close,
    tension,
    past,
    love,
    loveLabel: gender === 'm' ? START_TEXT.loveM : START_TEXT.love,
    loveHint: START_TEXT.loveHint,
    lovePool: lovePool.map((p) => ({ id: p.id, name: p.name, house: houseName(p.house) })),
    loveGroups,
    closeGroups,
    tensionGroups,
    pool: pool.map((p) => ({ id: p.id, name: p.name, house: houseName(p.house), grade: p.grade, close: close.includes(p.id), tension: p.id === tension })),
    closeFull: close.length >= CLOSE_MAX,
    mode,
    rosters: [
      {
        id: 'basic', active: mode === 'basic', suggested: false,
        label: fill(START_TEXT.rosterBasic, { n: counts.basic }), hint: START_TEXT.rosterBasicHint,
      },
      {
        id: 'extended', active: mode === 'extended', suggested,
        label: fill(START_TEXT.rosterExtended, { n: counts.extended }),
        hint: suggested ? START_TEXT.rosterSuggest : START_TEXT.rosterExtendedHint,
      },
    ],
    suggested,
    suggestPending: Boolean(input && input.suggestPending),
    ...dayView(hint, draft, heroStart, gender),
    blockers,
    canStart: blockers.length === 0,
    runningLine: started && state.grade ? fill(START_TEXT.running, { grade: state.grade, house: current || '—' }) : '',
    rosterLine: started && state.grade
      ? fill(START_TEXT.rosterNow, { roster: state.roster === 'extended' ? START_TEXT.rosterNowExtended : START_TEXT.rosterNowBasic }) : '',
    canUpgrade: started && Boolean(state.grade) && state.roster !== 'extended',
    upgradeSuggested: started && Boolean(state.grade) && state.roster !== 'extended' && suggested,
  };
}

function dayView(hint, draft, heroStart, gender) {
  const m = gender === 'm' ? 'M' : '';
  const h = hint || {};
  const fromChat = h.from === 'chat';
  const chatDay = h.chatDay || (fromChat ? h.day : '') || '';
  const chatMatched = String(h.chatMatched || (fromChat ? h.matched : '') || '').trim();
  const yearDay = h.yearDay || (!fromChat ? h.day : '') || '';
  const prefer = typeof h.preferChat === 'boolean' ? h.preferChat : Boolean(chatDay && fromChat);
  const dayMode = draft.dayMode === 'chat' || draft.dayMode === 'year' ? draft.dayMode : (prefer ? 'chat' : 'year');
  const day = draft.day || (dayMode === 'chat' ? chatDay || yearDay : yearDay || h.day || '');
  const mid = Boolean(day && yearDay && day !== yearDay);
  const note = dayMode === 'chat'
    ? (chatDay ? fill(START_TEXT.dayFromChat, { matched: chatMatched || chatDay }) : START_TEXT.dayChatNone)
    : fill(mid ? START_TEXT.dayFromPick : START_TEXT.dayFromPreset, { date: dateRu(day) });
  return {
    day,
    dayMode,
    dayModes: [
      { id: 'year', label: START_TEXT.dayYear, hint: START_TEXT.dayYearHint, active: dayMode === 'year' },
      { id: 'chat', label: START_TEXT.dayChat, hint: prefer && h.chatGoing ? START_TEXT.dayChatGoing : START_TEXT.dayChatHint, active: dayMode === 'chat', suggested: prefer && dayMode !== 'chat' },
    ],
    dayNote: note,
    midYear: mid,
    dayMidNote: mid ? START_TEXT.dayMid : '',
    oldSuggest: mid && heroStart === 'new' ? START_TEXT[`midOldSuggest${m}`] : '',
  };
}

function radios(name, items, onPick) {
  return el('div', { class: 'koldo-modes' }, items.map((m) => {
    const radio = el('input', { type: 'radio', name, value: String(m.id), checked: m.active });
    radio.addEventListener('change', () => onPick(m.id));
    return el('label', { class: [m.active ? 'koldo-mode koldo-mode-on' : 'koldo-mode', m.suggested ? 'koldo-mode-suggest' : ''].filter(Boolean).join(' ') }, [
      radio,
      m.icon ? el('img', { class: 'koldo-house-icon', src: new URL(`../assets/diary/house-${m.icon}.webp`, import.meta.url).href, alt: '', width: '44', height: '44', style: 'width:44px;height:44px;flex:none;object-fit:contain', draggable: 'false' }) : null,
      m.icon ? el('span', { class: 'koldo-mode-text' }, [
        el('span', { class: 'koldo-mode-label', text: m.label }),
        m.hint ? el('span', { class: 'koldo-note', text: m.hint }) : null,
      ]) : el('span', { class: 'koldo-mode-label', text: m.label }),
      !m.icon && m.hint ? el('span', { class: 'koldo-note', text: m.hint }) : null,
    ]);
  }));
}

function loadSuggestion(host, redraw) {
  if (typeof (host && host.actions && host.actions.suggestRoster) !== 'function') return { res: null, pending: false };
  const key = String(safe(() => host.getChatId(), '') || '');
  const kept = mounted.rosterSuggest;
  if (kept && kept.key === key) return { res: kept.res, pending: kept.res === undefined };
  mounted.rosterSuggest = { key, res: undefined };
  Promise.resolve().then(() => call(host, 'suggestRoster')).then((res) => {
    mounted.rosterSuggest = { key, res: res && res.ok !== false ? res : null };
    redraw();
  }).catch(() => { mounted.rosterSuggest = { key, res: null }; });
  return { res: undefined, pending: true };
}

export function renderStart(host, focus = false) {
  const draft = mounted.startDraft || (mounted.startDraft = {});
  const state = safe(() => host.getState(), null);
  const redraw = () => renderPanel(host);
  const mode = draft.roster === 'extended' ? 'extended' : 'basic';
  const roster = safe(() => host.getRoster(mode), null);
  const sug = loadSuggestion(host, redraw);
  const view = startView({
    state,
    roster,
    draft,
    hero: { name: safe(() => host.getHeroine(), ''), gender: safe(() => host.getHeroGender(), 'f') },
    hint: safe(() => host.getStartHint(), null) || {},
    stale: safe(() => host.getSchoolStale(), false),
    suggest: sug.res,
    suggestPending: sug.pending,
    counts: { basic: safe(() => host.getRoster('basic').students.length, 18), extended: safe(() => host.getRoster('extended').students.length, 35) },
  });
  const status = el('div', { class: 'koldo-status' });
  const key = nextId('koldo_start');
  const form = [];
  const oldNote = el('span', { class: 'koldo-note', text: view.oldSuggest });
  oldNote.hidden = !view.oldSuggest;

  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: view.gender === 'm' ? START_TEXT.heroM : START_TEXT.hero }),
    el('span', { class: 'koldo-note', text: view.heroName ? `${view.heroName}. ${START_TEXT.heroNote}` : START_TEXT.heroNote }),
  ]));
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.gender }),
    radios(`${key}_g`, [{ id: 'f', label: START_TEXT.genderF, active: view.gender === 'f' }, { id: 'm', label: START_TEXT.genderM, active: view.gender === 'm' }],
      (id) => { draft.gender = id; redraw(); }),
    el('span', { class: 'koldo-note', text: START_TEXT.genderHint }),
  ]));
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.grade }),
    radios(`${key}_c`, view.grades, (id) => { draft.grade = Number(id); redraw(); }),
    el('span', { class: 'koldo-note', text: START_TEXT.gradeHint }),
  ]));
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.house }),
    radios(`${key}_h`, view.houses.map((h) => ({
      id: h.id, icon: h.id, active: h.active, label: `${h.name} — ${h.stone}, ${h.color}`,
      hint: `Декан: ${h.dean}. ${h.motto}`,
    })), (id) => { draft.house = id; redraw(); }),
    el('span', { class: 'koldo-note', text: START_TEXT.houseHint }),
  ]));
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.startKind }),
    radios(`${key}_s`, view.starts, (id) => { draft.heroStart = id; redraw(); }),
    oldNote,
  ]));

  if (view.heroStart === 'old') {
    const boxes = view.closeGroups.flatMap((g) => [
      el('span', { class: 'koldo-note koldo-group', text: g.label }),
      ...g.items.map((p) => {
        const box = el('input', { type: 'checkbox', checked: p.on, disabled: !p.on && view.closeFull });
        box.addEventListener('change', () => {
          const set = new Set(view.close);
          if (box.checked) set.add(p.id); else set.delete(p.id);
          draft.close = [...set];
          redraw();
        });
        return el('label', { class: 'koldo-check' }, [box, el('span', { text: p.label })]);
      }),
    ]);
    form.push(el('div', { class: 'koldo-field' }, [
      el('span', { text: `${START_TEXT.close}: ${view.close.length}` }),
      ...boxes,
      el('span', { class: 'koldo-note', text: START_TEXT.closeHint }),
    ]));
    const pick = el('select', { class: 'text_pole koldo-input' }, [
      el('option', { value: '', text: START_TEXT.tensionNone }),
      ...view.tensionGroups.map((g) => el('optgroup', { label: g.label }, g.items.map((p) => el('option', { value: p.id, text: p.label })))),
    ]);
    pick.value = view.tension;
    pick.addEventListener('change', () => { draft.tension = pick.value; redraw(); });
    form.push(el('label', { class: 'koldo-field' }, [
      el('span', { text: START_TEXT.tension }), pick, el('span', { class: 'koldo-note', text: START_TEXT.tensionHint }),
    ]));
    const past = el('input', { type: 'text', class: 'text_pole koldo-input', maxlength: String(PAST_LIMIT), placeholder: START_TEXT.pastHint });
    past.value = view.past;
    past.addEventListener('change', () => { draft.past = past.value; });
    form.push(el('label', { class: 'koldo-field' }, [el('span', { text: START_TEXT.past }), past]));
  }

  const lovePick = el('select', { class: 'text_pole koldo-input' }, [
    el('option', { value: '', text: START_TEXT.loveNone }),
    ...view.loveGroups.flatMap((g) => g.items.map((p) => el('option', { value: p.id, text: p.label }))),
  ]);
  lovePick.value = view.love;
  lovePick.addEventListener('change', () => { draft.love = lovePick.value; redraw(); });
  form.push(el('label', { class: 'koldo-field' }, [
    el('span', { text: view.loveLabel }), lovePick, el('span', { class: 'koldo-note', text: view.loveHint }),
  ]));

  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.roster }),
    radios(`${key}_r`, view.rosters, (id) => { draft.roster = id; redraw(); }),
    view.suggestPending ? el('span', { class: 'koldo-note', text: START_TEXT.rosterChecking }) : null,
  ]));

  const relOff = el('input', { type: 'checkbox', checked: view.relOff });
  relOff.addEventListener('change', () => { draft.relOff = relOff.checked; redraw(); });
  form.push(el('div', { class: 'koldo-field' }, [
    el('label', { class: 'koldo-check' }, [relOff, el('span', { text: REL_OFF_TEXT.label })]),
    el('span', { class: 'koldo-note', text: REL_OFF_TEXT.hint }),
  ]));
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.examRule }),
    radios(`${key}_e`, view.examRules, (id) => { draft.examBy = id; redraw(); }),
  ]));

  const day = el('input', { type: 'date', class: 'text_pole koldo-input', value: view.day });
  day.value = view.day;
  const dayNote = el('p', { class: 'koldo-note', text: view.dayNote });
  const midNote = el('p', { class: 'koldo-note', text: view.dayMidNote });
  midNote.hidden = !view.dayMidNote;
  day.addEventListener('change', () => {
    draft.day = day.value;
    const v = dayView(safe(() => host.getStartHint(), null) || {}, draft, view.heroStart, view.gender);
    dayNote.textContent = v.dayNote;
    midNote.textContent = v.dayMidNote;
    midNote.hidden = !v.dayMidNote;
    oldNote.textContent = v.oldSuggest;
    oldNote.hidden = !v.oldSuggest;
  });
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.dayWhen }),
    radios(`${key}_d`, view.dayModes, (id) => { draft.dayMode = id; draft.day = ''; redraw(); }),
  ]));
  form.push(el('div', { class: 'koldo-row' }, [el('label', { class: 'koldo-field' }, [el('span', { text: START_TEXT.day }), day])]));
  form.push(dayNote, midNote);
  form.push(el('div', { class: 'koldo-field' }, [
    el('span', { text: START_TEXT.firstDay }),
    radios(`${key}_f`, view.firstDays, (id) => { draft.firstDay = id; redraw(); }),
  ]));

  const go = el('div', {
    class: view.canStart ? 'menu_button koldo-btn koldo-btn-main' : 'menu_button koldo-btn koldo-btn-main koldo-btn-off',
    text: view.started ? START_TEXT.again : START_TEXT.button,
    onclick: async (e) => {
      if (!view.canStart) { setStatus(status, 'error', view.blockers.join(' ')); return; }
      const res = await runAction(e.currentTarget, status, () => call(host, 'startTerm', {
        gender: view.gender,
        grade: view.grade,
        house: view.house,
        examBy: view.examBy,
        relOff: view.relOff,
        firstDay: view.firstDay,
        ...(view.love ? { love: view.love } : {}),
        ...(view.heroStart === 'old'
          ? { heroStart: 'old', close: view.close, tension: view.tension, past: view.past }
          : {}),
        ...(view.mode === 'extended' ? { roster: 'extended' } : {}),
      }, { startDay: day.value }), START_TEXT.ok);
      if (res && res.ok !== false) { mounted.startDraft = null; mounted.tab = 'today'; }
      renderPanel(host);
    },
  });

  const parts = [];
  if (view.runningLine) parts.push(el('p', { class: 'koldo-note', text: `${view.runningLine} ${view.rosterLine}`.trim() }));
  if (view.canUpgrade) parts.push(upgradeBlock(host, view));
  else if (view.started && view.rosterLine) parts.push(el('p', { class: 'koldo-note', text: START_TEXT.extendedOnly }));
  if (view.stale) {
    const rebuildStatus = el('div', { class: 'koldo-status' });
    parts.push(el('p', { class: 'koldo-warn', text: START_TEXT.stale }));
    parts.push(el('div', { class: 'koldo-row koldo-row-buttons' }, [el('div', {
      class: 'menu_button koldo-btn',
      text: START_TEXT.rebuild,
      onclick: async (e) => {
        await runAction(e.currentTarget, rebuildStatus, () => call(host, 'rebuildSchool', { grade: view.grade }), START_TEXT.rebuildOk);
        renderPanel(host);
      },
    })]));
    parts.push(rebuildStatus);
  }
  parts.push(artImg('school-letter', 'start'));
  parts.push(...form);
  if (view.started) parts.push(el('p', { class: 'koldo-warn', text: START_TEXT.againNote }));
  if (view.blockers.length && !view.started) parts.push(el('p', { class: 'koldo-note', text: view.blockers.join(' ') }));
  parts.push(el('div', { class: 'koldo-row koldo-row-buttons' }, [go]));
  parts.push(status);
  return section(uiLabels(safe(() => host.getPreset(), {}) || {}).startSection || START_TEXT.section, parts, focus ? 'focus' : false);
}

function upgradeBlock(host, view) {
  const status = el('div', { class: 'koldo-status' });
  const ask = el('div', { class: 'koldo-confirm', hidden: true });
  ask.hidden = true;
  ask.append(
    el('div', { class: 'koldo-confirm-title', text: START_TEXT.upgradeAsk }),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [
      el('div', {
        class: 'menu_button koldo-btn koldo-btn-main',
        text: START_TEXT.upgradeYes,
        onclick: async (e) => {
          const res = await runAction(e.currentTarget, status, () => call(host, 'upgradeRoster'), START_TEXT.upgradeOk);
          ask.hidden = true;
          if (res && res.ok !== false) renderPanel(host);
        },
      }),
      el('div', { class: 'menu_button koldo-btn koldo-btn-small', text: START_TEXT.upgradeNo, onclick: () => { ask.hidden = true; } }),
    ]),
  );
  return el('div', { class: 'koldo-upgrade' }, [
    view.upgradeSuggested ? el('p', { class: 'koldo-note', text: START_TEXT.rosterSuggest }) : null,
    el('div', { class: 'koldo-row koldo-row-buttons' }, [el('div', {
      class: 'menu_button koldo-btn koldo-btn-small',
      text: START_TEXT.upgrade,
      onclick: () => { ask.hidden = false; },
    })]),
    ask,
    status,
  ]);
}
