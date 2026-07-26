-- Correção de 20260726230000: lá o revoke foi só de `anon`, e isso não bastou.
-- Toda função nasce com EXECUTE para PUBLIC (o `=X/postgres` no proacl), e anon
-- herda por aí — revogar do papel nominal deixa o caminho de PUBLIC aberto.
-- O linter apontou a função como executável sem login logo depois de criada.
--
-- A ordem correta é sempre: revoke de PUBLIC primeiro, grant nominal depois.
revoke execute on function public.fn_preco_vigente(uuid) from public, anon;
grant  execute on function public.fn_preco_vigente(uuid) to authenticated;
