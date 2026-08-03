import { useCallback, useMemo, useState } from 'react';
import { Fornecedor, CompraFornecedor } from '../types';
import { fornecedoresService } from '../services/fornecedoresService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** Keeps the in-memory list in the same alphabetical order the service returns. */
function sortByEmpresa(list: Fornecedor[]): Fornecedor[] {
  return [...list].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useFornecedores(ativo = true) {
  const { toast } = useFeedback();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => fornecedoresService.list(),
    aoChegar: setFornecedores,
    aoLimpar: () => setFornecedores([]),
    erro: 'Falha ao carregar fornecedores.',
  });

  /**
   * Blocks a duplicate before the DB's unique index does, so the user gets the
   * name of the conflicting supplier instead of a raw constraint violation.
   */
  const rejectDuplicateDocumento = useCallback(async (forn: Fornecedor): Promise<boolean> => {
    if (!forn.cpfCnpj.trim()) return false;
    const existing = await fornecedoresService.findByDocumento(forn.cpfCnpj, forn.id);
    if (!existing) return false;
    toast.error(
      `${forn.tipoPessoa} já cadastrado.`,
      `O documento ${forn.cpfCnpj} já pertence a "${existing.empresa}".`
    );
    return true;
  }, [toast]);

  const handleAddFornecedor = useCallback(async (forn: Fornecedor): Promise<Fornecedor | null> => {
    try {
      if (await rejectDuplicateDocumento(forn)) return null;
      const created = await fornecedoresService.add(forn);
      setFornecedores((prev) => sortByEmpresa([created, ...prev]));
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar fornecedor.', err.message);
      return null;
    }
  }, [rejectDuplicateDocumento, toast]);

  const handleUpdateFornecedor = useCallback(async (forn: Fornecedor): Promise<Fornecedor | null> => {
    try {
      if (await rejectDuplicateDocumento(forn)) return null;
      const updated = await fornecedoresService.update(forn);
      setFornecedores((prev) => sortByEmpresa(prev.map((f) => (f.id === updated.id ? updated : f))));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar fornecedor.', err.message);
      return null;
    }
  }, [rejectDuplicateDocumento, toast]);

  /** Soft delete/restore — the default way to retire a supplier. */
  const handleSetAtivoFornecedor = useCallback(async (id: string, ativo: boolean) => {
    const { aplicar, desfazer } = comRollback(setFornecedores);
    aplicar((prev) => prev.map((f) => (f.id === id ? { ...f, ativo } : f)));
    try {
      await fornecedoresService.setAtivo(id, ativo);
    } catch (err: any) {
      desfazer();
      toast.error(ativo ? 'Falha ao reativar fornecedor.' : 'Falha ao inativar fornecedor.', err.message);
    }
  }, [toast]);

  const handleDeleteFornecedor = useCallback(async (id: string) => {
    const { aplicar, desfazer } = comRollback(setFornecedores);
    aplicar((prev) => prev.filter((f) => f.id !== id));
    try {
      await fornecedoresService.remove(id);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir fornecedor.', err.message);
    }
  }, [toast]);

  const handleAddCompra = useCallback(async (fornId: string, compra: CompraFornecedor) => {
    const { aplicar, desfazer } = comRollback(setFornecedores);
    aplicar((prev) =>
      prev.map((f) => (f.id === fornId ? { ...f, historicoCompras: [compra, ...f.historicoCompras] } : f))
    );
    try {
      await fornecedoresService.addCompra(fornId, compra);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao registrar compra.', err.message);
      throw err;
    }
  }, [toast]);

  const handleTogglePago = useCallback(async (fornId: string, compraId: string) => {
    const { aplicar, desfazer } = comRollback(setFornecedores);
    const fornecedor = fornecedores.find((f) => f.id === fornId);
    const compra = fornecedor?.historicoCompras.find((c) => c.id === compraId);
    if (!compra) return;

    aplicar((prev) =>
      prev.map((f) =>
        f.id === fornId
          ? { ...f, historicoCompras: f.historicoCompras.map((c) => (c.id === compraId ? { ...c, pago: !c.pago } : c)) }
          : f
      )
    );
    try {
      await fornecedoresService.togglePago(compraId, !compra.pago);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar pagamento.', err.message);
    }
  }, [fornecedores, toast]);

  return useMemo(() => ({
    fornecedores,
    loading,
    handleAddFornecedor,
    handleUpdateFornecedor,
    handleSetAtivoFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  }), [fornecedores, loading, handleAddFornecedor, handleUpdateFornecedor, handleSetAtivoFornecedor, handleDeleteFornecedor, handleAddCompra, handleTogglePago]);
}
