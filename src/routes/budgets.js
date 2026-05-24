const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateRecurringServices, generateMonthlyCharge } = require('../utils/generators');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json((data || []).map(b => ({ ...b, services: JSON.parse(b.services || '[]') })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { prospect_name, prospect_phone, prospect_email, prospect_address, services, total_value, valid_until, notes } = req.body;
    if (!prospect_name || !prospect_phone) return res.status(400).json({ error: 'Nome e telefone obrigatorios' });

    const { data, error } = await supabase
      .from('budgets')
      .insert({
        prospect_name, prospect_phone, prospect_email: prospect_email || null,
        prospect_address: prospect_address || null, services: JSON.stringify(services || []),
        total_value: total_value || 0, valid_until: valid_until || null, notes: notes || null
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Orcamento criado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const updateData = { status };
    const timestampFields = { sent: 'sent_at', approved: 'responded_at', rejected: 'responded_at' };
    if (timestampFields[status]) {
      updateData[timestampFields[status]] = new Date().toISOString();
    }

    const { error } = await supabase.from('budgets').update(updateData).eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Status atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/:id/convert', authenticate, async (req, res) => {
  try {
    const { data: budget, error: fetchErr } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !budget) return res.status(404).json({ error: 'Orcamento nao encontrado' });

    const services = JSON.parse(budget.services || '[]');
    const serviceTypes = [...new Set(services.map(s => s.category || 'pool'))];
    const today = new Date().toISOString().split('T')[0];

    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: budget.prospect_name, phone: budget.prospect_phone, whatsapp: budget.prospect_phone,
        address: budget.prospect_address || '', service_types: JSON.stringify(serviceTypes),
        frequency: services[0]?.frequency || 'monthly', monthly_value: budget.total_value,
        payment_day: 10, start_date: today, status: 'active'
      })
      .select('id')
      .single();

    if (clientErr) throw clientErr;
    const clientId = client.id;

    await supabase.from('budgets').update({ status: 'converted' }).eq('id', req.params.id);
    await generateRecurringServices(clientId, today);
    if (budget.total_value > 0) await generateMonthlyCharge(clientId);

    res.json({ id: clientId, message: 'Cliente criado a partir do orcamento' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/:id/whatsapp', authenticate, async (req, res) => {
  try {
    const { data: budget, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !budget) return res.status(404).json({ error: 'Nao encontrado' });

    const services = JSON.parse(budget.services || '[]');
    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach(s => settings[s.key] = s.value);

    const servicesText = services.map(s => `* ${s.description}: R$ ${Number(s.value||0).toFixed(2).replace('.',',')}`).join('\n');
    const validDate = budget.valid_until ? new Date(budget.valid_until).toLocaleDateString('pt-BR') : '7 dias';
    const msg = `Ola ${budget.prospect_name}! Segue o orcamento da ${settings.company_name || 'Verde & Azul'}:\n\n${servicesText}\n\n*Total mensal: R$ ${Number(budget.total_value).toFixed(2).replace('.',',')}*\n\nValido ate: ${validDate}\n\nQualquer duvida estamos a disposicao!`;
    const wa = budget.prospect_phone.replace(/\D/g,'');
    const waLink = `https://wa.me/55${wa}?text=${encodeURIComponent(msg)}`;

    await supabase.from('budgets').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', budget.id);
    res.json({ wa_link: waLink, message: msg });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
