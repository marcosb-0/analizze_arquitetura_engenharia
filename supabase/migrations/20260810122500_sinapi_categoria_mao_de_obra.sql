-- ============================================================
-- A mão de obra do SINAPI estava entrando no catálogo como "Serviço"
-- ============================================================
-- Descoberto ao testar a fonte de preço 'Folha' contra dado real: a única
-- composição povoada do catálogo (ALVENARIA) tem PEDREIRO 1,939 H e SERVENTE
-- 0,970 H, e os dois estão gravados com `categoria = 'Serviço'`. Qualquer
-- soma de HH filtrando por 'Mão de Obra' devolveria ZERO para uma composição
-- que é 40% mão de obra.
--
-- A causa está em `fn_sinapi_categoria`, cuja primeira linha é:
--
--     when p_tipo = 'COMPOSICAO' then 'Serviço'
--
-- Ela decide pelo TIPO antes de olhar o GRUPO, e no SINAPI a mão de obra que
-- as composições de serviço realmente consomem NÃO é o insumo de salário
-- puro — é a composição "<CARGO> COM ENCARGOS COMPLEMENTARES", que soma o
-- salário aos encargos e publica o custo-hora. Ela é `tipo = 'COMPOSICAO'`,
-- e por isso caía na primeira linha.
--
-- Conferido na base carregada (16.492 itens, 06/2026):
--
--   grupo 'Livro SINAPI: Cálculos e Parâmetros'  → 376 itens,
--     192 em H (horista) + 184 em MES (mensalista), TODOS cargos.
--     Nenhum outro tipo de item nesse grupo.
--
-- Ou seja, o grupo identifica mão de obra sem ambiguidade. O mesmo vale para
-- os dois grupos de equipamento, que também são `COMPOSICAO` e também estavam
-- virando 'Serviço' — e um deles tem 898 itens medidos em H, que sem esta
-- correção seriam contados como homem-hora.
--
-- A ordem das cláusulas passa a ser: grupos conhecidos primeiro, `COMPOSICAO`
-- como fallback. Grupo novo que o SINAPI publique continua caindo em
-- 'Serviço', que é o comportamento de hoje — sem regressão.

create or replace function public.fn_sinapi_categoria(p_tipo text, p_grupo text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    -- Mão de obra publicada como composição (cargo + encargos). É o que as
    -- composições de serviço consomem, e é de onde sai o HH.
    when p_grupo = 'Livro SINAPI: Cálculos e Parâmetros'  then 'Mão de Obra'
    -- Equipamento publicado como composição. O segundo grupo é medido em H
    -- (custo horário de operação) e seria lido como homem-hora se caísse em
    -- 'Serviço' — por isso precisa vir antes do fallback de COMPOSICAO.
    when p_grupo = 'Custos Horários Produtivo e Improdutivo dos Equipamentos'
      then 'Equipamento'
    when p_grupo = 'Depreciação, Juros, Impostos e Seguros, Manutenção e Materiais na Operação dos Equipamentos'
      then 'Equipamento'
    when p_tipo  = 'COMPOSICAO'                 then 'Serviço'
    when p_grupo = 'MATERIAL'                   then 'Material'
    when p_grupo = 'MAO DE OBRA'                then 'Mão de Obra'
    when p_grupo like 'EQUIPAMENTO%'            then 'Equipamento'
    when p_grupo = 'SERVIÇOS'                   then 'Serviço'
    when p_grupo = 'ENCARGOS COMPLEMENTARES'    then 'Taxa'
    else 'Material'
  end;
$$;

comment on function public.fn_sinapi_categoria(text, text) is
  'Categoria do catálogo a partir de tipo+grupo do SINAPI. O GRUPO decide antes do tipo: mão de obra e equipamento são publicados como COMPOSICAO e seriam lidos como Serviço, zerando o HH e a quebra de custo por categoria.';

-- ============================================================
-- Backfill dos itens já adotados
-- ============================================================
-- `sinapi_adotar` copia a categoria no momento da adoção, então corrigir a
-- função não conserta o que já está no catálogo. Reclassifica pelo grupo
-- publicado, e só o que veio do SINAPI: item próprio tem categoria escolhida
-- a mão e não deve ser tocado.
update public.catalogo_insumos c
   set categoria = public.fn_sinapi_categoria(i.tipo, i.grupo)
  from referencia.item i
 where c.codigo_sinapi is not null
   and c.tipo = 'SINAPI'
   and i.codigo = c.codigo_sinapi::integer
   and c.categoria is distinct from public.fn_sinapi_categoria(i.tipo, i.grupo);

-- ============================================================
-- O guard do vínculo com a Equipe precisava afrouxar junto
-- ============================================================
-- `fn_funcionario_mao_de_obra_guard` exigia `tipo_item = 'Insumo'`, com a
-- justificativa correta de que "equipe pronta não representa UMA pessoa".
-- Só que, com a correção acima, o insumo-hora individual do SINAPI é
-- `tipo_item = 'Composicao'` — PEDREIRO COM ENCARGOS COMPLEMENTARES é uma
-- composição de um cargo só. A regra antiga tornaria impossível vincular um
-- funcionário a qualquer cargo vindo do SINAPI.
--
-- O critério que separa "um cargo" de "uma equipe" não é o tipo_item: é ter
-- ou não componentes NO CATÁLOGO. Cargo adotado do SINAPI chega sem filhos
-- (é folha da árvore); equipe montada à mão tem filhos. A checagem passa a
-- ser essa, e a mensagem explica o que fazer.
create or replace function public.fn_funcionario_mao_de_obra_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_categoria text;
  v_tem_filhos boolean;
begin
  if new.catalogo_mao_de_obra_id is null then
    return new;
  end if;

  select categoria into v_categoria
    from public.catalogo_insumos
   where id = new.catalogo_mao_de_obra_id;

  if v_categoria is null then
    raise exception 'Insumo % não existe no catálogo.', new.catalogo_mao_de_obra_id;
  end if;

  if v_categoria <> 'Mão de Obra' then
    raise exception 'O insumo vinculado ao colaborador precisa ser da categoria "Mão de Obra" (recebido: %).', v_categoria;
  end if;

  select exists (
    select 1 from public.composicao_itens where composicao_id = new.catalogo_mao_de_obra_id
  ) into v_tem_filhos;

  -- Com filhos o item é uma equipe montada, não um cargo. Vincular uma pessoa
  -- a ela faria o custo-hora da folha substituir a soma da equipe inteira.
  if v_tem_filhos then
    raise exception 'Vincule o colaborador a um cargo (item sem componentes), não a uma composição de equipe.';
  end if;

  return new;
end;
$$;
