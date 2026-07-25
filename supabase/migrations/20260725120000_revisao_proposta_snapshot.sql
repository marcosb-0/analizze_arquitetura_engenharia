-- ============================================================
-- REVISÃO DE PROPOSTA VIRA SNAPSHOT DO ORÇAMENTO
-- ============================================================
-- A revisão era um número digitado à mão que sobrescrevia
-- `propostas.valor_estimado`. Só que, desde 20260723120002, esse mesmo campo é
-- CALCULADO pelo banco a partir dos itens (fn_sync_valor_proposta). As duas
-- autoridades brigavam:
--
--   registra revisão de R$ 145.000  -> valor_estimado = 145.000
--   mexe em qualquer item ou no BDI -> valor_estimado = soma dos itens x BDI
--
-- ...e o valor da revisão virava órfão. A UI chegava a exibir um aviso âmbar
-- explicando a divergência — um sintoma documentado em vez de corrigido.
--
-- Agora a revisão CONGELA o orçamento vigente: copia os itens com quantidade e
-- preço, guarda o BDI e o total, e nunca escreve em valor_estimado. Com isso o
-- histórico passa a responder "o que mudou entre a v2 e a v3", e não apenas
-- "quanto mudou".

-- ============================================================
-- 1. A revisão guarda a composição, não só o total
-- ============================================================
alter table public.revisoes_proposta
  add column if not exists bdi_percentual numeric(6,3) not null default 0,
  add column if not exists valor_itens    numeric(14,2) not null default 0;

comment on column public.revisoes_proposta.valor is
  'Total congelado da revisão (itens + BDI). Para propostas sem itens, o valor digitado.';
comment on column public.revisoes_proposta.valor_itens is
  'Soma dos itens no momento do congelamento, antes do BDI.';

-- ============================================================
-- 2. Linhas do snapshot
-- ============================================================
-- Deliberadamente desnormalizado e SEM FK para itens_proposta: o item de origem
-- pode ser removido da proposta depois, e mesmo assim a versão histórica tem de
-- continuar legível. `catalogo_insumo_id` fica só como procedência, sem
-- integridade referencial forte, pelo mesmo motivo.
create table if not exists public.itens_revisao_proposta (
  id                 uuid primary key default gen_random_uuid(),
  revisao_id         uuid not null references public.revisoes_proposta(id) on delete cascade,
  catalogo_insumo_id uuid,
  descricao          text not null,
  unidade            text not null default 'un',
  categoria          text not null,
  quantidade         numeric(14,3) not null default 0,
  preco_unitario     numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  ordem              int not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists idx_itens_revisao_proposta_revisao
  on public.itens_revisao_proposta(revisao_id);

comment on table public.itens_revisao_proposta is
  'Cópia congelada dos itens da proposta no momento em que a revisão foi registrada.';

-- ============================================================
-- 3. RLS — mesma matriz de propostas (admin + gestão)
-- ============================================================
alter table public.itens_revisao_proposta enable row level security;

drop policy if exists "admin_all_itens_revisao_proposta" on public.itens_revisao_proposta;
create policy "admin_all_itens_revisao_proposta" on public.itens_revisao_proposta
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_itens_revisao_proposta" on public.itens_revisao_proposta;
create policy "gestao_all_itens_revisao_proposta" on public.itens_revisao_proposta
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- 4. Registrar revisão = congelar o estado atual
-- ============================================================
-- SECURITY INVOKER de propósito: quem não pode escrever em revisoes_proposta
-- pela RLS também não deve conseguir por aqui. A função só orquestra.
create or replace function public.fn_registrar_revisao_proposta(
  p_proposta_id uuid,
  p_alteracoes  text,
  -- Usado apenas quando a proposta não tem itens; com itens, o total vem do
  -- orçamento e um valor digitado seria justamente a divergência que se quer
  -- eliminar.
  p_valor       numeric default null,
  -- O banco roda em UTC: `current_date` viraria o dia seguinte para quem
  -- registra uma revisão depois das 21h no Brasil. Quem sabe o dia local é o
  -- cliente.
  p_data        date default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_proposta   record;
  v_versao     int;
  v_qtd_itens  int;
  v_valor_itens numeric(14,2);
  v_total      numeric(14,2);
  v_revisao_id uuid;
begin
  -- FOR UPDATE serializa duas revisões concorrentes: sem isso as duas leem a
  -- mesma versão máxima e a segunda bate na unique (proposta_id, versao).
  select * into v_proposta from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;

  if coalesce(btrim(p_alteracoes), '') = '' then
    raise exception 'Descreva o que mudou nesta revisão.';
  end if;

  select count(*), coalesce(sum(round(quantidade * preco_unitario, 2)), 0)
    into v_qtd_itens, v_valor_itens
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  if v_qtd_itens > 0 then
    -- Mesmo arredondamento de fn_sync_valor_proposta, para o total da revisão
    -- bater exatamente com o valor_estimado vigente.
    v_total := round(v_valor_itens * (1 + v_proposta.bdi_percentual / 100.0), 2);
  else
    v_total := coalesce(p_valor, v_proposta.valor_estimado);
    v_valor_itens := 0;
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.revisoes_proposta where proposta_id = p_proposta_id;

  insert into public.revisoes_proposta
    (proposta_id, versao, data, valor, valor_itens, bdi_percentual, alteracoes)
  values
    (p_proposta_id, v_versao, coalesce(p_data, current_date), v_total, v_valor_itens,
     v_proposta.bdi_percentual, p_alteracoes)
  returning id into v_revisao_id;

  insert into public.itens_revisao_proposta
    (revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario, total, ordem)
  select
    v_revisao_id, catalogo_insumo_id, descricao, unidade, categoria, quantidade, preco_unitario,
    round(quantidade * preco_unitario, 2), ordem
  from public.itens_proposta
  where proposta_id = p_proposta_id;

  -- Sem itens o número digitado continua sendo a única fonte do valor, então
  -- ele ainda manda em valor_estimado. Com itens, valor_estimado pertence ao
  -- trigger e a revisão não encosta nele.
  if v_qtd_itens = 0 and p_valor is not null then
    update public.propostas set valor_estimado = p_valor where id = p_proposta_id;
  end if;

  return v_revisao_id;
end;
$$;

comment on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) is
  'Congela o orçamento vigente da proposta como uma nova revisão versionada.';

revoke execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) from anon, public;
grant  execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) to authenticated;
