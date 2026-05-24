const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateAllMonthlyCharges, updateOverdueCharges, generatePixCode } = require('../utils/generators');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

// Helper: build date range filter for Supabase using gte/lte on date prefix
// Supabase doesn't support LIKE on text, but dates are stored as text YYYY-MM-DD
// We can use gte/lte for ranges, and for month we use gte(YYYY-MM-01) lte(YYYY-MM-31)
function monthRange(year, month) {
  const m = String(month).padStart(2, '0');
  return { gte: `${year}-${m}-01`, lte: `${year}-${m}-31` };
}

// Listar cobranças
router.get('/charges', authenticate, async (req, res) => {
  try {
    const { status, client_id, type, month, year, start_date, end_date } = req.query;
    await updateOverdueCharges();

    let query = supabase
      .from('charges')
      .select('*, clients(name, whatsapp)')
      .order('due_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (client_id) query = query.eq('client_id', client_id);
    if (type) query = query.eq('type', type);

    if (month && year) {
      const { gte, lte } = monthRange(year, month);
      query = query.gte('due_date', gte).lte('due_date', lte);
    } else {
      if (start_date) query = query.gte('due_date', start_date);
      if (end_date) query = query.lte('due_date', end_date);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json((data || []).map(ch => ({
      ...ch,
      client_name: ch.clients?.name,
      whatsapp: ch.clients?.whatsapp,
      clients: undefined
    })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Resumo financeiro do mes
router.get('/summary', authenticate, async (req, res) => {
  try {
    await updateOverdueCharges();
    const now = new Date();
    const { gte, lte } = monthRange(now.getFullYear(), now.getMonth() + 1);
    const today = now.toISOString().split('T')[0];
    const in3days = new Date(now);
    in3days.setDate(in3days.getDate() + 3);
    const in3str = in3days.toISOString().split('T')[0];

    const { data: receivedData } = await supabase.rpc('get_financial_summary', {
      month_start: gte,
      month_end: lte,
      today_date: today,
      in3_date: in3str
    });

    // Fallback: compute individually if RPC not available
    const { data: paidCharges } = await supabase
      .from('charges')
      .select('value')
      .eq('status', 'paid')
      .gte('due_date', gte).lte('due_date', lte);

    const { data: pendingCharges } = await supabase
      .from('charges')
      .select('value')
      .eq('status', 'pending')
      .gte('due_date', gte).lte('due_date', lte);

    const { data: overdueCharges } = await supabase
      .from('charges')
      .select('value')
      .eq('status', 'overdue');

    const { count: dueIn3Count } = await supabase
      .from('charges')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('due_date', today)
      .lte('due_date', in3str);

    const { count: activeClients } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { data: ratingData } = await supabase
      .from('services')
      .select('rating')
      .not('rating', 'is', null)
      .gte('completed_date', gte).lte('completed_date', lte);

    const { count: servicesCount } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_date', gte).lte('completed_date', lte);

    const { data: expensesData } = await supabase
      .from('expenses')
      .select('value')
      .gte('date', gte).lte('date', lte);

    const monthReceived = (paidCharges || []).reduce((s, c) => s + parseFloat(c.value), 0);
    const monthPending = (pendingCharges || []).reduce((s, c) => s + parseFloat(c.value), 0);
    const overdueTotal = (overdueCharges || []).reduce((s, c) => s + parseFloat(c.value), 0);
    const expenses = (expensesData || []).reduce((s, c) => s + parseFloat(c.value), 0);
    const ratings = (ratingData || []).map(r => r.rating);
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

    res.json({
      month_received: monthReceived,
      month_pending: monthPending,
      month_profit: monthReceived - expenses,
      overdue_total: overdueTotal,
      overdue_count: (overdueCharges || []).length,
      due_in_3_days: dueIn3Count || 0,
      active_clients: activeClients || 0,
      avg_rating: avgRating,
      services_this_month: servicesCount || 0
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Alertas de vencimento
router.get('/alerts', authenticate, async (req, res) => {
  try {
    await updateOverdueCharges();
    const today = new Date().toISOString().split('T')[0];
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const in3str = in3days.toISOString().split('T')[0];

    const { data: dueIn3, error: e1 } = await supabase
      .from('charges')
      .select('*, clients(name, whatsapp)')
      .eq('status', 'pending')
      .gte('due_date', today)
      .lte('due_date', in3str)
      .order('due_date');

    const { data: overdueList, error: e2 } = await supabase
      .from('charges')
      .select('*, clients(name, whatsapp)')
      .eq('status', 'overdue')
      .order('due_date');

    if (e1) throw e1;
    if (e2) throw e2;

    const flatten = (arr) => (arr || []).map(ch => ({
      ...ch,
      client_name: ch.clients?.name,
      whatsapp: ch.clients?.whatsapp,
      clients: undefined
    }));

    res.json({ due_in_3_days: flatten(dueIn3), overdue: flatten(overdueList) });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Criar cobrança manual
router.post('/charges', authenticate, async (req, res) => {
  try {
    const { client_id, description, type, value, due_date, notes } = req.body;
    if (!client_id || !value || !due_date) return res.status(400).json({ error: 'Campos obrigatorios' });

    const pixCode = await generatePixCode(value);
    const { data, error } = await supabase
      .from('charges')
      .insert({
        client_id, description: description || 'Cobranca avulsa',
        type: type || 'extra', value, due_date, notes: notes || null, pix_code: pixCode
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Cobranca criada' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Baixar pagamento
router.post('/charges/:id/pay', authenticate, async (req, res) => {
  try {
    const { paid_date, payment_method } = req.body;
    const { error } = await supabase
      .from('charges')
      .update({
        status: 'paid',
        paid_date: paid_date || new Date().toISOString().split('T')[0],
        payment_method: payment_method || 'pix'
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Pagamento registrado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Link WhatsApp de cobranca
router.get('/charges/:id/whatsapp', authenticate, async (req, res) => {
  try {
    const { data: charge, error } = await supabase
      .from('charges')
      .select('*, clients(name, whatsapp)')
      .eq('id', req.params.id)
      .single();

    if (error || !charge) return res.status(404).json({ error: 'Cobranca nao encontrada' });

    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach(s => settings[s.key] = s.value);

    const dueDate = new Date(charge.due_date).toLocaleDateString('pt-BR');
    const clientName = charge.clients?.name || '';
    const whatsapp = charge.clients?.whatsapp?.replace(/\D/g, '');

    let msg = (settings.whatsapp_template_charge || 'Ola {nome}! Cobranca de R$ {valor} vence em {vencimento}. PIX: {pix_chave}')
      .replace('{nome}', clientName)
      .replace('{servico}', charge.description)
      .replace('{valor}', Number(charge.value).toFixed(2).replace('.', ','))
      .replace('{vencimento}', dueDate)
      .replace('{pix_chave}', settings.pix_key || '');

    if (charge.pix_code) msg += `\n\nCodigo PIX Copia e Cola:\n${charge.pix_code}`;

    const waLink = `https://wa.me/55${whatsapp}?text=${encodeURIComponent(msg)}`;
    await supabase.from('message_log').insert({ client_id: charge.client_id, type: 'charge', message: msg });

    res.json({ wa_link: waLink, message: msg, pix_code: charge.pix_code });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Gerar cobranças mensais
router.post('/generate-monthly', authenticate, async (req, res) => {
  try {
    await generateAllMonthlyCharges();
    res.json({ message: 'Cobranças mensais geradas' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Despesas
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = supabase.from('expenses').select('*').order('date', { ascending: false });

    if (month && year) {
      const { gte, lte } = monthRange(year, month);
      query = query.gte('date', gte).lte('date', lte);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/expenses', authenticate, async (req, res) => {
  try {
    const { description, category, value, date, notes } = req.body;
    if (!description || !value || !date) return res.status(400).json({ error: 'Campos obrigatorios' });

    const { data, error } = await supabase
      .from('expenses')
      .insert({ description, category: category || 'operational', value, date, notes: notes || null })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Despesa registrada' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.delete('/expenses/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Despesa removida' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
