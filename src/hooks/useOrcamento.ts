import { useEffect, useState } from 'react';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';
import { orcamentoService } from '../services/orcamentoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
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
export function useOrcamento(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [orcamentos, setOrcamentos] = useState<ItemOrcamento[]>([]);
  const [alteracoesOrcamento, setAlteracoesOrcamento] = useState<AlteracaoOrcamento[]>([]);
  const [loading, setLoading] = useState(true);

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
      setOrcamentos([]);
      setAlteracoesOrcamento([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => Promise.all([orcamentoService.list(), orcamentoService.listAlteracoes()]),
      ([items, altList]) => {
        setOrcamentos(items);
        setAlteracoesOrcamento(altList);
      },
      (err) => toast.error('Falha ao carregar orçamento.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

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
