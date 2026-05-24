const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;

    const settings = {};
    (data || []).forEach(r => {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    });
    res.json(settings);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.put('/', authenticate, async (req, res) => {
  try {
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(req.body)) {
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      const { error } = await supabase
        .from('settings')
        .upsert({ key, value: val, updated_at: now }, { onConflict: 'key' });
      if (error) throw error;
    }
    res.json({ message: 'Configuracoes salvas' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/backup', authenticate, async (req, res) => {
  try {
    const tables = ['clients', 'employees', 'services', 'charges', 'expenses', 'products', 'stock_movements', 'client_kits', 'budgets', 'settings'];
    const data = { exported_at: new Date().toISOString() };

    for (const table of tables) {
      const { data: rows, error } = await supabase.from(table).select('*');
      if (error) throw error;
      data[table] = rows || [];
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="verde-azul-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
