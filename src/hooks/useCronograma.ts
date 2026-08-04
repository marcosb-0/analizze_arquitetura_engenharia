import { useCallback, useMemo, useState } from 'react';
import { EdicaoEtapa, EtapaCronograma, EtapaOrcamentoVinculo } from '../types';
import { cronogramaService } from '../services/cronogramaService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/**
 * O cronograma da OBRA ABERTA — item 23, peça 2 (§4.2).
 *
 * A aba de Equipe também lê etapa, mas atravessando obras (a carga de um
 * profissional soma as frentes dele em todas elas). Essa leitura tem hook
 * próprio, `useCargaEquipe`, e não passa por aqui: as duas perguntas são
 * diferentes, e servir as duas do mesmo estado foi o que obrigava a baixar a
 * tabela inteira.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useCronograma(ativo = true, obraId: string | null = null) {
  const { toast } = useFeedback();
  const [cronograma, setCronograma] = useState<EtapaCronograma[]>([]);
  const [vinculos, setVinculos] = useState<EtapaOrcamentoVinculo[]>([]);

  /**
   * Relê as DUAS listas, e não só as etapas como antes.
   *
   * Com a leitura escopada, os vínculos são buscados a partir dos ids das etapas
   * (ver `listComVinculos`): recarregar só as etapas deixaria os vínculos
   * presos ao conjunto anterior. Uma consulta a mais contra um par inconsistente
   * que só se manifesta como peso perdido no avanço físico.
   */
  const refreshCronograma = useCallback(
    () =>
      obraId
        ? cronogramaService
            .listComVinculos(obraId)
            .then(([etapas, vinc]) => {
              setCronograma(etapas);
              setVinculos(vinc);
            })
            .catch(avisoRefetch(toast, 'o cronograma'))
        : Promise.resolve(),
    [obraId, toast]
  );

  const { loading } = useCarregamento({
    ativo,
    escopo: obraId,
    buscar: () => cronogramaService.listComVinculos(obraId!),
    aoChegar: ([etapas, vinc]) => {
      setCronograma(etapas);
      setVinculos(vinc);
    },
    aoLimpar: () => {
      setCronograma([]);
      setVinculos([]);
    },
    erro: 'Falha ao carregar cronograma.',
  });

  // As três escritas de etapa recarregam a view em vez de remendar o estado
  // local: `percentual_executado` e `status` são derivados lá (uma etapa criada
  // com prazo já vencido nasce 'Atrasado', por exemplo).
  const handleAddEtapa = useCallback(async (etapa: EtapaCronograma): Promise<boolean> => {
    try {
      await cronogramaService.add(etapa);
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar etapa do cronograma.', err.message);
      return false;
    }
  }, [refreshCronograma, toast]);

  const handleUpdateEtapa = useCallback(async (id: string, patch: EdicaoEtapa): Promise<boolean> => {
    try {
      await cronogramaService.update(id, patch);
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao atualizar etapa do cronograma.', err.message);
      return false;
    }
  }, [refreshCronograma, toast]);

  const handleRemoveEtapa = useCallback(async (id: string): Promise<boolean> => {
    try {
      await cronogramaService.remove(id);
      // O cascade apaga os vínculos da etapa e os boletins dela — `refreshCronograma`
      // já relê as duas listas.
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao excluir etapa do cronograma.', err.message);
      return false;
    }
  }, [refreshCronograma, toast]);

  const handleAddVinculo = useCallback(async (vinculo: EtapaOrcamentoVinculo): Promise<boolean> => {
    try {
      const created = await cronogramaService.addVinculo(vinculo);
      setVinculos((prev) => [...prev, created]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao vincular item de orçamento à etapa.', err.message);
      return false;
    }
  }, [toast]);

  const handleRemoveVinculo = useCallback(async (id: string) => {
    const { aplicar, desfazer } = comRollback(setVinculos);
    aplicar((prev) => prev.filter((v) => v.id !== id));
    try {
      await cronogramaService.removeVinculo(id);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover vínculo.', err.message);
    }
  }, [toast]);

  return useMemo(() => ({
    cronograma,
    vinculos,
    loading,
    handleAddEtapa,
    handleUpdateEtapa,
    handleRemoveEtapa,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  }), [cronograma, vinculos, loading, handleAddEtapa, handleUpdateEtapa, handleRemoveEtapa, handleAddVinculo, handleRemoveVinculo, refreshCronograma]);
}
