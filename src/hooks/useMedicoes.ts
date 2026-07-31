import { useEffect, useState } from 'react';
import { MedicaoObra } from '../types';
import { medicoesService } from '../services/medicoesService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { comCancelamento } from './comCancelamento';
import { avisoRefetch } from './avisoRefetch';

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
export function useMedicoes(ativo = true) {
  const { toast } = useFeedback();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [medicoes, setMedicoes] = useState<MedicaoObra[]>([]);
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
      setMedicoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return comCancelamento(
      () => medicoesService.list(),
      setMedicoes,
      (err) => toast.error('Falha ao carregar medições.', err.message),
      () => setLoading(false)
    );
  }, [userId, ativo, toast]);

  const refreshMedicoes = () => medicoesService.list().then(setMedicoes).catch(avisoRefetch(toast, 'as medições'));

  /**
   * `MedicaoObra | null` explícito, e não o `undefined` implícito de antes: as
   * duas saídas de falha (sem sessão, erro do servidor) caíam no fim da função
   * sem `return`, então o tipo inferido era `MedicaoObra | undefined` por
   * acidente. Quem chama já tratava (`App.tsx` faz `if (!created) return false`),
   * mas o contrato agora diz o que acontece em vez de deixar deduzir.
   */
  const handleAddMedicao = async (
    med: { projetoId: string; etapaId: string; percentualMedido: number; observacoes: string },
    fotos: File[]
  ): Promise<MedicaoObra | null> => {
    if (!session) return null;
    try {
      const created = await medicoesService.add(med, fotos, session.user.id);
      setMedicoes((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao registrar medição.', err.message);
      return null;
    }
  };

  const handleFotoUrlMedicao = async (storagePath: string): Promise<string | null> => {
    try {
      return await medicoesService.fotoUrl(storagePath);
    } catch {
      return null;
    }
  };

  // 'overrun' means the etapa would exceed 100% — the UI re-calls with
  // permitirOverrun=true after an explicit confirm.
  const handleAprovarMedicao = async (
    medicaoId: string,
    permitirOverrun = false
  ): Promise<'ok' | 'overrun' | 'error'> => {
    try {
      await medicoesService.aprovar(medicaoId, permitirOverrun);
      await refreshMedicoes();
      return 'ok';
    } catch (err: any) {
      if (!permitirOverrun && typeof err?.message === 'string' && err.message.includes('ultrapassar 100%')) {
        return 'overrun';
      }
      toast.error('Falha ao aprovar medição.', err.message);
      return 'error';
    }
  };

  const handleRejeitarMedicao = async (medicaoId: string, motivo: string): Promise<boolean> => {
    try {
      await medicoesService.rejeitar(medicaoId, motivo);
      await refreshMedicoes();
      return true;
    } catch (err: any) {
      toast.error('Falha ao rejeitar medição.', err.message);
      return false;
    }
  };

  return { medicoes, loading, handleAddMedicao, handleFotoUrlMedicao, handleAprovarMedicao, handleRejeitarMedicao, refreshMedicoes };
}
