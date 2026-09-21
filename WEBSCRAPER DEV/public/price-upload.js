(() => {
  const details = document.querySelector('#priceUploadDetails');
  document.querySelector('#closePrices').addEventListener('click', () => {
    details.open = false;
    details.querySelector('summary').focus();
  });
  const fileInput = document.querySelector('#priceFile');
  const validate = document.querySelector('#validatePrices');
  const confirm = document.querySelector('#confirmPrices');
  const status = document.querySelector('#priceUploadStatus');
  let checkedFile = null;
  fileInput.addEventListener('change', () => {
    checkedFile = null;
    confirm.hidden = true;
    status.textContent = '';
  });
  async function upload(save) {
    const file = fileInput.files[0];
    if (!file || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      status.textContent = 'Selecciona un archivo .xlsx de hasta 5 MB.';
      return;
    }
    if (save && checkedFile !== file) return;
    validate.disabled = confirm.disabled = fileInput.disabled = true;
    confirm.hidden = true;
    status.textContent = save ? 'Guardando precios…' : 'Revisando archivo…';
    try {
      const response = await fetch(`/api/facenco-prices?confirm=${save}`, {
        method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo procesar el archivo.');
      const byCountry = Object.entries(result.countries || {}).map(([country, count]) => `${country}: ${count}`).join(', ');
      if (save) {
        status.textContent = `${result.count} productos guardados (${byCountry}). Respaldo: ${result.backup || 'primer archivo'}. El catálogo actual muestra solo GT/GTQ.`;
        checkedFile = null;
        fileInput.value = '';
        if (typeof loadProducts === 'function') await loadProducts();
        else status.textContent += ' Recarga el catálogo para ver los precios.';
      } else {
        checkedFile = file;
        status.textContent = `${result.count} productos válidos (${byCountry}). Muestra:\n` + result.preview.map(row => `${row.pais} / ${row.moneda} — ${row.producto}: regular ${row.precio_regular || '-'}, oferta ${row.precio_oferta || '-'}`).join('\n') + '\nConfirma para reemplazar el archivo completo, incluidos los países no presentes en esta carga. El catálogo actual muestra solo GT/GTQ.';
        confirm.hidden = false;
      }
    } catch (error) {
      checkedFile = null;
      status.textContent = error.message || 'No se pudo contactar al servidor. Revisa el catálogo antes de reintentar.';
    } finally { validate.disabled = confirm.disabled = fileInput.disabled = false; }
  }
  validate.addEventListener('click', () => upload(false));
  confirm.addEventListener('click', () => upload(true));
})();
