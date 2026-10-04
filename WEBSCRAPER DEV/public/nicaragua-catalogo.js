const get = id => document.getElementById(id);
let products = [];
const nio = value => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(value);
function element(tag, text, className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function render() {
  const query = get('search').value.trim().toLocaleLowerCase('es');
  const rows = products.filter(row => (!get('store').value || row.store_id === get('store').value)
    && `${row.product_name} ${row.brand}`.toLocaleLowerCase('es').includes(query)
    && (!get('priced').checked || row.sale_price_value !== null || row.regular_price_value !== null));
  get('status').textContent = `${rows.length} de ${products.length} productos`;
  get('grid').replaceChildren(...rows.map(row => {
    const card = element('article', '', 'card');
    const placeholder = () => element('div', 'Imagen no disponible', 'placeholder');
    if (/^https:\/\//.test(row.image_url)) {
      const image = document.createElement('img'); image.src = row.image_url; image.alt = row.image_alt || row.product_name; image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(placeholder()), { once: true }); card.append(image);
    } else card.append(placeholder());
    card.append(element('p', row.source_site, 'store'), element('h2', row.product_name));
    const price = row.sale_price_value ?? row.regular_price_value;
    card.append(element('p', price === null ? 'Sin precio publicado' : nio(price), 'price'));
    if (row.sale_price_value !== null && row.regular_price_value > row.sale_price_value) card.append(element('p', `Regular: ${nio(row.regular_price_value)} · ${row.discount || 'Oferta'}`, 'regular'));
    card.append(element('p', row.availability.startsWith('https://schema.org/') ? row.availability.split('/').at(-1) : row.availability || 'Disponibilidad no confirmada'));
    const link = element('a', 'Ver en tienda'); link.href = row.product_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    return card;
  }));
}
async function load() {
  get('refresh').disabled = true; get('status').textContent = 'Cargando catálogo NC…';
  try {
    const response = await fetch('/nicaragua-catalogo.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Aún no hay catálogo NC generado en DEV.');
    const snapshot = await response.json();
    if (snapshot.version !== 1 || snapshot.country !== 'NC' || snapshot.currency !== 'NIO' || !Array.isArray(snapshot.products)) throw new Error('Formato de catálogo NC inválido.');
    if (snapshot.products.some(row => row.country !== 'NC' || row.currency !== 'NIO' || !/^https:\/\//.test(row.product_url))) throw new Error('Productos ajenos al catálogo NC.');
    products = snapshot.products;
    get('date').textContent = `Consulta: ${new Date(snapshot.scrapedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })} · ${products.length} productos`;
    const selection = get('store').value;
    get('store').replaceChildren(new Option('Todas las tiendas', ''), ...[...new Map(products.map(row => [row.store_id, row.source_site]))].map(([id, name]) => new Option(name, id)));
    get('store').value = selection; render();
  } catch (error) { products = []; get('grid').replaceChildren(); get('date').textContent = 'Catálogo no disponible'; get('status').textContent = error.message; }
  finally { get('refresh').disabled = false; }
}
for (const id of ['search', 'store', 'priced']) get(id).addEventListener('input', render);
get('refresh').addEventListener('click', load);
load();
