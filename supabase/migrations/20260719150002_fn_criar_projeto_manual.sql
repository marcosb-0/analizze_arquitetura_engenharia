-- Atomic manual project creation ("Iniciar Obra" wizard).
--
-- Replaces the client-side sequence in App.tsx (1 projeto insert followed by a
-- fire-and-forget `defaultStages.forEach(handleAddEtapa)` = 5 more un-awaited
-- round trips with no rollback) with a single transactional RPC — mirroring
-- fn_criar_projeto_padrao, but driven by the values the user typed in the wizard
-- instead of a proposta.
--
-- Unlike the proposta conversion, this flow creates NO budget items and NO
-- etapa_orcamento_vinculo (matches prior manual behavior — the user links budget
-- lines to stages later in the console). The 5 default stages are staggered
-- proportionally across [p_data_inicio, p_data_fim] instead of all collapsing
-- onto the same day, and every stage is led by the single responsável the user
-- picked in the wizard (no more fake per-stage role strings).
create or replace function public.fn_criar_projeto_manual(
  p_nome          text,
  p_cliente_id    uuid,
  p_data_inicio   date,
  p_data_fim      date,
  p_responsavel_id uuid  default null,
  p_proposta_id   uuid   default null,
  p_endereco      text   default null
)
returns public.projetos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projeto_id uuid := gen_random_uuid();
  v_projeto    public.projetos;
  v_total      int;
  v_d1 date; v_d2 date; v_d3 date; v_d4 date;
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem criar projetos.';
  end if;

  if p_nome is null or length(btrim(p_nome)) = 0 then
    raise exception 'O nome do projeto é obrigatório.';
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'As datas de início e de entrega são obrigatórias.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'A data de entrega não pode ser anterior à data de início.';
  end if;

  insert into public.projetos (
    id, nome, cliente_id, proposta_id, responsavel_interno_id, endereco_obra, data_inicio, data_fim, situacao
  ) values (
    v_projeto_id, p_nome, p_cliente_id, p_proposta_id, p_responsavel_id,
    coalesce(nullif(btrim(p_endereco), ''), 'Endereço a cadastrar canteiro'),
    p_data_inicio, p_data_fim, 'Planejamento'
  )
  returning * into v_projeto;

  -- Cumulative stage boundaries: 15% / 30% / 25% / 20% / 10% of the span.
  v_total := p_data_fim - p_data_inicio;
  v_d1 := p_data_inicio + floor(v_total * 0.15)::int;
  v_d2 := p_data_inicio + floor(v_total * 0.45)::int;
  v_d3 := p_data_inicio + floor(v_total * 0.70)::int;
  v_d4 := p_data_inicio + floor(v_total * 0.90)::int;

  insert into public.etapas_cronograma (id, projeto_id, nome, data_inicio, data_fim, responsavel_id)
  values
    (gen_random_uuid(), v_projeto_id, 'Fundação / Terraplanagem', p_data_inicio, v_d1, p_responsavel_id),
    (gen_random_uuid(), v_projeto_id, 'Estrutura / Alvenaria',    v_d1,          v_d2, p_responsavel_id),
    (gen_random_uuid(), v_projeto_id, 'Instalações',              v_d2,          v_d3, p_responsavel_id),
    (gen_random_uuid(), v_projeto_id, 'Acabamentos',              v_d3,          v_d4, p_responsavel_id),
    (gen_random_uuid(), v_projeto_id, 'Entrega',                  v_d4,          p_data_fim, p_responsavel_id);

  return v_projeto;
end;
$$;

revoke execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) from anon;
revoke execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) from public;
grant execute on function public.fn_criar_projeto_manual(text, uuid, date, date, uuid, uuid, text) to authenticated;
