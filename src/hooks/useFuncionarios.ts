import { useEffect, useState } from 'react';
import { Funcionario } from '../types';
import { funcionariosService } from '../services/funcionariosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
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
export function useFuncionarios(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * `userId` em vez de `session` nas dependências, de propósito.
   *
   * O supabase-js cria um OBJETO de sessão novo a cada renovação de token (~1h) e
   * a cada `onAuthStateChange`. Depender de `session` refaria todas as buscas do
   * app de hora em hora, sem nada ter mudado. O id é o que de fato identifica de
   * quem são os dados.
   *
   * Antes isto era um `// eslint-disable-next-line react-hooks/exhaustive-deps`,
   * que calava a regra sem registrar o motivo. Agora a lista está honesta e a
   * regra volta a proteger o efeito.
   */
  useEffect(() => {
    if (!userId || !ativo) {
      setFuncionarios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => funcionariosService.list(),
      setFuncionarios,
      (err) => toast.error('Falha ao carregar funcionários.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

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
  };

  const handleUpdateSalarioFuncionario = async (id: string, salarioBase: number | null): Promise<boolean> => {
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
