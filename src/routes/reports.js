const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

function getMonthRange(month, year) {
  const m = String(month).padStart(2,'0');
  return { like: `${year}-${m}-%` };
}

// Receita por periodo (ultimos 6 meses)
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth()+1).padStart(2,'0');
      const y = d.getFullYear();
      const r = await db.prepare(`SELECT COALESCE(SUM(value),0) as received FROM charges WHERE status='paid' AND due_date LIKE $1`).get(`${y}-${m}-%`);
      const p = await db.prepare(`SELECT COALESCE(SUM(value),0) as pending FROM charges WHERE status IN ('pending','overdue') AND due_date LIKE $1`).get(`${y}-${m}-%`);
      const e = await db.prepare(`SELECT COALESCE(SUM(value),0) as expenses FROM expenses WHERE date LIKE $1`).get(`${y}-${m}-%`);
      months.push({ month: `${m}/${y}`, year: y, month_num: d.getMonth()+1, received: parseFloat(r.received), pending: parseFloat(p.pending), expenses: parseFloat(e.expenses), profit: parseFloat(r.received) - parseFloat(e.expenses) });
    }
    res.json(months);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DRE - Receita vs Despesas
router.get('/profit', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth()+1;
    const y = year || now.getFullYear();
    const { like } = getMonthRange(m, y);
    const db = getDb();

    const received = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND due_date LIKE $1`).get(like);
    const monthly_rev = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND type='monthly' AND due_date LIKE $1`).get(like);
    const extra_rev = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND type='extra' AND due_date LIKE $1`).get(like);
    const expenses = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM expenses WHERE date LIKE $1`).get(like);
    const expense_detail = await db.prepare(`SELECT category, COALESCE(SUM(value),0) as total FROM expenses WHERE date LIKE $1 GROUP BY category`).all(like);
    const product_cost = await db.prepare(`SELECT COALESCE(SUM(sm.quantity * p.cost_price),0) as total FROM stock_movements sm JOIN products p ON sm.product_id = p.id WHERE sm.type='out' AND sm.reference_type='service' AND sm.created_at LIKE $1`).get(like);

    const rev = parseFloat(received.total);
    const exp = parseFloat(expenses.total);
    res.json({
      revenue: { total: rev, monthly: parseFloat(monthly_rev.total), extra: parseFloat(extra_rev.total) },
      expenses: { total: exp, detail: expense_detail, product_cost: parseFloat(product_cost.total) },
      profit: rev - exp,
      margin: rev > 0 ? ((rev - exp) / rev * 100).toFixed(1) : 0
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inadimplencia
router.get('/overdue', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const overdue = await db.prepare(`SELECT ch.*, c.name as client_name, c.whatsapp, c.phone, EXTRACT(EPOCH FROM (CURRENT_DATE - ch.due_date::date))/86400 as days_overdue FROM charges ch JOIN clients c ON ch.client_id = c.id WHERE ch.status='overdue' ORDER BY days_overdue DESC`).all();
    const total = overdue.reduce((s, c) => s + parseFloat(c.value), 0);
    res.json({ charges: overdue, total, count: overdue.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clientes mais rentaveis
router.get('/top-clients', authenticate, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const db = getDb();
    const clients = await db.prepare(`SELECT c.id, c.name, c.phone, c.plan_type, COALESCE(SUM(ch.value),0) as total_billed, COUNT(DISTINCT ch.id) as charge_count, COUNT(DISTINCT s.id) as service_count FROM clients c LEFT JOIN charges ch ON ch.client_id = c.id AND ch.status = 'paid' LEFT JOIN services s ON s.client_id = c.id AND s.status = 'completed' WHERE c.status = 'active' GROUP BY c.id ORDER BY total_billed DESC LIMIT $1`).all(parseInt(limit));
    res.json(clients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Receita por tipo de servico
router.get('/revenue-by-type', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const monthly = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND type='monthly'`).get();
    const extra = await db.prepare(`SELECT COALESCE(SUM(value),0) as total FROM charges WHERE status='paid' AND type='extra'`).get();
    const pool = await db.prepare(`SELECT COALESCE(SUM(c.monthly_value),0) as total FROM clients c WHERE c.status='active' AND service_types::json->>0 = 'pool'`).get();
    const garden = await db.prepare(`SELECT COALESCE(SUM(c.monthly_value),0) as total FROM clients c WHERE c.status='active' AND service_types::json->>0 = 'garden'`).get();
    res.json({ monthly: parseFloat(monthly.total), extra: parseFloat(extra.total), pool_clients: parseFloat(pool.total), garden_clients: parseFloat(garden.total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Servicos realizados
router.get('/services-performed', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth()+1;
    const y = year || now.getFullYear();
    const { like } = getMonthRange(m, y);
    const db = getDb();

    const total = await db.prepare(`SELECT COUNT(*) as count FROM services WHERE status='completed' AND completed_date LIKE $1`).get(like);
    const byType = await db.prepare(`SELECT service_category, COUNT(*) as count FROM services WHERE status='completed' AND completed_date LIKE $1 GROUP BY service_category`).all(like);
    const byEmployee = await db.prepare(`SELECT e.name, COUNT(*) as count, ROUND(AVG(s.rating)::numeric,1) as avg_rating FROM services s LEFT JOIN employees e ON s.employee_id = e.id WHERE s.status='completed' AND s.completed_date LIKE $1 GROUP BY s.employee_id, e.name ORDER BY count DESC`).all(like);
    const scheduled = await db.prepare(`SELECT COUNT(*) as count FROM services WHERE scheduled_date LIKE $1`).get(like);
    const cancelled = await db.prepare(`SELECT COUNT(*) as count FROM services WHERE status='cancelled' AND scheduled_date LIKE $1`).get(like);

    res.json({ total: parseInt(total.count), scheduled: parseInt(scheduled.count), cancelled: parseInt(cancelled.count), completion_rate: parseInt(scheduled.count) > 0 ? ((parseInt(total.count) / parseInt(scheduled.count))*100).toFixed(1) : 0, by_type: byType, by_employee: byEmployee });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Satisfacao geral
router.get('/satisfaction', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth()+1).padStart(2,'0');
      const y = d.getFullYear();
      const r = await db.prepare(`SELECT ROUND(AVG(rating)::numeric,1) as avg, COUNT(*) as count FROM services WHERE rating IS NOT NULL AND completed_date LIKE $1`).get(`${y}-${m}-%`);
      months.push({ month: `${m}/${y}`, avg: r.avg, count: parseInt(r.count) });
    }
    const dist = await db.prepare(`SELECT rating, COUNT(*) as count FROM services WHERE rating IS NOT NULL GROUP BY rating ORDER BY rating`).all();
    const overall = await db.prepare(`SELECT ROUND(AVG(rating)::numeric,1) as avg, COUNT(*) as count FROM services WHERE rating IS NOT NULL`).get();
    res.json({ monthly: months, distribution: dist, overall });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clientes em risco
router.get('/at-risk', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const clients = await db.prepare(`SELECT c.id, c.name, c.phone, c.whatsapp, COALESCE(AVG(s.rating),0) as avg_rating, COUNT(CASE WHEN ch.status='overdue' THEN 1 END) as overdue_count, COALESCE(SUM(CASE WHEN ch.status='overdue' THEN ch.value END),0) as overdue_amount FROM clients c LEFT JOIN services s ON s.client_id = c.id AND s.rating IS NOT NULL AND s.completed_date >= $1 LEFT JOIN charges ch ON ch.client_id = c.id WHERE c.status = 'active' GROUP BY c.id HAVING (AVG(s.rating) > 0 AND AVG(s.rating) <= 2.5) OR COUNT(CASE WHEN ch.status='overdue' THEN 1 END) > 0 ORDER BY overdue_amount DESC, avg_rating ASC`).all(cutoffStr);
    res.json(clients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crescimento da base
router.get('/client-growth', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth()+1).padStart(2,'0');
      const y = d.getFullYear();
      const newClients = await db.prepare(`SELECT COUNT(*) as count FROM clients WHERE created_at LIKE $1`).get(`${y}-${m}-%`);
      const active = await db.prepare(`SELECT COUNT(*) as count FROM clients WHERE status='active' AND created_at <= $1`).get(`${y}-${m}-31`);
      months.push({ month: `${m}/${y}`, new_clients: parseInt(newClients.count), active_total: parseInt(active.count) });
    }
    res.json(months);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Produtividade da equipe
router.get('/team-productivity', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth()+1;
    const y = year || now.getFullYear();
    const { like } = getMonthRange(m, y);
    const db = getDb();
    const employees = await db.prepare(`SELECT e.id, e.name, e.function, COUNT(s.id) as services_completed, ROUND(AVG(s.rating)::numeric,1) as avg_rating, COUNT(CASE WHEN s.service_category='pool' THEN 1 END) as pool_count, COUNT(CASE WHEN s.service_category='garden' THEN 1 END) as garden_count FROM employees e LEFT JOIN services s ON s.employee_id = e.id AND s.status='completed' AND s.completed_date LIKE $1 WHERE e.status='active' GROUP BY e.id ORDER BY services_completed DESC`).all(like);
    res.json(employees);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Qualidade da agua por cliente
router.get('/water-quality/:clientId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const services = await db.prepare(`SELECT scheduled_date, completed_date, water_quality FROM services WHERE client_id = $1 AND status='completed' AND water_quality != '{}' ORDER BY completed_date DESC LIMIT 20`).all(req.params.clientId);
    const result = services.map(s => ({ date: s.completed_date || s.scheduled_date, ...JSON.parse(s.water_quality || '{}') }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Piscinas fora do padrao
router.get('/water-quality-alerts', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const settingRow = await db.prepare(`SELECT value FROM settings WHERE key='water_quality_params'`).get();
    const params = JSON.parse(settingRow?.value || '{}');
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    const recent = await db.prepare(`SELECT s.id, s.water_quality, s.completed_date, c.name as client_name, c.whatsapp FROM services s JOIN clients c ON s.client_id = c.id WHERE s.status='completed' AND s.water_quality != '{}' AND s.completed_date >= $1`).all(cutoff.toISOString().split('T')[0]);

    const alerts = [];
    for (const svc of recent) {
      const wq = JSON.parse(svc.water_quality || '{}');
      const issues = [];
      for (const [key, config] of Object.entries(params)) {
        const val = wq[key];
        if (val !== undefined && val !== null) {
          if (val < config.min || val > config.max) issues.push(`${config.label}: ${val} (ideal: ${config.min}-${config.max})`);
        }
      }
      if (issues.length > 0) alerts.push({ ...svc, issues });
    }
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Consumo de produtos
router.get('/product-consumption', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth()+1;
    const y = year || now.getFullYear();
    const { like } = getMonthRange(m, y);
    const db = getDb();
    const consumption = await db.prepare(`SELECT p.name, p.unit, p.cost_price, COALESCE(SUM(sm.quantity),0) as total_used, COALESCE(SUM(sm.quantity * p.cost_price),0) as total_cost FROM stock_movements sm JOIN products p ON sm.product_id = p.id WHERE sm.type='out' AND sm.reference_type='service' AND sm.created_at LIKE $1 GROUP BY p.id, p.name, p.unit, p.cost_price ORDER BY total_cost DESC`).all(like);
    const totalCost = consumption.reduce((s, c) => s + parseFloat(c.total_cost), 0);
    res.json({ items: consumption, total_cost: totalCost });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Estoque atual
router.get('/stock', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const products = await db.prepare(`SELECT p.*, (p.stock_quantity * p.cost_price) as stock_value, (p.stock_quantity <= p.min_stock) as is_low FROM products p WHERE p.status='active' ORDER BY is_low DESC, p.category, p.name`).all();
    const totalValue = products.reduce((s, p) => s + parseFloat(p.stock_value), 0);
    const lowCount = products.filter(p => p.is_low).length;
    res.json({ products, total_value: totalValue, low_stock_count: lowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Historico completo do cliente
router.get('/client-history/:clientId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const client = await db.prepare('SELECT * FROM clients WHERE id = $1').get(req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    client.service_types = JSON.parse(client.service_types || '[]');

    const services = await db.prepare(`SELECT s.*, e.name as employee_name FROM services s LEFT JOIN employees e ON s.employee_id = e.id WHERE s.client_id = $1 ORDER BY s.scheduled_date DESC`).all(client.id);
    services.forEach(s => {
      s.checklist = JSON.parse(s.checklist || '[]');
      s.water_quality = JSON.parse(s.water_quality || '{}');
      s.products_used = JSON.parse(s.products_used || '[]');
      s.photos = JSON.parse(s.photos || '[]');
    });

    const charges = await db.prepare('SELECT * FROM charges WHERE client_id = $1 ORDER BY due_date DESC').all(client.id);
    const totalPaid = charges.filter(c => c.status === 'paid').reduce((s, c) => s + parseFloat(c.value), 0);
    const totalOverdue = charges.filter(c => c.status === 'overdue').reduce((s, c) => s + parseFloat(c.value), 0);
    const rated = services.filter(s => s.rating);
    const avgRating = rated.length > 0 ? rated.reduce((s, c) => s + c.rating, 0) / rated.length : null;

    res.json({ client, services, charges, stats: { total_services: services.length, completed_services: services.filter(s => s.status === 'completed').length, total_paid: totalPaid, total_overdue: totalOverdue, avg_rating: avgRating } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
