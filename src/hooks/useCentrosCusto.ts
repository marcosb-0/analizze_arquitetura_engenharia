import { useCallback, useMemo, useState } from 'react';
import { CentroCusto, CustoPorCentro, NovoCentroCusto, PatchCentroCusto, UsosCentroCusto } from '../types';
import { centrosCustoService } from '../services/centrosCustoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';

/**
 * Centros de custo (20260920015643).
 *
 * A LISTA e o CUSTO são carregados separados de propósito: a árvore é lida por
 * `admin`, `gestao` e `financeiro`, enquanto `fn_custo_por_centro` recusa quem
 * não é `admin`/`financeiro` com erro. Juntá-los num só carregamento faria a
 * árvore inteira sumir da tela de quem só não podia ver os números.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useCentrosCusto(ativo = true) {
  const { toast } = useFeedback();
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => centrosCustoService.list(),
    aoChegar: setCentrosCusto,
    aoLimpar: () => setCentrosCusto([]),
    erro: 'Falha ao carregar os centros de custo.',
  });

  /**
   * Recarrega do servidor em vez de mexer na lista em memória. O banco deriva
   * `nivel`, `caminho` e `tem_filhos` da árvore inteira: criar um filho muda o
   * `temFilhos` do PAI, e mover um nó muda o caminho de toda a subárvore. Um
   * merge otimista aqui erraria a indentação da tela em silêncio.
   */
  const recarregar = useCallback(async () => {
    try {
      setCentrosCusto(await centrosCustoService.list());
    } catch (err: any) {
      toast.error('Falha ao recarregar os centros de custo.', err.message);
    }
  }, [toast]);

  const handleAddCentroCusto = useCallback(async (centro: NovoCentroCusto): Promise<boolean> => {
    try {
      await centrosCustoService.create(centro);
      await recarregar();
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar o centro de custo.', err.message);
      return false;
    }
  }, [recarregar, toast]);

  const handleUpdateCentroCusto = useCallback(async (
    id: string,
    patch: PatchCentroCusto
  ): Promise<boolean> => {
    try {
      await centrosCustoService.update(id, patch);
      await recarregar();
      return true;
    } catch (err: any) {
      toast.error('Falha ao atualizar o centro de custo.', err.message);
      return false;
    }
  }, [recarregar, toast]);

  /**
   * Consulta o que prende o centro. Diferente de `carregarCusto`, o erro aqui
   * SOBE: se a consulta falhar, a tela não pode cair no ramo "dá para excluir" —
   * seria oferecer um botão destrutivo com base numa resposta que não veio.
   */
  const carregarUsosCentroCusto = useCallback(
    (id: string): Promise<UsosCentroCusto> => centrosCustoService.usos(id),
    []
  );

  const handleExcluirCentroCusto = useCallback(async (id: string): Promise<boolean> => {
    try {
      await centrosCustoService.excluir(id);
      await recarregar();
      return true;
    } catch (err: any) {
      // A recusa do banco já vem redigida para o usuário (qual amarra prende o
      // centro e qual é a saída), então ela É a mensagem — não um detalhe
      // técnico embaixo de um texto genérico.
      toast.error('Não foi possível excluir o centro de custo.', err.message);
      return false;
    }
  }, [recarregar, toast]);

  /**
   * Devolve `null` quando o papel não pode ver os números — a tela distingue
   * "sem permissão" de "sem movimento", que são a mesma lista vazia.
   */
  const carregarCusto = useCallback(async (de?: string, ate?: string): Promise<CustoPorCentro[] | null> => {
    try {
      return await centrosCustoService.custoPorCentro(de, ate);
    } catch {
      return null;
    }
  }, []);

  return useMemo(() => ({
    centrosCusto,
    loading,
    handleAddCentroCusto,
    handleUpdateCentroCusto,
    handleExcluirCentroCusto,
    carregarUsosCentroCusto,
    carregarCusto,
  }), [centrosCusto, loading, handleAddCentroCusto, handleUpdateCentroCusto,
       handleExcluirCentroCusto, carregarUsosCentroCusto, carregarCusto]);
}
