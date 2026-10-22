import { isPortrait, TEACHER_TEXT_MAX, teacherDetails } from '../core/state.mjs';
import { NOTE_MAX } from '../core/classmates.mjs';
import { reputationLabel } from '../core/reputation.mjs';
import {
  uiLabels, fill, stateHealth, formatDate, capNumbers, str, extraLabels, mounted, el, runAction,
  setStatus, emptyPage, call, renderPanel, avatarNode, svgIcon, safe, loreLinkText, historyCountText, artImg,
} from './common.js';
import {
  classmatesView, bondView, BOND_HISTORY, mentionFields, classmateExtras, classmateAddForm,
} from './classmates.js';
import { feedMentions } from './feed.js';
import { marginDateOf } from './gradebook.js';
import { personAvatar } from '../core/masks.mjs';
import { photoEditor, keptOpen } from './photo.js';

function loreLinkLine(host, p, X) {
  const status = el('span', { class: 'koldo-status' });
  return el('div', { class: 'ad-small ad-soft ad-c-link' }, [
    el('span', { text: p.linkText }),
    ' ',
    el('button', {
      type: 'button', class: 'ad-more', title: X.loreUnlinkHint, text: X.loreUnlink,
      onclick: async () => {
        const res = await call(host, 'unlinkLorePerson', p.id);
        if (res && res.ok === false) setStatus(status, 'error', res.error || '');
        else renderPanel(host);
      },
    }),
    status,
  ]);
}

export const PEOPLE_PARTS = ['teachers', 'classmates'];

export const PEOPLE_HISTORY = BOND_HISTORY;

export function subjectInPost(post, subject) {
  const stem = (w) => w.slice(0, Math.max(4, w.length - 2));
  const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\d]+/gu) || [];
  const pw = words(post);
  const sw = words(subject).filter((w) => w.length > 3);
  return sw.length > 0 && sw.every((w) => pw.some((p) => p.startsWith(stem(w))));
}

export function peopleView(state, preset, opts = {}) {
  const health = stateHealth(state, preset);
  if (health.kind !== 'ok') {
    return { ...health, teachers: [], orphans: [], reputation: '', numbers: [], droppedNumbers: [], course: null };
  }
  const mentions = safe(() => feedMentions(state, preset, { heroine: opts.heroine, roster: opts.roster }), {});

  const U = uiLabels(preset);
  const X = extraLabels(preset);
  const subjects = state.subjects || [];
  const list = state.teachers || [];

  const teachers = list.map((t) => {
    const traits = (t.traits || []).map(str).filter(Boolean);
    const own = subjects.filter((s) => s.teacherId === t.id).map((s) => s.name || s.id);
    const bond = bondView(state, t.id, preset, PEOPLE_HISTORY);
    const details = teacherDetails(t);
    return {
      kind: 'teacher',
      id: t.id,
      name: t.name || t.id,
      role: [details.post, own.filter((n) => !subjectInPost(details.post, n)).join(', ')].filter(Boolean).join(' · ') || U.subjectsNone,
      ...bond,
      ...mentionFields(mentions[t.id]),
      traits,
      traitsText: traits.length ? traits.join(', ') : U.traitsNone,
      hasTraits: traits.length > 0,
      subjects: own,
      subjectsText: own.length ? own.join(', ') : U.subjectsNone,
      post: details.post || '',
      aliasesText: details.aliases ? fill(X.aliasesLine, { aliases: details.aliases.join(', ') }) : '',
      linkText: loreLinkText(X, details.loreLink),
      likes: details.likes || '',
      likesText: details.likes ? fill(X.likesLine, { likes: details.likes }) : '',
      secret: details.secret || '',
      portrait: isPortrait(t.portrait) ? t.portrait : '',
      looks: typeof t.looks === 'string' ? t.looks : '',
      avatar: personAvatar(t),
      note: typeof t.note === 'string' ? t.note : '',
    };
  });

  const orphans = subjects
    .filter((s) => !s.teacherId || !list.some((t) => t.id === s.teacherId))
    .map((s) => s.name || s.id);

  const capped = capNumbers([
    { key: 'teachers', text: fill(U.peopleCountLine, { count: teachers.length }) },
  ], preset);

  return {
    kind: 'ok',
    title: '',
    text: '',
    action: null,
    errors: [],
    teachers,
    orphans,
    teachersTitle: U.teachersTitle,
    course: classmatesView(state, preset, { mentions, roster: opts.roster }),
    heading: U.tabPeople,
    marginDate: marginDateOf(state),
    reputation: reputationLabel(state, preset),
    expelled: Boolean(state.reputation && state.reputation.expelled),
    warned: Boolean(state.reputation && state.reputation.warned),
    numbers: capped.shown,
    droppedNumbers: capped.dropped,
  };
}

const nameKey = (v) => String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е').trim();

export function renderPeople(host, view, preset) {
  if (view.kind !== 'ok') return emptyPage(host, view, ['school-bench', 'people']);

  const U = uiLabels(preset);
  const X = extraLabels(preset);
  const part = PEOPLE_PARTS.includes(mounted.peoplePart) ? mounted.peoplePart : 'teachers';
  const course = view.course || { title: U.classmatesTitle, none: U.classmatesNone, people: [], count: 0 };
  const teachersTitle = view.teachersTitle || U.teachersTitle;
  const items = part === 'classmates' ? course.people : view.teachers;
  const sectionTitle = part === 'classmates' ? course.title : teachersTitle;
  const cur = items.find((p) => p.id === mounted.peoplePerson) || items[0] || null;
  const showCard = mounted.peopleView === 'card' && Boolean(cur);

  const redraw = () => renderPanel(host);
  const open = (id, toPart) => {
    if (toPart) mounted.peoplePart = toPart;
    mounted.peoplePerson = id;
    mounted.peopleView = 'card';
    redraw();
    scrollTop();
  };
  const switchPart = (id) => {
    mounted.peoplePart = id;
    mounted.peoplePerson = '';
    mounted.peopleFilter = 'all';
    mounted.peopleView = 'list';
    redraw();
    scrollTop();
  };

  const buzzN = items.filter((p) => p.buzz).length;
  const filter = mounted.peopleFilter === 'buzz' ? 'buzz' : 'all';
  const rows = items.map((p, i) => personRow(p, {
    U, X, selected: Boolean(cur) && p.id === cur.id, onOpen: () => open(p.id), tint: i % 2 ? 'b' : 'a',
  }));
  const list = el('ul', { class: 'ad-people' }, rows);
  const none = el('div', { class: 'ad-silent', text: X.peopleSearchNone });
  none.hidden = true;
  const applySearch = () => {
    const q = nameKey(mounted.peopleSearch);
    let shown = 0;
    rows.forEach((r, i) => {
      const hiddenByFilter = filter === 'buzz' && !items[i].buzz;
      const match = !q || nameKey(items[i].name).includes(q);
      r.hidden = hiddenByFilter || !match;
      if (!r.hidden) shown += 1;
    });
    none.textContent = q ? X.peopleSearchNone : X.peopleBuzzNone;
    none.hidden = !(items.length && shown === 0);
  };
  const search = el('input', {
    class: 'ad-search', type: 'search', placeholder: X.peopleSearch, 'aria-label': X.peopleSearch,
    value: mounted.peopleSearch || '',
    oninput: (e) => { mounted.peopleSearch = String((e.currentTarget || search).value || ''); applySearch(); },
  });
  search.value = mounted.peopleSearch || '';

  const sections = el('div', { class: 'ad-sections', role: 'tablist' }, [
    ['teachers', teachersTitle, view.teachers.length],
    ['classmates', course.title, course.count],
  ].map(([id, title, count]) => el('button', {
    type: 'button', role: 'tab', 'aria-selected': part === id ? 'true' : 'false',
    onclick: () => switchPart(id),
  }, [el('span', { text: title }), el('span', { class: 'ad-n', text: ` ${count}` })])));

  const pick = (f) => { mounted.peopleFilter = f; redraw(); };
  const filterBar = (buzzN || filter === 'buzz') ? el('div', { class: 'ad-filter', role: 'group', 'aria-label': X.peopleShow }, [
    el('button', { type: 'button', 'aria-pressed': filter === 'all' ? 'true' : 'false', text: X.peopleAll, onclick: () => pick('all') }),
    el('button', { type: 'button', 'aria-pressed': filter === 'buzz' ? 'true' : 'false', onclick: () => pick('buzz') }, [
      el('span', { class: 'ad-dot', 'aria-hidden': 'true' }),
      `${X.peopleBuzz} · ${buzzN}`,
    ]),
  ]) : null;

  const alarm0 = view.expelled ? U.expelledTag : view.warned ? U.warnedTag : '';
  const alarm = alarm0 && !String(view.reputation || '').toLowerCase().includes(String(alarm0).toLowerCase()) ? alarm0 : '';
  const reputation = el('div', { class: 'ad-small ad-soft koldo-people-rep' }, [
    `${U.reputationTitle}: ${view.reputation}`,
    alarm ? ' ' : null,
    alarm ? el('span', { class: 'koldo-alarm', text: alarm }) : null,
  ]);

  const left = [
    artImg('school-bench', 'people'),
    el('div', { class: 'ad-p-title' }, [el('h2', { text: view.heading || U.tabPeople })]),
    reputation,
    search,
    sections,
    filterBar,
  ].filter(Boolean);
  if (!items.length) left.push(el('div', { class: 'ad-silent', text: part === 'classmates' ? course.none : U.peopleNone }));
  else left.push(list, none);
  if (part === 'classmates' && view.course) { left.push(classmateAddForm(host, course, preset)); }
  if (part === 'teachers' && view.orphans.length) {
    left.push(el('div', { class: 'ad-box-warn koldo-orphans' }, [
      el('div', { class: 'ad-bw-h', text: U.orphanSubjectsTitle }),
      el('div', { class: 'ad-small', text: view.orphans.join(', ') }),
    ]));
  }
  applySearch();

  const right = cur
    ? [mounted.spread === true ? null : artImg('school-bench', 'people'), personCard(host, cur, {
      U, X, preset, course, sectionTitle, open,
      back: () => { mounted.peopleView = 'list'; redraw(); scrollTop(); },
      everyone: [...view.teachers, ...course.people],
    })].filter(Boolean)
    : null;

  return {
    l: left,
    r: right,
    people: true,
    view: showCard ? 'card' : 'list',
    blankRight: !right,
    marginDate: view.marginDate,
    lcls: 'ad-illustrated',
  };
}

function scrollTop() {
  const body = mounted.panel && typeof mounted.panel.querySelector === 'function'
    ? mounted.panel.querySelector('.koldo-body') : null;
  if (body && 'scrollTop' in body) body.scrollTop = 0;
}

function portraitNodes(p, { big = false, alt = '', onclick = null, tint = 'a', onBroken = null } = {}) {
  const fallback = avatarNode(p.avatar, { size: 'card' });
  if (!p.portrait) return [fallback];
  const img = el('img', {
    class: 'ad-ph-img', src: p.portrait, alt: alt || p.name, loading: 'lazy',
    onclick,
    ...(onclick ? { tabindex: '0' } : {}),
  });
  const frame = el('span', { class: `ad-ph${big ? ' ad-c-ph' : ''}`, dataset: { alt: tint } }, [
    img,
    el('i', { class: 'ad-attach', dataset: big ? { for: 'photo', size: 'lg' } : { for: 'photo' } }),
  ]);
  if (fallback) fallback.hidden = true;
  img.addEventListener('error', () => {
    img.hidden = true;
    frame.hidden = true;
    if (fallback) fallback.hidden = false;
    if (onBroken) onBroken();
  });
  return [frame, fallback];
}

function personRow(p, { U, X, selected, onOpen, tint }) {
  const role = [];
  if (p.role) role.push(p.role);
  if (p.relation) {
    if (role.length) role.push(el('span', { class: 'ad-sep', text: ' · ' }));
    role.push(el('span', { class: 'ad-rel', text: p.relation }));
  }
  return el('li', { class: `ad-person${selected ? ' ad-sel' : ''}`, dataset: { person: p.id } }, [
    p.buzz ? el('i', { class: 'ad-marker', dataset: { kind: 'feed' } }) : null,
    el('a', {
      href: `#${p.id}`,
      onclick: (e) => { if (e && e.preventDefault) e.preventDefault(); onOpen(); },
    }, [
      el('span', { class: 'ad-pwho' }, [
        el('span', { class: 'ad-name', text: p.name }),
        role.length ? el('span', { class: 'ad-role' }, role) : null,
      ]),
      ...portraitNodes(p, { tint }),
      p.feedLine ? el('span', { class: 'ad-line ad-feed' }, [
        el('span', { class: 'ad-lab', text: fill(X.peopleFeedLine, { feed: U.tabFeed }) }),
        ' ',
        el('span', { text: p.feedLine }),
      ]) : null,
    ]),
  ]);
}

function fact(label, value) {
  return value
    ? el('div', { class: 'ad-kv' }, [el('span', { class: 'ad-k', text: label }), el('span', { text: value })])
    : null;
}

function personCard(host, p, ctx) {
  const { U, X, preset } = ctx;
  const teacher = p.kind === 'teacher';
  const sections = [];

  const extras = teacher
    ? [detailsEditor(host, p, X)]
    : classmateExtras(host, p, ctx.course, preset);
  const editBlock = extras.find((n) => n && n.tagName === 'DETAILS');
  const warnings = extras.filter((n) => n && n !== editBlock);
  const editors = editBlock ? [editBlock] : [];

  const broken = el('span', { class: 'koldo-note koldo-portrait-broken', text: X.portraitBroken });
  broken.hidden = true;
  const portrait = portraitNodes(p, {
    big: true,
    onclick: () => openPortrait(p, X),
    tint: 'a',
    onBroken: () => { broken.hidden = false; },
  });
  const frame = portrait[0] && portrait[0].tagName === 'SPAN' && /ad-ph/.test(portrait[0].className) ? portrait[0] : null;
  if (frame) {
    frame.append(el('button', {
      type: 'button', class: 'ad-c-ph-act', 'aria-label': X.peoplePortraitAct, title: X.peoplePortraitAct,
      onclick: () => {
        if (!editBlock) return;
        editBlock.open = true;
        if (typeof editBlock.scrollIntoView === 'function') editBlock.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
    }, [svgIcon('pencil')]));
  }

  const head = el('div', { class: 'ad-c-head' }, [
    el('div', {}, [
      el('h2', { class: 'ad-c-name', text: p.name }),
      p.aliasesText ? el('div', { class: 'ad-small ad-soft' }, [el('span', { text: p.aliasesText })]) : null,
      p.role ? el('div', { class: 'ad-c-role', text: p.role }) : null,
      p.linkText ? loreLinkLine(host, p, X) : null,
    ]),
    ...portrait,
  ]);

  if (p.bondOn) {
    const open = mounted.peopleHist instanceof Set && mounted.peopleHist.has(p.id);
    const rel = [
      el('h3', { class: 'ad-sec-h', text: U.relationTitle }),
      el('div', { class: 'ad-rel-now' }, [
        p.was ? el('span', { class: 'ad-was', text: p.was }) : null,
        p.bondLabel,
      ]),
      p.why ? el('div', { class: 'ad-rel-why', dataset: { who: teacher ? 'teacher' : 'classmate' }, text: p.why }) : null,
    ];
    if (p.memory.length) {
      rel.push(el('button', {
        type: 'button', class: 'ad-more', 'aria-expanded': open ? 'true' : 'false',
        text: historyCountText(U, p.memory.length),
        onclick: () => {
          if (!(mounted.peopleHist instanceof Set)) mounted.peopleHist = new Set();
          if (open) mounted.peopleHist.delete(p.id); else mounted.peopleHist.add(p.id);
          renderPanel(host);
        },
      }));
      if (open) {
        rel.push(el('ul', { class: 'ad-journal' }, p.memory.map((m) => el('li', {}, [
          el('b', { text: m.text }),
          m.reason ? ` ${m.reason}` : null,
          m.dateLine ? el('span', { class: 'ad-j-meta', text: m.dateLine }) : null,
        ]))));
      }
    } else {
      rel.push(el('div', { class: 'ad-small ad-soft', text: U.relationNoHistory }));
    }
    rel.push(bondFix(host, p, X));
    sections.push(el('div', { class: 'ad-blk' }, rel));
  }

  const facts = teacher
    ? [
      fact(X.peopleTraits, p.traits.join(', ')),
      p.likesText ? el('div', { class: 'ad-kv' }, [el('span', { text: p.likesText })]) : null,
    ]
    : [fact(X.cmAbout, p.about), fact(X.cmDesire, p.desire), fact(X.cmProblem, p.problem), fact(X.cmManner, p.manner), p.known === false ? fact(X.cmStranger, X.cmStrangerText) : null];
  const shownFacts = facts.filter(Boolean);
  if (shownFacts.length) sections.push(el('div', { class: 'ad-blk', style: 'gap: 8px' }, shownFacts));

  if (teacher && p.secret) {
    sections.push(el('details', { class: 'ad-secret', dataset: { for: 'secret' } }, [
      el('summary', { text: X.secretTitle }),
      el('span', { text: p.secret }),
    ]));
  }

  if (p.said.length) {
    sections.push(el('div', { class: 'ad-blk' }, [
      el('h3', { class: 'ad-sec-h', text: X.peopleSaid }),
      ...p.said.map((q) => el('div', { class: 'ad-said' }, [
        el('q', { text: q.text }),
        el('a', {
          class: 'ad-src', href: '#feed',
          onclick: (e) => {
            if (e && e.preventDefault) e.preventDefault();
            mounted.tab = 'feed';
            mounted.feedChan = q.chan;
            mounted.feedFocus = q.id;
            renderPanel(host);
          },
        }, [
          el('i', { text: q.who }), el('span', { text: '·' }), el('span', { text: q.when }),
          el('span', { text: '·' }), el('b', { text: X.peopleToFeed }),
        ]),
      ])),
    ]));
  }

  if (p.links && p.links.length) {
    sections.push(el('div', { class: 'ad-blk' }, [
      el('h3', { class: 'ad-sec-h', text: X.peopleLinks }),
      el('ul', { class: 'ad-links' }, p.links.map((k) => {
        const target = k.id ? ctx.everyone.find((x) => x.id === k.id) : null;
        return el('li', {}, [
          target
            ? el('a', {
              href: `#${k.id}`,
              onclick: (e) => {
                if (e && e.preventDefault) e.preventDefault();
                ctx.open(k.id, target.kind === 'teacher' ? 'teachers' : 'classmates');
              },
              text: k.name,
            })
            : el('b', { text: k.name }),
          k.what ? ` — ${k.what}` : null,
        ]);
      })),
    ]));
  }

  if (!sections.length) sections.push(el('p', { class: 'ad-soft', text: X.peopleBlank }));
  sections.push(noteBlock(host, p, X));

  return [
    el('button', {
      type: 'button', class: 'ad-back', text: fill(X.peopleBack, { title: ctx.sectionTitle }), onclick: ctx.back,
    }),
    el('div', { class: 'ad-c-card' }, [head, p.portrait ? broken : null, ...warnings, ...sections, ...editors]),
  ];
}

function openPortrait(t, X) {
  if (mounted.portrait) mounted.portrait.remove();
  const close = () => {
    if (mounted.portrait) mounted.portrait.remove();
    mounted.portrait = null;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e && e.key === 'Escape') close(); };
  const box = el('div', {
    class: 'koldo-portrait-overlay',
    role: 'dialog',
    'aria-label': `${X.portraitTitle}: ${t.name}`,
    onclick: (e) => { if (e && e.target === e.currentTarget) close(); },
  }, [
    el('figure', { class: 'koldo-portrait-frame' }, [
      el('img', { class: 'koldo-portrait-full', src: t.portrait, alt: t.name }),
      el('figcaption', { text: t.name }),
      el('div', { class: 'menu_button koldo-btn koldo-btn-small', text: X.portraitClose, onclick: close }),
    ]),
  ]);
  document.addEventListener('keydown', onKey);
  (document.getElementById('movingDivs') || document.body).append(box);
  mounted.portrait = box;
  return box;
}

function bondFix(host, p, X) {
  const status = el('div', { class: 'koldo-status' });
  const send = (patch) => runAction(null, status, () => call(host, 'setBond', p.id, patch)).then((res) => { if (res && res.ok !== false) renderPanel(host); });
  const select = el('select', {
    class: 'text_pole koldo-input', 'aria-label': X.bondFixTag, dataset: { for: 'bond-tag' },
    onchange: (e) => send({ tag: e.currentTarget.value }),
  }, p.bondTags.map((t) => el('option', { value: t.id, text: t.label, selected: t.id === p.bondTag })));
  select.value = p.bondTag;
  const full = p.bondShades.length >= 2;
  const shades = el('div', { class: 'koldo-modes', dataset: { for: 'bond-shades' } }, p.bondShadeList.map((s) => {
    const on = p.bondShades.includes(s.id);
    return el('button', {
      type: 'button', class: `menu_button koldo-btn koldo-btn-small${on ? ' koldo-btn-main' : ''}`, text: s.label,
      'aria-pressed': on ? 'true' : 'false', disabled: !on && full,
      onclick: () => send({ shade: s.id, op: on ? '-' : '+' }),
    });
  }));
  return el('details', { class: 'koldo-repair', dataset: { for: 'bond-fix' }, ...keptOpen(`bond::${p.id}`, '') }, [
    el('summary', { text: X.bondFixTitle }),
    el('label', { class: 'koldo-field' }, [el('span', { text: X.bondFixTag }), select]),
    el('div', { class: 'koldo-field' }, [el('span', { text: X.bondFixShades }), shades]),
    el('div', { class: 'ad-small ad-soft', dataset: { for: 'bond-full' }, text: full ? `${X.bondFixFull} ${X.bondFixHint}` : X.bondFixHint }),
    status,
  ]);
}

function noteBlock(host, p, X) {
  const status = el('div', { class: 'koldo-status' });
  const area = el('textarea', {
    rows: '3', class: 'text_pole koldo-input ad-note', placeholder: X.noteHint, maxlength: String(NOTE_MAX),
    'aria-label': X.noteTitle, dataset: { for: 'note' },
  });
  area.value = p.note || '';
  const save = el('div', {
    class: 'menu_button koldo-btn koldo-btn-small',
    text: X.noteSave,
    onclick: async (e) => {
      await runAction(e.currentTarget, status, () => call(host, 'setPersonNote', p.id, String(area.value || '')), X.detailsSaved);
    },
  });
  return el('div', { class: 'ad-blk ad-notes' }, [
    el('h3', { class: 'ad-sec-h', text: X.noteTitle }),
    area,
    el('div', { class: 'ad-small ad-soft', text: X.noteNote }),
    el('div', { class: 'koldo-row koldo-row-buttons' }, [save]),
    status,
  ]);
}

function detailsEditor(host, t, X) {
  const status = el('div', { class: 'koldo-status' });
  const field = (label, value, hint, max, tag = 'input') => {
    const input = el(tag, {
      ...(tag === 'input' ? { type: 'text' } : { rows: '2' }),
      class: 'text_pole koldo-input', value: value || '', placeholder: hint || '',
      ...(max ? { maxlength: String(max) } : {}),
    });
    input.value = value || '';
    return { input, node: el('label', { class: 'koldo-field' }, [el('span', { text: label }), input]) };
  };
  const post = field(X.postField, t.post, X.postHint, TEACHER_TEXT_MAX.post);
  const likes = field(X.likesField, t.likes, X.likesHint, TEACHER_TEXT_MAX.likes);
  const secret = field(X.secretField, t.secret, X.secretHint, TEACHER_TEXT_MAX.secret, 'textarea');
  const traits = field(X.traitsField, (t.traits || []).join(', '), '', 0);
  const portrait = field(X.portraitField, t.portrait, X.portraitHint, 0);
  const save = el('div', {
    class: 'menu_button koldo-btn koldo-btn-small koldo-btn-main',
    text: X.detailsSave,
    onclick: async (e) => {
      const value = String(portrait.input.value || '').trim();
      if (value && !isPortrait(value)) { setStatus(status, 'error', X.portraitBad); return; }
      const patch = {
        post: String(post.input.value || ''),
        likes: String(likes.input.value || ''),
        secret: String(secret.input.value || ''),
        traits: String(traits.input.value || ''),
        portrait: value,
      };
      const res = await runAction(e.currentTarget, status,
        () => call(host, 'setTeacherDetails', t.id, patch),
        X.detailsSaved);
      if (res && res.ok !== false) renderPanel(host);
    },
  });
  return el('details', { class: 'koldo-repair koldo-portrait-edit', ...keptOpen(`edit::${t.id}`, t.id) }, [
    el('summary', { text: X.detailsTitle }),
    el('div', { class: 'koldo-repair-body' }, [
      post.node, likes.node, secret.node, traits.node,
      photoEditor(host, t, X, portrait.node),
      el('div', { class: 'koldo-row koldo-row-buttons' }, [save]),
      status,
    ]),
  ]);
}
