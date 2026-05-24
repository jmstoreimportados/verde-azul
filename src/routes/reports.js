const express = require('express');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

function monthRange(year, month) {
  const m = String(month).padStart(2, '0');
  return { gte: `${year}-${m}-01`, lte: `${year}-${m}-31` };
}

const sum = (arr, field) => (arr || []).reduce((s, r) => s + parseFloat(r[field] || 0), 0);

// Receita por periodo (ultimos 6 meses)
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_revenue_by_month');
    if (!error && data) return res.json(data);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      const { gte, lte } = monthRange(y, d.getMonth() + 1);

      const [{ data: paid }, { data: pending }, { data: expenses }] = await Promise.all([
        supabase.from('charges').select('value').eq('status', 'paid').gte('due_date', gte).lte('due_date', lte),
        supabase.from('charges').select('value').in('status', ['pending', 'overdue']).gte('due_date', gte).lte('due_date', lte),
        supabase.from('expenses').select('value').gte('date', gte).lte('date', lte)
      ]);

      const received = sum(paid, 'value');
      const pend = sum(pending, 'value');
      const exp = sum(expenses, 'value');
      months.push({ month: `${m}/${y}`, year: y, month_num: d.getMonth() + 1, received, pending: pend, expenses: exp, profit: received - exp });
    }
    res.json(months);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// DRE - Receita vs Despesas
router.get('/profit', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const { gte, lte } = monthRange(y, m);

    const [
      { data: paidCharges },
      { data: monthlyPaid },
      { data: extraPaid },
      { data: expenseRows },
      { data: expenseDetail },
      { data: productCostRows }
    ] = await Promise.all([
      supabase.from('charges').select('value').eq('status', 'paid').gte('due_date', gte).lte('due_date', lte),
      supabase.from('charges').select('value').eq('status', 'paid').eq('type', 'monthly').gte('due_date', gte).lte('due_date', lte),
      supabase.from('charges').select('value').eq('status', 'paid').eq('type', 'extra').gte('due_date', gte).lte('due_date', lte),
      supabase.from('expenses').select('value').gte('date', gte).lte('date', lte),
      supabase.from('expenses').select('category, value').gte('date', gte).lte('date', lte),
      supabase.rpc('get_product_cost_by_month', { month_start: gte, month_end: lte })
    ]);

    const catMap = {};
    for (const r of (expenseDetail || [])) {
      catMap[r.category] = (catMap[r.category] || 0) + parseFloat(r.value);
    }
    const detail = Object.entries(catMap).map(([category, total]) => ({ category, total }));

    const rev = sum(paidCharges, 'value');
    const exp = sum(expenseRows, 'value');
    const productCost = productCostRows?.[0]?.total || 0;

    res.json({
      revenue: { total: rev, monthly: sum(monthlyPaid, 'value'), extra: sum(extraPaid, 'value') },
      expenses: { total: exp, detail, product_cost: parseFloat(productCost) },
      profit: rev - exp,
      margin: rev > 0 ? ((rev - exp) / rev * 100).toFixed(1) : 0
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Inadimplencia
router.get('/overdue', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_overdue_with_days');
    if (!error && data) {
      const total = (data || []).reduce((s, c) => s + parseFloat(c.value), 0);
      return res.json({ charges: data, total, count: data.length });
    }

    // Fallback: get overdue and compute days in JS, then lookup clients separately
    const { data: overdue, error: err2 } = await supabase
      .from('charges')
      .select('*')
      .eq('status', 'overdue')
      .order('due_date');

    if (err2) throw err2;

    const clientIds = [...new Set((overdue || []).map(ch => ch.client_id).filter(Boolean))];
    const { data: clients } = clientIds.length
      ? await supabase.from('clients').select('id, name, whatsapp, phone').in('id', clientIds)
      : { data: [] };
    const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]));

    const today = new Date();
    const formatted = (overdue || []).map(ch => {
      const due = new Date(ch.due_date);
      const days = Math.floor((today - due) / 86400000);
      const client = clientMap[ch.client_id] || {};
      return {
        ...ch,
        client_name: client.name || null,
        whatsapp: client.whatsapp || null,
        phone: client.phone || null,
        days_overdue: days
      };
    }).sort((a, b) => b.days_overdue - a.days_overdue);

    const total = formatted.reduce((s, c) => s + parseFloat(c.value), 0);
    res.json({ charges: formatted, total, count: formatted.length });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Clientes mais rentaveis
router.get('/top-clients', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { data, error } = await supabase.rpc('get_top_clients', { row_limit: limit });
    if (!error && data) return res.json(data);

    const { data: clients, error: err2 } = await supabase
      .from('clients')
      .select('id, name, phone, plan_type')
      .eq('status', 'active');
    if (err2) throw err2;

    const results = [];
    for (const c of (clients || [])) {
      const [{ data: charges }, { count: svcCount }] = await Promise.all([
        supabase.from('charges').select('value').eq('client_id', c.id).eq('status', 'paid'),
        supabase.from('services').select('*', { count: 'exact', head: true }).eq('client_id', c.id).eq('status', 'completed')
      ]);
      results.push({
        ...c,
        total_billed: sum(charges, 'value'),
        charge_count: (charges || []).length,
        service_count: svcCount || 0
      });
    }
    results.sort((a, b) => b.total_billed - a.total_billed);
    res.json(results.slice(0, limit));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Receita por tipo de servico
router.get('/revenue-by-type', authenticate, async (req, res) => {
  try {
    const [{ data: monthly }, { data: extra }, { data: allClients }] = await Promise.all([
      supabase.from('charges').select('value').eq('status', 'paid').eq('type', 'monthly'),
      supabase.from('charges').select('value').eq('status', 'paid').eq('type', 'extra'),
      supabase.from('clients').select('monthly_value, service_types').eq('status', 'active')
    ]);

    let poolTotal = 0, gardenTotal = 0;
    for (const c of (allClients || [])) {
      const types = JSON.parse(c.service_types || '[]');
      if (types[0] === 'pool') poolTotal += parseFloat(c.monthly_value || 0);
      else if (types[0] === 'garden') gardenTotal += parseFloat(c.monthly_value || 0);
    }

    res.json({
      monthly: sum(monthly, 'value'),
      extra: sum(extra, 'value'),
      pool_clients: poolTotal,
      garden_clients: gardenTotal
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Servicos realizados
router.get('/services-performed', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const { gte, lte } = monthRange(y, m);

    const [
      { count: totalCompleted },
      { data: byType },
      { count: scheduled },
      { count: cancelled },
      { data: employeeServicesRaw }
    ] = await Promise.all([
      supabase.from('services').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_date', gte).lte('completed_date', lte),
      supabase.from('services').select('service_category').eq('status', 'completed').gte('completed_date', gte).lte('completed_date', lte),
      supabase.from('services').select('*', { count: 'exact', head: true }).gte('scheduled_date', gte).lte('scheduled_date', lte),
      supabase.from('services').select('*', { count: 'exact', head: true }).eq('status', 'cancelled').gte('scheduled_date', gte).lte('scheduled_date', lte),
      supabase.from('services').select('employee_id, rating, service_category').eq('status', 'completed').gte('completed_date', gte).lte('completed_date', lte)
    ]);

    // Aggregate by type
    const typeMap = {};
    for (const s of (byType || [])) {
      typeMap[s.service_category] = (typeMap[s.service_category] || 0) + 1;
    }
    const byTypeResult = Object.entries(typeMap).map(([service_category, count]) => ({ service_category, count }));

    // Lookup employee names separately
    const empIds = [...new Set((employeeServicesRaw || []).map(s => s.employee_id).filter(Boolean))];
    const { data: emps } = empIds.length
      ? await supabase.from('employees').select('id, name').in('id', empIds)
      : { data: [] };
    const empNameMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));

    // Aggregate by employee
    const empMap = {};
    for (const s of (employeeServicesRaw || [])) {
      const empId = s.employee_id;
      const empName = empNameMap[empId] || 'Sem tecnico';
      if (!empMap[empId]) empMap[empId] = { name: empName, count: 0, ratings: [] };
      empMap[empId].count++;
      if (s.rating) empMap[empId].ratings.push(s.rating);
    }
    const byEmployee = Object.values(empMap).map(e => ({
      name: e.name,
      count: e.count,
      avg_rating: e.ratings.length > 0 ? parseFloat((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length).toFixed(1)) : null
    })).sort((a, b) => b.count - a.count);

    const total = totalCompleted || 0;
    const sched = scheduled || 0;
    res.json({
      total, scheduled: sched, cancelled: cancelled || 0,
      completion_rate: sched > 0 ? ((total / sched) * 100).toFixed(1) : 0,
      by_type: byTypeResult,
      by_employee: byEmployee
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Satisfacao geral
router.get('/satisfaction', authenticate, async (req, res) => {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      const { gte, lte } = monthRange(y, d.getMonth() + 1);

      const { data: ratingData } = await supabase
        .from('services')
        .select('rating')
        .not('rating', 'is', null)
        .gte('completed_date', gte).lte('completed_date', lte);

      const ratings = (ratingData || []).map(r => r.rating);
      const avg = ratings.length > 0
        ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
        : null;
      months.push({ month: `${m}/${y}`, avg, count: ratings.length });
    }

    const { data: allRatings } = await supabase
      .from('services')
      .select('rating')
      .not('rating', 'is', null);

    const distMap = {};
    for (const r of (allRatings || [])) {
      distMap[r.rating] = (distMap[r.rating] || 0) + 1;
    }
    const distribution = Object.entries(distMap)
      .map(([rating, count]) => ({ rating: parseInt(rating), count }))
      .sort((a, b) => a.rating - b.rating);

    const allR = (allRatings || []).map(r => r.rating);
    const overallAvg = allR.length > 0
      ? parseFloat((allR.reduce((a, b) => a + b, 0) / allR.length).toFixed(1))
      : null;

    res.json({ monthly: months, distribution, overall: { avg: overallAvg, count: allR.length } });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Clientes em risco
router.get('/at-risk', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_at_risk_clients');
    if (!error && data) return res.json(data);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data: clients, error: err2 } = await supabase
      .from('clients')
      .select('id, name, phone, whatsapp')
      .eq('status', 'active');
    if (err2) throw err2;

    const results = [];
    for (const c of (clients || [])) {
      const [{ data: ratings }, { data: overdueCharges }] = await Promise.all([
        supabase.from('services').select('rating').eq('client_id', c.id).not('rating', 'is', null).gte('completed_date', cutoffStr),
        supabase.from('charges').select('value').eq('client_id', c.id).eq('status', 'overdue')
      ]);

      const ratingValues = (ratings || []).map(r => r.rating);
      const avgRating = ratingValues.length > 0
        ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
        : 0;
      const overdueAmount = sum(overdueCharges, 'value');
      const overdueCount = (overdueCharges || []).length;

      if ((avgRating > 0 && avgRating <= 2.5) || overdueCount > 0) {
        results.push({ ...c, avg_rating: avgRating, overdue_count: overdueCount, overdue_amount: overdueAmount });
      }
    }
    results.sort((a, b) => b.overdue_amount - a.overdue_amount || a.avg_rating - b.avg_rating);
    res.json(results);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Crescimento da base
router.get('/client-growth', authenticate, async (req, res) => {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const y = d.getFullYear();
      const { gte, lte } = monthRange(y, d.getMonth() + 1);

      const [{ count: newClients }, { count: activeTotal }] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', gte).lte('created_at', lte),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('created_at', lte)
      ]);

      months.push({ month: `${m}/${y}`, new_clients: newClients || 0, active_total: activeTotal || 0 });
    }
    res.json(months);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Produtividade da equipe
router.get('/team-productivity', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const { gte, lte } = monthRange(y, m);

    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, name, function')
      .eq('status', 'active');
    if (error) throw error;

    const results = [];
    for (const e of (employees || [])) {
      const { data: svcs } = await supabase
        .from('services')
        .select('rating, service_category')
        .eq('employee_id', e.id)
        .eq('status', 'completed')
        .gte('completed_date', gte)
        .lte('completed_date', lte);

      const ratings = (svcs || []).map(s => s.rating).filter(r => r !== null);
      const avgRating = ratings.length > 0
        ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
        : null;

      results.push({
        id: e.id,
        name: e.name,
        function: e.function,
        services_completed: (svcs || []).length,
        avg_rating: avgRating,
        pool_count: (svcs || []).filter(s => s.service_category === 'pool').length,
        garden_count: (svcs || []).filter(s => s.service_category === 'garden').length
      });
    }
    results.sort((a, b) => b.services_completed - a.services_completed);
    res.json(results);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Qualidade da agua por cliente
router.get('/water-quality/:clientId', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('scheduled_date, completed_date, water_quality')
      .eq('client_id', req.params.clientId)
      .eq('status', 'completed')
      .neq('water_quality', '{}')
      .order('completed_date', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json((data || []).map(s => ({
      date: s.completed_date || s.scheduled_date,
      ...JSON.parse(s.water_quality || '{}')
    })));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Piscinas fora do padrao
router.get('/water-quality-alerts', authenticate, async (req, res) => {
  try {
    const { data: settingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'water_quality_params')
      .maybeSingle();

    const params = JSON.parse(settingRow?.value || '{}');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data: recent, error } = await supabase
      .from('services')
      .select('id, water_quality, completed_date, client_id')
      .eq('status', 'completed')
      .neq('water_quality', '{}')
      .gte('completed_date', cutoffStr);

    if (error) throw error;

    // Lookup clients separately
    const clientIds = [...new Set((recent || []).map(s => s.client_id).filter(Boolean))];
    const { data: clients } = clientIds.length
      ? await supabase.from('clients').select('id, name, whatsapp').in('id', clientIds)
      : { data: [] };
    const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]));

    const alerts = [];
    for (const svc of (recent || [])) {
      const wq = JSON.parse(svc.water_quality || '{}');
      const issues = [];
      for (const [key, config] of Object.entries(params)) {
        const val = wq[key];
        if (val !== undefined && val !== null) {
          if (val < config.min || val > config.max) {
            issues.push(`${config.label}: ${val} (ideal: ${config.min}-${config.max})`);
          }
        }
      }
      if (issues.length > 0) {
        const client = clientMap[svc.client_id] || {};
        alerts.push({
          id: svc.id,
          completed_date: svc.completed_date,
          client_name: client.name || null,
          whatsapp: client.whatsapp || null,
          issues
        });
      }
    }
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Consumo de produtos
router.get('/product-consumption', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const { gte, lte } = monthRange(y, m);

    const { data, error } = await supabase.rpc('get_product_consumption', { month_start: gte, month_end: lte });
    if (!error && data) {
      const totalCost = (data || []).reduce((s, c) => s + parseFloat(c.total_cost || 0), 0);
      return res.json({ items: data, total_cost: totalCost });
    }

    // Fallback: aggregate in JS — fetch movements then lookup products separately
    const { data: movements, error: err2 } = await supabase
      .from('stock_movements')
      .select('product_id, quantity')
      .eq('type', 'out')
      .eq('reference_type', 'service')
      .gte('created_at', gte)
      .lte('created_at', lte);

    if (err2) throw err2;

    // Lookup products separately
    const productIds = [...new Set((movements || []).map(mv => mv.product_id).filter(Boolean))];
    const { data: products } = productIds.length
      ? await supabase.from('products').select('id, name, unit, cost_price').in('id', productIds)
      : { data: [] };
    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

    const prodMap = {};
    for (const mv of (movements || [])) {
      const id = mv.product_id;
      const prod = productMap[id] || {};
      if (!prodMap[id]) {
        prodMap[id] = {
          name: prod.name || null,
          unit: prod.unit || null,
          cost_price: parseFloat(prod.cost_price || 0),
          total_used: 0,
          total_cost: 0
        };
      }
      prodMap[id].total_used += parseFloat(mv.quantity);
      prodMap[id].total_cost += parseFloat(mv.quantity) * prodMap[id].cost_price;
    }

    const consumption = Object.values(prodMap).sort((a, b) => b.total_cost - a.total_cost);
    const totalCost = consumption.reduce((s, c) => s + c.total_cost, 0);
    res.json({ items: consumption, total_cost: totalCost });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Estoque atual
router.get('/stock', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('category')
      .order('name');

    if (error) throw error;

    const products = (data || []).map(p => ({
      ...p,
      stock_value: parseFloat(p.stock_quantity) * parseFloat(p.cost_price),
      is_low: p.stock_quantity <= p.min_stock
    })).sort((a, b) => b.is_low - a.is_low);

    const totalValue = products.reduce((s, p) => s + p.stock_value, 0);
    const lowCount = products.filter(p => p.is_low).length;
    res.json({ products, total_value: totalValue, low_stock_count: lowCount });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Historico completo do cliente
router.get('/client-history/:clientId', authenticate, async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.clientId)
      .maybeSingle();

    if (error || !client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    client.service_types = JSON.parse(client.service_types || '[]');

    const [{ data: servicesRaw }, { data: charges }] = await Promise.all([
      supabase.from('services').select('*').eq('client_id', client.id).order('scheduled_date', { ascending: false }),
      supabase.from('charges').select('*').eq('client_id', client.id).order('due_date', { ascending: false })
    ]);

    // Lookup employee names separately
    const empIds = [...new Set((servicesRaw || []).map(s => s.employee_id).filter(Boolean))];
    const { data: emps } = empIds.length
      ? await supabase.from('employees').select('id, name').in('id', empIds)
      : { data: [] };
    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));

    const servicesFormatted = (servicesRaw || []).map(s => ({
      ...s,
      employee_name: empMap[s.employee_id] || null,
      checklist: JSON.parse(s.checklist || '[]'),
      water_quality: JSON.parse(s.water_quality || '{}'),
      products_used: JSON.parse(s.products_used || '[]'),
      photos: JSON.parse(s.photos || '[]')
    }));

    const totalPaid = (charges || []).filter(c => c.status === 'paid').reduce((s, c) => s + parseFloat(c.value), 0);
    const totalOverdue = (charges || []).filter(c => c.status === 'overdue').reduce((s, c) => s + parseFloat(c.value), 0);
    const rated = servicesFormatted.filter(s => s.rating);
    const avgRating = rated.length > 0 ? rated.reduce((s, c) => s + c.rating, 0) / rated.length : null;

    res.json({
      client, services: servicesFormatted, charges: charges || [],
      stats: {
        total_services: servicesFormatted.length,
        completed_services: servicesFormatted.filter(s => s.status === 'completed').length,
        total_paid: totalPaid, total_overdue: totalOverdue, avg_rating: avgRating
      }
    });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
