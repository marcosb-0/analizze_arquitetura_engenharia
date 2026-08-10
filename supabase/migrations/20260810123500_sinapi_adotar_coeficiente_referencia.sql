-- ============================================================
-- Adoção do SINAPI passa a congelar o índice publicado
-- ============================================================
-- `composicao_itens.coeficiente_referencia` (20260810123000) só tem valor se
-- alguém a preencher no momento em que o número entra. Este é o momento: a
-- adoção é o único caminho pelo qual um coeficiente do SINAPI chega ao
-- catálogo.
--
-- No `on conflict do update` a referência é reescrita junto. Readotar é dizer
-- "traga o que o SINAPI publica agora"; manter a referência antiga faria a
-- tela acusar um ajuste de produtividade que ninguém fez — pior que não ter
-- referência nenhuma, porque parece informação.
--
-- Corpo idêntico a 20260730110000 fora as três linhas do insert.

create or replace function public.sinapi_adotar(
  p_codigo     integer,
  p_modo       text    default 'item',
  p_publicacao integer default null,
  p_uf         char(2) default 'MG',
  p_regime     char(2) default 'SD'
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, referencia, pg_temp
as $$
declare
  v_pub          integer;
  v_mes          text;
  v_deson        boolean;
  v_ref          record;
  v_filho        record;
  v_id           uuid;
  v_filho_id     uuid;
  v_ja_existia   boolean;
  v_adotados     integer := 0;
  v_reusados     integer := 0;
  v_ignorados    jsonb   := '[]'::jsonb;
  v_custo_sinapi numeric;
  v_custo_app    numeric;
begin
  if p_modo not in ('item', 'expandido') then
    raise exception 'Modo de adoção inválido: % (use ''item'' ou ''expandido'').', p_modo;
  end if;

  if p_regime not in ('SD', 'CD') then
    raise exception
      'Regime % não pode ser adotado. O catálogo guarda desoneração como '
      'booleano e não representa "sem encargos sociais".', p_regime;
  end if;
  v_deson := (p_regime = 'CD');

  select coalesce(p_publicacao,
                  (select max(id) from referencia.publicacao where concluida_em is not null))
    into v_pub;
  if v_pub is null then
    raise exception 'Nenhuma publicação do SINAPI foi importada.';
  end if;

  select to_char(mes_referencia, 'YYYY-MM') into v_mes
    from referencia.publicacao where id = v_pub;
  if v_mes is null then
    raise exception 'Publicação % não existe.', v_pub;
  end if;

  select * into v_ref from referencia.item where codigo = p_codigo;
  if not found then
    raise exception 'Item % não existe na base SINAPI.', p_codigo;
  end if;

  if p_modo = 'expandido' then
    if v_ref.tipo <> 'COMPOSICAO' then
      raise exception 'O item % é um insumo e não tem componentes para expandir.', p_codigo;
    end if;
    if not exists (select 1 from referencia.composicao_item
                    where composicao = p_codigo and publicacao_id = v_pub) then
      raise exception 'A composição % não tem componentes nesta publicação.', p_codigo;
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. O item principal
  -- ---------------------------------------------------------------------
  select ca.id into v_id
    from public.catalogo_insumos ca
   where ca.codigo_sinapi = p_codigo::text
     and coalesce(ca.uf, '') = p_uf
     and coalesce(ca.mes_referencia, '') = v_mes
     and coalesce(ca.desonerado, false) = v_deson;
  v_ja_existia := v_id is not null;

  if not v_ja_existia then
    insert into public.catalogo_insumos (
      codigo_sinapi, descricao, unidade, preco_referencia, categoria, tipo,
      aplicacao, uf, mes_referencia, desonerado, tipo_item, preco_fonte
    )
    select p_codigo::text,
           v_ref.descricao,
           -- `unidade` é NOT NULL no catálogo; item do Analítico pode não ter.
           coalesce(v_ref.unidade, 'UN'),
           coalesce(round(pr.centavos / 100.0, 2), 0),
           public.fn_sinapi_categoria(v_ref.tipo, v_ref.grupo),
           'SINAPI',
           -- O "Grupo" do SINAPI entra em `aplicacao` porque entra na coluna
           -- `busca` do catálogo: procurar "alvenaria" acha o serviço.
           v_ref.grupo,
           p_uf, v_mes, v_deson,
           case v_ref.tipo when 'COMPOSICAO' then 'Composicao' else 'Insumo' end,
           -- Sem preço publicado o valor nasce zero, e chamar isso de 'SINAPI'
           -- seria afirmar um preço que o SINAPI não deu.
           case when pr.centavos is null then 'Manual' else 'SINAPI' end
      from (select 1) _
      left join referencia.preco pr
             on pr.codigo = p_codigo
            and pr.publicacao_id = v_pub
            and pr.uf = p_uf
            and pr.regime = p_regime
    returning id into v_id;

    if v_id is null then
      raise exception 'Nenhuma linha foi criada — sem permissão para escrever no catálogo.';
    end if;
    v_adotados := 1;
  else
    v_reusados := 1;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. Os componentes diretos
  -- ---------------------------------------------------------------------
  if p_modo = 'expandido' then
    for v_filho in
      select ci.item,
             ci.coeficiente,
             i.tipo, i.descricao, i.unidade, i.grupo,
             pr.centavos
        from referencia.composicao_item ci
        join referencia.item i on i.codigo = ci.item
        left join referencia.preco pr
               on pr.codigo = ci.item
              and pr.publicacao_id = v_pub
              and pr.uf = p_uf
              and pr.regime = p_regime
       where ci.composicao = p_codigo
         and ci.publicacao_id = v_pub
       order by i.descricao
    loop
      -- `composicao_itens` exige coeficiente > 0. A planilha tem 4 zeros
      -- (insumo 436 nas composições 106514–106517); componente que não entra na
      -- conta não vira linha, mas é REPORTADO para a tela poder avisar.
      if v_filho.coeficiente <= 0 then
        v_ignorados := v_ignorados || jsonb_build_object(
          'codigo', v_filho.item,
          'descricao', v_filho.descricao,
          'motivo', 'coeficiente zero'
        );
        continue;
      end if;

      select ca.id into v_filho_id
        from public.catalogo_insumos ca
       where ca.codigo_sinapi = v_filho.item::text
         and coalesce(ca.uf, '') = p_uf
         and coalesce(ca.mes_referencia, '') = v_mes
         and coalesce(ca.desonerado, false) = v_deson;

      if v_filho_id is null then
        insert into public.catalogo_insumos (
          codigo_sinapi, descricao, unidade, preco_referencia, categoria, tipo,
          aplicacao, uf, mes_referencia, desonerado, tipo_item, preco_fonte
        ) values (
          v_filho.item::text,
          v_filho.descricao,
          coalesce(v_filho.unidade, 'UN'),
          coalesce(round(v_filho.centavos / 100.0, 2), 0),
          public.fn_sinapi_categoria(v_filho.tipo, v_filho.grupo),
          'SINAPI',
          v_filho.grupo,
          p_uf, v_mes, v_deson,
          case v_filho.tipo when 'COMPOSICAO' then 'Composicao' else 'Insumo' end,
          case when v_filho.centavos is null then 'Manual' else 'SINAPI' end
        )
        returning id into v_filho_id;
        v_adotados := v_adotados + 1;
      else
        v_reusados := v_reusados + 1;
      end if;

      if v_filho.centavos is null then
        v_ignorados := v_ignorados || jsonb_build_object(
          'codigo', v_filho.item,
          'descricao', v_filho.descricao,
          'motivo', 'sem preço publicado em ' || p_uf
        );
      end if;

      insert into public.composicao_itens (composicao_id, insumo_id, coeficiente, coeficiente_referencia)
      values (v_id, v_filho_id, v_filho.coeficiente, v_filho.coeficiente)
      on conflict (composicao_id, insumo_id) do update
         set coeficiente = excluded.coeficiente,
             coeficiente_referencia = excluded.coeficiente_referencia;
    end loop;
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Os dois números, para a tela poder comparar
  -- ---------------------------------------------------------------------
  select round(pr.centavos / 100.0, 2) into v_custo_sinapi
    from referencia.preco pr
   where pr.codigo = p_codigo and pr.publicacao_id = v_pub
     and pr.uf = p_uf and pr.regime = p_regime;

  select ca.preco_referencia into v_custo_app
    from public.catalogo_insumos ca where ca.id = v_id;

  return jsonb_build_object(
    'insumo_id',      v_id,
    'codigo',         p_codigo,
    'descricao',      v_ref.descricao,
    'modo',           p_modo,
    'ja_existia',     v_ja_existia,
    'itens_criados',  v_adotados,
    'itens_reusados', v_reusados,
    'ignorados',      v_ignorados,
    'custo_sinapi',   v_custo_sinapi,
    'custo_catalogo', v_custo_app,
    'diferenca',      case when v_custo_sinapi is null then null
                           else v_custo_app - v_custo_sinapi end
  );
end;
$$;
