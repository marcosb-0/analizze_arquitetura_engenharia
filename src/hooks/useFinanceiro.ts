import { useCallback, useMemo, useState } from 'react';
import { ContaFinanceira, LancamentoFinanceiro, MargemObra, ResultadoObra } from '../types';
import { insumosProjetoService } from '../services/insumosProjetoService';
import { financeiroService } from '../services/financeiroService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useFinanceiro(ativo = true) {
  const { toast } = useFeedback();
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([]);
  const [resultadoObras, setResultadoObras] = useState<ResultadoObra[]>([]);
  /**
   * A margem ORÇADA por obra (item A1). Anda junto do resultado, e não dentro
   * dele, porque as duas respondem perguntas diferentes: `resultadoObras` é
   * dinheiro que entrou contra dinheiro que saiu; a margem é o que o orçamento
   * previa ganhar. Uma obra pode ter margem alta e caixa negativo — é o caso
   * normal no começo dela.
   */
  const [margensObra, setMargensObra] = useState<MargemObra[]>([]);

  /**
   * Só BUSCA — não aplica. A versão anterior encadeava `.then` com os três
   * setters aqui dentro, o que tornava o cancelamento impossível: quem chamasse
   * não teria como impedir a aplicação de um resultado obsoleto. Aplicar é
   * responsabilidade de quem sabe se ainda está interessado — hoje o `aoChegar`
   * de `useCarregamento`.
   */
  const buscarFinanceiro = () =>
    Promise.all([
      financeiroService.listContas(),
      financeiroService.listLancamentos(),
      financeiroService.listResultadoObra(),
      insumosProjetoService.margensDasObras(),
    ]);

  /**
   * O resultado por obra é somado no servidor, então não dá para recalculá-lo no
   * cliente depois de uma escrita — tem que ser relido. Toda mutação que mexe em
   * dinheiro de obra (faturar, pagar, excluir) chama isto.
   */
  const refreshResultado = useCallback(
    () => financeiroService.listResultadoObra().then(setResultadoObras).catch(avisoRefetch(toast, 'o resultado por obra')),
    [toast]
  );

  // Balances (saldo_atual) are a derived view (fix #3) — refetch contas after
  // any lancamento mutation instead of recomputing balances client-side.
  const refreshContas = useCallback(
    () => financeiroService.listContas().then(setContas).catch(avisoRefetch(toast, 'o saldo das contas')),
    [toast]
  );

  const { loading } = useCarregamento({
    ativo,
    buscar: buscarFinanceiro,
    aoChegar: ([c, l, r, m]) => {
      setContas(c);
      setLancamentos(l);
      setResultadoObras(r);
      setMargensObra(m);
    },
    aoLimpar: () => {
      setContas([]);
      setLancamentos([]);
      setResultadoObras([]);
      setMargensObra([]);
    },
    erro: 'Falha ao carregar dados financeiros.',
  });

  /**
   * Os handlers de escrita devolvem `true` só depois de o servidor confirmar.
   * A tela usa esse retorno para decidir se fecha o modal, limpa o formulário e
   * comemora — antes ela avisava "registrado com sucesso" no mesmo clique, e um
   * write recusado pela RLS produzia um toast de sucesso seguido de um de erro,
   * com o formulário já apagado.
   */
  const handleAddConta = useCallback(async (conta: ContaFinanceira): Promise<boolean> => {
    try {
      const created = await financeiroService.addConta(conta);
      setContas((prev) => [...prev, created]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar conta financeira.', err.message);
      return false;
    }
  }, [toast]);

  const handleAddLancamento = useCallback(async (lan: LancamentoFinanceiro): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setLancamentos);
    aplicar((prev) => [lan, ...prev]);
    try {
      const created = await financeiroService.addLancamento(lan);
      setLancamentos((prev) => prev.map((l) => (l.id === lan.id ? created : l)));
      await Promise.all([refreshContas(), refreshResultado()]);
      return true;
    } catch (err: any) {
      desfazer();
      const message = err.code === '23505' ? 'Já existe um lançamento de salário para este colaborador nesta competência.' : err.message;
      toast.error('Falha ao registrar lançamento.', message);
      return false;
    }
  }, [refreshContas, refreshResultado, toast]);

  // Faturar uma medição: gera a receita "Faturamento Obra" server-side, então
  // recarrega lançamentos (o novo) + saldos das contas. Retorna sucesso.
  const handleGerarFaturamento = useCallback(async (medicaoId: string, contaId: string, pago: boolean): Promise<boolean> => {
    try {
      const created = await financeiroService.gerarLancamentoMedicao(medicaoId, contaId, pago);
      setLancamentos((prev) => [created, ...prev]);
      await Promise.all([refreshContas(), refreshResultado()]);
      toast.success('Faturamento gerado.', `Receita de ${created.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada.`);
      return true;
    } catch (err: any) {
      toast.error('Falha ao faturar medição.', err.message);
      return false;
    }
  }, [refreshContas, refreshResultado, toast]);

  const handleUpdateLancamento = useCallback(async (id: string, patch: Partial<LancamentoFinanceiro>): Promise<boolean> => {
    try {
      const updated = await financeiroService.updateLancamento(id, patch);
      setLancamentos((prev) => prev.map((l) => (l.id === id ? updated : l)));
      await Promise.all([refreshContas(), refreshResultado()]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao editar lançamento.', err.message);
      return false;
    }
  }, [refreshContas, refreshResultado, toast]);

  const handleUpdateConta = useCallback(async (id: string, patch: Partial<ContaFinanceira>): Promise<boolean> => {
    try {
      await financeiroService.updateConta(id, patch);
      // Saldo é derivado (v_contas_financeiras): mexer no saldo inicial muda o
      // atual, então relê em vez de aplicar o patch no estado local.
      await refreshContas();
      return true;
    } catch (err: any) {
      toast.error('Falha ao editar conta financeira.', err.message);
      return false;
    }
  }, [refreshContas, toast]);

  /**
   * Excluir conta é só para conta que nunca movimentou; com histórico o banco
   * recusa e a mensagem explica que o caminho é desativar. Ver conta_excluir.
   */
  const handleExcluirConta = useCallback(async (id: string): Promise<boolean> => {
    try {
      await financeiroService.excluirConta(id);
      setContas((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err: any) {
      toast.error('Falha ao excluir conta financeira.', err.message);
      return false;
    }
  }, [toast]);

  /** Desativar exige saldo zero — a checagem é do banco, não desta função. */
  const handleToggleContaAtiva = useCallback(async (id: string, ativa: boolean): Promise<boolean> => {
    try {
      await financeiroService.updateConta(id, { ativa });
      await refreshContas();
      return true;
    } catch (err: any) {
      toast.error(ativa ? 'Falha ao reativar conta.' : 'Falha ao desativar conta.', err.message);
      return false;
    }
  }, [refreshContas, toast]);

  const handleToggleLancamentoPago = useCallback(async (id: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setLancamentos);
    const lan = lancamentos.find((l) => l.id === id);
    if (!lan) return false;
    const nextPago = !lan.pago;
    aplicar((prev) => prev.map((l) => (l.id === id ? { ...l, pago: nextPago } : l)));
    try {
      await financeiroService.setPago(id, nextPago);
      await Promise.all([refreshContas(), refreshResultado()]);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar pagamento.', err.message);
      return false;
    }
  }, [lancamentos, refreshContas, refreshResultado, toast]);

  const handleDeleteLancamento = useCallback(async (id: string): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setLancamentos);
    aplicar((prev) => prev.filter((l) => l.id !== id));
    try {
      await financeiroService.removeLancamento(id);
      await Promise.all([refreshContas(), refreshResultado()]);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir lançamento.', err.message);
      return false;
    }
  }, [refreshContas, refreshResultado, toast]);

  return useMemo(() => ({
    contas,
    lancamentos,
    resultadoObras,
    margensObra,
    loading,
    handleAddConta,
    handleAddLancamento,
    handleUpdateLancamento,
    handleUpdateConta,
    handleExcluirConta,
    handleToggleContaAtiva,
    handleGerarFaturamento,
    handleToggleLancamentoPago,
    handleDeleteLancamento,
  }), [contas, lancamentos, resultadoObras, margensObra, loading, handleAddConta, handleAddLancamento, handleUpdateLancamento, handleUpdateConta, handleExcluirConta, handleToggleContaAtiva, handleGerarFaturamento, handleToggleLancamentoPago, handleDeleteLancamento]);
}
