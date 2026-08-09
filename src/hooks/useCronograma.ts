import { useCallback, useMemo, useState } from 'react';
import {
  EdicaoEtapa,
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  Dependencia,
  MudancasCronograma,
} from '../types';
import { cronogramaService, versaoDoCronograma } from '../services/cronogramaService';
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
  const [dependencias, setDependencias] = useState<Dependencia[]>([]);

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
            .then(([etapas, vinc, deps]) => {
              setCronograma(etapas);
              setVinculos(vinc);
              setDependencias(deps);
            })
            .catch(avisoRefetch(toast, 'o cronograma'))
        : Promise.resolve(),
    [obraId, toast]
  );

  const { loading } = useCarregamento({
    ativo,
    escopo: obraId,
    buscar: () => cronogramaService.listComVinculos(obraId!),
    aoChegar: ([etapas, vinc, deps]) => {
      setCronograma(etapas);
      setVinculos(vinc);
      setDependencias(deps);
    },
    aoLimpar: () => {
      setCronograma([]);
      setVinculos([]);
      setDependencias([]);
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

  /**
   * A escrita em LOTE — reordenar a EAP e, a partir da Fase 3, reagendar as
   * sucessoras de uma barra arrastada.
   *
   * Sem otimismo, e de propósito: o retorno da RPC é autoritativo (traz
   * `wbsCodigo`, `nivel`, `ehFolha` e `status` recalculados pela view), e um
   * palpite local teria que reimplementar a numeração da árvore só para ser
   * descartado meio segundo depois. `montarArvore` cobre o caso em que vale a
   * pena antecipar — a prévia DURANTE o arraste, que não escreve nada.
   *
   * Em falha, relê: o erro mais provável é o conflito de versão, e continuar
   * editando em cima de um estado que o servidor já recusou produz o segundo
   * conflito em seguida.
   */
  const handleAplicarCronograma = useCallback(async (mudancas: MudancasCronograma): Promise<boolean> => {
    if (!obraId) return false;
    const vazio =
      !mudancas.etapas?.length &&
      !mudancas.ordens?.length &&
      !mudancas.depCriadas?.length &&
      !mudancas.depRemovidas?.length;
    if (vazio) return true;
    try {
      const resultado = await cronogramaService.aplicar(
        obraId,
        mudancas,
        versaoDoCronograma(cronograma)
      );
      setCronograma(resultado.etapas);
      setDependencias(resultado.dependencias);
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar o cronograma.', err.message);
      await refreshCronograma();
      return false;
    }
  }, [obraId, cronograma, refreshCronograma, toast]);

  /**
   * Congela o plano vigente como linha de base. Relê depois porque as colunas
   * `baseline_*` vêm da view — sem o refetch a barra cinza só apareceria na
   * próxima abertura da obra.
   */
  const handleSalvarBaseline = useCallback(async (): Promise<boolean> => {
    if (!obraId) return false;
    try {
      await cronogramaService.salvarBaseline(obraId);
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao salvar a linha de base.', err.message);
      return false;
    }
  }, [obraId, refreshCronograma, toast]);

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
    dependencias,
    loading,
    handleAddEtapa,
    handleUpdateEtapa,
    handleRemoveEtapa,
    handleAplicarCronograma,
    handleSalvarBaseline,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  }), [cronograma, vinculos, dependencias, loading, handleAddEtapa, handleUpdateEtapa, handleRemoveEtapa, handleAplicarCronograma, handleSalvarBaseline, handleAddVinculo, handleRemoveVinculo, refreshCronograma]);
}
