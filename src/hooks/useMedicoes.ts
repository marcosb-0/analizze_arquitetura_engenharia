import { useState } from 'react';
import { MedicaoObra } from '../types';
import { medicoesService } from '../services/medicoesService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/** `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento. */
export function useMedicoes(ativo = true) {
  const { toast } = useFeedback();
  // `session` segue aqui por causa da escrita: `medicoesService.add` grava o
  // autor da medição. A leitura não precisa mais dela.
  const { session } = useAuth();
  const [medicoes, setMedicoes] = useState<MedicaoObra[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => medicoesService.list(),
    aoChegar: setMedicoes,
    aoLimpar: () => setMedicoes([]),
    erro: 'Falha ao carregar medições.',
  });

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
