import { useEffect, useState } from 'react';
import { Funcionario } from '../types';
import { funcionariosService } from '../services/funcionariosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useFuncionarios() {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setFuncionarios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    funcionariosService
      .list()
      .then(setFuncionarios)
      .catch((err) => toast.error('Falha ao carregar funcionários.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handleAddFuncionario = async (func: Funcionario): Promise<Funcionario | null> => {
    try {
      const created = await funcionariosService.add(func);
      setFuncionarios((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar funcionário.', err.message);
      return null;
    }
  };

  const handleUpdateFuncionario = async (func: Funcionario): Promise<Funcionario | null> => {
    try {
      const updated = await funcionariosService.update(func);
      setFuncionarios((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar funcionário.', err.message);
      return null;
    }
  };

  const handleUpdateStatusFuncionario = async (id: string, status: Funcionario['status']): Promise<boolean> => {
    const previous = funcionarios;
    setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    try {
      await funcionariosService.updateStatus(id, status);
      return true;
    } catch (err: any) {
      setFuncionarios(previous);
      toast.error('Falha ao atualizar status.', err.message);
      return false;
    }
  };

  const handleUpdateSalarioFuncionario = async (id: string, salarioBase: number | null): Promise<boolean> => {
    const previous = funcionarios;
    setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, salarioBase: salarioBase ?? undefined } : f)));
    try {
      await funcionariosService.updateSalario(id, salarioBase);
      return true;
    } catch (err: any) {
      setFuncionarios(previous);
      toast.error('Falha ao atualizar salário.', err.message);
      return false;
    }
  };

  return {
    funcionarios,
    loading,
    handleAddFuncionario,
    handleUpdateFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
  };
}
