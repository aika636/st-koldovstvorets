export const TAVERN_ID = 'tavern';

export const MATERIALS = [
  { id: "malachite", name: "Малахитовая шкатулка", note: "колдовская школа на Урале", sw: ["#123F35","#F4E7CA","#B66B3E"], ink: "#2C3028",
    fonts: "https://fonts.googleapis.com/css2?family=Kurale&family=Marck+Script&family=PT+Sans:wght@400;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" },
  { id: TAVERN_ID, name: 'Цвета таверны', note: 'как тема SillyTavern', sw: ['#2a2a2e', '#1c1c20', '#e18a24'], ink: '#dcdcd2', fonts: null, internal: true },
];

export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

export const PICKABLE = MATERIALS.filter((m) => !m.internal);

export const LOOKS = ['diary', 'tavern'];

export const AUTO = 'auto';

export function materialById(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}

export function materialCssPath(id) {
  return `materials/${id}.css`;
}

export function resolveMaterial(ui, preset) {
  const u = ui || {};
  if (u.look === 'tavern') return TAVERN_ID;
  if (typeof u.material === 'string' && u.material !== AUTO && materialById(u.material)) return u.material;
  const own = preset && preset.look && preset.look.material;
  return typeof own === 'string' && materialById(own) ? own : TAVERN_ID;
}

export function lookOf(ui) {
  return ui && ui.look === 'tavern' ? 'tavern' : 'diary';
}
