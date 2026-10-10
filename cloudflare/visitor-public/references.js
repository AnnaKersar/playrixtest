let refs=[];
let selectedCategory = '';
const $ = id => document.getElementById(id);
const categories = ['C1', 'C2', 'C3', 'C4', 'C5'];
const descriptions = {
  '': 'Все референсы, сгруппированные по типу композиции. Выберите категорию, чтобы увидеть её описание и карточки.',
  C1: 'C1 — изолированный предмет: главный объект на декоративном фоне, без окружения.',
  C2: 'C2 — предмет на простой плоскости: под объектом есть несложная поверхность на всю ширину карточки.',
  C3: 'C3 — предмет с проработанной поверхностью: объект и значимая опора или участок окружения образуют единую композицию.',
  C4: 'C4 — цельная сцена: предметы показаны вместе с окружением, пространством и деталями обстановки.',
  C5: 'C5 — сюжет с персонажами: люди или животные участвуют в действии и становятся центром композиции.'
};
const categoryOf = ref => categories.includes(ref.category) ? ref.category : 'unknown';
const categoryLabel = category => category === 'unknown' ? 'Не определена' : category;
function renderButtons() {
  $('categories').replaceChildren(...['', ...categories].map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.category = category;
    button.setAttribute('aria-pressed', String(selectedCategory === category));
    button.setAttribute('aria-controls', 'grid');
    const label = document.createElement('span');
    label.textContent = category ? categoryLabel(category) : 'Все категории';
    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = category ? refs.filter(ref => categoryOf(ref) === category).length : refs.length;
    button.append(label, count);
    button.addEventListener('click', () => {
      selectedCategory = category;
      renderButtons();
      render();
    });
    return button;
  }));
}
function card(ref) {
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = '/api/references/image?id=' + encodeURIComponent(ref.id);
  image.loading = 'lazy';
  image.alt = ref.name || ref.id;
  const caption = document.createElement('figcaption');
  const badge = document.createElement('span');
  badge.className = 'reference-category';
  badge.textContent = categoryLabel(categoryOf(ref));
  const name = document.createElement('strong');
  name.textContent = ref.name || ref.id;
  const meta = document.createElement('span');
  meta.className = 'reference-meta';
  meta.textContent = [ref.id, ref.collection].filter(Boolean).join(' · ');
  caption.append(badge, name, meta);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Уверенность и источник';
  const evidence = document.createElement('pre');
  evidence.textContent = JSON.stringify(ref.categoryEvidence || {}, null, 2);
  details.append(summary, evidence);
  figure.append(image, caption, details);
  return figure;
}
function render() {
  $('category-description').textContent = descriptions[selectedCategory];
  const query = $('search').value.trim().toLocaleLowerCase('ru');
  const rows = refs.filter(ref =>
    (!selectedCategory || categoryOf(ref) === selectedCategory) &&
    [ref.id, ref.name, ref.collection].join(' ').toLocaleLowerCase('ru').includes(query)
  );
  $('status').textContent = rows.length + ' / ' + refs.length + ' оригиналов';
  const sections = (selectedCategory ? [selectedCategory] : categories).flatMap(category => {
    const group = rows.filter(ref => categoryOf(ref) === category)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'ru', {numeric: true}));
    if (!group.length) return [];
    const section = document.createElement('section');
    section.className = 'reference-group';
    const heading = document.createElement('h2');
    heading.textContent = categoryLabel(category) + ' · ' + group.length + ' референсов';
    const cards = document.createElement('div');
    cards.className = 'reference-cards';
    cards.append(...group.map(card));
    section.append(heading, cards);
    return [section];
  });
  if (!sections.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = query ? 'По этому запросу референсы не найдены.' : 'В этой категории пока нет референсов.';
    sections.push(empty);
  }
  $('grid').replaceChildren(...sections);
}
$('search').addEventListener('input', render);
renderButtons();
fetch('/api/references').then(async response => {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Не удалось загрузить референсы');
  refs = data.references;
  renderButtons();
  render();
}).catch(error => {
  $('status').textContent = error.message;
}).finally(() => $('grid').setAttribute('aria-busy', 'false'));
