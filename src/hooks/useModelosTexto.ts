import { useCallback, useMemo, useState } from 'react';
import { ModeloTexto, NovoModeloTexto } from '../types';
import { modelosTextoService } from '../services/modelosTextoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { comRollback } from './comRollback';

/**
 * A biblioteca de textos reutilizáveis.
 *
 * Domínio próprio, e não parte de `usePropostas`, porque o dono dela é a
 * empresa e não uma proposta: a mesma lista vai alimentar as cláusulas do
 * contrato. Enfiá-la no hook da proposta obrigaria a recarregá-la a cada
 * proposta aberta e a duplicá-la quando o contrato existir.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useModelosTexto(ativo = true) {
  const { toast } = useFeedback();
  const [modelos, setModelos] = useState<ModeloTexto[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => modelosTextoService.list(),
    aoChegar: setModelos,
    aoLimpar: () => setModelos([]),
    erro: 'Falha ao carregar a biblioteca de modelos.',
  });

  const handleAddModelo = useCallback(async (novo: NovoModeloTexto) => {
    try {
      const criado = await modelosTextoService.add(novo);
      setModelos((prev) => [...prev, criado]);
      return criado;
    } catch (err: any) {
      toast.error('Falha ao salvar o modelo.', err.message);
      return null;
    }
  }, [toast]);

  const handleUpdateModelo = useCallback(async (id: string, patch: Partial<NovoModeloTexto>) => {
    const { aplicar, desfazer } = comRollback(setModelos);
    aplicar((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    try {
      const atualizado = await modelosTextoService.update(id, patch);
      setModelos((prev) => prev.map((m) => (m.id === id ? atualizado : m)));
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao salvar o modelo.', err.message);
      return false;
    }
  }, [toast]);

  /**
   * Aposentar e reativar são o mesmo caminho. Não há exclusão: as seções já
   * copiadas guardam `modelo_id` como procedência, e apagar a linha faria essa
   * referência virar nula sem que ninguém percebesse.
   */
  const handleAposentarModelo = useCallback(async (id: string, ativo: boolean) => {
    const { aplicar, desfazer } = comRollback(setModelos);
    aplicar((prev) => prev.map((m) => (m.id === id ? { ...m, ativo } : m)));
    try {
      await modelosTextoService.aposentar(id, ativo);
      return true;
    } catch (err: any) {
      desfazer();
      toast.error('Falha ao alterar o modelo.', err.message);
      return false;
    }
  }, [toast]);

  return useMemo(
    () => ({ modelos, loading, handleAddModelo, handleUpdateModelo, handleAposentarModelo }),
    [modelos, loading, handleAddModelo, handleUpdateModelo, handleAposentarModelo]
  );
}
