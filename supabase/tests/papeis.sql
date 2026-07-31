-- ============================================================
-- Matriz de permissão por papel — teste executável
-- ============================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A auditoria de 29/jul/2026 achou três problemas de autorização e concluiu que
-- todos teriam sido pegos na primeira semana por um teste como este. E vale nos
-- dois sentidos: a própria auditoria **errou** um dos achados (§11.3, afirmou que
-- `conta_excluir` era explorável por `campo`, quando a guarda existia de forma
-- indireta dentro de `conta_usos`). Sem uma matriz executável, tanto o código
-- quanto a revisão do código dependem de ler plpgsql e seguir chamadas de cabeça.
--
-- COMO RODAR
--
--   psql "$DATABASE_URL" -f supabase/tests/papeis.sql
--
-- ou cole o conteúdo no SQL Editor do painel. **Nada é persistido**: o bloco
-- inteiro roda dentro de uma transação implícita e termina com um `raise
-- exception`, que devolve o relatório e reverte tudo — inclusive o rebaixamento
-- temporário de papel usado para encenar cada perfil.
--
-- PRÉ-REQUISITO: dois administradores ativos. O teste rebaixa um deles
-- temporariamente para encenar os outros papéis, e a trava do último admin
-- (20260802100000) impediria o rebaixamento se houvesse só um.
--
-- NÃO ESTÁ NO CI de propósito: exigiria credencial de banco no GitHub Actions e
-- um projeto Supabase descartável por execução. O caminho certo para isso é
-- `supabase db start` + `pgTAP` num serviço de CI, que é tarefa própria. Até lá,
-- rodar à mão antes de mexer em RLS já cobre o que interessa.
do $$
declare
  v_alvo   uuid;
  v_admin  uuid;
  v_res    text := E'\n';
  v_papel  text;
  v_n      int;
  v_linhas int;
  v_projeto    uuid;
  v_total      int;
  v_vinc_total int;

begin
  select id into v_alvo  from public.profiles where role='admin' and active order by created_at limit 1;
  select id into v_admin from public.profiles where role='admin' and active and id <> v_alvo limit 1;
  if v_admin is null then
    raise exception 'PRÉ-REQUISITO: são necessários 2 admins ativos (o teste rebaixa um temporariamente).';
  end if;

  -- ==========================================================
  -- PAPEL: campo
  -- ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='campo' where id = v_alvo;

  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  select public.fn_current_role() into v_papel;
  v_res := v_res || format('--- papel encenado: %s%s', coalesce(v_papel,'NULL'), E'\n');

  -- §11.1 — escalada de privilégio. Com `profiles_update_own` removida, `campo`
  -- não tem política de UPDATE em profiles: o write casa com ZERO linhas (o
  -- PostgREST devolveria 200 sem alterar nada), então a asserção é sobre o
  -- número de linhas e sobre o papel depois, não sobre uma exceção.
  update public.profiles set role='admin' where id = v_alvo;
  get diagnostics v_linhas = row_count;
  select role into v_papel from public.profiles where id = v_alvo;
  v_res := v_res || format('[%s] campo NAO escala para admin (linhas=%s, papel=%s)%s',
    case when v_linhas = 0 and v_papel='campo' then 'OK ' else 'FALHA' end, v_linhas, v_papel, E'\n');

  -- §11.3 — RPCs destrutivas.
  begin
    perform public.conta_excluir(gen_random_uuid());
    v_res := v_res || '[FALHA] campo conseguiu chamar conta_excluir' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] campo barrado em conta_excluir (%s)%s', sqlerrm, E'\n');
  end;

  begin
    perform public.catalogo_excluir_insumo(gen_random_uuid());
    v_res := v_res || '[FALHA] campo conseguiu chamar catalogo_excluir_insumo' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] campo barrado em catalogo_excluir_insumo (%s)%s', sqlerrm, E'\n');
  end;

  -- `campo` não deve ver dinheiro, cliente, proposta nem catálogo.
  select count(*) into v_n from public.lancamentos_financeiros;
  v_res := v_res || format('[%s] campo nao le lancamentos_financeiros (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.clientes;
  v_res := v_res || format('[%s] campo nao le clientes (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.catalogo_insumos;
  v_res := v_res || format('[%s] campo nao le catalogo_insumos (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  -- Sem vínculo em projeto_equipe, `campo` não vê obra nenhuma.
  select count(*) into v_n from public.projetos;
  v_res := v_res || format('[%s] campo sem vinculo nao le projetos (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.etapa_orcamento_vinculo;
  v_res := v_res || format('[%s] campo sem vinculo nao le etapa_orcamento_vinculo (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- ==========================================================
  -- PAPEL: gestao — tudo de obra, ZERO de financeiro
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='gestao' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  v_res := v_res || format('%s--- papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');
  select count(*) into v_n from public.lancamentos_financeiros;
  v_res := v_res || format('[%s] gestao nao le lancamentos_financeiros (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.contas_financeiras;
  v_res := v_res || format('[%s] gestao nao le contas_financeiras (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.catalogo_insumos;
  v_res := v_res || format('[%s] gestao LE catalogo_insumos (%s linhas)%s',
    case when v_n>0 then 'OK ' else 'ver ' end, v_n, E'\n');
  begin
    perform public.conta_excluir(gen_random_uuid());
    v_res := v_res || '[FALHA] gestao conseguiu chamar conta_excluir' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] gestao barrado em conta_excluir (%s)%s', sqlerrm, E'\n');
  end;

  -- ==========================================================
  -- PAPEL: financeiro — dinheiro sim, catálogo não, cronograma SIM (ver abaixo)
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  v_res := v_res || format('%s--- papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');
  select count(*) into v_n from public.catalogo_insumos;
  v_res := v_res || format('[%s] financeiro nao le catalogo_insumos (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  -- ATENÇÃO: o esperado aqui é que o financeiro **LEIA** o cronograma, e essa
  -- asserção nasceu de uma falha real desta suíte. O comentário de
  -- `constants/tabAccess.ts` afirmava que "financeiro não tem política em
  -- etapas_cronograma", e o cabeçalho de 20260718190006 dizia o mesmo. Os dois
  -- estavam errados: a política `campo_select_etapas_cronograma` é
  -- `using (fn_has_projeto_access(projeto_id))`, e essa função devolve `true`
  -- para admin/gestao/financeiro — o nome diz "campo", o alcance é de quatro
  -- papéis.
  --
  -- E é acesso NECESSÁRIO: `DADOS_POR_ABA.dashboard` inclui `cronograma` e o
  -- financeiro enxerga o dashboard, de onde sai o avanço físico por obra.
  -- Estreitar a política deixaria esse número vazio. O que se corrigiu foi a
  -- documentação, não a regra.
  select count(*) into v_n from public.etapas_cronograma;
  v_res := v_res || format('[%s] financeiro LE etapas_cronograma (%s linhas) — necessario p/ o dashboard%s',
    case when v_n>0 then 'OK ' else 'ver ' end, v_n, E'\n');
  -- Mesma história do cronograma, e pelo mesmo motivo: sem os vínculos o avanço
  -- físico cai na média simples e o financeiro vê um número DIFERENTE do que o
  -- admin vê para a mesma obra. Era o caso até 04/ago/2026 — medido em produção,
  -- a obra Setta aparecia com 4% para o financeiro e 20% para o admin. Ver
  -- 20260804100000_vinculo_visivel_para_campo_e_financeiro.
  select count(*) into v_n from public.etapa_orcamento_vinculo;
  v_res := v_res || format('[%s] financeiro LE etapa_orcamento_vinculo (%s linhas) — necessario p/ o avanco ponderado%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  begin
    perform public.catalogo_excluir_insumo(gen_random_uuid());
    v_res := v_res || '[FALHA] financeiro conseguiu chamar catalogo_excluir_insumo' || E'\n';
  exception when others then
    v_res := v_res || format('[OK ] financeiro barrado em catalogo_excluir_insumo (%s)%s', sqlerrm, E'\n');
  end;

  -- ==========================================================
  -- PAPEL: campo COM vínculo — escopo por obra, e o avanço certo
  -- ==========================================================
  -- As asserções de `campo` acima cobrem só o caso "sem vínculo", que responde
  -- vazio para tudo. Isso deixava sem teste justamente o caminho que importa: o
  -- de quem TEM acesso a uma obra. Foi nesse buraco que a divergência de avanço
  -- físico sobreviveu — `etapa_orcamento_vinculo` sem policy devolvia zero
  -- linhas, e zero linhas é indistinguível de "esta obra não tem vínculos".
  --
  -- O vínculo em `projeto_equipe` é inserido aqui e reverte junto com o resto.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='campo', active=true where id = v_alvo;

  -- O total tem de ser contado AQUI, ainda como admin: depois da troca de papel
  -- ele voltaria filtrado pelo RLS de `campo` e a mensagem diria sempre "1 de 1".
  select count(*) into v_total from public.projetos;
  select id into v_projeto from public.projetos order by nome limit 1;
  -- Idem para os dois números de referência dos vínculos: colhidos como admin,
  -- senão o RLS de `campo` filtraria os DOIS lados da comparação e a asserção
  -- passaria sempre, sem verificar nada.
  select count(*) into v_linhas
    from public.etapa_orcamento_vinculo v
    join public.etapas_cronograma e on e.id = v.etapa_id
   where e.projeto_id = v_projeto;
  select count(*) into v_vinc_total from public.etapa_orcamento_vinculo;

  insert into public.projeto_equipe (projeto_id, profile_id, papel)
  values (v_projeto, v_alvo, 'Encarregado')
  on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- papel encenado: %s (vinculado a 1 obra)%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.projetos;
  v_res := v_res || format('[%s] campo com vinculo le APENAS a obra dele (%s de %s)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, v_total, E'\n');

  -- O ponto desta seção: os vínculos da obra dele chegam (senão o avanço físico
  -- cai na média simples), e os das OUTRAS obras não.
  select count(*) into v_n from public.etapa_orcamento_vinculo;
  v_res := v_res || format('[%s] campo le os vinculos da obra dele (%s visiveis, %s esperados)%s',
    case when v_n = v_linhas then 'OK ' else 'FALHA' end, v_n, v_linhas, E'\n');
  v_res := v_res || format('[%s] e NAO le os das outras obras (%s de %s no total)%s',
    case when v_n < v_vinc_total then 'OK '
         when v_vinc_total = v_linhas then 'n/a'   -- só existe uma obra com vínculos
         else 'FALHA' end, v_n, v_vinc_total, E'\n');

  -- ==========================================================
  -- §11.2 — perfil desativado perde TODO o acesso
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='admin', active=false where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);

  select public.fn_current_role() into v_papel;
  v_res := v_res || format('%s--- desativado (papel na tabela: admin)%s', E'\n', E'\n');
  v_res := v_res || format('[%s] fn_current_role() devolve NULL (veio: %s)%s',
    case when v_papel is null then 'OK ' else 'FALHA' end, coalesce(v_papel,'NULL'), E'\n');
  select count(*) into v_n from public.clientes;
  v_res := v_res || format('[%s] desativado nao le clientes (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.projetos;
  v_res := v_res || format('[%s] desativado nao le projetos (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  -- ...mas continua lendo o PRÓPRIO perfil: é como o AuthContext descobre que
  -- está desativado e mostra a tela certa em vez de um app vazio.
  select count(*) into v_n from public.profiles where id = v_alvo;
  v_res := v_res || format('[%s] desativado AINDA le o proprio perfil (%s) — requisito da tela%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- ==========================================================
  -- Trava do último admin ativo (20260802100000)
  -- ==========================================================
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set active=true where id = v_alvo;
  -- Agora v_alvo volta a ser admin ativo; desativar os DOIS deve falhar no segundo.
  update public.profiles set active=false where id = v_alvo;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    update public.profiles set active=false where id = v_admin;
    v_res := v_res || format('%s[FALHA] foi possivel desativar o ULTIMO admin ativo%s', E'\n', E'\n');
  exception when others then
    v_res := v_res || format('%s[OK ] ultimo admin protegido (%s)%s', E'\n', sqlerrm, E'\n');
  end;

  reset role;
  raise exception 'MATRIZ DE PAPEIS — transacao revertida, nada foi gravado:%', v_res;
end $$;
