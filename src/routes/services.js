const express = require('express');
const multer = require('multer');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generatePixCode } = require('../utils/generators');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

// Memory storage — uploads go to Supabase Storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function parseService(s, clientMap, empMap) {
  const client = clientMap[s.client_id] || {};
  return {
    ...s,
    employee_name: empMap[s.employee_id] || null,
    client_name: client.name || null,
    address: client.address || null,
    neighborhood: client.neighborhood || null,
    city: client.city || null,
    client_whatsapp: client.whatsapp || null,
    checklist: JSON.parse(s.checklist || '[]'),
    water_quality: JSON.parse(s.water_quality || '{}'),
    products_used: JSON.parse(s.products_used || '[]'),
    photos: JSON.parse(s.photos || '[]')
  };
}

// Servicos do dia
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    let query = supabase
      .from('services')
      .select('*')
      .eq('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date');

    // Restrict to employee's own services if technician role
    if (req.user.role_name && req.user.role_name.startsWith('Tecnico')) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('name', req.user.name)
        .maybeSingle();
      if (emp) query = query.eq('employee_id', emp.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const clientIds = [...new Set((data || []).map(r => r.client_id).filter(Boolean))];
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))];

    const [{ data: clients }, { data: emps }] = await Promise.all([
      clientIds.length ? supabase.from('clients').select('id, name, address, neighborhood, city, whatsapp').in('id', clientIds) : Promise.resolve({ data: [] }),
      empIds.length ? supabase.from('employees').select('id, name').in('id', empIds) : Promise.resolve({ data: [] })
    ]);

    const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]));
    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));

    res.json((data || []).map(s => parseService(s, clientMap, empMap)));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Listar servicos com filtros
router.get('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, client_id, employee_id, status, month, year } = req.query;

    let query = supabase
      .from('services')
      .select('*')
      .order('scheduled_date')
      .order('client_id');

    if (month && year) {
      query = query
        .gte('scheduled_date', `${year}-${String(month).padStart(2,'0')}-01`)
        .lte('scheduled_date', `${year}-${String(month).padStart(2,'0')}-31`);
    } else {
      if (start_date) query = query.gte('scheduled_date', start_date);
      if (end_date) query = query.lte('scheduled_date', end_date);
    }
    if (client_id) query = query.eq('client_id', client_id);
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const clientIds = [...new Set((data || []).map(r => r.client_id).filter(Boolean))];
    const empIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))];

    const [{ data: clients }, { data: emps }] = await Promise.all([
      clientIds.length ? supabase.from('clients').select('id, name, address, neighborhood, whatsapp').in('id', clientIds) : Promise.resolve({ data: [] }),
      empIds.length ? supabase.from('employees').select('id, name').in('id', empIds) : Promise.resolve({ data: [] })
    ]);

    const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]));
    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));

    res.json((data || []).map(s => parseService(s, clientMap, empMap)));
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Criar servico avulso
router.post('/', authenticate, async (req, res) => {
  try {
    const { client_id, type, service_category, scheduled_date, employee_id, notes, generates_charge, extra_value } = req.body;
    if (!client_id || !scheduled_date) return res.status(400).json({ error: 'Campos obrigatorios' });

    const { data, error } = await supabase
      .from('services')
      .insert({
        client_id, type: type || 'extra', service_category: service_category || 'pool',
        scheduled_date, employee_id: employee_id || null, notes: notes || null,
        is_recurring: 0, generates_charge: generates_charge ? 1 : 0, extra_value: extra_value || 0
      })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ id: data.id, message: 'Servico agendado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Atualizar servico
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { scheduled_date, employee_id, status, notes } = req.body;
    const { error } = await supabase
      .from('services')
      .update({ scheduled_date, employee_id: employee_id || null, status: status || 'scheduled', notes: notes || null })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Servico atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Notificar chegada
router.post('/:id/notify-arrival', authenticate, async (req, res) => {
  try {
    await supabase.from('services').update({ notified_arrival: 1 }).eq('id', req.params.id);

    const { data: svc, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !svc) return res.status(404).json({ error: 'Servico nao encontrado' });

    // Lookup client and employee separately
    const [{ data: clientData }, { data: empData }] = await Promise.all([
      svc.client_id ? supabase.from('clients').select('id, name, whatsapp').eq('id', svc.client_id).maybeSingle() : Promise.resolve({ data: null }),
      svc.employee_id ? supabase.from('employees').select('id, name').eq('id', svc.employee_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach(s => settings[s.key] = s.value);

    const catLabel = svc.service_category === 'pool' ? 'piscina' : svc.service_category === 'garden' ? 'jardim' : 'manutencao';
    const msg = (settings.whatsapp_template_arrival || 'Ola {nome}! Nosso tecnico {tecnico} esta a caminho para o servico de {servico}.')
      .replace('{nome}', clientData?.name || '')
      .replace('{tecnico}', empData?.name || 'nosso tecnico')
      .replace('{servico}', catLabel);

    const whatsapp = clientData?.whatsapp?.replace(/\D/g, '');
    const waLink = `https://wa.me/55${whatsapp}?text=${encodeURIComponent(msg)}`;
    await supabase.from('message_log').insert({ client_id: svc.client_id, type: 'arrival', message: msg });
    res.json({ wa_link: waLink, message: msg });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Concluir servico
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { checklist, water_quality, products_used, visit_notes, generates_charge, extra_value } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const { data: svc, error: fetchErr } = await supabase
      .from('services')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr || !svc) return res.status(404).json({ error: 'Servico nao encontrado' });

    // Lookup client separately
    const { data: clientData } = svc.client_id
      ? await supabase.from('clients').select('id, name, whatsapp, plan_type, monthly_value').eq('id', svc.client_id).maybeSingle()
      : { data: null };

    await supabase
      .from('services')
      .update({
        status: 'completed', completed_date: today,
        checklist: JSON.stringify(checklist || []),
        water_quality: JSON.stringify(water_quality || {}),
        products_used: JSON.stringify(products_used || []),
        visit_notes: visit_notes || null
      })
      .eq('id', req.params.id);

    // Update stock for products used
    for (const pu of (products_used || [])) {
      if (pu.product_id && pu.quantity) {
        const { data: prod } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', pu.product_id)
          .maybeSingle();

        if (prod) {
          await supabase.from('products')
            .update({ stock_quantity: Math.max(0, (prod.stock_quantity || 0) - Number(pu.quantity)) })
            .eq('id', pu.product_id);
        }

        await supabase.from('stock_movements').insert({
          product_id: pu.product_id, type: 'out', quantity: pu.quantity,
          reference_id: req.params.id, reference_type: 'service'
        });
      }
    }

    if (generates_charge && extra_value > 0) {
      const pixCode = await generatePixCode(extra_value);
      await supabase.from('charges').insert({
        client_id: svc.client_id, description: `Servico extra - ${today}`,
        type: 'extra', value: extra_value, due_date: today, status: 'pending',
        service_id: req.params.id, pix_code: pixCode
      });
    }

    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach(s => settings[s.key] = s.value);

    const checklistArr = checklist || [];
    const checklistText = checklistArr.filter(i => i.done).map(i => `v ${i.label}`).join('\n') || 'Servico realizado';
    const productsUsedArr = products_used || [];
    const productsText = productsUsedArr.length > 0
      ? productsUsedArr.map(p => `* ${p.name}: ${p.quantity} ${p.unit}`).join('\n')
      : 'Nenhum produto aplicado';

    const { data: nextSvc } = await supabase
      .from('services')
      .select('scheduled_date')
      .eq('client_id', svc.client_id)
      .eq('status', 'scheduled')
      .gt('scheduled_date', today)
      .order('scheduled_date')
      .limit(1)
      .maybeSingle();

    const nextDate = nextSvc ? new Date(nextSvc.scheduled_date).toLocaleDateString('pt-BR') : 'A definir';
    const catLabel = svc.service_category === 'pool' ? 'Piscina' : svc.service_category === 'garden' ? 'Jardim' : 'Manutencao';

    let reportMsg = (settings.whatsapp_template_report || '')
      .replace('{nome}', clientData?.name || '')
      .replace('{servico}', catLabel)
      .replace('{data}', new Date(today).toLocaleDateString('pt-BR'))
      .replace('{checklist}', checklistText)
      .replace('{produtos}', productsText)
      .replace('{proxima_visita}', nextDate);

    const whatsapp = clientData?.whatsapp?.replace(/\D/g, '');
    const waLink = reportMsg && whatsapp ? `https://wa.me/55${whatsapp}?text=${encodeURIComponent(reportMsg)}` : null;

    await supabase.from('services').update({ report_sent: 1 }).eq('id', req.params.id);
    await supabase.from('message_log').insert({ client_id: svc.client_id, type: 'service_report', message: reportMsg });

    res.json({ message: 'Servico concluido', wa_link: waLink, report_message: reportMsg });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Upload de fotos → Supabase Storage
router.post('/:id/photos', authenticate, upload.array('photos', 5), async (req, res) => {
  try {
    const { data: svc, error: fetchErr } = await supabase
      .from('services')
      .select('photos')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    const existingPhotos = JSON.parse(svc?.photos || '[]');
    const newPhotoUrls = [];

    for (const file of req.files) {
      const ext = file.originalname.split('.').pop();
      const filePath = `photos/svc_${req.params.id}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('photos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
      newPhotoUrls.push(urlData.publicUrl);
    }

    const allPhotos = [...existingPhotos, ...newPhotoUrls];
    await supabase.from('services').update({ photos: JSON.stringify(allPhotos) }).eq('id', req.params.id);
    res.json({ photos: allPhotos });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Registrar avaliacao
router.post('/:id/rating', authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Avaliacao invalida' });

    const { error } = await supabase
      .from('services')
      .update({ rating, rating_comment: comment || null })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Avaliacao registrada' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Cancelar servico
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('services')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Servico cancelado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
