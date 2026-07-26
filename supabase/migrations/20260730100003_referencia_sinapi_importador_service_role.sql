-- ============================================================================
-- Fecha o endpoint de importação para os papéis da aplicação
-- ============================================================================
-- A migration 20260730100001 concedeu EXECUTE em `public.sinapi_importar` a
-- `anon` e `authenticated`, contando com o token como única barreira. O advisor
-- de segurança do Supabase aponta isso, e com razão: uma função SECURITY DEFINER
-- que escreve na base de referência ficava alcançável em
-- `/rest/v1/rpc/sinapi_importar` com a chave anônima, que é pública (vai no
-- bundle do front-end).
--
-- O token continua sendo a barreira que importa — sem ele a função não escreve
-- nada. Mas defesa em profundidade aqui é de graça: importar a base do SINAPI é
-- tarefa de operador, feita uma vez por mês, e não tem por que estar na
-- superfície que o navegador alcança.
--
-- Agora são DUAS condições para escrever: chave de `service_role` (que nunca vai
-- para o front-end) E token válido e no prazo. Em repouso, sem token, mesmo o
-- service_role não escreve.
--
-- PROCEDIMENTO DA IMPORTAÇÃO MENSAL
--
--   1. gravar o token:
--        insert into referencia.import_token (id, token, expira_em)
--        values (1, '<32+ caracteres>', now() + interval '90 minutes')
--        on conflict (id) do update
--           set token = excluded.token, expira_em = excluded.expira_em;
--   2. SUPABASE_SERVICE_ROLE_KEY=... SINAPI_IMPORT_TOKEN=... \
--        python3 scripts/sinapi/importar.py <planilha> --uf MG
--   3. apagar o token:
--        delete from referencia.import_token;
--
-- O passo 3 não é opcional. Token esquecido é a barreira desligada.
-- ============================================================================

-- REVOGAR DE `public` É O QUE IMPORTA, e é fácil de errar: toda função nasce com
-- EXECUTE concedido ao pseudo-papel PUBLIC, do qual `anon` e `authenticated`
-- HERDAM. Revogar só desses dois não fecha nada — a ACL continua com `=X/postgres`
-- (o `=` sem papel à esquerda é o PUBLIC) e a função segue chamável com a chave
-- anônima. Foi exatamente o que aconteceu na primeira tentativa desta migration.
revoke execute on function public.sinapi_importar(text, text, jsonb) from public;
revoke execute on function public.sinapi_importar(text, text, jsonb) from anon, authenticated;
grant  execute on function public.sinapi_importar(text, text, jsonb) to service_role;

comment on function public.sinapi_importar(text, text, jsonb) is
  'Importa uma publicação do SINAPI para o schema referencia. Exige chave de '
  'service_role E token válido em referencia.import_token. Sem token, é inerte. '
  'Ver scripts/sinapi/importar.py e o cabeçalho desta migration.';
