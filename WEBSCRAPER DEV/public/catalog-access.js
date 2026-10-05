(() => {
  const nativeFetch = window.fetch.bind(window);
  const protectedMode = window.location.protocol === 'https:';
  const country = window.location.pathname === '/catalogo-nicaragua.html' ? 'NC' : 'GT';
  let context = null;
  function canOperate() {
    const permission = context?.countries?.find(item => item.code === country);
    return permission?.enabled === true && permission.can_access === true
      && (['admin', 'superadmin'].includes(context.account_level) || permission.role === 'operador');
  }
  function update(value) {
    context = value;
    if (protectedMode) {
      for (const node of document.querySelectorAll('#run-all, #run-selected, #run-stores, #runScraperButton, #runSelectedStoreButton, .price-upload-panel')) {
        node.hidden = !canOperate();
        // GT tiene reglas display de botones que pueden prevalecer sobre hidden.
        if (node.hidden) node.style?.setProperty('display', 'none', 'important');
        else node.style?.removeProperty('display');
      }
    }
    document.dispatchEvent(new CustomEvent('catalog-session', { detail: context }));
  }
  async function refresh() {
    try {
      const response = await nativeFetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) { update(null); return null; }
      const value = await response.json();
      if (!['usuario', 'admin', 'superadmin'].includes(value?.account_level) || !Array.isArray(value.countries)) {
        throw new Error('Permisos inválidos.');
      }
      update(value); return value;
    } catch { update(null); return null; }
  }
  async function request(path, options = {}) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error('Destino de catálogo no permitido.');
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (protectedMode && !['GET', 'HEAD'].includes(method)) {
      if (!await refresh()) throw new Error('Tu sesión venció. Regresa al acceso para iniciar sesión.');
      if (!canOperate()) throw new Error('Necesitas permiso de operador para realizar esta acción.');
      const cookie = document.cookie.split('; ').find(item => item.startsWith('__Host-catalog_csrf='));
      const csrf = cookie ? decodeURIComponent(cookie.slice('__Host-catalog_csrf='.length)) : '';
      if (!csrf) throw new Error('No se pudo verificar la sesión. Inicia sesión nuevamente.');
      headers.set('X-CSRF-Token', csrf);
    }
    const response = await nativeFetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    if (protectedMode && response.status === 401) {
      update(null);
      throw new Error('Tu sesión venció. Regresa al acceso para iniciar sesión.');
    }
    if (protectedMode && response.status === 403) {
      await refresh();
      throw new Error('No tienes permiso para esta acción o la sesión debe renovarse.');
    }
    return response;
  }
  window.catalogAccess = { request, refresh, canOperate };
  if (protectedMode) {
    update(null); void refresh();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  }
})();
