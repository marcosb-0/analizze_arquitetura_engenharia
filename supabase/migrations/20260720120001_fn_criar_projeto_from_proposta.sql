-- Fase 2: conversão Proposta -> Obra guiada por um wizard.
--
-- Substitui a distribuição fixa de fn_criar_projeto_padrao (6 itens por
-- percentuais hardcoded + 5 etapas com datas fixas + 7 vínculos fixos) por uma
-- conversão dirigida pelo que o usuário revisou/editou no wizard, entregue como
-- um único payload jsonb. Tudo numa transação: se qualquer linha falhar
-- (categoria inválida, data incoerente, etc.), nada é gravado.
--
-- Modelo de vínculo: cada item de orçamento aponta (opcionalmente) para UMA
-- etapa via `etapa_ref`, e é vinculado a ela com peso 100% — respeita a
-- constraint peso_percentual <= 100 e o unique(etapa_id, item_orcamento_id).
-- Itens sem `etapa_ref` ficam sem vínculo (não avançam por medição).
--
-- fn_criar_projeto_padrao é mantida como opção de "conversão rápida".
--
-- Formato esperado de p_payload:
-- {
--   "nome": "text", "endereco": "text|null",
--   "data_inicio": "YYYY-MM-DD", "data_fim": "YYYY-MM-DD",
--   "responsavel_id": "uuid|null",
--   "etapas": [ { "ref": 0, "nome": "text", "data_inicio": "...", "data_fim": "...", "responsavel_id": "uuid|null" } ],
--   "itens":  [ { "categoria": "Materiais", "descricao": "text", "valor_orcado": 0, "valor_contratado": 0, "etapa_ref": 0|null } ]
-- }
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
begin
  -- Null-safe role guard: fn_current_role() é NULL para anon/sem-perfil, e um
  -- bare `NOT IN` com NULL não é TRUE — daí o coalesce (ver histórico do repo).
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

  -- Etapas: cria cada uma e guarda ref -> uuid gerado para vincular os itens.
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

  -- Itens: cria cada um e, se apontar para uma etapa, vincula a 100%.
  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb))
  loop
    v_item_id := gen_random_uuid();
    insert into public.itens_orcamento (id, projeto_id, categoria, descricao, valor_orcado, valor_contratado)
    values (
      v_item_id,
      v_projeto_id,
      v_item->>'categoria',
      coalesce(nullif(btrim(v_item->>'descricao'), ''), v_item->>'categoria'),
      coalesce((v_item->>'valor_orcado')::numeric, 0),
      coalesce((v_item->>'valor_contratado')::numeric, (v_item->>'valor_orcado')::numeric, 0)
    );

    v_target_ref := v_item->>'etapa_ref';
    if v_target_ref is not null and v_etapa_map ? v_target_ref then
      insert into public.etapa_orcamento_vinculo (id, etapa_id, item_orcamento_id, peso_percentual)
      values (gen_random_uuid(), (v_etapa_map->>v_target_ref)::uuid, v_item_id, 100);
    end if;
  end loop;

  return v_projeto;
end;
$$;

revoke execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) from anon;
revoke execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) from public;
grant  execute on function public.fn_criar_projeto_from_proposta(uuid, jsonb) to authenticated;
