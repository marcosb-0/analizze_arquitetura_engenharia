-- ============================================================
-- RESULTADO POR OBRA
-- ============================================================
-- A lacuna (docs/analise-financeiro.md §7.3): nada cruzava o que uma obra
-- faturou com o que ela gastou. Custo orçado/executado vivia em itens_orcamento
-- + medicao_item_orcamento; caixa realizado vivia em lancamentos_financeiros; e
-- nenhuma view ligava os dois. O app não respondia "esta obra deu lucro?" — a
-- pergunta central de uma ferramenta de construção.
--
-- ============================================================
-- Por que função SECURITY DEFINER e não view
-- ============================================================
-- Uma view com security_invoker (o padrão do repo desde 20260718190007) somaria
-- ZERO nas colunas de razão para `gestao`, que não tem policy em
-- lancamentos_financeiros — devolvendo silenciosamente um resultado onde toda
-- obra parece não ter faturado nada. Ver a nota em
-- 20260731140000_bloqueia_rejeicao_medicao_faturada sobre a mesma armadilha.
--
-- Em vez de abrir a view para um papel que não deve ler o razão, esta é uma
-- função SECURITY DEFINER com checagem de papel explícita — o mesmo desenho de
-- fn_gerar_lancamento_medicao. Quem não é admin/financeiro recebe erro, não
-- números pela metade.
--
-- ============================================================
-- O que NÃO é somado com o quê
-- ============================================================
-- `despesa_lancada` (saída real de dinheiro com projeto_id) e `valor_executado`
-- (valor de orçamento correspondente ao avanço medido) são duas medidas
-- DIFERENTES de custo. Somá-las contaria custo em dobro, e é por isso que elas
-- saem em colunas separadas e o resultado nunca mistura as duas:
--
--   resultado_competencia = receita_faturada  - despesa_lancada   (razão)
--   resultado_caixa       = receita_recebida  - despesa_paga      (razão, só pago)
--
-- Os dois resultados vêm só do razão — dinheiro contra dinheiro. `valor_orcado`
-- e `valor_executado` entram como CONTEXTO de execução, não como parcela do
-- resultado.
--
-- ============================================================
-- Cuidado registrado: BDI não chega ao razão
-- ============================================================
-- fn_gerar_lancamento_medicao gera a receita a partir de medicao_item_orcamento,
-- que deriva de itens_orcamento.valor_orcado. Quando o item tem insumos
-- vinculados, fn_sync_valor_item_orcamento mantém valor_orcado = Σ qtd × preço,
-- ou seja, CUSTO. Nessas obras a receita faturada nasce igual ao custo orçado do
-- avanço e a margem aparece como zero. O BDI da proposta não percorre esse
-- caminho. Por isso `proposta_valor` e `bdi_percentual` saem na função: sem eles
-- a tela mostraria margem zero sem dar ao usuário como perceber a causa.

create or replace function public.fn_resultado_obra()
returns table (
  projeto_id            uuid,
  projeto_nome          text,
  situacao              text,
  cliente_nome          text,
  proposta_valor        numeric,
  bdi_percentual        numeric,
  valor_orcado          numeric,
  valor_executado       numeric,
  receita_faturada      numeric,
  receita_recebida      numeric,
  despesa_lancada       numeric,
  despesa_paga          numeric,
  a_faturar             numeric,
  resultado_competencia numeric,
  resultado_caixa       numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Papel checado com `raise`, não com filtro no where: um `where papel in (...)`
  -- devolveria lista vazia, e "nenhuma obra" é indistinguível de "sem permissão"
  -- — a tela mostraria um estado vazio plausível e errado.
  if coalesce(public.fn_current_role(), '') not in ('admin', 'financeiro') then
    raise exception 'Apenas administradores ou financeiro podem ver o resultado por obra.';
  end if;

  -- Cada agregado é subconsulta escalar de propósito: juntar itens_orcamento,
  -- medicao_item_orcamento e lancamentos_financeiros num único FROM multiplicaria
  -- as linhas e inflaria todas as somas.
  return query
  select
    p.id,
    p.nome,
    p.situacao,
    c.nome,
    pr.valor_estimado,
    pr.bdi_percentual,
    orc.valor_orcado,
    exe.valor_executado,
    fin.receita_faturada,
    fin.receita_recebida,
    fin.despesa_lancada,
    fin.despesa_paga,
    greatest(exe.valor_executado - fin.receita_faturada, 0),
    fin.receita_faturada - fin.despesa_lancada,
    fin.receita_recebida - fin.despesa_paga
  from public.projetos p
  left join public.clientes  c  on c.id  = p.cliente_id
  left join public.propostas pr on pr.id = p.proposta_id
  cross join lateral (
    select coalesce(sum(io.valor_orcado), 0) as valor_orcado
    from public.itens_orcamento io
    where io.projeto_id = p.id
  ) orc
  cross join lateral (
    select coalesce(sum(mio.valor_aplicado), 0) as valor_executado
    from public.medicao_item_orcamento mio
    join public.itens_orcamento io2 on io2.id = mio.item_orcamento_id
    where io2.projeto_id = p.id
  ) exe
  cross join lateral (
    select
      coalesce(sum(l.valor) filter (where l.tipo = 'Receita' and l.categoria = 'Faturamento Obra'), 0)             as receita_faturada,
      coalesce(sum(l.valor) filter (where l.tipo = 'Receita' and l.categoria = 'Faturamento Obra' and l.pago), 0)  as receita_recebida,
      coalesce(sum(l.valor) filter (where l.tipo = 'Despesa'), 0)                                                  as despesa_lancada,
      coalesce(sum(l.valor) filter (where l.tipo = 'Despesa' and l.pago), 0)                                       as despesa_paga
    from public.lancamentos_financeiros l
    where l.projeto_id = p.id
  ) fin
  order by p.nome;
end;
$$;

comment on function public.fn_resultado_obra() is
  'Resultado por obra. Razão contra razão (receita x despesa); orçado/executado são contexto, nunca somados ao resultado. Só admin/financeiro — ver corpo.';

revoke execute on function public.fn_resultado_obra() from anon, public;
grant execute on function public.fn_resultado_obra() to authenticated;
