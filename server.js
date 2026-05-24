require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/clients',   require('./src/routes/clients'));
app.use('/api/services',  require('./src/routes/services'));
app.use('/api/financial', require('./src/routes/financial'));
app.use('/api/products',  require('./src/routes/products'));
app.use('/api/team',      require('./src/routes/team'));
app.use('/api/reports',   require('./src/routes/reports'));
app.use('/api/settings',  require('./src/routes/settings'));
app.use('/api/budgets',   require('./src/routes/budgets'));

// Endpoint para Vercel Cron Jobs (dispara tarefas diarias automaticamente)
app.get('/api/cron/daily', async (req, res) => {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { getDb } = require('./database/db');
    const { updateOverdueCharges, generateAllMonthlyCharges, generateAllMonthlyServices } = require('./src/utils/generators');
    const db = getDb();
    await updateOverdueCharges(db);
    const today = new Date();
    if (today.getDate() === 1) {
      await generateAllMonthlyCharges(db);
      await generateAllMonthlyServices(db);
    }
    res.json({ ok: true, message: 'Tarefas diarias executadas', date: today.toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicializacao local
if (require.main === module) {
  const { initializeDatabase } = require('./database/db');
  const { updateOverdueCharges } = require('./src/utils/generators');
  (async () => {
    try {
      await initializeDatabase();
      const { getDb } = require('./database/db');
      await updateOverdueCharges(getDb());
      app.listen(PORT, () => {
        console.log(`\n🌿 Verde & Azul Gestao rodando em http://localhost:${PORT}`);
        console.log(`Login: admin@verdeazul.com | Senha: admin123\n`);
      });
    } catch (err) {
      console.error('Falha ao inicializar:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = app;
