// Названия годов обучения для текста: номера классов в тексте не используются.
// Числа 11 и 12 остаются служебными ключами данных и состояния.
const FINAL = 12;

export const gradeNameRu = (grade, form = 'nom') => {
  const final = Number(grade) === FINAL;
  if (form === 'gen') return final ? 'выпускного курса' : 'старшего курса';
  return final ? 'выпускной курс' : 'старший курс';
};

export const gradeNameEn = (grade) => (Number(grade) === FINAL ? 'final-year' : 'upper-year');
