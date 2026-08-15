-- ============================================================
-- SINAPI → PROPOSTA, SEM PASSAR PELO CATÁLOGO
-- ============================================================
-- O fluxo até aqui obrigava a adoção: para usar uma atividade do SINAPI numa
-- proposta era preciso abrir o Catálogo, buscar no SINAPI, ADOTAR (o que cria
-- de 1 a 25 linhas em catalogo_insumos), voltar à proposta, achar o item
-- adotado e só então incluí-lo. Oito passos para uma linha de orçamento — e,
-- pior, cada consulta a uma referência de mercado deixava resíduo permanente no
-- catálogo da empresa, que existe para guardar o que a empresa REUSA.
--
-- Esta migration abre o caminho curto (SINAPI → proposta) sem tirar nada do
-- longo: adotar continua existindo, o catálogo continua sendo a base própria, e
-- "Salvar no catálogo" passa a ser uma decisão explícita, no fim, quando já se
-- sabe que aquela composição vale a pena reusar.
--
-- ## As três composições, e por que elas não podem ser a mesma tabela
--
--   referencia.composicao_item  SINAPI. Dado de terceiro, só leitura, já era
--                               assim (o schema `referencia` nem é exposto).
--   composicao_itens            Catálogo. O padrão da empresa, reutilizável.
--   itens_proposta_composicao   NOVA. A composição DAQUELE item DAQUELA
--                               proposta — adaptada à obra, sem efeito
--                               colateral em nenhuma das outras duas.
--
-- ## Por que a composição da proposta é PLANA (só o nível 1)
--
-- `sinapi_custo_expandido` devolve a árvore inteira, mas o cabeçalho do
-- `SinapiAdocaoModal` já registra a medição que importa aqui: **a soma do nível
-- 1 reproduz o custo publicado, exato em 7.506/7.506 composições**. O nível 1 é
-- o que o orçamentista edita (pedreiro, ajudante, cimento, areia); um
-- componente que é ele mesmo uma composição — "PEDREIRO COM ENCARGOS
-- COMPLEMENTARES" — entra pelo custo-hora publicado dele, que é exatamente o
-- número que se quer trocar pelo custo próprio da empresa.
--
-- Guardar a árvore inteira daria duas formas de chegar ao mesmo total e a
-- primeira divergência de arredondamento colocaria as duas em desacordo — o
-- modo de falha que este schema já pagou em `v_composicao_itens`.
--
-- ## O arredondamento
--
-- Igual ao do catálogo (`fn_custo_composicao`): soma exata, arredonda UMA vez
-- no fim. O SINAPI trunca cada parcela em centavos, e é por isso que o custo
-- calculado aqui pode divergir do publicado em centavos — a mesma diferença que
-- a adoção "expandida" já produz, e pelo mesmo motivo. `custo` por linha é
-- arredondado para EXIBIÇÃO e não é o que soma o total.

-- ------------------------------------------------------------
-- 1. A origem SINAPI do item de proposta
-- ------------------------------------------------------------
-- `catalogo_insumo_id` nulo já significava "avulso". Agora ele tem dois
-- sentidos possíveis, e sem esta coluna não haveria como distingui-los: um item
-- digitado à mão e uma atividade do SINAPI usada direto. A distinção não é
-- cosmética — ela decide a procedência do preço (item 3) e o que "Salvar no
-- catálogo" tem para salvar.
alter table public.itens_proposta
  add column if not exists codigo_sinapi            text,
  add column if not exists preco_referencia_sinapi  numeric(14,2);

comment on column public.itens_proposta.codigo_sinapi is
  'Código do item na base SINAPI, quando ele foi usado direto na proposta sem passar pelo catálogo. Preenchido também quando veio do catálogo por adoção, para a proposta saber a origem sem depender de join.';
comment on column public.itens_proposta.preco_referencia_sinapi is
  'O custo publicado pelo SINAPI no momento em que o item entrou na proposta. É o TERCEIRO preço da regra — SINAPI, catálogo e aplicado são coisas distintas e ficam guardadas separadamente.';

create index if not exists itens_proposta_codigo_sinapi_idx
  on public.itens_proposta (codigo_sinapi)
  where codigo_sinapi is not null;

-- ------------------------------------------------------------
-- 2. A composição da proposta
-- ------------------------------------------------------------
create table if not exists public.itens_proposta_composicao (
  id                        uuid primary key default gen_random_uuid(),
  item_proposta_id          uuid not null
                              references public.itens_proposta(id) on delete cascade,
  -- De onde a linha veio. Null = acrescentada à mão nesta proposta.
  codigo_sinapi             text,
  -- Preenchido quando o usuário TROCA o componente por um insumo próprio da
  -- empresa ("usar o meu pedreiro"). `on delete set null` e não `restrict`: o
  -- catálogo é soft-delete, e uma proposta antiga não pode travar a faxina do
  -- catálogo — ela guarda descrição e preço próprios, então sobrevive à perda
  -- do vínculo.
  catalogo_insumo_id        uuid references public.catalogo_insumos(id) on delete set null,
  descricao                 text not null,
  unidade                   text not null default 'un',
  -- A categoria do CATÁLOGO (5 valores), não a de custo do orçamento (7): é
  -- ela que diz se a linha é mão de obra, e é de mão de obra que sai o HH.
  categoria                 text not null,
  coeficiente               numeric(14,7) not null,
  -- O coeficiente publicado, preservado. Mesmo papel de
  -- `composicao_itens.coeficiente_referencia`: com produtividade própria o
  -- usuário muda o `coeficiente`, e sem este par ninguém saberia depois quanto
  -- ele se afastou da referência.
  coeficiente_referencia    numeric(14,7),
  preco_unitario            numeric(14,2) not null default 0,
  -- O preço publicado, preservado, pelo mesmo motivo.
  preco_unitario_referencia numeric(14,2),
  -- Só para exibir. O total do item NÃO soma esta coluna — ver o cabeçalho.
  custo                     numeric(14,2) generated always as (
                              round(coeficiente * preco_unitario, 2)
                            ) stored,
  ordem                     int not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint itens_proposta_composicao_coef_check check (coeficiente > 0),
  constraint itens_proposta_composicao_preco_check check (preco_unitario >= 0),
  constraint itens_proposta_composicao_categoria_check check (
    categoria in ('Material', 'Mão de Obra', 'Equipamento', 'Serviço', 'Taxa')
  )
);

comment on table public.itens_proposta_composicao is
  'Composição de um item de proposta, adaptável àquela obra. Nasce copiada do nível 1 da composição SINAPI (ou do catálogo) e a partir daí é independente: editar aqui não altera a referência SINAPI nem o catálogo.';

create index if not exists itens_proposta_composicao_item_idx
  on public.itens_proposta_composicao (item_proposta_id, ordem);
create index if not exists itens_proposta_composicao_catalogo_idx
  on public.itens_proposta_composicao (catalogo_insumo_id)
  where catalogo_insumo_id is not null;

drop trigger if exists trg_itens_proposta_composicao_updated_at on public.itens_proposta_composicao;
create trigger trg_itens_proposta_composicao_updated_at
  before update on public.itens_proposta_composicao
  for each row execute function public.fn_set_updated_at();

-- ------------------------------------------------------------
-- 3. Procedência: SINAPI é 'Referência', não 'Estimado'
-- ------------------------------------------------------------
-- `fn_congela_procedencia_preco` marcava todo item sem `catalogo_insumo_id`
-- como nível 3/'Estimado' — a leitura certa para o item digitado à mão. Uma
-- atividade do SINAPI usada direto cai no mesmo ramo e seria carimbada de
-- "estimado", que é justamente o oposto: preço publicado por tabela de
-- referência é nível 4/'Referência'.
--
-- A diferença não é rótulo: `v_confianca_orcamento_obra` e o painel de
-- confiança de preço decidem por esse número quanta contingência a proposta
-- precisa. Chamar referência de estimativa desloca a leitura para o lado
-- otimista.
create or replace function public.fn_congela_procedencia_preco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pv record;
begin
  if new.preco_nivel is not null
     and new.preco_fonte_efetiva is not null then
    return new;
  end if;

  if new.catalogo_insumo_id is null then
    -- `to_jsonb` porque esta trigger serve DUAS tabelas e `insumos_projeto` não
    -- tem `codigo_sinapi`: referenciar a coluna direto quebraria o insert lá.
    if coalesce(to_jsonb(new)->>'codigo_sinapi', '') <> '' then
      new.preco_nivel         := 4;
      new.preco_fonte_efetiva := 'Referência';
    else
      -- Item avulso, digitado à mão: "estimado" é a descrição honesta dele.
      new.preco_nivel         := 3;
      new.preco_fonte_efetiva := 'Estimado';
    end if;
    new.preco_data_origem := current_date;
    return new;
  end if;

  select * into v_pv from public.fn_preco_vigente(new.catalogo_insumo_id);

  if found then
    new.preco_nivel         := v_pv.nivel;
    new.preco_fonte_efetiva := v_pv.fonte;
    new.preco_data_origem   := v_pv.data_origem;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_congela_procedencia_preco() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 4. Composição manda no preço base — a mesma regra do catálogo
-- ------------------------------------------------------------
-- O catálogo já decidiu isto: "Composição não tem preço próprio.
-- `preco_referencia` de um item com componentes é SEMPRE recalculado pelo
-- banco". Reproduzir a regra aqui é o que o pedido chama de não criar uma
-- segunda lógica de cálculo — e é o que faz "editar a composição" ter efeito
-- visível no preço, que é o ponto do fluxo novo.
--
-- Só age em item QUE TEM composição. Item avulso e item de catálogo sem
-- componentes continuam com a base congelada de sempre; nenhuma linha existente
-- muda de valor por causa desta migration.
--
-- O `ajuste` da proposta continua por cima, intocado: composição decide o
-- CUSTO, o ajuste decide a VENDA. Mexer na composição não apaga a margem que
-- alguém negociou.
create or replace function public.fn_sync_preco_item_proposta(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas int;
  v_custo  numeric(14,2);
begin
  if p_item_id is null then
    return;
  end if;

  -- Soma exata, arredonda uma vez — igual a `fn_custo_composicao`.
  select count(*), coalesce(round(sum(coeficiente * preco_unitario), 2), 0)
    into v_linhas, v_custo
    from public.itens_proposta_composicao
   where item_proposta_id = p_item_id;

  if v_linhas = 0 then
    return;
  end if;

  update public.itens_proposta
     set preco_unitario_base = v_custo,
         updated_at          = now()
   where id = p_item_id
     and preco_unitario_base is distinct from v_custo;
end;
$$;

create or replace function public.fn_itens_proposta_composicao_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_sync_preco_item_proposta(old.item_proposta_id);
  else
    perform public.fn_sync_preco_item_proposta(new.item_proposta_id);
    if tg_op = 'UPDATE' and new.item_proposta_id is distinct from old.item_proposta_id then
      perform public.fn_sync_preco_item_proposta(old.item_proposta_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_itens_proposta_composicao_sync on public.itens_proposta_composicao;
create trigger trg_itens_proposta_composicao_sync
  after insert or update or delete on public.itens_proposta_composicao
  for each row execute function public.fn_itens_proposta_composicao_sync();

revoke execute on function public.fn_sync_preco_item_proposta(uuid) from anon, authenticated, public;
revoke execute on function public.fn_itens_proposta_composicao_sync() from anon, authenticated, public;

-- ------------------------------------------------------------
-- 5. RLS — a mesma matriz de itens_proposta
-- ------------------------------------------------------------
-- Admin e gestão, nada além. Financeiro e campo não enxergam proposta, e uma
-- policy `for all` a mais aqui abriria por baixo o que a tabela-mãe fecha.
alter table public.itens_proposta_composicao enable row level security;

drop policy if exists "admin_all_itens_proposta_composicao" on public.itens_proposta_composicao;
create policy "admin_all_itens_proposta_composicao" on public.itens_proposta_composicao
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_itens_proposta_composicao" on public.itens_proposta_composicao;
create policy "gestao_all_itens_proposta_composicao" on public.itens_proposta_composicao
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ------------------------------------------------------------
-- 6. A leitura: quantos componentes e quanto custa a composição
-- ------------------------------------------------------------
-- Colunas explícitas, nunca `select *` — view com estrela congela a lista no
-- momento da criação, e este schema já pagou dois bugs silenciosos por isso.
create or replace view public.v_itens_proposta
with (security_invoker = true) as
select
  ip.id,
  ip.proposta_id,
  ip.catalogo_insumo_id,
  ip.codigo_sinapi,
  ip.descricao,
  ip.unidade,
  ip.categoria,
  ip.quantidade,
  ip.preco_unitario_base,
  ip.preco_referencia_sinapi,
  ip.ajuste_tipo,
  ip.ajuste_valor,
  ip.ajuste_motivo,
  ip.preco_unitario,
  ip.fornecedor_id,
  ip.observacoes,
  ip.ordem,
  ip.preco_nivel,
  ip.preco_fonte_efetiva,
  ip.preco_data_origem,
  coalesce(c.qtd_componentes, 0)                 as qtd_componentes,
  c.custo_composicao,
  -- Quantas linhas da composição já foram mexidas nesta obra. É o número que
  -- responde "esta composição ainda é a do SINAPI?" sem abrir a árvore.
  coalesce(c.linhas_ajustadas, 0)                as linhas_ajustadas
from public.itens_proposta ip
left join lateral (
  select count(*)                                        as qtd_componentes,
         round(sum(pc.coeficiente * pc.preco_unitario), 2) as custo_composicao,
         count(*) filter (
           where (pc.coeficiente_referencia    is not null and pc.coeficiente    <> pc.coeficiente_referencia)
              or (pc.preco_unitario_referencia is not null and pc.preco_unitario <> pc.preco_unitario_referencia)
              or  pc.coeficiente_referencia    is null
         )                                                as linhas_ajustadas
    from public.itens_proposta_composicao pc
   where pc.item_proposta_id = ip.id
) c on true;

-- ------------------------------------------------------------
-- 7. A ponte de categoria, no banco
-- ------------------------------------------------------------
-- `fn_sinapi_categoria` devolve a categoria do CATÁLOGO (5 valores);
-- `itens_proposta.categoria` é a categoria de CUSTO (7 valores). A ponte já
-- existia só no cliente (`categoriaCustoDoInsumo`, lib/preco.ts), e a RPC
-- precisa dela do lado de cá. Mesma tabela, para as duas não divergirem.
create or replace function public.fn_categoria_custo_do_catalogo(p_categoria text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_categoria
    when 'Material'     then 'Materiais'
    when 'Mão de Obra'  then 'Mão de Obra'
    when 'Equipamento'  then 'Equipamentos'
    when 'Serviço'      then 'Terceiros'
    when 'Taxa'         then 'Administração'
    else 'Materiais'
  end;
$$;

-- ------------------------------------------------------------
-- 8. RPC: adicionar uma atividade do SINAPI à proposta
-- ------------------------------------------------------------
-- Uma transação só, pelo mesmo motivo de `sinapi_adotar`: são até 25 escritas
-- (o item mais os componentes do nível 1), e por PostgREST uma falha no meio
-- deixaria metade da composição gravada — um item com custo pela metade, que é
-- pior do que nenhum item.
create or replace function public.proposta_adicionar_sinapi(
  p_proposta_id uuid,
  p_codigo      integer,
  p_quantidade  numeric default 1,
  p_publicacao  integer default null,
  p_uf          char(2) default 'MG',
  p_regime      char(2) default 'SD'
)
returns uuid
language plpgsql
security definer
set search_path = public, referencia, pg_temp
as $$
declare
  v_pub        integer;
  v_ref        record;
  v_preco      numeric(14,2);
  v_item_id    uuid;
  v_comp       record;
  v_ordem      int := 0;
  v_status     text;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem montar o orçamento de uma proposta.';
  end if;

  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.';
  end if;

  -- A mesma trava que a UI aplica: proposta aprovada, rejeitada ou já
  -- convertida é registro do que foi vendido, não rascunho.
  select status into v_status from public.propostas where id = p_proposta_id;
  if v_status is null then
    raise exception 'Proposta não encontrada.';
  end if;
  -- Mesma régua do `bloqueado` da tela: aprovada e rejeitada já saíram da mesa.
  -- "Enviada" continua editável — renegociar antes do aceite é o normal.
  if v_status in ('Aprovada', 'Rejeitada') then
    raise exception 'A proposta está em "%" e não aceita novos itens.', v_status;
  end if;

  select coalesce(p_publicacao,
                  (select max(id) from referencia.publicacao where concluida_em is not null))
    into v_pub;
  if v_pub is null then
    raise exception 'Nenhuma publicação do SINAPI foi importada.';
  end if;

  select * into v_ref from referencia.item where codigo = p_codigo;
  if not found then
    raise exception 'Item % não existe na base SINAPI.', p_codigo;
  end if;

  select round(pr.centavos / 100.0, 2) into v_preco
    from referencia.preco pr
   where pr.codigo = p_codigo and pr.publicacao_id = v_pub
     and pr.uf = p_uf and pr.regime = p_regime;

  -- 1. O item. `preco_unitario_base` nasce com o custo publicado; se houver
  --    composição, o gatilho do item 4 o substitui pela soma dela logo abaixo.
  insert into public.itens_proposta (
    proposta_id, catalogo_insumo_id, codigo_sinapi, descricao, unidade, categoria,
    quantidade, preco_unitario_base, preco_referencia_sinapi, ordem
  ) values (
    p_proposta_id,
    null,
    p_codigo::text,
    v_ref.descricao,
    coalesce(v_ref.unidade, 'un'),
    public.fn_categoria_custo_do_catalogo(public.fn_sinapi_categoria(v_ref.tipo, v_ref.grupo)),
    p_quantidade,
    coalesce(v_preco, 0),
    v_preco,
    coalesce((select max(ordem) + 1 from public.itens_proposta where proposta_id = p_proposta_id), 0)
  )
  returning id into v_item_id;

  if v_item_id is null then
    raise exception 'Nenhuma linha foi criada — sem permissão para escrever nesta proposta.';
  end if;

  -- 2. O nível 1 da composição, quando existe.
  if v_ref.tipo = 'COMPOSICAO' then
    for v_comp in
      select ci.item, ci.coeficiente,
             i.tipo, i.descricao, i.unidade, i.grupo,
             pr.centavos
        from referencia.composicao_item ci
        join referencia.item i on i.codigo = ci.item
        left join referencia.preco pr
               on pr.codigo = ci.item
              and pr.publicacao_id = v_pub
              and pr.uf = p_uf
              and pr.regime = p_regime
       where ci.composicao = p_codigo
         and ci.publicacao_id = v_pub
       order by i.descricao
    loop
      -- Coeficiente zero não entra: a tabela exige > 0, e um componente que não
      -- entra na conta não é linha de composição. A planilha do SINAPI tem
      -- quatro deles (medido na adoção).
      continue when v_comp.coeficiente <= 0;

      insert into public.itens_proposta_composicao (
        item_proposta_id, codigo_sinapi, descricao, unidade, categoria,
        coeficiente, coeficiente_referencia,
        preco_unitario, preco_unitario_referencia, ordem
      ) values (
        v_item_id,
        v_comp.item::text,
        v_comp.descricao,
        coalesce(v_comp.unidade, 'un'),
        public.fn_sinapi_categoria(v_comp.tipo, v_comp.grupo),
        v_comp.coeficiente,
        v_comp.coeficiente,
        -- Sem preço publicado na UF a linha entra com zero E com referência
        -- NULA: são coisas diferentes, e marcar zero como "referência" faria a
        -- tela dizer que o SINAPI publicou R$ 0,00.
        coalesce(round(v_comp.centavos / 100.0, 2), 0),
        round(v_comp.centavos / 100.0, 2),
        v_ordem
      );
      v_ordem := v_ordem + 1;
    end loop;
  end if;

  return v_item_id;
end;
$$;

revoke execute on function public.proposta_adicionar_sinapi(uuid, integer, numeric, integer, char, char) from anon;
revoke execute on function public.proposta_adicionar_sinapi(uuid, integer, numeric, integer, char, char) from public;
grant  execute on function public.proposta_adicionar_sinapi(uuid, integer, numeric, integer, char, char) to authenticated;

-- ------------------------------------------------------------
-- 9. RPC: salvar no catálogo o que a proposta ajustou
-- ------------------------------------------------------------
-- A ação explícita do fluxo. Nada aqui roda sozinho: editar a composição de uma
-- proposta NUNCA toca o catálogo, e é preciso pedir.
--
-- O que ela cria: um item de catálogo com a composição DA PROPOSTA (a ajustada,
-- não a do SINAPI). Cada componente vira — ou reusa — um insumo de catálogo,
-- pela mesma chave que `sinapi_adotar` usa (código + UF + mês + desoneração);
-- componente acrescentado à mão vira insumo 'Manual'.
--
-- Não sobrescreve preço de item que já existia: o catálogo é a base própria da
-- empresa, e uma proposta com desconto agressivo não pode rebaixar em silêncio
-- o preço padrão de tudo. Quando o item já existe, a composição é substituída e
-- o preço é recalculado pelo gatilho do catálogo — que é o comportamento
-- documentado dele.
create or replace function public.proposta_item_salvar_no_catalogo(
  p_item_id uuid,
  p_uf      char(2) default 'MG',
  p_regime  char(2) default 'SD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, referencia, pg_temp
as $$
declare
  v_item       record;
  v_mes        text;
  v_deson      boolean;
  v_id         uuid;
  v_ja_existia boolean;
  v_comp       record;
  v_filho_id   uuid;
  v_criados    int := 0;
  v_reusados   int := 0;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem escrever no catálogo.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;

  v_deson := (p_regime = 'CD');
  select to_char(mes_referencia, 'YYYY-MM') into v_mes
    from referencia.publicacao
   where concluida_em is not null
   order by id desc limit 1;

  -- 1. O item de catálogo. A chave de reuso é a mesma de `sinapi_adotar`.
  if v_item.codigo_sinapi is not null then
    select ca.id into v_id
      from public.catalogo_insumos ca
     where ca.codigo_sinapi = v_item.codigo_sinapi
       and coalesce(ca.uf, '') = p_uf
       and coalesce(ca.mes_referencia, '') = coalesce(v_mes, '')
       and coalesce(ca.desonerado, false) = v_deson;
  end if;
  v_ja_existia := v_id is not null;

  if not v_ja_existia then
    insert into public.catalogo_insumos (
      codigo_sinapi, descricao, unidade, preco_referencia, categoria, tipo,
      uf, mes_referencia, desonerado, tipo_item, preco_fonte
    ) values (
      v_item.codigo_sinapi,
      v_item.descricao,
      v_item.unidade,
      v_item.preco_unitario_base,
      -- A categoria do catálogo é a de 5 valores; o item guarda a de custo.
      case v_item.categoria
        when 'Materiais'      then 'Material'
        when 'Mão de Obra'    then 'Mão de Obra'
        when 'Equipamentos'   then 'Equipamento'
        when 'Terceiros'      then 'Serviço'
        when 'Administração'  then 'Taxa'
        else 'Material'
      end,
      case when v_item.codigo_sinapi is null then 'Próprio' else 'SINAPI' end,
      case when v_item.codigo_sinapi is null then null else p_uf end,
      case when v_item.codigo_sinapi is null then null else v_mes end,
      case when v_item.codigo_sinapi is null then null else v_deson end,
      case when exists (select 1 from public.itens_proposta_composicao
                         where item_proposta_id = p_item_id)
           then 'Composicao' else 'Insumo' end,
      'Manual'
    )
    returning id into v_id;

    if v_id is null then
      raise exception 'Nenhuma linha foi criada — sem permissão para escrever no catálogo.';
    end if;
  end if;

  -- 2. A composição AJUSTADA. Substitui a que estiver lá: quem pede para salvar
  --    está dizendo "este é o meu padrão agora".
  delete from public.composicao_itens where composicao_id = v_id;

  for v_comp in
    select * from public.itens_proposta_composicao
     where item_proposta_id = p_item_id
     order by ordem
  loop
    v_filho_id := v_comp.catalogo_insumo_id;

    if v_filho_id is null and v_comp.codigo_sinapi is not null then
      select ca.id into v_filho_id
        from public.catalogo_insumos ca
       where ca.codigo_sinapi = v_comp.codigo_sinapi
         and coalesce(ca.uf, '') = p_uf
         and coalesce(ca.mes_referencia, '') = coalesce(v_mes, '')
         and coalesce(ca.desonerado, false) = v_deson;
    end if;

    if v_filho_id is null then
      insert into public.catalogo_insumos (
        codigo_sinapi, descricao, unidade, preco_referencia, categoria, tipo,
        uf, mes_referencia, desonerado, tipo_item, preco_fonte
      ) values (
        v_comp.codigo_sinapi,
        v_comp.descricao,
        v_comp.unidade,
        v_comp.preco_unitario,
        v_comp.categoria,
        case when v_comp.codigo_sinapi is null then 'Próprio' else 'SINAPI' end,
        case when v_comp.codigo_sinapi is null then null else p_uf end,
        case when v_comp.codigo_sinapi is null then null else v_mes end,
        case when v_comp.codigo_sinapi is null then null else v_deson end,
        'Insumo',
        'Manual'
      )
      returning id into v_filho_id;
      v_criados := v_criados + 1;
    else
      v_reusados := v_reusados + 1;
    end if;

    insert into public.composicao_itens (
      composicao_id, insumo_id, coeficiente, coeficiente_referencia
    ) values (
      v_id, v_filho_id, v_comp.coeficiente, v_comp.coeficiente_referencia
    )
    on conflict (composicao_id, insumo_id) do update
       set coeficiente = excluded.coeficiente,
           coeficiente_referencia = excluded.coeficiente_referencia;
  end loop;

  -- 3. O item passa a apontar para o catálogo. Sem isto ele continuaria
  --    marcado como "direto do SINAPI" mesmo depois de virar padrão da empresa,
  --    e a próxima proposta não encontraria o vínculo.
  update public.itens_proposta
     set catalogo_insumo_id = v_id
   where id = p_item_id;

  return jsonb_build_object(
    'catalogo_insumo_id', v_id,
    'ja_existia',         v_ja_existia,
    'componentes',        v_criados + v_reusados,
    'itens_criados',      v_criados,
    'itens_reusados',     v_reusados
  );
end;
$$;

revoke execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) from anon;
revoke execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) from public;
grant  execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) to authenticated;

-- ------------------------------------------------------------
-- 10. RPC: trazer a composição do CATÁLOGO para a proposta
-- ------------------------------------------------------------
-- O outro lado do fluxo: um item que veio do catálogo e tem composição própria
-- também deve poder ser adaptado à obra. Mesma transação-única, mesmo motivo.
--
-- Copia o nível 1 dos componentes com o PREÇO VIGENTE de cada um — que é o
-- número que o catálogo usa para somar a composição, e o que faz o custo aqui
-- bater com o que a tela do catálogo mostra.
create or replace function public.proposta_item_copiar_composicao_catalogo(
  p_item_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     record;
  v_comp     record;
  v_ordem    int := 0;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem montar o orçamento de uma proposta.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;
  if v_item.catalogo_insumo_id is null then
    raise exception 'Este item não veio do catálogo.';
  end if;
  if exists (select 1 from public.itens_proposta_composicao where item_proposta_id = p_item_id) then
    raise exception 'Este item já tem composição nesta proposta.';
  end if;

  for v_comp in
    select ci.insumo_id, ci.coeficiente, ci.coeficiente_referencia,
           ca.descricao, ca.unidade, ca.categoria,
           pv.preco
      from public.composicao_itens ci
      join public.catalogo_insumos ca on ca.id = ci.insumo_id
      cross join lateral public.fn_preco_vigente(ci.insumo_id) pv
     where ci.composicao_id = v_item.catalogo_insumo_id
     order by ca.categoria, ca.descricao
  loop
    insert into public.itens_proposta_composicao (
      item_proposta_id, catalogo_insumo_id, descricao, unidade, categoria,
      coeficiente, coeficiente_referencia, preco_unitario, preco_unitario_referencia, ordem
    ) values (
      p_item_id, v_comp.insumo_id, v_comp.descricao, v_comp.unidade, v_comp.categoria,
      v_comp.coeficiente, coalesce(v_comp.coeficiente_referencia, v_comp.coeficiente),
      coalesce(v_comp.preco, 0), v_comp.preco, v_ordem
    );
    v_ordem := v_ordem + 1;
  end loop;

  return v_ordem;
end;
$$;

revoke execute on function public.proposta_item_copiar_composicao_catalogo(uuid) from anon;
revoke execute on function public.proposta_item_copiar_composicao_catalogo(uuid) from public;
grant  execute on function public.proposta_item_copiar_composicao_catalogo(uuid) to authenticated;
