const menu = document.createElement('nav');
menu.className = 'catalog-menu'; menu.setAttribute('aria-label', 'Menú principal');
const button = document.createElement('button');
button.type = 'button'; button.className = 'menu-toggle'; button.textContent = '☰';
button.setAttribute('aria-label', 'Abrir menú'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'catalog-menu-panel');
const panel = document.createElement('div'); panel.id = 'catalog-menu-panel'; panel.className = 'menu-panel'; panel.hidden = true;
function link(text, href) { const item = document.createElement('a'); item.textContent = text; item.href = href; return item; }
panel.append(link('Selección de países', '/'));
const manage = link('Administrar usuarios', '/admin-usuarios.html'); manage.hidden = true; panel.append(manage);
const identity = document.createElement('p'); identity.className = 'menu-identity'; panel.append(identity);
function close() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
button.addEventListener('click', () => { panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden)); });
document.addEventListener('click', event => { if (!menu.contains(event.target)) close(); });
menu.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
menu.append(button, panel); document.querySelector('header')?.append(menu);
export function updateMenu(context) {
  manage.hidden = !['admin', 'superadmin'].includes(context?.account_level);
  identity.textContent = context?.account_level === 'superadmin' ? 'Superadministrador' : context?.account_level === 'admin' ? 'Administrador' : context?.account_level === 'usuario' ? 'Usuario' : '';
}
document.addEventListener('catalog-session', event => updateMenu(event.detail));
async function refreshSession() {
  try {
    const response = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    updateMenu(response.ok ? await response.json() : null);
  } catch { updateMenu(null); }
}
refreshSession();
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSession(); });
