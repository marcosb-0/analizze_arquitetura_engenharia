import { useEffect, useState } from 'react';
import { Cliente } from '../types';
import { clientesService } from '../services/clientesService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useClientes() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setClientes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    clientesService
      .list()
      .then(setClientes)
      .catch((err) => toast.error('Falha ao carregar clientes.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddCliente = async (cliente: Cliente) => {
    try {
      const created = await clientesService.add(cliente);
      setClientes((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar cliente.', err.message);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    const previous = clientes;
    setClientes((prev) => prev.filter((c) => c.id !== id));
    try {
      await clientesService.remove(id);
    } catch (err: any) {
      setClientes(previous);
      toast.error('Falha ao excluir cliente.', err.message);
    }
  };

  return { clientes, loading, handleAddCliente, handleDeleteCliente };
}
