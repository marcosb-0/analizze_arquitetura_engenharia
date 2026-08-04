import { useCallback, useMemo, useState } from 'react';
import type { DesvioCategoria, EtapaAtrasada, MedicaoRecente, ResumoObra } from '../types';
import { resumoService } from '../services/resumoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/** Quantos boletins o feed do painel mostra. Ver `v_medicao_recente`. */
const MEDICOES_NO_FEED = 3;

/**
 * O resumo agregado das obras — item 23 da auditoria (§4.2, §15 Fase 2).
 *
 * É o único hook de dados que não tem escrita, e isso é estrutural: tudo aqui é
 * derivado de orçamento, cronograma e medições. Quem escreve são os hooks
 * daqueles domínios, e é por isso que `recarregar` existe e é chamado por eles
 * (ver `AcoesContext`) — sem isso, aprovar uma medição no console mexeria no
 * avanço físico do banco e a lista de obras continuaria mostrando o anterior até
 * o próximo login.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useResumoObras(ativo = true) {
  const { toast } = useFeedback();
  const [resumos, setResumos] = useState<ResumoObra[]>([]);
  const [desvios, setDesvios] = useState<DesvioCategoria[]>([]);
  const [atrasos, setAtrasos] = useState<EtapaAtrasada[]>([]);
  const [medicoesRecentes, setMedicoesRecentes] = useState<MedicaoRecente[]>([]);

  const buscar = useCallback(
    () =>
      Promise.all([
        resumoService.listResumos(),
        resumoService.listDesvios(),
        resumoService.listAtrasos(),
        resumoService.listMedicoesRecentes(MEDICOES_NO_FEED),
      ]),
    []
  );

  const { loading } = useCarregamento({
    ativo,
    buscar,
    aoChegar: ([res, des, atr, med]) => {
      setResumos(res);
      setDesvios(des);
      setAtrasos(atr);
      setMedicoesRecentes(med);
    },
    aoLimpar: () => {
      setResumos([]);
      setDesvios([]);
      setAtrasos([]);
      setMedicoesRecentes([]);
    },
    erro: 'Falha ao carregar o resumo das obras.',
  });

  /**
   * Recarrega tudo de uma vez, e não a fatia que mudou.
   *
   * As quatro views se cruzam: aprovar uma medição altera avanço físico, valor
   * executado, contagem de pendentes, a lista de atrasos (a etapa pode ter
   * chegado a 100%) e o feed. Recarregar só o resumo deixaria as outras três
   * mostrando o estado anterior — quatro consultas agregadas custam menos que um
   * número errado na tela.
   */
  const recarregar = useCallback(
    () =>
      buscar()
        .then(([res, des, atr, med]) => {
          setResumos(res);
          setDesvios(des);
          setAtrasos(atr);
          setMedicoesRecentes(med);
        })
        .catch(avisoRefetch(toast, 'o resumo das obras')),
    [buscar, toast]
  );

  return useMemo(
    () => ({ resumos, desvios, atrasos, medicoesRecentes, loading, recarregar }),
    [resumos, desvios, atrasos, medicoesRecentes, loading, recarregar]
  );
}
