-- ============================================================
-- SALVAR NO CATÁLOGO DECLARA O QUE NÃO LEVOU
-- ============================================================
-- Medido no app, logo depois de `sinapi_direto_na_proposta`: uma composição
-- ajustada para R$ 171,61 (pedreiro próprio a R$ 28,00 no lugar dos R$ 33,62 da
-- referência) foi salva no catálogo e o item de catálogo nasceu valendo
-- R$ 184,09 — o custo de ANTES do ajuste.
--
-- Não é erro de cálculo. O preço de um insumo no catálogo é GLOBAL, e a RPC
-- deliberadamente não o sobrescreve: uma proposta com desconto agressivo não
-- pode rebaixar em silêncio o preço padrão de todas as outras. O gatilho do
-- catálogo então recalcula a composição pelos preços DELE, e o número diverge.
--
-- O defeito é de HONESTIDADE: o usuário salva 171,61, o catálogo mostra 184,09
-- e nada explica a diferença. É o mesmo modo de falha que `sinapi_adotar` já
-- resolve para a diferença de centavos entre truncar e arredondar — e a saída é
-- a mesma: devolver os DOIS números e a lista de quem divergiu, para a tela
-- poder dizer em vez de o usuário descobrir na próxima proposta.
--
-- O comportamento de escrita NÃO muda. O que muda é o retorno da RPC, que ganha
-- `custo_proposta`, `custo_catalogo` e `precos_divergentes`.
create or replace function public.proposta_item_salvar_no_catalogo(
  p_item_id uuid,
  p_uf      char(2) default 'MG',
  p_regime  char(2) default 'SD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, referencia, pg_temp
as $fn$
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
  v_divergem   jsonb := '[]'::jsonb;
  v_custo_prop numeric(14,2);
  v_custo_cat  numeric(14,2);
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

  v_deson := (p_regime = 'CD');
  select to_char(mes_referencia, 'YYYY-MM') into v_mes
    from referencia.publicacao
   where concluida_em is not null
   order by id desc limit 1;

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
      -- Insumo novo: nasce com o preço DA PROPOSTA, porque não há padrão
      -- anterior para preservar. Aqui os dois números coincidem.
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
      -- O insumo já tinha padrão próprio. O preço DELE não é sobrescrito — mas
      -- a divergência é reportada, com os dois números, para a tela dizer o que
      -- ficou de fora.
      if exists (
        select 1 from public.catalogo_insumos ca
         where ca.id = v_filho_id
           and ca.preco_referencia is distinct from v_comp.preco_unitario
      ) then
        v_divergem := v_divergem || jsonb_build_object(
          'descricao',      v_comp.descricao,
          'preco_proposta', v_comp.preco_unitario,
          'preco_catalogo', (select ca.preco_referencia from public.catalogo_insumos ca where ca.id = v_filho_id)
        );
      end if;
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

  update public.itens_proposta
     set catalogo_insumo_id = v_id
   where id = p_item_id;

  -- O custo que o catálogo de fato ficou valendo, depois do gatilho dele.
  select ca.preco_referencia into v_custo_cat
    from public.catalogo_insumos ca where ca.id = v_id;

  return jsonb_build_object(
    'catalogo_insumo_id', v_id,
    'ja_existia',         v_ja_existia,
    'componentes',        v_criados + v_reusados,
    'itens_criados',      v_criados,
    'itens_reusados',     v_reusados,
    'custo_proposta',     v_custo_prop,
    'custo_catalogo',     v_custo_cat,
    'precos_divergentes', v_divergem
  );
end;
$fn$;

revoke execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) from anon;
revoke execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) from public;
grant  execute on function public.proposta_item_salvar_no_catalogo(uuid, char, char) to authenticated;
