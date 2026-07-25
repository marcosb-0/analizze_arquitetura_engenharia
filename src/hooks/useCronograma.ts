import { useEffect, useState } from 'react';
import { EdicaoEtapa, EtapaCronograma, EtapaOrcamentoVinculo } from '../types';
import { cronogramaService } from '../services/cronogramaService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useCronograma() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [cronograma, setCronograma] = useState<EtapaCronograma[]>([]);
  const [vinculos, setVinculos] = useState<EtapaOrcamentoVinculo[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshCronograma = () => cronogramaService.list().then(setCronograma).catch(() => {});

  useEffect(() => {
    if (!session) {
      setCronograma([]);
      setVinculos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([cronogramaService.list(), cronogramaService.listVinculos()])
      .then(([etapas, vinc]) => {
        setCronograma(etapas);
        setVinculos(vinc);
      })
      .catch((err) => toast.error('Falha ao carregar cronograma.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

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
    const previous = vinculos;
    setVinculos((prev) => prev.filter((v) => v.id !== id));
    try {
      await cronogramaService.removeVinculo(id);
    } catch (err: any) {
      setVinculos(previous);
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
