-- ============================================================
-- O VALOR DIGITADO DEIXA DE SER DESTRUÍDO PELOS ITENS
-- ============================================================
-- `propostas.valor_estimado` acumulava dois papéis incompatíveis: o número que
-- o usuário digitou ao criar a proposta E o total calculado a partir dos itens.
-- Assim que o primeiro item entrava, o valor digitado era sobrescrito. E
-- fn_sync_valor_proposta desistia quando a contagem de itens era zero:
--
--     if v_itens = 0 then
--       return;          -- valor_estimado fica congelado no último cálculo
--     end if;
--
-- Resultado: quem montava o orçamento e depois removia todos os itens ficava
-- com o total do orçamento desmontado, e o valor original não voltava de
-- lugar nenhum — não existia mais.
--
-- Agora são dois campos com donos distintos:
--   valor_manual   -> o número digitado. Só o usuário escreve.
--   valor_estimado -> derivado. Com itens, soma x BDI; sem itens, valor_manual.

-- ============================================================
-- 1. Coluna do valor digitado, retroalimentada com o que houver
-- ============================================================
alter table public.propostas
  add column if not exists valor_manual numeric(14,2);

-- Para propostas que já existem, o melhor palpite disponível é o valor vigente.
-- Nas que têm itens isso guarda o total calculado em vez do digitado original,
-- que já havia sido perdido antes desta migration — não há como recuperá-lo.
update public.propostas set valor_manual = valor_estimado where valor_manual is null;

alter table public.propostas
  alter column valor_manual set default 0,
  alter column valor_manual set not null;

comment on column public.propostas.valor_manual is
  'Valor digitado pelo usuário. Vale como valor_estimado enquanto a proposta não tiver itens.';
comment on column public.propostas.valor_estimado is
  'DERIVADO: com itens, soma dos itens x BDI; sem itens, espelha valor_manual. Não escrever direto.';

-- ============================================================
-- 2. Sem itens, o valor volta a ser o digitado
-- ============================================================
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
  v_manual numeric(14,2);
  v_total numeric(14,2);
begin
  if p_proposta_id is null then
    return;
  end if;

  select count(*), coalesce(sum(round(quantidade * preco_unitario, 2)), 0)
    into v_itens, v_soma
    from public.itens_proposta
   where proposta_id = p_proposta_id;

  select bdi_percentual, valor_manual
    into v_bdi, v_manual
    from public.propostas where id = p_proposta_id;

  if v_itens = 0 then
    -- Era aqui que a função desistia. Remover o último item agora devolve a
    -- proposta ao valor digitado em vez de deixar o total órfão.
    v_total := coalesce(v_manual, 0);
  else
    v_total := round(v_soma * (1 + coalesce(v_bdi, 0) / 100.0), 2);
  end if;

  update public.propostas
     set valor_estimado = v_total,
         updated_at     = now()
   where id = p_proposta_id
     and valor_estimado is distinct from v_total;
end;
$$;

revoke execute on function public.fn_sync_valor_proposta(uuid) from anon, authenticated, public;

-- ============================================================
-- 3. Mexer no valor digitado também ressincroniza
-- ============================================================
-- Substitui a versão de 20260723120002, que só observava o BDI. A recursão
-- para sozinha: fn_sync_valor_proposta escreve em valor_estimado, e nem o BDI
-- nem valor_manual mudam nessa escrita, então a segunda passagem não faz nada.
create or replace function public.fn_proposta_bdi_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bdi_percentual is distinct from old.bdi_percentual
     or new.valor_manual is distinct from old.valor_manual then
    perform public.fn_sync_valor_proposta(new.id);
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_proposta_bdi_sync() from anon, authenticated, public;

-- ============================================================
-- 4. No insert, o valor digitado é o valor da proposta
-- ============================================================
-- Itens não podem existir antes da proposta, então no insert valor_estimado é
-- sempre o digitado. O coalesce mantém compatibilidade com qualquer chamador
-- que ainda mande só valor_estimado (seeds, imports).
create or replace function public.fn_propostas_valor_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.valor_manual   := coalesce(nullif(new.valor_manual, 0), new.valor_estimado, 0);
  new.valor_estimado := new.valor_manual;
  return new;
end;
$$;

drop trigger if exists trg_propostas_valor_inicial on public.propostas;
create trigger trg_propostas_valor_inicial
  before insert on public.propostas
  for each row execute function public.fn_propostas_valor_inicial();

revoke execute on function public.fn_propostas_valor_inicial() from anon, authenticated, public;

-- ============================================================
-- 5. A revisão de proposta sem itens passa a mexer no valor digitado
-- ============================================================
-- Substitui a versão de 20260725120000. Única mudança: o update final agora
-- escreve em valor_manual, e valor_estimado vem por consequência do trigger —
-- em vez de escrever direto no campo derivado.
create or replace function public.fn_registrar_revisao_proposta(
  p_proposta_id uuid,
  p_alteracoes  text,
  p_valor       numeric default null,
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

  if v_qtd_itens = 0 and p_valor is not null then
    update public.propostas set valor_manual = p_valor where id = p_proposta_id;
  end if;

  return v_revisao_id;
end;
$$;

revoke execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) from anon, public;
grant  execute on function public.fn_registrar_revisao_proposta(uuid, text, numeric, date) to authenticated;
