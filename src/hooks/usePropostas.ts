import { useEffect, useRef, useState } from 'react';
import { NovaProposta, Proposta, RevisaoProposta, ItemProposta, AjustePreco } from '../types';
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

  /**
   * Propostas cujo detalhe (itens + snapshots das revisões) já foi buscado.
   * Ref e não state: serve de controle de idempotência do fetch, não deve
   * disparar render por si só.
   */
  const detalhesCarregados = useRef(new Set<string>());
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setPropostas([]);
      setItensProposta([]);
      detalhesCarregados.current.clear();
      setLoading(false);
      return;
    }
    setLoading(true);
    detalhesCarregados.current.clear();
    // Só a lista. Itens e snapshots vêm por proposta aberta — carregar tudo
    // custava o produto (propostas × itens) em toda entrada na aba.
    propostasService
      .list()
      .then(setPropostas)
      .catch((err) => toast.error('Falha ao carregar propostas.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  /** Busca itens e snapshots de revisão de uma proposta, uma única vez. */
  const carregarDetalheProposta = async (propostaId: string) => {
    if (!propostaId || detalhesCarregados.current.has(propostaId)) return;
    detalhesCarregados.current.add(propostaId);
    setCarregandoDetalhe(propostaId);
    try {
      const [itens, revisoes] = await Promise.all([
        itensPropostaService.list(propostaId),
        propostasService.listRevisoes(propostaId),
      ]);
      setItensProposta((prev) => [...prev.filter((i) => i.propostaId !== propostaId), ...itens]);
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? { ...p, revisoes } : p)));
    } catch (err: any) {
      // Sai do cache para que uma nova seleção tente de novo.
      detalhesCarregados.current.delete(propostaId);
      toast.error('Falha ao carregar o orçamento da proposta.', err.message);
    } finally {
      setCarregandoDetalhe((atual) => (atual === propostaId ? null : atual));
    }
  };

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

  const handleAddProposta = async (prop: NovaProposta) => {
    try {
      const created = await propostasService.add(prop);
      setPropostas((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar proposta.', err.message);
      return null;
    }
  };

  /** Devolve se a escrita chegou ao banco — quem chama só comemora se `true`. */
  const handleUpdateStatusProposta = async (id: string, status: Proposta['status']) => {
    const previous = propostas;
    setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await propostasService.updateStatus(id, status);
      return true;
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao atualizar status da proposta.', err.message);
      return false;
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

  /**
   * A revisão congela o orçamento vigente. Versão, total e cópia dos itens
   * nascem no servidor, então não há atualização otimista possível: releia o
   * que foi realmente gravado.
   */
  const handleAddRevision = async (id: string, alteracoes: string, valor?: number) => {
    try {
      await propostasService.addRevision(id, alteracoes, valor);
      const [revisoes, totais] = await Promise.all([
        propostasService.listRevisoes(id),
        propostasService.refreshTotais(id),
      ]);
      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, revisoes, ...totais } : p)));
      return true;
    } catch (err: any) {
      toast.error('Falha ao registrar revisão.', err.message);
      return false;
    }
  };

  const handleDeleteProposta = async (id: string) => {
    const previous = propostas;
    const previousItens = itensProposta;
    setPropostas((prev) => prev.filter((p) => p.id !== id));
    setItensProposta((prev) => prev.filter((i) => i.propostaId !== id));
    try {
      await propostasService.remove(id);
      detalhesCarregados.current.delete(id);
      return true;
    } catch (err: any) {
      setPropostas(previous);
      setItensProposta(previousItens);
      toast.error('Falha ao excluir proposta.', err.message);
      return false;
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
    carregandoDetalhe,
    carregarDetalheProposta,
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
