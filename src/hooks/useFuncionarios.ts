import { useCallback, useMemo, useState } from 'react';
import { Funcionario } from '../types';
import { funcionariosService } from '../services/funcionariosService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useFuncionarios(ativo = true) {
  const { toast } = useFeedback();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => funcionariosService.list(),
    aoChegar: setFuncionarios,
    aoLimpar: () => setFuncionarios([]),
    erro: 'Falha ao carregar funcionários.',
  });

  const handleAddFuncionario = useCallback(async (func: Funcionario): Promise<Funcionario | null> => {
    try {
      const created = await funcionariosService.add(func);
      setFuncionarios((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao salvar funcionário.', err.message);
      return null;
    }
  }, [toast]);

  const handleUpdateFuncionario = useCallback(async (func: Funcionario): Promise<Funcionario | null> => {
    try {
      const updated = await funcionariosService.update(func);
      setFuncionarios((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      return updated;
    } catch (err: any) {
      toast.error('Falha ao atualizar funcionário.', err.message);
      return null;
    }
  }, [toast]);

  const handleUpdateStatusFuncionario = useCallback(async (id: string, status: Funcionario['status']): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setFuncionarios);
    aplicar((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    try {
      await funcionariosService.updateStatus(id, status);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar status.', err.message);
      return false;
    }
  }, [toast]);

  const handleUpdateSalarioFuncionario = useCallback(async (id: string, salarioBase: number | null): Promise<boolean> => {
    const { aplicar, desfazer } = comRollback(setFuncionarios);
    aplicar((prev) => prev.map((f) => (f.id === id ? { ...f, salarioBase: salarioBase ?? undefined } : f)));
    try {
      await funcionariosService.updateSalario(id, salarioBase);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar salário.', err.message);
      return false;
    }
  }, [toast]);

  return useMemo(() => ({
    funcionarios,
    loading,
    handleAddFuncionario,
    handleUpdateFuncionario,
    handleUpdateStatusFuncionario,
    handleUpdateSalarioFuncionario,
  }), [funcionarios, loading, handleAddFuncionario, handleUpdateFuncionario, handleUpdateStatusFuncionario, handleUpdateSalarioFuncionario]);
}
