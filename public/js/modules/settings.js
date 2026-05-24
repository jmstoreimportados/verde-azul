/* ============================================================
   SETTINGS MODULE
   ============================================================ */

let settingsTab = 'company';
let settingsData = {};
let usersData = [];
let rolesData = {};

async function loadSettings() {
  const el = document.getElementById('settings-content');
  el.innerHTML = `
    <div class="section-header"><div class="section-title">Configurações</div></div>
    <div class="tabs">
      <button class="tab-btn ${settingsTab === 'company'   ? 'active' : ''}" data-tab="company">🏢 Empresa</button>
      <button class="tab-btn ${settingsTab === 'pix'       ? 'active' : ''}" data-tab="pix">🏦 PIX</button>
      <button class="tab-btn ${settingsTab === 'whatsapp'  ? 'active' : ''}" data-tab="whatsapp">💬 WhatsApp</button>
      <button class="tab-btn ${settingsTab === 'checklist' ? 'active' : ''}" data-tab="checklist">✅ Checklist</button>
      <button class="tab-btn ${settingsTab === 'users'     ? 'active' : ''}" data-tab="users">👤 Usuários</button>
      <button class="tab-btn ${settingsTab === 'perms'     ? 'active' : ''}" data-tab="perms">🔒 Permissões</button>
      <button class="tab-btn ${settingsTab === 'backup'    ? 'active' : ''}" data-tab="backup">💾 Backup</button>
    </div>
    <div id="settings-tab-content"><div class="loading-spinner"><div class="spinner"></div></div></div>`;

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settingsTab = btn.dataset.tab;
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadSettingsTab();
    });
  });

  // Load settings data once
  try {
    settingsData = await api('GET', '/settings') || {};
  } catch { settingsData = {}; }

  loadSettingsTab();
}

async function loadSettingsTab() {
  switch (settingsTab) {
    case 'company':   renderCompanySettings();   break;
    case 'pix':       renderPixSettings();       break;
    case 'whatsapp':  renderWhatsAppSettings();  break;
    case 'checklist': renderChecklistSettings(); break;
    case 'users':     await loadUsersTab();      break;
    case 'perms':     await loadPermissionsTab();break;
    case 'backup':    renderBackupTab();         break;
  }
}

/* ----- COMPANY ----- */
function renderCompanySettings() {
  const s = settingsData.company || settingsData || {};
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Dados da Empresa</div>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Nome da Empresa</label>
          <input type="text" id="co-name" value="${escapeHtml(s.company_name || s.name || 'Verde & Azul Gestão')}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Telefone</label>
          <input type="text" id="co-phone" value="${escapeHtml(s.company_phone || s.phone || '')}" placeholder="(00) 00000-0000" />
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input type="email" id="co-email" value="${escapeHtml(s.company_email || s.email || '')}" placeholder="contato@verdeazul.com" />
        </div>
      </div>
      <div class="form-group">
        <label>Endereço</label>
        <input type="text" id="co-address" value="${escapeHtml(s.company_address || s.address || '')}" placeholder="Endereço completo" />
      </div>
      <div class="form-group">
        <label>CNPJ</label>
        <input type="text" id="co-cnpj" value="${escapeHtml(s.cnpj || '')}" placeholder="00.000.000/0001-00" />
      </div>
      <div style="text-align:right;margin-top:0.5rem;">
        <button class="btn btn-primary" id="save-company-btn">Salvar</button>
      </div>
    </div>`;

  document.getElementById('save-company-btn').addEventListener('click', async () => {
    const data = {
      company_name:    document.getElementById('co-name').value.trim(),
      company_phone:   document.getElementById('co-phone').value.trim(),
      company_email:   document.getElementById('co-email').value.trim(),
      company_address: document.getElementById('co-address').value.trim(),
      cnpj:            document.getElementById('co-cnpj').value.trim()
    };
    try {
      await api('PUT', '/settings', { company: data });
      Object.assign(settingsData, data);
      toast('Dados da empresa salvos!', 'success');
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- PIX ----- */
function renderPixSettings() {
  const s = settingsData.pix || {};
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Configuração PIX</div>
      <div class="form-group">
        <label>Tipo de Chave</label>
        <select id="pix-type">
          ${['CPF','CNPJ','E-mail','Telefone','Chave Aleatória'].map(t =>
            `<option value="${t}" ${s.key_type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Chave PIX</label>
        <input type="text" id="pix-key" value="${escapeHtml(s.key || '')}" placeholder="Sua chave PIX" />
      </div>
      <div class="form-group">
        <label>Nome do Beneficiário</label>
        <input type="text" id="pix-holder" value="${escapeHtml(s.holder_name || '')}" placeholder="Nome conforme cadastro bancário" />
      </div>
      <div class="form-group">
        <label>Cidade</label>
        <input type="text" id="pix-city" value="${escapeHtml(s.city || '')}" placeholder="Cidade" />
      </div>
      <div style="text-align:right;margin-top:0.5rem;">
        <button class="btn btn-primary" id="save-pix-btn">Salvar PIX</button>
      </div>
    </div>`;

  document.getElementById('save-pix-btn').addEventListener('click', async () => {
    const data = {
      key_type:    document.getElementById('pix-type').value,
      key:         document.getElementById('pix-key').value.trim(),
      holder_name: document.getElementById('pix-holder').value.trim(),
      city:        document.getElementById('pix-city').value.trim()
    };
    try {
      await api('PUT', '/settings', { pix: data });
      settingsData.pix = data;
      toast('Configuração PIX salva!', 'success');
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- WHATSAPP TEMPLATES ----- */
function renderWhatsAppSettings() {
  const t = settingsData.whatsapp_templates || {};
  const el = document.getElementById('settings-tab-content');

  const templates = [
    { key: 'arrival',   label: 'Notificação de Chegada',  hint: 'Variáveis: {client_name}, {employee_name}', default: 'Olá {client_name}! {employee_name} está a caminho para realizar o serviço. Chegada prevista em breve!' },
    { key: 'charge',    label: 'Cobrança Mensal',          hint: 'Variáveis: {client_name}, {amount}, {due_date}, {pix_key}', default: 'Olá {client_name}! Sua mensalidade de R$ {amount} vence em {due_date}. PIX: {pix_key}. Obrigado!' },
    { key: 'budget',    label: 'Envio de Orçamento',       hint: 'Variáveis: {client_name}, {total}, {validity}', default: 'Olá {client_name}! Segue o orçamento de R$ {total} com validade de {validity} dias. Entre em contato para fecharmos!' },
    { key: 'overdue',   label: 'Cobrança de Inadimplência', hint: 'Variáveis: {client_name}, {amount}, {days_overdue}', default: 'Olá {client_name}! Identificamos uma pendência de R$ {amount} ({days_overdue} dias em atraso). Por favor, regularize para evitar suspensão.' },
    { key: 'completed', label: 'Serviço Concluído',         hint: 'Variáveis: {client_name}, {service_type}', default: 'Olá {client_name}! O serviço de {service_type} foi concluído com sucesso hoje. Qualquer dúvida, estamos à disposição!' },
  ];

  el.innerHTML = `<div class="card">
    <div class="card-title">Templates de Mensagens WhatsApp</div>
    ${templates.map(tmpl => `
      <div class="form-group">
        <label>${tmpl.label}</label>
        <small class="text-muted" style="display:block;margin-bottom:0.3rem">${tmpl.hint}</small>
        <textarea id="wa-${tmpl.key}" rows="3">${escapeHtml(t[tmpl.key] || tmpl.default)}</textarea>
      </div>`).join('')}
    <div style="text-align:right;">
      <button class="btn btn-primary" id="save-wa-btn">Salvar Templates</button>
    </div>
  </div>`;

  document.getElementById('save-wa-btn').addEventListener('click', async () => {
    const data = {};
    templates.forEach(tmpl => {
      data[tmpl.key] = document.getElementById(`wa-${tmpl.key}`).value;
    });
    try {
      await api('PUT', '/settings', { whatsapp_templates: data });
      settingsData.whatsapp_templates = data;
      toast('Templates salvos!', 'success');
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- CHECKLIST ----- */
function renderChecklistSettings() {
  const cl = settingsData.checklists || {};
  const poolItems   = cl.pool   || ['Limpeza das bordas','Aspiração do fundo','Limpeza do skimmer','Adição de produtos','Teste de pH','Teste de cloro'];
  const gardenItems = cl.garden || ['Corte da grama','Podagem de arbustos','Limpeza de folhas','Adubação','Irrigação'];

  const el = document.getElementById('settings-tab-content');
  el.innerHTML = `
    <div class="card mb-2">
      <div class="card-title">Checklist — Piscina</div>
      <div id="pool-checklist">${renderChecklistItems(poolItems, 'pool')}</div>
      <button class="btn btn-ghost btn-sm mt-1" onclick="addChecklistItem('pool')">+ Adicionar Item</button>
    </div>
    <div class="card mb-2">
      <div class="card-title">Checklist — Jardinagem</div>
      <div id="garden-checklist">${renderChecklistItems(gardenItems, 'garden')}</div>
      <button class="btn btn-ghost btn-sm mt-1" onclick="addChecklistItem('garden')">+ Adicionar Item</button>
    </div>
    <div class="card mb-2">
      <div class="card-title">Parâmetros de Qualidade da Água</div>
      ${renderWaterQualityParams(settingsData.water_quality || {})}
    </div>
    <div style="text-align:right;">
      <button class="btn btn-primary" id="save-checklist-btn">Salvar Configurações</button>
    </div>`;

  document.getElementById('save-checklist-btn').addEventListener('click', saveChecklistSettings);
}

function renderChecklistItems(items, prefix) {
  return items.map((item, i) => `
    <div class="form-row cl-item-${prefix}" style="align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
      <input type="text" class="cl-input" value="${escapeHtml(item)}" style="flex:1;padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;" />
      <button class="btn btn-sm btn-danger" onclick="this.closest('.cl-item-${prefix}').remove()">✕</button>
    </div>`).join('');
}

function addChecklistItem(prefix) {
  const container = document.getElementById(`${prefix}-checklist`);
  const div = document.createElement('div');
  div.className = `form-row cl-item-${prefix}`;
  div.style.cssText = 'align-items:center;gap:0.5rem;margin-bottom:0.35rem;';
  div.innerHTML = `
    <input type="text" class="cl-input" placeholder="Novo item..." style="flex:1;padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;" />
    <button class="btn btn-sm btn-danger" onclick="this.closest('.cl-item-${prefix}').remove()">✕</button>`;
  container.appendChild(div);
}

function renderWaterQualityParams(wq) {
  const params = [
    { key: 'ph_min',        label: 'pH Mínimo',          default: 7.0 },
    { key: 'ph_max',        label: 'pH Máximo',          default: 7.4 },
    { key: 'chloro_min',    label: 'Cloro Mín. (mg/L)',  default: 1.0 },
    { key: 'chloro_max',    label: 'Cloro Máx. (mg/L)',  default: 3.0 },
    { key: 'alk_min',       label: 'Alcalinidade Mín.',  default: 80 },
    { key: 'alk_max',       label: 'Alcalinidade Máx.',  default: 120 },
    { key: 'turbidity_max', label: 'Turbidez Máx.',      default: 5 },
  ];
  return `<div class="form-row">
    ${params.map(p => `
      <div class="form-group">
        <label>${p.label}</label>
        <input type="number" id="wq-${p.key}" value="${wq[p.key] ?? p.default}" step="0.1" />
      </div>`).join('')}
  </div>`;
}

async function saveChecklistSettings() {
  const pool   = Array.from(document.querySelectorAll('.cl-item-pool .cl-input')).map(i => i.value.trim()).filter(Boolean);
  const garden = Array.from(document.querySelectorAll('.cl-item-garden .cl-input')).map(i => i.value.trim()).filter(Boolean);

  const wqKeys = ['ph_min','ph_max','chloro_min','chloro_max','alk_min','alk_max','turbidity_max'];
  const water_quality = {};
  wqKeys.forEach(k => {
    const el = document.getElementById(`wq-${k}`);
    if (el) water_quality[k] = parseFloat(el.value) || 0;
  });

  try {
    await api('PUT', '/settings', { checklists: { pool, garden }, water_quality });
    settingsData.checklists   = { pool, garden };
    settingsData.water_quality = water_quality;
    toast('Configurações de checklist salvas!', 'success');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

/* ----- USERS ----- */
async function loadUsersTab() {
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    usersData = await api('GET', '/auth/users') || [];
    renderUsersTab();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

function renderUsersTab() {
  const el = document.getElementById('settings-tab-content');

  const rows = usersData.length > 0 ? usersData.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.name || u.username)}</strong></td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${escapeHtml(u.role || '-')}</td>
      <td>${statusBadge(u.is_active !== false ? 'ativo' : 'inativo')}</td>
      <td>
        <button class="btn btn-sm btn-outline user-edit" data-id="${u.id}" title="Editar">✏️</button>
      </td>
    </tr>`).join('')
  : '<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">👤</span><p class="empty-state-title">Nenhum usuário</p></div></td></tr>';

  el.innerHTML = `
    <div class="section-header mb-2">
      <div style="font-weight:700;color:var(--primary)">Usuários do Sistema</div>
      <button class="btn btn-primary" id="new-user-btn">+ Novo Usuário</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Nome</th><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('new-user-btn').addEventListener('click', () => openUserForm(null));
  document.querySelectorAll('.user-edit').forEach(btn => btn.addEventListener('click', () => openUserForm(btn.dataset.id)));
}

async function openUserForm(userId) {
  const user = userId ? usersData.find(u => String(u.id) === String(userId)) : null;

  const content = `
    <div class="form-row">
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="uf-name" value="${escapeHtml(user?.name || '')}" placeholder="Nome completo" />
      </div>
      <div class="form-group">
        <label>Usuário *</label>
        <input type="text" id="uf-username" value="${escapeHtml(user?.username || '')}" placeholder="login" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="uf-email" value="${escapeHtml(user?.email || '')}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Senha ${user ? '(deixe vazio para não alterar)' : '*'}</label>
        <input type="password" id="uf-password" placeholder="••••••••" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Perfil</label>
        <select id="uf-role">
          ${['admin','manager','employee','viewer'].map(r =>
            `<option value="${r}" ${user?.role === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="uf-active">
          <option value="1" ${user?.is_active !== false ? 'selected' : ''}>Ativo</option>
          <option value="0" ${user?.is_active === false ? 'selected' : ''}>Inativo</option>
        </select>
      </div>
    </div>`;

  openModal(user ? 'Editar Usuário' : 'Novo Usuário', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-user-btn">${user ? 'Salvar' : 'Criar'}</button>
  `, 'sm');

  document.getElementById('save-user-btn').addEventListener('click', async () => {
    const data = {
      name:      document.getElementById('uf-name').value.trim(),
      username:  document.getElementById('uf-username').value.trim(),
      email:     document.getElementById('uf-email').value.trim(),
      password:  document.getElementById('uf-password').value,
      role:      document.getElementById('uf-role').value,
      is_active: document.getElementById('uf-active').value === '1'
    };
    if (!data.name)     { toast('Nome é obrigatório', 'warning'); return; }
    if (!data.username) { toast('Usuário é obrigatório', 'warning'); return; }
    if (!user && !data.password) { toast('Senha é obrigatória para novos usuários', 'warning'); return; }
    if (!data.password) delete data.password;

    try {
      if (user) {
        await api('PUT', `/auth/users/${user.id}`, data);
        toast('Usuário atualizado!', 'success');
      } else {
        await api('POST', '/auth/users', data);
        toast('Usuário criado!', 'success');
      }
      closeModal();
      loadUsersTab();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- PERMISSIONS ----- */
async function loadPermissionsTab() {
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const roles = ['admin','manager','employee','viewer'];
    const modules = [
      { key: 'clients',   label: 'Clientes' },
      { key: 'agenda',    label: 'Agenda' },
      { key: 'financial', label: 'Financeiro' },
      { key: 'products',  label: 'Produtos' },
      { key: 'team',      label: 'Equipe' },
      { key: 'budgets',   label: 'Orçamentos' },
      { key: 'reports',   label: 'Relatórios' },
      { key: 'settings',  label: 'Configurações' },
    ];

    // Try to load role permissions
    let rolePerms = {};
    try {
      for (const role of roles) {
        const res = await api('GET', `/auth/roles/${role}`);
        if (res) rolePerms[role] = res.permissions || [];
      }
    } catch { }

    const defaultPerms = {
      admin:    modules.map(m => m.key),
      manager:  ['clients','agenda','financial','products','team','budgets','reports'],
      employee: ['agenda','clients'],
      viewer:   ['reports','dashboard']
    };

    const headerCells = roles.map(r => `<th style="text-align:center">${r.charAt(0).toUpperCase() + r.slice(1)}</th>`).join('');
    const bodyRows = modules.map(mod => {
      const cells = roles.map(role => {
        const perms = rolePerms[role] || defaultPerms[role] || [];
        const checked = perms.includes(mod.key) ? 'checked' : '';
        return `<td style="text-align:center"><input type="checkbox" class="perm-check" data-role="${role}" data-module="${mod.key}" ${checked} ${role === 'admin' ? 'disabled checked' : ''} /></td>`;
      }).join('');
      return `<tr><td><strong>${mod.label}</strong></td>${cells}</tr>`;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <div class="card-title">Matriz de Permissões por Perfil</div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Módulo</th>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div style="text-align:right;margin-top:1rem;">
          <button class="btn btn-primary" id="save-perms-btn">Salvar Permissões</button>
        </div>
      </div>`;

    document.getElementById('save-perms-btn').addEventListener('click', async () => {
      const updates = {};
      document.querySelectorAll('.perm-check:not([disabled])').forEach(cb => {
        const role = cb.dataset.role;
        const mod  = cb.dataset.module;
        if (!updates[role]) updates[role] = [];
        if (cb.checked) updates[role].push(mod);
      });
      updates['admin'] = modules.map(m => m.key);

      try {
        for (const [role, perms] of Object.entries(updates)) {
          await api('PUT', `/auth/roles/${role}`, { permissions: perms });
        }
        toast('Permissões salvas!', 'success');
      } catch (err) { toast('Erro: ' + err.message, 'error'); }
    });
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

/* ----- BACKUP ----- */
function renderBackupTab() {
  const el = document.getElementById('settings-tab-content');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Backup dos Dados</div>
      <p class="text-muted mb-2">Baixe um backup completo dos dados do sistema em formato JSON.</p>
      <div class="alert alert-info">
        ℹ️ O backup inclui: clientes, serviços, cobranças, produtos, equipe e configurações.
      </div>
      <div style="text-align:center;padding:2rem 0;">
        <button class="btn btn-primary" id="download-backup-btn" style="padding:0.85rem 2rem;font-size:1rem;">
          💾 Baixar Backup (JSON)
        </button>
      </div>
      <p class="text-muted" style="text-align:center;font-size:0.82rem;">
        Último backup: ${settingsData.last_backup ? formatDateTime(settingsData.last_backup) : 'Nunca'}
      </p>
    </div>`;

  document.getElementById('download-backup-btn').addEventListener('click', async () => {
    try {
      const data = await api('GET', '/settings/backup');
      const blob  = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `verde-azul-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup baixado com sucesso!', 'success');
    } catch (err) { toast('Erro ao gerar backup: ' + err.message, 'error'); }
  });
}
