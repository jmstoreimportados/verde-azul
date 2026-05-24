const express = require('express');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const employees = await db.prepare('SELECT * FROM employees ORDER BY name').all();
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    for (const e of employees) {
      const stats = await db.prepare(`SELECT COUNT(*) as completed, ROUND(AVG(rating)::numeric,1) as avg_rating FROM services WHERE employee_id = $1 AND status='completed' AND completed_date LIKE $2`).get(e.id, `${monthStr}-%`);
      e.services_this_month = parseInt(stats.completed);
      e.avg_rating = stats.avg_rating;
    }
    res.json(employees);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, phone, email, function: func, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
    const db = getDb();
    const result = await db.prepare('INSERT INTO employees (name,phone,email,function,notes) VALUES ($1,$2,$3,$4,$5)').run(name, phone||null, email||null, func||null, notes||null);
    res.json({ id: result.lastInsertRowid, message: 'Funcionario cadastrado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, email, function: func, status, notes } = req.body;
    const db = getDb();
    await db.prepare('UPDATE employees SET name=$1,phone=$2,email=$3,function=$4,status=$5,notes=$6 WHERE id=$7').run(name, phone||null, email||null, func||null, status||'active', notes||null, req.params.id);
    res.json({ message: 'Funcionario atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/schedule', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const db = getDb();
    let query = `SELECT s.*, c.name as client_name, c.address, c.neighborhood FROM services s JOIN clients c ON s.client_id = c.id WHERE s.employee_id = $1 AND s.status != 'cancelled'`;
    const params = [req.params.id];
    if (month && year) { query += ' AND s.scheduled_date LIKE $2'; params.push(`${year}-${String(month).padStart(2,'0')}-%`); }
    query += ' ORDER BY s.scheduled_date';
    res.json(await db.prepare(query).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
