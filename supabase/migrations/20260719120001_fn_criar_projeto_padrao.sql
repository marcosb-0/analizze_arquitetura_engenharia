-- Stage 9: atomic proposta -> projeto conversion.
--
-- Replaces the client-side sequence in App.tsx (1 projeto insert + 6 itens_orcamento
-- + 5 etapas_cronograma + 7 etapa_orcamento_vinculo = 19 separate round trips) with
-- a single transactional RPC. If anything fails partway through, nothing is left
-- behind — the whole conversion either lands or it doesn't.
create or replace function public.fn_criar_projeto_padrao(p_proposta_id uuid)
returns public.projetos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposta      record;
  v_projeto_id    uuid := gen_random_uuid();
  v_responsavel   uuid;
  v_manager       uuid;
  v_mestre        uuid;
  v_valor         numeric;
  v_active_staff  uuid[];

  v_orc_materiais     uuid := gen_random_uuid();
  v_orc_mao_de_obra   uuid := gen_random_uuid();
  v_orc_equipamentos  uuid := gen_random_uuid();
  v_orc_terceiros     uuid := gen_random_uuid();
  v_orc_administracao uuid := gen_random_uuid();
  v_orc_contingencias uuid := gen_random_uuid();

  v_eta_fundacao     uuid := gen_random_uuid();
  v_eta_estrutura    uuid := gen_random_uuid();
  v_eta_instalacoes  uuid := gen_random_uuid();
  v_eta_acabamentos  uuid := gen_random_uuid();
  v_eta_entrega      uuid := gen_random_uuid();

  v_projeto public.projetos;
begin
  if public.fn_current_role() not in ('admin', 'gestao') then
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

  v_valor := v_proposta.valor_estimado;

  select array_agg(id order by nome) into v_active_staff from public.funcionarios where status = 'Ativo';
  if v_active_staff is null or array_length(v_active_staff, 1) = 0 then
    select array_agg(id order by nome) into v_active_staff from public.funcionarios;
  end if;
  v_responsavel := v_active_staff[1];
  v_manager := v_active_staff[1];
  v_mestre := coalesce(v_active_staff[2], v_active_staff[1]);

  insert into public.projetos (
    id, nome, cliente_id, proposta_id, responsavel_interno_id, endereco_obra, data_inicio, data_fim, situacao
  ) values (
    v_projeto_id, 'Obra: ' || v_proposta.descricao, v_proposta.cliente_id, p_proposta_id, v_responsavel,
    'Endereço a cadastrar canteiro', current_date, current_date + 180, 'Planejamento'
  )
  returning * into v_projeto;

  insert into public.itens_orcamento (id, projeto_id, categoria, descricao, valor_orcado, valor_contratado)
  values
    (v_orc_materiais,     v_projeto_id, 'Materiais',     'Insumos básicos de Alvenaria e Fechamento',      v_valor * 0.35, v_valor * 0.35),
    (v_orc_mao_de_obra,   v_projeto_id, 'Mão de Obra',   'Lançamento fundações e alvenarias estruturais',  v_valor * 0.30, v_valor * 0.30),
    (v_orc_equipamentos,  v_projeto_id, 'Equipamentos',  'Locações auxiliares e caçambas',                 v_valor * 0.10, v_valor * 0.10),
    (v_orc_terceiros,     v_projeto_id, 'Terceiros',     'Instalações complementares e Climatização',      v_valor * 0.15, v_valor * 0.15),
    (v_orc_administracao, v_projeto_id, 'Administração', 'Segurança NR18 e EPIs gerais',                   v_valor * 0.05, v_valor * 0.05),
    (v_orc_contingencias, v_projeto_id, 'Contingências', 'Fundo reserva',                                  v_valor * 0.05, 0);

  insert into public.etapas_cronograma (id, projeto_id, nome, data_inicio, data_fim, responsavel_id)
  values
    (v_eta_fundacao,    v_projeto_id, 'Fundação / Terraplanagem',    current_date,       current_date + 30,  v_mestre),
    (v_eta_estrutura,   v_projeto_id, 'Estrutura / Superestrutura',  current_date + 31,  current_date + 75,  v_mestre),
    (v_eta_instalacoes, v_projeto_id, 'Instalações Hidro/Elétricas', current_date + 76,  current_date + 115, coalesce(v_active_staff[4], v_mestre)),
    (v_eta_acabamentos, v_projeto_id, 'Acabamentos e Revestimentos', current_date + 116, current_date + 165, coalesce(v_active_staff[3], v_mestre)),
    (v_eta_entrega,     v_projeto_id, 'Entrega e Vistoria',          current_date + 166, current_date + 180, v_manager);

  insert into public.etapa_orcamento_vinculo (id, etapa_id, item_orcamento_id, peso_percentual)
  values
    (gen_random_uuid(), v_eta_fundacao,    v_orc_equipamentos,  100),
    (gen_random_uuid(), v_eta_estrutura,   v_orc_materiais,      60),
    (gen_random_uuid(), v_eta_estrutura,   v_orc_mao_de_obra,    40),
    (gen_random_uuid(), v_eta_instalacoes, v_orc_terceiros,     100),
    (gen_random_uuid(), v_eta_acabamentos, v_orc_materiais,      40),
    (gen_random_uuid(), v_eta_acabamentos, v_orc_mao_de_obra,    60),
    (gen_random_uuid(), v_eta_entrega,     v_orc_administracao, 100);

  return v_projeto;
end;
$$;

revoke all on function public.fn_criar_projeto_padrao(uuid) from public;
grant execute on function public.fn_criar_projeto_padrao(uuid) to authenticated;
