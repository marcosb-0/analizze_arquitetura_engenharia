import { useEffect, useState } from 'react';
import { ContaFinanceira, LancamentoFinanceiro, ResultadoObra } from '../types';
import { financeiroService } from '../services/financeiroService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/**
 * `ativo` adia a busca até a aba que precisa destes dados ser aberta.
 *
 * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
 * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
 * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
 * idas ao servidor antes do primeiro pixel útil.
 *
 * Uma vez ativo, continua ativo (ver App.tsx): voltar a uma aba já visitada não
 * refaz a busca.
 */
export function useFinanceiro(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([]);
  const [resultadoObras, setResultadoObras] = useState<ResultadoObra[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Só BUSCA — não aplica. A versão anterior encadeava `.then` com os três
   * setters aqui dentro, o que tornava o cancelamento impossível: quem chamasse
   * não teria como impedir a aplicação de um resultado obsoleto. Aplicar é
   * responsabilidade de quem sabe se ainda está interessado (ver o efeito).
   */
  const buscarFinanceiro = () =>
    Promise.all([
      financeiroService.listContas(),
      financeiroService.listLancamentos(),
      financeiroService.listResultadoObra(),
    ]);

  /**
   * O resultado por obra é somado no servidor, então não dá para recalculá-lo no
   * cliente depois de uma escrita — tem que ser relido. Toda mutação que mexe em
   * dinheiro de obra (faturar, pagar, excluir) chama isto.
   */
  const refreshResultado = () => financeiroService.listResultadoObra().then(setResultadoObras).catch(avisoRefetch(toast, 'o resultado por obra'));

  // Balances (saldo_atual) are a derived view (fix #3) — refetch contas after
  // any lancamento mutation instead of recomputing balances client-side.
  const refreshContas = () => financeiroService.listContas().then(setContas).catch(avisoRefetch(toast, 'o saldo das contas'));

  /**
   * `userId` em vez de `session` nas dependências, de propósito.
   *
   * O supabase-js cria um OBJETO de sessão novo a cada renovação de token (~1h) e
   * a cada `onAuthStateChange`. Depender de `session` refaria todas as buscas do
   * app de hora em hora, sem nada ter mudado. O id é o que de fato identifica de
   * quem são os dados.
   *
   * Antes isto era um `// eslint-disable-next-line react-hooks/exhaustive-deps`,
   * que calava a regra sem registrar o motivo. Agora a lista está honesta e a
   * regra volta a proteger o efeito.
   */
  useEffect(() => {
    if (!userId || !ativo) {
      setContas([]);
      setLancamentos([]);
      setResultadoObras([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      buscarFinanceiro,
      ([c, l, r]) => {
        setContas(c);
        setLancamentos(l);
        setResultadoObras(r);
      },
      (err) => toast.error('Falha ao carregar dados financeiros.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  /**
   * Os handlers de escrita devolvem `true` só depois de o servidor confirmar.
   * A tela usa esse retorno para decidir se fecha o modal, limpa o formulário e
   * comemora — antes ela avisava "registrado com sucesso" no mesmo clique, e um
   * write recusado pela RLS produzia um toast de sucesso seguido de um de erro,
   * com o formulário já apagado.
   */
  const handleAddConta = async (conta: ContaFinanceira): Promise<boolean> => {
    try {
      const created = await financeiroService.addConta(conta);
      setContas((prev) => [...prev, created]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar conta financeira.', err.message);
      return false;
    }
  };

  const handleAddLancamento = async (lan: LancamentoFinanceiro): Promise<boolean> => {
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
  };

  // Faturar uma medição: gera a receita "Faturamento Obra" server-side, então
  // recarrega lançamentos (o novo) + saldos das contas. Retorna sucesso.
  const handleGerarFaturamento = async (medicaoId: string, contaId: string, pago: boolean): Promise<boolean> => {
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
  };

  const handleUpdateLancamento = async (id: string, patch: Partial<LancamentoFinanceiro>): Promise<boolean> => {
    try {
      const updated = await financeiroService.updateLancamento(id, patch);
      setLancamentos((prev) => prev.map((l) => (l.id === id ? updated : l)));
      await Promise.all([refreshContas(), refreshResultado()]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao editar lançamento.', err.message);
      return false;
    }
  };

  const handleUpdateConta = async (id: string, patch: Partial<ContaFinanceira>): Promise<boolean> => {
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
  };

  /**
   * Excluir conta é só para conta que nunca movimentou; com histórico o banco
   * recusa e a mensagem explica que o caminho é desativar. Ver conta_excluir.
   */
  const handleExcluirConta = async (id: string): Promise<boolean> => {
    try {
      await financeiroService.excluirConta(id);
      setContas((prev) => prev.filter((c) => c.id !== id));
      return true;
    } catch (err: any) {
      toast.error('Falha ao excluir conta financeira.', err.message);
      return false;
    }
  };

  /** Desativar exige saldo zero — a checagem é do banco, não desta função. */
  const handleToggleContaAtiva = async (id: string, ativa: boolean): Promise<boolean> => {
    try {
      await financeiroService.updateConta(id, { ativa });
      await refreshContas();
      return true;
    } catch (err: any) {
      toast.error(ativa ? 'Falha ao reativar conta.' : 'Falha ao desativar conta.', err.message);
      return false;
    }
  };

  const handleToggleLancamentoPago = async (id: string): Promise<boolean> => {
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
  };

  const handleDeleteLancamento = async (id: string): Promise<boolean> => {
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
  };

  return {
    contas,
    lancamentos,
    resultadoObras,
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
  };
}
