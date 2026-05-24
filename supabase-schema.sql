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
