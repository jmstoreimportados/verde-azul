/* ============================================================
   CLIENTS MODULE
   ============================================================ */

let clientsData = [];
let clientsSearch = '';
let clientsStatusFilter = '';

async function loadClients() {
  const el = document.getElementById('clients-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    clientsData = await api('GET', '/clients') || [];
    renderClientsList();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Erro ao carregar clientes: ${escapeHtml(err.message)}</div>`;
  }
}

function renderClientsList() {
  const el = document.getElementById('clients-content');

  let filtered = clientsData;
  if (clientsSearch) {
    const q = clientsSearch.toLowerCase();
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }
  if (clientsStatusFilter) {
    filtered = filtered.filter(c => c.status === clientsStatusFilter);
  }

  const rows = filtered.length > 0 ? filtered.map(c => {
    const services = [c.has_pool && 'Piscina', c.has_garden && 'Jardim'].filter(Boolean).join(', ') || '-';
    const overdue  = c.overdue_count > 0 ? `<span class="overdue-badge">${c.overdue_count} atrasado(s)</span>` : '';
    return `<tr>
      <td><strong>${escapeHtml(c.name)}</strong>${overdue ? '<br>' + overdue : ''}</td>
      <td>${formatPhone(c.phone)}</td>
      <td>${services}</td>
      <td>${escapeHtml(c.frequency || '-')}</td>
      <td>${escapeHtml(c.plan_type || '-')}</td>
      <td>${statusBadge(c.status || 'ativo')}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-sm btn-outline client-view" data-id="${c.id}" title="Ver detalhes">👁️</button>
          <button class="btn btn-sm btn-primary client-edit" data-id="${c.id}" title="Editar">✏️</button>
          ${c.whatsapp || c.phone ? `<button class="btn btn-sm whatsapp-btn client-wa" data-phone="${escapeHtml(c.whatsapp || c.phone)}" title="WhatsApp">💬</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="7"><div class="empty-state"><span class="empty-state-icon">👥</span><p class="empty-state-title">Nenhum cliente encontrado</p></div></td></tr>`;

  el.innerHTML = `
    <div class="section-header">
      <div class="section-title">Clientes (${filtered.length})</div>
      <button class="btn btn-primary" id="client-new-btn">+ Novo Cliente</button>
    </div>
    <div class="toolbar">
      <input type="text" class="search-input" id="clients-search" placeholder="Buscar por nome, telefone..." value="${escapeHtml(clientsSearch)}" />
      <select class="filter-select" id="clients-status-filter">
        <option value="">Todos os status</option>
        <option value="ativo"    ${clientsStatusFilter === 'ativo'    ? 'selected' : ''}>Ativo</option>
        <option value="inativo"  ${clientsStatusFilter === 'inativo'  ? 'selected' : ''}>Inativo</option>
        <option value="suspenso" ${clientsStatusFilter === 'suspenso' ? 'selected' : ''}>Suspenso</option>
      </select>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Telefone</th>
            <th>Serviços</th>
            <th>Frequência</th>
            <th>Plano</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('client-new-btn').addEventListener('click', () => openClientForm(null));
  document.getElementById('clients-search').addEventListener('input', e => {
    clientsSearch = e.target.value;
    renderClientsList();
  });
  document.getElementById('clients-status-filter').addEventListener('change', e => {
    clientsStatusFilter = e.target.value;
    renderClientsList();
  });

  document.querySelectorAll('.client-view').forEach(btn => {
    btn.addEventListener('click', () => openClientDetail(btn.dataset.id));
  });
  document.querySelectorAll('.client-edit').forEach(btn => {
    btn.addEventListener('click', () => openClientForm(btn.dataset.id));
  });
  document.querySelectorAll('.client-wa').forEach(btn => {
    btn.addEventListener('click', () => {
      openWhatsApp(btn.dataset.phone, 'Olá! Entrando em contato da Verde & Azul Gestão.');
    });
  });
}

function clientFormHTML(c) {
  c = c || {};
  return `
    <div class="form-section-title">Dados Pessoais</div>
    <div class="form-row">
      <div class="form-group">
        <label>Nome *</label>
        <input type="text" id="cf-name" value="${escapeHtml(c.name || '')}" required placeholder="Nome completo" />
      </div>
      <div class="form-group">
        <label>CPF</label>
        <input type="text" id="cf-cpf" value="${escapeHtml(c.cpf || '')}" placeholder="000.000.000-00" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Telefone</label>
        <input type="text" id="cf-phone" value="${escapeHtml(c.phone || '')}" placeholder="(00) 00000-0000" />
      </div>
      <div class="form-group">
        <label>WhatsApp</label>
        <input type="text" id="cf-whatsapp" value="${escapeHtml(c.whatsapp || '')}" placeholder="(00) 00000-0000" />
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" id="cf-email" value="${escapeHtml(c.email || '')}" placeholder="email@exemplo.com" />
      </div>
    </div>

    <div class="form-section-title">Endereço</div>
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Logradouro</label>
        <input type="text" id="cf-street" value="${escapeHtml(c.street || c.address || '')}" placeholder="Rua, Avenida..." />
      </div>
      <div class="form-group">
        <label>Número</label>
        <input type="text" id="cf-number" value="${escapeHtml(c.number || '')}" placeholder="123" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Complemento</label>
        <input type="text" id="cf-complement" value="${escapeHtml(c.complement || '')}" placeholder="Apto, Bloco..." />
      </div>
      <div class="form-group">
        <label>Bairro</label>
        <input type="text" id="cf-neighborhood" value="${escapeHtml(c.neighborhood || '')}" placeholder="Bairro" />
      </div>
      <div class="form-group">
        <label>Cidade</label>
        <input type="text" id="cf-city" value="${escapeHtml(c.city || '')}" placeholder="Cidade" />
      </div>
      <div class="form-group">
        <label>Estado</label>
        <input type="text" id="cf-state" value="${escapeHtml(c.state || '')}" placeholder="SP" maxlength="2" />
      </div>
    </div>

    <div class="form-section-title">Contato Secundário</div>
    <div class="form-row">
      <div class="form-group">
        <label>Nome</label>
        <input type="text" id="cf-sec-name" value="${escapeHtml(c.secondary_contact_name || '')}" placeholder="Nome do contato" />
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="text" id="cf-sec-phone" value="${escapeHtml(c.secondary_contact_phone || '')}" placeholder="(00) 00000-0000" />
      </div>
      <div class="form-group">
        <label>Relação</label>
        <input type="text" id="cf-sec-rel" value="${escapeHtml(c.secondary_contact_relation || '')}" placeholder="Ex: Cônjuge, Filho..." />
      </div>
    </div>

    <div class="form-section-title">Serviços e Plano</div>
    <div class="form-row">
      <div class="form-group">
        <label>Serviços</label>
        <div class="form-check">
          <input type="checkbox" id="cf-pool" ${c.has_pool ? 'checked' : ''} />
          <label for="cf-pool">Piscina</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="cf-garden" ${c.has_garden ? 'checked' : ''} />
          <label for="cf-garden">Jardinagem</label>
        </div>
      </div>
      <div class="form-group">
        <label>Frequência</label>
        <select id="cf-frequency">
          <option value="">Selecione</option>
          ${['Semanal','Quinzenal','Mensal','Sob Demanda'].map(f =>
            `<option value="${f}" ${c.frequency === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Dia Preferencial</label>
        <select id="cf-preferred-day">
          <option value="">Sem preferência</option>
          ${['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map(d =>
            `<option value="${d}" ${c.preferred_day === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Tipo de Plano</label>
        <select id="cf-plan-type">
          <option value="">Selecione</option>
          ${['Básico','Completo','Premium','Personalizado'].map(p =>
            `<option value="${p}" ${c.plan_type === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Valor Mensal (R$)</label>
        <input type="number" id="cf-monthly-value" value="${c.monthly_value || ''}" min="0" step="0.01" placeholder="0,00" />
      </div>
      <div class="form-group">
        <label>Dia de Pagamento</label>
        <input type="number" id="cf-payment-day" value="${c.payment_day || ''}" min="1" max="31" placeholder="Ex: 10" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Funcionário Responsável</label>
        <input type="text" id="cf-employee" value="${escapeHtml(c.employee_name || c.employee || '')}" placeholder="Nome do funcionário" />
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="cf-status">
          ${['ativo','inativo','suspenso'].map(s =>
            `<option value="${s}" ${(c.status || 'ativo') === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Observações</label>
      <textarea id="cf-notes" rows="3" placeholder="Observações gerais sobre o cliente...">${escapeHtml(c.notes || '')}</textarea>
    </div>`;
}

function getClientFormData() {
  return {
    name:                       document.getElementById('cf-name').value.trim(),
    cpf:                        document.getElementById('cf-cpf').value.trim(),
    phone:                      document.getElementById('cf-phone').value.trim(),
    whatsapp:                   document.getElementById('cf-whatsapp').value.trim(),
    email:                      document.getElementById('cf-email').value.trim(),
    street:                     document.getElementById('cf-street').value.trim(),
    number:                     document.getElementById('cf-number').value.trim(),
    complement:                 document.getElementById('cf-complement').value.trim(),
    neighborhood:               document.getElementById('cf-neighborhood').value.trim(),
    city:                       document.getElementById('cf-city').value.trim(),
    state:                      document.getElementById('cf-state').value.trim(),
    secondary_contact_name:     document.getElementById('cf-sec-name').value.trim(),
    secondary_contact_phone:    document.getElementById('cf-sec-phone').value.trim(),
    secondary_contact_relation: document.getElementById('cf-sec-rel').value.trim(),
    has_pool:                   document.getElementById('cf-pool').checked,
    has_garden:                 document.getElementById('cf-garden').checked,
    frequency:                  document.getElementById('cf-frequency').value,
    preferred_day:              document.getElementById('cf-preferred-day').value,
    plan_type:                  document.getElementById('cf-plan-type').value,
    monthly_value:              parseFloat(document.getElementById('cf-monthly-value').value) || 0,
    payment_day:                parseInt(document.getElementById('cf-payment-day').value) || null,
    employee:                   document.getElementById('cf-employee').value.trim(),
    status:                     document.getElementById('cf-status').value,
    notes:                      document.getElementById('cf-notes').value.trim()
  };
}

async function openClientForm(clientId) {
  let client = null;
  if (clientId) {
    try {
      client = await api('GET', `/clients/${clientId}`);
    } catch { client = clientsData.find(c => String(c.id) === String(clientId)); }
  }

  const title = client ? 'Editar Cliente' : 'Novo Cliente';
  openModal(title, clientFormHTML(client), `
    <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" id="save-client-btn">${client ? 'Salvar Alterações' : 'Cadastrar'}</button>
  `, 'lg');

  document.getElementById('save-client-btn').addEventListener('click', async () => {
    const data = getClientFormData();
    if (!data.name) { toast('Nome é obrigatório', 'warning'); return; }
    try {
      if (client) {
        await api('PUT', `/clients/${client.id}`, data);
        toast('Cliente atualizado!', 'success');
      } else {
        await api('POST', '/clients', data);
        toast('Cliente cadastrado!', 'success');
      }
      closeModal();
      loadClients();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    }
  });
}

async function openClientDetail(clientId) {
  let client;
  try {
    client = await api('GET', `/clients/${clientId}`);
  } catch {
    client = clientsData.find(c => String(c.id) === String(clientId));
  }
  if (!client) { toast('Cliente não encontrado', 'error'); return; }

  const services = [client.has_pool && 'Piscina', client.has_garden && 'Jardim'].filter(Boolean).join(', ') || '-';
  const addr = [client.street, client.number, client.complement, client.neighborhood, client.city, client.state]
    .filter(Boolean).join(', ') || '-';

  const content = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
      <div>
        <div class="form-section-title">Dados Pessoais</div>
        <p><strong>Nome:</strong> ${escapeHtml(client.name)}</p>
        <p><strong>CPF:</strong> ${escapeHtml(client.cpf || '-')}</p>
        <p><strong>Telefone:</strong> ${formatPhone(client.phone)}</p>
        <p><strong>WhatsApp:</strong> ${formatPhone(client.whatsapp)}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(client.email || '-')}</p>
        <p><strong>Endereço:</strong> ${escapeHtml(addr)}</p>
        <br/>
        <div class="form-section-title">Contato Secundário</div>
        <p><strong>Nome:</strong> ${escapeHtml(client.secondary_contact_name || '-')}</p>
        <p><strong>Telefone:</strong> ${formatPhone(client.secondary_contact_phone)}</p>
        <p><strong>Relação:</strong> ${escapeHtml(client.secondary_contact_relation || '-')}</p>
      </div>
      <div>
        <div class="form-section-title">Serviços e Plano</div>
        <p><strong>Serviços:</strong> ${services}</p>
        <p><strong>Frequência:</strong> ${escapeHtml(client.frequency || '-')}</p>
        <p><strong>Dia Preferencial:</strong> ${escapeHtml(client.preferred_day || '-')}</p>
        <p><strong>Plano:</strong> ${escapeHtml(client.plan_type || '-')}</p>
        <p><strong>Valor Mensal:</strong> ${formatCurrency(client.monthly_value || 0)}</p>
        <p><strong>Dia Pagamento:</strong> ${client.payment_day || '-'}</p>
        <p><strong>Funcionário:</strong> ${escapeHtml(client.employee_name || client.employee || '-')}</p>
        <p><strong>Status:</strong> ${statusBadge(client.status || 'ativo')}</p>
        <br/>
        <div class="form-section-title">Observações</div>
        <p>${escapeHtml(client.notes || 'Sem observações.')}</p>
      </div>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
    ${client.whatsapp || client.phone ? `<button class="btn whatsapp-btn" onclick="openWhatsApp('${escapeHtml(client.whatsapp || client.phone)}', 'Olá ${escapeHtml(client.name)}!')">💬 WhatsApp</button>` : ''}
    <button class="btn btn-outline-accent" onclick="generateContract(${client.id})">📄 Gerar Contrato</button>
    <button class="btn btn-primary" onclick="closeModal(); openClientForm(${client.id})">✏️ Editar</button>`;

  openModal(`Cliente: ${client.name}`, content, footer, 'lg');
}

async function generateContract(clientId) {
  try {
    const res = await api('GET', `/clients/${clientId}/contract/generate`);
    if (res && res.url) {
      window.open(res.url, '_blank');
    } else {
      toast('Contrato gerado! Verifique o servidor.', 'success');
    }
  } catch (err) {
    toast('Erro ao gerar contrato: ' + err.message, 'error');
  }
}
