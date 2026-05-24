/* ============================================================
   AGENDA MODULE
   ============================================================ */

let agendaDate = new Date();
let agendaView = 'month';  // 'month' | 'day'
let agendaSelectedDay = null;
let agendaServices = [];
let agendaEmployeeFilter = '';
let agendaTeam = [];

async function loadAgenda() {
  const el = document.getElementById('agenda-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    agendaTeam = await api('GET', '/team') || [];
    await fetchAgendaServices();
    renderAgenda();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar agenda: ${escapeHtml(err.message)}</div>`;
  }
}

async function fetchAgendaServices() {
  const y = agendaDate.getFullYear();
  const m = String(agendaDate.getMonth() + 1).padStart(2, '0');
  try {
    const res = await api('GET', `/services?year=${y}&month=${m}${agendaEmployeeFilter ? '&employee_id=' + agendaEmployeeFilter : ''}`);
    agendaServices = Array.isArray(res) ? res : (res && res.services ? res.services : []);
  } catch { agendaServices = []; }
}

function renderAgenda() {
  const el = document.getElementById('agenda-content');
  const monthName = agendaDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const teamOptions = agendaTeam.map(e =>
    `<option value="${e.id}" ${String(agendaEmployeeFilter) === String(e.id) ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
  ).join('');

  el.innerHTML = `
    <div class="section-header">
      <div class="section-title">Agenda</div>
      <div class="d-flex gap-1 align-center" style="flex-wrap:wrap">
        <select class="filter-select" id="agenda-employee-filter">
          <option value="">Todos os funcionários</option>
          ${teamOptions}
        </select>
        <button class="btn btn-sm ${agendaView === 'month' ? 'btn-primary' : 'btn-ghost'}" id="view-month">📅 Mês</button>
        <button class="btn btn-sm ${agendaView === 'day' ? 'btn-primary' : 'btn-ghost'}" id="view-day">📋 Dia</button>
        <button class="btn btn-primary" id="new-service-btn">+ Novo Serviço</button>
      </div>
    </div>

    <div class="card">
      <div class="calendar-nav">
        <button class="btn btn-ghost btn-sm" id="agenda-prev">◀ Anterior</button>
        <div class="calendar-title">${monthName}</div>
        <button class="btn btn-ghost btn-sm" id="agenda-next">Próximo ▶</button>
      </div>
      <div id="agenda-body"></div>
    </div>

    <div id="agenda-day-list" class="mt-2"></div>`;

  document.getElementById('agenda-prev').addEventListener('click', () => {
    agendaDate.setMonth(agendaDate.getMonth() - 1);
    fetchAgendaServices().then(renderAgenda);
  });
  document.getElementById('agenda-next').addEventListener('click', () => {
    agendaDate.setMonth(agendaDate.getMonth() + 1);
    fetchAgendaServices().then(renderAgenda);
  });
  document.getElementById('view-month').addEventListener('click', () => { agendaView = 'month'; renderAgendaBody(); });
  document.getElementById('view-day').addEventListener('click', () => { agendaView = 'day'; renderAgendaBody(); });
  document.getElementById('agenda-employee-filter').addEventListener('change', e => {
    agendaEmployeeFilter = e.target.value;
    fetchAgendaServices().then(renderAgendaBody);
  });
  document.getElementById('new-service-btn').addEventListener('click', () => openNewServiceModal());

  renderAgendaBody();
}

function renderAgendaBody() {
  document.getElementById('view-month').className = `btn btn-sm ${agendaView === 'month' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('view-day').className   = `btn btn-sm ${agendaView === 'day'   ? 'btn-primary' : 'btn-ghost'}`;

  if (agendaView === 'month') renderCalendar();
  else renderDayList(agendaSelectedDay || new Date().toISOString().slice(0,10));
}

function renderCalendar() {
  const body = document.getElementById('agenda-body');
  const y = agendaDate.getFullYear();
  const m = agendaDate.getMonth();

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const dows = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  let html = `<div class="calendar-grid">`;
  dows.forEach(d => { html += `<div class="calendar-dow">${d}</div>`; });

  // Blanks
  for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day other-month"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayServices = agendaServices.filter(s => (s.scheduled_date || s.date || '').startsWith(dateStr));
    const isToday    = dateStr === today;
    const isSelected = dateStr === agendaSelectedDay;

    const dots = dayServices.slice(0, 5).map(s => {
      const color = (s.type || s.service_type) === 'piscina' ? 'var(--accent)' : 'var(--primary-pale)';
      return `<span class="calendar-dot" style="background:${color}"></span>`;
    }).join('');

    html += `<div class="calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${dateStr}">
      <span class="calendar-day-num">${d}</span>
      <div>${dots}</div>
    </div>`;
  }

  html += `</div>`;
  body.innerHTML = html;

  body.querySelectorAll('.calendar-day[data-date]').forEach(day => {
    day.addEventListener('click', () => {
      agendaSelectedDay = day.dataset.date;
      body.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
      day.classList.add('selected');
      renderDayList(agendaSelectedDay);
    });
  });

  if (agendaSelectedDay) {
    renderDayList(agendaSelectedDay);
  } else {
    document.getElementById('agenda-day-list').innerHTML = '';
  }
}

function renderDayList(dateStr) {
  const el = document.getElementById('agenda-day-list');
  agendaSelectedDay = dateStr;

  const dayServices = agendaServices.filter(s => (s.scheduled_date || s.date || '').startsWith(dateStr));
  const title = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });

  if (dayServices.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state">
      <span class="empty-state-icon">📅</span>
      <p class="empty-state-title">Nenhum serviço em ${title}</p>
      <p class="empty-state-sub">Clique em "+ Novo Serviço" para adicionar</p>
    </div></div>`;
    return;
  }

  const cards = dayServices.map(sv => {
    const type = sv.type || sv.service_type || 'jardinagem';
    return `<div class="service-card ${type === 'piscina' ? 'pool' : 'garden'}">
      <div class="service-card-info">
        <div class="service-card-name">${escapeHtml(sv.client_name || sv.client || '-')}</div>
        <div class="service-card-meta">
          📍 ${escapeHtml(sv.client_address || sv.address || '-')}<br/>
          👷 ${escapeHtml(sv.employee_name || sv.employee || '-')}
          &nbsp;&nbsp; ${statusBadge(type)} ${statusBadge(sv.status || 'agendado')}
        </div>
      </div>
      <div class="service-card-actions">
        <button class="btn btn-sm btn-secondary svc-arriving" data-id="${sv.id}" data-phone="${escapeHtml(sv.client_phone || '')}">📍 A Caminho</button>
        ${sv.status !== 'concluido' ? `<button class="btn btn-sm btn-success svc-complete" data-id="${sv.id}" data-type="${type}">✅ Concluir</button>` : ''}
        <button class="btn btn-sm btn-danger svc-cancel" data-id="${sv.id}">✕ Cancelar</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="card">
    <div class="card-title">Serviços — ${title}</div>
    ${cards}
  </div>`;

  el.querySelectorAll('.svc-arriving').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api('POST', `/services/${btn.dataset.id}/notify-arrival`);
        const msg = res && res.message ? res.message : 'Estou a caminho para realizar o serviço!';
        if (btn.dataset.phone) openWhatsApp(btn.dataset.phone, msg);
        else toast(msg, 'info');
      } catch (err) { toast('Erro: ' + err.message, 'error'); }
    });
  });

  el.querySelectorAll('.svc-complete').forEach(btn => {
    btn.addEventListener('click', () => openCompletionModal(btn.dataset.id, btn.dataset.type));
  });

  el.querySelectorAll('.svc-cancel').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este serviço?')) return;
      try {
        await api('PUT', `/services/${btn.dataset.id}`, { status: 'cancelado' });
        toast('Serviço cancelado', 'success');
        fetchAgendaServices().then(() => { renderCalendar(); renderDayList(dateStr); });
      } catch (err) { toast('Erro: ' + err.message, 'error'); }
    });
  });
}

function openCompletionModal(serviceId, serviceType) {
  const isPool = serviceType === 'piscina';
  const waterFields = isPool ? `
    <div class="form-section-title">Qualidade da Água</div>
    <div class="water-quality-grid">
      <div class="form-group"><label>pH</label><input type="number" id="wq-ph" step="0.1" placeholder="7.2" /></div>
      <div class="form-group"><label>Cloro (mg/L)</label><input type="number" id="wq-chloro" step="0.1" placeholder="1.5" /></div>
      <div class="form-group"><label>Alcalinidade</label><input type="number" id="wq-alc" step="1" placeholder="80" /></div>
      <div class="form-group"><label>Turbidez</label><input type="number" id="wq-turbidez" step="0.1" placeholder="0" /></div>
      <div class="form-group"><label>Pressão do Filtro</label><input type="number" id="wq-pressure" step="0.1" placeholder="0.5" /></div>
    </div>` : '';

  const content = `
    <div class="form-section-title">Checklist</div>
    <div id="checklist-items">
      ${isPool ?
        ['Limpeza das bordas','Aspiração do fundo','Limpeza do skimmer','Limpeza do filtro','Adição de produtos','Teste de pH','Teste de cloro','Retrolavagem','Verificação do sistema'].map(item =>
          `<div class="form-check"><input type="checkbox" class="checklist-item" value="${item}" /><label>${item}</label></div>`
        ).join('') :
        ['Corte da grama','Podagem de arbustos','Limpeza de folhas','Adubação','Irrigação','Retirada de ervas daninhas','Varrição'].map(item =>
          `<div class="form-check"><input type="checkbox" class="checklist-item" value="${item}" /><label>${item}</label></div>`
        ).join('')}
    </div>
    ${waterFields}
    <div class="form-section-title">Produtos Utilizados</div>
    <div id="products-used-list"></div>
    <button class="btn btn-ghost btn-sm mt-1" id="add-product-used">+ Adicionar Produto</button>
    <div class="form-section-title">Fotos</div>
    <div class="form-group">
      <input type="file" id="completion-photos" multiple accept="image/*" />
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="completion-notes" rows="3" placeholder="Observações do serviço..."></textarea>
    </div>
    <div class="form-group">
      <label>Cobrança Extra (R$)</label>
      <input type="number" id="completion-extra" min="0" step="0.01" placeholder="0,00" />
    </div>`;

  openModal('Concluir Serviço', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" id="confirm-completion-btn">✅ Salvar e Concluir</button>
  `, 'lg');

  let productCount = 0;
  document.getElementById('add-product-used').addEventListener('click', () => {
    productCount++;
    const div = document.createElement('div');
    div.className = 'form-row mb-1';
    div.innerHTML = `
      <div class="form-group" style="flex:2"><input type="text" placeholder="Nome do produto" class="pu-name" /></div>
      <div class="form-group"><input type="number" placeholder="Qtd" class="pu-qty" min="0" step="0.1" /></div>
      <div class="form-group" style="max-width:40px; padding-top:1.5rem;">
        <button class="btn btn-sm btn-danger" onclick="this.closest('.form-row').remove()">✕</button>
      </div>`;
    document.getElementById('products-used-list').appendChild(div);
  });

  document.getElementById('confirm-completion-btn').addEventListener('click', async () => {
    const checklist = Array.from(document.querySelectorAll('.checklist-item:checked')).map(i => i.value);
    const notes     = document.getElementById('completion-notes').value;
    const extra     = parseFloat(document.getElementById('completion-extra').value) || 0;
    const products  = Array.from(document.querySelectorAll('.form-row')).map(row => ({
      name: row.querySelector('.pu-name')?.value,
      qty:  parseFloat(row.querySelector('.pu-qty')?.value) || 0
    })).filter(p => p.name);

    const payload = { status: 'concluido', notes, extra_charge: extra, checklist, products_used: products };

    if (isPool) {
      payload.water_quality = {
        ph:        parseFloat(document.getElementById('wq-ph')?.value) || null,
        chloro:    parseFloat(document.getElementById('wq-chloro')?.value) || null,
        alkalinity: parseFloat(document.getElementById('wq-alc')?.value) || null,
        turbidity: parseFloat(document.getElementById('wq-turbidez')?.value) || null,
        filter_pressure: parseFloat(document.getElementById('wq-pressure')?.value) || null,
      };
    }

    try {
      await api('POST', `/services/${serviceId}/complete`, payload);

      // Upload photos
      const photos = document.getElementById('completion-photos').files;
      if (photos.length > 0) {
        const fd = new FormData();
        Array.from(photos).forEach(f => fd.append('photos', f));
        await api('POST', `/services/${serviceId}/photos`, fd, true);
      }

      toast('Serviço concluído com sucesso!', 'success');
      closeModal();
      fetchAgendaServices().then(() => { renderCalendar(); if (agendaSelectedDay) renderDayList(agendaSelectedDay); });
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  });
}

async function openNewServiceModal() {
  let clients = [];
  let team    = agendaTeam;
  try { clients = await api('GET', '/clients') || []; } catch {}

  const clientOptions = clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const teamOptions   = team.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

  const content = `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Cliente *</label>
        <select id="ns-client"  style="width:100%">
          <option value="">Selecione o cliente</option>
          ${clientOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Tipo de Serviço *</label>
        <select id="ns-type">
          <option value="jardinagem">Jardinagem</option>
          <option value="piscina">Piscina</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Data *</label>
        <input type="date" id="ns-date" value="${agendaSelectedDay || new Date().toISOString().slice(0,10)}" />
      </div>
      <div class="form-group">
        <label>Horário</label>
        <input type="time" id="ns-time" placeholder="08:00" />
      </div>
    </div>
    <div class="form-group">
      <label>Funcionário</label>
      <select id="ns-employee">
        <option value="">Sem atribuição</option>
        ${teamOptions}
      </select>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="ns-notes" rows="2" placeholder="Observações sobre o serviço..."></textarea>
    </div>`;

  openModal('Novo Serviço', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-service-btn">Agendar</button>
  `, 'sm');

  document.getElementById('save-service-btn').addEventListener('click', async () => {
    const client_id   = document.getElementById('ns-client').value;
    const type        = document.getElementById('ns-type').value;
    const date        = document.getElementById('ns-date').value;
    const time        = document.getElementById('ns-time').value;
    const employee_id = document.getElementById('ns-employee').value;
    const notes       = document.getElementById('ns-notes').value;

    if (!client_id) { toast('Selecione o cliente', 'warning'); return; }
    if (!date)      { toast('Selecione a data', 'warning'); return; }

    try {
      await api('POST', '/services', { client_id, type, scheduled_date: date, scheduled_time: time, employee_id: employee_id || null, notes, status: 'agendado' });
      toast('Serviço agendado!', 'success');
      closeModal();
      fetchAgendaServices().then(renderAgendaBody);
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  });
}
