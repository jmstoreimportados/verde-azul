const jwt = require('jsonwebtoken');
const { supabase } = require('../../database/db');

if (!process.env.JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET must be set.');
}
const JWT_SECRET = process.env.JWT_SECRET;

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('*, roles(name, permissions)')
      .eq('id', decoded.userId)
      .eq('status', 'active')
      .single();

    if (error || !user) return res.status(401).json({ error: 'Usuario invalido ou inativo' });

    // Flatten role fields
    user.role_name = user.roles?.name;
    user.permissions = JSON.parse(user.roles?.permissions || '{}');
    delete user.roles;
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
