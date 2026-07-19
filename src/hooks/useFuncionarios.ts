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

  const handleAddFuncionario = async (func: Funcionario) => {
    try {
      const created = await funcionariosService.add(func);
      setFuncionarios((prev) => [created, ...prev]);
    } catch (err: any) {
      toast.error('Falha ao salvar funcionário.', err.message);
    }
  };

  const handleUpdateStatusFuncionario = async (id: string, status: Funcionario['status']) => {
    const previous = funcionarios;
    setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    try {
      await funcionariosService.updateStatus(id, status);
    } catch (err: any) {
      setFuncionarios(previous);
      toast.error('Falha ao atualizar status.', err.message);
    }
  };

  const handleUpdateSalarioFuncionario = async (id: string, salarioBase: number | null) => {
    const previous = funcionarios;
    setFuncionarios((prev) => prev.map((f) => (f.id === id ? { ...f, salarioBase: salarioBase ?? undefined } : f)));
    try {
      await funcionariosService.updateSalario(id, salarioBase);
    } catch (err: any) {
      setFuncionarios(previous);
      toast.error('Falha ao atualizar salário.', err.message);
    }
  };

  const handleDeleteFuncionario = async (id: string) => {
    const previous = funcionarios;
    setFuncionarios((prev) => prev.filter((f) => f.id !== id));
    try {
      await funcionariosService.remove(id);
    } catch (err: any) {
      setFuncionarios(previous);
      toast.error('Falha ao excluir funcionário.', err.message);
    }
  };

  return {
    funcionarios,
    loading,
    handleAddFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
    handleDeleteFuncionario,
  };
}
