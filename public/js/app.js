/* ============================================================
   VERDE & AZUL GESTÃO — Core App (app.js)
   ============================================================ */

const API = '/api';
let authToken = localStorage.getItem('va_token');
let currentUser = null;

/* ----------------------------------------------------------
   API HELPER
   ---------------------------------------------------------- */
async function api(method, path, data = null, isFormData = false) {
  const opts = {
    method,
    headers: {}
  };

  if (authToken) {
    opts.headers['Authorization'] = 'Bearer ' + authToken;
  }

  if (data) {
    if (isFormData) {
      opts.body = data;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
  }

  try {
    const res = await fetch(API + path, opts);
    let json;
    try { json = await res.json(); } catch(e) { json = {}; }

    if (res.status === 401) {
      logout();
      return null;
    }

    if (!res.ok) {
      throw new Error(json.error || json.message || `Erro ${res.status}`);
    }

    return json;
  } catch (err) {
    if (err.name !== 'TypeError') throw err;
    throw new Error('Não foi possível conectar ao servidor.');
  }
}

/* ----------------------------------------------------------
   ROUTER / NAVIGATION
   ---------------------------------------------------------- */
const sectionTitles = {
  dashboard:  'Dashboard',
  clients:    'Clientes',
  agenda:     'Agenda',
  financial:  'Financeiro',
  products:   'Produtos',
  team:       'Equipe',
  budgets:    'Orçamentos',
  reports:    'Relatórios',
  settings:   'Configurações'
};

let currentSection = 'dashboard';

function navigate(section) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target
  const el = document.getElementById('section-' + section);
  if (!el) return;
  el.classList.add('active');

  // Active nav item
  const navEl = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navEl) navEl.classList.add('active');

  // Page title
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = sectionTitles[section] || section;

  currentSection = section;

  // Close mobile sidebar
  closeSidebar();

  // Load module
  switch (section) {
    case 'dashboard':  if (typeof loadDashboard  === 'function') loadDashboard();  break;
    case 'clients':    if (typeof loadClients    === 'function') loadClients();    break;
    case 'agenda':     if (typeof loadAgenda     === 'function') loadAgenda();     break;
    case 'financial':  if (typeof loadFinancial  === 'function') loadFinancial();  break;
    case 'products':   if (typeof loadProducts   === 'function') loadProducts();   break;
    case 'team':       if (typeof loadTeam       === 'function') loadTeam();       break;
    case 'budgets':    if (typeof loadBudgets    === 'function') loadBudgets();    break;
    case 'reports':    if (typeof loadReports    === 'function') loadReports();    break;
    case 'settings':   if (typeof loadSettings   === 'function') loadSettings();   break;
  }
}

/* ----------------------------------------------------------
   SIDEBAR MOBILE
   ---------------------------------------------------------- */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

/* ----------------------------------------------------------
   AUTH
   ---------------------------------------------------------- */
async function login(username, password) {
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  btn.textContent = 'Entrando...';
  btn.disabled = true;
  errEl.style.display = 'none';

  try {
    const data = await api('POST', '/auth/login', { email: username, password });
    authToken = data.token;
    localStorage.setItem('va_token', authToken);
    currentUser = data.user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message || 'Usuário ou senha inválidos.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('va_token');
  showLogin();
}

async function checkAuth() {
  if (!authToken) { showLogin(); return; }
  try {
    const data = await api('GET', '/auth/me');
    if (!data) { showLogin(); return; }
    currentUser = data;
    showApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  updateUserUI();
  applyPermissions();
  navigate('dashboard');
}

function updateUserUI() {
  if (!currentUser) return;
  const name = currentUser.name || currentUser.username || 'Usuário';
  const role = currentUser.role || '-';
  const avatar = name.charAt(0).toUpperCase();

  const el = id => document.getElementById(id);
  if (el('user-name'))   el('user-name').textContent   = name;
  if (el('user-role'))   el('user-role').textContent   = role;
  if (el('user-avatar')) el('user-avatar').textContent = avatar;
  if (el('topbar-user')) el('topbar-user').textContent = name;
}

function applyPermissions() {
  // Admin sees everything; for other roles hide based on permissions
  if (!currentUser) return;
  const perms = currentUser.permissions || [];
  const isAdmin = currentUser.role === 'admin' || currentUser.is_admin;

  document.querySelectorAll('.nav-item[data-perm]').forEach(el => {
    const perm = el.dataset.perm;
    if (!isAdmin && perms.length && !perms.includes(perm)) {
      el.style.display = 'none';
    }
  });
}

/* ----------------------------------------------------------
   MODAL SYSTEM
   ---------------------------------------------------------- */
function openModal(title, content, footerContent = '', size = '') {
  const overlay = document.getElementById('modal-overlay');
  const modal   = document.getElementById('modal');
  document.getElementById('modal-title').textContent  = title;
  document.getElementById('modal-body').innerHTML     = content;
  document.getElementById('modal-footer').innerHTML   = footerContent;

  modal.className = 'modal' + (size ? ' modal-' + size : '');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

/* ----------------------------------------------------------
   TOAST SYSTEM
   ---------------------------------------------------------- */
function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(t);

  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(30px)';
    t.style.transition = '0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

/* ----------------------------------------------------------
   FORMAT HELPERS
   ---------------------------------------------------------- */
function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(str) {
  if (!str) return '-';
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(str) {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleString('pt-BR');
}

function formatPhone(phone) {
  if (!phone) return '-';
  const p = String(phone).replace(/\D/g, '');
  if (p.length === 11) return `(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0,2)}) ${p.slice(2,6)}-${p.slice(6)}`;
  return phone;
}

function openWhatsApp(phone, message) {
  const p = String(phone).replace(/\D/g, '');
  const url = `https://wa.me/55${p}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function stars(rating) {
  if (!rating) return '-';
  const n = Math.round(parseFloat(rating));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  const map = {
    ativo:      ['ativo',      'Ativo'],
    inativo:    ['inativo',    'Inativo'],
    suspenso:   ['suspenso',   'Suspenso'],
    pendente:   ['pendente',   'Pendente'],
    pago:       ['pago',       'Pago'],
    vencido:    ['vencido',    'Vencido'],
    agendado:   ['agendado',   'Agendado'],
    concluido:  ['concluido',  'Concluído'],
    cancelado:  ['cancelado',  'Cancelado'],
    draft:      ['warning',    'Rascunho'],
    sent:       ['warning',    'Enviado'],
    approved:   ['success',    'Aprovado'],
    rejected:   ['danger',     'Recusado'],
    converted:  ['info',       'Convertido'],
    piscina:    ['piscina',    'Piscina'],
    jardinagem: ['jardinagem', 'Jardinagem'],
  };
  const [cls, label] = map[status] || ['warning', status];
  return `<span class="badge badge-${cls}">${label}</span>`;
}

/* ----------------------------------------------------------
   COPY TO CLIPBOARD
   ---------------------------------------------------------- */
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
    toast('Copiado para a área de transferência', 'success');
  }).catch(() => toast('Não foi possível copiar', 'error'));
}

/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if (!u || !p) { toast('Preencha usuário e senha', 'warning'); return; }
    login(u, p);
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Deseja realmente sair?')) logout();
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.section);
    });
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Sidebar mobile
  document.getElementById('menu-toggle').addEventListener('click', openSidebar);
  document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  // Check auth
  checkAuth();
});
