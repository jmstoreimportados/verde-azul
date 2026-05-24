const jwt = require('jsonwebtoken');
const { getDb } = require('../../database/db');
const JWT_SECRET = process.env.JWT_SECRET || 'verde-azul-secret-2025';

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = await db.prepare("SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1 AND u.status = 'active'").get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'Usuario invalido ou inativo' });
    user.permissions = JSON.parse(user.permissions || '{}');
    delete user.password_hash;
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function authorize(module, action) {
  return (req, res, next) => {
    const perms = req.user.permissions[module];
    if (!perms || !perms.includes(action)) {
      return res.status(403).json({ error: 'Sem permissao para esta acao' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
