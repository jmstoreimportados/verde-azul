const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name');
    if (error) throw error;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`;

    for (const e of (data || [])) {
      const { data: svcs } = await supabase
        .from('services')
        .select('rating')
        .eq('employee_id', e.id)
        .eq('status', 'completed')
        .gte('completed_date', monthStart)
        .lte('completed_date', monthEnd);

      const ratings = (svcs || []).map(s => s.rating).filter(r => r !== null);
      e.services_this_month = (svcs || []).length;
      e.avg_rating = ratings.length > 0
        ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
        : null;
    }
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, phone, email, function: func, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });

    const { data, error } = await supabase
      .from('employees')
      .insert({ name, phone: phone || null, email: email || null, function: func || null, notes: notes || null })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Funcionario cadastrado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, email, function: func, status, notes } = req.body;
    const { error } = await supabase
      .from('employees')
      .update({ name, phone: phone || null, email: email || null, function: func || null, status: status || 'active', notes: notes || null })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Funcionario atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/:id/schedule', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = supabase
      .from('services')
      .select('*, clients(name, address, neighborhood)')
      .eq('employee_id', req.params.id)
      .neq('status', 'cancelled')
      .order('scheduled_date');

    if (month && year) {
      query = query
        .gte('scheduled_date', `${year}-${String(month).padStart(2,'0')}-01`)
        .lte('scheduled_date', `${year}-${String(month).padStart(2,'0')}-31`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json((data || []).map(s => ({
      ...s,
      client_name: s.clients?.name,
      address: s.clients?.address,
      neighborhood: s.clients?.neighborhood,
      clients: undefined
    })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
