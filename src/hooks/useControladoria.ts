import { useCallback, useMemo, useState } from 'react';
import type { CustoPorCentro } from '../types';
import { controladoriaService, type CompromissoControle } from '../services/controladoriaService';
import { useCarregamento } from './useCarregamento';
import { useFeedback } from '../components/FeedbackContext';

export function useControladoria(ativo = true) {
  const { toast } = useFeedback();
  const [custos, setCustos] = useState<CustoPorCentro[]>([]);
  const [compromissos, setCompromissos] = useState<CompromissoControle[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: controladoriaService.carregar,
    aoChegar: (dados) => {
      setCustos(dados.custos);
      setCompromissos(dados.compromissos);
    },
    aoLimpar: () => {
      setCustos([]);
      setCompromissos([]);
    },
    erro: 'Falha ao carregar a Controladoria.',
  });

  const recarregar = useCallback(async () => {
    try {
      const dados = await controladoriaService.carregar();
      setCustos(dados.custos);
      setCompromissos(dados.compromissos);
    } catch (erro) {
      toast.error('Falha ao atualizar a Controladoria.', erro instanceof Error ? erro.message : String(erro));
    }
  }, [toast]);

  return useMemo(() => ({ custos, compromissos, loading, recarregar }), [custos, compromissos, loading, recarregar]);
}
