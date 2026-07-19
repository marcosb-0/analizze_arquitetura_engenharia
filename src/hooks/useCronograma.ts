import { useEffect, useState } from 'react';
import { EtapaCronograma, EtapaOrcamentoVinculo } from '../types';
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

  const handleAddEtapa = async (etapa: EtapaCronograma) => {
    try {
      const created = await cronogramaService.add(etapa);
      setCronograma((prev) => [...prev, created]);
    } catch (err: any) {
      toast.error('Falha ao criar etapa do cronograma.', err.message);
    }
  };

  const handleAddVinculo = async (vinculo: EtapaOrcamentoVinculo) => {
    try {
      const created = await cronogramaService.addVinculo(vinculo);
      setVinculos((prev) => [...prev, created]);
    } catch (err: any) {
      toast.error('Falha ao vincular item de orçamento à etapa.', err.message);
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

  return { cronograma, vinculos, loading, handleAddEtapa, handleAddVinculo, handleRemoveVinculo, refreshCronograma };
}
