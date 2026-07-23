const state = {
  products: [],
  filtered: [],
  selectedId: null,
  currentPage: 1,
  pageSize: 100,
};

let scraperStatusTimer = null;
let localScraperRequestRunning = false;
let catalogReloadedAfterSharedScraper = false;
let activeJobWaitRunning = false;
const ACTIVE_SCRAPER_JOB_KEY = 'facenco_active_scraper_job_id';

const elements = {
  productsBody: document.querySelector('#productsBody'),
  searchInput: document.querySelector('#searchInput'),
  weekFilter: document.querySelector('#weekFilter'),
  storeFilter: document.querySelector('#storeFilter'),
  brandFilter: document.querySelector('#brandFilter'),
  categoryFilter: document.querySelector('#categoryFilter'),
  availabilityFilter: document.querySelector('#availabilityFilter'),
  offersOnly: document.querySelector('#offersOnly'),
  compareFacenco: document.querySelector('#compareFacenco'),
  clearFilters: document.querySelector('#clearFilters'),
  runScraperButton: document.querySelector('#runScraperButton'),
  exportButton: document.querySelector('#exportButton'),
  statusBar: document.querySelector('#statusBar'),
  weekBadge: document.querySelector('#weekBadge'),
  runBadge: document.querySelector('#runBadge'),
  countBadge: document.querySelector('#countBadge'),
  avgPrice: document.querySelector('#avgPrice'),
  cheaperCount: document.querySelector('#cheaperCount'),
  expensiveCount: document.querySelector('#expensiveCount'),
  storeCount: document.querySelector('#storeCount'),
  detailImage: document.querySelector('#detailImage'),
  detailProduct: document.querySelector('#detailProduct'),
  detailStore: document.querySelector('#detailStore'),
  detailPrice: document.querySelector('#detailPrice'),
  detailDiff: document.querySelector('#detailDiff'),
  detailAvailability: document.querySelector('#detailAvailability'),
  detailDate: document.querySelector('#detailDate'),
  detailDescription: document.querySelector('#detailDescription'),
  detailUuid: document.querySelector('#detailUuid'),
  detailRunUuid: document.querySelector('#detailRunUuid'),
  detailUrl: document.querySelector('#detailUrl'),
  paginationSummary: document.querySelector('#paginationSummary'),
  paginationBar: document.querySelector('#paginationBar'),
  pageSizeSelect: document.querySelector('#pageSizeSelect'),
  prevPageButton: document.querySelector('#prevPageButton'),
  nextPageButton: document.querySelector('#nextPageButton'),
  pageInfo: document.querySelector('#pageInfo'),
};

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function fixTextEncoding(value) {
  if (value === null || value === undefined) return value;
  let text = String(value);
  const replacements = {
    'catÃƒÂ¡logo': 'catÃ¡logo',
    'CatÃƒÂ¡logo': 'CatÃ¡logo',
    'colchÃƒÂ³n': 'colchÃ³n',
    'ColchÃƒÂ³n': 'ColchÃ³n',
    'ColchonerÃƒÂ­a': 'ColchonerÃ­a',
    'colchonerÃƒÂ­a': 'colchonerÃ­a',
    'sÃƒÂ¡bana': 'sÃ¡bana',
    'SÃƒÂ¡bana': 'SÃ¡bana',
    'edredÃƒÂ³n': 'edredÃ³n',
    'EdredÃƒÂ³n': 'EdredÃ³n',
    'sillÃƒÂ³n': 'sillÃ³n',
    'SillÃƒÂ³n': 'SillÃ³n',
    'sofÃƒÂ¡': 'sofÃ¡',
    'SofÃƒÂ¡': 'SofÃ¡',
    'recÃƒÂ¡mara': 'recÃ¡mara',
    'RecÃƒÂ¡mara': 'RecÃ¡mara',
    'mÃƒÂ¡s': 'mÃ¡s',
    'MÃƒÂ¡s': 'MÃ¡s',
  };

  for (const [bad, good] of Object.entries(replacements)) {
    text = text.split(bad).join(good);
  }

  return text;
}

function normalizeProductText(product) {
  return Object.fromEntries(
    Object.entries(product).map(([key, value]) => [
      key,
      typeof value === 'string' ? fixTextEncoding(value) : value,
    ]),
  );
}

function displayValue(value) {
  return value || '-';
}

function imageProxyUrl(value) {
  return `/api/image?url=${encodeURIComponent(value)}`;
}

function uniqueValues(key) {
  return [...new Set(state.products.map((product) => product[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'es'));
}

function fillSelect(select, values, labelFormatter = (value) => value) {
  const current = select.value;
  select.innerHTML = '<option value="">Todas</option>';

  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFormatter(value);
    select.append(option);
  }

  select.value = values.includes(current) ? current : '';
}

function refreshFilters() {
  fillSelect(elements.weekFilter, uniqueValues('semana_run'), (value) => `Semana ${value}`);
  fillSelect(elements.storeFilter, uniqueValues('sitio_fuente'));
  fillSelect(elements.brandFilter, uniqueValues('marca'));
  fillSelect(elements.categoryFilter, uniqueValues('categoria'));
  fillSelect(elements.availabilityFilter, uniqueValues('disponibilidad'));
}

function applyFilters() {
  const q = elements.searchInput.value.trim().toLowerCase();
  const filters = {
    semana_run: elements.weekFilter.value,
    sitio_fuente: elements.storeFilter.value,
    marca: elements.brandFilter.value,
    categoria: elements.categoryFilter.value,
    disponibilidad: elements.availabilityFilter.value,
  };

  state.currentPage = 1;

  state.filtered = state.products.filter((product) => {
    for (const [key, value] of Object.entries(filters)) {
      if (value && String(product[key] ?? '') !== String(value)) return false;
    }

    if (elements.offersOnly.checked && !product.precio_oferta) return false;

    if (q) {
      const text = [product.producto, product.marca, product.sitio_fuente, product.categoria]
        .join(' ')
        .toLowerCase();
      if (!text.includes(q)) return false;
    }

    return true;
  });

  render();
}

function diffClass(product) {
  if (!elements.compareFacenco.checked || product.etiqueta_diferencia === 'Sin referencia') return 'neutral';
  if (product.etiqueta_diferencia === 'Mas barato') return 'good';
  if (product.etiqueta_diferencia === 'Mas caro') return 'bad';
  return 'neutral';
}

function diffText(product) {
  if (!elements.compareFacenco.checked) return 'Comparacion oculta';
  if (product.diferencia_facenco === null || product.diferencia_facenco === undefined) {
    return product.etiqueta_diferencia || 'Sin referencia';
  }

  const sign = product.diferencia_facenco > 0 ? '+' : '';
  return `${product.etiqueta_diferencia} (${sign}${formatMoney(product.diferencia_facenco)})`;
}

function totalPages() {
  return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
}

function currentPageRows() {
  const pages = totalPages();
  if (state.currentPage > pages) state.currentPage = pages;
  if (state.currentPage < 1) state.currentPage = 1;

  const start = (state.currentPage - 1) * state.pageSize;
  return state.filtered.slice(start, start + state.pageSize);
}

function renderPagination() {
  const pages = totalPages();
  const total = state.filtered.length;
  const start = total ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(state.currentPage * state.pageSize, total);

  elements.paginationSummary.textContent = total
    ? `Mostrando ${start}-${end} de ${total} registros`
    : 'Sin registros';
  elements.pageInfo.textContent = `Pagina ${state.currentPage} de ${pages}`;
  elements.prevPageButton.disabled = state.currentPage <= 1;
  elements.nextPageButton.disabled = state.currentPage >= pages;
}

function renderTable() {
  elements.productsBody.innerHTML = '';

  if (!state.filtered.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" class="muted-text">No hay productos para mostrar. Ejecuta el scraper o limpia filtros.</td>';
    elements.productsBody.append(row);
    renderPagination();
    return;
  }

  for (const product of currentPageRows()) {
    const row = document.createElement('tr');
    row.className = String(product.id) === String(state.selectedId) ? 'active' : '';
    row.innerHTML = `
      <td>${displayValue(product.id)}</td>
      <td>Semana ${displayValue(product.semana_run)}</td>
      <td class="product-cell">${displayValue(product.producto)}</td>
      <td>${displayValue(product.sitio_fuente)}</td>
      <td>${displayValue(product.marca)}</td>
      <td>${displayValue(product.categoria)}</td>
      <td class="price">${displayValue(product.precio_regular)}</td>
      <td class="price">${displayValue(product.precio_oferta)}</td>
      <td class="availability-cell">${displayValue(product.disponibilidad)}</td>
      <td class="diff-cell"><span class="pill ${diffClass(product)}">${diffText(product)}</span></td>
    `;
    row.addEventListener('click', () => selectProduct(product.id));
    elements.productsBody.append(row);
  }

  renderPagination();
}

function renderMetrics() {
  const prices = state.filtered
    .map((product) => product.precio_numero)
    .filter((price) => price !== null && price !== undefined);
  const average = prices.length ? prices.reduce((sum, price) => sum + Number(price), 0) / prices.length : null;
  const stores = new Set(state.filtered.map((product) => product.sitio_fuente).filter(Boolean));
  const cheaper = state.filtered.filter((product) => product.etiqueta_diferencia === 'Mas barato').length;
  const expensive = state.filtered.filter((product) => product.etiqueta_diferencia === 'Mas caro').length;
  const last = state.products.at(-1);

  elements.avgPrice.textContent = formatMoney(average);
  elements.cheaperCount.textContent = String(cheaper);
  elements.expensiveCount.textContent = String(expensive);
  elements.storeCount.textContent = String(stores.size);
  elements.weekBadge.textContent = last?.semana_run ? `Semana ${last.semana_run}` : 'Semana -';
  elements.runBadge.textContent = last?.run_id ? `Run ID ${last.run_id}` : 'Run ID -';
  elements.countBadge.textContent = `${state.filtered.length} productos`;
}

function selectProduct(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) return;

  state.selectedId = product.id;
  elements.detailProduct.textContent = displayValue(product.producto);
  elements.detailStore.textContent = `${displayValue(product.sitio_fuente)} - ${displayValue(product.marca)}`;
  elements.detailPrice.textContent = product.precio_oferta || product.precio_regular || '-';
  elements.detailDiff.textContent = diffText(product);
  elements.detailAvailability.textContent = displayValue(product.disponibilidad);
  elements.detailDate.textContent = displayValue(product.fecha_scraping);
  elements.detailDescription.textContent = product.descripcion || product.beneficios || 'Sin descripcion disponible.';
  elements.detailUuid.textContent = displayValue(product.registro_uuid);
  elements.detailRunUuid.textContent = displayValue(product.run_uuid);
  elements.detailUrl.href = product.url_producto || product.url_fuente || '#';

  if (product.url_imagen) {
    elements.detailImage.innerHTML = `<img src="${imageProxyUrl(product.url_imagen)}" alt="${product.texto_imagen || product.producto || 'Producto'}" />`;
  } else {
    elements.detailImage.textContent = 'Imagen no disponible';
  }

  renderTable();
}

function render() {
  renderMetrics();
  renderTable();

  if (!state.selectedId && state.filtered.length) {
    selectProduct(state.filtered[0].id);
  }
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('No se pudo cargar el catalogo.');
    state.products = (await response.json()).map(normalizeProductText);
    state.filtered = [...state.products];
    state.selectedId = null;
    refreshFilters();
    applyFilters();
  } catch (error) {
    console.error(error);
    elements.productsBody.innerHTML = '<tr><td colspan="10" class="muted-text">No se pudo cargar el catalogo. Revisa PostgreSQL, .env y que ya exista data.</td></tr>';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStoredScraperJobId() {
  try {
    return window.localStorage.getItem(ACTIVE_SCRAPER_JOB_KEY);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function setStoredScraperJobId(jobId) {
  try {
    window.localStorage.setItem(ACTIVE_SCRAPER_JOB_KEY, jobId);
  } catch (error) {
    console.warn(error);
  }
}

function clearStoredScraperJobId() {
  try {
    window.localStorage.removeItem(ACTIVE_SCRAPER_JOB_KEY);
  } catch (error) {
    console.warn(error);
  }
}

function resetScraperButton() {
  localScraperRequestRunning = false;
  elements.runScraperButton.disabled = false;
  elements.runScraperButton.textContent = 'Ejecutar scraper y actualizar';
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(message, type = 'info') {
  elements.statusBar.textContent = message;
  elements.statusBar.dataset.type = type;
}

function scrollProductsToStart() {
  const tablePanel = document.querySelector('.table-panel');
  const tableWrap = document.querySelector('.table-wrap');

  if (tableWrap) {
    tableWrap.scrollLeft = 0;
  }

  if (tablePanel) {
    tablePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function queueMessage(status) {
  const queueSize = Number(status?.queueSize || 0);
  if (queueSize > 1) {
    return `Scraper en ejecucion. Hay ${queueSize - 1} solicitud(es) esperando turno. La pagina se actualizara cuando termine.`;
  }
  if (status?.running || queueSize === 1) {
    return 'Scraper en ejecucion. Este proceso puede tardar varios minutos. La pagina se actualizara cuando termine.';
  }
  return '';
}

async function getScraperStatus() {
  const { response, data } = await fetchJsonWithTimeout('/api/scraper-status', { cache: 'no-store' }, 10000);
  if (!response.ok) throw new Error('No se pudo consultar el estado del scraper.');
  return data;
}

function stopScraperStatusPolling() {
  if (scraperStatusTimer) {
    clearInterval(scraperStatusTimer);
    scraperStatusTimer = null;
  }
}

function startScraperStatusPolling() {
  stopScraperStatusPolling();
  scraperStatusTimer = setInterval(async () => {
    try {
      const storedJobId = getStoredScraperJobId();

      if (storedJobId && !activeJobWaitRunning) {
        activeJobWaitRunning = true;
        localScraperRequestRunning = true;
        elements.runScraperButton.disabled = true;
        elements.runScraperButton.textContent = 'Esperando mi solicitud...';
        setStatus(`Solicitud propia en seguimiento (${storedJobId}). Si actualizaste la pagina, el sistema retomara el estado automaticamente.`, 'running');

        waitForScraperJob(storedJobId)
          .then(async (finishedJob) => {
            await loadProducts();
            setStatus(extractRunMessage(finishedJob.output) || 'Scraper finalizado correctamente. Catalogo actualizado.', 'ok');
          })
          .catch((error) => {
            console.error(error);
            setStatus(`Error: ${error.message}`, 'error');
          })
          .finally(() => {
            clearStoredScraperJobId();
            activeJobWaitRunning = false;
            stopScraperStatusPolling();
            resetScraperButton();
          });
        return;
      }

      const status = await getScraperStatus();
      const message = queueMessage(status);

      if (message) {
        catalogReloadedAfterSharedScraper = false;

        if (localScraperRequestRunning) {
          setStatus(message, 'running');
          elements.runScraperButton.disabled = true;
          elements.runScraperButton.textContent = status.queueSize > 1 ? 'Solicitud en cola...' : 'Ejecutando scraper...';
        } else {
          setStatus(`${message} Puedes enviar otra solicitud si necesitas correrlo de nuevo; quedara en cola.`, 'running');
          elements.runScraperButton.disabled = false;
          elements.runScraperButton.textContent = 'Ejecutar scraper y actualizar';
        }
        return;
      }

      if (localScraperRequestRunning) {
        return;
      }

      if (!catalogReloadedAfterSharedScraper) {
        catalogReloadedAfterSharedScraper = true;
        await loadProducts();
        setStatus('Scraper finalizado. Catalogo actualizado.', 'ok');
      }

      stopScraperStatusPolling();
      resetScraperButton();
    } catch (error) {
      console.warn(error);
    }
  }, 3000);
}
function extractRunMessage(output) {
  const lines = String(output || '').split(/\r?\n/).filter(Boolean);
  const runLine = lines.find((line) => line.includes('Run ID de esta consulta'));
  const countLine = lines.find((line) => line.includes('PostgreSQL actualizado'));
  const warningLines = lines
    .filter((line) => line.includes('ADVERTENCIA:'))
    .map((line) => line.replace(/^ADVERTENCIA:\s*/, ''));
  const csvLine = lines.find((line) => line.includes('CSV generado'));
  return [runLine, countLine, ...warningLines.slice(0, 3), csvLine].filter(Boolean).join(' | ');
}

function extractErrorMessage(output) {
  const lines = String(output || '').split(/\r?\n/).filter(Boolean);
  const warnings = lines
    .filter((line) => line.includes('ADVERTENCIA:'))
    .map((line) => line.replace(/^ADVERTENCIA:\s*/, ''));
  const knownError = lines.find((line) =>
    line.includes('No se pudo generar informacion de ninguna tienda') ||
    line.includes('PostgreSQL') ||
    line.includes('password') ||
    line.includes('ECONNREFUSED') ||
    line.includes('ENOTFOUND')
  );

  if (warnings.length) {
    return `El scraper termino con advertencias: ${warnings.slice(0, 4).join(' | ')}`;
  }

  return knownError || 'No se pudo ejecutar el scraper. Revisa logs\\catalogo_servidor_error.log para detalle tecnico.';
}


async function waitForScraperJob(jobId) {
  let missingChecks = 0;

  while (true) {
    let job = null;

    try {
      const { response, data } = await fetchJsonWithTimeout(`/api/scraper-job?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' }, 10000);
      if (response.ok && data.ok) {
        job = data.job;
      }
    } catch (error) {
      console.warn(error);
    }

    if (job?.status === 'queued') {
      const position = Number(job.queuePosition || 1);
      setStatus(`Solicitud en cola. Posicion ${position}. Se ejecutara en el orden recibido.`, 'running');
      elements.runScraperButton.textContent = `En cola (${position})...`;
      missingChecks = 0;
    } else if (job?.status === 'running') {
      setStatus(`Ejecutando esta solicitud (${job.id}). Este proceso puede tardar varios minutos.`, 'running');
      elements.runScraperButton.textContent = 'Ejecutando scraper...';
      missingChecks = 0;
    } else if (job?.status === 'done') {
      return job;
    } else if (job?.status === 'error') {
      throw new Error(extractErrorMessage(job.output));
    } else {
      const status = await getScraperStatus().catch(() => null);

      if (status?.lastJob?.id === jobId && status.lastJob.status === 'done') {
        return status.lastJob;
      }

      if (status?.lastJob?.id === jobId && status.lastJob.status === 'error') {
        throw new Error(extractErrorMessage(status.lastJob.output));
      }

      const ownJobStillExists =
        status?.currentJob?.id === jobId ||
        (status?.queuedJobs || []).some((queuedJob) => queuedJob.id === jobId) ||
        (status?.jobsInOrder || []).some((queuedJob) => queuedJob.id === jobId);

      missingChecks += 1;

      if (!ownJobStillExists && missingChecks >= 2) {
        clearStoredScraperJobId();
        return status?.lastJob && status.lastJob.status === 'done'
          ? status.lastJob
          : { id: jobId, status: 'done', output: 'Scraper finalizado. Catalogo actualizado.' };
      }

      setStatus(`Validando estado de la solicitud. Intento ${missingChecks}.`, 'running');

      if (missingChecks >= 40) {
        clearStoredScraperJobId();
        throw new Error('No se pudo confirmar el cierre de esta solicitud. Actualiza la pagina para consultar el ultimo catalogo.');
      }
    }

    await sleep(3000);
  }
}
async function runScraperAndRefresh() {
  elements.runScraperButton.disabled = true;
  elements.runScraperButton.textContent = 'Preparando solicitud...';
  localScraperRequestRunning = true;

  try {
    const { response, data: result } = await fetchJsonWithTimeout('/api/run-scraper', { method: 'POST' }, 15000);

    if (!response.ok || !result.ok || !result.job) {
      throw new Error(extractErrorMessage(result.output || result.error || 'No se pudo iniciar el scraper.'));
    }

    const job = result.job;
    setStoredScraperJobId(job.id);
    if (job.queuePosition > 1) {
      setStatus(`Solicitud en cola. Posicion ${job.queuePosition}. La pagina se actualizara cuando llegue su turno.`, 'running');
      elements.runScraperButton.textContent = 'Solicitud en cola...';
    } else {
      setStatus('Scraper en ejecucion. Este proceso puede tardar varios minutos. La pagina se actualizara cuando termine.', 'running');
      elements.runScraperButton.textContent = 'Ejecutando scraper...';
    }

    startScraperStatusPolling();
    const finishedJob = await waitForScraperJob(job.id);

    await loadProducts();
    setStatus(extractRunMessage(finishedJob.output) || 'Scraper finalizado correctamente. Catalogo actualizado.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, 'error');
  } finally {
    clearStoredScraperJobId();
    stopScraperStatusPolling();
    resetScraperButton();
  }
}
for (const element of [
  elements.searchInput,
  elements.weekFilter,
  elements.storeFilter,
  elements.brandFilter,
  elements.categoryFilter,
  elements.availabilityFilter,
  elements.offersOnly,
  elements.compareFacenco,
]) {
  element.addEventListener('input', applyFilters);
  element.addEventListener('change', applyFilters);
}

elements.clearFilters.addEventListener('click', () => {
  elements.searchInput.value = '';
  elements.weekFilter.value = '';
  elements.storeFilter.value = '';
  elements.brandFilter.value = '';
  elements.categoryFilter.value = '';
  elements.availabilityFilter.value = '';
  elements.offersOnly.checked = false;
  elements.compareFacenco.checked = true;
  applyFilters();
});

function moveToPage(page) {
  state.currentPage = page;
  render();
  scrollProductsToStart();
}

elements.pageSizeSelect.addEventListener('change', () => {
  state.pageSize = Number(elements.pageSizeSelect.value || 100);
  moveToPage(1);
});

elements.prevPageButton.addEventListener('click', () => {
  moveToPage(state.currentPage - 1);
});

elements.nextPageButton.addEventListener('click', () => {
  moveToPage(state.currentPage + 1);
});

async function initializeScraperStatus() {
  try {
    const storedJobId = getStoredScraperJobId();
    const status = await getScraperStatus();
    const message = queueMessage(status);

    if (message) {
      setStatus(storedJobId ? `Retomando solicitud ${storedJobId}. ${message}` : `${message} Puedes enviar otra solicitud si necesitas correrlo de nuevo; quedara en cola.`, 'running');
      if (!storedJobId) {
        elements.runScraperButton.disabled = false;
        elements.runScraperButton.textContent = 'Ejecutar scraper y actualizar';
      }
      startScraperStatusPolling();
      return;
    }

    clearStoredScraperJobId();
    resetScraperButton();
  } catch (error) {
    console.warn(error);
  }
}
elements.runScraperButton.addEventListener('click', runScraperAndRefresh);
loadProducts();
void initializeScraperStatus();












