/* ============================================================
   FINANCIAL MODULE
   ============================================================ */

let finTab = 'charges';
let chargesData = [];
let chargesFilter = { status: '', month: '', year: '' };
let expensesData  = [];

async function loadFinancial() {
  const el = document.getElementById('financial-content');
  el.innerHTML = `
    <div class="section-header">
      <div class="section-title">Financeiro</div>
    </div>
    <div class="tabs">
      <button class="tab-btn ${finTab === 'charges' ? 'active' : ''}" data-tab="charges">💳 Cobranças</button>
      <button class="tab-btn ${finTab === 'expenses' ? 'active' : ''}" data-tab="expenses">🧾 Despesas</button>
      <button class="tab-btn ${finTab === 'summary' ? 'active' : ''}" data-tab="summary">📊 Resumo</button>
    </div>
    <div id="fin-tab-content"><div class="loading-spinner"><div class="spinner"></div></div></div>`;

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      finTab = btn.dataset.tab;
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadFinTab();
    });
  });

  loadFinTab();
}

async function loadFinTab() {
  switch (finTab) {
    case 'charges':  await loadCharges();  break;
    case 'expenses': await loadExpenses(); break;
    case 'summary':  await loadSummary();  break;
  }
}

/* ----- CHARGES ----- */
async function loadCharges() {
  const el = document.getElementById('fin-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const now = new Date();
    if (!chargesFilter.month) chargesFilter.month = String(now.getMonth() + 1).padStart(2, '0');
    if (!chargesFilter.year)  chargesFilter.year  = String(now.getFullYear());

    const params = new URLSearchParams();
    if (chargesFilter.status) params.set('status', chargesFilter.status);
    if (chargesFilter.month)  params.set('month', chargesFilter.month);
    if (chargesFilter.year)   params.set('year',  chargesFilter.year);

    chargesData = await api('GET', '/financial/charges?' + params.toString()) || [];
    renderCharges();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCharges() {
  const el = document.getElementById('fin-tab-content');

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const rows = chargesData.length > 0 ? chargesData.map(c => {
    const due     = new Date(c.due_date + 'T12:00:00');
    const today   = new Date();
    const daysOverdue = c.status === 'vencido' ? Math.floor((today - due) / 86400000) : 0;

    return `<tr>
      <td><strong>${escapeHtml(c.client_name || c.client || '-')}</strong></td>
      <td>${escapeHtml(c.description || '-')}</td>
      <td><strong>${formatCurrency(c.value || c.amount || 0)}</strong></td>
      <td>${formatDate(c.due_date)}${daysOverdue > 0 ? `<br><span class="overdue-badge">${daysOverdue}d atrasado</span>` : ''}</td>
      <td>${statusBadge(c.status || 'pendente')}</td>
      <td>
        <div class="actions-cell">
          ${c.status !== 'pago' ? `<button class="btn btn-sm btn-success charge-pay" data-id="${c.id}" title="Registrar pagamento">✅ Pagar</button>` : ''}
          <button class="btn btn-sm btn-outline-accent charge-wa" data-id="${c.id}" data-phone="${escapeHtml(c.client_phone || c.phone || '')}" title="Enviar cobrança WhatsApp">💬 Cobrar</button>
          ${c.pix_code ? `<button class="btn btn-sm btn-ghost charge-pix" data-code="${escapeHtml(c.pix_code)}" title="Ver PIX">🏦 PIX</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">💳</span><p class="empty-state-title">Nenhuma cobrança encontrada</p></div></td></tr>`;

  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:1rem;">
      <select class="filter-select" id="charges-status-filter">
        <option value="" ${chargesFilter.status === '' ? 'selected' : ''}>Todos</option>
        ${['pendente','pago','vencido'].map(s => `<option value="${s}" ${chargesFilter.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
      </select>
      <select class="filter-select" id="charges-month-filter">
        ${months.map((m, i) => `<option value="${m}" ${chargesFilter.month === m ? 'selected' : ''}>${monthNames[i]}</option>`).join('')}
      </select>
      <select class="filter-select" id="charges-year-filter">
        ${[2023,2024,2025,2026].map(y => `<option value="${y}" ${String(chargesFilter.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-outline btn-sm" id="gen-monthly-btn">🔄 Gerar Mensalidades</button>
      <button class="btn btn-primary" id="add-charge-btn">+ Nova Cobrança</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('charges-status-filter').addEventListener('change', e => {
    chargesFilter.status = e.target.value; loadCharges();
  });
  document.getElementById('charges-month-filter').addEventListener('change', e => {
    chargesFilter.month = e.target.value; loadCharges();
  });
  document.getElementById('charges-year-filter').addEventListener('change', e => {
    chargesFilter.year = e.target.value; loadCharges();
  });
  document.getElementById('add-charge-btn').addEventListener('click', openAddChargeModal);
  document.getElementById('gen-monthly-btn').addEventListener('click', generateMonthlyCharges);

  document.querySelectorAll('.charge-pay').forEach(btn => {
    btn.addEventListener('click', () => openPayModal(btn.dataset.id));
  });
  document.querySelectorAll('.charge-wa').forEach(btn => {
    btn.addEventListener('click', () => openChargeWhatsApp(btn.dataset.id, btn.dataset.phone));
  });
  document.querySelectorAll('.charge-pix').forEach(btn => {
    btn.addEventListener('click', () => showPixCode(btn.dataset.code));
  });
}

async function openPayModal(chargeId) {
  const today = new Date().toISOString().slice(0, 10);
  const content = `
    <div class="form-group">
      <label>Data de Pagamento *</label>
      <input type="date" id="pay-date" value="${today}" />
    </div>
    <div class="form-group">
      <label>Forma de Pagamento</label>
      <select id="pay-method">
        ${['PIX','Dinheiro','Transferência','Cartão de Crédito','Cartão de Débito','Boleto'].map(m =>
          `<option value="${m}">${m}</option>`).join('')}
      </select>
    </div>`;

  openModal('Registrar Pagamento', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" id="confirm-pay-btn">✅ Confirmar Pagamento</button>
  `, 'sm');

  document.getElementById('confirm-pay-btn').addEventListener('click', async () => {
    const date   = document.getElementById('pay-date').value;
    const method = document.getElementById('pay-method').value;
    if (!date) { toast('Selecione a data', 'warning'); return; }
    try {
      await api('POST', `/financial/charges/${chargeId}/pay`, { payment_date: date, payment_method: method });
      toast('Pagamento registrado!', 'success');
      closeModal();
      loadCharges();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

async function openChargeWhatsApp(chargeId, phone) {
  try {
    const res = await api('GET', `/financial/charges/${chargeId}/whatsapp`);
    const message = res && res.message ? res.message : 'Olá! Gostaríamos de lembrar sobre o pagamento em aberto.';
    const pixCode = res && res.pix_code ? res.pix_code : null;

    let pixHtml = '';
    if (pixCode) {
      pixHtml = `<div class="form-group">
        <label>Código PIX (copiar)</label>
        <div class="pix-code-box">
          <span style="flex:1;word-break:break-all;">${escapeHtml(pixCode)}</span>
          <button class="btn btn-sm btn-outline pix-copy-btn" onclick="copyToClipboard('${escapeHtml(pixCode)}', this)">Copiar</button>
        </div>
      </div>`;
    }

    const content = `
      <div class="form-group"><label>Mensagem</label>
        <div class="whatsapp-preview">${escapeHtml(message)}</div>
      </div>
      ${pixHtml}`;

    openModal('Cobrança via WhatsApp', content, `
      <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
      ${phone ? `<button class="btn whatsapp-btn" onclick="openWhatsApp('${escapeHtml(phone)}', \`${message.replace(/`/g,"'")}\`); closeModal();">💬 Abrir WhatsApp</button>` : ''}
    `, 'sm');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

function showPixCode(code) {
  const content = `<div class="pix-code-box">
    <span style="flex:1;word-break:break-all;">${escapeHtml(code)}</span>
    <button class="btn btn-sm btn-outline pix-copy-btn" onclick="copyToClipboard('${escapeHtml(code)}', this)">Copiar</button>
  </div>`;
  openModal('Código PIX', content, `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>`, 'sm');
}

async function generateMonthlyCharges() {
  if (!confirm('Gerar cobranças mensais para todos os clientes ativos?')) return;
  try {
    const res = await api('POST', '/financial/generate-monthly');
    toast(`${res.count || 0} cobranças geradas!`, 'success');
    loadCharges();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function openAddChargeModal() {
  let clients = [];
  try { clients = await api('GET', '/clients') || []; } catch {}

  const content = `
    <div class="form-group">
      <label>Cliente *</label>
      <select id="ac-client">
        <option value="">Selecione</option>
        ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Descrição *</label>
      <input type="text" id="ac-desc" placeholder="Ex: Mensalidade Janeiro/2025" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Valor (R$) *</label>
        <input type="number" id="ac-value" min="0" step="0.01" placeholder="0,00" />
      </div>
      <div class="form-group">
        <label>Vencimento *</label>
        <input type="date" id="ac-due" value="${new Date().toISOString().slice(0,10)}" />
      </div>
    </div>
    <div class="form-group">
      <label>Tipo</label>
      <select id="ac-type">
        ${['mensalidade','extra','servico','produto'].map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
      </select>
    </div>`;

  openModal('Nova Cobrança', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-charge-btn">Salvar</button>
  `, 'sm');

  document.getElementById('save-charge-btn').addEventListener('click', async () => {
    const client_id   = document.getElementById('ac-client').value;
    const description = document.getElementById('ac-desc').value.trim();
    const value       = parseFloat(document.getElementById('ac-value').value) || 0;
    const due_date    = document.getElementById('ac-due').value;
    const type        = document.getElementById('ac-type').value;
    if (!client_id)   { toast('Selecione o cliente', 'warning'); return; }
    if (!description) { toast('Informe a descrição', 'warning'); return; }
    if (!value)       { toast('Informe o valor', 'warning'); return; }
    try {
      await api('POST', '/financial/charges', { client_id, description, value, due_date, type });
      toast('Cobrança criada!', 'success');
      closeModal();
      loadCharges();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- EXPENSES ----- */
async function loadExpenses() {
  const el = document.getElementById('fin-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    expensesData = await api('GET', '/financial/expenses') || [];
    renderExpenses();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

function renderExpenses() {
  const el = document.getElementById('fin-tab-content');
  const rows = expensesData.length > 0 ? expensesData.map(e => `
    <tr>
      <td>${escapeHtml(e.description || '-')}</td>
      <td>${escapeHtml(e.category || '-')}</td>
      <td><strong>${formatCurrency(e.value || e.amount || 0)}</strong></td>
      <td>${formatDate(e.date)}</td>
      <td>${escapeHtml(e.notes || '-')}</td>
      <td><button class="btn btn-sm btn-danger exp-del" data-id="${e.id}">🗑️</button></td>
    </tr>`).join('')
  : `<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">🧾</span><p class="empty-state-title">Nenhuma despesa encontrada</p></div></td></tr>`;

  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:1rem;">
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="add-expense-btn">+ Nova Despesa</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Data</th><th>Obs.</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('add-expense-btn').addEventListener('click', openAddExpenseModal);
  document.querySelectorAll('.exp-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta despesa?')) return;
      try {
        await api('DELETE', `/financial/expenses/${btn.dataset.id}`);
        toast('Despesa excluída', 'success');
        loadExpenses();
      } catch (err) { toast('Erro: ' + err.message, 'error'); }
    });
  });
}

async function openAddExpenseModal() {
  const content = `
    <div class="form-group">
      <label>Descrição *</label>
      <input type="text" id="exp-desc" placeholder="Ex: Compra de produtos químicos" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Categoria</label>
        <select id="exp-category">
          ${['Produtos','Combustível','Ferramentas','Manutenção','Pessoal','Outros'].map(c =>
            `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$) *</label>
        <input type="number" id="exp-value" min="0" step="0.01" placeholder="0,00" />
      </div>
      <div class="form-group">
        <label>Data *</label>
        <input type="date" id="exp-date" value="${new Date().toISOString().slice(0,10)}" />
      </div>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="exp-notes" rows="2"></textarea>
    </div>`;

  openModal('Nova Despesa', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-expense-btn">Salvar</button>
  `, 'sm');

  document.getElementById('save-expense-btn').addEventListener('click', async () => {
    const description = document.getElementById('exp-desc').value.trim();
    const category    = document.getElementById('exp-category').value;
    const value       = parseFloat(document.getElementById('exp-value').value) || 0;
    const date        = document.getElementById('exp-date').value;
    const notes       = document.getElementById('exp-notes').value;
    if (!description) { toast('Informe a descrição', 'warning'); return; }
    if (!value)       { toast('Informe o valor', 'warning'); return; }
    try {
      await api('POST', '/financial/expenses', { description, category, value, date, notes });
      toast('Despesa registrada!', 'success');
      closeModal();
      loadExpenses();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

/* ----- SUMMARY ----- */
async function loadSummary() {
  const el = document.getElementById('fin-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const s = await api('GET', '/financial/summary') || {};
    const revenue  = parseFloat(s.received  || 0);
    const expenses = parseFloat(s.expenses  || 0);
    const pending  = parseFloat(s.pending   || 0);
    const overdue  = parseFloat(s.overdue   || 0);
    const profit   = revenue - expenses;
    const margin   = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

    el.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card green">
          <div class="stat-label">Receita do Mês</div>
          <div class="stat-value">${formatCurrency(revenue)}</div>
          <div class="stat-sub">Valores recebidos</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Despesas</div>
          <div class="stat-value">${formatCurrency(expenses)}</div>
          <div class="stat-sub">Total de saídas</div>
        </div>
        <div class="stat-card ${profit >= 0 ? 'green' : 'red'}">
          <div class="stat-label">Lucro Líquido</div>
          <div class="stat-value">${formatCurrency(profit)}</div>
          <div class="stat-sub">Margem: ${margin}%</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-label">A Receber</div>
          <div class="stat-value">${formatCurrency(pending)}</div>
          <div class="stat-sub">Cobranças pendentes</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Inadimplência</div>
          <div class="stat-value">${formatCurrency(overdue)}</div>
          <div class="stat-sub">Cobranças vencidas</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Detalhes do Mês</div>
        <table>
          <tbody>
            <tr><td><strong>Clientes ativos</strong></td><td>${s.active_clients || 0}</td></tr>
            <tr><td><strong>Serviços realizados</strong></td><td>${s.services_done || 0}</td></tr>
            <tr><td><strong>Avaliação média</strong></td><td>${parseFloat(s.avg_rating || 0).toFixed(1)} ★</td></tr>
            <tr><td><strong>Receita bruta</strong></td><td>${formatCurrency(revenue)}</td></tr>
            <tr><td><strong>Total de despesas</strong></td><td>${formatCurrency(expenses)}</td></tr>
            <tr><td><strong>Lucro líquido</strong></td><td style="color:${profit >= 0 ? 'var(--primary)' : 'var(--danger)'}">${formatCurrency(profit)}</td></tr>
            <tr><td><strong>Margem de lucro</strong></td><td>${margin}%</td></tr>
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}
