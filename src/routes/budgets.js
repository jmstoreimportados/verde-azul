const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateRecurringServices, generateMonthlyCharge } = require('../utils/generators');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const budgets = await db.prepare('SELECT * FROM budgets ORDER BY created_at DESC').all();
    res.json(budgets.map(b => ({ ...b, services: JSON.parse(b.services || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { prospect_name, prospect_phone, prospect_email, prospect_address, services, total_value, valid_until, notes } = req.body;
    if (!prospect_name || !prospect_phone) return res.status(400).json({ error: 'Nome e telefone obrigatorios' });
    const db = getDb();
    const result = await db.prepare('INSERT INTO budgets (prospect_name,prospect_phone,prospect_email,prospect_address,services,total_value,valid_until,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)').run(prospect_name, prospect_phone, prospect_email||null, prospect_address||null, JSON.stringify(services||[]), total_value||0, valid_until||null, notes||null);
    res.json({ id: result.lastInsertRowid, message: 'Orcamento criado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const db = getDb();
    const update = { sent: 'sent_at', approved: 'responded_at', rejected: 'responded_at' };
    let query = 'UPDATE budgets SET status = $1';
    const params = [status];
    if (update[status]) {
      query += `, ${update[status]} = $2 WHERE id = $3`;
      params.push(new Date().toISOString(), req.params.id);
    } else {
      query += ' WHERE id = $2';
      params.push(req.params.id);
    }
    await db.prepare(query).run(...params);
    res.json({ message: 'Status atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/convert', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const budget = await db.prepare('SELECT * FROM budgets WHERE id = $1').get(req.params.id);
    if (!budget) return res.status(404).json({ error: 'Orcamento nao encontrado' });
    const services = JSON.parse(budget.services || '[]');
    const serviceTypes = [...new Set(services.map(s => s.category || 'pool'))];

    const result = await db.prepare(`INSERT INTO clients (name,phone,whatsapp,address,service_types,frequency,monthly_value,payment_day,start_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7,10,$8,'active')`).run(budget.prospect_name, budget.prospect_phone, budget.prospect_phone, budget.prospect_address||'', JSON.stringify(serviceTypes), services[0]?.frequency||'monthly', budget.total_value, new Date().toISOString().split('T')[0]);

    const clientId = result.lastInsertRowid;
    await db.prepare("UPDATE budgets SET status = 'converted' WHERE id = $1").run(req.params.id);
    await generateRecurringServices(db, clientId, new Date().toISOString().split('T')[0]);
    if (budget.total_value > 0) await generateMonthlyCharge(db, clientId);

    res.json({ id: clientId, message: 'Cliente criado a partir do orcamento' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/whatsapp', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const budget = await db.prepare('SELECT * FROM budgets WHERE id = $1').get(req.params.id);
    if (!budget) return res.status(404).json({ error: 'Nao encontrado' });
    const services = JSON.parse(budget.services || '[]');
    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

    const servicesText = services.map(s => `* ${s.description}: R$ ${Number(s.value||0).toFixed(2).replace('.',',')}`).join('\n');
    const validDate = budget.valid_until ? new Date(budget.valid_until).toLocaleDateString('pt-BR') : '7 dias';
    const msg = `Ola ${budget.prospect_name}! Segue o orcamento da ${settings.company_name || 'Verde & Azul'}:\n\n${servicesText}\n\n*Total mensal: R$ ${Number(budget.total_value).toFixed(2).replace('.',',')}*\n\nValido ate: ${validDate}\n\nQualquer duvida estamos a disposicao!`;
    const wa = budget.prospect_phone.replace(/\D/g,'');
    const waLink = `https://wa.me/55${wa}?text=${encodeURIComponent(msg)}`;
    await db.prepare("UPDATE budgets SET status='sent', sent_at=$1 WHERE id=$2").run(new Date().toISOString(), budget.id);
    res.json({ wa_link: waLink, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
