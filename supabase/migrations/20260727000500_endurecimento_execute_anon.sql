-- ============================================================
-- Fecha o EXECUTE de funções SECURITY DEFINER para quem não está logado
-- ============================================================
-- Apontado pelo linter do Supabase (0028/0029). As três eram executáveis por
-- `anon` via /rest/v1/rpc, sem sessão nenhuma.
--
-- O QUE FOI CONFERIDO ANTES DE REVOGAR, porque aqui um revoke errado derruba o
-- app inteiro:
--
--   1. As 82 políticas de RLS deste schema NÃO têm cláusula `TO` — valem para
--      PUBLIC. 75 delas chamam fn_current_role() e 8 chamam
--      fn_has_projeto_access(). Expressão de policy roda como o papel do
--      chamador, então tirar o EXECUTE de `authenticated` faria toda leitura
--      logada falhar. Por isso `authenticated` é preservado nas duas.
--
--   2. O grant de `authenticated` é EXPLÍCITO (authenticated=X/postgres), não
--      herdado do PUBLIC — confirmado no proacl. Revogar de PUBLIC não o
--      atinge.
--
--   3. O app nunca chama nenhuma das três por RPC (só há referência nos tipos
--      e num comentário). Nada no cliente depende deste grant.
--
--   4. Nenhuma leitura de tabela acontece antes do login: App.tsx devolve a
--      tela de login quando não há sessão, e todo hook é gated em `session`.
--      Então `anon` não avalia policy nenhuma na prática.

-- Função de EVENT TRIGGER da plataforma (habilita RLS em tabela nova). Chamada
-- direta por RPC nem funciona — pg_event_trigger_ddl_commands() só roda dentro
-- do gatilho. Event trigger não consulta EXECUTE, então revogar de todo mundo
-- não afeta o comportamento dela.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Helpers de RLS: `authenticated` PRECISA continuar podendo executar (item 1).
revoke execute on function public.fn_current_role()                  from public, anon;
revoke execute on function public.fn_has_projeto_access(uuid)        from public, anon;
