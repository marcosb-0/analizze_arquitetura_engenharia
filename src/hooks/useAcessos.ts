import { useCallback, useMemo, useState } from 'react';
import { Acesso, RoleAcesso } from '../types';
import { acessosService } from '../services/acessosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useAcessos(ativo = true) {
  const { toast } = useFeedback();
  const { role } = useAuth();
  const [acessos, setAcessos] = useState<Acesso[]>([]);

  const { loading } = useCarregamento({
    ativo,
    // Gestão de Acessos é só de `admin`; para os demais papéis a RLS devolveria
    // vazio de qualquer forma, então nem chega a ir ao servidor.
    permitido: role === 'admin',
    buscar: () => acessosService.list(),
    aoChegar: setAcessos,
    aoLimpar: () => setAcessos([]),
    erro: 'Falha ao carregar acessos.',
  });

  const handleUpdateRole = useCallback(async (id: string, newRole: RoleAcesso) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, role: newRole } : a)));
    try {
      await acessosService.updateRole(id, newRole);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar perfil de acesso.', err.message);
    }
  }, [toast]);

  const handleToggleActive = useCallback(async (id: string, active: boolean) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
    try {
      await acessosService.updateActive(id, active);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar status de acesso.', err.message);
    }
  }, [toast]);

  const handleUpdateFuncionarioLink = useCallback(async (id: string, funcionarioId: string | null) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, funcionarioId: funcionarioId ?? undefined } : a)));
    try {
      await acessosService.updateFuncionarioLink(id, funcionarioId);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao vincular funcionário.', err.message);
    }
  }, [toast]);

  return useMemo(() => ({ acessos, loading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink }), [acessos, loading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink]);
}
