import { useEffect, useState } from 'react';
import { InsumoCatalogo, CotacaoFornecedor } from '../types';
import { catalogoService } from '../services/catalogoService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useCatalogo() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [catalogo, setCatalogo] = useState<InsumoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setCatalogo([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    catalogoService
      .list()
      .then(setCatalogo)
      .catch((err) => toast.error('Falha ao carregar catálogo.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddCatalogoItem = async (item: InsumoCatalogo) => {
    try {
      const created = await catalogoService.add(item);
      setCatalogo((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar insumo.', err.message);
    }
  };

  const handleUpdateCatalogoItem = async (item: InsumoCatalogo) => {
    const previous = catalogo;
    setCatalogo((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    try {
      await catalogoService.update(item);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao atualizar insumo.', err.message);
    }
  };

  const handleDeleteCatalogoItem = async (id: string) => {
    const previous = catalogo;
    setCatalogo((prev) => prev.filter((i) => i.id !== id));
    try {
      await catalogoService.remove(id);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao remover insumo.', err.message);
    }
  };

  const handleAddCotacao = async (insumoId: string, quote: CotacaoFornecedor) => {
    const previous = catalogo;
    setCatalogo((prev) =>
      prev.map((i) =>
        i.id === insumoId
          ? { ...i, cotacoesFornecedores: [...(i.cotacoesFornecedores ?? []).filter((q) => q.fornecedorId !== quote.fornecedorId), quote] }
          : i
      )
    );
    try {
      await catalogoService.addCotacao(insumoId, quote);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao registrar cotação.', err.message);
    }
  };

  const handleRemoveCotacao = async (cotacaoId: string) => {
    const previous = catalogo;
    setCatalogo((prev) =>
      prev.map((i) => ({ ...i, cotacoesFornecedores: (i.cotacoesFornecedores ?? []).filter((q) => q.id !== cotacaoId) }))
    );
    try {
      await catalogoService.removeCotacao(cotacaoId);
    } catch (err: any) {
      setCatalogo(previous);
      toast.error('Falha ao remover cotação.', err.message);
    }
  };

  return {
    catalogo,
    loading,
    handleAddCatalogoItem,
    handleUpdateCatalogoItem,
    handleDeleteCatalogoItem,
    handleAddCotacao,
    handleRemoveCotacao,
  };
}
