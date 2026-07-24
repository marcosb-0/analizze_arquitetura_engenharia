-- ============================================================
-- INSUMOS DO PROJETO — quantitativo real + ajuste de preço por orçamento
-- ============================================================
-- Problema 1 (quantitativo perdido): a vinculação catálogo -> orçamento gravava
-- quantidade e preço unitário DENTRO de uma string ("Cimento (10 saco) via
-- Casa X") e só persistia o total em itens_orcamento.valor_orcado. A tabela
-- insumos_projeto existia desde o início exatamente para isso e nunca foi
-- usada por linha alguma da aplicação. Sem ela não há recálculo quando o preço
-- muda, não há curva ABC, não há "quanto de cimento esta obra consome".
--
-- Problema 2 (o pedido novo): é preciso acrescer ou reduzir o preço de um
-- insumo DENTRO de um orçamento específico — frete diferente, negociação,
-- urgência — sem que isso mexa no preço de referência global do catálogo.
--
-- Solução: o preço unitário do insumo no projeto deixa de ser um número solto e
-- passa a ser DERIVADO de três colunas:
--
--   preco_unitario_base  -> foto do preço de origem (catálogo ou cotação) no
--                           momento da vinculação. Nunca muda sozinho.
--   ajuste_tipo/valor    -> o acréscimo ou desconto desta obra. Negativo = desconto.
--   preco_unitario       -> GENERATED. Não pode divergir da fórmula.
--
-- O catálogo global fica intocado: nada aqui escreve em catalogo_insumos.

-- ============================================================
-- 1. Reconstruir preco_unitario como coluna derivada
-- ============================================================
alter table public.insumos_projeto
  add column if not exists preco_unitario_base numeric(14,2) not null default 0,
  add column if not exists ajuste_tipo         text          not null default 'Nenhum',
  add column if not exists ajuste_valor        numeric(14,4) not null default 0,
  add column if not exists ajuste_motivo       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_projeto_ajuste_tipo_check') then
    alter table public.insumos_projeto
      add constraint insumos_projeto_ajuste_tipo_check
      check (ajuste_tipo in ('Nenhum', 'Percentual', 'Valor'));
  end if;
end $$;

-- Preserva o que já existir antes de trocar a coluna pela versão derivada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'insumos_projeto'
       and column_name = 'preco_unitario' and is_generated = 'NEVER'
  ) then
    update public.insumos_projeto set preco_unitario_base = preco_unitario;
    alter table public.insumos_projeto drop column preco_unitario;
  end if;
end $$;

alter table public.insumos_projeto
  add column if not exists preco_unitario numeric(14,2)
  generated always as (
    round(
      case ajuste_tipo
        when 'Percentual' then preco_unitario_base * (1 + ajuste_valor / 100.0)
        when 'Valor'      then preco_unitario_base + ajuste_valor
        else                   preco_unitario_base
      end
    , 2)
  ) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_projeto_preco_nao_negativo') then
    alter table public.insumos_projeto
      add constraint insumos_projeto_preco_nao_negativo check (preco_unitario >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'insumos_projeto_quantidade_check') then
    alter table public.insumos_projeto
      add constraint insumos_projeto_quantidade_check check (quantidade > 0);
  end if;
end $$;

comment on column public.insumos_projeto.preco_unitario_base is
  'Preço de origem (catálogo ou cotação) congelado na vinculação. O catálogo global nunca é alterado a partir daqui.';
comment on column public.insumos_projeto.ajuste_valor is
  'Acréscimo (positivo) ou desconto (negativo) deste orçamento. Percentual em %, Valor em R$ por unidade.';
comment on column public.insumos_projeto.preco_unitario is
  'Derivada de base + ajuste. Não é gravável — ajuste-se ajuste_tipo/ajuste_valor.';

-- ============================================================
-- 2. O item de orçamento passa a refletir o quantitativo
-- ============================================================
-- Quando um item de orçamento tem insumos vinculados, seu valor_orcado é a soma
-- de quantidade x preço ajustado — e é recalculado sozinho a cada mudança de
-- quantidade ou de ajuste. Itens digitados à mão (sem insumo vinculado) seguem
-- intocados: a função só age quando existe pelo menos uma linha apontando para
-- o item.
create or replace function public.fn_sync_valor_item_orcamento(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(14,2);
  v_qtd   int;
begin
  if p_item_id is null then
    return;
  end if;

  select count(*), coalesce(sum(round(quantidade * preco_unitario, 2)), 0)
    into v_qtd, v_total
    from public.insumos_projeto
   where item_orcamento_id = p_item_id;

  if v_qtd = 0 then
    return;
  end if;

  update public.itens_orcamento
     set valor_orcado = v_total,
         updated_at   = now()
   where id = p_item_id
     and valor_orcado is distinct from v_total;
end;
$$;

create or replace function public.fn_insumo_projeto_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_sync_valor_item_orcamento(old.item_orcamento_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_sync_valor_item_orcamento(new.item_orcamento_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_insumos_projeto_updated_at on public.insumos_projeto;
create trigger trg_insumos_projeto_updated_at
  before update on public.insumos_projeto
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_insumo_projeto_sync on public.insumos_projeto;
create trigger trg_insumo_projeto_sync
  after insert or update or delete on public.insumos_projeto
  for each row execute function public.fn_insumo_projeto_sync();

revoke execute on function public.fn_sync_valor_item_orcamento(uuid) from anon, authenticated, public;
revoke execute on function public.fn_insumo_projeto_sync() from anon, authenticated, public;

-- ============================================================
-- 3. View de leitura
-- ============================================================
create or replace view public.v_insumos_projeto
with (security_invoker = true) as
select
  ip.*,
  round(ip.quantidade * ip.preco_unitario, 2)                        as valor_total,
  round(ip.quantidade * ip.preco_unitario_base, 2)                   as valor_total_base,
  round(ip.quantidade * (ip.preco_unitario - ip.preco_unitario_base), 2) as valor_ajuste,
  case when ip.quantidade > 0
       then least(round(ip.quantidade_executada / ip.quantidade * 100, 2), 100)
       else 0 end                                                    as percentual_executado,
  ci.descricao      as insumo_descricao,
  ci.unidade        as insumo_unidade,
  ci.categoria      as insumo_categoria,
  ci.preco_referencia as insumo_preco_referencia
from public.insumos_projeto ip
join public.catalogo_insumos ci on ci.id = ip.catalogo_insumo_id;

-- ============================================================
-- 4. Índices e leitura para os papéis que já enxergam o orçamento
-- ============================================================
create index if not exists insumos_projeto_projeto_idx
  on public.insumos_projeto (projeto_id);
create index if not exists insumos_projeto_catalogo_idx
  on public.insumos_projeto (catalogo_insumo_id);
create index if not exists insumos_projeto_item_orcamento_idx
  on public.insumos_projeto (item_orcamento_id)
  where item_orcamento_id is not null;
create index if not exists insumos_projeto_etapa_idx
  on public.insumos_projeto (etapa_vinculada_id)
  where etapa_vinculada_id is not null;

-- 'financeiro' já lê itens_orcamento como contexto de custo; sem esta policy a
-- v_insumos_projeto (security_invoker) voltaria vazia para o papel. 'campo' lê
-- apenas os insumos das obras em que está alocado, na mesma regra de
-- campo_select_itens_orcamento.
drop policy if exists "financeiro_select_insumos_projeto" on public.insumos_projeto;
create policy "financeiro_select_insumos_projeto" on public.insumos_projeto
  for select using (public.fn_current_role() = 'financeiro');

drop policy if exists "campo_select_insumos_projeto" on public.insumos_projeto;
create policy "campo_select_insumos_projeto" on public.insumos_projeto
  for select using (
    public.fn_current_role() = 'campo' and public.fn_has_projeto_access(projeto_id)
  );
