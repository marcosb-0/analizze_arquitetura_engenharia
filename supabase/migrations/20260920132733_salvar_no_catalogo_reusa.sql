-- "Salvar no catálogo" para de fabricar duplicata.
--
-- Esta função era a principal porta de entrada de item repetido no catálogo, e
-- de um jeito que ninguém via: ela fazia INSERT INCONDICIONAL do item de topo e
-- de todo componente cujo `catalogo_insumo_id` fosse nulo. Salvar o mesmo item
-- de proposta duas vezes criava dois insumos idênticos; duas propostas que
-- digitaram "Cimento CP-II 50kg" criavam dois. O reuso existia, mas só por FK
-- já preenchida — ou seja, só quando o usuário tinha escolhido o insumo de uma
-- lista, que é justamente o caso em que a duplicata não aconteceria.
--
-- Agora o reuso é por IDENTIDADE: `(fn_chave_insumo(descricao), unidade)`, a
-- mesma chave do índice único criado em `catalogo_identidade`. Sem isto, aquele
-- índice não resolveria o problema — só trocaria a duplicata silenciosa por um
-- erro na cara do usuário no meio de uma proposta.
--
-- TRÊS DECISÕES que valem para o item de topo e para os componentes:
--
-- 1. Reusar NÃO sobrescreve o preço do catálogo. O preço do catálogo é o padrão
--    da empresa; o da proposta é o daquela negociação. A divergência é
--    RELATADA (`precos_divergentes`), como já era para os componentes — agora o
--    item de topo entra no mesmo relatório, que antes não o cobria.
-- 2. O item de topo entra como `tipo_item = 'Insumo'`. Quem o promove a
--    composição é `trg_promove_composicao`, no primeiro componente. Declarar o
--    tipo aqui seria a segunda fonte de verdade que `composicao_promove`
--    acabou de eliminar.
-- 3. Componente que já está no catálogo e NÃO está nesta proposta não é
--    apagado. Reusar por nome pode alcançar uma composição montada por outra
--    pessoa, e "salvar" não deveria destruir o trabalho dela em silêncio. O que
--    sobra é RELATADO em `componentes_extra`, e a tela decide o que dizer.

create or replace function public.proposta_item_salvar_no_catalogo(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item       record;
  v_id         uuid;
  v_comp       record;
  v_filho_id   uuid;
  v_categoria  text;
  v_topo_novo  boolean := false;
  v_criados    int := 0;
  v_reusados   int := 0;
  v_divergem   jsonb := '[]'::jsonb;
  v_extra      jsonb := '[]'::jsonb;
  v_custo_prop numeric(14,2);
  v_custo_cat  numeric(14,2);
  v_preco_cat  numeric(14,2);
begin
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem escrever no catálogo.';
  end if;

  select * into v_item from public.itens_proposta where id = p_item_id;
  if not found then
    raise exception 'Item de proposta não encontrado.';
  end if;

  -- O custo desta proposta, antes de qualquer coisa: é ele que o usuário vê na
  -- tela e espera reencontrar.
  select round(sum(coeficiente * preco_unitario), 2) into v_custo_prop
    from public.itens_proposta_composicao where item_proposta_id = p_item_id;

  v_categoria := case v_item.categoria
    when 'Materiais'     then 'Material'
    when 'Mão de Obra'   then 'Mão de Obra'
    when 'Equipamentos'  then 'Equipamento'
    when 'Terceiros'     then 'Serviço'
    when 'Administração' then 'Taxa'
    else 'Material'
  end;

  -- ---------------------------------------------------------------------
  -- O item de topo: procurar antes de criar
  -- ---------------------------------------------------------------------
  select ca.id, ca.preco_referencia into v_id, v_preco_cat
    from public.catalogo_insumos ca
   where public.fn_chave_insumo(ca.descricao) = public.fn_chave_insumo(v_item.descricao)
     and ca.unidade = v_item.unidade;

  if v_id is null then
    insert into public.catalogo_insumos (
      descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
    ) values (
      v_item.descricao, v_item.unidade, v_item.preco_unitario_base,
      v_categoria, 'Insumo', 'Manual'
    )
    returning id into v_id;
    v_topo_novo := true;

    -- `.select()`/`returning` vazio é como uma escrita recusada pela RLS se
    -- apresenta: sucesso com zero linhas. Sem esta checagem a função seguiria
    -- montando a composição de um id nulo.
    if v_id is null then
      raise exception 'Nenhuma linha foi criada — sem permissão para escrever no catálogo.';
    end if;
  elsif v_preco_cat is distinct from v_item.preco_unitario_base then
    v_divergem := v_divergem || jsonb_build_object(
      'descricao',      v_item.descricao,
      'preco_proposta', v_item.preco_unitario_base,
      'preco_catalogo', v_preco_cat
    );
  end if;

  -- ---------------------------------------------------------------------
  -- Os componentes
  -- ---------------------------------------------------------------------
  for v_comp in
    select * from public.itens_proposta_composicao
     where item_proposta_id = p_item_id
     order by ordem
  loop
    v_filho_id  := v_comp.catalogo_insumo_id;
    v_preco_cat := null;

    -- A FK explícita continua tendo precedência: se o usuário escolheu o insumo
    -- de uma lista, é aquele, mesmo que exista homônimo.
    if v_filho_id is null then
      select ca.id, ca.preco_referencia into v_filho_id, v_preco_cat
        from public.catalogo_insumos ca
       where public.fn_chave_insumo(ca.descricao) = public.fn_chave_insumo(v_comp.descricao)
         and ca.unidade = v_comp.unidade;
    else
      select ca.preco_referencia into v_preco_cat
        from public.catalogo_insumos ca where ca.id = v_filho_id;
    end if;

    if v_filho_id is null then
      -- Insumo novo de verdade: nasce com o preço DA PROPOSTA, porque não há
      -- padrão anterior para preservar. Aqui os dois números coincidem.
      insert into public.catalogo_insumos (
        descricao, unidade, preco_referencia, categoria, tipo_item, preco_fonte
      ) values (
        v_comp.descricao, v_comp.unidade, v_comp.preco_unitario,
        v_comp.categoria, 'Insumo', 'Manual'
      )
      returning id into v_filho_id;
      v_criados := v_criados + 1;
    else
      v_reusados := v_reusados + 1;
      if v_preco_cat is distinct from v_comp.preco_unitario then
        v_divergem := v_divergem || jsonb_build_object(
          'descricao',      v_comp.descricao,
          'preco_proposta', v_comp.preco_unitario,
          'preco_catalogo', v_preco_cat
        );
      end if;
    end if;

    insert into public.composicao_itens (composicao_id, insumo_id, coeficiente)
    values (v_id, v_filho_id, v_comp.coeficiente)
    on conflict (composicao_id, insumo_id) do update
       set coeficiente = excluded.coeficiente;
  end loop;

  -- ---------------------------------------------------------------------
  -- O que já estava na composição do catálogo e não veio desta proposta
  -- ---------------------------------------------------------------------
  -- Relatado, nunca apagado — ver a decisão 3 no cabeçalho.
  select coalesce(jsonb_agg(jsonb_build_object(
           'descricao',   ca.descricao,
           'codigo',      ca.codigo,
           'coeficiente', ci.coeficiente
         )), '[]'::jsonb)
    into v_extra
    from public.composicao_itens ci
    join public.catalogo_insumos ca on ca.id = ci.insumo_id
   where ci.composicao_id = v_id
     and not exists (
       select 1 from public.itens_proposta_composicao ipc
        where ipc.item_proposta_id = p_item_id
          and public.fn_chave_insumo(ipc.descricao) = public.fn_chave_insumo(ca.descricao)
          and ipc.unidade = ca.unidade
     );

  update public.itens_proposta
     set catalogo_insumo_id = v_id
   where id = p_item_id;

  select ca.preco_referencia into v_custo_cat
    from public.catalogo_insumos ca where ca.id = v_id;

  return jsonb_build_object(
    'catalogo_insumo_id', v_id,
    'item_criado',        v_topo_novo,
    'componentes',        v_criados + v_reusados,
    'itens_criados',      v_criados,
    'itens_reusados',     v_reusados,
    'custo_proposta',     v_custo_prop,
    'custo_catalogo',     v_custo_cat,
    'precos_divergentes', v_divergem,
    'componentes_extra',  v_extra
  );
end;
$function$;
