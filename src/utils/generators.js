/**
 * generators.js — Utility functions for recurring service and charge generation
 * Rewritten to use @supabase/supabase-js directly (no db wrapper)
 */
const { supabase } = require('../../database/db');

// Gera servicos recorrentes para um cliente
async function generateRecurringServices(clientId, startDate) {
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error || !client || client.frequency === 'ondemand') return;

  client.service_types = JSON.parse(client.service_types || '[]');
  const today = new Date(startDate);
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

  const { data: existing } = await supabase
    .from('services')
    .select('scheduled_date')
    .eq('client_id', clientId)
    .eq('status', 'scheduled');

  const existingDates = new Set((existing || []).map(s => s.scheduled_date));

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
    const months = [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 1)
    ];
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

  const groupId = `rec_${clientId}_${Date.now()}`;
  for (const date of dates) {
    if (!existingDates.has(date)) {
      await supabase.from('services').insert({
        client_id: clientId, type: 'maintenance', service_category: category,
        scheduled_date: date, status: 'scheduled',
        employee_id: client.responsible_employee_id || null,
        is_recurring: 1, recurrence_group: groupId
      });
    }
  }
}

// Gera cobranca mensal para um cliente
async function generateMonthlyCharge(clientId, month, year) {
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('status', 'active')
    .single();

  if (error || !client || !client.monthly_value) return;

  const now = new Date();
  const m = month !== undefined ? month : now.getMonth();
  const y = year !== undefined ? year : now.getFullYear();

  const dueDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(client.payment_day).padStart(2, '0')}`;

  const { data: exists } = await supabase
    .from('charges')
    .select('id')
    .eq('client_id', clientId)
    .eq('due_date', dueDate)
    .eq('type', 'monthly')
    .maybeSingle();

  if (exists) return;

  const monthNames = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const description = `Mensalidade ${monthNames[m]}/${y}`;
  const pixCode = await generatePixCode(client.monthly_value);

  await supabase.from('charges').insert({
    client_id: clientId, description, type: 'monthly',
    value: client.monthly_value, due_date: dueDate,
    status: 'pending', pix_code: pixCode
  });
}

// Gerar cobranças mensais para todos os clientes ativos
async function generateAllMonthlyCharges() {
  const now = new Date();
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('status', 'active');

  for (const c of (clients || [])) {
    await generateMonthlyCharge(c.id, now.getMonth(), now.getFullYear());
  }
}

// Gerar agendamentos mensais para todos os clientes
async function generateAllMonthlyServices() {
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active')
    .neq('frequency', 'ondemand');

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const startDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

  for (const c of (clients || [])) {
    await generateRecurringServices(c.id, startDate);
  }
}

// Atualizar cobranças vencidas
async function updateOverdueCharges() {
  const today = new Date().toISOString().split('T')[0];
  await supabase
    .from('charges')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today);
}

// Gerar codigo PIX (formato EMV)
async function generatePixCode(value) {
  const { data: rows } = await supabase.from('settings').select('key, value');
  const settings = {};
  (rows || []).forEach(s => settings[s.key] = s.value);

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

module.exports = {
  generateRecurringServices,
  generateMonthlyCharge,
  generateAllMonthlyCharges,
  generateAllMonthlyServices,
  updateOverdueCharges,
  generatePixCode
};
