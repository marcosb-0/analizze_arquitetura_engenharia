import { useEffect, useState } from 'react';
import { Acesso, RoleAcesso } from '../types';
import { acessosService } from '../services/acessosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

export function useAcessos() {
  const { toast } = useFeedback();
  const { session, role } = useAuth();
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || role !== 'admin') {
      setAcessos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    acessosService
      .list()
      .then(setAcessos)
      .catch((err) => toast.error('Falha ao carregar acessos.', err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, role]);

  const handleUpdateRole = async (id: string, newRole: RoleAcesso) => {
    const previous = acessos;
    setAcessos((prev) => prev.map((a) => (a.id === id ? { ...a, role: newRole } : a)));
    try {
      await acessosService.updateRole(id, newRole);
    } catch (err: any) {
      setAcessos(previous);
      toast.error('Falha ao atualizar perfil de acesso.', err.message);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const previous = acessos;
    setAcessos((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
    try {
      await acessosService.updateActive(id, active);
    } catch (err: any) {
      setAcessos(previous);
      toast.error('Falha ao atualizar status de acesso.', err.message);
    }
  };

  const handleUpdateFuncionarioLink = async (id: string, funcionarioId: string | null) => {
    const previous = acessos;
    setAcessos((prev) => prev.map((a) => (a.id === id ? { ...a, funcionarioId: funcionarioId ?? undefined } : a)));
    try {
      await acessosService.updateFuncionarioLink(id, funcionarioId);
    } catch (err: any) {
      setAcessos(previous);
      toast.error('Falha ao vincular funcionário.', err.message);
    }
  };

  return { acessos, loading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink };
}
