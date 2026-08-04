import { useCallback, useMemo, useState } from 'react';
import { EtapaCronograma } from '../types';
import { cronogramaService } from '../services/cronogramaService';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';
import { useFeedback } from '../components/FeedbackContext';

/**
 * As frentes de serviço ABERTAS, de todas as obras — a carga da equipe.
 *
 * Domínio separado de `useCronograma` de propósito, apesar de ler a mesma view.
 * São duas perguntas diferentes, e é por servir as duas do mesmo estado que o
 * app baixava `v_etapas_cronograma` inteira (§4.2, item 23):
 *
 *   - o CONSOLE pergunta "quais são as etapas desta obra" → recorte por obra;
 *   - a EQUIPE pergunta "o que esta pessoa está tocando" → atravessa obras, e
 *     escopar mudaria a resposta em vez de baratear.
 *
 * O que torna a segunda aceitável é o filtro: etapa concluída não é carga de
 * ninguém, e `EquipeTab` já as descartava em memória depois de baixar todas —
 * com o tempo, a maior parte da tabela. É a "leitura explícita" que o §4.2
 * previa, não sobra do carregamento global.
 *
 * Sem escritas próprias: quem cria e edita etapa é o console. Mas as escritas de
 * lá MUDAM esta lista — uma frente nova entra na carga de alguém, e uma medição
 * aprovada que leve a etapa a 100% a tira. Daí `recarregar`, chamado pelo
 * `AcoesContext` junto com os outros derivados.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useCargaEquipe(ativo = true) {
  const { toast } = useFeedback();
  const [etapasAtivas, setEtapasAtivas] = useState<EtapaCronograma[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => cronogramaService.listAtivas(),
    aoChegar: setEtapasAtivas,
    aoLimpar: () => setEtapasAtivas([]),
    erro: 'Falha ao carregar as frentes de serviço da equipe.',
  });

  // Guarda gêmea à de `useMedicoesAFaturar`: sem a aba de Equipe aberta não há
  // lista para atualizar, e quem escreve etapa é o console.
  const recarregarCarga = useCallback(
    () =>
      ativo
        ? cronogramaService.listAtivas().then(setEtapasAtivas).catch(avisoRefetch(toast, 'as frentes da equipe'))
        : Promise.resolve(),
    [ativo, toast]
  );

  return useMemo(
    () => ({ etapasAtivas, loading, recarregarCarga }),
    [etapasAtivas, loading, recarregarCarga]
  );
}
