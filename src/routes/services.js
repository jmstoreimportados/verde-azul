const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../../database/db');
const { authenticate } = require('../middleware/auth');
const { generatePixCode } = require('../utils/generators');
const router = express.Router();

const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/photos' : path.join(__dirname, '../../uploads/photos');
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => { require('fs').mkdirSync(uploadDir, { recursive: true }); cb(null, uploadDir); },
  filename: (req, file, cb) => cb(null, `svc_${req.params.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: photoStorage, limits: { fileSize: 8 * 1024 * 1024 } });

// Servicos do dia
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const db = getDb();
    let query = `SELECT s.*, c.name as client_name, c.address, c.neighborhood, c.city, c.whatsapp as client_whatsapp, e.name as employee_name FROM services s JOIN clients c ON s.client_id = c.id LEFT JOIN employees e ON s.employee_id = e.id WHERE s.scheduled_date = $1 AND s.status != 'cancelled'`;
    const params = [today];
    let i = 2;

    if (req.user.role_name && req.user.role_name.startsWith('Tecnico')) {
      const emp = await db.prepare('SELECT id FROM employees WHERE name = $1').get(req.user.name);
      if (emp) { query += ` AND s.employee_id = $${i++}`; params.push(emp.id); }
    }
    query += ' ORDER BY c.name';
    const services = await db.prepare(query).all(...params);
    services.forEach(s => {
      s.checklist = JSON.parse(s.checklist || '[]');
      s.water_quality = JSON.parse(s.water_quality || '{}');
      s.products_used = JSON.parse(s.products_used || '[]');
    });
    res.json(services);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar servicos com filtros
router.get('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, client_id, employee_id, status, month, year } = req.query;
    const db = getDb();
    let query = `SELECT s.*, c.name as client_name, c.address, c.neighborhood, c.whatsapp as client_whatsapp, e.name as employee_name FROM services s JOIN clients c ON s.client_id = c.id LEFT JOIN employees e ON s.employee_id = e.id WHERE 1=1`;
    const params = [];
    let i = 1;

    if (month && year) {
      query += ` AND s.scheduled_date LIKE $${i++}`;
      params.push(`${year}-${String(month).padStart(2,'0')}-%`);
    } else {
      if (start_date) { query += ` AND s.scheduled_date >= $${i++}`; params.push(start_date); }
      if (end_date) { query += ` AND s.scheduled_date <= $${i++}`; params.push(end_date); }
    }
    if (client_id) { query += ` AND s.client_id = $${i++}`; params.push(client_id); }
    if (employee_id) { query += ` AND s.employee_id = $${i++}`; params.push(employee_id); }
    if (status) { query += ` AND s.status = $${i++}`; params.push(status); }
    query += ' ORDER BY s.scheduled_date, c.name';

    const services = await db.prepare(query).all(...params);
    services.forEach(s => {
      s.checklist = JSON.parse(s.checklist || '[]');
      s.water_quality = JSON.parse(s.water_quality || '{}');
      s.products_used = JSON.parse(s.products_used || '[]');
      s.photos = JSON.parse(s.photos || '[]');
    });
    res.json(services);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar servico avulso
router.post('/', authenticate, async (req, res) => {
  try {
    const { client_id, type, service_category, scheduled_date, employee_id, notes, generates_charge, extra_value } = req.body;
    if (!client_id || !scheduled_date) return res.status(400).json({ error: 'Campos obrigatorios' });
    const db = getDb();
    const result = await db.prepare("INSERT INTO services (client_id, type, service_category, scheduled_date, employee_id, notes, is_recurring, generates_charge, extra_value) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)").run(client_id, type||'extra', service_category||'pool', scheduled_date, employee_id||null, notes||null, generates_charge?1:0, extra_value||0);
    res.json({ id: result.lastInsertRowid, message: 'Servico agendado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Atualizar servico
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { scheduled_date, employee_id, status, notes } = req.body;
    const db = getDb();
    await db.prepare("UPDATE services SET scheduled_date=$1, employee_id=$2, status=$3, notes=$4 WHERE id=$5").run(scheduled_date, employee_id||null, status||'scheduled', notes||null, req.params.id);
    res.json({ message: 'Servico atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Notificar chegada
router.post('/:id/notify-arrival', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.prepare('UPDATE services SET notified_arrival = 1 WHERE id = $1').run(req.params.id);
    const svc = await db.prepare('SELECT s.*, c.name as client_name, c.whatsapp, e.name as employee_name FROM services s JOIN clients c ON s.client_id = c.id LEFT JOIN employees e ON s.employee_id = e.id WHERE s.id = $1').get(req.params.id);

    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

    const catLabel = svc.service_category === 'pool' ? 'piscina' : svc.service_category === 'garden' ? 'jardim' : 'manutencao';
    let msg = (settings.whatsapp_template_arrival || 'Ola {nome}! Nosso tecnico {tecnico} esta a caminho para o servico de {servico}.')
      .replace('{nome}', svc.client_name)
      .replace('{tecnico}', svc.employee_name || 'nosso tecnico')
      .replace('{servico}', catLabel);

    const whatsapp = svc.whatsapp?.replace(/\D/g, '');
    const waLink = `https://wa.me/55${whatsapp}?text=${encodeURIComponent(msg)}`;
    await db.prepare('INSERT INTO message_log (client_id, type, message) VALUES ($1, $2, $3)').run(svc.client_id, 'arrival', msg);
    res.json({ wa_link: waLink, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Concluir servico
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { checklist, water_quality, products_used, visit_notes, generates_charge, extra_value } = req.body;
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const svc = await db.prepare('SELECT s.*, c.name as client_name, c.whatsapp, c.plan_type, c.monthly_value FROM services s JOIN clients c ON s.client_id = c.id WHERE s.id = $1').get(req.params.id);
    if (!svc) return res.status(404).json({ error: 'Servico nao encontrado' });

    await db.prepare("UPDATE services SET status='completed', completed_date=$1, checklist=$2, water_quality=$3, products_used=$4, visit_notes=$5 WHERE id=$6").run(today, JSON.stringify(checklist||[]), JSON.stringify(water_quality||{}), JSON.stringify(products_used||[]), visit_notes||null, req.params.id);

    for (const pu of (products_used || [])) {
      if (pu.product_id && pu.quantity) {
        await db.prepare('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2').run(pu.quantity, pu.product_id);
        await db.prepare("INSERT INTO stock_movements (product_id, type, quantity, reference_id, reference_type) VALUES ($1, 'out', $2, $3, 'service')").run(pu.product_id, pu.quantity, req.params.id);
      }
    }

    if (generates_charge && extra_value > 0) {
      const pixCode = await generatePixCode(db, extra_value);
      await db.prepare("INSERT INTO charges (client_id, description, type, value, due_date, status, service_id, pix_code) VALUES ($1, $2, 'extra', $3, $4, 'pending', $5, $6)").run(svc.client_id, `Servico extra - ${today}`, extra_value, today, req.params.id, pixCode);
    }

    const settingsRows = await db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(s => settings[s.key] = s.value);

    const checklistArr = checklist || [];
    const checklistText = checklistArr.filter(i => i.done).map(i => `v ${i.label}`).join('\n') || 'Servico realizado';
    const productsUsedArr = products_used || [];
    const productsText = productsUsedArr.length > 0 ? productsUsedArr.map(p => `* ${p.name}: ${p.quantity} ${p.unit}`).join('\n') : 'Nenhum produto aplicado';

    const nextSvc = await db.prepare("SELECT scheduled_date FROM services WHERE client_id = $1 AND status = 'scheduled' AND scheduled_date > $2 ORDER BY scheduled_date LIMIT 1").get(svc.client_id, today);
    const nextDate = nextSvc ? new Date(nextSvc.scheduled_date).toLocaleDateString('pt-BR') : 'A definir';

    const catLabel = svc.service_category === 'pool' ? 'Piscina' : svc.service_category === 'garden' ? 'Jardim' : 'Manutencao';
    let reportMsg = (settings.whatsapp_template_report || '')
      .replace('{nome}', svc.client_name)
      .replace('{servico}', catLabel)
      .replace('{data}', new Date(today).toLocaleDateString('pt-BR'))
      .replace('{checklist}', checklistText)
      .replace('{produtos}', productsText)
      .replace('{proxima_visita}', nextDate);

    const whatsapp = svc.whatsapp?.replace(/\D/g, '');
    const waLink = reportMsg && whatsapp ? `https://wa.me/55${whatsapp}?text=${encodeURIComponent(reportMsg)}` : null;

    await db.prepare('UPDATE services SET report_sent = 1 WHERE id = $1').run(req.params.id);
    await db.prepare('INSERT INTO message_log (client_id, type, message) VALUES ($1, $2, $3)').run(svc.client_id, 'service_report', reportMsg);

    res.json({ message: 'Servico concluido', wa_link: waLink, report_message: reportMsg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload de fotos
router.post('/:id/photos', authenticate, upload.array('photos', 5), async (req, res) => {
  try {
    const db = getDb();
    const svc = await db.prepare('SELECT photos FROM services WHERE id = $1').get(req.params.id);
    const existingPhotos = JSON.parse(svc?.photos || '[]');
    const newPhotos = req.files.map(f => f.filename);
    const allPhotos = [...existingPhotos, ...newPhotos];
    await db.prepare('UPDATE services SET photos = $1 WHERE id = $2').run(JSON.stringify(allPhotos), req.params.id);
    res.json({ photos: allPhotos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Registrar avaliacao
router.post('/:id/rating', authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Avaliacao invalida' });
    const db = getDb();
    await db.prepare('UPDATE services SET rating = $1, rating_comment = $2 WHERE id = $3').run(rating, comment||null, req.params.id);
    res.json({ message: 'Avaliacao registrada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cancelar servico
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDb();
    await db.prepare("UPDATE services SET status = 'cancelled' WHERE id = $1").run(req.params.id);
    res.json({ message: 'Servico cancelado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
