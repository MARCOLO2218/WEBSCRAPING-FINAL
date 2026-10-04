const get = id => document.getElementById(id);
let products = [];
let filteredRows = [];
const nio = value => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(value);
function element(tag, text, className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function render() {
  const query = get('search').value.trim().toLocaleLowerCase('es');
  const rows = products.filter(row => (!get('store').value || row.store_id === get('store').value)
    && `${row.product_name} ${row.brand}`.toLocaleLowerCase('es').includes(query)
    && (!get('priced').checked || row.sale_price_value !== null || row.regular_price_value !== null));
  rows.sort((a, b) => {
    if (get('sort').value === 'name') return a.product_name.localeCompare(b.product_name, 'es');
    const left = a.sale_price_value ?? a.regular_price_value;
    const right = b.sale_price_value ?? b.regular_price_value;
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return get('sort').value === 'asc' ? left - right : right - left;
  });
  filteredRows = rows;
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
    get('store-status').replaceChildren(...snapshot.stores.map(store => element('li', `${storeNames[store.store] || store.store}: ${store.status === 'ok' ? 'consulta correcta' : 'consulta fallida; datos anteriores conservados si existían'} · ${store.scrapedAt || snapshot.scrapedAt || 'Sin consulta anterior'}`)));
    get('date').textContent = `Consulta: ${new Date(snapshot.scrapedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })} · ${products.length} productos`;
    const selection = get('store').value;
    get('store').replaceChildren(new Option('Todas las tiendas', ''), ...[...new Map(products.map(row => [row.store_id, row.source_site]))].map(([id, name]) => new Option(name, id)));
    get('store').value = selection; render();
  } catch (error) { products = []; get('grid').replaceChildren(); get('date').textContent = 'Catálogo no disponible'; get('status').textContent = error.message; }
  finally { get('refresh').disabled = false; }
}
for (const id of ['search', 'store', 'priced', 'sort']) get(id).addEventListener('input', render);
get('export').addEventListener('click', () => {
  const quote = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const lines = [['Tienda', 'Producto', 'Precio NIO', 'URL', 'Fecha consulta'], ...filteredRows.map(row => [row.source_site, row.product_name, row.sale_price_value ?? row.regular_price_value, row.product_url, row.scraped_at])];
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.map(line => line.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'catalogo-nicaragua.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
get('refresh').addEventListener('click', load);
const storeNames = { 'la-curacao': 'La Curacao', 'el-gallo': 'El Gallo más Gallo', siman: 'Siman', walmart: 'Walmart', maxipali: 'Maxi Pali' };
for (const [id, name] of Object.entries(storeNames)) {
  const label = element('label', name); const input = document.createElement('input'); input.type = 'checkbox'; input.value = id; input.checked = true; label.prepend(input); get('run-stores').append(label);
}
let activeJob = null;
function busy(value) { get('run-all').disabled = value; get('run-selected').disabled = value; }
async function watch(id) {
  activeJob = id; busy(true);
  try {
    const response = await fetch(`/api/nc/job?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo consultar el trabajo. Recargue la página para recuperar el estado.');
    const { job } = await response.json();
    let progress = {};
    try { progress = JSON.parse(job.output || '{}'); } catch { /* Progress not yet available. */ }
    const states = { queued: 'pendiente', running: 'consultando', ok: 'completada', empty: 'sin resultados; se conserva consulta anterior', error: 'falló; se conserva consulta anterior' };
    get('job-status').textContent = `${job.status === 'queued' ? `En cola: posición ${job.queuePosition}` : job.status === 'running' ? 'Consulta NC en curso' : job.status === 'done' ? 'Consulta terminada' : 'Consulta terminada con errores'}${progress.message ? ` · ${progress.message}` : ''}`;
    get('store-status').replaceChildren(...(progress.stores || job.stores.map(store => ({ store, status: 'queued' }))).map(store => element('li', `${storeNames[store.store]}: ${states[store.status] || store.status}${store.count !== undefined ? ` · ${store.count} productos` : ''}`)));
    if (['done', 'error'].includes(job.status)) { activeJob = null; busy(false); await load(); }
    else setTimeout(() => watch(id), 2000);
  } catch (error) { activeJob = null; busy(false); get('job-status').textContent = error.message; }
}
async function run(all) {
  if (activeJob) return;
  const stores = [...get('run-stores').querySelectorAll('input:checked')].map(input => input.value);
  if (!all && !stores.length) { get('job-status').textContent = 'Seleccione al menos una tienda.'; return; }
  busy(true);
  try {
    const response = await fetch('/api/nc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { mode: 'all' } : { stores }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo iniciar la consulta.');
    watch(body.job.id);
  } catch (error) { busy(false); get('job-status').textContent = error.message; }
}
get('run-all').addEventListener('click', () => run(true));
get('run-selected').addEventListener('click', () => run(false));
load();
fetch('/api/nc/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(status => { if (status?.currentJobId) watch(status.currentJobId); }).catch(() => {});
