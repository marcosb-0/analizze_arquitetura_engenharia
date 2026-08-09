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
  v_proposta_secoes uuid;
  v_proposta_copia  uuid;
  v_contrato        uuid;
  v_contrato_avulso uuid;
  v_numero_contrato text;
  v_total      int;
  v_vinc_total int;
  -- Tarefas (20260808100000): uma atribuída ao papel encenado, outra a terceiro.
  v_tarefa_minha  uuid;
  v_tarefa_alheia uuid;
  -- Categorias de documento (20260719140001): uma sem uso e uma com documento.
  v_cat_livre uuid;
  v_cat_usada uuid;

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
  -- MÓDULO: tarefas (20260808100000)
  -- ==========================================================
  -- O recorte de `tarefas` é por LINHA, não por tabela: os quatro papéis abrem a
  -- aba, e é a policy que decide o que cada um enxerga. Isso torna a matriz aqui
  -- diferente de todas as outras deste arquivo — "consegue ler a tabela" não diz
  -- nada, só "consegue ler a linha de outra pessoa" diz.
  --
  -- Duas tarefas são criadas como admin: uma para v_alvo e outra para v_admin.
  -- Toda asserção abaixo compara as duas.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='admin', active=true where id = v_alvo;

  insert into public.tarefas (titulo, responsavel_id) values ('MATRIZ minha', v_alvo)
    returning id into v_tarefa_minha;
  insert into public.tarefas (titulo, responsavel_id) values ('MATRIZ de outro', v_admin)
    returning id into v_tarefa_alheia;

  -- --- campo: só a dele, e só o status dela ---
  update public.profiles set role='campo' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- tarefas, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.tarefas where titulo like 'MATRIZ%';
  v_res := v_res || format('[%s] campo le APENAS a tarefa atribuida a ele (%s de 2)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- Mover é a única escrita que ele tem. Se falhar, o kanban do campo não anda.
  update public.tarefas set status='Fazendo' where id = v_tarefa_minha;
  get diagnostics v_n = row_count;
  v_res := v_res || format('[%s] campo MOVE a propria tarefa (%s linha)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- RLS não restringe coluna: sem a trigger fn_tarefa_campo_so_status, este
  -- update passaria inteiro — dentro da mesma policy que só devia deixar mover.
  begin
    update public.tarefas set titulo='sequestrada' where id = v_tarefa_minha;
    v_res := v_res || format('[FALHA] campo conseguiu EDITAR o titulo da tarefa%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo barrado ao editar a tarefa (%s)%s', sqlerrm, E'\n');
  end;

  -- Repassar a tarefa a outra pessoa a faria sumir da vista dele: um "concluído"
  -- que na verdade é um repasse. Barrado pela trigger E pelo `with check`.
  begin
    update public.tarefas set responsavel_id=v_admin where id = v_tarefa_minha;
    v_res := v_res || format('[FALHA] campo conseguiu REPASSAR a tarefa%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo barrado ao repassar a tarefa (%s)%s', sqlerrm, E'\n');
  end;

  -- Ausência de policy não ERRA, apenas casa zero linhas — daí contar `row_count`
  -- em vez de esperar exceção. É a mesma armadilha que `garantirEscrita` cobre no
  -- cliente.
  update public.tarefas set status='Concluída' where id = v_tarefa_alheia;
  get diagnostics v_n = row_count;
  v_res := v_res || format('[%s] campo NAO move a tarefa alheia (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- Sem policy de INSERT, o Postgres levanta "new row violates row-level
  -- security policy" — erro de verdade, não zero linhas. Daí o bloco de exceção:
  -- sem ele a falha esperada abortaria o teste inteiro em vez de virar um [OK].
  begin
    insert into public.tarefas (titulo, responsavel_id) values ('MATRIZ criada por campo', v_alvo);
    v_res := v_res || format('[FALHA] campo conseguiu CRIAR tarefa%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo barrado ao criar tarefa (%s)%s', sqlerrm, E'\n');
  end;

  delete from public.tarefas where id = v_tarefa_minha;
  get diagnostics v_n = row_count;
  v_res := v_res || format('[%s] campo NAO exclui tarefa, nem a propria (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- --- financeiro: o que criou ou recebeu ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- tarefas, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.tarefas where titulo like 'MATRIZ%';
  v_res := v_res || format('[%s] financeiro le so o que criou ou recebeu (%s de 2)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- O seletor de responsável. Se voltar vazio, a aba nasce quebrada em silêncio
  -- para os dois papéis que não leem `profiles` — o motivo de fn_pessoas_atribuiveis
  -- existir.
  select count(*) into v_n from public.fn_pessoas_atribuiveis();
  v_res := v_res || format('[%s] financeiro enxerga pessoas para atribuir (%s)%s',
    case when v_n>1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  select count(*) into v_n from public.profiles;
  v_res := v_res || format('[%s] ...sem que profiles tenha sido alargada (%s linha propria)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- ==========================================================
  -- MÓDULO: categorias de documento (20260719140001)
  -- ==========================================================
  -- A aba Documentos passou a oferecer a exclusão de categoria como botão
  -- próprio na lista de pastas, e não mais escondida dentro do formulário de
  -- edição. Ao expor a ação valia conferir quem, de fato, o banco deixa
  -- executá-la — esta seção é o resultado.
  --
  -- São DUAS regras diferentes, e é a distinção que interessa aqui:
  --
  --   • QUEM pode excluir → RLS. `documento_categorias` tem duas policies `for
  --     all`, admin e gestao. Para `campo` e `financeiro` não há política
  --     nenhuma: o delete não erra, casa zero linhas (a armadilha que
  --     `garantirEscrita` cobre no cliente).
  --   • O QUE pode ser excluído → FK, não RLS. `documentos_tipo_fkey` é
  --     `on delete restrict`, e checagem de integridade referencial roda fora
  --     do recorte de RLS. Categoria em uso é barrada mesmo para quem tem
  --     permissão total.
  --
  -- A tela desabilita a lixeira quando a pasta tem arquivos, mas essa contagem
  -- é do escopo ABERTO — uma categoria de obra usada por outra obra chega ao
  -- botão parecendo livre. Quem desmente é o 23503 testado abaixo, e é por isso
  -- que `useDocumentoCategorias` devolve booleano em vez de comemorar sozinho.

  -- --- financeiro: não enxerga a tabela (confirma o comentário de tabAccess) ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='financeiro', active=true where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- categorias de documento, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.documento_categorias;
  v_res := v_res || format('[%s] financeiro nao le documento_categorias (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- --- gestao: CRUD completo, e a trava de uso ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='gestao' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- categorias de documento, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.documento_categorias;
  v_res := v_res || format('[%s] gestao LE documento_categorias (%s linhas)%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- Escopo 'empresa' nas duas, e o documento sem projeto_id: a trigger
  -- fn_documento_categoria_escopo exige que os dois lados combinem.
  insert into public.documento_categorias (nome, cor, escopo, criado_por)
  values ('MATRIZ categoria livre', 'slate', 'empresa', v_alvo) returning id into v_cat_livre;
  insert into public.documento_categorias (nome, cor, escopo, criado_por)
  values ('MATRIZ categoria em uso', 'slate', 'empresa', v_alvo) returning id into v_cat_usada;
  v_res := v_res || format('[%s] gestao CRIA categoria (%s)%s',
    case when v_cat_livre is not null and v_cat_usada is not null then 'OK ' else 'FALHA' end,
    coalesce(v_cat_livre::text,'NULL'), E'\n');

  insert into public.documentos (nome, tipo, criado_por)
  values ('MATRIZ documento', 'MATRIZ categoria em uso', v_alvo);

  delete from public.documento_categorias where id = v_cat_livre;
  get diagnostics v_n = row_count;
  v_res := v_res || format('[%s] gestao EXCLUI categoria sem uso (%s linha)%s',
    case when v_n=1 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- `when foreign_key_violation` e não `when others` de propósito: o cliente
  -- ramifica em `err.code === '23503'` para dizer "categoria em uso" em vez de
  -- despejar a mensagem crua do Postgres. Se o código mudar, a mensagem da tela
  -- muda junto — então o teste tem de assertar o CÓDIGO, não só que falhou.
  begin
    delete from public.documento_categorias where id = v_cat_usada;
    v_res := v_res || format('[FALHA] gestao excluiu categoria EM USO%s', E'\n');
  exception when foreign_key_violation then
    v_res := v_res || format('[OK ] categoria em uso barrada por FK 23503 (%s)%s', sqlerrm, E'\n');
  end;

  -- --- campo: não lê, e a escrita casa zero linhas em vez de errar ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='campo' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- categorias de documento, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.documento_categorias;
  v_res := v_res || format('[%s] campo nao le documento_categorias (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- Sem policy de DELETE não há erro: o PostgREST devolveria 200 com lista
  -- vazia, e a tela cantaria vitória se não contasse as linhas.
  delete from public.documento_categorias where id = v_cat_usada;
  get diagnostics v_n = row_count;
  v_res := v_res || format('[%s] campo NAO exclui categoria (%s linhas, sem erro)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- No INSERT é o contrário: `with check` sem política levanta erro de verdade.
  begin
    insert into public.documento_categorias (nome, cor, escopo)
    values ('MATRIZ criada por campo', 'slate', 'empresa');
    v_res := v_res || format('[FALHA] campo conseguiu CRIAR categoria%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo barrado ao criar categoria (%s)%s', sqlerrm, E'\n');
  end;

  -- ==========================================================
  -- MÓDULO: descritivo da proposta (20260810100000/1/2)
  -- ==========================================================
  -- O texto do documento saiu de `empresa_config` — onde a leitura era liberada
  -- a TODO autenticado, porque papel timbrado não é dado sensível — e passou a
  -- viver em `modelos_texto` e `proposta_secoes`, sob a matriz das propostas.
  --
  -- A troca aperta o acesso, e é isso que esta seção prova. Vale conferir
  -- porque a mudança é fácil de fazer pela metade: criar as tabelas e esquecer
  -- o `enable row level security` deixaria `campo` lendo o escopo comercial de
  -- toda proposta da empresa sem nada na tela denunciando.

  -- --- campo: não enxerga nem a biblioteca nem o descritivo ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='campo', active=true where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- descritivo da proposta, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.proposta_secoes;
  v_res := v_res || format('[%s] campo nao le proposta_secoes (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.modelos_texto;
  v_res := v_res || format('[%s] campo nao le modelos_texto (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.secoes_revisao_proposta;
  v_res := v_res || format('[%s] campo nao le secoes_revisao_proposta (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  begin
    insert into public.modelos_texto (titulo, corpo) values ('MATRIZ modelo do campo', 'x');
    v_res := v_res || format('[FALHA] campo conseguiu CRIAR modelo de texto%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] campo barrado ao criar modelo (%s)%s', sqlerrm, E'\n');
  end;

  -- --- financeiro: idem. Lê custo de obra, não o discurso comercial dela ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- descritivo da proposta, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.proposta_secoes;
  v_res := v_res || format('[%s] financeiro nao le proposta_secoes (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.modelos_texto;
  v_res := v_res || format('[%s] financeiro nao le modelos_texto (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- --- gestao: é quem escreve proposta, então é quem escreve o texto dela ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='gestao' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- descritivo da proposta, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.modelos_texto;
  v_res := v_res || format('[%s] gestao LE a biblioteca de modelos (%s linhas)%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- A prova que dá sentido ao módulo: a proposta nasce COM descritivo, sem o
  -- cliente inserir nada. Se a trigger de semeadura tiver sido perdida numa
  -- migration futura, é aqui que aparece — e não numa proposta em branco
  -- entregue ao cliente.
  insert into public.propostas (cliente_id, descricao)
  select id, 'MATRIZ proposta com descritivo' from public.clientes limit 1
  returning id into v_proposta_secoes;

  select count(*) into v_n from public.proposta_secoes where proposta_id = v_proposta_secoes;
  v_res := v_res || format('[%s] proposta NOVA nasce com o descritivo padrao (%s secoes)%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- Duplicar copia o texto negociado e NÃO acumula os padrões por cima: a
  -- trigger dispara na cópia também, e `fn_duplicar_proposta` apaga antes de
  -- copiar. Sem esse delete a cópia sairia com o dobro das seções.
  select public.fn_duplicar_proposta(v_proposta_secoes, 'MATRIZ copia') into v_proposta_copia;
  select count(*) into v_linhas from public.proposta_secoes where proposta_id = v_proposta_copia;
  v_res := v_res || format('[%s] duplicar NAO acumula padrao sobre o negociado (%s vs %s secoes)%s',
    case when v_linhas = v_n then 'OK ' else 'FALHA' end, v_linhas, v_n, E'\n');

  -- ==========================================================
  -- MÓDULO: contratos (20260811100000/1)
  -- ==========================================================
  -- O contrato entrou como entidade própria, com uma RPC de geração que tem
  -- três guardas em sequência: papel, status da proposta e contrato único. As
  -- três são fáceis de conferir de cabeça e fáceis de errar na prática — a
  -- primeira já custou episódio neste repositório por causa do `coalesce`
  -- ausente (`NULL not in (...)` é NULL, e o `if` não dispara).
  --
  -- O que esta seção prova, e nenhuma outra prova: que a trigger de semeadura
  -- de cláusulas e a herança do descritivo NÃO se somam. As duas escrevem em
  -- contrato_clausulas, a trigger roda primeiro, e sem o `delete` no meio o
  -- contrato sairia com duas versões da mesma cláusula.

  -- gestao já está encenado pela seção anterior do descritivo.
  v_res := v_res || format('%s--- contratos, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  -- Proposta em Elaboração: a guarda de status recusa.
  begin
    perform public.fn_gerar_contrato_from_proposta(v_proposta_secoes);
    v_res := v_res || format('[FALHA] gerou contrato de proposta em Elaboracao%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] recusa proposta nao aprovada (%s)%s', sqlerrm, E'\n');
  end;

  update public.propostas set status='Aprovada' where id = v_proposta_secoes;
  select public.fn_gerar_contrato_from_proposta(
    v_proposta_secoes, '{"foro":"Comarca de Sao Paulo"}'::jsonb) into v_contrato;

  select numero into v_numero_contrato from public.contratos where id = v_contrato;
  v_res := v_res || format('[%s] contrato gerado com numeracao propria (%s)%s',
    case when v_numero_contrato like 'CONT-%' then 'OK ' else 'FALHA' end,
    v_numero_contrato, E'\n');

  select count(*) into v_n from public.contrato_clausulas where contrato_id = v_contrato;
  v_res := v_res || format('[%s] herdou o descritivo da proposta como clausulas (%s)%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- O teste do `delete`: se a trigger e a herança se somassem, haveria título
  -- repetido — os modelos padrão de escopo 'ambos' já entraram na proposta.
  select count(*) into v_linhas from (
    select titulo from public.contrato_clausulas where contrato_id = v_contrato
     group by titulo having count(*) > 1) d;
  v_res := v_res || format('[%s] semeadura NAO se soma a heranca (%s titulos repetidos)%s',
    case when v_linhas=0 then 'OK ' else 'FALHA' end, v_linhas, E'\n');

  -- Segunda geração: recusada pela guarda, e o índice parcial é a rede embaixo.
  begin
    perform public.fn_gerar_contrato_from_proposta(v_proposta_secoes);
    v_res := v_res || format('[FALHA] gerou um SEGUNDO contrato da mesma proposta%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] segundo contrato recusado (%s)%s', sqlerrm, E'\n');
  end;

  -- Avulso: sem proposta, nasce com as cláusulas padrão de escopo contrato/ambos.
  insert into public.contratos (cliente_id, objeto)
  select id, 'MATRIZ contrato avulso' from public.clientes limit 1
  returning id into v_contrato_avulso;
  select count(*) into v_n from public.contrato_clausulas where contrato_id = v_contrato_avulso;
  v_res := v_res || format('[%s] contrato AVULSO nasce com as clausulas padrao (%s)%s',
    case when v_n>0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- --- financeiro: não lê contrato nem consegue gerar um ---
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.profiles set role='financeiro' where id = v_alvo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_alvo, 'role','authenticated')::text, true);
  v_res := v_res || format('%s--- contratos, papel encenado: %s%s', E'\n', public.fn_current_role(), E'\n');

  select count(*) into v_n from public.contratos;
  v_res := v_res || format('[%s] financeiro nao le contratos (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');
  select count(*) into v_n from public.contrato_clausulas;
  v_res := v_res || format('[%s] financeiro nao le contrato_clausulas (%s linhas)%s',
    case when v_n=0 then 'OK ' else 'FALHA' end, v_n, E'\n');

  -- A RPC é SECURITY DEFINER: sem a guarda de papel ela contornaria a RLS e
  -- criaria o contrato mesmo para quem não enxerga a tabela.
  begin
    perform public.fn_gerar_contrato_from_proposta(v_proposta_secoes);
    v_res := v_res || format('[FALHA] financeiro gerou contrato pela RPC%s', E'\n');
  exception when others then
    v_res := v_res || format('[OK ] financeiro barrado na RPC (%s)%s', sqlerrm, E'\n');
  end;

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
