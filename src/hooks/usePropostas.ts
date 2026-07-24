import { useEffect, useState } from 'react';
import { Proposta, RevisaoProposta, ItemProposta, AjustePreco } from '../types';
import { propostasService } from '../services/propostasService';
import { itensPropostaService, NovoItemProposta } from '../services/itensPropostaService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function usePropostas() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [itensProposta, setItensProposta] = useState<ItemProposta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setPropostas([]);
      setItensProposta([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([propostasService.list(), itensPropostaService.list()])
      .then(([props, itens]) => {
        setPropostas(props);
        setItensProposta(itens);
      })
      .catch((err) => toast.error('Falha ao carregar propostas.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  /**
   * Com itens, `valor_estimado` é calculado no banco (soma × BDI). Depois de
   * qualquer escrita em item ou BDI, relemos os totais em vez de recalcular no
   * cliente — o servidor é a autoridade sobre o arredondamento.
   */
  const sincronizarTotais = async (propostaId: string) => {
    try {
      const totais = await propostasService.refreshTotais(propostaId);
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? { ...p, ...totais } : p)));
    } catch {
      /* o item já foi gravado; um total desatualizado se resolve no próximo carregamento */
    }
  };

  const handleAddProposta = async (prop: Proposta) => {
    try {
      const created = await propostasService.add(prop);
      setPropostas((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar proposta.', err.message);
      return null;
    }
  };

  const handleUpdateStatusProposta = async (id: string, status: Proposta['status']) => {
    const previous = propostas;
    setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await propostasService.updateStatus(id, status);
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao atualizar status da proposta.', err.message);
    }
  };

  const handleUpdateBdi = async (id: string, bdiPercentual: number) => {
    const previous = propostas;
    setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual } : p)));
    try {
      const totais = await propostasService.updateBdi(id, bdiPercentual);
      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual, ...totais } : p)));
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao atualizar o BDI.', err.message);
    }
  };

  const handleAddRevision = async (id: string, revision: RevisaoProposta) => {
    const previous = propostas;
    setPropostas((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, valorEstimado: revision.valor, revisoes: [...p.revisoes, revision] } : p
      )
    );
    try {
      await propostasService.addRevision(id, revision);
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao registrar revisão.', err.message);
    }
  };

  const handleDeleteProposta = async (id: string) => {
    const previous = propostas;
    const previousItens = itensProposta;
    setPropostas((prev) => prev.filter((p) => p.id !== id));
    setItensProposta((prev) => prev.filter((i) => i.propostaId !== id));
    try {
      await propostasService.remove(id);
    } catch (err: any) {
      setPropostas(previous);
      setItensProposta(previousItens);
      toast.error('Falha ao excluir proposta.', err.message);
    }
  };

  // --- ITENS DA PROPOSTA ---

  const handleAddItemProposta = async (novo: NovoItemProposta) => {
    try {
      const criado = await itensPropostaService.add(novo);
      setItensProposta((prev) => [...prev, criado]);
      await sincronizarTotais(novo.propostaId);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao adicionar item à proposta.', err.message);
      return null;
    }
  };

  /** Acréscimo ou desconto neste item DESTA proposta — o catálogo global não muda. */
  const handleAjustarItemProposta = async (id: string, ajuste: AjustePreco) => {
    const alvo = itensProposta.find((i) => i.id === id);
    if (!alvo) return null;
    try {
      const atualizado = await itensPropostaService.atualizarAjuste(id, ajuste);
      setItensProposta((prev) => prev.map((i) => (i.id === id ? atualizado : i)));
      await sincronizarTotais(alvo.propostaId);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao ajustar o preço do item.', err.message);
      return null;
    }
  };

  const handleAjustarQuantidadeItemProposta = async (id: string, quantidade: number) => {
    const alvo = itensProposta.find((i) => i.id === id);
    if (!alvo) return null;
    try {
      const atualizado = await itensPropostaService.atualizarQuantidade(id, quantidade);
      setItensProposta((prev) => prev.map((i) => (i.id === id ? atualizado : i)));
      await sincronizarTotais(alvo.propostaId);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao alterar a quantidade.', err.message);
      return null;
    }
  };

  const handleRemoveItemProposta = async (id: string) => {
    const alvo = itensProposta.find((i) => i.id === id);
    if (!alvo) return;
    const previous = itensProposta;
    setItensProposta((prev) => prev.filter((i) => i.id !== id));
    try {
      await itensPropostaService.remove(id);
      await sincronizarTotais(alvo.propostaId);
    } catch (err: any) {
      setItensProposta(previous);
      toast.error('Falha ao remover o item.', err.message);
    }
  };

  return {
    propostas,
    itensProposta,
    loading,
    handleAddProposta,
    handleUpdateStatusProposta,
    handleUpdateBdi,
    handleAddRevision,
    handleDeleteProposta,
    handleAddItemProposta,
    handleAjustarItemProposta,
    handleAjustarQuantidadeItemProposta,
    handleRemoveItemProposta,
  };
}
