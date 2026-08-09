import { useCallback, useMemo, useRef, useState } from 'react';
import { ClausulaContrato, Contrato, EdicaoContrato, ModeloTexto, StatusContrato } from '../types';
import { contratosService } from '../services/contratosService';
import { contratoClausulasService } from '../services/contratoClausulasService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/**
 * Contratos e suas cláusulas.
 *
 * Mesmo desenho de `usePropostas`: a lista vem no carregamento da aba, as
 * cláusulas por contrato aberto e uma única vez. O motivo é o mesmo — o
 * produto (contratos × cláusulas) cresce rápido e nenhuma tela precisa da
 * cláusula de dois contratos ao mesmo tempo.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useContratos(ativo = true) {
  const { toast } = useFeedback();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [clausulas, setClausulas] = useState<ClausulaContrato[]>([]);

  const detalhesCarregados = useRef(new Set<string>());
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => {
      detalhesCarregados.current.clear();
      return contratosService.list();
    },
    aoChegar: setContratos,
    aoLimpar: () => {
      setContratos([]);
      setClausulas([]);
      detalhesCarregados.current.clear();
    },
    erro: 'Falha ao carregar contratos.',
  });

  const carregarClausulas = useCallback(async (contratoId: string) => {
    if (!contratoId || detalhesCarregados.current.has(contratoId)) return;
    detalhesCarregados.current.add(contratoId);
    setCarregandoDetalhe(contratoId);
    try {
      const lista = await contratoClausulasService.list(contratoId);
      setClausulas((prev) => [...prev.filter((c) => c.contratoId !== contratoId), ...lista]);
    } catch (err: any) {
      detalhesCarregados.current.delete(contratoId);
      toast.error('Falha ao carregar as cláusulas do contrato.', err.message);
    } finally {
      setCarregandoDetalhe((atual) => (atual === contratoId ? null : atual));
    }
  }, [toast]);

  /**
   * Reescreve as cláusulas de um contrato e mantém `qtdClausulas` de acordo —
   * o mesmo cuidado de `aplicarSecoes` em usePropostas: sem o recálculo local,
   * o aviso de "contrato sem cláusula" só sumiria na próxima recarga da lista.
   */
  const aplicarClausulas = useCallback((contratoId: string, doContrato: ClausulaContrato[]) => {
    setClausulas((prev) => [...prev.filter((c) => c.contratoId !== contratoId), ...doContrato]);
    const comTexto = doContrato.filter((c) => c.corpo.trim() !== '').length;
    setContratos((prev) =>
      prev.map((c) => (c.id === contratoId ? { ...c, qtdClausulas: comTexto } : c))
    );
  }, []);

  const clausulasDe = useCallback(
    (contratoId: string) => clausulas.filter((c) => c.contratoId === contratoId),
    [clausulas]
  );

  /**
   * Gera o contrato de uma proposta aprovada — a ÚNICA criação de contrato que
   * existe. Sem atualização otimista: o número, as cláusulas herdadas e o
   * objeto nascem no servidor, e adivinhá-los aqui mostraria um contrato que
   * ainda não existe.
   */
  const handleGerarDaProposta = useCallback(async (
    propostaId: string,
    payload: Record<string, unknown> = {}
  ) => {
    try {
      const criado = await contratosService.gerarDaProposta(propostaId, payload);
      setContratos((prev) => [criado, ...prev]);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao gerar o contrato.', err.message);
      return null;
    }
  }, [toast]);

  const handleUpdateContrato = useCallback(async (id: string, patch: Partial<EdicaoContrato>) => {
    try {
      const atualizado = await contratosService.update(id, patch);
      setContratos((prev) => prev.map((c) => (c.id === id ? atualizado : c)));
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar o contrato.', err.message);
      return false;
    }
  }, [toast]);

  const handleUpdateStatusContrato = useCallback(async (
    id: string,
    status: StatusContrato,
    dataAssinatura?: string
  ) => {
    const { aplicar, desfazer } = comRollback(setContratos);
    aplicar((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      const marcos = await contratosService.updateStatus(id, status, dataAssinatura);
      // A data de assinatura sai do banco, não de um palpite local: é a RPC de
      // status que decide se ela é gravada, mantida ou apagada.
      setContratos((prev) => prev.map((c) => (c.id === id ? { ...c, ...marcos } : c)));
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao alterar a situação do contrato.', err.message);
      return false;
    }
  }, [toast]);

  const handleDeleteContrato = useCallback(async (id: string) => {
    const lista = comRollback(setContratos);
    const filhas = comRollback(setClausulas);
    lista.aplicar((prev) => prev.filter((c) => c.id !== id));
    filhas.aplicar((prev) => prev.filter((c) => c.contratoId !== id));
    try {
      await contratosService.remove(id);
      detalhesCarregados.current.delete(id);
      return true;
    } catch (err: any) {
      lista.desfazer();
      filhas.desfazer();
      toast.error('Falha ao excluir o contrato.', err.message);
      return false;
    }
  }, [toast]);

  // --- CLÁUSULAS ---

  const handleAddClausula = useCallback(async (contratoId: string, titulo: string) => {
    const atuais = clausulasDe(contratoId);
    try {
      const criada = await contratoClausulasService.add({ contratoId, titulo }, atuais);
      aplicarClausulas(contratoId, [...atuais, criada]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao adicionar a cláusula.', err.message);
      return null;
    }
  }, [aplicarClausulas, clausulasDe, toast]);

  const handleInserirModeloNoContrato = useCallback(async (
    contratoId: string,
    modelo: ModeloTexto
  ) => {
    const atuais = clausulasDe(contratoId);
    try {
      const criada = await contratoClausulasService.apartirDoModelo(contratoId, modelo, atuais);
      aplicarClausulas(contratoId, [...atuais, criada]);
      return criada;
    } catch (err: any) {
      toast.error('Falha ao inserir o modelo no contrato.', err.message);
      return null;
    }
  }, [aplicarClausulas, clausulasDe, toast]);

  const handleUpdateClausula = useCallback(async (
    id: string,
    patch: Partial<Pick<ClausulaContrato, 'titulo' | 'corpo'>>
  ) => {
    const alvo = clausulas.find((c) => c.id === id);
    if (!alvo) return false;
    const anteriores = clausulasDe(alvo.contratoId);
    aplicarClausulas(alvo.contratoId, anteriores.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      const atualizada = await contratoClausulasService.update(id, patch);
      aplicarClausulas(alvo.contratoId, anteriores.map((c) => (c.id === id ? atualizada : c)));
      return true;
    } catch (err: any) {
      aplicarClausulas(alvo.contratoId, anteriores);
      toast.error('Falha ao salvar a cláusula.', err.message);
      return false;
    }
  }, [aplicarClausulas, clausulas, clausulasDe, toast]);

  const handleRemoveClausula = useCallback(async (id: string) => {
    const alvo = clausulas.find((c) => c.id === id);
    if (!alvo) return;
    const anteriores = clausulasDe(alvo.contratoId);
    aplicarClausulas(alvo.contratoId, anteriores.filter((c) => c.id !== id));
    try {
      await contratoClausulasService.remove(id);
    } catch (err: any) {
      aplicarClausulas(alvo.contratoId, anteriores);
      toast.error('Falha ao remover a cláusula.', err.message);
    }
  }, [aplicarClausulas, clausulas, clausulasDe, toast]);

  const handleReordenarClausula = useCallback(async (id: string, direcao: -1 | 1) => {
    const alvo = clausulas.find((c) => c.id === id);
    if (!alvo) return;
    const ordenadas = clausulasDe(alvo.contratoId).sort((a, b) => a.ordem - b.ordem);
    const i = ordenadas.findIndex((c) => c.id === id);
    const vizinha = ordenadas[i + direcao];
    if (!vizinha) return;

    const anteriores = clausulasDe(alvo.contratoId);
    aplicarClausulas(
      alvo.contratoId,
      anteriores.map((c) => {
        if (c.id === alvo.id) return { ...c, ordem: vizinha.ordem };
        if (c.id === vizinha.id) return { ...c, ordem: alvo.ordem };
        return c;
      })
    );
    try {
      await contratoClausulasService.trocarOrdem(alvo, vizinha);
    } catch (err: any) {
      aplicarClausulas(alvo.contratoId, anteriores);
      toast.error('Falha ao reordenar as cláusulas.', err.message);
    }
  }, [aplicarClausulas, clausulas, clausulasDe, toast]);

  return useMemo(() => ({
    contratos,
    clausulas,
    loading,
    carregandoDetalhe,
    carregarClausulas,
    handleGerarDaProposta,
    handleUpdateContrato,
    handleUpdateStatusContrato,
    handleDeleteContrato,
    handleAddClausula,
    handleInserirModeloNoContrato,
    handleUpdateClausula,
    handleRemoveClausula,
    handleReordenarClausula,
  }), [contratos, clausulas, loading, carregandoDetalhe, carregarClausulas,
       handleGerarDaProposta, handleUpdateContrato, handleUpdateStatusContrato, handleDeleteContrato,
       handleAddClausula, handleInserirModeloNoContrato, handleUpdateClausula, handleRemoveClausula,
       handleReordenarClausula]);
}
