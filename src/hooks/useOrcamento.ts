import { useState } from 'react';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';
import { orcamentoService } from '../services/orcamentoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useOrcamento(ativo = true) {
  const { toast } = useFeedback();
  const [orcamentos, setOrcamentos] = useState<ItemOrcamento[]>([]);
  const [alteracoesOrcamento, setAlteracoesOrcamento] = useState<AlteracaoOrcamento[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => Promise.all([orcamentoService.list(), orcamentoService.listAlteracoes()]),
    aoChegar: ([items, altList]) => {
      setOrcamentos(items);
      setAlteracoesOrcamento(altList);
    },
    aoLimpar: () => {
      setOrcamentos([]);
      setAlteracoesOrcamento([]);
    },
    erro: 'Falha ao carregar orçamento.',
  });

  /**
   * Devolve o item criado: a vinculação a partir do catálogo precisa do id para
   * amarrar a linha de `insumos_projeto` (quantidade, preço base e ajuste) ao
   * item — é esse vínculo que permite recalcular o valor orçado depois.
   */
  const handleAddOrcamentoItem = async (item: ItemOrcamento): Promise<ItemOrcamento | null> => {
    try {
      const created = await orcamentoService.add(item);
      setOrcamentos((prev) => [...prev, created]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao adicionar item de orçamento.', err.message);
      return null;
    }
  };

  /** Reflete no estado local um item que a trigger de insumos recalculou no banco. */
  const patchOrcamentoItem = (id: string, patch: Partial<ItemOrcamento>) =>
    setOrcamentos((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const handleAddAlteracaoOrcamento = async (alt: AlteracaoOrcamento) => {
    try {
      const created = await orcamentoService.addAlteracao(alt);
      setAlteracoesOrcamento((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao registrar alteração de orçamento.', err.message);
    }
  };

  const refreshOrcamentos = () => orcamentoService.list().then(setOrcamentos).catch(avisoRefetch(toast, 'o orçamento'));

  return {
    orcamentos,
    alteracoesOrcamento,
    loading,
    handleAddOrcamentoItem,
    handleAddAlteracaoOrcamento,
    patchOrcamentoItem,
    refreshOrcamentos,
  };
}
