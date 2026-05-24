const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../../database/db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatorios' });

    const emailClean = email.trim().toLowerCase();

    const { data: user, error } = await supabase
      .from('users')
      .select('*, roles(name, permissions)')
      .eq('email', emailClean)
      .eq('status', 'active')
      .single();

    if (error || !user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString().split('T')[0] })
      .eq('id', user.id);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '12h' });
    const userData = { ...user };
    delete userData.password_hash;
    userData.role_name = userData.roles?.name;
    userData.permissions = JSON.parse(userData.roles?.permissions || '{}');
    delete userData.roles;

    res.json({ token, user: userData });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
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

    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: hash })
      .eq('id', req.user.id);

    if (updateErr) throw updateErr;
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Listar usuarios
router.get('/users', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, status, last_login, created_at, roles(id, name)')
      .order('name');

    if (error) throw error;
    const users = data.map(u => ({
      ...u,
      role_id: u.roles?.id,
      role_name: u.roles?.name,
      roles: undefined
    }));
    res.json(users);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Criar usuario
router.post('/users', authenticate, async (req, res) => {
  try {
    const { name, email, password, role_id } = req.body;
    if (!name || !email || !password || !role_id) return res.status(400).json({ error: 'Campos obrigatorios' });

    const emailClean = email.trim().toLowerCase();
    const { data: exists } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailClean)
      .maybeSingle();

    if (exists) return res.status(400).json({ error: 'E-mail ja cadastrado' });

    const hash = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert({ name, email: emailClean, password_hash: hash, role_id })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Usuario criado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Atualizar usuario
router.put('/users/:id', authenticate, async (req, res) => {
  try {
    const { name, email, role_id, status, new_password } = req.body;
    const updateData = { name, email: email.trim().toLowerCase(), role_id, status };

    if (new_password && new_password.length >= 6) {
      updateData.password_hash = bcrypt.hashSync(new_password, 10);
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Usuario atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Listar roles
router.get('/roles', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('id');

    if (error) throw error;
    res.json(data.map(r => ({ ...r, permissions: JSON.parse(r.permissions || '{}') })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Atualizar permissoes de um role
router.put('/roles/:id', authenticate, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const { error } = await supabase
      .from('roles')
      .update({ name, permissions: JSON.stringify(permissions) })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Permissoes atualizadas' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
