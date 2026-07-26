import { useEffect, useState } from 'react';
import { Acesso, RoleAcesso } from '../types';
import { acessosService } from '../services/acessosService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';

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
export function useAcessos(ativo = true) {
  const { toast } = useFeedback();
  const { session, role } = useAuth();
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !ativo || role !== 'admin') {
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
  }, [session?.user.id, role, ativo]);

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
