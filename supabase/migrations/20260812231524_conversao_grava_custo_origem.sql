-- ============================================================
-- A CONVERSÃO PASSA A GRAVAR O CUSTO (item A1, parte 2)
-- ============================================================
--
-- A migration anterior criou as colunas; esta faz a conversão preenchê-las. Sem
-- as duas juntas, `custo_origem` seria uma coluna sempre nula — o pior resultado
-- possível, porque a tela mostraria "margem indisponível" para sempre sem que
-- nada estivesse quebrado.
--
-- O que muda na função: quatro campos a mais lidos do payload e gravados em
-- `insumos_projeto`. **Nada do que já existia muda de valor.**
-- `preco_unitario_base` continua recebendo o preço de venda (com BDI), e
-- `preco_unitario` — que é GENERATED sobre base e ajuste — continua dando o
-- mesmo número, o que mantém `fn_sync_valor_item_orcamento` e todo o razão
-- exatamente como estavam.
--
-- A conta que passa a fechar, e que antes não tinha como ser feita:
--
--   (custo_origem ⊕ ajuste_origem) × (1 + bdi_aplicado/100) = preco_unitario
--
-- No item real que motivou a pressa (PROP-2026-001, contrapiso):
--
--   (39,60 + 6,00) × 1,35 = 61,56
--    custo   ajuste          venda
--
-- Antes, desses quatro números, a obra guardava só o último.

create or replace function public.fn_criar_projeto_from_proposta(p_proposta_id uuid, p_payload jsonb)
returns public.projetos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_proposta   record;
  v_projeto_id uuid := gen_random_uuid();
  v_projeto    public.projetos;
  v_etapa_map  jsonb := '{}'::jsonb;
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

    v_insumo_id := nullif(v_item->>'catalogo_insumo_id', '')::uuid;
    if v_insumo_id is not null and coalesce((v_item->>'quantidade')::numeric, 0) > 0 then
      insert into public.insumos_projeto (
        projeto_id, catalogo_insumo_id, item_orcamento_id, quantidade,
        preco_unitario_base, ajuste_tipo, ajuste_valor, ajuste_motivo,
        fornecedor_id, etapa_vinculada_id, status,
        -- Item A1: o custo e a negociação que produziram o preço de venda acima.
        -- Nulos quando o payload não os traz — uma conversão antiga, ou um item
        -- sem vínculo de catálogo. Nulo aqui significa "não sei", e a view de
        -- margem devolve nulo em vez de fingir que o custo foi zero.
        custo_origem, ajuste_origem_tipo, ajuste_origem_valor, bdi_aplicado
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
        'Orçado',
        (v_item->>'custo_origem')::numeric,
        nullif(v_item->>'ajuste_origem_tipo', ''),
        (v_item->>'ajuste_origem_valor')::numeric,
        (v_item->>'bdi_aplicado')::numeric
      );
    end if;
  end loop;

  return v_projeto;
end;
$function$;

comment on function public.fn_criar_projeto_from_proposta(uuid, jsonb) is
  'Converte proposta aprovada em obra, numa transação. Desde 20260812231524 leva também custo_origem, ajuste_origem_* e bdi_aplicado para insumos_projeto — antes o custo era descartado na conversão e a obra ficava sem o outro lado da margem (item A1).';
