import { useState } from 'react';
import { Cliente } from '../types';
import { clientesService } from '../services/clientesService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

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
export function useClientes(ativo = true) {
  const { toast } = useFeedback();
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => clientesService.list(),
    aoChegar: setClientes,
    aoLimpar: () => setClientes([]),
    erro: 'Falha ao carregar clientes.',
  });

  const handleAddCliente = async (cliente: Cliente) => {
    try {
      const created = await clientesService.add(cliente);
      setClientes((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar cliente.', err.message);
    }
  };

  const handleUpdateCliente = async (cliente: Cliente): Promise<Cliente | null> => {
    try {
      const updated = await clientesService.update(cliente);
      setClientes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar cliente.', err.message);
      return null;
    }
  };

  const handleDeleteCliente = async (id: string) => {
    const { aplicar, desfazer } = comRollback(setClientes);
    aplicar((prev) => prev.filter((c) => c.id !== id));
    try {
      await clientesService.remove(id);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao excluir cliente.', err.message);
    }
  };

  return { clientes, loading, handleAddCliente, handleUpdateCliente, handleDeleteCliente };
}
