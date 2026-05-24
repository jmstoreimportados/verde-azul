/* ============================================================
   TEAM MODULE
   ============================================================ */

let teamData = [];

async function loadTeam() {
  const el = document.getElementById('team-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    teamData = await api('GET', '/team') || [];
    renderTeam();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar equipe: ${escapeHtml(err.message)}</div>`;
  }
}

function renderTeam() {
  const el = document.getElementById('team-content');

  const rows = teamData.length > 0 ? teamData.map(e => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-mid);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;flex-shrink:0">
            ${(e.name || 'U').charAt(0).toUpperCase()}
          </div>
          <strong>${escapeHtml(e.name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(e.role || e.function || e.position || '-')}</td>
      <td>${formatPhone(e.phone)}</td>
      <td>${statusBadge(e.status || 'ativo')}</td>
      <td>${e.services_this_month ?? '-'}</td>
      <td>${e.avg_rating ? `<span class="stars">${stars(e.avg_rating)}</span> ${parseFloat(e.avg_rating).toFixed(1)}` : '-'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-outline team-edit" data-id="${e.id}" title="Editar">✏️</button>
          <button class="btn btn-sm btn-ghost team-schedule" data-id="${e.id}" data-name="${escapeHtml(e.name)}" title="Ver agenda">📅</button>
          ${e.phone ? `<button class="btn btn-sm whatsapp-btn team-wa" data-phone="${escapeHtml(e.phone)}" title="WhatsApp">💬</button>` : ''}
        </div>
      </td>
    </tr>`).join('')
  : `<tr><td colspan="7"><div class="empty-state"><span class="empty-state-icon">👷</span><p class="empty-state-title">Nenhum funcionário cadastrado</p></div></td></tr>`;

  el.innerHTML = `
    <div class="section-header">
      <div class="section-title">Equipe (${teamData.length})</div>
      <button class="btn btn-primary" id="new-team-btn">+ Novo Funcionário</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Função</th><th>Telefone</th><th>Status</th>
            <th>Serviços/Mês</th><th>Avaliação</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('new-team-btn').addEventListener('click', () => openTeamForm(null));
  document.querySelectorAll('.team-edit').forEach(btn => btn.addEventListener('click', () => openTeamForm(btn.dataset.id)));
  document.querySelectorAll('.team-wa').forEach(btn => {
    btn.addEventListener('click', () => openWhatsApp(btn.dataset.phone, 'Olá! Mensagem da Verde & Azul Gestão.'));
  });
  document.querySelectorAll('.team-schedule').forEach(btn => {
    btn.addEventListener('click', () => openTeamSchedule(btn.dataset.id, btn.dataset.name));
  });
}

function teamFormHTML(e) {
  e = e || {};
  return `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Nome *</label>
        <input type="text" id="tf-name" value="${escapeHtml(e.name || '')}" placeholder="Nome completo" />
      </div>
      <div class="form-group">
        <label>Função</label>
        <select id="tf-role">
          ${['Jardineiro','Piscineiro','Auxiliar','Supervisor','Motorista','Outros'].map(r =>
            `<option value="${r}" ${(e.role || e.function || e.position) === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>CPF</label>
        <input type="text" id="tf-cpf" value="${escapeHtml(e.cpf || '')}" placeholder="000.000.000-00" />
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="text" id="tf-phone" value="${escapeHtml(e.phone || '')}" placeholder="(00) 00000-0000" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="tf-email" value="${escapeHtml(e.email || '')}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Salário (R$)</label>
        <input type="number" id="tf-salary" value="${e.salary || ''}" min="0" step="0.01" placeholder="0,00" />
      </div>
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="tf-status">
        ${['ativo','inativo','suspenso'].map(s =>
          `<option value="${s}" ${(e.status || 'ativo') === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="tf-notes" rows="2" placeholder="Observações...">${escapeHtml(e.notes || '')}</textarea>
    </div>`;
}

async function openTeamForm(employeeId) {
  let employee = null;
  if (employeeId) {
    employee = teamData.find(e => String(e.id) === String(employeeId));
    if (!employee) {
      try { employee = await api('GET', `/team/${employeeId}`); } catch {}
    }
  }

  openModal(employee ? 'Editar Funcionário' : 'Novo Funcionário', teamFormHTML(employee), `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-team-btn">${employee ? 'Salvar' : 'Cadastrar'}</button>
  `, 'sm');

  document.getElementById('save-team-btn').addEventListener('click', async () => {
    const data = {
      name:   document.getElementById('tf-name').value.trim(),
      role:   document.getElementById('tf-role').value,
      cpf:    document.getElementById('tf-cpf').value.trim(),
      phone:  document.getElementById('tf-phone').value.trim(),
      email:  document.getElementById('tf-email').value.trim(),
      salary: parseFloat(document.getElementById('tf-salary').value) || 0,
      status: document.getElementById('tf-status').value,
      notes:  document.getElementById('tf-notes').value.trim()
    };
    if (!data.name) { toast('Nome é obrigatório', 'warning'); return; }
    try {
      if (employee) {
        await api('PUT', `/team/${employee.id}`, data);
        toast('Funcionário atualizado!', 'success');
      } else {
        await api('POST', '/team', data);
        toast('Funcionário cadastrado!', 'success');
      }
      closeModal();
      loadTeam();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

async function openTeamSchedule(employeeId, employeeName) {
  try {
    const data = await api('GET', `/team/${employeeId}/schedule`) || [];
    const rows = Array.isArray(data) && data.length > 0 ? data.map(s => `
      <tr>
        <td>${formatDate(s.scheduled_date || s.date)}</td>
        <td>${escapeHtml(s.client_name || s.client || '-')}</td>
        <td>${statusBadge(s.type || s.service_type || 'jardinagem')}</td>
        <td>${statusBadge(s.status || 'agendado')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty-state"><span class="empty-state-icon">📅</span><p class="empty-state-title">Sem serviços agendados</p></div></td></tr>`;

    openModal(`Agenda: ${employeeName}`, `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`, `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>`, 'lg');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}
