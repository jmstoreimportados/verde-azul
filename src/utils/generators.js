// Gera servicos recorrentes para um cliente
async function generateRecurringServices(db, clientId, startDate) {
  const client = await db.prepare('SELECT * FROM clients WHERE id = $1').get(clientId);
  if (!client || client.frequency === 'ondemand') return;

  client.service_types = JSON.parse(client.service_types || '[]');
  const today = new Date(startDate);
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  const existing = await db.prepare("SELECT scheduled_date FROM services WHERE client_id = $1 AND status = 'scheduled'").all(clientId);
  const existingDates = new Set(existing.map(s => s.scheduled_date));

  const category = client.service_types.includes('pool') && client.service_types.includes('garden') ? 'both'
    : client.service_types.includes('pool') ? 'pool' : 'garden';

  let dates = [];
  const preferred = client.preferred_day;

  if (client.frequency === 'weekly') {
    let d = new Date(today);
    if (preferred !== null && preferred !== undefined) {
      while (d.getDay() !== preferred) d.setDate(d.getDate() + 1);
    }
    while (d <= endOfNextMonth) {
      dates.push(d.toISOString().split('T')[0]);
      d = new Date(d);
      d.setDate(d.getDate() + 7);
    }
  } else if (client.frequency === 'biweekly') {
    let d = new Date(today);
    if (preferred !== null && preferred !== undefined) {
      while (d.getDay() !== preferred) d.setDate(d.getDate() + 1);
    }
    while (d <= endOfNextMonth) {
      dates.push(d.toISOString().split('T')[0]);
      d = new Date(d);
      d.setDate(d.getDate() + 14);
    }
  } else if (client.frequency === 'monthly') {
    const months = [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
    for (const m of months) {
      let d;
      if (preferred !== null && preferred !== undefined) {
        d = new Date(m.getFullYear(), m.getMonth(), 1);
        while (d.getDay() !== preferred) d.setDate(d.getDate() + 1);
      } else {
        d = new Date(m.getFullYear(), m.getMonth(), today.getDate());
      }
      if (d >= today) dates.push(d.toISOString().split('T')[0]);
    }
  }

  const insertService = db.prepare(`INSERT INTO services (client_id, type, service_category, scheduled_date, status, employee_id, is_recurring, recurrence_group) VALUES ($1, $2, $3, $4, 'scheduled', $5, 1, $6)`);
  const groupId = `rec_${clientId}_${Date.now()}`;

  for (const date of dates) {
    if (!existingDates.has(date)) {
      await insertService.run(clientId, 'maintenance', category, date, client.responsible_employee_id || null, groupId);
    }
  }
}

// Gera cobranca mensal para um cliente
async function generateMonthlyCharge(db, clientId, month, year) {
  const client = await db.prepare("SELECT * FROM clients WHERE id = $1 AND status = 'active'").get(clientId);
  if (!client || !client.monthly_value) return;

  const now = new Date();
  const m = month !== undefined ? month : now.getMonth();
  const y = year !== undefined ? year : now.getFullYear();

  const dueDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(client.payment_day).padStart(2, '0')}`;

  const exists = await db.prepare("SELECT id FROM charges WHERE client_id = $1 AND due_date = $2 AND type = 'monthly'").get(clientId, dueDate);
  if (exists) return;

  const monthNames = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const description = `Mensalidade ${monthNames[m]}/${y}`;

  const pixCode = await generatePixCode(db, client.monthly_value);
  await db.prepare("INSERT INTO charges (client_id, description, type, value, due_date, status, pix_code) VALUES ($1, $2, 'monthly', $3, $4, 'pending', $5)").run(clientId, description, client.monthly_value, dueDate, pixCode);
}

// Gerar cobranças mensais para todos os clientes ativos
async function generateAllMonthlyCharges(db) {
  const now = new Date();
  const clients = await db.prepare("SELECT id FROM clients WHERE status = 'active'").all();
  for (const c of clients) {
    await generateMonthlyCharge(db, c.id, now.getMonth(), now.getFullYear());
  }
}

// Gerar agendamentos mensais para todos os clientes
async function generateAllMonthlyServices(db) {
  const clients = await db.prepare("SELECT * FROM clients WHERE status = 'active' AND frequency != 'ondemand'").all();
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const startDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  for (const c of clients) {
    await generateRecurringServices(db, c.id, startDate);
  }
}

// Atualizar cobranças vencidas
async function updateOverdueCharges(db) {
  const today = new Date().toISOString().split('T')[0];
  await db.prepare("UPDATE charges SET status = 'overdue' WHERE status = 'pending' AND due_date < $1").run(today);
}

// Gerar codigo PIX (formato EMV)
async function generatePixCode(db, value) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(s => settings[s.key] = s.value);

  const pixKey = settings.pix_key || '';
  if (!pixKey) return '';

  const holderName = (settings.pix_holder_name || 'Verde Azul').substring(0, 25);
  const city = 'SAO PAULO';
  const amount = value ? value.toFixed(2) : '';

  function emv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  }

  const gui = 'BR.GOV.BCB.PIX';
  const merchantAccount = emv('00', gui) + emv('01', pixKey);
  const merchant = emv('26', merchantAccount);

  let payload = emv('00', '01');
  payload += merchant;
  payload += emv('52', '0000');
  payload += emv('53', '986');
  if (amount) payload += emv('54', amount);
  payload += emv('58', 'BR');
  payload += emv('59', holderName);
  payload += emv('60', city);
  payload += emv('62', emv('05', '***'));
  payload += '6304';

  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  return payload + crc16(payload);
}

module.exports = { generateRecurringServices, generateMonthlyCharge, generateAllMonthlyCharges, generateAllMonthlyServices, updateOverdueCharges, generatePixCode };
