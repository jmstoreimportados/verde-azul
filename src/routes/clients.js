const express = require('express');
const path = require('path');
const multer = require('multer');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generateRecurringServices, generateMonthlyCharge } = require('../utils/generators');
const router = express.Router();

const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/contracts' : path.join(__dirname, '../../uploads/contracts');
const contractStorage = multer.diskStorage({
  destination: (req, file, cb) => { require('fs').mkdirSync(uploadDir, { recursive: true }); cb(null, uploadDir); },
  filename: (req, file, cb) => cb(null, `contract_${req.params.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: contractStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Listar clientes
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { search, status, service_type } = req.query;
    let query = `SELECT c.*, e.name as employee_name FROM clients c LEFT JOIN employees e ON c.responsible_employee_id = e.id WHERE 1=1`;
    const params = [];
    let i = 1;

    if (status) { query += ` AND c.status = $${i++}`; params.push(status); }
    if (search) {
      query += ` AND (c.name ILIKE $${i} OR c.phone LIKE $${i+1} OR c.cpf LIKE $${i+2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`); i += 3;
    }
    query += ' ORDER BY c.name';

    const clients = await db.prepare(query).all(...params);
    for (const c of clients) {
      c.service_types = JSON.parse(c.service_types || '[]');
      const overdue = await db.prepare("SELECT COUNT(*) as cnt FROM charges WHERE client_id = $1 AND status = 'overdue'").get(c.id);
      c.has_overdue = parseInt(overdue.cnt) > 0;
    }
    res.json(clients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buscar cliente por ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const client = await db.prepare('SELECT c.*, e.name as employee_name FROM clients c LEFT JOIN employees e ON c.responsible_employee_id = e.id WHERE c.id = $1').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    client.service_types = JSON.parse(client.service_types || '[]');

    const charges = await db.prepare('SELECT * FROM charges WHERE client_id = $1 ORDER BY due_date DESC LIMIT 20').all(client.id);
    const services = await db.prepare('SELECT s.*, e.name as employee_name FROM services s LEFT JOIN employees e ON s.employee_id = e.id WHERE s.client_id = $1 ORDER BY s.scheduled_date DESC LIMIT 30').all(client.id);
    const kit = await db.prepare('SELECT ck.*, p.name as product_name, p.unit FROM client_kits ck JOIN products p ON ck.product_id = p.id WHERE ck.client_id = $1').all(client.id);

    services.forEach(s => {
      s.checklist = JSON.parse(s.checklist || '[]');
      s.water_quality = JSON.parse(s.water_quality || '{}');
      s.products_used = JSON.parse(s.products_used || '[]');
      s.photos = JSON.parse(s.photos || '[]');
    });
    res.json({ ...client, charges, services, kit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar cliente
router.post('/', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const {
      name, cpf, phone, whatsapp, email, address, address_number, neighborhood, city, state, zip_code, reference,
      secondary_contact_name, secondary_contact_phone, secondary_contact_relation,
      service_types, frequency, preferred_day, plan_type, monthly_value, payment_day,
      responsible_employee_id, start_date, notes, kit
    } = req.body;
    if (!name || !phone || !address) return res.status(400).json({ error: 'Nome, telefone e endereco obrigatorios' });

    const result = await db.prepare(`INSERT INTO clients (name,cpf,phone,whatsapp,email,address,address_number,neighborhood,city,state,zip_code,reference,secondary_contact_name,secondary_contact_phone,secondary_contact_relation,service_types,frequency,preferred_day,plan_type,monthly_value,payment_day,responsible_employee_id,start_date,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'active')`).run(
      name, cpf||null, phone, whatsapp||phone, email||null,
      address, address_number||null, neighborhood||null, city||null, state||'SP', zip_code||null, reference||null,
      secondary_contact_name||null, secondary_contact_phone||null, secondary_contact_relation||null,
      JSON.stringify(service_types||[]), frequency||'monthly', preferred_day||null,
      plan_type||'basic', monthly_value||0, payment_day||10,
      responsible_employee_id||null, start_date||new Date().toISOString().split('T')[0], notes||null
    );
    const clientId = result.lastInsertRowid;

    if (plan_type === 'complete' && kit && kit.length > 0) {
      for (const item of kit) {
        await db.prepare('INSERT INTO client_kits (client_id, product_id, quantity) VALUES ($1, $2, $3)').run(clientId, item.product_id, item.quantity);
      }
    }

    await generateRecurringServices(db, clientId, start_date || new Date().toISOString().split('T')[0]);
    if (monthly_value > 0) await generateMonthlyCharge(db, clientId);
    await db.prepare('INSERT INTO activity_log (user_id, action, entity, entity_id) VALUES ($1, $2, $3, $4)').run(req.user.id, 'create', 'client', clientId);

    res.json({ id: clientId, message: 'Cliente cadastrado com sucesso' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar cliente
router.put('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const id = req.params.id;
    const {
      name, cpf, phone, whatsapp, email, address, address_number, neighborhood, city, state, zip_code, reference,
      secondary_contact_name, secondary_contact_phone, secondary_contact_relation,
      service_types, frequency, preferred_day, plan_type, monthly_value, payment_day,
      responsible_employee_id, start_date, status, notes, kit
    } = req.body;

    await db.prepare(`UPDATE clients SET name=$1,cpf=$2,phone=$3,whatsapp=$4,email=$5,address=$6,address_number=$7,neighborhood=$8,city=$9,state=$10,zip_code=$11,reference=$12,secondary_contact_name=$13,secondary_contact_phone=$14,secondary_contact_relation=$15,service_types=$16,frequency=$17,preferred_day=$18,plan_type=$19,monthly_value=$20,payment_day=$21,responsible_employee_id=$22,start_date=$23,status=$24,notes=$25 WHERE id=$26`).run(
      name, cpf||null, phone, whatsapp||phone, email||null,
      address, address_number||null, neighborhood||null, city||null, state||'SP', zip_code||null, reference||null,
      secondary_contact_name||null, secondary_contact_phone||null, secondary_contact_relation||null,
      JSON.stringify(service_types||[]), frequency, preferred_day||null,
      plan_type||'basic', monthly_value||0, payment_day||10,
      responsible_employee_id||null, start_date, status||'active', notes||null, id
    );

    if (kit !== undefined) {
      await db.prepare('DELETE FROM client_kits WHERE client_id = $1').run(id);
      if (plan_type === 'complete' && kit && kit.length > 0) {
        for (const item of kit) {
          await db.prepare('INSERT INTO client_kits (client_id, product_id, quantity) VALUES ($1, $2, $3)').run(id, item.product_id, item.quantity);
        }
      }
    }
    res.json({ message: 'Cliente atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload de contrato
router.post('/:id/contract', authenticate, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
    const db = getDb();
    await db.prepare('UPDATE clients SET contract_file = $1 WHERE id = $2').run(req.file.filename, req.params.id);
    res.json({ filename: req.file.filename, message: 'Contrato salvo' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Gerar contrato PDF
router.get('/:id/contract/generate', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const client = await db.prepare('SELECT * FROM clients WHERE id = $1').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    client.service_types = JSON.parse(client.service_types || '[]');

    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Log de mensagem
router.post('/:id/message-log', authenticate, async (req, res) => {
  try {
    const { type, message } = req.body;
    const db = getDb();
    await db.prepare('INSERT INTO message_log (client_id, type, message) VALUES ($1, $2, $3)').run(req.params.id, type, message);
    res.json({ message: 'Log registrado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
