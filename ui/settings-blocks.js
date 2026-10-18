import {
  fill, PRESET_TEXT, extraLabels, uiLabels, mounted, el, clear, runAction, setStatus, section, sectionScope, sectionOpen, formatDate,
  call, safe, renderPanel, renderSettingsBlock,
} from './common.js';
import { DEBUG_TEXT } from './debug.js';
import { LAUNCHER_ICONS, LAUNCHER_ICON_IDS, launcherIconOf, launcherArtUrl } from './icons.js';
import { molvaRefresh } from './molva.js';
import { AUTO, PICKABLE, lookOf, materialById, resolveMaterial } from '../materials/index.mjs';

let uid = 0;
const nextId = (prefix) => `${prefix}_${(uid += 1)}`;

const modelCache = new Map();

function enhanceSelect(select, onPick, tries = 20) {
  if (isTouchScreen()) return;
  const $ = globalThis.jQuery;
  if (typeof $ !== 'function' || !$.fn || typeof $.fn.select2 !== 'function') return;
  if (!select.isConnected) {
    if (tries > 0) setTimeout(() => enhanceSelect(select, onPick, tries - 1), 50);
    return;
  }
  try {
    const $s = $(select);
    if ($s.data('select2')) $s.select2('destroy');
    $s.off('select2:select.koldo');
    $s.select2({
      width: '100%',
      placeholder: 'выбрать из списка',
      dropdownParent: $(select.parentElement),
    });
    $s.on('select2:select.koldo', () => onPick(select.value));
  } catch {}
}

export function isTouchScreen() {
  try {
    return typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function dropEnhance(select) {
  const $ = globalThis.jQuery;
  try { if (typeof $ === 'function' && $(select).data('select2')) $(select).select2('destroy'); } catch {}
}

export function renderApiBlock(host, view) {
  const a = view.api;
  const status = el('div', { class: 'koldo-status' });
  const group = nextId('koldo_api_source');
  const own = a.routed === 'endpoint';

  const endpoint = el('input', { type: 'text', class: 'text_pole koldo-input', value: a.endpoint, placeholder: 'https://api.example.com' });
  const key = el('input', { type: 'password', class: 'text_pole koldo-input', value: a.key, placeholder: 'ключ' });
  const model = el('input', { type: 'text', class: 'text_pole koldo-input', value: a.model, placeholder: 'имя модели' });
  const models = el('select', { class: 'text_pole koldo-input koldo-model-pick', hidden: true });

  const push = () => safe(() => host.setSettings({
    api: { endpoint: endpoint.value.trim(), key: key.value, model: model.value.trim() },
  }, { quiet: true }), null);
  for (const input of [endpoint, key, model]) input.addEventListener('change', push);

  const pickModel = (id) => {
    if (!id) return;
    model.value = id;
    push();
    setStatus(status, 'ok', `Модель: ${id}.`);
  };
  const fillModels = (list) => {
    clear(models);
    models.append(el('option', { value: '', text: `— выбрать из списка (${list.length}) —` }));
    const current = model.value.trim();
    for (const m of list) models.append(el('option', { value: m, text: m, selected: m === current }));
    models.value = list.includes(current) ? current : '';
    models.hidden = !list.length;
    if (list.length) enhanceSelect(models, pickModel);
    else dropEnhance(models);
  };
  models.addEventListener('change', () => pickModel(models.value));
  const cached = modelCache.get(String(a.endpoint || '').trim());
  if (own && cached && cached.length) fillModels(cached);

  const chooseSource = (id) => {
    safe(() => host.setSettings({ api: { source: id } }), null);
    renderPanel(host);
    renderSettingsBlock(host);
  };

  const SOURCES = [
    {
      id: 'tavern',
      label: 'Подключение таверны',
      hint: 'То, чем таверна отвечает прямо сейчас. Ключ вводить не нужно — расширение ничего не отправляет само.',
    },
    {
      id: 'own',
      label: 'Свой адрес с ключом',
      hint: 'Отдельное подключение — нужно, если генерацию хочется пустить на дешёвую модель.',
    },
  ];
  const sourceBox = el('div', { class: 'koldo-modes' }, SOURCES.map((m) => {
    const active = m.id === (own ? 'own' : 'tavern');
    const radio = el('input', { type: 'radio', name: group, value: m.id, checked: active });
    radio.addEventListener('change', () => chooseSource(m.id));
    return el('label', { class: active ? 'koldo-mode koldo-mode-on' : 'koldo-mode' }, [
      radio,
      el('span', { class: 'koldo-mode-label', text: m.label }),
      el('span', { class: 'koldo-note', text: m.hint }),
    ]);
  }));

  let profileRow = null;
  if (!own && a.profiles.length) {
    const select = el('select', { class: 'text_pole koldo-input' }, [
      el('option', { value: '', text: 'То, что выбрано в таверне сейчас', selected: !a.profile }),
      ...a.profiles.map((p) => el('option', {
        value: p.id,
        text: p.model ? `${p.name} (${p.model})` : p.name,
        selected: p.id === a.profile,
      })),
    ]);
    select.value = a.profile;
    select.addEventListener('change', () => {
      safe(() => host.setSettings({ api: { profile: select.value } }, { quiet: true }), null);
      setStatus(status, 'note', select.value
        ? 'Профиль выбран. Проверьте связь — запрос пойдёт через него.'
        : 'Выбрано то, что стоит в таверне сейчас.');
    });
    profileRow = el('label', { class: 'koldo-field' }, [el('span', { text: 'Профиль подключения' }), select]);
  }

  const modelsBtn = own ? el('div', {
    class: 'menu_button koldo-btn koldo-btn-small',
    text: 'Список моделей',
    onclick: async (e) => {
      push();
      const res = await runAction(e.currentTarget, status, () => call(host, 'listModels'), 'Список получен.');
      const list = ((res && res.models) || []).map(String);
      if (list.length) modelCache.set(endpoint.value.trim(), list);
      fillModels(list);
      const via = res && res.via === 'tavern-backend' ? ' Адрес не пускает запросы из браузера, поэтому список спросил сервер таверны — тем же адресом и ключом.' : '';
      if (list.length) setStatus(status, 'ok', `Моделей: ${list.length}. Выберите модель в выпадашке под полем «Модель».${via}`);
    },
  }) : null;

  return section('API для генерации', [
    el('p', {
      class: 'koldo-note',
      text: own
        ? 'Ключ хранится только в этом браузере: в настройки таверны и их экспорт он не попадает, на другом устройстве его нужно ввести заново.'
          + ' Надёжнее — «Подключение таверны» с профилем: там ключ держит сама таверна. Если адрес не пускает запросы из браузера, список моделей за вас спросит сервер самой таверны — тем же адресом и ключом.'
        : 'Генерация пойдёт тем же подключением, которым таверна отвечает в чате. Ключ здесь вводить не нужно и никуда он не уезжает: запрос делает сама таверна.',
    }),
    sourceBox,
    !own && a.connectionAvailable === false
      ? el('p', { class: 'koldo-warn', text: 'Таверна сейчас не отдаёт ни одного подключения: расширению генерировать нечем. Впишите свой адрес либо настройте подключение в самой таверне.' })
      : null,
    a.profileMissing
      ? el('p', { class: 'koldo-warn', text: 'Выбранный профиль подключения в таверне больше не найден — выберите его заново.' })
      : null,
    profileRow,
    own ? el('label', { class: 'koldo-field' }, [el('span', { text: 'Адрес' }), endpoint]) : null,
    own ? el('label', { class: 'koldo-field' }, [el('span', { text: 'Ключ' }), key]) : null,
    own ? el('label', { class: 'koldo-field' }, [el('span', { text: 'Модель' }), model]) : null,
    own ? el('div', { class: 'koldo-field' }, [models]) : null,
    !own ? el('p', { class: 'koldo-note', text: 'Своего списка моделей у подключения таверны нет: модель задаёт сама таверна (или пресет выбранного профиля).' }) : null,
    el('div', { class: 'koldo-row koldo-row-buttons' }, [
      modelsBtn,
      el('div', {
        class: 'menu_button koldo-btn koldo-btn-small',
        text: 'Проверить связь',
        onclick: async (e) => {
          push();
          await runAction(e.currentTarget, status, () => call(host, 'testApi'), 'Связь есть.');
        },
      }),
    ]),
    status,
  ]);
}

const NOT_STARTED = 'Выбирается в «Начале игры».';

export function renderAnalysisBlock(host, view) {
  const ruleGroup = nextId('koldo_exam_rule');
  const status = el('div', { class: 'koldo-status' });
  const rules = view.examRules.length
    ? el('div', { class: 'koldo-modes' }, view.examRules.map((r) => {
      const radio = el('input', { type: 'radio', name: ruleGroup, value: r.id, checked: r.active });
      radio.addEventListener('change', async () => {
        const res = await call(host, 'setExamRule', r.id);
        if (res && res.ok === false) setStatus(status, 'error', res.error || 'Не вышло.');
        else renderPanel(host);
      });
      return el('label', { class: r.active ? 'koldo-mode koldo-mode-on' : 'koldo-mode' }, [
        radio,
        el('span', { class: 'koldo-mode-label', text: r.label }),
        el('span', { class: 'koldo-note', text: r.hint }),
      ]);
    }))
    : el('p', { class: 'koldo-note', text: NOT_STARTED });

  const auto = el('input', { type: 'checkbox', checked: view.secretaryAuto !== false });
  auto.addEventListener('change', () => safe(() => host.setSettings({ secretaryAuto: auto.checked }, { quiet: true }), null));
  return section('Секретарь и правило экзаменов', [
    el('p', { class: 'koldo-note', text: 'Секретарь — отдельный запрос через API Колдовстворца: читает реплику игрока и ответ модели и записывает оценки, прогулы, отношения, поступки и события для слухов. Последний ответ пересчитывается начисто, старый получает поправку датой того ответа. Каждый вывод можно вычеркнуть или разобрать заново кнопкой на плашке под ответом.' }),
    el('label', { class: 'koldo-check' }, [auto, el('span', { text: 'Разбирать каждый новый ответ сам' })]),
    el('p', { class: 'koldo-note', text: 'Выключено — только по кнопке «Разобрать». Включено — запрос на каждый ответ и каждый новый свайп; слухи выходят уже после разбора.' }),
    view.examRules.length ? el('p', { class: 'koldo-note', text: 'Кто решает исход зачёта или искуса в этом чате:' }) : null,
    rules,
    status,
  ]);
}

export function renderPaceBlock(host, view) {
  const group = nextId('koldo_pace');
  const status = el('div', { class: 'koldo-status' });
  const paces = (view.paces || []).length
    ? el('div', { class: 'koldo-modes' }, view.paces.map((p) => {
      const radio = el('input', { type: 'radio', name: group, value: p.id, checked: p.active });
      radio.addEventListener('change', async () => {
        const res = await call(host, 'setRelPace', p.id);
        if (res && res.ok === false) setStatus(status, 'error', res.error || 'Не вышло.');
        else renderPanel(host);
      });
      return el('label', { class: p.active ? 'koldo-mode koldo-mode-on' : 'koldo-mode' }, [
        radio,
        el('span', { class: 'koldo-mode-label', text: p.label }),
        el('span', { class: 'koldo-note', text: p.hint }),
      ]);
    }))
    : el('p', { class: 'koldo-note', text: NOT_STARTED });
  return section('Темп отношений', [
    el('p', { class: 'koldo-note', text: 'Насколько быстро люди меняют отношение к героине (герою). Ссора может быть резкой, дружба копится.' }),
    paces,
    status,
  ]);
}

export function renderModeBlock(host, view) {
  const group = nextId('koldo_mode');
  const modeBox = el('div', { class: 'koldo-modes' }, view.modes.map((m) => {
    const radio = el('input', { type: 'radio', name: group, value: m.id, checked: m.active });
    radio.addEventListener('change', () => {
      safe(() => host.setSettings({ mode: m.id }), null);
      renderPanel(host);
      renderSettingsBlock(host);
    });
    return el('label', { class: m.active ? 'koldo-mode koldo-mode-on' : 'koldo-mode' }, [
      radio,
      el('span', { class: 'koldo-mode-label', text: m.label }),
      el('span', { class: 'koldo-note', text: m.hint }),
    ]);
  }));

  const marker = el('input', { type: 'checkbox', checked: view.injectMarker, disabled: view.injectMarkerLocked });
  marker.addEventListener('change', () => host.setSettings({ injectMarker: marker.checked }));

  const words = el('input', { type: 'checkbox', checked: view.relativeWords });
  words.addEventListener('change', () => host.setSettings({ relativeWords: words.checked }));

  const viaMacro = el('input', { type: 'checkbox', checked: view.statusViaMacro === true });
  viaMacro.addEventListener('change', () => host.setSettings({ statusViaMacro: viaMacro.checked }));

  return section('Источник времени', [
    view.markerRisk
      ? el('p', {
        class: 'koldo-warn',
        text: 'В настройках таверны включён «Encode tags» — служебная метка станет видна прямо в тексте ответа. Выключите его в настройках пользователя либо перейдите на режим «из контекста».',
      })
      : null,
    modeBox,
    el('label', { class: 'koldo-check' }, [
      marker,
      el('span', {
        text: view.injectMarkerLocked
          ? 'Инжектить инструкцию про метку (в режиме «из контекста» не нужна)'
          : 'Инжектить инструкцию про метку',
      }),
    ]),
    el('label', { class: 'koldo-check' }, [
      words,
      el('span', { text: 'Понимать относительные сдвиги словами («на следующее утро», «через неделю») — самая ненадёжная часть' }),
    ]),
    el('label', { class: 'koldo-check' }, [
      viaMacro,
      el('span', {
        text: 'Вставлять строку состояния через макрос {{koldo}} — сами поставьте его в системный промпт, заметку автора или карточку; автоинжект строки выключится',
      }),
    ]),
  ]);
}

export function renderLorebookBlock(host, view) {
  const U = view.labels;
  const L = view.lorebook;
  const status = el('div', { class: 'koldo-status' });

  const toggle = el('input', { type: 'checkbox', checked: L.enabled });
  toggle.addEventListener('change', () => {
    safe(() => host.setSettings({ lorebook: { enabled: toggle.checked } }), null);
    renderPanel(host);
  });

  const book = el('input', {
    type: 'text', class: 'text_pole koldo-input', value: L.book, placeholder: U.lorebookBookHint,
  });
  book.addEventListener('change', () => {
    safe(() => host.setSettings({ lorebook: { book: book.value.trim() } }), null);
  });

  const newName = el('input', { type: 'text', class: 'text_pole koldo-input', placeholder: U.lorebookNewNameHint });
  const newNote = el('input', { type: 'text', class: 'text_pole koldo-input', placeholder: U.lorebookNewNoteHint });
  const kindGroup = nextId('koldo_lore_kind');
  const kindPeople = el('input', { type: 'radio', name: kindGroup, value: 'people', checked: true });
  const kindPlaces = el('input', { type: 'radio', name: kindGroup, value: 'places' });

  const suggestForm = el('div', { class: 'koldo-lore-form' }, [
    el('p', { class: 'koldo-note', text: U.lorebookSuggestNote }),
    el('label', { class: 'koldo-field' }, [el('span', { text: U.lorebookNewName }), newName]),
    el('label', { class: 'koldo-field' }, [el('span', { text: U.lorebookNewNote }), newNote]),
    el('div', { class: 'koldo-modes' }, [
      el('label', { class: 'koldo-mode' }, [kindPeople, el('span', { class: 'koldo-mode-label', text: U.lorebookKindPeople })]),
      el('label', { class: 'koldo-mode' }, [kindPlaces, el('span', { class: 'koldo-mode-label', text: U.lorebookKindPlaces })]),
    ]),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [
      el('div', {
        class: 'menu_button koldo-btn koldo-btn-small',
        text: U.lorebookNewButton,
        onclick: async (e) => {
          const res = await runAction(e.currentTarget, status, () => call(host, 'suggestLorebookEntry', {
            name: newName.value.trim(),
            note: newNote.value.trim(),
            kind: kindPlaces.checked ? 'places' : 'people',
          }), U.lorebookNewOk);
          if (res && res.ok !== false) { newName.value = ''; newNote.value = ''; }
        },
      }),
    ]),
  ]);

  const suggestList = L.suggest.length
    ? el('ul', { class: 'koldo-lore-list' }, L.suggest.map((e) => el('li', { class: 'koldo-lore-item' }, [
      el('div', { class: 'koldo-lore-name', text: e.name }),
      e.text ? el('div', { class: 'koldo-note', text: e.text }) : null,
      el('div', {
        class: 'menu_button koldo-btn koldo-btn-small',
        text: U.lorebookAccept,
        onclick: (ev) => runAction(ev.currentTarget, status,
          () => call(host, 'acceptLorebookSuggestion', e.uid), U.lorebookAcceptOk),
      }),
    ])))
    : el('p', { class: 'koldo-note', text: U.lorebookNoSuggest });

  const orphans = L.orphans.length
    ? [
      el('h5', { class: 'koldo-sub-title', text: U.lorebookOrphansTitle }),
      el('p', { class: 'koldo-note', text: U.lorebookOrphansNote }),
      el('ul', { class: 'koldo-lore-list' },
        L.orphans.map((o) => el('li', { class: 'koldo-lore-item' }, [el('code', { text: o.uid })]))),
      el('div', { class: 'koldo-row koldo-row-buttons' }, [
        el('div', {
          class: 'menu_button koldo-btn koldo-btn-small',
          text: fill(U.lorebookPrune, { count: L.orphans.length }),
          onclick: async (e) => {
            const res = await runAction(e.currentTarget, status, () => call(host, 'pruneLorebook'), '');
            if (res && res.ok !== false) {
              setStatus(status, 'ok', fill(U.lorebookPruned, { count: Number(res.removed) || 0 }));
              renderPanel(host);
            }
          },
        }),
      ]),
    ]
    : [];

  return section(U.lorebookSection, [
    el('label', { class: 'koldo-check' }, [toggle, el('span', { text: U.lorebookToggle })]),
    el('p', { class: 'koldo-note', text: U.lorebookNote }),
    ...(L.enabled ? [
      L.boundLine ? el('p', { class: 'koldo-note', text: L.boundLine }) : null,
      L.explain ? el('p', { class: 'koldo-warn', text: L.explain }) : null,
      L.state ? el('p', { class: L.state.phase === 'error' ? 'koldo-warn' : 'koldo-note', text: L.state.line }) : null,
      L.state ? el('details', { class: 'koldo-lore-changes' }, [
        el('summary', { text: U.lorebookChanges }),
        L.state.rows.length
          ? el('ul', { class: 'koldo-lore-list' }, L.state.rows.map((r) => el('li', { class: 'koldo-lore-item', text: `${r.label}: ${r.title}` })))
          : el('p', { class: 'koldo-note', text: U.lorebookChangesNone }),
      ]) : null,
      el('label', { class: 'koldo-field' }, [el('span', { text: U.lorebookBookField }), book]),
      L.measureLine ? el('p', { class: 'koldo-note', text: L.measureLine }) : null,
      L.overCapLine ? el('p', { class: 'koldo-warn', text: L.overCapLine }) : null,
      el('div', { class: 'koldo-row koldo-row-buttons' }, [
        el('div', {
          class: 'menu_button koldo-btn koldo-btn-small',
          text: U.lorebookRefresh,
          onclick: async (e) => {
            const res = await runAction(e.currentTarget, status, () => call(host, 'syncLorebook'), U.lorebookRefreshOk);
            if (res && res.ok !== false) renderPanel(host);
          },
        }),
      ]),
      el('h5', { class: 'koldo-sub-title', text: U.lorebookSuggestTitle }),
      suggestList,
      el('h5', { class: 'koldo-sub-title', text: U.lorebookNewTitle }),
      suggestForm,
      ...orphans,
    ] : [el('p', { class: 'koldo-note', text: U.lorebookOff })]),
    status,
  ]);
}

export function renderTransferBlock(host, view) {
  const U = view.labels;
  const status = el('div', { class: 'koldo-status' });
  const confirmBox = el('div', { class: 'koldo-confirm', hidden: true });

  const file = el('input', { type: 'file', accept: 'application/json,.json', class: 'koldo-file', hidden: true });

  const load = async (text, button, confirm) => {
    const res = await runAction(button, status, () => call(host, 'importState', text, { confirm }), U.importOk);
    if (res && res.needsConfirm) {
      askConfirm(confirmBox, U, {
        reasons: res.reasons || [],
        current: res.current,
        incoming: res.incoming,
        onYes: (btn) => load(text, btn, true),
        onNo: () => { file.value = ''; setStatus(status, 'ok', U.importCancelled); },
      });
      return;
    }
    if (res && res.ok !== false) {
      confirmBox.hidden = true;
      file.value = '';
      mounted.tab = 'today';
      renderPanel(host);
    }
  };

  file.addEventListener('change', async () => {
    const picked = file.files && file.files[0];
    if (!picked) return;
    confirmBox.hidden = true;
    let text = '';
    try {
      text = await picked.text();
    } catch (err) {
      setStatus(status, 'error', `Файл не прочитался: ${(err && err.message) || err}`);
      return;
    }
    await load(text, null, false);
  });

  const save = async (e) => {
    const res = await runAction(e.currentTarget, status, () => call(host, 'exportState'), '');
    if (!res || res.ok === false) return;
    try {
      const url = URL.createObjectURL(new Blob([res.json], { type: 'application/json' }));
      const a = el('a', { href: url, download: res.filename });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(status, 'ok', fill(U.exportOk, { filename: res.filename }));
    } catch (err) {
      setStatus(status, 'error', `Файл не отдался браузеру: ${(err && err.message) || err}`);
    }
  };

  return section(U.transferSection, [
    el('p', { class: 'koldo-note', text: U.transferNote }),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [
      el('div', { class: 'menu_button koldo-btn koldo-btn-small', text: U.exportButton, onclick: save }),
    ]),
    el('div', { class: 'koldo-field' }, [
      el('span', { text: U.importPick }),
      el('div', { class: 'menu_button koldo-btn koldo-btn-small', text: U.importButton, onclick: () => file.click() }),
      file,
    ]),
    confirmBox,
    status,
  ]);
}

function summaryLine(summary, U) {
  if (!summary) return U.summaryNothing;
  const tail = summary.started ? '' : ` (${U.summaryNotStarted})`;
  return fill(U.summaryLine, {
    day: summary.day || '—',
    subjects: summary.subjects,
    grades: summary.grades,
  }) + tail;
}

function askConfirm(box, U, { reasons, current, incoming, onYes, onNo, onView = null, question = null }) {
  clear(box);
  box.hidden = false;
  box.append(el('div', { class: 'koldo-confirm-title', text: question ? question.title : U.importConfirmTitle }));
  if (question) {
    if (question.note) box.append(el('p', { class: 'koldo-note', text: question.note }));
  } else {
    if (reasons && reasons.length) {
      box.append(el('ul', { class: 'koldo-errors' }, reasons.map((r) => el('li', { text: String(r) }))));
    }
    box.append(el('div', { class: 'koldo-summary' }, [
      el('div', {}, [el('b', { text: `${U.summaryCurrent}: ` }), summaryLine(current, U)]),
      incoming ? el('div', {}, [el('b', { text: `${U.summaryIncoming}: ` }), summaryLine(incoming, U)]) : null,
    ]));
  }
  const yes = el('div', {
    class: 'menu_button koldo-btn koldo-btn-main',
    text: question ? PRESET_TEXT.switchYes : U.importConfirmYes,
    tabindex: '0',
    role: 'button',
    onclick: (e) => { box.hidden = true; onYes(e.currentTarget); },
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.hidden = true; onYes(e.currentTarget); } },
  });
  box.append(el('div', { class: 'koldo-row koldo-row-buttons' }, [
    yes,
    onView ? el('div', {
      class: 'menu_button koldo-btn koldo-btn-main',
      text: PRESET_TEXT.switchView,
      tabindex: '0',
      role: 'button',
      onclick: (e) => { box.hidden = true; onView(e.currentTarget); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); box.hidden = true; onView(e.currentTarget); } },
    }) : null,
    el('div', {
      class: 'menu_button koldo-btn koldo-btn-small',
      text: question ? PRESET_TEXT.switchNo : U.importConfirmNo,
      onclick: () => { box.hidden = true; onNo(); },
    }),
  ]));
  try {
    if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'nearest' });
    if (typeof yes.focus === 'function') yes.focus({ preventScroll: true });
  } catch {}
}

export function renderSoundBlock(host, preset, settings) {
  const X = extraLabels(preset);
  const status = el('div', { class: 'koldo-status' });
  const box = el('input', { type: 'checkbox', checked: settings.milestoneSound === true });
  box.addEventListener('change', () => safe(() => host.setSettings({ milestoneSound: box.checked }, { quiet: true }), null));
  const feats = el('input', { type: 'checkbox', checked: settings.achievements !== false });
  feats.addEventListener('change', () => safe(() => host.setSettings({ achievements: feats.checked }, { quiet: true }), null));
  return section(X.soundSection, [
    el('label', { class: 'koldo-check' }, [feats, el('span', { text: X.achToggle })]),
    el('p', { class: 'koldo-note', text: X.achToggleNote }),
    el('label', { class: 'koldo-check' }, [box, el('span', { text: X.soundToggle })]),
    el('p', { class: 'koldo-note', text: X.soundNote }),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [
      el('div', {
        class: 'menu_button koldo-btn koldo-btn-small',
        text: X.soundTry,
        onclick: () => { if (!playChime()) setStatus(status, 'note', X.soundTried); },
      }),
    ]),
    status,
  ]);
}

export function renderFeedBlock(host, preset, settings, extra = null) {
  const X = extraLabels(preset);
  const U = uiLabels(preset);
  const feed = (settings && settings.feed) || {};
  const every = el('input', {
    type: 'number', min: '1', max: '99', step: '1', class: 'text_pole koldo-input koldo-molva-every',
    value: String(Number.isInteger(feed.molvaEvery) && feed.molvaEvery >= 1 ? feed.molvaEvery : 3),
    disabled: feed.molvaManual === true,
  });
  const manual = el('input', { type: 'checkbox', checked: feed.molvaManual === true });
  every.addEventListener('change', () => {
    const raw = Math.trunc(Number(every.value));
    const n = String(every.value).trim() === '' || !Number.isFinite(raw) ? 3 : Math.max(1, Math.min(99, raw));
    every.value = String(n);
    safe(() => host.setSettings({ feed: { molvaEvery: n } }, { quiet: true }), null);
  });
  manual.addEventListener('change', () => {
    every.disabled = manual.checked;
    safe(() => host.setSettings({ feed: { molvaManual: manual.checked } }, { quiet: true }), null);
  });
  const swear = el('select', { class: 'text_pole koldo-input koldo-molva-swear' },
    [['off', X.molvaSwearOff], ['mild', X.molvaSwearMild], ['free', X.molvaSwearFree]].map(([v, t]) => el('option', { value: v, text: t })));
  swear.value = ['off', 'free'].includes(feed.swear) ? feed.swear : 'mild';
  swear.addEventListener('change', () => safe(() => host.setSettings({ feed: { swear: swear.value } }, { quiet: true }), null));
  const digest = el('input', {
    type: 'number', min: '0', max: '8', step: '1', class: 'text_pole koldo-input koldo-digest-max',
    value: String(Number.isInteger(feed.digestMax) && feed.digestMax >= 0 ? feed.digestMax : 4),
  });
  digest.addEventListener('change', () => {
    const raw = Math.trunc(Number(digest.value));
    const n = String(digest.value).trim() === '' || !Number.isFinite(raw) ? 4 : Math.max(0, Math.min(8, raw));
    digest.value = String(n);
    safe(() => host.setSettings({ feed: { digestMax: n } }, { quiet: true }), null);
  });
  const hooks = el('input', { type: 'checkbox', checked: feed.hooks !== false });
  const auto = el('input', { type: 'checkbox', checked: feed.auto === true, disabled: feed.hooks === false });
  const background = el('input', { type: 'checkbox', checked: feed.background !== false });
  const prep = el('input', { type: 'checkbox', checked: !settings || settings.prep !== false });
  hooks.addEventListener('change', () => safe(() => host.setSettings({ feed: { hooks: hooks.checked } }), null));
  auto.addEventListener('change', () => safe(() => host.setSettings({ feed: { auto: auto.checked } }), null));
  background.addEventListener('change', () => safe(() => host.setSettings({ feed: { background: background.checked } }), null));
  prep.addEventListener('change', () => safe(() => host.setSettings({ prep: prep.checked }, { quiet: true }), null));
  return section(U.tabFeed, [
    el('label', { class: 'koldo-check' }, [hooks, el('span', { text: X.feedHooksToggle })]),
    el('p', { class: 'koldo-note', text: X.feedHooksNote }),
    el('label', { class: 'koldo-check' }, [prep, el('span', { text: X.feedPrepToggle })]),
    el('p', { class: 'koldo-note', text: X.feedPrepNote }),
    el('label', { class: 'koldo-check' }, [background, el('span', { text: X.feedBackgroundToggle })]),
    el('p', { class: 'koldo-note', text: X.feedBackgroundNote }),
    el('label', { class: 'koldo-check' }, [auto, el('span', { text: X.feedAutoToggle })]),
    el('p', { class: 'koldo-note', text: X.feedAutoNote }),
    el('p', { class: 'koldo-note', text: X.feedMuteNote }),
    el('div', { class: 'koldo-mob-title koldo-mob-heading', text: X.molvaWhen }),
    el('label', { class: 'koldo-field koldo-field-inline' }, [el('span', { text: X.molvaEvery }), every]),
    el('p', { class: 'koldo-note koldo-molva-price', text: X.molvaPrice }),
    el('label', { class: 'koldo-check' }, [manual, el('span', { text: X.molvaManual })]),
    el('p', { class: 'koldo-note', text: X.molvaManualNote }),
    el('label', { class: 'koldo-field koldo-field-inline' }, [el('span', { text: X.molvaSwear }), swear]),
    el('label', { class: 'koldo-field koldo-field-inline' }, [el('span', { text: X.digestMax }), digest]),
    el('p', { class: 'koldo-note', text: X.digestNote }),
    molvaRefresh(host, preset),
    ...(Array.isArray(extra) ? extra : []),
  ]);
}

let chimeCtx = null;

export function playChime() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AC !== 'function') return false;
    chimeCtx = chimeCtx || new AC();
    const ctx = chimeCtx;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      Promise.resolve(ctx.resume()).catch(() => {});
    }
    const t0 = (Number(ctx.currentTime) || 0) + 0.02;
    for (const [freq, at] of [[659.25, 0], [880, 0.12]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.4);
    }
    return ctx.state !== 'suspended';
  } catch {
    return false;
  }
}

export function renderDebugBlock(host, view) {
  const T = DEBUG_TEXT;
  const box = el('input', { type: 'checkbox', checked: view.debug });
  box.addEventListener('change', () => {
    safe(() => host.setSettings({ debug: box.checked }), null);
    renderPanel(host);
    renderSettingsBlock(host);
  });
  return section(T.section, [
    el('label', { class: 'koldo-check' }, [box, el('span', { text: T.toggle })]),
    el('p', { class: 'koldo-note', text: T.hint }),
  ]);
}

export function renderDrawBlock(host, preset, settings) {
  const info = host && typeof host.getDraw === 'function' ? safe(() => host.getDraw(), null) : null;
  if (!info) return null;
  const X = extraLabels(preset);
  const draw = (settings && settings.draw) || {};
  const select = (label, options, value, onPick, cls) => {
    const node = el('select', { class: `text_pole koldo-input ${cls}` },
      options.map((o) => el('option', { value: o.id, text: o.label, selected: o.id === value })));
    node.value = value;
    node.addEventListener('change', () => onPick(node.value));
    return el('label', { class: 'koldo-field' }, [el('span', { text: label }), node]);
  };
  if (!info.available || !info.available.length) {
    return section(X.drawSection, [
      el('p', { class: 'koldo-note koldo-draw-none', text: info.hint || X.drawNoRoute }),
      el('p', { class: 'koldo-note', text: X.drawKeysNote }),
    ]);
  }
  const custom = info.route === 'custom' && info.custom ? info.custom : null;
  const children = [
    select(X.drawRouteField, info.available, info.route,
      (v) => safe(() => host.setSettings({ draw: { route: v } }), null), 'koldo-draw-route'),
  ];
  if (custom) {
    children.push(...renderCustomFields(host, X, custom, select));
  } else if (info.route === 'tavern') {
    children.push(el('p', { class: 'koldo-note', text: X.drawTavernNote }));
  } else if (info.models && info.models.length) {
    children.push(select(X.drawModelField, info.models, info.model,
      (v) => safe(() => host.setSettings({ draw: { models: { ...(draw.models || {}), [info.route]: v } } }), null),
      'koldo-draw-model'));
  }
  children.push(select(X.drawStyleField,
    (info.styles || []).map((id) => ({ id, label: (X.drawStyles && X.drawStyles[id]) || id })), info.style,
    (v) => safe(() => host.setSettings({ draw: { style: v } }), null), 'koldo-draw-style'));
  if (info.style === 'own') {
    const own = el('input', {
      type: 'text', class: 'text_pole koldo-input koldo-draw-style-text',
      value: info.styleText || '', placeholder: X.drawStyleTextHint, maxlength: '1000',
    });
    own.value = info.styleText || '';
    own.addEventListener('change', () => safe(() => host.setSettings({ draw: { styleText: own.value.trim() } }, { quiet: true }), null));
    children.push(
      el('label', { class: 'koldo-field' }, [el('span', { text: X.drawStyleTextField }), own]),
      el('p', { class: 'koldo-note', text: X.drawStyleTextNote }),
    );
  }
  if (info.route === 'novel' || (custom && custom.mode === 'novelai')) {
    children.push(select(X.drawSizeField,
      (info.naiSizes || []).map((id) => ({ id, label: (X.drawSizes && X.drawSizes[id]) || id })), info.naiSize,
      (v) => safe(() => host.setSettings({ draw: { naiSize: v } }), null), 'koldo-draw-size'));
  }
  children.push(
    el('p', { class: 'koldo-note koldo-draw-price', text: X.drawPrice }),
    el('p', { class: custom ? 'koldo-note koldo-draw-custom-note' : 'koldo-note', text: custom ? X.drawCustomNote : X.drawKeysNote }),
  );
  return section(X.drawSection, children);
}

const drawModelCache = new Map();

function renderCustomFields(host, X, c, select) {
  const status = el('div', { class: 'koldo-status' });
  const nai = c.mode === 'novelai';
  const listId = nextId('koldo_draw_models');
  const endpoint = el('input', {
    type: 'text', class: 'text_pole koldo-input koldo-draw-endpoint', value: c.endpoint,
    placeholder: c.defaultEndpoint || 'https://api.example.com/v1',
  });
  const key = el('input', { type: 'password', class: 'text_pole koldo-input koldo-draw-key', value: c.key, placeholder: 'ключ' });
  const model = el('input', {
    type: 'text', class: 'text_pole koldo-input koldo-draw-custom-model', value: c.model,
    placeholder: (c.suggestions && c.suggestions[0]) || 'имя модели', list: listId,
  });
  const list = el('datalist', { id: listId });
  const cacheKey = () => `${c.mode}|${endpoint.value.trim()}`;
  const fillList = () => {
    clear(list);
    const ids = [...new Set([...(c.suggestions || []), ...(drawModelCache.get(cacheKey()) || [])])];
    for (const id of ids) list.append(el('option', { value: id, text: (c.suggestionLabels && c.suggestionLabels[id]) || '' }));
  };
  fillList();
  const push = () => safe(() => host.setSettings({
    draw: { custom: { endpoint: endpoint.value.trim(), key: key.value.trim(), model: model.value.trim() } },
  }, { quiet: true }), null);
  for (const input of [endpoint, key, model]) input.addEventListener('change', push);

  const loadBtn = nai ? null : el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-draw-load',
    text: X.drawCustomLoad,
    onclick: async (e) => {
      push();
      const res = await runAction(e.currentTarget, status, () => call(host, 'loadDrawModels'),
        (r) => (r && r.models && r.models.length ? fill(X.drawCustomLoaded, { n: r.models.length }) : X.drawCustomNone));
      const models = ((res && res.models) || []).map(String);
      if (models.length) drawModelCache.set(cacheKey(), models);
      fillList();
    },
  });
  return [
    select(X.drawCustomMode, c.modes || [], c.mode,
      (v) => safe(() => host.setSettings({ draw: { custom: { mode: v } } }), null), 'koldo-draw-mode'),
    el('label', { class: 'koldo-field' }, [el('span', { text: X.drawCustomEndpoint }), endpoint]),
    c.needsEndpoint ? null : el('p', { class: 'koldo-note', text: X.drawCustomEndpointHint }),
    el('label', { class: 'koldo-field' }, [el('span', { text: nai ? X.drawCustomNaiKey : X.drawCustomKey }), key]),
    el('label', { class: 'koldo-field' }, [el('span', { text: X.drawCustomModel }), model, list]),
    loadBtn ? el('div', { class: 'koldo-row koldo-row-buttons' }, [loadBtn]) : null,
    status,
  ];
}

export const LOOK_TEXT = {
  section: 'Оформление',
  look: 'Вид',
  lookDiary: 'Ежедневник',
  lookTavern: 'Цвета таверны',
  material: 'Материал ежедневника',
  materialAuto: 'Как у сеттинга',
  materialNow: 'сейчас — {name}',
  sample: 'Аа',
  change: 'Сменить',
  close: 'Закрыть',
  hint: '«Ежедневник» — страницы и обложка под сеттинг; «Цвета таверны» — те же страницы в красках темы SillyTavern.',
  tavernNote: 'Сейчас включены цвета таверны, материал не нужен.',
  icon: 'Значок кнопки',
  iconHint: 'Значок плавающей кнопки, которой открывается Колдовстворец.',
};

export function lookSummary(settings, preset) {
  const T = LOOK_TEXT;
  const ui = (settings && settings.ui) || {};
  if (lookOf(ui) === 'tavern') return T.lookTavern;
  const m = materialById(resolveMaterial(ui, preset));
  return `${m ? m.name : T.lookDiary} · ${T.lookDiary.toLowerCase()}`;
}

function matPrev(m) {
  return el('span', {
    class: 'ad-mat-prev',
    style: `--ad-mp-bg:${m.sw[1]};--ad-mp-ink:${m.ink || '#222'};--ad-mp-cover:${m.sw[0]}`,
  }, [el('b', { text: LOOK_TEXT.sample }), el('i'), el('i')]);
}

export function renderLookBlock(host, preset, settings) {
  const T = LOOK_TEXT;
  const ui = (settings && settings.ui) || {};
  const look = lookOf(ui);
  const own = typeof ui.material === 'string' && materialById(ui.material) ? ui.material : AUTO;
  const save = (patch) => safe(() => host.setSettings({ ui: patch }), null);
  const tavern = look === 'tavern';

  const seg = el('div', { class: 'ad-seg', role: 'group', 'aria-label': T.look }, [
    ['diary', T.lookDiary], ['tavern', T.lookTavern],
  ].map(([id, name]) => el('button', {
    type: 'button',
    'aria-pressed': String(look === id),
    dataset: { look: id },
    text: name,
    onclick: () => { if (look !== id) save({ look: id }); },
  })));

  const fromPreset = materialById(resolveMaterial({}, preset)) || PICKABLE[0];
  const items = [
    {
      id: AUTO, name: T.materialAuto, note: fill(T.materialNow, { name: fromPreset.name.toLowerCase() }),
      sw: fromPreset.sw, ink: fromPreset.ink,
    },
    ...PICKABLE,
  ];
  const cur = items.find((m) => m.id === own) || items[0];
  const row = (m) => [
    matPrev(m),
    el('div', {}, [el('div', { class: 'ad-pk-name', text: m.name }), el('div', { class: 'ad-pk-note', text: m.note })]),
  ];

  const key = `${sectionScope}::set:matopen`;
  const opened = sectionOpen.get(key) === true && !tavern;
  const list = el('div', { class: 'ad-pick-list', hidden: !opened },
    items.map((m) => el('button', {
      type: 'button',
      class: 'ad-pick',
      'aria-pressed': String(m.id === cur.id),
      dataset: { mat: m.id },
      disabled: tavern,
      onclick: () => save({ material: m.id }),
    }, row(m))));
  const toggle = el('button', {
    type: 'button',
    class: 'ad-btn ad-quiet ad-tiny',
    text: opened ? T.close : T.change,
    disabled: tavern,
    onclick: () => {
      const open = list.hidden;
      list.hidden = !open;
      toggle.textContent = open ? T.close : T.change;
      sectionOpen.set(key, open);
    },
  });

  const iconNow = launcherIconOf(ui);
  const icons = el('div', { class: 'ad-icon-pick', role: 'group', 'aria-label': T.icon },
    LAUNCHER_ICON_IDS.map((id) => el('button', {
      type: 'button',
      class: 'ad-pick ad-icon-opt',
      'aria-pressed': String(id === iconNow),
      dataset: { icon: id },
      onclick: () => { if (id !== iconNow) save({ launcherIcon: id }); },
    }, [
      el('span', { class: 'ad-icon-sample', ...(LAUNCHER_ICONS[id].art ? {} : { html: LAUNCHER_ICONS[id].svg }) }, LAUNCHER_ICONS[id].art ? [el('img', { class: 'ad-icon-art', src: launcherArtUrl(LAUNCHER_ICONS[id].art), alt: '', style: 'width:42px;height:42px;object-fit:contain', draggable: 'false' })] : []),
      el('span', { class: 'ad-pk-name', text: LAUNCHER_ICONS[id].name }),
      el('span', { class: 'ad-pk-note', text: LAUNCHER_ICONS[id].note }),
    ])));

  return [
    el('div', { class: 'ad-set-sub' }, [el('h4', { text: T.look }), seg]),
    el('div', { class: 'ad-set-sub' }, [
      el('h4', { text: T.material }),
      el('div', { class: 'ad-pick' }, [...row(cur), toggle]),
      list,
      el('p', { text: tavern ? T.tavernNote : T.hint }),
    ]),
    el('div', { class: 'ad-set-sub' }, [el('h4', { text: T.icon }), icons, el('p', { text: T.iconHint })]),
  ];
}
