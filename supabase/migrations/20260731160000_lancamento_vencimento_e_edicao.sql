-- ============================================================
-- LANÇAMENTO: DATA DE VENCIMENTO + REGRAS DE EDIÇÃO
-- ============================================================
-- Duas lacunas do §7.1 e §7.2 de docs/analise-financeiro.md.
--
-- 1. SEM VENCIMENTO. O razão tinha uma só data — `data`, a do lançamento. O
--    card "Contas a pagar" somava tudo com pago = false, então uma conta vencida
--    há 60 dias e uma que vence amanhã eram o mesmo número. Não existia atraso.
--
-- 2. SEM EDIÇÃO. Só dava para criar, alternar `pago` e excluir. Corrigir um
--    valor digitado errado exigia excluir e relançar — o que apaga o rastro e,
--    no caso de faturamento de medição, libera uq_faturamento_por_medicao e
--    permite refaturar por outro valor sem registro de que houve troca.
--
-- ============================================================
-- 1. data_vencimento
-- ============================================================
-- NOT NULL com backfill = `data`: deixar nulável obrigaria todo consumidor a
-- tratar dois casos (`coalesce(data_vencimento, data)`) em cada soma de aging,
-- e a primeira soma que esquecesse o coalesce erraria em silêncio. Para uma
-- despesa registrada depois do fato, vencimento = data é a verdade.
alter table public.lancamentos_financeiros
  add column if not exists data_vencimento date;

update public.lancamentos_financeiros
   set data_vencimento = data
 where data_vencimento is null;

alter table public.lancamentos_financeiros
  alter column data_vencimento set default current_date;

alter table public.lancamentos_financeiros
  alter column data_vencimento set not null;

-- Aging só olha o que está em aberto; índice parcial evita carregar o histórico
-- pago, que é a maior parte do razão numa empresa em operação.
create index if not exists lancamentos_financeiros_vencimento_aberto_idx
  on public.lancamentos_financeiros (data_vencimento)
  where not pago;

-- ============================================================
-- 2. O que NÃO pode ser editado num faturamento de medição
-- ============================================================
-- A tela bloqueia estes campos, mas a tela não é a garantia: `admin`/`financeiro`
-- têm `for all` na tabela e um PATCH direto via PostgREST passaria por cima.
--
-- Por que cada um:
--   valor       -> deixaria de ser a soma de medicao_item_orcamento, e o elo
--                  entre o que a obra executou e o que foi cobrado se perde.
--   tipo        -> um faturamento que vira Despesa inverte o sinal do caixa.
--   categoria   -> uq_faturamento_por_medicao é PARCIAL em
--                  (categoria = 'Faturamento Obra'). Trocar a categoria libera a
--                  unique e permite faturar a mesma medição de novo.
--   medicao_id  -> idem: apontar para outra medição (ou para null) desfaz a
--                  rastreabilidade e libera a original.
--   projeto_id  -> o resultado por obra (fn_resultado_obra) atribuiria a receita
--                  à obra errada.
--
-- Segue editável: descrição, data, data_vencimento, conta e pago — tudo que é
-- correção de registro, não do fato financeiro.
create or replace function public.fn_lancamento_protege_faturamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.medicao_id is null then
    return new;
  end if;

  if new.valor      is distinct from old.valor
  or new.tipo       is distinct from old.tipo
  or new.categoria  is distinct from old.categoria
  or new.medicao_id is distinct from old.medicao_id
  or new.projeto_id is distinct from old.projeto_id then
    raise exception
      'Este lançamento veio do faturamento de uma medição: valor, tipo, categoria, obra e medição não podem ser alterados. Para trocar o valor, exclua o lançamento e fature a medição de novo.';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_lancamento_protege_faturamento() from anon, authenticated, public;

drop trigger if exists trg_lancamento_protege_faturamento on public.lancamentos_financeiros;
create trigger trg_lancamento_protege_faturamento
  before update on public.lancamentos_financeiros
  for each row execute function public.fn_lancamento_protege_faturamento();
