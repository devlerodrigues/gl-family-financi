# GL Family Financi
Painel financeiro familiar (PWA). Identidade Prosperidade Premium (ouro #FBBF24, marinho #1E3A8A, magenta #EC4899).

## Estado atual
- `index.html`: aplicativo em produção (Vercel), **conectado ao Supabase real** com login por e-mail e senha. Usa apenas a chave publicável; a proteção dos dados depende das políticas RLS no banco.
- `api/push.js`: cron diário na Vercel que envia notificações push de vencimentos, faturas e orçamentos.
- `supabase/functions/meta-whatsapp-webhook`: agente de lançamentos pelo WhatsApp (Meta Cloud API), com vínculo de número por código de uso único.
- `supabase/migrations/001_initial.sql`: estrutura **inicial** apenas. As tabelas `family_*` e as funções RPC usadas pelo app e pelo webhook ainda **não estão versionadas** aqui.

## Variáveis de ambiente
**Vercel (`api/push.js`)**: `CRON_SECRET`, `FAMILY_SUPABASE_URL`, `FAMILY_SUPABASE_PUBLISHABLE`, `FAMILY_PUSH_DB_SECRET`, `FAMILY_VAPID_PUBLIC`, `FAMILY_VAPID_PRIVATE`.

**Supabase Edge Function (webhook)**: `META_APP_SECRET`, `META_VERIFY_TOKEN` (obrigatório; sem valor padrão), `META_ACCESS_TOKEN`, opcionais `META_WABA_ID`, `META_APP_ID`, `META_GRAPH_VERSION`. `SUPABASE_URL` e a chave de serviço são fornecidas pelo próprio Supabase.

## Segurança — pendências
1. **Tornar o repositório privado** antes de manter dados financeiros reais em uso.
2. **Versionar o esquema completo**: exportar as tabelas `family_*`, funções RPC e políticas RLS atuais (`supabase db dump --schema public`) para uma nova migração.
3. **Desativar cadastro público** no Supabase (Authentication → Sign In / Providers → desligar "Allow new users to sign up") e garantir que as políticas RLS das tabelas `family_*` exijam que o usuário exista em `family_user_profiles`.
4. **Trocar o `META_VERIFY_TOKEN`**: um valor padrão esteve publicado neste repositório; gere um novo e atualize-o na Meta e no Supabase.
5. Filtrar por família as consultas do webhook (contas e pessoas), que hoje usam a chave de serviço sem filtro — necessário antes de ter mais de uma família.

**Não colocar credenciais de serviço, tokens ou informações financeiras reais neste repositório.**
