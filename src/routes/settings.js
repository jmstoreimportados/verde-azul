const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    for (const [key, value] of Object.entries(req.body)) {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at").run(key, val, new Date().toISOString());
    }
    res.json({ message: 'Configuracoes salvas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/backup', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const data = {
      exported_at: new Date().toISOString(),
      clients: await db.prepare('SELECT * FROM clients').all(),
      employees: await db.prepare('SELECT * FROM employees').all(),
      services: await db.prepare('SELECT * FROM services').all(),
      charges: await db.prepare('SELECT * FROM charges').all(),
      expenses: await db.prepare('SELECT * FROM expenses').all(),
      products: await db.prepare('SELECT * FROM products').all(),
      stock_movements: await db.prepare('SELECT * FROM stock_movements').all(),
      client_kits: await db.prepare('SELECT * FROM client_kits').all(),
      budgets: await db.prepare('SELECT * FROM budgets').all(),
      settings: await db.prepare('SELECT * FROM settings').all()
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="verde-azul-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
