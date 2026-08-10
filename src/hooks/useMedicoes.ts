import { useCallback, useMemo, useState } from 'react';
import { MedicaoObra, NovaMedicao } from '../types';
import { medicoesService } from '../services/medicoesService';
import { useFeedback } from '../components/FeedbackContext';
import { useAuth } from '../contexts/AuthContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/**
 * Os boletins da OBRA ABERTA — item 23, peça 2 (§4.2).
 *
 * Era a leitura mais cara do app: três tabelas inteiras, e a do meio cresce como
 * o produto das outras duas. Quem precisa de medição fora do console tem leitura
 * própria e estreita — o painel usa `v_medicao_recente` com limite, o Financeiro
 * usa `useMedicoesAFaturar`.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useMedicoes(ativo = true, obraId: string | null = null) {
  const { toast } = useFeedback();
  // `session` segue aqui por causa da escrita: `medicoesService.add` grava o
  // autor da medição. A leitura não precisa mais dela.
  const { session } = useAuth();
  // `userId` e não `session`: ver a nota em `useCatalogo` — a sessão é recriada a
  // cada renovação de token e trocaria a identidade do handler sem motivo.
  const userId = session?.user.id;
  const [medicoes, setMedicoes] = useState<MedicaoObra[]>([]);

  const { loading } = useCarregamento({
    ativo,
    escopo: obraId,
    buscar: () => medicoesService.list(obraId!),
    aoChegar: setMedicoes,
    aoLimpar: () => setMedicoes([]),
    erro: 'Falha ao carregar medições.',
  });

  // Sem obra aberta não há o que reler — ver a nota gêmea em `useOrcamento`.
  const refreshMedicoes = useCallback(
    () =>
      obraId
        ? medicoesService.list(obraId).then(setMedicoes).catch(avisoRefetch(toast, 'as medições'))
        : Promise.resolve(),
    [obraId, toast]
  );

  /**
   * `MedicaoObra | null` explícito, e não o `undefined` implícito de antes: as
   * duas saídas de falha (sem sessão, erro do servidor) caíam no fim da função
   * sem `return`, então o tipo inferido era `MedicaoObra | undefined` por
   * acidente. Quem chama já tratava (`App.tsx` faz `if (!created) return false`),
   * mas o contrato agora diz o que acontece em vez de deixar deduzir.
   */
  const handleAddMedicao = useCallback(async (
    med: NovaMedicao,
    fotos: File[]
  ): Promise<MedicaoObra | null> => {
    if (!userId) return null;
    try {
      const created = await medicoesService.add(med, fotos, userId);
      setMedicoes((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      toast.error('Falha ao registrar medição.', err.message);
      return null;
    }
  }, [userId, toast]);

  const handleFotoUrlMedicao = useCallback(async (storagePath: string): Promise<string | null> => {
    try {
      return await medicoesService.fotoUrl(storagePath);
    } catch {
      return null;
    }
  }, []);

  // 'overrun' means the etapa would exceed 100% — the UI re-calls with
  // permitirOverrun=true after an explicit confirm.
  const handleAprovarMedicao = useCallback(async (
    medicaoId: string,
    permitirOverrun = false
  ): Promise<'ok' | 'overrun' | 'error'> => {
    try {
      await medicoesService.aprovar(medicaoId, permitirOverrun);
      await refreshMedicoes();
      return 'ok';
    } catch (err: any) {
      // O contrato é o `errcode` 90100 que `fn_aprovar_medicao` levanta
      // (20260815100001). O `includes` continua aqui como rede: a mensagem
      // mudou quando a etapa passou a ter meta em m², e detectar overrun por
      // substring era o tipo de acoplamento que quebra em silêncio — o diálogo
      // de override viraria um toast de erro genérico e o `npm run verify`
      // passaria verde.
      const overrun = err?.code === '90100'
        || (typeof err?.message === 'string' && err.message.includes('ultrapassar 100'));
      if (!permitirOverrun && overrun) {
        return 'overrun';
      }
      toast.error('Falha ao aprovar medição.', err.message);
      return 'error';
    }
  }, [refreshMedicoes, toast]);

  const handleRejeitarMedicao = useCallback(async (medicaoId: string, motivo: string): Promise<boolean> => {
    try {
      await medicoesService.rejeitar(medicaoId, motivo);
      await refreshMedicoes();
      return true;
    } catch (err: any) {
      toast.error('Falha ao rejeitar medição.', err.message);
      return false;
    }
  }, [refreshMedicoes, toast]);

  return useMemo(() => ({ medicoes, loading, handleAddMedicao, handleFotoUrlMedicao, handleAprovarMedicao, handleRejeitarMedicao, refreshMedicoes }), [medicoes, loading, handleAddMedicao, handleFotoUrlMedicao, handleAprovarMedicao, handleRejeitarMedicao, refreshMedicoes]);
}
