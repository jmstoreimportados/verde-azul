const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../../database/db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatorios' });
    const db = getDb();
    const user = await db.prepare("SELECT u.*, r.name as role_name, r.permissions FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1 AND u.status = 'active'").get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }
    await db.prepare("UPDATE users SET last_login = $1 WHERE id = $2").run(new Date().toISOString().split('T')[0], user.id);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '12h' });
    const userData = { ...user };
    delete userData.password_hash;
    userData.permissions = JSON.parse(userData.permissions || '{}');
    res.json({ token, user: userData });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Perfil atual
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Trocar senha
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Campos obrigatorios' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    const db = getDb();
    const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    await db.prepare('UPDATE users SET password_hash = $1 WHERE id = $2').run(hash, req.user.id);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar usuarios
router.get('/users', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const users = await db.prepare('SELECT u.id, u.name, u.email, u.status, u.last_login, u.created_at, r.name as role_name, r.id as role_id FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.name').all();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar usuario
router.post('/users', authenticate, async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;
    if (!name || !email || !password || !role_id) return res.status(400).json({ error: 'Campos obrigatorios' });
    const db = getDb();
    const exists = await db.prepare('SELECT id FROM users WHERE email = $1').get(email.toLowerCase());
    if (exists) return res.status(400).json({ error: 'E-mail ja cadastrado' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)').run(name, email.toLowerCase(), hash, role_id);
    res.json({ id: result.lastInsertRowid, message: 'Usuario criado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar usuario
router.put('/users/:id', authenticate, async (req, res) => {
  try {
    const { name, email, role_id, status, new_password } = req.body;
    const db = getDb();
    if (new_password && new_password.length >= 6) {
      await db.prepare('UPDATE users SET name = $1, email = $2, role_id = $3, status = $4, password_hash = $5 WHERE id = $6').run(name, email.toLowerCase(), role_id, status, bcrypt.hashSync(new_password, 10), req.params.id);
    } else {
      await db.prepare('UPDATE users SET name = $1, email = $2, role_id = $3, status = $4 WHERE id = $5').run(name, email.toLowerCase(), role_id, status, req.params.id);
    }
    res.json({ message: 'Usuario atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar roles
router.get('/roles', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const roles = await db.prepare('SELECT * FROM roles ORDER BY id').all();
    roles.forEach(r => r.permissions = JSON.parse(r.permissions));
    res.json(roles);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar permissoes de um role
router.put('/roles/:id', authenticate, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const db = getDb();
    await db.prepare('UPDATE roles SET name = $1, permissions = $2 WHERE id = $3').run(name, JSON.stringify(permissions), req.params.id);
    res.json({ message: 'Permissoes atualizadas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
