const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateAllMonthlyCharges, updateOverdueCharges, generatePixCode } = require('../utils/generators');
const router = express.Router();

// Listar cobranças
router.get('/charges', authenticate, async (req, res) => {
  try {
    const { status, client_id, type, month, year, start_date, end_date } = req.query;
    const db = getDb();
    await updateOverdueCharges(db);

    let query = `SELECT ch.*, c.name as client_name, c.whatsapp FROM charges ch JOIN clients c ON ch.client_id = c.id WHERE 1=1`;
    const params = [];
    let i = 1;

    if (status) { query += ` AND ch.status = $${i++}`; params.push(status); }
    if (client_id) { query += ` AND ch.client_id = $${i++}`; params.push(client_id); }
    if (type) { query += ` AND ch.type = $${i++}`; params.push(type); }
    if (month && year) {
      query += ` AND ch.due_date LIKE $${i++}`;
      params.push(`${year}-${String(month).padStart(2,'0')}-%`);
    } else {
      if (start_date) { query += ` AND ch.due_date >= $${i++}`; params.push(start_date); }
      if (end_date) { query += ` AND ch.due_date <= $${i++}`; params.push(end_date); }
    }
    query += ' ORDER BY ch.due_date DESC, c.name';

    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Resumo financeiro do mes
router.get('/summary', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await updateOverdueCharges(db);
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];
    const in3days = new Date(now); in3days.setDate(in3days.getDate() + 3);
    const in3str = in3days.toISOString().split('T')[0];

    const received = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND due_date LIKE $1`).get(`${monthStr}-%`);
    const pending = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='pending' AND due_date LIKE $1`).get(`${monthStr}-%`);
    const overdue = await db.prepare(`SELECT COALESCE(SUM(value),0) as total, COUNT(*) as count FROM charges WHERE status='overdue'`).get();
    const dueIn3 = await db.prepare(`SELECT COUNT(*) as count FROM charges WHERE status='pending' AND due_date BETWEEN $1 AND $2`).get(today, in3str);
    const activeClients = await db.prepare(`SELECT COUNT(*) as count FROM clients WHERE status='active'`).get();
    const avgRating = await db.prepare(`SELECT ROUND(AVG(rating)::numeric,1) as avg FROM services WHERE rating IS NOT NULL AND completed_date LIKE $1`).get(`${monthStr}-%`);
    const servicesThisMonth = await db.prepare(`SELECT COUNT(*) as count FROM services WHERE status='completed' AND completed_date LIKE $1`).get(`${monthStr}-%`);
    const expenses = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM expenses WHERE date LIKE $1`).get(`${monthStr}-%`);

    res.json({
      month_received: parseFloat(received.total),
      month_pending: parseFloat(pending.total),
      month_profit: parseFloat(received.total) - parseFloat(expenses.total),
      overdue_total: parseFloat(overdue.total),
      overdue_count: parseInt(overdue.count),
      due_in_3_days: parseInt(dueIn3.count),
      active_clients: parseInt(activeClients.count),
      avg_rating: avgRating.avg,
      services_this_month: parseInt(servicesThisMonth.count)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alertas de vencimento
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await updateOverdueCharges(db);
    const today = new Date().toISOString().split('T')[0];
    const in3days = new Date(); in3days.setDate(in3days.getDate() + 3);
    const in3str = in3days.toISOString().split('T')[0];

    const dueIn3 = await db.prepare(`SELECT ch.*, c.name as client_name, c.whatsapp FROM charges ch JOIN clients c ON ch.client_id = c.id WHERE ch.status='pending' AND ch.due_date BETWEEN $1 AND $2 ORDER BY ch.due_date`).all(today, in3str);
    const overdueList = await db.prepare(`SELECT ch.*, c.name as client_name, c.whatsapp FROM charges ch JOIN clients c ON ch.client_id = c.id WHERE ch.status='overdue' ORDER BY ch.due_date`).all();
    res.json({ due_in_3_days: dueIn3, overdue: overdueList });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar cobrança manual
router.post('/charges', authenticate, async (req, res) => {
  try {
    const { client_id, description, type, value, due_date, notes } = req.body;
    if (!client_id || !value || !due_date) return res.status(400).json({ error: 'Campos obrigatorios' });
    const db = getDb();
    const pixCode = await generatePixCode(db, value);
    const result = await db.prepare('INSERT INTO charges (client_id, description, type, value, due_date, notes, pix_code) VALUES ($1,$2,$3,$4,$5,$6,$7)').run(client_id, description||'Cobranca avulsa', type||'extra', value, due_date, notes||null, pixCode);
    res.json({ id: result.lastInsertRowid, message: 'Cobranca criada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Baixar pagamento
router.post('/charges/:id/pay', authenticate, async (req, res) => {
  try {
    const { paid_date, payment_method } = req.body;
    const db = getDb();
    await db.prepare("UPDATE charges SET status='paid', paid_date=$1, payment_method=$2 WHERE id=$3").run(paid_date || new Date().toISOString().split('T')[0], payment_method||'pix', req.params.id);
    res.json({ message: 'Pagamento registrado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Link WhatsApp de cobranca
router.get('/charges/:id/whatsapp', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const charge = await db.prepare('SELECT ch.*, c.name as client_name, c.whatsapp FROM charges ch JOIN clients c ON ch.client_id = c.id WHERE ch.id = $1').get(req.params.id);
    if (!charge) return res.status(404).json({ error: 'Cobranca nao encontrada' });

    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

    const dueDate = new Date(charge.due_date).toLocaleDateString('pt-BR');
    let msg = (settings.whatsapp_template_charge || 'Ola {nome}! Cobranca de R$ {valor} vence em {vencimento}. PIX: {pix_chave}')
      .replace('{nome}', charge.client_name)
      .replace('{servico}', charge.description)
      .replace('{valor}', Number(charge.value).toFixed(2).replace('.', ','))
      .replace('{vencimento}', dueDate)
      .replace('{pix_chave}', settings.pix_key || '');

    if (charge.pix_code) msg += `\n\nCodigo PIX Copia e Cola:\n${charge.pix_code}`;

    const whatsapp = charge.whatsapp?.replace(/\D/g, '');
    const waLink = `https://wa.me/55${whatsapp}?text=${encodeURIComponent(msg)}`;
    await db.prepare('INSERT INTO message_log (client_id, type, message) VALUES ($1,$2,$3)').run(charge.client_id, 'charge', msg);
    res.json({ wa_link: waLink, message: msg, pix_code: charge.pix_code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gerar cobranças mensais
router.post('/generate-monthly', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await generateAllMonthlyCharges(db);
    res.json({ message: 'Cobranças mensais geradas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Despesas
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const db = getDb();
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];
    let i = 1;
    if (month && year) { query += ` AND date LIKE $${i++}`; params.push(`${year}-${String(month).padStart(2,'0')}-%`); }
    query += ' ORDER BY date DESC';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/expenses', authenticate, async (req, res) => {
  try {
    const { description, category, value, date, notes } = req.body;
    if (!description || !value || !date) return res.status(400).json({ error: 'Campos obrigatorios' });
    const db = getDb();
    const result = await db.prepare('INSERT INTO expenses (description, category, value, date, notes) VALUES ($1,$2,$3,$4,$5)').run(description, category||'operational', value, date, notes||null);
    res.json({ id: result.lastInsertRowid, message: 'Despesa registrada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/expenses/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM expenses WHERE id = $1').run(req.params.id);
    res.json({ message: 'Despesa removida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
