/* ============================================================
   REPORTS MODULE
   ============================================================ */

let activeReport = 'revenue';
let reportsCharts = {};

const reportItems = [
  { key: 'revenue',       label: '📊 Receita vs Despesas' },
  { key: 'profit',        label: '💹 Lucro/Prejuízo' },
  { key: 'overdue',       label: '⚠️ Inadimplência' },
  { key: 'top-clients',   label: '⭐ Top Clientes' },
  { key: 'services',      label: '🔧 Serviços Realizados' },
  { key: 'satisfaction',  label: '😊 Satisfação' },
  { key: 'at-risk',       label: '🚨 Clientes em Risco' },
  { key: 'team',          label: '👷 Produtividade da Equipe' },
  { key: 'stock',         label: '📦 Relatório de Estoque' },
];

async function loadReports() {
  const el = document.getElementById('reports-content');

  const navItems = reportItems.map(r =>
    `<div class="report-nav-item${r.key === activeReport ? ' active' : ''}" data-report="${r.key}">${r.label}</div>`
  ).join('');

  el.innerHTML = `
    <div class="section-header"><div class="section-title">Relatórios</div></div>
    <div class="reports-layout">
      <div class="reports-sidebar">${navItems}</div>
      <div id="report-main"><div class="loading-spinner"><div class="spinner"></div></div></div>
    </div>`;

  el.querySelectorAll('.report-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      activeReport = item.dataset.report;
      el.querySelectorAll('.report-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadReportSection(activeReport);
    });
  });

  loadReportSection(activeReport);
}

async function loadReportSection(key) {
  // Destroy existing charts to prevent canvas reuse errors
  Object.values(reportsCharts).forEach(c => { try { c.destroy(); } catch {} });
  reportsCharts = {};

  const el = document.getElementById('report-main');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    switch (key) {
      case 'revenue':      await renderRevenueReport(el);     break;
      case 'profit':       await renderProfitReport(el);      break;
      case 'overdue':      await renderOverdueReport(el);     break;
      case 'top-clients':  await renderTopClientsReport(el);  break;
      case 'services':     await renderServicesReport(el);    break;
      case 'satisfaction': await renderSatisfactionReport(el);break;
      case 'at-risk':      await renderAtRiskReport(el);      break;
      case 'team':         await renderTeamReport(el);        break;
      case 'stock':        await renderStockReport(el);       break;
      default: el.innerHTML = '<p>Relatório não encontrado.</p>';
    }
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar relatório: ${escapeHtml(err.message)}</div>`;
  }
}

/* ----- REVENUE vs EXPENSES ----- */
async function renderRevenueReport(el) {
  const data = await api('GET', '/reports/revenue') || [];

  el.innerHTML = `
    <div class="chart-container">
      <div class="chart-title">Receita vs Despesas (Últimos 6 Meses)</div>
      <canvas id="chart-revenue" height="100"></canvas>
    </div>`;

  if (data.length === 0) { el.innerHTML += '<div class="empty-state"><span class="empty-state-icon">📊</span><p class="empty-state-title">Sem dados disponíveis</p></div>'; return; }

  const labels   = data.map(d => d.month || d.period || d.label);
  const received = data.map(d => parseFloat(d.received || d.revenue || 0));
  const expenses = data.map(d => parseFloat(d.expenses || d.expense || 0));

  const ctx = document.getElementById('chart-revenue').getContext('2d');
  reportsCharts['revenue'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receita', data: received, backgroundColor: 'rgba(64,145,108,0.8)', borderColor: '#40916c', borderWidth: 1 },
        { label: 'Despesas', data: expenses, backgroundColor: 'rgba(230,57,70,0.7)', borderColor: '#e63946', borderWidth: 1 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } }
      }
    }
  });
}

/* ----- PROFIT/LOSS ----- */
async function renderProfitReport(el) {
  const data = await api('GET', '/reports/profit') || {};
  const rows = Array.isArray(data) ? data : (data.rows || [data]);

  const tableRows = rows.map(r => {
    const profit = parseFloat(r.profit || 0);
    return `<tr>
      <td>${escapeHtml(r.month || r.period || formatDate(r.date))}</td>
      <td>${formatCurrency(r.revenue || r.received || 0)}</td>
      <td>${formatCurrency(r.expenses || 0)}</td>
      <td style="color:${profit >= 0 ? 'var(--primary)' : 'var(--danger)'};font-weight:700">${formatCurrency(profit)}</td>
      <td>${r.margin ? r.margin + '%' : '-'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="chart-container">
      <div class="chart-title">Resultado Financeiro por Mês</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Mês</th><th>Receita</th><th>Despesas</th><th>Lucro/Prejuízo</th><th>Margem</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

/* ----- OVERDUE ----- */
async function renderOverdueReport(el) {
  const data = await api('GET', '/reports/overdue') || [];

  const rows = Array.isArray(data) && data.length > 0 ? data.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.client_name || c.name || '-')}</strong></td>
      <td>${formatCurrency(c.amount || c.value || 0)}</td>
      <td>${formatDate(c.due_date)}</td>
      <td><span class="overdue-badge">${c.days_overdue || 0} dias</span></td>
      <td>${formatPhone(c.phone)}</td>
      <td>
        ${c.phone ? `<button class="btn btn-sm whatsapp-btn" onclick="openWhatsApp('${escapeHtml(c.phone)}','Olá ${escapeHtml(c.client_name || '')}! Verificamos uma cobrança em aberto. Poderia confirmar o pagamento?')">💬 Cobrar</button>` : ''}
      </td>
    </tr>`).join('')
  : '<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">✅</span><p class="empty-state-title">Nenhuma inadimplência!</p></div></td></tr>';

  const totalOverdue = Array.isArray(data) ? data.reduce((a, c) => a + parseFloat(c.amount || c.value || 0), 0) : 0;

  el.innerHTML = `
    <div class="stat-cards mb-2">
      <div class="stat-card red">
        <div class="stat-label">Total Inadimplente</div>
        <div class="stat-value">${formatCurrency(totalOverdue)}</div>
        <div class="stat-sub">${Array.isArray(data) ? data.length : 0} cobranças</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">Lista de Inadimplência</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Cliente</th><th>Valor</th><th>Vencimento</th><th>Atraso</th><th>Telefone</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ----- TOP CLIENTS ----- */
async function renderTopClientsReport(el) {
  const data = await api('GET', '/reports/top-clients') || [];

  const rows = Array.isArray(data) && data.length > 0 ? data.map((c, i) => `
    <tr>
      <td><span style="background:var(--primary-mid);color:#fff;padding:0.1rem 0.5rem;border-radius:999px;font-size:0.78rem;font-weight:700;">${i+1}º</span></td>
      <td><strong>${escapeHtml(c.client_name || c.name || '-')}</strong></td>
      <td>${formatCurrency(c.total_paid || c.revenue || 0)}</td>
      <td>${c.services_count || 0}</td>
      <td>${c.avg_rating ? `<span class="stars">${stars(c.avg_rating)}</span> ${parseFloat(c.avg_rating).toFixed(1)}` : '-'}</td>
    </tr>`).join('')
  : '<tr><td colspan="5"><div class="empty-state"><span class="empty-state-icon">⭐</span><p class="empty-state-title">Sem dados</p></div></td></tr>';

  el.innerHTML = `
    <div class="chart-container">
      <div class="chart-title">Top Clientes por Receita</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>#</th><th>Cliente</th><th>Receita Total</th><th>Serviços</th><th>Avaliação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ----- SERVICES PERFORMED ----- */
async function renderServicesReport(el) {
  const data = await api('GET', '/reports/services-performed') || {};

  el.innerHTML = `
    <div class="stat-cards mb-2">
      <div class="stat-card green">
        <div class="stat-label">Serviços Concluídos</div>
        <div class="stat-value">${data.completed || 0}</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Cancelados</div>
        <div class="stat-value">${data.canceled || 0}</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Total do Mês</div>
        <div class="stat-value">${data.total || 0}</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">Distribuição por Tipo</div>
      <canvas id="chart-services" height="80"></canvas>
    </div>`;

  const byType = data.by_type || [];
  if (byType.length > 0) {
    const ctx = document.getElementById('chart-services').getContext('2d');
    reportsCharts['services'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: byType.map(t => t.type === 'piscina' ? 'Piscina' : 'Jardinagem'),
        datasets: [{ data: byType.map(t => t.count), backgroundColor: ['#457b9d','#40916c'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
  }
}

/* ----- SATISFACTION ----- */
async function renderSatisfactionReport(el) {
  const data = await api('GET', '/reports/satisfaction') || {};

  const distribution = data.distribution || [];
  const avgRating    = parseFloat(data.avg_rating || 0).toFixed(1);

  el.innerHTML = `
    <div class="stat-cards mb-2">
      <div class="stat-card green">
        <div class="stat-label">Avaliação Média</div>
        <div class="stat-value">${avgRating} ★</div>
        <div class="stat-sub">${data.total_ratings || 0} avaliações</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">Distribuição de Avaliações</div>
      <canvas id="chart-satisfaction" height="80"></canvas>
    </div>`;

  if (distribution.length > 0) {
    const ctx = document.getElementById('chart-satisfaction').getContext('2d');
    reportsCharts['satisfaction'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['1 ★','2 ★','3 ★','4 ★','5 ★'],
        datasets: [{
          label: 'Quantidade',
          data: [1,2,3,4,5].map(s => (distribution.find(d => d.rating === s) || {}).count || 0),
          backgroundColor: ['#e63946','#f4a261','#ffd166','#a8dadc','#40916c']
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }
}

/* ----- AT RISK ----- */
async function renderAtRiskReport(el) {
  const data = await api('GET', '/reports/at-risk') || [];

  const rows = Array.isArray(data) && data.length > 0 ? data.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.client_name || c.name || '-')}</strong></td>
      <td>${escapeHtml(c.risk_reason || c.reason || '-')}</td>
      <td>${c.last_service ? formatDate(c.last_service) : '-'}</td>
      <td>${c.overdue_amount ? formatCurrency(c.overdue_amount) : '-'}</td>
      <td>
        ${c.phone ? `<button class="btn btn-sm whatsapp-btn" onclick="openWhatsApp('${escapeHtml(c.phone)}','Olá ${escapeHtml(c.client_name || '')}! Gostaríamos de verificar como está a satisfação com nossos serviços.')">💬</button>` : ''}
      </td>
    </tr>`).join('')
  : '<tr><td colspan="5"><div class="empty-state"><span class="empty-state-icon">✅</span><p class="empty-state-title">Nenhum cliente em risco</p></div></td></tr>';

  el.innerHTML = `
    <div class="chart-container">
      <div class="chart-title">Clientes em Risco de Churn</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Cliente</th><th>Motivo</th><th>Último Serviço</th><th>Valor em Aberto</th><th>Ação</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ----- TEAM PRODUCTIVITY ----- */
async function renderTeamReport(el) {
  const data = await api('GET', '/reports/team-productivity') || [];

  const rows = Array.isArray(data) && data.length > 0 ? data.map(e => `
    <tr>
      <td><strong>${escapeHtml(e.employee_name || e.name || '-')}</strong></td>
      <td>${e.services_done || 0}</td>
      <td>${e.services_canceled || 0}</td>
      <td>${e.avg_rating ? `<span class="stars">${stars(e.avg_rating)}</span> ${parseFloat(e.avg_rating).toFixed(1)}` : '-'}</td>
      <td>${formatCurrency(e.revenue_generated || 0)}</td>
    </tr>`).join('')
  : '<tr><td colspan="5"><div class="empty-state"><span class="empty-state-icon">👷</span><p class="empty-state-title">Sem dados</p></div></td></tr>';

  el.innerHTML = `
    <div class="chart-container">
      <div class="chart-title">Produtividade da Equipe</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Funcionário</th><th>Concluídos</th><th>Cancelados</th><th>Avaliação</th><th>Receita Gerada</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* ----- STOCK REPORT ----- */
async function renderStockReport(el) {
  const data = await api('GET', '/reports/stock') || [];

  const rows = Array.isArray(data) && data.length > 0 ? data.map(p => {
    const stockStatus = p.stock_status || (p.stock_quantity <= 0 ? 'critical' : p.stock_quantity <= p.min_stock ? 'low' : 'ok');
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.category || '-')}</td>
      <td>${p.stock_quantity ?? 0} ${escapeHtml(p.unit || '')}</td>
      <td>${p.min_stock ?? 0}</td>
      <td>${formatCurrency((p.stock_quantity || 0) * (p.cost_price || 0))}</td>
      <td><span class="badge badge-${stockStatus === 'ok' ? 'success' : stockStatus === 'low' ? 'warning' : 'danger'}">${stockStatus === 'ok' ? 'OK' : stockStatus === 'low' ? 'Baixo' : 'Crítico'}</span></td>
    </tr>`;
  }).join('')
  : '<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">📦</span><p class="empty-state-title">Sem dados</p></div></td></tr>';

  const totalValue = Array.isArray(data) ? data.reduce((a, p) => a + ((p.stock_quantity || 0) * (p.cost_price || 0)), 0) : 0;

  el.innerHTML = `
    <div class="stat-cards mb-2">
      <div class="stat-card blue">
        <div class="stat-label">Valor Total em Estoque</div>
        <div class="stat-value">${formatCurrency(totalValue)}</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">Situação do Estoque</div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
