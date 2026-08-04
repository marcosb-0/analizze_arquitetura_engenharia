import { useCallback, useMemo, useState } from 'react';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';
import { orcamentoService } from '../services/orcamentoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/**
 * O orçamento da OBRA ABERTA — item 23, peça 2 (§4.2).
 *
 * `obraId` é o recorte: sem console aberto o hook não busca nada e o estado
 * nasce vazio. Antes carregava `v_itens_orcamento` inteira, de todas as obras,
 * e o console filtrava em memória.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useOrcamento(ativo = true, obraId: string | null = null) {
  const { toast } = useFeedback();
  const [orcamentos, setOrcamentos] = useState<ItemOrcamento[]>([]);
  const [alteracoesOrcamento, setAlteracoesOrcamento] = useState<AlteracaoOrcamento[]>([]);

  const { loading } = useCarregamento({
    ativo,
    escopo: obraId,
    // `obraId!`: `useCarregamento` não chama `buscar` com escopo nulo — é a
    // mesma garantia que faz `aoLimpar` rodar no lugar.
    buscar: () => Promise.all([orcamentoService.list(obraId!), orcamentoService.listAlteracoes(obraId!)]),
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
  const handleAddOrcamentoItem = useCallback(async (item: ItemOrcamento): Promise<ItemOrcamento | null> => {
    try {
      const created = await orcamentoService.add(item);
      setOrcamentos((prev) => [...prev, created]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao adicionar item de orçamento.', err.message);
      return null;
    }
  }, [toast]);

  /** Reflete no estado local um item que a trigger de insumos recalculou no banco. */
  const patchOrcamentoItem = useCallback(
    (id: string, patch: Partial<ItemOrcamento>) =>
      setOrcamentos((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o))),
    []
  );

  const handleAddAlteracaoOrcamento = useCallback(async (alt: AlteracaoOrcamento) => {
    try {
      const created = await orcamentoService.addAlteracao(alt);
      setAlteracoesOrcamento((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao registrar alteração de orçamento.', err.message);
    }
  }, [toast]);

  /**
   * Sem obra aberta não há o que reler, e a releitura é chamada de ações que
   * também rodam com o console fechado (excluir obra pela lista, por exemplo).
   * Devolve promessa resolvida para o chamador não precisar saber disso.
   */
  const refreshOrcamentos = useCallback(
    () =>
      obraId
        ? orcamentoService.list(obraId).then(setOrcamentos).catch(avisoRefetch(toast, 'o orçamento'))
        : Promise.resolve(),
    [obraId, toast]
  );

  return useMemo(
    () => ({
      orcamentos,
      alteracoesOrcamento,
      loading,
      handleAddOrcamentoItem,
      handleAddAlteracaoOrcamento,
      patchOrcamentoItem,
      refreshOrcamentos,
    }),
    [
      orcamentos,
      alteracoesOrcamento,
      loading,
      handleAddOrcamentoItem,
      handleAddAlteracaoOrcamento,
      patchOrcamentoItem,
      refreshOrcamentos,
    ]
  );
}
