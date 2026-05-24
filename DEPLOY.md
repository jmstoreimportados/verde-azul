# Verde & Azul Gestão — Deploy na Vercel com Supabase

## Pré-requisitos

- Conta Vercel: https://vercel.com
- Projeto Supabase criado: https://supabase.com
- Node.js 18+ (local)

---

## Passo 1 — Configurar o banco de dados no Supabase

1. Acesse seu projeto Supabase → **SQL Editor**
2. Execute o arquivo `supabase-schema.sql` completo (tabelas + dados iniciais + funções RPC)
3. Verifique se as tabelas foram criadas na aba **Table Editor**

---

## Passo 2 — Criar buckets de Storage no Supabase

No painel do Supabase → **Storage → Buckets**:

| Bucket      | Público | Finalidade                   |
|-------------|---------|------------------------------|
| `photos`    | Sim     | Fotos de serviços             |
| `contracts` | Não     | Contratos de clientes (PDF)   |

> Se quiser acesso direto aos contratos via URL, marque como público.

---

## Passo 3 — Obter credenciais do Supabase

No painel: **Settings → API**

- **Project URL** → `SUPABASE_URL`
- **service_role (secret)** → `SUPABASE_SERVICE_ROLE_KEY`

> Use a `service_role` key, não a `anon` key. A service_role bypassa RLS.

---

## Passo 4 — Deploy na Vercel

### Via CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Via dashboard

1. Importe o repositório no Vercel
2. Framework Preset: **Other**
3. Build Command: (vazio)
4. Output Directory: (vazio)
5. Root Directory: `/` (raiz do projeto)

---

## Passo 5 — Configurar variáveis de ambiente na Vercel

Em **Settings → Environment Variables**, adicione:

| Variável                   | Valor                                       |
|----------------------------|---------------------------------------------|
| `SUPABASE_URL`             | `https://xxxx.supabase.co`                  |
| `SUPABASE_SERVICE_ROLE_KEY`| `eyJ...` (service_role key)                 |
| `JWT_SECRET`               | String aleatória longa (use um gerador)      |
| `NODE_ENV`                 | `production`                                |
| `CRON_SECRET`              | String aleatória para proteger o cron        |
| `ALLOWED_ORIGIN`           | URL do seu frontend (ex: `https://verde-azul.vercel.app`) |

---

## Passo 6 — Configurar Cron Job

O arquivo `vercel.json` já configura o cron para rodar às 9h UTC diariamente:

```json
"crons": [{ "path": "/api/cron/daily", "schedule": "0 9 * * *" }]
```

O endpoint verifica o header `x-cron-secret` ou query param `?secret=...`.
Configure `CRON_SECRET` na Vercel para protegê-lo.

---

## Acesso inicial

Após o deploy:

- URL: `https://seu-projeto.vercel.app`
- Email: `admin@verdeazul.com`
- Senha: `admin123`

**Troque a senha imediatamente após o primeiro login!**

---

## Diferenças da versão anterior

### O que mudou

| Componente    | Antes (v1)            | Agora (v2)                          |
|---------------|-----------------------|-------------------------------------|
| Database      | `pg` (node-postgres)  | `@supabase/supabase-js`             |
| File uploads  | Disco local (`/tmp`)  | Supabase Storage                    |
| Rate limiting | Não havia             | 10 req/15min no `/api/auth/login`   |
| CORS          | `*` (todos)           | Restrito via `ALLOWED_ORIGIN`       |
| JWT secret    | Fallback hardcoded    | Obrigatório via env var             |
| Env vars      | `DATABASE_URL`        | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |

### Variáveis removidas
- `DATABASE_URL` — não é mais necessário

---

## Desenvolvimento local

```bash
cp .env.example .env
# Edite .env com suas credenciais Supabase
npm install
npm run dev
```

O servidor inicia em `http://localhost:3000`.
