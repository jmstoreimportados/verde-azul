/* ============================================================
   DASHBOARD MODULE
   ============================================================ */

async function loadDashboard() {
  const el = document.getElementById('dashboard-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const [summary, todayServices, alerts, stockAlerts] = await Promise.allSettled([
      api('GET', '/financial/summary'),
      api('GET', '/services/today'),
      api('GET', '/financial/alerts'),
      api('GET', '/products/status/alerts')
    ]);

    const s  = summary.value       || {};
    const ts = todayServices.value || [];
    const al = alerts.value        || {};
    const sa = stockAlerts.value   || [];

    el.innerHTML = renderDashboard(s, ts, al, sa);
    attachDashboardEvents();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar dashboard: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDashboard(s, todayServices, alerts, stockAlerts) {
  const charges       = alerts.charges_due_soon || [];
  const overdue       = alerts.overdue           || [];
  const lowStock      = stockAlerts.filter ? stockAlerts.filter(p => p.stock_status !== 'ok') : [];

  const received   = formatCurrency(s.received   || 0);
  const pending    = formatCurrency(s.pending    || 0);
  const overdueTot = formatCurrency(s.overdue    || 0);
  const active     = s.active_clients            || 0;
  const avgRating  = parseFloat(s.avg_rating     || 0).toFixed(1);
  const todayCount = Array.isArray(todayServices) ? todayServices.length : 0;

  let alertBanners = '';

  if (charges.length > 0) {
    alertBanners += `<div class="alert alert-warning">
      ⚠️ <strong>${charges.length} cobrança(s)</strong> vencem nos próximos 3 dias.
      <a href="#" onclick="navigate('financial'); return false;" style="color:inherit; text-decoration:underline; margin-left:8px;">Ver cobranças</a>
    </div>`;
  }

  if (overdue.length > 0) {
    alertBanners += `<div class="alert alert-danger">
      🔴 <strong>${overdue.length} cobrança(s) vencida(s)</strong> em aberto — total: ${formatCurrency(s.overdue || 0)}.
      <a href="#" onclick="navigate('financial'); return false;" style="color:inherit; text-decoration:underline; margin-left:8px;">Ver inadimplência</a>
    </div>`;
  }

  if (lowStock.length > 0) {
    alertBanners += `<div class="alert alert-warning">
      📦 <strong>${lowStock.length} produto(s)</strong> com estoque baixo ou crítico.
      <a href="#" onclick="navigate('products'); return false;" style="color:inherit; text-decoration:underline; margin-left:8px;">Ver estoque</a>
    </div>`;
  }

  const servicesRows = Array.isArray(todayServices) && todayServices.length > 0
    ? todayServices.map(sv => `
      <tr>
        <td><strong>${escapeHtml(sv.client_name || sv.client || '-')}</strong></td>
        <td>${escapeHtml(sv.address || sv.client_address || '-')}</td>
        <td>${statusBadge(sv.type || sv.service_type || 'jardinagem')}</td>
        <td>${escapeHtml(sv.employee_name || sv.employee || '-')}</td>
        <td>${statusBadge(sv.status || 'agendado')}</td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-sm btn-secondary dash-arriving" data-id="${sv.id}" data-phone="${escapeHtml(sv.client_phone || '')}" title="Notificar chegada">📍 A Caminho</button>
            ${sv.status !== 'concluido' ? `<button class="btn btn-sm btn-success dash-complete" data-id="${sv.id}" title="Marcar concluído">✅ Concluir</button>` : ''}
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state"><span class="empty-state-icon">📅</span><p class="empty-state-title">Nenhum serviço hoje</p></div></td></tr>`;

  return `
    <div class="mb-3">${alertBanners}</div>

    <div class="stat-cards">
      <div class="stat-card green">
        <div class="stat-label">Receita do Mês</div>
        <div class="stat-value">${received}</div>
        <div class="stat-sub">Recebido</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Pendente</div>
        <div class="stat-value">${pending}</div>
        <div class="stat-sub">A receber</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Inadimplência</div>
        <div class="stat-value">${overdueTot}</div>
        <div class="stat-sub">${overdue.length} cobranças vencidas</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Clientes Ativos</div>
        <div class="stat-value">${active}</div>
        <div class="stat-sub">cadastrados</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Avaliação Média</div>
        <div class="stat-value">${avgRating}</div>
        <div class="stat-sub">★ de 5.0</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Serviços Hoje</div>
        <div class="stat-value">${todayCount}</div>
        <div class="stat-sub">agendados</div>
      </div>
    </div>

    <div class="card">
      <div class="section-header">
        <div class="card-title">Serviços de Hoje</div>
        <button class="btn btn-sm btn-outline" onclick="navigate('agenda')">Ver Agenda Completa</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Endereço</th>
              <th>Tipo</th>
              <th>Funcionário</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${servicesRows}</tbody>
        </table>
      </div>
    </div>`;
}

function attachDashboardEvents() {
  document.querySelectorAll('.dash-arriving').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.id;
      const phone = btn.dataset.phone;
      try {
        const res = await api('POST', `/services/${id}/notify-arrival`);
        const msg = res && res.message ? res.message : 'Estou a caminho para realizar o serviço. Em breve estarei aí!';
        if (phone) {
          openWhatsApp(phone, msg);
        } else {
          toast(msg, 'info');
        }
      } catch (err) {
        toast('Erro ao enviar notificação: ' + err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.dash-complete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      openCompleteServiceModal(id, loadDashboard);
    });
  });
}

function openCompleteServiceModal(serviceId, onSuccess) {
  const content = `
    <div class="form-group">
      <label>Observações</label>
      <textarea id="complete-notes" rows="3" placeholder="Observações do serviço..."></textarea>
    </div>
    <div class="form-group">
      <label>Cobrança Extra</label>
      <input type="number" id="complete-extra" placeholder="0,00" min="0" step="0.01" />
    </div>`;

  openModal('Concluir Serviço', content, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" id="confirm-complete-btn">✅ Concluir</button>
  `, 'sm');

  document.getElementById('confirm-complete-btn').addEventListener('click', async () => {
    const notes = document.getElementById('complete-notes').value;
    const extra = parseFloat(document.getElementById('complete-extra').value) || 0;
    try {
      await api('POST', `/services/${serviceId}/complete`, { notes, extra_charge: extra, status: 'concluido' });
      toast('Serviço concluído!', 'success');
      closeModal();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  });
}
