const get = id => document.getElementById(id);
const form = get('login-form');
const notice = form.querySelector('.caption');
let csrf = '';
function csrfCookie() {
  const entry = document.cookie.split('; ').find(value => value.startsWith('__Host-catalog_csrf='));
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : '';
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Usuario o contraseña incorrectos, o sesión vencida.');
    if (response.status === 429) throw new Error('Demasiados intentos. Intenta nuevamente más tarde.');
    if ([404, 503].includes(response.status)) throw new Error('El servicio de acceso aún no está disponible en este ambiente.');
    throw new Error('No se pudo completar el acceso.');
  }
  return response.status === 204 ? null : response.json();
}
function showCountries(context) {
  if (!['superadmin', 'admin', 'usuario'].includes(context.account_level) || !Array.isArray(context.countries)) throw new Error('Respuesta de permisos inválida.');
  for (const card of document.querySelectorAll('[data-country]')) {
    const permission = context.countries.find(country => country.code === card.dataset.country);
    const allowed = permission?.can_access === true && permission.enabled === true;
    card.querySelector('[data-country-link]').hidden = !allowed;
    const denied = card.querySelector('[data-denied]'); denied.hidden = allowed;
    denied.textContent = permission?.enabled === false ? 'País aún no habilitado' : 'Acceso no asignado';
  }
  get('profile-summary').textContent = `Cuenta: ${context.user_id} · ${context.account_level === 'superadmin' ? 'Superadministrador' : context.account_level === 'admin' ? 'Administrador' : 'Usuario'}`;
  get('manage-users').hidden = context.account_level === 'usuario';
  get('login').hidden = true; get('countries').hidden = false;
  form.reset();
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  notice.textContent = 'Comprobando acceso…';
  try {
    const data = new FormData(form);
    const result = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
    csrf = result.csrf_token; showCountries(await request('/auth/me'));
  } catch (error) { notice.textContent = error.message; }
  finally { form.elements.namedItem('password').value = ''; button.disabled = false; }
});
get('logout').addEventListener('click', async () => {
  const button = get('logout'); button.disabled = true;
  try {
    await request('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf || csrfCookie() } });
    csrf = ''; get('countries').hidden = true; get('login').hidden = false;
    notice.textContent = 'Sesión cerrada.';
  } catch (error) { get('profile-summary').textContent = error.message; }
  finally { button.disabled = false; }
});
request('/auth/me').then(showCountries).catch(error => { notice.textContent = error.message; });
