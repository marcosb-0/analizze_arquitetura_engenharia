-- A coluna `busca` passa a colapsar espaço, como a chave de unicidade já fazia.
--
-- ACHADO NO NAVEGADOR, não deduzido: com "Cimento CP-II 50kg" já cadastrado,
-- digitar "  CIMENTO   CP-II  50KG " no formulário NÃO acendia o aviso de item
-- parecido — e o cadastro só era recusado ao salvar, pelo índice único, com a
-- mensagem mais longe possível da causa.
--
-- O motivo eram duas normalizações diferentes para a mesma pergunta:
--
--   `fn_chave_insumo`  = minúsculas + sem acento + espaço COLAPSADO  → unicidade
--   `busca` (trigger)  = minúsculas + sem acento                     → pesquisa
--
-- O `ilike` do aviso levava os espaços extras do que foi digitado e não casava
-- com a `busca` armazenada, que tem espaço simples. Ou seja: a defesa contra o
-- gêmeo funcionava, e o aviso que deveria evitar o encontro com ela não.
--
-- As duas agora colapsam. O `update` no fim é um no-op de coluna que existe só
-- para fazer a trigger reescrever a `busca` de todas as linhas — sem ele, o que
-- já estava cadastrado continuaria com a forma antiga.
create or replace function public.fn_catalogo_insumo_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tem_componentes boolean;
begin
  new.busca := regexp_replace(
    btrim(public.fn_normaliza_busca(
      coalesce(new.codigo, '') || ' ' ||
      coalesce(new.descricao, '') || ' ' ||
      coalesce(new.aplicacao, '') || ' ' ||
      coalesce(new.composicao, '')
    )),
    '\s+', ' ', 'g'
  );
  select exists (
    select 1 from public.composicao_itens ci where ci.composicao_id = new.id
  ) into v_tem_componentes;
  if tg_op = 'UPDATE'
     and old.tipo_item = 'Composicao'
     and new.tipo_item <> 'Composicao'
     and v_tem_componentes then
    raise exception 'Esta composição tem componentes. Remova-os antes de convertê-la em insumo simples.';
  end if;
  if new.tipo_item = 'Composicao' and v_tem_componentes then
    new.preco_referencia := public.fn_custo_composicao(new.id);
    new.preco_fonte      := 'Composicao';
  end if;
  if tg_op = 'UPDATE'
     and new.preco_referencia is distinct from old.preco_referencia
     and new.data_atualizacao_preco = old.data_atualizacao_preco then
    new.data_atualizacao_preco := current_date;
  end if;
  return new;
end;
$function$;

-- Reescreve a `busca` do que já existe. `updated_at = updated_at` não muda
-- valor nenhum: é só o gesto que faz a trigger BEFORE UPDATE rodar em cada linha.
update public.catalogo_insumos set updated_at = updated_at;
