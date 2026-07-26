import { useEffect, useState } from 'react';
import { ContaFinanceira, LancamentoFinanceiro } from '../types';
import { financeiroService } from '../services/financeiroService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

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
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = () =>
    Promise.all([financeiroService.listContas(), financeiroService.listLancamentos()]).then(([c, l]) => {
      setContas(c);
      setLancamentos(l);
    });

  // Balances (saldo_atual) are a derived view (fix #3) — refetch contas after
  // any lancamento mutation instead of recomputing balances client-side.
  const refreshContas = () => financeiroService.listContas().then(setContas).catch(() => {});

  useEffect(() => {
    if (!session || !ativo) {
      setContas([]);
      setLancamentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadAll()
      .catch((err) => toast.error('Falha ao carregar dados financeiros.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, ativo]);

  const handleAddConta = async (conta: ContaFinanceira) => {
    try {
      const created = await financeiroService.addConta(conta);
      setContas((prev) => [...prev, created]);
    } catch (err: any) {
      toast.error('Falha ao criar conta financeira.', err.message);
    }
  };

  const handleAddLancamento = async (lan: LancamentoFinanceiro) => {
    const previousLancamentos = lancamentos;
    setLancamentos((prev) => [lan, ...prev]);
    try {
      const created = await financeiroService.addLancamento(lan);
      setLancamentos((prev) => prev.map((l) => (l.id === lan.id ? created : l)));
      await refreshContas();
    } catch (err: any) {
      setLancamentos(previousLancamentos);
      const message = err.code === '23505' ? 'Já existe um lançamento de salário para este colaborador nesta competência.' : err.message;
      toast.error('Falha ao registrar lançamento.', message);
    }
  };

  // Faturar uma medição: gera a receita "Faturamento Obra" server-side, então
  // recarrega lançamentos (o novo) + saldos das contas. Retorna sucesso.
  const handleGerarFaturamento = async (medicaoId: string, contaId: string, pago: boolean): Promise<boolean> => {
    try {
      const created = await financeiroService.gerarLancamentoMedicao(medicaoId, contaId, pago);
      setLancamentos((prev) => [created, ...prev]);
      await refreshContas();
      toast.success('Faturamento gerado.', `Receita de ${created.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada.`);
      return true;
    } catch (err: any) {
      toast.error('Falha ao faturar medição.', err.message);
      return false;
    }
  };

  const handleToggleLancamentoPago = async (id: string) => {
    const previousLancamentos = lancamentos;
    const lan = lancamentos.find((l) => l.id === id);
    if (!lan) return;
    const nextPago = !lan.pago;
    setLancamentos((prev) => prev.map((l) => (l.id === id ? { ...l, pago: nextPago } : l)));
    try {
      await financeiroService.setPago(id, nextPago);
      await refreshContas();
    } catch (err: any) {
      setLancamentos(previousLancamentos);
      toast.error('Falha ao atualizar pagamento.', err.message);
    }
  };

  const handleDeleteLancamento = async (id: string) => {
    const previousLancamentos = lancamentos;
    setLancamentos((prev) => prev.filter((l) => l.id !== id));
    try {
      await financeiroService.removeLancamento(id);
      await refreshContas();
    } catch (err: any) {
      setLancamentos(previousLancamentos);
      toast.error('Falha ao excluir lançamento.', err.message);
    }
  };

  return {
    contas,
    lancamentos,
    loading,
    handleAddConta,
    handleAddLancamento,
    handleGerarFaturamento,
    handleToggleLancamentoPago,
    handleDeleteLancamento,
  };
}
