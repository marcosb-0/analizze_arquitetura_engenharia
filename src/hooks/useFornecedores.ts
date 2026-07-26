import { useEffect, useState } from 'react';
import { Fornecedor, CompraFornecedor } from '../types';
import { fornecedoresService } from '../services/fornecedoresService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

/** Keeps the in-memory list in the same alphabetical order the service returns. */
function sortByEmpresa(list: Fornecedor[]): Fornecedor[] {
  return [...list].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

/**
 * `ativo` adia a busca até a aba que precisa destes dados ser aberta.
 *
 * Os 20 hooks disparavam juntos no login, independentemente do papel e da aba:
 * um usuário de `campo`, que só enxerga Indicadores e Obras, buscava catálogo,
 * financeiro, propostas e acessos — a maioria voltando vazia pela RLS. Eram ~20
 * idas ao servidor antes do primeiro pixel útil.
 *
 * Uma vez ativo, continua ativo (ver App.tsx): voltar a uma aba já visitada não
 * refaz a busca.
 */
export function useFornecedores(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !ativo) {
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
  }, [session?.user.id, ativo]);

  /**
   * Blocks a duplicate before the DB's unique index does, so the user gets the
   * name of the conflicting supplier instead of a raw constraint violation.
   */
  const rejectDuplicateDocumento = async (forn: Fornecedor): Promise<boolean> => {
    if (!forn.cpfCnpj.trim()) return false;
    const existing = await fornecedoresService.findByDocumento(forn.cpfCnpj, forn.id);
    if (!existing) return false;
    toast.error(
      `${forn.tipoPessoa} já cadastrado.`,
      `O documento ${forn.cpfCnpj} já pertence a "${existing.empresa}".`
    );
    return true;
  };

  const handleAddFornecedor = async (forn: Fornecedor): Promise<Fornecedor | null> => {
    try {
      if (await rejectDuplicateDocumento(forn)) return null;
      const created = await fornecedoresService.add(forn);
      setFornecedores((prev) => sortByEmpresa([created, ...prev]));
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar fornecedor.', err.message);
      return null;
    }
  };

  const handleUpdateFornecedor = async (forn: Fornecedor): Promise<Fornecedor | null> => {
    try {
      if (await rejectDuplicateDocumento(forn)) return null;
      const updated = await fornecedoresService.update(forn);
      setFornecedores((prev) => sortByEmpresa(prev.map((f) => (f.id === updated.id ? updated : f))));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar fornecedor.', err.message);
      return null;
    }
  };

  /** Soft delete/restore — the default way to retire a supplier. */
  const handleSetAtivoFornecedor = async (id: string, ativo: boolean) => {
    const previous = fornecedores;
    setFornecedores((prev) => prev.map((f) => (f.id === id ? { ...f, ativo } : f)));
    try {
      await fornecedoresService.setAtivo(id, ativo);
    } catch (err: any) {
      setFornecedores(previous);
      toast.error(ativo ? 'Falha ao reativar fornecedor.' : 'Falha ao inativar fornecedor.', err.message);
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
      throw err;
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

  return {
    fornecedores,
    loading,
    handleAddFornecedor,
    handleUpdateFornecedor,
    handleSetAtivoFornecedor,
    handleDeleteFornecedor,
    handleAddCompra,
    handleTogglePago,
  };
}
