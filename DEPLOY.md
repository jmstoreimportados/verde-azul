# Verde & Azul Gestao — Deploy: Supabase + Vercel

## Acesso Padrao
- **Email:** admin@verdeazul.com
- **Senha:** admin123
> Troque a senha em Configuracoes -> Usuarios apos o primeiro acesso.

---

## Passo 1 — Criar banco no Supabase (gratuito)

1. Crie conta em https://supabase.com
2. Clique em **New Project** e preencha nome, senha e regiao
3. Aguarde o projeto criar (~2 minutos)
4. Va em **SQL Editor** (menu lateral)
5. Cole o conteudo do arquivo `supabase-schema.sql` e clique **Run**
6. As tabelas e dados iniciais serao criados

### Pegar a URL de conexao:
1. Va em **Settings -> Database**
2. Clique em **Connection String -> URI**
3. Copie a string — ela tem formato:
   ```
   postgresql://postgres:[SUA-SENHA]@db.[SEU-PROJETO].supabase.co:5432/postgres
   ```

---

## Passo 2 — Deploy no Vercel (gratuito)

### Opcao A: Via GitHub (recomendado)
1. Suba o projeto para um repositorio GitHub
2. Acesse https://vercel.com e clique em **New Project**
3. Importe o repositorio do GitHub
4. Na etapa de configuracao, adicione as variaveis de ambiente:

| Variavel | Valor |
|----------|-------|
| `DATABASE_URL` | URL copiada do Supabase |
| `JWT_SECRET` | Qualquer string longa e aleatoria |
| `NODE_ENV` | `production` |
| `CRON_SECRET` | Qualquer string (opcional) |

5. Clique em **Deploy** e aguarde ~1 minuto
6. Sua URL estara disponivel (ex: `https://verde-azul-gestao.vercel.app`)

### Opcao B: Via Vercel CLI
```bash
npm install -g vercel
cd verde-azul-gestao
vercel
# Siga as instrucoes e adicione as variaveis quando solicitado
```

---

## Passo 3 — Acesso pelo celular dos tecnicos

Apos o deploy, qualquer pessoa com a URL e login acessa pelo celular.

Para salvar como atalho:
- **Android (Chrome):** Menu -> "Adicionar a tela inicial"
- **iPhone (Safari):** Compartilhar -> "Adicionar a Tela de Inicio"

---

## Tarefas automaticas (Cron)

O `vercel.json` ja configura um cron que roda todo dia as 9h (horario UTC):
- Marca cobranças vencidas como "inadimplente"
- No dia 1 do mes: gera cobranças e agendamentos do mes seguinte

Para usar um cron externo (alternativa gratuita via cron-job.org):
1. Crie conta em https://cron-job.org
2. Adicione um job apontando para: `https://[SUA-URL]/api/cron/daily`
3. Configure para rodar diariamente

---

## Rodar localmente (sem Vercel)

```bash
cd verde-azul-gestao
cp .env.example .env
# Edite .env com sua DATABASE_URL do Supabase
npm install
npm start
```
Acesse http://localhost:3000

---

## Upload de fotos/contratos

Em producao no Vercel, os arquivos enviados ficam em `/tmp` (temporarios).
Para armazenamento permanente, integre com o **Supabase Storage**:
1. Crie um bucket em Supabase -> Storage
2. Adapte os endpoints de upload para usar `@supabase/storage-js`
(Disponivel como melhoria futura)

---

## Backup

- Acesse **Configuracoes -> Backup** no sistema para baixar um JSON com todos os dados
- O Supabase tambem oferece backup automatico diario (plano gratuito: 7 dias de retencao)
