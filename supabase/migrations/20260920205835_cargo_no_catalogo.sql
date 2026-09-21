-- ============================================================
-- O CARGO NASCE DA FICHA — catálogo como consequência
-- ============================================================
-- Para orçar pela folha, o colaborador precisa estar vinculado a um insumo de
-- mão de obra do catálogo. Só que o único caminho para criar esse insumo era a
-- aba Catálogo, e a ficha escondia o seletor por completo quando não havia
-- nenhum (para não mostrar caixa vazia). O resultado era um beco sem saída:
-- quem abria a ficha de um pedreiro não tinha como declarar que ele é pedreiro.
--
-- Este RPC inverte a ordem: a ficha diz "é mão de obra direta", e o cargo no
-- catálogo passa a ser CONSEQUÊNCIA disso — o mesmo princípio que
-- 20260920132553 aplicou à composição, que virou consequência do primeiro
-- componente em vez de uma declaração à parte.
--
-- ------------------------------------------------------------
-- ACHAR ANTES DE CRIAR, pelo mesmo critério de identidade do catálogo
-- ------------------------------------------------------------
-- Dois pedreiros na folha são DOIS colaboradores e UM cargo. Se cada ficha
-- criasse o seu, o catálogo encheria de gêmeos e `fn_custo_hora_folha` — que
-- devolve o MAIOR custo/hora entre os vinculados ao mesmo insumo — perderia o
-- sentido: cada pedreiro orçaria por si, e a regra de "orçar pelo pior caso"
-- deixaria de valer sem ninguém perceber.
--
-- A busca usa `fn_chave_insumo(descricao)` + unidade, que é exatamente a chave
-- do índice único do catálogo (20260920132353). Então "pedreiro", "Pedreiro" e
-- "PEDREIRO " encontram a mesma linha, e é impossível o insert cair na unique
-- depois de a busca não ter achado nada.
--
-- ------------------------------------------------------------
-- O QUE ELE RECUSA, e por que recusar é melhor que contornar
-- ------------------------------------------------------------
-- Nome já usado em OUTRA categoria, ou usado por uma COMPOSIÇÃO de equipe. Nos
-- dois casos dava para inventar uma saída (sufixar o nome, criar mesmo assim), e
-- nos dois a saída produziria um catálogo que mente. `trg_funcionario_mao_de_obra_guard`
-- recusaria o vínculo com a composição logo em seguida de qualquer jeito — mas
-- com uma mensagem sobre vínculo, e não sobre o nome, que é o que a pessoa
-- acabou de digitar.

create or replace function public.funcionario_cargo_no_catalogo(p_cargo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome       text;
  v_id         uuid;
  v_categoria  text;
  v_ativo      boolean;
  v_tem_comp   boolean;
begin
  -- Mesma matriz de escrita do catálogo. `coalesce` porque `fn_current_role()`
  -- devolve NULL para sessão sem profile, e aí o `not in` não dispararia.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'gestao') then
    raise exception 'Apenas administradores ou gestão podem criar cargo no catálogo.';
  end if;

  v_nome := btrim(coalesce(p_cargo, ''));
  if v_nome = '' then
    raise exception 'Informe o cargo do colaborador antes de marcá-lo como mão de obra direta.';
  end if;

  select id, categoria, ativo
    into v_id, v_categoria, v_ativo
    from public.catalogo_insumos
   where public.fn_chave_insumo(descricao) = public.fn_chave_insumo(v_nome)
     and unidade = 'h'
   limit 1;

  if v_id is not null then
    if v_categoria <> 'Mão de Obra' then
      raise exception
        'Já existe "%" em hora no catálogo, na categoria %. Ajuste o nome do cargo, ou o insumo existente.',
        v_nome, v_categoria;
    end if;

    select exists (select 1 from public.composicao_itens where composicao_id = v_id)
      into v_tem_comp;
    if v_tem_comp then
      raise exception
        '"%" é uma composição de equipe no catálogo, não um cargo. Vincule o colaborador a um cargo simples.',
        v_nome;
    end if;

    -- Recontratar alguém num cargo arquivado reabre o cargo. O contrário —
    -- deixar inativo e vincular — daria um insumo que some da lista logo depois
    -- de a ficha afirmar que o usa.
    if not v_ativo then
      update public.catalogo_insumos set ativo = true where id = v_id;
    end if;

    return v_id;
  end if;

  -- Nasce a R$ 0,00 e o preço vem da folha: assim que a ficha tiver salário,
  -- `fn_preco_vigente` devolve nível 1, fonte 'Folha', e o zero nunca é lido.
  -- Sem salário, o catálogo mostra R$ 0,00 rotulado 'Estimado' — que é feio, e
  -- é para ser: um cargo sem custo conhecido não deve parecer resolvido.
  insert into public.catalogo_insumos (descricao, unidade, categoria, preco_referencia, preco_fonte)
  values (v_nome, 'h', 'Mão de Obra', 0, 'Manual')
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.funcionario_cargo_no_catalogo(text) is
  'Acha-ou-cria o cargo de mão de obra (unidade h) para uma ficha de colaborador, reusando pelo mesmo critério de identidade do catálogo. Dois colaboradores no mesmo cargo compartilham UM insumo — é o que mantém a regra do maior custo/hora de fn_custo_hora_folha.';

revoke execute on function public.funcionario_cargo_no_catalogo(text) from anon, public;
grant execute on function public.funcionario_cargo_no_catalogo(text) to authenticated;
