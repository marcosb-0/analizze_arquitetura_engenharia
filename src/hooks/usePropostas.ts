import { useRef, useState } from 'react';
import { NovaProposta, Proposta, ItemProposta, AjustePreco } from '../types';
import { propostasService } from '../services/propostasService';
import { itensPropostaService, NovoItemProposta } from '../services/itensPropostaService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function usePropostas(ativo = true) {
  const { toast } = useFeedback();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [itensProposta, setItensProposta] = useState<ItemProposta[]>([]);

  /**
   * Propostas cujo detalhe (itens + snapshots das revisões) já foi buscado.
   * Ref e não state: serve de controle de idempotência do fetch, não deve
   * disparar render por si só.
   */
  const detalhesCarregados = useRef(new Set<string>());
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

  const { loading } = useCarregamento({
    ativo,
    // Só a lista. Itens e snapshots vêm por proposta aberta — carregar tudo
    // custava o produto (propostas × itens) em toda entrada na aba. Recarregar a
    // lista invalida o que já tinha sido detalhado, daí o `clear` aqui e não só
    // em `aoLimpar`.
    buscar: () => {
      detalhesCarregados.current.clear();
      return propostasService.list();
    },
    aoChegar: setPropostas,
    aoLimpar: () => {
      setPropostas([]);
      setItensProposta([]);
      detalhesCarregados.current.clear();
    },
    erro: 'Falha ao carregar propostas.',
  });

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
    } catch (err: any) {
      // Este catch já foi silencioso, e escondeu por semanas um erro que
      // acontecia em TODA chamada: v_propostas não expunha valor_manual (ver
      // 20260726120000). O item gravava, o total no painel e no PDF não mexia,
      // e nada na tela dizia por quê — parecia que a página é que não
      // atualizava. O item de fato está salvo, então isto não é um erro fatal;
      // mas quem está olhando um total defasado precisa saber que ele é
      // defasado.
      toast.error(
        'O item foi salvo, mas o total da proposta não pôde ser relido.',
        `${err.message} — recarregue a página para ver o valor correto.`
      );
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

  /**
   * Edição do cabeçalho comercial (cliente, escopo, valor, BDI, prazo,
   * validade). Sem atualização otimista: `valor_estimado` e `valor_calculado`
   * são recalculados pelo banco a partir do que foi escrito, e adivinhá-los
   * aqui deixaria a tela mostrando um total que o servidor não confirmou.
   */
  const handleUpdateProposta = async (
    id: string,
    patch: Parameters<typeof propostasService.update>[1]
  ) => {
    try {
      const atualizada = await propostasService.update(id, patch);
      // As revisões já carregadas não vêm no retorno da view — preservá-las
      // evita que a linha do tempo suma da tela a cada edição.
      setPropostas((prev) =>
        prev.map((p) => (p.id === id ? { ...atualizada, revisoes: p.revisoes } : p))
      );
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar a proposta.', err.message);
      return false;
    }
  };

  /** Devolve se a escrita chegou ao banco — quem chama só comemora se `true`. */
  const handleUpdateStatusProposta = async (
    id: string,
    status: Proposta['status'],
    motivoRejeicao?: string
  ) => {
    // `dataEnvioAtual` tem de ser lido ANTES da atualização otimista: o service
    // usa isso para não reiniciar a contagem de "quanto tempo o cliente está com
    // a proposta" num reenvio. Capturado aqui, não do array do render.
    let dataEnvioAtual: string | undefined;
    const { aplicar, desfazer } = comRollback(setPropostas);
    aplicar((prev) => {
      dataEnvioAtual = prev.find((p) => p.id === id)?.dataEnvio;
      return prev.map((p) => (p.id === id ? { ...p, status } : p));
    });
    try {
      const marcos = await propostasService.updateStatus(id, status, {
        dataEnvioAtual,
        motivoRejeicao,
      });
      // Data de envio e motivo saem do banco, não de um palpite local.
      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, status, ...marcos } : p)));
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar status da proposta.', err.message);
      return false;
    }
  };

  const handleUpdateBdiVisivelPdf = async (id: string, visivel: boolean) => {
    const { aplicar, desfazer } = comRollback(setPropostas);
    aplicar((prev) => prev.map((p) => (p.id === id ? { ...p, bdiVisivelPdf: visivel } : p)));
    try {
      await propostasService.updateBdiVisivelPdf(id, visivel);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao alterar a exibição do BDI.', err.message);
    }
  };

  /** Duplica a proposta e devolve a cópia já no estado, pronta para seleção. */
  const handleDuplicarProposta = async (id: string, descricao?: string) => {
    try {
      const novoId = await propostasService.duplicar(id, descricao);
      const criada = await propostasService.get(novoId);
      setPropostas((prev) => [criada, ...prev]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao duplicar a proposta.', err.message);
      return null;
    }
  };

  const handleUpdateBdi = async (id: string, bdiPercentual: number) => {
    const { aplicar, desfazer } = comRollback(setPropostas);
    aplicar((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual } : p)));
    try {
      const totais = await propostasService.updateBdi(id, bdiPercentual);
      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual, ...totais } : p)));
    } catch (err: any) {
      desfazer();
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
    // Dois estados desfeitos juntos: a proposta e os itens dela. Nomes distintos
    // porque são dois rollbacks independentes no mesmo escopo.
    const lista = comRollback(setPropostas);
    const itens = comRollback(setItensProposta);
    lista.aplicar((prev) => prev.filter((p) => p.id !== id));
    itens.aplicar((prev) => prev.filter((i) => i.propostaId !== id));
    try {
      await propostasService.remove(id);
      detalhesCarregados.current.delete(id);
      return true;
    } catch (err: any) {
      lista.desfazer();
      itens.desfazer();
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
    const { aplicar, desfazer } = comRollback(setItensProposta);
    aplicar((prev) => prev.filter((i) => i.id !== id));
    try {
      await itensPropostaService.remove(id);
      await sincronizarTotais(alvo.propostaId);
    } catch (err: any) {
      desfazer();
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
    handleUpdateProposta,
    handleDuplicarProposta,
    handleUpdateBdiVisivelPdf,
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
