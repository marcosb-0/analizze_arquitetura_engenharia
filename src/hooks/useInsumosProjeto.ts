import { useCallback, useMemo, useState } from 'react';
import { InsumoProjeto, AjustePreco } from '../types';
import { insumosProjetoService, NovoInsumoProjeto } from '../services/insumosProjetoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/**
 * Quantitativo de insumos por obra. Alterações de quantidade ou de ajuste
 * recalculam `itens_orcamento.valor_orcado` por trigger no banco — por isso
 * todo handler devolve um sinal para quem precisa reler o orçamento
 * (`refreshOrcamentos` no App).
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useInsumosProjeto(ativo = true) {
  const { toast } = useFeedback();
  const [insumosProjeto, setInsumosProjeto] = useState<InsumoProjeto[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => insumosProjetoService.list(),
    aoChegar: setInsumosProjeto,
    aoLimpar: () => setInsumosProjeto([]),
    erro: 'Falha ao carregar insumos das obras.',
  });

  const substituir = useCallback(
    (item: InsumoProjeto) => setInsumosProjeto((prev) => prev.map((i) => (i.id === item.id ? item : i))),
    []
  );

  const handleAddInsumoProjeto = useCallback(async (novo: NovoInsumoProjeto) => {
    try {
      const criado = await insumosProjetoService.add(novo);
      setInsumosProjeto((prev) => [...prev, criado]);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao registrar insumo na obra.', err.message);
      return null;
    }
  }, [toast]);

  /**
   * Acréscimo ou desconto neste orçamento. O preço de referência do catálogo
   * permanece exatamente como está — só a linha desta obra muda.
   */
  const handleAjustarPrecoInsumo = useCallback(async (id: string, ajuste: AjustePreco) => {
    try {
      const atualizado = await insumosProjetoService.atualizarAjuste(id, ajuste);
      substituir(atualizado);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao ajustar o preço do insumo.', err.message);
      return null;
    }
  }, [substituir, toast]);

  const handleAjustarQuantidadeInsumo = useCallback(async (id: string, quantidade: number) => {
    try {
      const atualizado = await insumosProjetoService.atualizarQuantidade(id, quantidade);
      substituir(atualizado);
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao alterar a quantidade.', err.message);
      return null;
    }
  }, [substituir, toast]);

  const handleRessincronizarBase = useCallback(async (id: string, novaBase: number) => {
    try {
      const atualizado = await insumosProjetoService.ressincronizarBase(id, novaBase);
      substituir(atualizado);
      toast.success('Preço base atualizado com o catálogo.', 'O ajuste desta obra foi mantido.');
      return atualizado;
    } catch (err: any) {
      toast.error('Falha ao ressincronizar o preço base.', err.message);
      return null;
    }
  }, [substituir, toast]);

  const handleRemoveInsumoProjeto = useCallback(async (id: string) => {
    const { aplicar, desfazer } = comRollback(setInsumosProjeto);
    aplicar((prev) => prev.filter((i) => i.id !== id));
    try {
      await insumosProjetoService.remove(id);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover o insumo da obra.', err.message);
      return false;
    }
  }, [toast]);

  const refreshInsumosProjeto = useCallback(
    () => insumosProjetoService.list().then(setInsumosProjeto).catch(avisoRefetch(toast, 'os insumos da obra')),
    [toast]
  );

  return useMemo(() => ({
    insumosProjeto,
    loading,
    handleAddInsumoProjeto,
    handleAjustarPrecoInsumo,
    handleAjustarQuantidadeInsumo,
    handleRessincronizarBase,
    handleRemoveInsumoProjeto,
    refreshInsumosProjeto,
  }), [insumosProjeto, loading, handleAddInsumoProjeto, handleAjustarPrecoInsumo, handleAjustarQuantidadeInsumo, handleRessincronizarBase, handleRemoveInsumoProjeto, refreshInsumosProjeto]);
}
