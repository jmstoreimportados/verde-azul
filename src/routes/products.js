const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, low_stock } = req.query;
    const db = getDb();
    let query = "SELECT * FROM products WHERE status = 'active'";
    const params = [];
    let i = 1;
    if (category) { query += ` AND category = $${i++}`; params.push(category); }
    if (low_stock === 'true') query += ' AND stock_quantity <= min_stock';
    query += ' ORDER BY category, name';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, category, unit, cost_price, sale_price, stock_quantity, min_stock, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
    const db = getDb();
    const result = await db.prepare('INSERT INTO products (name,description,category,unit,cost_price,sale_price,stock_quantity,min_stock,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)').run(name, description||null, category||'pool', unit||'kg', cost_price||0, sale_price||0, stock_quantity||0, min_stock||0, notes||null);
    res.json({ id: result.lastInsertRowid, message: 'Produto criado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, category, unit, cost_price, sale_price, min_stock, notes, status } = req.body;
    const db = getDb();
    await db.prepare('UPDATE products SET name=$1,description=$2,category=$3,unit=$4,cost_price=$5,sale_price=$6,min_stock=$7,notes=$8,status=$9 WHERE id=$10').run(name, description||null, category||'pool', unit||'kg', cost_price||0, sale_price||0, min_stock||0, notes||null, status||'active', req.params.id);
    res.json({ message: 'Produto atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/stock-entry', authenticate, async (req, res) => {
  try {
    const { quantity, unit_cost, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantidade invalida' });
    const db = getDb();
    await db.prepare('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2').run(quantity, req.params.id);
    await db.prepare("INSERT INTO stock_movements (product_id, type, quantity, unit_cost, notes, reference_type) VALUES ($1, 'in', $2, $3, $4, 'purchase')").run(req.params.id, quantity, unit_cost||0, notes||'Entrada de estoque');
    if (unit_cost > 0) await db.prepare('UPDATE products SET cost_price = $1 WHERE id = $2').run(unit_cost, req.params.id);
    res.json({ message: 'Estoque atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status/alerts', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const alerts = await db.prepare("SELECT * FROM products WHERE status='active' AND stock_quantity <= min_stock ORDER BY (stock_quantity - min_stock)").all();
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/movements', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const movements = await db.prepare('SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50').all(req.params.id);
    res.json(movements);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/kits/:clientId', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const kit = await db.prepare('SELECT ck.*, p.name, p.unit, p.sale_price FROM client_kits ck JOIN products p ON ck.product_id = p.id WHERE ck.client_id = $1').all(req.params.clientId);
    res.json(kit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/kits/:clientId', authenticate, async (req, res) => {
  try {
    const { items } = req.body;
    const db = getDb();
    await db.prepare('DELETE FROM client_kits WHERE client_id = $1').run(req.params.clientId);
    for (const item of (items || [])) {
      await db.prepare('INSERT INTO client_kits (client_id, product_id, quantity) VALUES ($1, $2, $3)').run(req.params.clientId, item.product_id, item.quantity);
    }
    res.json({ message: 'Kit atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
