# GL Family Financi
Painel financeiro familiar. Identidade Prosperidade Premium (ouro #FBBF24, marinho #1E3A8A, magenta #EC4899).

## Estado atual
- `index.html`: protótipo visual público, sem dados reais ou persistência.
- `supabase/migrations/001_initial.sql`: estrutura financeira inicial com isolamento por usuário e Row Level Security.
- **Não colocar credenciais de serviço, tokens ou informações financeiras reais neste repositório.**

## Próxima implementação
1. Criar projeto Supabase dedicado e aplicar a migração.
2. Adicionar autenticação Supabase, restringir acesso à aplicação e manter a chave service_role apenas no servidor.
3. Implementar rotas para contas e lançamentos autenticados com validação; testar isolamento entre usuários.
4. Configurar variáveis de ambiente na Vercel; só então ativar as funções financeiras.
5. Integrar família/convites, cartões e WhatsApp em etapas posteriores.

**Importante:** o repositório no GitHub foi detectado como público; mudar para privado antes de qualquer dado real.
