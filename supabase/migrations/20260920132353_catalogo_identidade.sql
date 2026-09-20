-- O catálogo ganha identidade: um código por item e um nome que não se repete.
--
-- Até aqui `catalogo_insumos` não tinha NENHUM índice único além da chave
-- primária. A única que existiu — `catalogo_insumos_sinapi_unico` — caiu junto
-- com a SINAPI (20260919235327:412), e desde então nada impedia "CIMENTO CP-II"
-- de entrar cinco vezes. A base estava limpa por ter 17 linhas, não por ter
-- defesa: os dois caminhos de escrita (a interface e a RPC da proposta) faziam
-- INSERT incondicional, sem procurar por nome.
--
-- São DUAS identidades, e cada uma responde uma pergunta diferente:
--   `codigo`               — "que item é este?"  (MAT-0001, e nunca mais muda)
--   (chave do nome, unidade) — "já existe um igual a este?"
-- A primeira dá endereço; a segunda impede o gêmeo. Só a primeira não bastaria:
-- um código novo pode ser gerado para um nome que já existe.

-- ---------------------------------------------------------------------------
-- 1. A chave natural do nome
-- ---------------------------------------------------------------------------
-- `fn_normaliza_busca` NÃO serve para isto, e a diferença é real: ela é só
-- `lower(unaccent(...))`, sem colapso de espaço. "Cimento  CP-II" (dois espaços)
-- passaria por ela como item diferente de "Cimento CP-II" e entraria no
-- catálogo como segundo cadastro. Esta acrescenta o `btrim` + colapso.
--
-- IMMUTABLE é obrigatório para entrar em índice. O `SET search_path` impede a
-- inlining mas não o uso em expressão de índice — verificado em transação
-- revertida contra este banco antes de escrever esta migration.
create or replace function public.fn_chave_insumo(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path to 'extensions', 'public'
as $$
  select regexp_replace(btrim(public.fn_normaliza_busca(p_texto)), '\s+', ' ', 'g');
$$;

comment on function public.fn_chave_insumo(text) is
  'Chave natural de um insumo a partir da descrição: minúsculas, sem acento e com espaço colapsado. Diferente de fn_normaliza_busca, que não colapsa espaço e por isso não serve como chave de unicidade.';

-- ---------------------------------------------------------------------------
-- 2. O contador do código
-- ---------------------------------------------------------------------------
-- Tabela e não `sequence`: os prefixos vêm do CHECK de `categoria`, que já
-- mudou uma vez e pode mudar de novo. Cinco sequences nomeadas à mão envelhecem
-- pior que cinco linhas.
--
-- Os cinco prefixos nascem semeados de propósito: sem isso a função precisaria
-- de um ramo "linha não existe", que é justamente onde duas transações
-- simultâneas criariam o mesmo código.
create table if not exists public.catalogo_sequencia (
  prefixo text primary key,
  proximo int not null default 1 check (proximo > 0)
);

insert into public.catalogo_sequencia (prefixo, proximo) values
  ('MAT', 1), ('MO', 1), ('EQP', 1), ('SRV', 1), ('TXA', 1)
on conflict (prefixo) do nothing;

-- Ninguém do app toca aqui: nem grant, nem policy. O único caminho é a função
-- SECURITY DEFINER abaixo.
alter table public.catalogo_sequencia enable row level security;
revoke all on public.catalogo_sequencia from anon, authenticated;

comment on table public.catalogo_sequencia is
  'Contador por prefixo de código do catálogo. Sem grant e sem policy: só fn_proximo_codigo_catalogo escreve aqui.';

-- SECURITY DEFINER porque `catalogo_sequencia` não tem policy nenhuma — uma
-- função security invoker leria zero linhas e devolveria código NULL em
-- silêncio para todo mundo, que é a classe de falha que este repo já pagou três
-- vezes.
--
-- O `update ... returning` é o incremento: ele trava a linha sozinho, então
-- duas inserções simultâneas na mesma categoria serializam e recebem números
-- diferentes. Um `select` seguido de `update` teria a corrida clássica.
create or replace function public.fn_proximo_codigo_catalogo(p_categoria text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prefixo text;
  v_n       int;
begin
  v_prefixo := case p_categoria
    when 'Material'    then 'MAT'
    when 'Mão de Obra' then 'MO'
    when 'Equipamento' then 'EQP'
    when 'Serviço'     then 'SRV'
    when 'Taxa'        then 'TXA'
  end;

  if v_prefixo is null then
    raise exception 'Categoria "%" não tem prefixo de código. Acrescente-a em catalogo_sequencia.', p_categoria;
  end if;

  update public.catalogo_sequencia
     set proximo = proximo + 1
   where prefixo = v_prefixo
  returning proximo - 1 into v_n;

  return v_prefixo || '-' || lpad(v_n::text, 4, '0');
end;
$function$;

revoke all on function public.fn_proximo_codigo_catalogo(text) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. A coluna
-- ---------------------------------------------------------------------------
-- Sem backfill: a migration anterior esvaziou o catálogo. NOT NULL é seguro
-- porque a trigger BEFORE preenche antes da checagem da restrição.
alter table public.catalogo_insumos
  add column if not exists codigo text;

alter table public.catalogo_insumos
  drop constraint if exists catalogo_insumos_codigo_key;
alter table public.catalogo_insumos
  add constraint catalogo_insumos_codigo_key unique (codigo);

comment on column public.catalogo_insumos.codigo is
  'Identificador humano, gerado por categoria (MAT/MO/EQP/SRV/TXA) e IMUTÁVEL: a categoria pode ser corrigida, o código não, senão ele deixa de servir como endereço em relatório e conversa.';

-- O NOME da trigger é funcional, não decorativo: triggers BEFORE disparam em
-- ordem ALFABÉTICA, e `catalogo_codigo` < `catalogo_insumo_before_write`. É isso
-- que garante que o código já exista quando a outra monta a coluna `busca` —
-- sem essa ordem, buscar por "MAT-0001" não acharia nada no dia do cadastro.
create or replace function public.fn_catalogo_codigo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.codigo is null then
      new.codigo := public.fn_proximo_codigo_catalogo(new.categoria);
    end if;
  elsif new.codigo is distinct from old.codigo then
    raise exception 'O código do insumo (%) não pode ser alterado.', old.codigo;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_catalogo_codigo on public.catalogo_insumos;
create trigger trg_catalogo_codigo
  before insert or update on public.catalogo_insumos
  for each row execute function public.fn_catalogo_codigo();

alter table public.catalogo_insumos
  alter column codigo set not null;

-- ---------------------------------------------------------------------------
-- 4. O nome que não se repete
-- ---------------------------------------------------------------------------
-- A unidade ENTRA na chave de propósito: "Cimento CP-II 50kg" em `sc` e em `kg`
-- são dois itens legítimos, com preços legitimamente diferentes. O que não pode
-- existir é o mesmo nome na mesma unidade.
--
-- Índice sobre TODAS as linhas, e não parcial `where ativo`: com um parcial,
-- reativar um insumo antigo colidiria com o novo homônimo só na hora de
-- reativar — o erro mais longe possível da causa.
create unique index if not exists catalogo_insumos_nome_unico
  on public.catalogo_insumos (public.fn_chave_insumo(descricao), unidade);

-- ---------------------------------------------------------------------------
-- 5. O código entra na busca
-- ---------------------------------------------------------------------------
-- Só muda a linha da `busca`; o resto é a versão de 20260919235327 intacta.
create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tem_componentes boolean;
begin
  new.busca := public.fn_normaliza_busca(
    coalesce(new.codigo, '') || ' ' ||
    coalesce(new.descricao, '') || ' ' ||
    coalesce(new.aplicacao, '') || ' ' ||
    coalesce(new.composicao, '')
  );
  select exists (
    select 1 from public.composicao_itens ci where ci.composicao_id = new.id
  ) into v_tem_componentes;
  if tg_op = 'UPDATE'
     and old.tipo_item = 'Composicao'
     and new.tipo_item <> 'Composicao'
     and v_tem_componentes then
    raise exception 'Esta composição tem componentes. Remova-os antes de convertê-la em insumo simples.';
  end if;
  if new.tipo_item = 'Composicao' and v_tem_componentes then
    new.preco_referencia := public.fn_custo_composicao(new.id);
    new.preco_fonte      := 'Composicao';
  end if;
  if tg_op = 'UPDATE'
     and new.preco_referencia is distinct from old.preco_referencia
     and new.data_atualizacao_preco = old.data_atualizacao_preco then
    new.data_atualizacao_preco := current_date;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. A view precisa ser recriada — ela lista coluna a coluna
-- ---------------------------------------------------------------------------
-- `v_catalogo_insumos` enumera as colunas (não usa `c.*`), então acrescentar
-- `codigo` à tabela NÃO o faz chegar ao frontend. É o mesmo defeito silencioso
-- que já custou dois bugs em propostas. `security_invoker` é preservado: sem
-- ele a view passaria a ignorar a RLS do catálogo.
--
-- `codigo` vai para o FIM da lista, e não ao lado do `id` onde seria natural
-- lê-lo: `create or replace view` só aceita ACRESCENTAR coluna no fim — inserir
-- no meio é renomear as colunas seguintes, e o Postgres recusa (42P16). A
-- alternativa seria `drop view ... cascade`, que derrubaria em silêncio quem
-- depende dela. Ordem de coluna em view não é contrato; derrubar dependente é.
create or replace view public.v_catalogo_insumos
with (security_invoker = true) as
 SELECT c.id,
    c.descricao,
    c.unidade,
    c.preco_referencia,
    c.categoria,
    c.fornecedor_padrao_id,
    c.composicao,
    c.aplicacao,
    c.ativo,
    c.data_atualizacao_preco,
    c.created_at,
    c.updated_at,
    c.tipo_item,
    c.preco_fonte,
    c.busca,
    ( SELECT count(DISTINCT io.projeto_id) AS count
           FROM itens_orcamento io
          WHERE io.catalogo_insumo_id = c.id) AS obras_utilizando,
    ( SELECT count(*) AS count
           FROM cotacoes_fornecedores cf
          WHERE cf.catalogo_id = c.id AND cf.ativa) AS cotacoes_ativas,
    ( SELECT count(*) AS count
           FROM catalogo_historico_precos hp
          WHERE hp.catalogo_id = c.id) AS pontos_historico,
    ( SELECT count(*) AS count
           FROM composicao_itens ci
          WHERE ci.composicao_id = c.id) AS qtd_componentes,
    ( SELECT count(*) AS count
           FROM composicao_itens ci
          WHERE ci.insumo_id = c.id) AS usado_em_composicoes,
    (EXISTS ( SELECT 1
           FROM composicao_itens ci
             JOIN catalogo_insumos f ON f.id = ci.insumo_id
          WHERE ci.composicao_id = c.id AND NOT f.ativo)) AS tem_componente_inativo,
    pv.preco AS preco_vigente,
    pv.nivel AS preco_nivel,
    pv.fonte AS preco_fonte_efetiva,
    pv.fornecedor_id AS preco_fornecedor_id,
    pv.data_origem AS preco_data_origem,
    pv.dias_idade AS preco_dias_idade,
    c.codigo
   FROM catalogo_insumos c
     CROSS JOIN LATERAL fn_preco_vigente(c.id) pv(preco, nivel, fonte, fornecedor_id, data_origem, dias_idade);

-- ---------------------------------------------------------------------------
-- 7. A árvore mostra o código
-- ---------------------------------------------------------------------------
-- `returns table` muda, então o DROP é obrigatório — `create or replace` recusa
-- alteração de assinatura.
drop function if exists public.catalogo_composicao_expandida(uuid);
create function public.catalogo_composicao_expandida(p_id uuid)
returns table(nivel integer, ordem text[], caminho uuid[], componente_id uuid, pai_id uuid,
              insumo_id uuid, codigo text, descricao text, unidade text, categoria text,
              tipo_item text, ativo boolean, observacao text, coeficiente numeric,
              coef_acumulado numeric, eh_folha boolean, eh_hora boolean, preco_unitario numeric,
              preco_nivel smallint, preco_fonte text, custo numeric)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Sem permissão para abrir composições do catálogo.';
  end if;

  return query
  with a as (select * from public.fn_composicao_arvore(p_id)),
  pv as (
    select d.insumo_id as id, v.preco, v.nivel, v.fonte
      from (select distinct arv.insumo_id from a arv) d
      cross join lateral public.fn_preco_vigente(d.insumo_id) v
  ),
  folhas as (
    select arv.caminho, round(arv.coef_acumulado * p.preco, 2) as custo
      from a arv join pv p on p.id = arv.insumo_id
     where arv.eh_folha
  )
  select arv.nivel, arv.ordem, arv.caminho, arv.componente_id, arv.pai_id, arv.insumo_id,
         c.codigo, c.descricao, c.unidade, c.categoria, c.tipo_item, c.ativo,
         ci.observacao,
         arv.coeficiente, arv.coef_acumulado,
         arv.eh_folha,
         (c.categoria = 'Mão de Obra' and public.fn_unidade_e_hora(c.unidade)),
         p.preco, p.nivel, p.fonte,
         case
           when arv.eh_folha then round(arv.coef_acumulado * p.preco, 2)
           else (select coalesce(sum(f.custo), 0) from folhas f
                  where f.caminho[1:array_length(arv.caminho, 1)] = arv.caminho)
         end
    from a arv
    join public.catalogo_insumos c on c.id = arv.insumo_id
    join public.composicao_itens ci on ci.id = arv.componente_id
    left join pv p on p.id = arv.insumo_id
   order by arv.ordem;
end;
$function$;

-- O DROP zerou a ACL da função; estes dois grants a devolvem EXATAMENTE ao que
-- era antes (postgres, authenticated, service_role — conferido em `pg_proc.proacl`
-- antes de recriar). Esquecer o `service_role` quebraria qualquer rotina que
-- rode com a chave de serviço, e o erro só apareceria lá.
revoke all on function public.catalogo_composicao_expandida(uuid) from anon, public;
grant execute on function public.catalogo_composicao_expandida(uuid) to authenticated, service_role;
