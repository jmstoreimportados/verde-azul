-- =====================================================
-- Verde & Azul Gestão — Schema PostgreSQL para Supabase
-- Execute este arquivo no Supabase SQL Editor
-- =====================================================

-- Roles (perfis de acesso)
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',
  is_custom INTEGER DEFAULT 0,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Usuários do sistema
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  last_login TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Log de atividades
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Funcionários/técnicos
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  function TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  address TEXT NOT NULL,
  address_number TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT DEFAULT 'SP',
  zip_code TEXT,
  reference TEXT,
  secondary_contact_name TEXT,
  secondary_contact_phone TEXT,
  secondary_contact_relation TEXT,
  service_types TEXT NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  preferred_day INTEGER,
  plan_type TEXT DEFAULT 'basic',
  monthly_value REAL DEFAULT 0,
  payment_day INTEGER DEFAULT 10,
  responsible_employee_id INTEGER,
  start_date TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  contract_file TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Produtos/insumos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'pool',
  unit TEXT DEFAULT 'kg',
  cost_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  stock_quantity REAL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Kits de produtos por cliente
CREATE TABLE IF NOT EXISTS client_kits (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 1
);

-- Movimentações de estoque
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference_id INTEGER,
  reference_type TEXT,
  unit_cost REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Serviços agendados e realizados
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'maintenance',
  service_category TEXT DEFAULT 'pool',
  scheduled_date TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  completed_date TEXT,
  employee_id INTEGER,
  notes TEXT,
  visit_notes TEXT,
  checklist TEXT DEFAULT '[]',
  water_quality TEXT DEFAULT '{}',
  products_used TEXT DEFAULT '[]',
  photos TEXT DEFAULT '[]',
  is_recurring INTEGER DEFAULT 1,
  recurrence_group TEXT,
  generates_charge INTEGER DEFAULT 0,
  extra_value REAL DEFAULT 0,
  notified_arrival INTEGER DEFAULT 0,
  report_sent INTEGER DEFAULT 0,
  rating INTEGER,
  rating_comment TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Cobranças
CREATE TABLE IF NOT EXISTS charges (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  type TEXT DEFAULT 'monthly',
  value REAL NOT NULL,
  due_date TEXT NOT NULL,
  paid_date TEXT,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  pix_code TEXT,
  service_id INTEGER,
  alert_3days_sent INTEGER DEFAULT 0,
  alert_due_sent INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Despesas operacionais
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'operational',
  value REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Orçamentos
CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  prospect_name TEXT NOT NULL,
  prospect_phone TEXT NOT NULL,
  prospect_email TEXT,
  prospect_address TEXT,
  services TEXT DEFAULT '[]',
  total_value REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  valid_until TEXT,
  notes TEXT,
  sent_at TEXT,
  responded_at TEXT,
  created_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Log de mensagens WhatsApp
CREATE TABLE IF NOT EXISTS message_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER,
  type TEXT NOT NULL,
  message TEXT,
  sent_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- Configurações do sistema
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')
);

-- =====================================================
-- DADOS INICIAIS (seed)
-- =====================================================

-- Perfis de acesso
INSERT INTO roles (name, permissions) VALUES
('Dono', '{"dashboard":["read"],"clients":["read","create","update","delete"],"agenda":["read","create","update","delete"],"financial":["read","create","update","delete"],"products":["read","create","update","delete"],"team":["read","create","update","delete"],"users":["read","create","update","delete"],"reports":["read"],"settings":["read","update"],"budgets":["read","create","update","delete"]}'),
('Gestor', '{"dashboard":["read"],"clients":["read","create","update"],"agenda":["read","create","update"],"financial":["read","create"],"products":["read","create","update"],"team":["read"],"users":[],"reports":["read"],"settings":[],"budgets":["read","create","update"]}'),
('Técnico Piscina', '{"dashboard":["read"],"clients":["read"],"agenda":["read","update"],"financial":[],"products":["read"],"team":[],"users":[],"reports":[],"settings":[],"budgets":[]}'),
('Técnico Jardim', '{"dashboard":["read"],"clients":["read"],"agenda":["read","update"],"financial":[],"products":["read"],"team":[],"users":[],"reports":[],"settings":[],"budgets":[]}')
ON CONFLICT DO NOTHING;

-- Usuário admin padrão (senha: admin123)
-- Hash gerado com bcrypt rounds=10
INSERT INTO users (name, email, password_hash, role_id)
VALUES ('Administrador', 'admin@verdeazul.com', '$2a$10$utfP7PdQ3Z/2XauNlqkICukfYFwH36GELI2iGcuKww3brMIZLZMbG', 1)
ON CONFLICT (email) DO NOTHING;

-- Configurações padrão
INSERT INTO settings (key, value) VALUES
('company_name', 'Verde & Azul Manutenção'),
('company_phone', ''),
('company_email', ''),
('pix_key', ''),
('pix_key_type', 'cpf'),
('pix_holder_name', ''),
('whatsapp_template_charge', 'Olá {nome}! 🌿 Sua mensalidade de {servico} no valor de *R$ {valor}* vence em *{vencimento}*.\n\nPague via PIX:\nChave: *{pix_chave}*\n\n{pix_copia_cola}'),
('whatsapp_template_arrival', 'Olá {nome}! 🌿 Nosso técnico *{tecnico}* está a caminho para o serviço de {servico}. Até já!'),
('whatsapp_template_report', 'Olá {nome}! ✅ Serviço de *{servico}* concluído em {data}.\n\n*Executado:*\n{checklist}\n\n*Produtos aplicados:*\n{produtos}\n\nPróxima visita: *{proxima_visita}* 🌿'),
('whatsapp_template_rating', 'Olá {nome}! Como foi o serviço de hoje? Avalie de 1 a 5 ⭐ respondendo este número. Obrigado! 🌿'),
('pool_checklist', '["Aspiração do fundo","Limpeza das paredes","Limpeza do skimmer","Verificação e limpeza do filtro","Aplicação de produtos químicos","Verificação do motor/bomba","Verificação da tampa de inspeção"]'),
('garden_checklist', '["Corte de grama","Poda de arbustos e sebes","Varrição e limpeza geral","Adubação","Controle de pragas","Verificação da irrigação"]'),
('water_quality_params', '{"ph":{"min":7.2,"max":7.6,"label":"pH"},"chlorine":{"min":1.0,"max":3.0,"label":"Cloro Livre (ppm)"},"alkalinity":{"min":80,"max":120,"label":"Alcalinidade (ppm)"},"turbidity":{"min":0,"max":1,"label":"Turbidez (NTU)"},"filter_pressure":{"min":0.5,"max":1.5,"label":"Pressão do Filtro (bar)"}}'),
('contract_template', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nCONTRATANTE: {nome_cliente}, CPF {cpf}\nEndereço: {endereco}\n\nCONTRATADA: {nome_empresa}\n\nSERVIÇOS CONTRATADOS: {servicos}\nFREQUÊNCIA: {frequencia}\nVALOR MENSAL: R$ {valor}\nVENCIMENTO: Todo dia {dia_vencimento}\nINÍCIO: {data_inicio}\n\nAssinado em {data_contrato}.\n\n_______________________\nContratante\n\n_______________________\nContratada')
ON CONFLICT (key) DO NOTHING;

-- Produtos padrão
INSERT INTO products (name, description, category, unit, cost_price, sale_price, stock_quantity, min_stock) VALUES
('Cloro Granulado', 'Cloro granulado para piscinas', 'pool', 'kg', 12, 22, 20, 5),
('Algicida', 'Algicida concentrado', 'pool', 'L', 15, 28, 10, 3),
('pH Minus', 'Redutor de pH', 'pool', 'kg', 8, 16, 10, 3),
('pH Plus', 'Elevador de pH', 'pool', 'kg', 8, 16, 10, 3),
('Clarificante', 'Clarificante para água', 'pool', 'L', 12, 22, 8, 2),
('Cloro Choque', 'Cloro de alta concentração', 'pool', 'kg', 18, 32, 5, 2),
('Floculante', 'Floculante para clarificação', 'pool', 'L', 14, 25, 5, 2),
('Alcalinizante', 'Elevador de alcalinidade', 'pool', 'kg', 9, 18, 8, 2),
('Fertilizante NPK', 'Fertilizante para jardim', 'garden', 'kg', 5, 12, 15, 4),
('Inseticida', 'Controle de pragas', 'garden', 'L', 18, 35, 5, 2)
ON CONFLICT DO NOTHING;

-- =====================================================
-- RPC FUNCTIONS FOR COMPLEX REPORTS
-- Execute these in the Supabase SQL Editor after tables are created
-- =====================================================

-- Revenue by month (last 6 months)
CREATE OR REPLACE FUNCTION get_revenue_by_month()
RETURNS TABLE (
  month TEXT,
  year INT,
  month_num INT,
  received NUMERIC,
  pending NUMERIC,
  expenses NUMERIC,
  profit NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH months AS (
    SELECT generate_series(0, 5) AS offset
  ),
  month_dates AS (
    SELECT
      date_trunc('month', NOW() - (offset || ' months')::interval) AS month_start
    FROM months
  ),
  data AS (
    SELECT
      to_char(md.month_start, 'MM/YYYY') AS month,
      EXTRACT(YEAR FROM md.month_start)::INT AS year,
      EXTRACT(MONTH FROM md.month_start)::INT AS month_num,
      COALESCE(SUM(CASE WHEN ch.status = 'paid' THEN ch.value ELSE 0 END), 0) AS received,
      COALESCE(SUM(CASE WHEN ch.status IN ('pending','overdue') THEN ch.value ELSE 0 END), 0) AS pending,
      0 AS expenses_placeholder
    FROM month_dates md
    LEFT JOIN charges ch ON ch.due_date >= to_char(md.month_start, 'YYYY-MM-01')
                        AND ch.due_date <= to_char(md.month_start + INTERVAL '1 month' - INTERVAL '1 day', 'YYYY-MM-DD')
    GROUP BY md.month_start
  )
  SELECT
    d.month,
    d.year,
    d.month_num,
    d.received,
    d.pending,
    COALESCE((
      SELECT SUM(e.value) FROM expenses e
      WHERE e.date >= to_char(date_trunc('month', make_date(d.year, d.month_num, 1)), 'YYYY-MM-01')
        AND e.date <= to_char(date_trunc('month', make_date(d.year, d.month_num, 1)) + INTERVAL '1 month' - INTERVAL '1 day', 'YYYY-MM-DD')
    ), 0) AS expenses,
    d.received - COALESCE((
      SELECT SUM(e.value) FROM expenses e
      WHERE e.date >= to_char(date_trunc('month', make_date(d.year, d.month_num, 1)), 'YYYY-MM-01')
        AND e.date <= to_char(date_trunc('month', make_date(d.year, d.month_num, 1)) + INTERVAL '1 month' - INTERVAL '1 day', 'YYYY-MM-DD')
    ), 0) AS profit
  FROM data d
  ORDER BY d.year, d.month_num;
$$;

-- Overdue charges with days overdue
CREATE OR REPLACE FUNCTION get_overdue_with_days()
RETURNS TABLE (
  id INT,
  client_id INT,
  description TEXT,
  type TEXT,
  value NUMERIC,
  due_date TEXT,
  status TEXT,
  pix_code TEXT,
  client_name TEXT,
  whatsapp TEXT,
  phone TEXT,
  days_overdue NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    ch.id, ch.client_id, ch.description, ch.type, ch.value, ch.due_date, ch.status, ch.pix_code,
    c.name AS client_name, c.whatsapp, c.phone,
    EXTRACT(EPOCH FROM (CURRENT_DATE - ch.due_date::date)) / 86400 AS days_overdue
  FROM charges ch
  JOIN clients c ON ch.client_id = c.id
  WHERE ch.status = 'overdue'
  ORDER BY days_overdue DESC;
$$;

-- Top clients by revenue
CREATE OR REPLACE FUNCTION get_top_clients(row_limit INT DEFAULT 10)
RETURNS TABLE (
  id INT,
  name TEXT,
  phone TEXT,
  plan_type TEXT,
  total_billed NUMERIC,
  charge_count BIGINT,
  service_count BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.name, c.phone, c.plan_type,
    COALESCE(SUM(ch.value), 0) AS total_billed,
    COUNT(DISTINCT ch.id) AS charge_count,
    COUNT(DISTINCT s.id) AS service_count
  FROM clients c
  LEFT JOIN charges ch ON ch.client_id = c.id AND ch.status = 'paid'
  LEFT JOIN services s ON s.client_id = c.id AND s.status = 'completed'
  WHERE c.status = 'active'
  GROUP BY c.id
  ORDER BY total_billed DESC
  LIMIT row_limit;
$$;

-- At-risk clients (low rating or overdue)
CREATE OR REPLACE FUNCTION get_at_risk_clients()
RETURNS TABLE (
  id INT,
  name TEXT,
  phone TEXT,
  whatsapp TEXT,
  avg_rating NUMERIC,
  overdue_count BIGINT,
  overdue_amount NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.name, c.phone, c.whatsapp,
    COALESCE(AVG(s.rating), 0) AS avg_rating,
    COUNT(CASE WHEN ch.status = 'overdue' THEN 1 END) AS overdue_count,
    COALESCE(SUM(CASE WHEN ch.status = 'overdue' THEN ch.value END), 0) AS overdue_amount
  FROM clients c
  LEFT JOIN services s ON s.client_id = c.id
    AND s.rating IS NOT NULL
    AND s.completed_date >= to_char(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM-DD')
  LEFT JOIN charges ch ON ch.client_id = c.id
  WHERE c.status = 'active'
  GROUP BY c.id
  HAVING
    (AVG(s.rating) > 0 AND AVG(s.rating) <= 2.5) OR
    COUNT(CASE WHEN ch.status = 'overdue' THEN 1 END) > 0
  ORDER BY overdue_amount DESC, avg_rating ASC;
$$;

-- Product consumption by month
CREATE OR REPLACE FUNCTION get_product_consumption(month_start TEXT, month_end TEXT)
RETURNS TABLE (
  name TEXT,
  unit TEXT,
  cost_price NUMERIC,
  total_used NUMERIC,
  total_cost NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.name, p.unit, p.cost_price,
    COALESCE(SUM(sm.quantity), 0) AS total_used,
    COALESCE(SUM(sm.quantity * p.cost_price), 0) AS total_cost
  FROM stock_movements sm
  JOIN products p ON sm.product_id = p.id
  WHERE sm.type = 'out'
    AND sm.reference_type = 'service'
    AND sm.created_at >= month_start
    AND sm.created_at <= month_end
  GROUP BY p.id, p.name, p.unit, p.cost_price
  ORDER BY total_cost DESC;
$$;

-- Product cost for DRE report
CREATE OR REPLACE FUNCTION get_product_cost_by_month(month_start TEXT, month_end TEXT)
RETURNS TABLE (total NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(sm.quantity * p.cost_price), 0) AS total
  FROM stock_movements sm
  JOIN products p ON sm.product_id = p.id
  WHERE sm.type = 'out'
    AND sm.reference_type = 'service'
    AND sm.created_at >= month_start
    AND sm.created_at <= month_end;
$$;

-- Supabase Storage: create these buckets manually in the dashboard:
-- 1. Bucket name: "photos"   — Public: true
-- 2. Bucket name: "contracts" — Public: false (or true if you want direct URL access)
