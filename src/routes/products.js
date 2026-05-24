const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

router.get('/', authenticate, async (req, res) => {
  try {
    const { category, low_stock } = req.query;
    let query = supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('category')
      .order('name');

    if (category) query = query.eq('category', category);
    // low_stock filter: stock_quantity <= min_stock (requires RPC or post-filter)
    const { data, error } = await query;
    if (error) throw error;

    let result = data || [];
    if (low_stock === 'true') {
      result = result.filter(p => p.stock_quantity <= p.min_stock);
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, category, unit, cost_price, sale_price, stock_quantity, min_stock, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });

    const { data, error } = await supabase
      .from('products')
      .insert({
        name, description: description || null, category: category || 'pool', unit: unit || 'kg',
        cost_price: cost_price || 0, sale_price: sale_price || 0,
        stock_quantity: stock_quantity || 0, min_stock: min_stock || 0, notes: notes || null
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Produto criado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, description, category, unit, cost_price, sale_price, min_stock, notes, status } = req.body;
    const { error } = await supabase
      .from('products')
      .update({
        name, description: description || null, category: category || 'pool', unit: unit || 'kg',
        cost_price: cost_price || 0, sale_price: sale_price || 0,
        min_stock: min_stock || 0, notes: notes || null, status: status || 'active'
      })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Produto atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/:id/stock-entry', authenticate, async (req, res) => {
  try {
    const { quantity, unit_cost, notes } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantidade invalida' });

    // Fetch current stock
    const { data: prod, error: fetchErr } = await supabase
      .from('products')
      .select('stock_quantity, cost_price')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) throw fetchErr;

    const newQty = (prod.stock_quantity || 0) + Number(quantity);
    const updateData = { stock_quantity: newQty };
    if (unit_cost > 0) updateData.cost_price = unit_cost;

    const { error: updateErr } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', req.params.id);
    if (updateErr) throw updateErr;

    const { error: movErr } = await supabase.from('stock_movements').insert({
      product_id: req.params.id, type: 'in', quantity, unit_cost: unit_cost || 0,
      notes: notes || 'Entrada de estoque', reference_type: 'purchase'
    });
    if (movErr) throw movErr;

    res.json({ message: 'Estoque atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/status/alerts', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;
    const alerts = (data || []).filter(p => p.stock_quantity <= p.min_stock)
      .sort((a, b) => (a.stock_quantity - a.min_stock) - (b.stock_quantity - b.min_stock));
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/:id/movements', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.get('/kits/:clientId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_kits')
      .select('*, products(name, unit, sale_price)')
      .eq('client_id', req.params.clientId);

    if (error) throw error;
    res.json((data || []).map(k => ({
      ...k,
      name: k.products?.name,
      unit: k.products?.unit,
      sale_price: k.products?.sale_price,
      products: undefined
    })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

router.post('/kits/:clientId', authenticate, async (req, res) => {
  try {
    const { items } = req.body;
    await supabase.from('client_kits').delete().eq('client_id', req.params.clientId);
    for (const item of (items || [])) {
      await supabase.from('client_kits').insert({
        client_id: req.params.clientId, product_id: item.product_id, quantity: item.quantity
      });
    }
    res.json({ message: 'Kit atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
