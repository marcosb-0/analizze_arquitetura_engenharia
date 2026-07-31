import { useState } from 'react';
import { EdicaoEtapa, EtapaCronograma, EtapaOrcamentoVinculo } from '../types';
import { cronogramaService } from '../services/cronogramaService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useCronograma(ativo = true) {
  const { toast } = useFeedback();
  const [cronograma, setCronograma] = useState<EtapaCronograma[]>([]);
  const [vinculos, setVinculos] = useState<EtapaOrcamentoVinculo[]>([]);

  const refreshCronograma = () => cronogramaService.list().then(setCronograma).catch(avisoRefetch(toast, 'o cronograma'));

  const { loading } = useCarregamento({
    ativo,
    buscar: () => Promise.all([cronogramaService.list(), cronogramaService.listVinculos()]),
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
  const handleAddEtapa = async (etapa: EtapaCronograma): Promise<boolean> => {
    try {
      await cronogramaService.add(etapa);
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao criar etapa do cronograma.', err.message);
      return false;
    }
  };

  const handleUpdateEtapa = async (id: string, patch: EdicaoEtapa): Promise<boolean> => {
    try {
      await cronogramaService.update(id, patch);
      await refreshCronograma();
      return true;
    } catch (err: any) {
      toast.error('Falha ao atualizar etapa do cronograma.', err.message);
      return false;
    }
  };

  const handleRemoveEtapa = async (id: string): Promise<boolean> => {
    try {
      await cronogramaService.remove(id);
      // O cascade apaga os vínculos da etapa e os boletins dela, então recarrega
      // as duas listas.
      const [etapas, vinc] = await Promise.all([cronogramaService.list(), cronogramaService.listVinculos()]);
      setCronograma(etapas);
      setVinculos(vinc);
      return true;
    } catch (err: any) {
      toast.error('Falha ao excluir etapa do cronograma.', err.message);
      return false;
    }
  };

  const handleAddVinculo = async (vinculo: EtapaOrcamentoVinculo): Promise<boolean> => {
    try {
      const created = await cronogramaService.addVinculo(vinculo);
      setVinculos((prev) => [...prev, created]);
      return true;
    } catch (err: any) {
      toast.error('Falha ao vincular item de orçamento à etapa.', err.message);
      return false;
    }
  };

  const handleRemoveVinculo = async (id: string) => {
    const { aplicar, desfazer } = comRollback(setVinculos);
    aplicar((prev) => prev.filter((v) => v.id !== id));
    try {
      await cronogramaService.removeVinculo(id);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao remover vínculo.', err.message);
    }
  };

  return {
    cronograma,
    vinculos,
    loading,
    handleAddEtapa,
    handleUpdateEtapa,
    handleRemoveEtapa,
    handleAddVinculo,
    handleRemoveVinculo,
    refreshCronograma,
  };
}
