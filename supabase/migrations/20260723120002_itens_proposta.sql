-- ============================================================
-- PROPOSTA ORÇADA POR ITEM — o catálogo passa a alimentar a venda
-- ============================================================
-- Antes desta migration o único caminho catálogo -> dinheiro exigia uma obra já
-- existente: a vinculação escolhia um `projeto_id`. Ou seja, orçava-se DEPOIS
-- de vender. A proposta era um único número digitado (propostas.valor_estimado)
-- e o wizard de conversão distribuía esse número em percentuais fixos, sem
-- nenhuma relação com os itens que geraram o preço.
--
-- Agora a proposta tem itens, alimentados pelo catálogo, com o mesmo modelo de
-- preço de insumos_projeto (base congelada + ajuste desta proposta, catálogo
-- global intocado), somados de baixo para cima e acrescidos de BDI.
--
-- E a conversão proposta -> obra herda esses itens: cada item vira um item de
-- orçamento E uma linha de insumos_projeto, preservando quantidade, preço base
-- e o ajuste negociado.

-- ============================================================
-- 1. BDI da proposta
-- ============================================================
alter table public.propostas
  add column if not exists bdi_percentual numeric(6,3) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'propostas_bdi_check') then
    alter table public.propostas
      add constraint propostas_bdi_check check (bdi_percentual >= -100 and bdi_percentual <= 1000);
  end if;
end $$;

comment on column public.propostas.bdi_percentual is
  'Benefícios e Despesas Indiretas, aplicado sobre a soma dos itens. Só tem efeito quando a proposta tem itens.';

-- ============================================================
-- 2. Itens da proposta
-- ============================================================
create table if not exists public.itens_proposta (
  id                  uuid primary key default gen_random_uuid(),
  proposta_id         uuid not null references public.propostas(id) on delete cascade,
  -- Null = item avulso digitado à mão; preenchido = veio do catálogo e mantém a
  -- procedência (on delete restrict porque o catálogo é soft-delete).
  catalogo_insumo_id  uuid references public.catalogo_insumos(id) on delete restrict,
  descricao           text not null,
  unidade             text not null default 'un',
  categoria           text not null,
  quantidade          numeric(14,3) not null default 1,
  -- Mesmo contrato de insumos_projeto: base congelada, ajuste desta proposta,
  -- preço final derivado. Ver 20260723120001.
  preco_unitario_base numeric(14,2) not null default 0,
  ajuste_tipo         text not null default 'Nenhum',
  ajuste_valor        numeric(14,4) not null default 0,
  ajuste_motivo       text,
  preco_unitario      numeric(14,2) generated always as (
    round(
      case ajuste_tipo
        when 'Percentual' then preco_unitario_base * (1 + ajuste_valor / 100.0)
        when 'Valor'      then preco_unitario_base + ajuste_valor
        else                   preco_unitario_base
      end
    , 2)
  ) stored,
  fornecedor_id       uuid references public.fornecedores(id) on delete set null,
  observacoes         text,
  ordem               int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint itens_proposta_quantidade_check check (quantidade > 0),
  constraint itens_proposta_ajuste_tipo_check check (ajuste_tipo in ('Nenhum', 'Percentual', 'Valor')),
  constraint itens_proposta_preco_nao_negativo check (preco_unitario >= 0),
  constraint itens_proposta_categoria_check check (
    categoria in ('Materiais', 'Mão de Obra', 'Equipamentos', 'Terceiros',
                  'Deslocamentos', 'Administração', 'Contingências')
  )
);

create index if not exists itens_proposta_proposta_idx on public.itens_proposta (proposta_id, ordem);
create index if not exists itens_proposta_catalogo_idx on public.itens_proposta (catalogo_insumo_id)
  where catalogo_insumo_id is not null;

drop trigger if exists trg_itens_proposta_updated_at on public.itens_proposta;
create trigger trg_itens_proposta_updated_at
  before update on public.itens_proposta
  for each row execute function public.fn_set_updated_at();

-- ============================================================
-- 3. valor_estimado passa a ser calculado quando há itens
-- ============================================================
-- Só age quando a proposta TEM itens — propostas legadas (valor digitado, sem
-- itens) continuam funcionando exatamente como antes. Uma revisão registrada
-- manualmente em proposta com itens sobrescreve o valor até a próxima mudança
-- de item; a UI mostra o total calculado ao lado para deixar a diferença visível.
create or replace function public.fn_sync_valor_proposta(p_proposta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_itens int;
  v_soma  numeric(14,2);
  v_bdi   numeric(6,3);
  v_total numeric(14,2);
begin
  if p_proposta_id is null then
    return;
  end if;

  select count(*), coalesce(sum(round(quantidade * preco_unitario, 2)), 0)
    into v_itens, v_soma
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  if v_itens = 0 then
    return;
  end if;

  select bdi_percentual into v_bdi from public.propostas where id = p_proposta_id;
  v_total := round(v_soma * (1 + coalesce(v_bdi, 0) / 100.0), 2);

  update public.propostas
     set valor_estimado = v_total,
         updated_at     = now()
   where id = p_proposta_id
     and valor_estimado is distinct from v_total;
end;
$$;

create or replace function public.fn_itens_proposta_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.fn_sync_valor_proposta(old.proposta_id);
  else
    perform public.fn_sync_valor_proposta(new.proposta_id);
    if tg_op = 'UPDATE' and new.proposta_id is distinct from old.proposta_id then
      perform public.fn_sync_valor_proposta(old.proposta_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_itens_proposta_sync on public.itens_proposta;
create trigger trg_itens_proposta_sync
  after insert or update or delete on public.itens_proposta
  for each row execute function public.fn_itens_proposta_sync();

-- Mexer no BDI recalcula o total sem precisar tocar em nenhum item.
create or replace function public.fn_proposta_bdi_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bdi_percentual is distinct from old.bdi_percentual then
    perform public.fn_sync_valor_proposta(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_proposta_bdi_sync on public.propostas;
create trigger trg_proposta_bdi_sync
  after update on public.propostas
  for each row execute function public.fn_proposta_bdi_sync();

revoke execute on function public.fn_sync_valor_proposta(uuid) from anon, authenticated, public;
revoke execute on function public.fn_itens_proposta_sync() from anon, authenticated, public;
revoke execute on function public.fn_proposta_bdi_sync() from anon, authenticated, public;

-- ============================================================
-- 4. View de leitura da proposta com o total dos itens
-- ============================================================
create or replace view public.v_propostas
with (security_invoker = true) as
select
  p.*,
  coalesce(i.qtd_itens, 0)   as qtd_itens,
  coalesce(i.valor_itens, 0) as valor_itens,
  round(coalesce(i.valor_itens, 0) * (1 + p.bdi_percentual / 100.0), 2) as valor_calculado
from public.propostas p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(quantidade * preco_unitario, 2)) as valor_itens
    from public.itens_proposta ip
   where ip.proposta_id = p.id
) i on true;

-- ============================================================
-- 5. RLS — mesma matriz de propostas (admin + gestão)
-- ============================================================
alter table public.itens_proposta enable row level security;

drop policy if exists "admin_all_itens_proposta" on public.itens_proposta;
create policy "admin_all_itens_proposta" on public.itens_proposta
  for all using (public.fn_current_role() = 'admin')
  with check (public.fn_current_role() = 'admin');

drop policy if exists "gestao_all_itens_proposta" on public.itens_proposta;
create policy "gestao_all_itens_proposta" on public.itens_proposta
  for all using (public.fn_current_role() = 'gestao')
  with check (public.fn_current_role() = 'gestao');

-- ============================================================
-- 6. A conversão proposta -> obra passa a herdar o quantitativo
-- ============================================================
-- Substitui a versão de 20260720120001. Novidade: cada entrada de `itens` pode
-- trazer a procedência do catálogo (catalogo_insumo_id + quantidade + preço
-- base + ajuste). Quando traz, além do item de orçamento é criada a linha
-- correspondente em insumos_projeto — e a trigger trg_insumo_projeto_sync
-- recalcula valor_orcado a partir de quantidade x preço ajustado, de modo que o
-- número na obra nunca diverge do quantitativo que o originou.
--
-- Formato de cada item em p_payload->'itens':
--   {
--     "categoria": "Materiais", "descricao": "text",
--     "valor_orcado": 0, "valor_contratado": 0, "etapa_ref": 0|null,
--     "catalogo_insumo_id": "uuid|null", "quantidade": 0|null,
--     "preco_unitario_base": 0|null, "ajuste_tipo": "Nenhum|Percentual|Valor",
--     "ajuste_valor": 0, "ajuste_motivo": "text|null", "fornecedor_id": "uuid|null"
--   }
create or replace function public.fn_criar_projeto_from_proposta(
  p_proposta_id uuid,
  p_payload     jsonb
)
returns public.projetos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta   record;
  v_projeto_id uuid := gen_random_uuid();
  v_projeto    public.projetos;
  v_etapa_map  jsonb := '{}'::jsonb;   -- ref (text) -> etapa uuid (text)
  v_etapa      jsonb;
  v_item       jsonb;
  v_etapa_id   uuid;
  v_item_id    uuid;
  v_ref        text;
  v_target_ref text;
  v_insumo_id  uuid;
  v_etapa_alvo uuid;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem converter propostas em projetos.';
  end if;

  select * into v_proposta from public.propostas where id = p_proposta_id for update;
  if not found then
    raise exception 'Proposta não encontrada.';
  end if;
  if v_proposta.status <> 'Aprovada' then
    raise exception 'Somente propostas aprovadas podem ser convertidas em projeto.';
  end if;
  if exists (select 1 from public.projetos where proposta_id = p_proposta_id) then
    raise exception 'Esta proposta já foi convertida em projeto.';
  end if;

  if coalesce(btrim(p_payload->>'nome'), '') = '' then
    raise exception 'O nome da obra é obrigatório.';
  end if;
  if (p_payload->>'data_inicio') is null or (p_payload->>'data_fim') is null then
    raise exception 'As datas de início e de entrega são obrigatórias.';
  end if;
  if (p_payload->>'data_fim')::date < (p_payload->>'data_inicio')::date then
    raise exception 'A data de entrega não pode ser anterior à data de início.';
  end if;

  insert into public.projetos (
    id, nome, cliente_id, proposta_id, responsavel_interno_id, endereco_obra, data_inicio, data_fim, situacao
  ) values (
    v_projeto_id,
    btrim(p_payload->>'nome'),
    v_proposta.cliente_id,
    p_proposta_id,
    nullif(p_payload->>'responsavel_id', '')::uuid,
    coalesce(nullif(btrim(p_payload->>'endereco'), ''), 'Endereço a cadastrar canteiro'),
    (p_payload->>'data_inicio')::date,
    (p_payload->>'data_fim')::date,
    'Planejamento'
  )
  returning * into v_projeto;

  for v_etapa in select * from jsonb_array_elements(coalesce(p_payload->'etapas', '[]'::jsonb))
  loop
    v_etapa_id := gen_random_uuid();
    v_ref := v_etapa->>'ref';
    insert into public.etapas_cronograma (id, projeto_id, nome, data_inicio, data_fim, responsavel_id)
    values (
      v_etapa_id,
      v_projeto_id,
      coalesce(nullif(btrim(v_etapa->>'nome'), ''), 'Etapa'),
      nullif(v_etapa->>'data_inicio', '')::date,
      nullif(v_etapa->>'data_fim', '')::date,
      nullif(v_etapa->>'responsavel_id', '')::uuid
    );
    if v_ref is not null then
      v_etapa_map := jsonb_set(v_etapa_map, array[v_ref], to_jsonb(v_etapa_id::text));
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb))
  loop
    v_item_id := gen_random_uuid();
    insert into public.itens_orcamento (
      id, projeto_id, categoria, descricao, valor_orcado, valor_contratado, fornecedor_id, catalogo_insumo_id
    ) values (
      v_item_id,
      v_projeto_id,
      v_item->>'categoria',
      coalesce(nullif(btrim(v_item->>'descricao'), ''), v_item->>'categoria'),
      coalesce((v_item->>'valor_orcado')::numeric, 0),
      coalesce((v_item->>'valor_contratado')::numeric, 0),
      nullif(v_item->>'fornecedor_id', '')::uuid,
      nullif(v_item->>'catalogo_insumo_id', '')::uuid
    );

    v_target_ref := v_item->>'etapa_ref';
    v_etapa_alvo := null;
    if v_target_ref is not null and v_etapa_map ? v_target_ref then
      v_etapa_alvo := (v_etapa_map->>v_target_ref)::uuid;
      insert into public.etapa_orcamento_vinculo (id, etapa_id, item_orcamento_id, peso_percentual)
      values (gen_random_uuid(), v_etapa_alvo, v_item_id, 100);
    end if;

    -- Procedência do catálogo: preserva o quantitativo e o ajuste negociado.
    v_insumo_id := nullif(v_item->>'catalogo_insumo_id', '')::uuid;
    if v_insumo_id is not null and coalesce((v_item->>'quantidade')::numeric, 0) > 0 then
      insert into public.insumos_projeto (
        projeto_id, catalogo_insumo_id, item_orcamento_id, quantidade,
        preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
        fornecedor_id, etapa_vinculada_id, status
      ) values (
        v_projeto_id,
        v_insumo_id,
        v_item_id,
        (v_item->>'quantidade')::numeric,
        coalesce((v_item->>'preco_unitario_base')::numeric, 0),
        coalesce(nullif(v_item->>'ajuste_tipo', ''), 'Nenhum'),
        coalesce((v_item->>'ajuste_valor')::numeric, 0),
        nullif(btrim(v_item->>'ajuste_motivo'), ''),
        nullif(v_item->>'fornecedor_id', '')::uuid,
        v_etapa_alvo,
        'Orçado'
      );
    end if;
  end loop;

  return v_projeto;
end;
$$;

revoke execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) from anon;
revoke execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) from public;
grant  execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) to authenticated;
