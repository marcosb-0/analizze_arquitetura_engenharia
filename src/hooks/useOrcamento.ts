import { useEffect, useState } from 'react';
import { ItemOrcamento, AlteracaoOrcamento } from '../types';
import { orcamentoService } from '../services/orcamentoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useOrcamento() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [orcamentos, setOrcamentos] = useState<ItemOrcamento[]>([]);
  const [alteracoesOrcamento, setAlteracoesOrcamento] = useState<AlteracaoOrcamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setOrcamentos([]);
      setAlteracoesOrcamento([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([orcamentoService.list(), orcamentoService.listAlteracoes()])
      .then(([items, altList]) => {
        setOrcamentos(items);
        setAlteracoesOrcamento(altList);
      })
      .catch((err) => toast.error('Falha ao carregar orçamento.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddOrcamentoItem = async (item: ItemOrcamento) => {
    try {
      const created = await orcamentoService.add(item);
      setOrcamentos((prev) => [...prev, created]);
    } catch (err: any) {
      toast.error('Falha ao adicionar item de orçamento.', err.message);
    }
  };

  const handleAddAlteracaoOrcamento = async (alt: AlteracaoOrcamento) => {
    try {
      const created = await orcamentoService.addAlteracao(alt);
      setAlteracoesOrcamento((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao registrar alteração de orçamento.', err.message);
    }
  };

  const refreshOrcamentos = () => orcamentoService.list().then(setOrcamentos).catch(() => {});

  return { orcamentos, alteracoesOrcamento, loading, handleAddOrcamentoItem, handleAddAlteracaoOrcamento, refreshOrcamentos };
}
