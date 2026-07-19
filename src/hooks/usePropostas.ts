import { useEffect, useState } from 'react';
import { Proposta, RevisaoProposta } from '../types';
import { propostasService } from '../services/propostasService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function usePropostas() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setPropostas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    propostasService
      .list()
      .then(setPropostas)
      .catch((err) => toast.error('Falha ao carregar propostas.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddProposta = async (prop: Proposta) => {
    try {
      const created = await propostasService.add(prop);
      setPropostas((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar proposta.', err.message);
    }
  };

  const handleUpdateStatusProposta = async (id: string, status: Proposta['status']) => {
    const previous = propostas;
    setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await propostasService.updateStatus(id, status);
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao atualizar status da proposta.', err.message);
    }
  };

  const handleAddRevision = async (id: string, revision: RevisaoProposta) => {
    const previous = propostas;
    setPropostas((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, valorEstimado: revision.valor, revisoes: [...p.revisoes, revision] } : p
      )
    );
    try {
      await propostasService.addRevision(id, revision);
    } catch (err: any) {
      setPropostas(previous);
      toast.error('Falha ao registrar revisão.', err.message);
    }
  };

  return { propostas, loading, handleAddProposta, handleUpdateStatusProposta, handleAddRevision };
}
