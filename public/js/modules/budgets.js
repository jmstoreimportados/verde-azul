/* ============================================================
   BUDGETS MODULE
   ============================================================ */

let budgetsData = [];

async function loadBudgets() {
  const el = document.getElementById('budgets-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    budgetsData = await api('GET', '/budgets') || [];
    renderBudgets();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar orçamentos: ${escapeHtml(err.message)}</div>`;
  }
}

function renderBudgets() {
  const el = document.getElementById('budgets-content');

  const rows = budgetsData.length > 0 ? budgetsData.map(b => `
    <tr>
      <td>
        <strong>${escapeHtml(b.prospect_name || b.name || '-')}</strong><br/>
        <span class="text-muted">${formatPhone(b.prospect_phone || b.phone)}</span>
      </td>
      <td>${escapeHtml(b.description || '-')}</td>
      <td><strong>${formatCurrency(b.total_value || b.total || 0)}</strong></td>
      <td>${formatDate(b.created_at || b.date)}</td>
      <td>${statusBadge(b.status || 'draft')}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-outline budget-view" data-id="${b.id}" title="Ver detalhes">👁️</button>
          ${b.status !== 'converted' ? `<button class="btn btn-sm btn-ghost budget-edit" data-id="${b.id}" title="Editar">✏️</button>` : ''}
          <button class="btn btn-sm whatsapp-btn budget-wa" data-id="${b.id}" data-phone="${escapeHtml(b.prospect_phone || b.phone || '')}" title="Enviar WhatsApp">💬</button>
          ${b.status === 'approved' ? `<button class="btn btn-sm btn-success budget-convert" data-id="${b.id}" title="Converter em cliente">🔄 Converter</button>` : ''}
          ${b.status === 'draft' || b.status === 'sent' ? `
            <button class="btn btn-sm btn-primary budget-status" data-id="${b.id}" data-status="sent" title="Marcar como enviado">📤 Enviado</button>
            <button class="btn btn-sm btn-success budget-status" data-id="${b.id}" data-status="approved" title="Aprovar">✅ Aprovar</button>
            <button class="btn btn-sm btn-danger budget-status" data-id="${b.id}" data-status="rejected" title="Recusar">✕ Recusar</button>
          ` : ''}
        </div>
      </td>
    </tr>`).join('')
  : `<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">📋</span><p class="empty-state-title">Nenhum orçamento encontrado</p></div></td></tr>`;

  el.innerHTML = `
    <div class="section-header">
      <div class="section-title">Orçamentos (${budgetsData.length})</div>
      <button class="btn btn-primary" id="new-budget-btn">+ Novo Orçamento</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Prospecto</th><th>Descrição</th><th>Valor Total</th>
            <th>Data</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('new-budget-btn').addEventListener('click', () => openBudgetForm(null));

  document.querySelectorAll('.budget-view').forEach(btn => {
    btn.addEventListener('click', () => openBudgetDetail(btn.dataset.id));
  });
  document.querySelectorAll('.budget-edit').forEach(btn => {
    btn.addEventListener('click', () => openBudgetForm(btn.dataset.id));
  });
  document.querySelectorAll('.budget-wa').forEach(btn => {
    btn.addEventListener('click', () => sendBudgetWhatsApp(btn.dataset.id, btn.dataset.phone));
  });
  document.querySelectorAll('.budget-convert').forEach(btn => {
    btn.addEventListener('click', () => convertBudgetToClient(btn.dataset.id));
  });
  document.querySelectorAll('.budget-status').forEach(btn => {
    btn.addEventListener('click', () => updateBudgetStatus(btn.dataset.id, btn.dataset.status));
  });
}

function budgetFormHTML(b) {
  b = b || {};
  const items = b.items || [];
  const itemRows = items.length > 0
    ? items.map((item, i) => budgetItemRow(i, item.description, item.quantity, item.unit_price)).join('')
    : budgetItemRow(0);

  return `
    <div class="form-section-title">Dados do Prospecto</div>
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Nome *</label>
        <input type="text" id="bf-name" value="${escapeHtml(b.prospect_name || b.name || '')}" placeholder="Nome do prospecto" />
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="text" id="bf-phone" value="${escapeHtml(b.prospect_phone || b.phone || '')}" placeholder="(00) 00000-0000" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="bf-email" value="${escapeHtml(b.prospect_email || b.email || '')}" placeholder="email@exemplo.com" />
      </div>
      <div class="form-group">
        <label>Endereço</label>
        <input type="text" id="bf-address" value="${escapeHtml(b.address || '')}" placeholder="Endereço do imóvel" />
      </div>
    </div>
    <div class="form-group">
      <label>Descrição geral</label>
      <textarea id="bf-desc" rows="2" placeholder="Descreva os serviços propostos...">${escapeHtml(b.description || '')}</textarea>
    </div>

    <div class="form-section-title">Itens do Orçamento</div>
    <div style="display:grid;grid-template-columns:1fr 80px 100px 40px;gap:0.5rem;margin-bottom:0.25rem;">
      <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted)">Descrição</span>
      <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted)">Qtd</span>
      <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted)">Preço Unit.</span>
      <span></span>
    </div>
    <div id="budget-items">${itemRows}</div>
    <button class="btn btn-ghost btn-sm mt-1" id="add-budget-item">+ Adicionar Item</button>

    <div class="mt-2" style="text-align:right;">
      <strong>Total: </strong><span id="budget-total" style="font-size:1.1rem;color:var(--primary);font-weight:700;">${formatCurrency(b.total_value || 0)}</span>
    </div>

    <div class="form-group mt-2">
      <label>Observações</label>
      <textarea id="bf-notes" rows="2" placeholder="Condições de pagamento, validade, etc...">${escapeHtml(b.notes || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Validade (dias)</label>
      <input type="number" id="bf-validity" value="${b.validity_days || 30}" min="1" placeholder="30" />
    </div>`;
}

function budgetItemRow(index, desc = '', qty = 1, price = 0) {
  return `<div class="budget-item-row" data-row="${index}">
    <input type="text" class="bi-desc" placeholder="Descrição do serviço/produto" value="${escapeHtml(desc)}" style="padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;width:100%" />
    <input type="number" class="bi-qty" placeholder="1" value="${qty}" min="0" step="0.01" style="padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;width:100%" />
    <input type="number" class="bi-price" placeholder="0,00" value="${price}" min="0" step="0.01" style="padding:0.4rem 0.7rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:0.88rem;width:100%" />
    <button class="btn btn-sm btn-danger" onclick="this.closest('.budget-item-row').remove(); calcBudgetTotal()">✕</button>
  </div>`;
}

function calcBudgetTotal() {
  const rows = document.querySelectorAll('.budget-item-row');
  let total = 0;
  rows.forEach(row => {
    const qty   = parseFloat(row.querySelector('.bi-qty')?.value)   || 0;
    const price = parseFloat(row.querySelector('.bi-price')?.value) || 0;
    total += qty * price;
  });
  const el = document.getElementById('budget-total');
  if (el) el.textContent = formatCurrency(total);
}

function collectBudgetItems() {
  return Array.from(document.querySelectorAll('.budget-item-row')).map(row => ({
    description: row.querySelector('.bi-desc')?.value  || '',
    quantity:    parseFloat(row.querySelector('.bi-qty')?.value)   || 1,
    unit_price:  parseFloat(row.querySelector('.bi-price')?.value) || 0,
  })).filter(i => i.description);
}

async function openBudgetForm(budgetId) {
  let budget = null;
  if (budgetId) {
    budget = budgetsData.find(b => String(b.id) === String(budgetId));
    if (!budget) {
      try { budget = await api('GET', `/budgets/${budgetId}`); } catch {}
    }
  }

  openModal(budget ? 'Editar Orçamento' : 'Novo Orçamento', budgetFormHTML(budget), `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-budget-btn">${budget ? 'Salvar' : 'Criar Orçamento'}</button>
  `, 'lg');

  document.getElementById('add-budget-item').addEventListener('click', () => {
    const container = document.getElementById('budget-items');
    const idx = container.querySelectorAll('.budget-item-row').length;
    container.insertAdjacentHTML('beforeend', budgetItemRow(idx));
    container.querySelectorAll('.bi-qty, .bi-price').forEach(el => el.addEventListener('input', calcBudgetTotal));
  });

  document.querySelectorAll('.bi-qty, .bi-price').forEach(el => el.addEventListener('input', calcBudgetTotal));

  document.getElementById('save-budget-btn').addEventListener('click', async () => {
    const items = collectBudgetItems();
    const total = items.reduce((acc, i) => acc + (i.quantity * i.unit_price), 0);
    const data = {
      prospect_name:  document.getElementById('bf-name').value.trim(),
      prospect_phone: document.getElementById('bf-phone').value.trim(),
      prospect_email: document.getElementById('bf-email').value.trim(),
      address:        document.getElementById('bf-address').value.trim(),
      description:    document.getElementById('bf-desc').value.trim(),
      notes:          document.getElementById('bf-notes').value.trim(),
      validity_days:  parseInt(document.getElementById('bf-validity').value) || 30,
      items,
      total_value: total
    };
    if (!data.prospect_name) { toast('Informe o nome do prospecto', 'warning'); return; }
    if (items.length === 0)  { toast('Adicione pelo menos um item', 'warning'); return; }
    try {
      if (budget) {
        await api('PUT', `/budgets/${budget.id}`, data);
        toast('Orçamento atualizado!', 'success');
      } else {
        await api('POST', '/budgets', data);
        toast('Orçamento criado!', 'success');
      }
      closeModal();
      loadBudgets();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

async function openBudgetDetail(budgetId) {
  const b = budgetsData.find(x => String(x.id) === String(budgetId));
  if (!b) { toast('Orçamento não encontrado', 'error'); return; }

  const items = b.items || [];
  const itemsHtml = items.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--primary);color:#fff;">
        <th style="padding:0.5rem">Descrição</th>
        <th style="padding:0.5rem">Qtd</th>
        <th style="padding:0.5rem">Preço Unit.</th>
        <th style="padding:0.5rem">Total</th>
      </tr></thead>
      <tbody>${items.map(i => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:0.5rem">${escapeHtml(i.description)}</td>
          <td style="padding:0.5rem">${i.quantity}</td>
          <td style="padding:0.5rem">${formatCurrency(i.unit_price)}</td>
          <td style="padding:0.5rem"><strong>${formatCurrency((i.quantity || 1) * (i.unit_price || 0))}</strong></td>
        </tr>`).join('')}
        <tr><td colspan="3" style="padding:0.5rem;text-align:right"><strong>TOTAL:</strong></td>
          <td style="padding:0.5rem"><strong style="color:var(--primary);font-size:1.1rem">${formatCurrency(b.total_value || 0)}</strong></td>
        </tr>
      </tbody>
    </table>` : '<p class="text-muted">Sem itens detalhados.</p>';

  const content = `
    <div class="form-section-title">Prospecto</div>
    <p><strong>Nome:</strong> ${escapeHtml(b.prospect_name || b.name || '-')}</p>
    <p><strong>Telefone:</strong> ${formatPhone(b.prospect_phone || b.phone)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(b.prospect_email || b.email || '-')}</p>
    <p><strong>Endereço:</strong> ${escapeHtml(b.address || '-')}</p>
    <p><strong>Descrição:</strong> ${escapeHtml(b.description || '-')}</p>
    <p><strong>Validade:</strong> ${b.validity_days || 30} dias</p>
    <div class="form-section-title">Itens</div>
    ${itemsHtml}
    ${b.notes ? `<div class="form-section-title">Observações</div><p>${escapeHtml(b.notes)}</p>` : ''}`;

  const phone = b.prospect_phone || b.phone || '';
  openModal(`Orçamento #${b.id}`, content, `
    <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
    ${phone ? `<button class="btn whatsapp-btn" onclick="sendBudgetWhatsApp(${b.id}, '${escapeHtml(phone)}')">💬 Enviar WhatsApp</button>` : ''}
    ${b.status === 'approved' ? `<button class="btn btn-success" onclick="convertBudgetToClient(${b.id})">🔄 Converter em Cliente</button>` : ''}
  `, 'lg');
}

async function sendBudgetWhatsApp(budgetId, phone) {
  try {
    const res = await api('GET', `/budgets/${budgetId}/whatsapp`);
    const msg = res && res.message ? res.message : 'Olá! Segue o orçamento da Verde & Azul Gestão.';
    closeModal();
    openModal('Orçamento via WhatsApp', `
      <div class="whatsapp-preview">${escapeHtml(msg)}</div>`, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      ${phone ? `<button class="btn whatsapp-btn" onclick="openWhatsApp('${escapeHtml(phone)}', \`${msg.replace(/`/g,"'")}\`); closeModal();">💬 Abrir WhatsApp</button>` : ''}
    `, 'sm');
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function updateBudgetStatus(budgetId, newStatus) {
  const labels = { sent:'enviado', approved:'aprovado', rejected:'recusado' };
  if (!confirm(`Marcar orçamento como ${labels[newStatus] || newStatus}?`)) return;
  try {
    await api('PUT', `/budgets/${budgetId}/status`, { status: newStatus });
    toast('Status atualizado!', 'success');
    loadBudgets();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

async function convertBudgetToClient(budgetId) {
  if (!confirm('Converter este orçamento em cliente?')) return;
  try {
    await api('POST', `/budgets/${budgetId}/convert`);
    toast('Orçamento convertido! Cliente criado.', 'success');
    closeModal();
    loadBudgets();
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}
