const express = require('express');
const multer = require('multer');
const { supabase } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateRecurringServices, generateMonthlyCharge } = require('../utils/generators');
const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const errMsg = (e) => isProd ? 'Erro interno do servidor' : e.message;

// Use memory storage — files go to Supabase Storage, not disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Listar clientes
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = supabase
      .from('clients')
      .select('*')
      .order('name');

    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,cpf.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Gather unique employee IDs
    const empIds = [...new Set((data || []).map(r => r.responsible_employee_id).filter(Boolean))];
    const { data: emps } = empIds.length
      ? await supabase.from('employees').select('id, name').in('id', empIds)
      : { data: [] };
    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));

    // Get overdue status for each client
    for (const c of data) {
      c.employee_name = empMap[c.responsible_employee_id] || null;
      c.service_types = JSON.parse(c.service_types || '[]');

      const { count } = await supabase
        .from('charges')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', c.id)
        .eq('status', 'overdue');
      c.has_overdue = (count || 0) > 0;
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Buscar cliente por ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !client) return res.status(404).json({ error: 'Cliente nao encontrado' });

    // Lookup responsible employee
    if (client.responsible_employee_id) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id, name')
        .eq('id', client.responsible_employee_id)
        .maybeSingle();
      client.employee_name = emp?.name || null;
    } else {
      client.employee_name = null;
    }
    client.service_types = JSON.parse(client.service_types || '[]');

    const { data: charges } = await supabase
      .from('charges')
      .select('*')
      .eq('client_id', client.id)
      .order('due_date', { ascending: false })
      .limit(20);

    // Fetch services separately, then lookup employees
    const { data: servicesRaw } = await supabase
      .from('services')
      .select('*')
      .eq('client_id', client.id)
      .order('scheduled_date', { ascending: false })
      .limit(30);

    const svcEmpIds = [...new Set((servicesRaw || []).map(s => s.employee_id).filter(Boolean))];
    const { data: svcEmps } = svcEmpIds.length
      ? await supabase.from('employees').select('id, name').in('id', svcEmpIds)
      : { data: [] };
    const svcEmpMap = Object.fromEntries((svcEmps || []).map(e => [e.id, e.name]));

    // Fetch kit separately, then lookup products
    const { data: kitRaw } = await supabase
      .from('client_kits')
      .select('*')
      .eq('client_id', client.id);

    const productIds = [...new Set((kitRaw || []).map(k => k.product_id).filter(Boolean))];
    const { data: products } = productIds.length
      ? await supabase.from('products').select('id, name, unit').in('id', productIds)
      : { data: [] };
    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

    const servicesFormatted = (servicesRaw || []).map(s => ({
      ...s,
      employee_name: svcEmpMap[s.employee_id] || null,
      checklist: JSON.parse(s.checklist || '[]'),
      water_quality: JSON.parse(s.water_quality || '{}'),
      products_used: JSON.parse(s.products_used || '[]'),
      photos: JSON.parse(s.photos || '[]')
    }));

    const kitFormatted = (kitRaw || []).map(k => ({
      ...k,
      product_name: productMap[k.product_id]?.name || null,
      unit: productMap[k.product_id]?.unit || null
    }));

    res.json({ ...client, charges: charges || [], services: servicesFormatted, kit: kitFormatted });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Criar cliente
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name, cpf, phone, whatsapp, email, address, address_number, neighborhood, city, state, zip_code, reference,
      secondary_contact_name, secondary_contact_phone, secondary_contact_relation,
      service_types, frequency, preferred_day, plan_type, monthly_value, payment_day,
      responsible_employee_id, start_date, notes, kit
    } = req.body;
    if (!name || !phone || !address) return res.status(400).json({ error: 'Nome, telefone e endereco obrigatorios' });

    const { data, error } = await supabase
      .from('clients')
      .insert({
        name, cpf: cpf || null, phone, whatsapp: whatsapp || phone, email: email || null,
        address, address_number: address_number || null, neighborhood: neighborhood || null,
        city: city || null, state: state || 'SP', zip_code: zip_code || null, reference: reference || null,
        secondary_contact_name: secondary_contact_name || null,
        secondary_contact_phone: secondary_contact_phone || null,
        secondary_contact_relation: secondary_contact_relation || null,
        service_types: JSON.stringify(service_types || []),
        frequency: frequency || 'monthly',
        preferred_day: preferred_day || null,
        plan_type: plan_type || 'basic',
        monthly_value: monthly_value || 0,
        payment_day: payment_day || 10,
        responsible_employee_id: responsible_employee_id || null,
        start_date: start_date || new Date().toISOString().split('T')[0],
        notes: notes || null,
        status: 'active'
      })
      .select('id')
      .single();

    if (error) throw error;
    const clientId = data.id;

    if (plan_type === 'complete' && kit && kit.length > 0) {
      for (const item of kit) {
        await supabase.from('client_kits').insert({
          client_id: clientId, product_id: item.product_id, quantity: item.quantity
        });
      }
    }

    await generateRecurringServices(clientId, start_date || new Date().toISOString().split('T')[0]);
    if (monthly_value > 0) await generateMonthlyCharge(clientId);

    await supabase.from('activity_log').insert({
      user_id: req.user.id, action: 'create', entity: 'client', entity_id: clientId
    });

    res.json({ id: clientId, message: 'Cliente cadastrado com sucesso' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Atualizar cliente
router.put('/:id', authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const {
      name, cpf, phone, whatsapp, email, address, address_number, neighborhood, city, state, zip_code, reference,
      secondary_contact_name, secondary_contact_phone, secondary_contact_relation,
      service_types, frequency, preferred_day, plan_type, monthly_value, payment_day,
      responsible_employee_id, start_date, status, notes, kit
    } = req.body;

    const { error } = await supabase
      .from('clients')
      .update({
        name, cpf: cpf || null, phone, whatsapp: whatsapp || phone, email: email || null,
        address, address_number: address_number || null, neighborhood: neighborhood || null,
        city: city || null, state: state || 'SP', zip_code: zip_code || null, reference: reference || null,
        secondary_contact_name: secondary_contact_name || null,
        secondary_contact_phone: secondary_contact_phone || null,
        secondary_contact_relation: secondary_contact_relation || null,
        service_types: JSON.stringify(service_types || []),
        frequency, preferred_day: preferred_day || null,
        plan_type: plan_type || 'basic', monthly_value: monthly_value || 0, payment_day: payment_day || 10,
        responsible_employee_id: responsible_employee_id || null,
        start_date, status: status || 'active', notes: notes || null
      })
      .eq('id', id);

    if (error) throw error;

    if (kit !== undefined) {
      await supabase.from('client_kits').delete().eq('client_id', id);
      if (plan_type === 'complete' && kit && kit.length > 0) {
        for (const item of kit) {
          await supabase.from('client_kits').insert({
            client_id: id, product_id: item.product_id, quantity: item.quantity
          });
        }
      }
    }

    res.json({ message: 'Cliente atualizado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Upload de contrato → Supabase Storage
router.post('/:id/contract', authenticate, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });

    const ext = req.file.originalname.split('.').pop();
    const filePath = `contracts/contract_${req.params.id}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const { error } = await supabase
      .from('clients')
      .update({ contract_file: publicUrl })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ url: publicUrl, message: 'Contrato salvo' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Gerar contrato PDF
router.get('/:id/contract/generate', authenticate, async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    client.service_types = JSON.parse(client.service_types || '[]');

    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach(s => settings[s.key] = s.value);

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 60 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrato_${client.name.replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);

    const serviceLabels = { pool: 'Manutencao de Piscina', garden: 'Jardinagem', both: 'Piscina e Jardinagem' };
    const freqLabels = { weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', ondemand: 'Sob demanda' };
    const template = settings.contract_template || '';
    const filled = template
      .replace('{nome_cliente}', client.name)
      .replace('{cpf}', client.cpf || 'Nao informado')
      .replace('{endereco}', `${client.address}${client.address_number ? ', ' + client.address_number : ''}, ${client.neighborhood || ''}, ${client.city || ''}`)
      .replace('{nome_empresa}', settings.company_name || 'Verde & Azul')
      .replace('{servicos}', client.service_types.map(s => serviceLabels[s] || s).join(', '))
      .replace('{frequencia}', freqLabels[client.frequency] || client.frequency)
      .replace('{valor}', Number(client.monthly_value).toFixed(2).replace('.', ','))
      .replace('{dia_vencimento}', client.payment_day)
      .replace('{data_inicio}', client.start_date || '')
      .replace('{data_contrato}', new Date().toLocaleDateString('pt-BR'));

    doc.fontSize(12).font('Helvetica').text(filled, { align: 'left', lineGap: 4 });
    doc.end();
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

// Log de mensagem
router.post('/:id/message-log', authenticate, async (req, res) => {
  try {
    const { type, message } = req.body;
    const { error } = await supabase
      .from('message_log')
      .insert({ client_id: req.params.id, type, message });

    if (error) throw error;
    res.json({ message: 'Log registrado' });
  } catch (e) { res.status(500).json({ error: errMsg(e) }); }
});

module.exports = router;
