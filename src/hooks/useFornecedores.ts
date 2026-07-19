import { useEffect, useState } from 'react';
import { Fornecedor, CompraFornecedor } from '../types';
import { fornecedoresService } from '../services/fornecedoresService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useFornecedores() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setFornecedores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fornecedoresService
      .list()
      .then(setFornecedores)
      .catch((err) => toast.error('Falha ao carregar fornecedores.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddFornecedor = async (forn: Fornecedor) => {
    try {
      const created = await fornecedoresService.add(forn);
      setFornecedores((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar fornecedor.', err.message);
    }
  };

  const handleUpdateFornecedor = async (forn: Fornecedor): Promise<Fornecedor | null> => {
    try {
      const updated = await fornecedoresService.update(forn);
      setFornecedores((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar fornecedor.', err.message);
      return null;
    }
  };

  const handleDeleteFornecedor = async (id: string) => {
    const previous = fornecedores;
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    try {
      await fornecedoresService.remove(id);
    } catch (err: any) {
      setFornecedores(previous);
      toast.error('Falha ao excluir fornecedor.', err.message);
    }
  };

  const handleAddCompra = async (fornId: string, compra: CompraFornecedor) => {
    const previous = fornecedores;
    setFornecedores((prev) =>
      prev.map((f) => (f.id === fornId ? { ...f, historicoCompras: [compra, ...f.historicoCompras] } : f))
    );
    try {
      await fornecedoresService.addCompra(fornId, compra);
    } catch (err: any) {
      setFornecedores(previous);
      toast.error('Falha ao registrar compra.', err.message);
    }
  };

  const handleTogglePago = async (fornId: string, compraId: string) => {
    const previous = fornecedores;
    const fornecedor = fornecedores.find((f) => f.id === fornId);
    const compra = fornecedor?.historicoCompras.find((c) => c.id === compraId);
    if (!compra) return;

    setFornecedores((prev) =>
      prev.map((f) =>
        f.id === fornId
          ? { ...f, historicoCompras: f.historicoCompras.map((c) => (c.id === compraId ? { ...c, pago: !c.pago } : c)) }
          : f
      )
    );
    try {
      await fornecedoresService.togglePago(compraId, !compra.pago);
    } catch (err: any) {
      setFornecedores(previous);
      toast.error('Falha ao atualizar pagamento.', err.message);
    }
  };

  return { fornecedores, loading, handleAddFornecedor, handleUpdateFornecedor, handleDeleteFornecedor, handleAddCompra, handleTogglePago };
}
