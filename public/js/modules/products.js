/* ============================================================
   PRODUCTS MODULE
   ============================================================ */

let productsTab  = 'catalog';
let productsData = [];

async function loadProducts() {
  const el = document.getElementById('products-content');
  el.innerHTML = `
    <div class="section-header"><div class="section-title">Produtos e Estoque</div></div>
    <div class="tabs">
      <button class="tab-btn ${productsTab === 'catalog' ? 'active' : ''}" data-tab="catalog">📦 Catálogo</button>
      <button class="tab-btn ${productsTab === 'stock'   ? 'active' : ''}" data-tab="stock">📊 Estoque</button>
      <button class="tab-btn ${productsTab === 'alerts'  ? 'active' : ''}" data-tab="alerts">⚠️ Alertas</button>
    </div>
    <div id="products-tab-content"><div class="loading-spinner"><div class="spinner"></div></div></div>`;

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      productsTab = btn.dataset.tab;
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadProductsTab();
    });
  });

  loadProductsTab();
}

async function loadProductsTab() {
  switch (productsTab) {
    case 'catalog': await loadCatalog(); break;
    case 'stock':   await loadStock();   break;
    case 'alerts':  await loadStockAlerts(); break;
  }
}

/* ----- CATALOG ----- */
async function loadCatalog() {
  const el = document.getElementById('products-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    productsData = await api('GET', '/products') || [];
    renderCatalog();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCatalog() {
  const el = document.getElementById('products-tab-content');

  const rows = productsData.length > 0 ? productsData.map(p => {
    const stockStatus = p.stock_status || (p.stock_quantity <= 0 ? 'critical' : p.stock_quantity <= p.min_stock ? 'low' : 'ok');
    const dotClass    = { ok: 'stock-ok', low: 'stock-low', critical: 'stock-critical' }[stockStatus] || 'stock-ok';
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.category || '-')}</td>
      <td>${escapeHtml(p.unit || 'un')}</td>
      <td>${formatCurrency(p.cost_price || 0)}</td>
      <td>${formatCurrency(p.sale_price || p.price || 0)}</td>
      <td><span class="stock-indicator ${dotClass}"></span>${p.stock_quantity ?? '-'} ${escapeHtml(p.unit || '')}</td>
      <td>${p.min_stock ?? '-'}</td>
      <td><span class="badge badge-${stockStatus === 'ok' ? 'success' : stockStatus === 'low' ? 'warning' : 'danger'}">${stockStatus === 'ok' ? 'OK' : stockStatus === 'low' ? 'Baixo' : 'Crítico'}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-outline prod-edit" data-id="${p.id}" title="Editar">✏️</button>
          <button class="btn btn-sm btn-success prod-stock-entry" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Entrada de estoque">+ Estoque</button>
          <button class="btn btn-sm btn-ghost prod-movements" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Histórico">📋</button>
        </div>
      </td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="9"><div class="empty-state"><span class="empty-state-icon">📦</span><p class="empty-state-title">Nenhum produto cadastrado</p></div></td></tr>`;

  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:1rem;">
      <div style="flex:1"></div>
      <button class="btn btn-primary" id="new-product-btn">+ Novo Produto</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Categoria</th><th>Unidade</th>
            <th>Custo</th><th>Venda</th><th>Estoque</th>
            <th>Estoque Mín.</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('new-product-btn').addEventListener('click', () => openProductForm(null));
  document.querySelectorAll('.prod-edit').forEach(btn => btn.addEventListener('click', () => openProductForm(btn.dataset.id)));
  document.querySelectorAll('.prod-stock-entry').forEach(btn => btn.addEventListener('click', () => openStockEntryModal(btn.dataset.id, btn.dataset.name)));
  document.querySelectorAll('.prod-movements').forEach(btn => btn.addEventListener('click', () => openMovementsModal(btn.dataset.id, btn.dataset.name)));
}

function productFormHTML(p) {
  p = p || {};
  return `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Nome *</label>
        <input type="text" id="pf-name" value="${escapeHtml(p.name || '')}" placeholder="Nome do produto" />
      </div>
      <div class="form-group">
        <label>Categoria</label>
        <select id="pf-category">
          ${['Químico','Ferramenta','EPI','Adubo','Semente','Material','Outros'].map(c =>
            `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Unidade</label>
        <select id="pf-unit">
          ${['un','kg','L','m','m²','cx','saco','frasco'].map(u =>
            `<option value="${u}" ${p.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Preço de Custo (R$)</label>
        <input type="number" id="pf-cost" value="${p.cost_price || ''}" min="0" step="0.01" placeholder="0,00" />
      </div>
      <div class="form-group">
        <label>Preço de Venda (R$)</label>
        <input type="number" id="pf-sale" value="${p.sale_price || p.price || ''}" min="0" step="0.01" placeholder="0,00" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Estoque Atual</label>
        <input type="number" id="pf-stock" value="${p.stock_quantity ?? ''}" min="0" step="0.01" placeholder="0" />
      </div>
      <div class="form-group">
        <label>Estoque Mínimo</label>
        <input type="number" id="pf-min-stock" value="${p.min_stock ?? ''}" min="0" step="0.01" placeholder="0" />
      </div>
    </div>
    <div class="form-group">
      <label>Descrição / Observações</label>
      <textarea id="pf-desc" rows="2" placeholder="Descrição do produto...">${escapeHtml(p.description || '')}</textarea>
    </div>`;
}

async function openProductForm(productId) {
  let product = null;
  if (productId) {
    product = productsData.find(p => String(p.id) === String(productId));
    if (!product) {
      try { product = await api('GET', `/products/${productId}`); } catch {}
    }
  }

  openModal(product ? 'Editar Produto' : 'Novo Produto', productFormHTML(product), `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-product-btn">${product ? 'Salvar' : 'Cadastrar'}</button>
  `, 'sm');

  document.getElementById('save-product-btn').addEventListener('click', async () => {
    const data = {
      name:           document.getElementById('pf-name').value.trim(),
      category:       document.getElementById('pf-category').value,
      unit:           document.getElementById('pf-unit').value,
      cost_price:     parseFloat(document.getElementById('pf-cost').value)      || 0,
      sale_price:     parseFloat(document.getElementById('pf-sale').value)      || 0,
      stock_quantity: parseFloat(document.getElementById('pf-stock').value)     || 0,
      min_stock:      parseFloat(document.getElementById('pf-min-stock').value) || 0,
      description:    document.getElementById('pf-desc').value.trim()
    };
    if (!data.name) { toast('Nome é obrigatório', 'warning'); return; }
    try {
      if (product) {
        await api('PUT', `/products/${product.id}`, data);
        toast('Produto atualizado!', 'success');
      } else {
        await api('POST', '/products', data);
        toast('Produto cadastrado!', 'success');
      }
      closeModal();
      loadCatalog();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

async function openStockEntryModal(productId, productName) {
  const content = `
    <p class="mb-2"><strong>Produto:</strong> ${escapeHtml(productName)}</p>
    <div class="form-row">
      <div class="form-group">
        <label>Quantidade *</label>
        <input type="number" id="se-qty" min="0.01" step="0.01" placeholder="Ex: 10" />
      </div>
      <div class="form-group">
        <label>Custo Unitário (R$)</label>
        <input type="number" id="se-cost" min="0" step="0.01" placeholder="0,00" />
      </div>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="se-notes" rows="2" placeholder="Ex: Compra nota fiscal 1234..."></textarea>
    </div>`;

  openModal('Entrada de Estoque', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" id="save-entry-btn">✅ Registrar Entrada</button>
  `, 'sm');

  document.getElementById('save-entry-btn').addEventListener('click', async () => {
    const quantity   = parseFloat(document.getElementById('se-qty').value)  || 0;
    const unit_cost  = parseFloat(document.getElementById('se-cost').value) || 0;
    const notes      = document.getElementById('se-notes').value;
    if (!quantity) { toast('Informe a quantidade', 'warning'); return; }
    try {
      await api('POST', `/products/${productId}/stock-entry`, { quantity, unit_cost, notes });
      toast('Entrada de estoque registrada!', 'success');
      closeModal();
      loadCatalog();
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  });
}

async function openMovementsModal(productId, productName) {
  try {
    const data = await api('GET', `/products/${productId}/movements`) || [];
    const rows = data.length > 0 ? data.map(m => {
      const isIn = (m.type || m.movement_type || '').includes('in') || m.quantity > 0;
      return `<div class="movement-row">
        <span class="${isIn ? 'movement-in' : 'movement-out'}">${isIn ? '+' : '-'}${Math.abs(m.quantity)} ${escapeHtml(m.unit || '')}</span>
        <span style="flex:1">${escapeHtml(m.notes || m.reason || '-')}</span>
        <span class="text-muted">${formatDate(m.date || m.created_at)}</span>
      </div>`;
    }).join('')
    : '<div class="empty-state"><span class="empty-state-icon">📋</span><p class="empty-state-title">Sem movimentações</p></div>';

    openModal(`Movimentações: ${productName}`, `<div>${rows}</div>`, `<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>`);
  } catch (err) { toast('Erro: ' + err.message, 'error'); }
}

/* ----- STOCK TAB ----- */
async function loadStock() {
  try {
    if (!productsData.length) productsData = await api('GET', '/products') || [];
    renderStock();
  } catch (err) {
    document.getElementById('products-tab-content').innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}

function renderStock() {
  const el = document.getElementById('products-tab-content');
  const totalValue = productsData.reduce((acc, p) => acc + ((p.stock_quantity || 0) * (p.cost_price || 0)), 0);

  const rows = productsData.map(p => {
    const stockStatus = p.stock_status || (p.stock_quantity <= 0 ? 'critical' : p.stock_quantity <= p.min_stock ? 'low' : 'ok');
    const pct = p.min_stock > 0 ? Math.min(100, Math.round((p.stock_quantity / (p.min_stock * 2)) * 100)) : 50;
    const fillColor = stockStatus === 'ok' ? 'var(--primary-mid)' : stockStatus === 'low' ? 'var(--warning)' : 'var(--danger)';
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.category || '-')}</td>
      <td>
        ${p.stock_quantity ?? 0} ${escapeHtml(p.unit || '')}
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${fillColor}"></div></div>
      </td>
      <td>${p.min_stock ?? 0}</td>
      <td>${formatCurrency((p.stock_quantity || 0) * (p.cost_price || 0))}</td>
      <td><span class="badge badge-${stockStatus === 'ok' ? 'success' : stockStatus === 'low' ? 'warning' : 'danger'}">${stockStatus === 'ok' ? 'OK' : stockStatus === 'low' ? 'Baixo' : 'Crítico'}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="stat-cards mb-2">
      <div class="stat-card blue">
        <div class="stat-label">Total em Estoque (R$)</div>
        <div class="stat-value">${formatCurrency(totalValue)}</div>
        <div class="stat-sub">${productsData.length} produtos</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Estoque Baixo</div>
        <div class="stat-value">${productsData.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock).length}</div>
        <div class="stat-sub">produtos</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Sem Estoque</div>
        <div class="stat-value">${productsData.filter(p => (p.stock_quantity || 0) <= 0).length}</div>
        <div class="stat-sub">produtos</div>
      </div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Valor em Estoque</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ----- ALERTS TAB ----- */
async function loadStockAlerts() {
  const el = document.getElementById('products-tab-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const data = await api('GET', '/products/status/alerts') || [];
    const alerts = Array.isArray(data) ? data.filter(p => p.stock_status !== 'ok') : [];

    if (alerts.length === 0) {
      el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">✅</span>
        <p class="empty-state-title">Estoque em dia!</p>
        <p class="empty-state-sub">Nenhum produto com estoque baixo no momento.</p>
      </div>`;
      return;
    }

    const rows = alerts.map(p => `
      <div class="alert ${p.stock_status === 'critical' ? 'alert-danger' : 'alert-warning'}">
        <span style="font-size:1.2rem;">${p.stock_status === 'critical' ? '🔴' : '🟡'}</span>
        <div style="flex:1">
          <strong>${escapeHtml(p.name)}</strong> — Estoque: <strong>${p.stock_quantity ?? 0} ${escapeHtml(p.unit || '')}</strong>
          (mínimo: ${p.min_stock ?? 0})
        </div>
        <button class="btn btn-sm btn-outline" onclick="openStockEntryModal(${p.id}, '${escapeHtml(p.name)}')">+ Estoque</button>
      </div>`).join('');

    el.innerHTML = `
      <h3 style="margin-bottom:1rem;color:var(--primary)">${alerts.length} produto(s) precisam de reposição</h3>
      ${rows}`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
  }
}
