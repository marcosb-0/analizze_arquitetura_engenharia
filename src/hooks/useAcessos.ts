import { useEffect, useState } from 'react';
import { Acesso, RoleAcesso } from '../types';
import { acessosService } from '../services/acessosService';
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
export function useAcessos(ativo = true) {
  const { toast } = useFeedback();
  const { session, role } = useAuth();
  const userId = session?.user.id;
  const [acessos, setAcessos] = useState<Acesso[]>([]);
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
    if (!userId || !ativo || role !== 'admin') {
      setAcessos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => acessosService.list(),
      setAcessos,
      (err) => toast.error('Falha ao carregar acessos.', err.message),
      () => setLoading(false)
    );
  }, [userId, role, ativo, toast]);

  const handleUpdateRole = async (id: string, newRole: RoleAcesso) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, role: newRole } : a)));
    try {
      await acessosService.updateRole(id, newRole);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar perfil de acesso.', err.message);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
    try {
      await acessosService.updateActive(id, active);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao atualizar status de acesso.', err.message);
    }
  };

  const handleUpdateFuncionarioLink = async (id: string, funcionarioId: string | null) => {
    const { aplicar, desfazer } = comRollback(setAcessos);
    aplicar((prev) => prev.map((a) => (a.id === id ? { ...a, funcionarioId: funcionarioId ?? undefined } : a)));
    try {
      await acessosService.updateFuncionarioLink(id, funcionarioId);
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao vincular funcionário.', err.message);
    }
  };

  return { acessos, loading, handleUpdateRole, handleToggleActive, handleUpdateFuncionarioLink };
}
