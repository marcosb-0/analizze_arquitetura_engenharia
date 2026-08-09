import { useCallback, useMemo, useRef, useState } from 'react';
import {
  NovaProposta, Proposta, ItemProposta, AjustePreco, ModeloTexto, PosicaoSecao, SecaoProposta,
} from '../types';
import { propostasService } from '../services/propostasService';
import { itensPropostaService, NovoItemProposta } from '../services/itensPropostaService';
import { propostaSecoesService } from '../services/propostaSecoesService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function usePropostas(ativo = true) {
  const { toast } = useFeedback();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [itensProposta, setItensProposta] = useState<ItemProposta[]>([]);
  const [secoesProposta, setSecoesProposta] = useState<SecaoProposta[]>([]);

  /**
   * Propostas cujo detalhe (itens + snapshots das revisões + descritivo) já foi
   * buscado. Ref e não state: serve de controle de idempotência do fetch, não
   * deve disparar render por si só.
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
      setSecoesProposta([]);
      detalhesCarregados.current.clear();
    },
    erro: 'Falha ao carregar propostas.',
  });

  /** Busca itens, snapshots de revisão e descritivo de uma proposta, uma vez. */
  const carregarDetalheProposta = useCallback(async (propostaId: string) => {
    if (!propostaId || detalhesCarregados.current.has(propostaId)) return;
    detalhesCarregados.current.add(propostaId);
    setCarregandoDetalhe(propostaId);
    try {
      const [itens, revisoes, secoes] = await Promise.all([
        itensPropostaService.list(propostaId),
        propostasService.listRevisoes(propostaId),
        propostaSecoesService.list(propostaId),
      ]);
      setItensProposta((prev) => [...prev.filter((i) => i.propostaId !== propostaId), ...itens]);
      setSecoesProposta((prev) => [...prev.filter((s) => s.propostaId !== propostaId), ...secoes]);
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? { ...p, revisoes } : p)));
    } catch (err: any) {
      // Sai do cache para que uma nova seleção tente de novo.
      detalhesCarregados.current.delete(propostaId);
      toast.error('Falha ao carregar o orçamento da proposta.', err.message);
    } finally {
      setCarregandoDetalhe((atual) => (atual === propostaId ? null : atual));
    }
  }, [toast]);

  /**
   * Reescreve as seções de uma proposta e mantém `qtdSecoes` de acordo.
   *
   * `qtdSecoes` vem de v_propostas e alimenta a pendência "esta proposta não
   * tem descritivo". Sem este recálculo local, apagar a última seção deixaria a
   * pendência escondida até a próxima recarga da lista — e escrever a primeira
   * deixaria o aviso na tela depois de resolvido.
   */
  const aplicarSecoes = useCallback((propostaId: string, daProposta: SecaoProposta[]) => {
    setSecoesProposta((prev) => [...prev.filter((s) => s.propostaId !== propostaId), ...daProposta]);
    const comTexto = daProposta.filter((s) => s.corpo.trim() !== '').length;
    setPropostas((prev) =>
      prev.map((p) => (p.id === propostaId ? { ...p, qtdSecoes: comTexto } : p))
    );
  }, []);

  /** As seções de uma proposta, na ordem em que a tela e o papel as leem. */
  const secoesDe = useCallback(
    (propostaId: string) => secoesProposta.filter((s) => s.propostaId === propostaId),
    [secoesProposta]
  );

  /**
   * Com itens, `valor_estimado` é calculado no banco (soma × BDI). Depois de
   * qualquer escrita em item ou BDI, relemos os totais em vez de recalcular no
   * cliente — o servidor é a autoridade sobre o arredondamento.
   */
  const sincronizarTotais = useCallback(async (propostaId: string) => {
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
  }, [toast]);

  const handleAddProposta = useCallback(async (prop: NovaProposta) => {
    try {
      const created = await propostasService.add(prop);
      setPropostas((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar proposta.', err.message);
      return null;
    }
  }, [toast]);

  /**
   * Edição do cabeçalho comercial (cliente, escopo, valor, BDI, prazo,
   * validade). Sem atualização otimista: `valor_estimado` e `valor_calculado`
   * são recalculados pelo banco a partir do que foi escrito, e adivinhá-los
   * aqui deixaria a tela mostrando um total que o servidor não confirmou.
   */
  const handleUpdateProposta = useCallback(async (
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
  }, [toast]);

  /** Devolve se a escrita chegou ao banco — quem chama só comemora se `true`. */
  const handleUpdateStatusProposta = useCallback(async (
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
  }, [toast]);

  const handleUpdateBdiVisivelPdf = useCallback(async (id: string, visivel: boolean) => {
    const { aplicar, desfazer } = comRollback(setPropostas);
    aplicar((prev) => prev.map((p) => (p.id === id ? { ...p, bdiVisivelPdf: visivel } : p)));
    try {
      await propostasService.updateBdiVisivelPdf(id, visivel);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao alterar a exibição do BDI.', err.message);
    }
  }, [toast]);

  /** Duplica a proposta e devolve a cópia já no estado, pronta para seleção. */
  const handleDuplicarProposta = useCallback(async (id: string, descricao?: string) => {
    try {
      const novoId = await propostasService.duplicar(id, descricao);
      const criada = await propostasService.get(novoId);
      setPropostas((prev) => [criada, ...prev]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao duplicar a proposta.', err.message);
      return null;
    }
  }, [toast]);

  const handleUpdateBdi = useCallback(async (id: string, bdiPercentual: number) => {
    const { aplicar, desfazer } = comRollback(setPropostas);
    aplicar((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual } : p)));
    try {
      const totais = await propostasService.updateBdi(id, bdiPercentual);
      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, bdiPercentual, ...totais } : p)));
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar o BDI.', err.message);
    }
  }, [toast]);

  /**
   * A revisão congela o orçamento vigente. Versão, total e cópia dos itens
   * nascem no servidor, então não há atualização otimista possível: releia o
   * que foi realmente gravado.
   */
  const handleAddRevision = useCallback(async (id: string, alteracoes: string, valor?: number) => {
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
  }, [toast]);

  const handleDeleteProposta = useCallback(async (id: string) => {
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
  }, [toast]);

  // --- ITENS DA PROPOSTA ---

  const handleAddItemProposta = useCallback(async (novo: NovoItemProposta) => {
    try {
      const criado = await itensPropostaService.add(novo);
      setItensProposta((prev) => [...prev, criado]);
      await sincronizarTotais(novo.propostaId);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao adicionar item à proposta.', err.message);
      return null;
    }
  }, [sincronizarTotais, toast]);

  /** Acréscimo ou desconto neste item DESTA proposta — o catálogo global não muda. */
  const handleAjustarItemProposta = useCallback(async (id: string, ajuste: AjustePreco) => {
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
  }, [itensProposta, sincronizarTotais, toast]);

  const handleAjustarQuantidadeItemProposta = useCallback(async (id: string, quantidade: number) => {
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
  }, [itensProposta, sincronizarTotais, toast]);

  const handleRemoveItemProposta = useCallback(async (id: string) => {
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
  }, [itensProposta, sincronizarTotais, toast]);

  // --- DESCRITIVO DA PROPOSTA ---

  const handleAddSecao = useCallback(async (
    propostaId: string,
    titulo: string,
    posicao: PosicaoSecao
  ) => {
    const atuais = secoesDe(propostaId);
    try {
      const criada = await propostaSecoesService.add({ propostaId, titulo, posicao }, atuais);
      aplicarSecoes(propostaId, [...atuais, criada]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao adicionar a seção.', err.message);
      return null;
    }
  }, [aplicarSecoes, secoesDe, toast]);

  /** Insere um modelo da biblioteca. É cópia: a biblioteca não muda depois. */
  const handleInserirModeloNaProposta = useCallback(async (
    propostaId: string,
    modelo: ModeloTexto
  ) => {
    const atuais = secoesDe(propostaId);
    try {
      const criada = await propostaSecoesService.apartirDoModelo(propostaId, modelo, atuais);
      aplicarSecoes(propostaId, [...atuais, criada]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao inserir o modelo na proposta.', err.message);
      return null;
    }
  }, [aplicarSecoes, secoesDe, toast]);

  /**
   * Otimista: o painel grava no `blur` de cada campo, e esperar o servidor para
   * repintar o que a pessoa acabou de digitar faz o texto piscar.
   */
  const handleUpdateSecao = useCallback(async (
    id: string,
    patch: Partial<Pick<SecaoProposta, 'titulo' | 'corpo' | 'posicao'>>
  ) => {
    const alvo = secoesProposta.find((s) => s.id === id);
    if (!alvo) return false;
    const anteriores = secoesDe(alvo.propostaId);
    aplicarSecoes(alvo.propostaId, anteriores.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const atualizada = await propostaSecoesService.update(id, patch);
      aplicarSecoes(alvo.propostaId, anteriores.map((s) => (s.id === id ? atualizada : s)));
      return true;
    } catch (err: any) {
      aplicarSecoes(alvo.propostaId, anteriores);
      toast.error('Falha ao salvar a seção.', err.message);
      return false;
    }
  }, [aplicarSecoes, secoesDe, secoesProposta, toast]);

  const handleRemoveSecao = useCallback(async (id: string) => {
    const alvo = secoesProposta.find((s) => s.id === id);
    if (!alvo) return;
    const anteriores = secoesDe(alvo.propostaId);
    aplicarSecoes(alvo.propostaId, anteriores.filter((s) => s.id !== id));
    try {
      await propostaSecoesService.remove(id);
    } catch (err: any) {
      aplicarSecoes(alvo.propostaId, anteriores);
      toast.error('Falha ao remover a seção.', err.message);
    }
  }, [aplicarSecoes, secoesDe, secoesProposta, toast]);

  /**
   * Troca a seção de lugar com a vizinha do mesmo bloco.
   *
   * A vizinha é escolhida aqui, e não no painel, porque quem sabe a ordem real
   * é o estado: a tela mostra `antes` e `depois` em listas separadas, e mover
   * "para cima" a primeira de `depois` não pode saltar para dentro de `antes`.
   */
  const handleReordenarSecao = useCallback(async (id: string, direcao: -1 | 1) => {
    const alvo = secoesProposta.find((s) => s.id === id);
    if (!alvo) return;
    const bloco = secoesDe(alvo.propostaId)
      .filter((s) => s.posicao === alvo.posicao)
      .sort((a, b) => a.ordem - b.ordem);
    const i = bloco.findIndex((s) => s.id === id);
    const vizinha = bloco[i + direcao];
    if (!vizinha) return;

    const anteriores = secoesDe(alvo.propostaId);
    aplicarSecoes(
      alvo.propostaId,
      anteriores.map((s) => {
        if (s.id === alvo.id) return { ...s, ordem: vizinha.ordem };
        if (s.id === vizinha.id) return { ...s, ordem: alvo.ordem };
        return s;
      })
    );
    try {
      await propostaSecoesService.trocarOrdem(alvo, vizinha);
    } catch (err: any) {
      aplicarSecoes(alvo.propostaId, anteriores);
      toast.error('Falha ao reordenar o descritivo.', err.message);
    }
  }, [aplicarSecoes, secoesDe, secoesProposta, toast]);

  return useMemo(() => ({
    propostas,
    itensProposta,
    secoesProposta,
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
    handleAddSecao,
    handleInserirModeloNaProposta,
    handleUpdateSecao,
    handleRemoveSecao,
    handleReordenarSecao,
  }), [propostas, itensProposta, secoesProposta, loading, carregandoDetalhe, carregarDetalheProposta, handleAddProposta, handleUpdateProposta, handleDuplicarProposta, handleUpdateBdiVisivelPdf, handleUpdateStatusProposta, handleUpdateBdi, handleAddRevision, handleDeleteProposta, handleAddItemProposta, handleAjustarItemProposta, handleAjustarQuantidadeItemProposta, handleRemoveItemProposta, handleAddSecao, handleInserirModeloNaProposta, handleUpdateSecao, handleRemoveSecao, handleReordenarSecao]);
}
