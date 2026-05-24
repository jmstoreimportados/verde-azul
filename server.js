require('dotenv').config();

// Fail fast on missing env vars — validate before anything else
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — restrict to configured origin in production
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigin === '*' ? '*' : (origin, cb) => {
    if (!origin || origin === allowedOrigin) cb(null, true);
    else cb(new Error('CORS not allowed'));
  }
}));

// Rate limiter for auth routes — 10 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply rate limiter only on auth login endpoint
app.use('/api/auth/login', authLimiter);

app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/clients',   require('./src/routes/clients'));
app.use('/api/services',  require('./src/routes/services'));
app.use('/api/financial', require('./src/routes/financial'));
app.use('/api/products',  require('./src/routes/products'));
app.use('/api/team',      require('./src/routes/team'));
app.use('/api/reports',   require('./src/routes/reports'));
app.use('/api/settings',  require('./src/routes/settings'));
app.use('/api/budgets',   require('./src/routes/budgets'));

// Vercel Cron Job endpoint
app.get('/api/cron/daily', async (req, res) => {
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { updateOverdueCharges, generateAllMonthlyCharges, generateAllMonthlyServices } = require('./src/utils/generators');
    await updateOverdueCharges();
    const today = new Date();
    if (today.getDate() === 1) {
      await generateAllMonthlyCharges();
      await generateAllMonthlyServices();
    }
    res.json({ ok: true, message: 'Tarefas diarias executadas', date: today.toISOString() });
  } catch (e) {
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({ error: isProd ? 'Erro interno' : e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Local dev startup
if (require.main === module) {
  const { updateOverdueCharges } = require('./src/utils/generators');
  (async () => {
    try {
      await updateOverdueCharges();
      app.listen(PORT, () => {
        console.log(`\nVerde & Azul Gestao rodando em http://localhost:${PORT}`);
        console.log(`Login: admin@verdeazul.com | Senha: admin123\n`);
      });
    } catch (err) {
      console.error('Falha ao inicializar:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = app;
