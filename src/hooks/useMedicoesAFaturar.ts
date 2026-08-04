import { useCallback, useMemo, useState } from 'react';
import { MedicaoRecente } from '../types';
import { resumoService } from '../services/resumoService';
import { useFeedback } from '../components/FeedbackContext';
import { useCarregamento } from './useCarregamento';
import { avisoRefetch } from './avisoRefetch';

/**
 * Os boletins aprovados com valor, de todas as obras — a fila do Financeiro.
 *
 * Domínio separado de `useMedicoes` pelo mesmo motivo que `useCargaEquipe` é
 * separado de `useCronograma` (§4.2, item 23): são duas perguntas diferentes, e
 * servir as duas do mesmo estado era o que obrigava a baixar três tabelas
 * inteiras.
 *
 *   - o CONSOLE pergunta "quais boletins tem esta obra", com fotos e status →
 *     recorte por obra;
 *   - o FINANCEIRO pergunta "o que ainda posso faturar" → atravessa obras, e o
 *     recorte é o valor, não a obra.
 *
 * Devolve `MedicaoRecente`, e não `MedicaoObra`: o painel do Financeiro usa id,
 * obra, data, percentual e valor — nada de fotos, motivo de rejeição ou autor da
 * aprovação. Carregar o tipo cheio seria carregar `medicao_fotos` junto para
 * nunca abrir uma foto.
 *
 * `ativo`: ver `useCarregamento`, que é dono do ciclo de carregamento.
 */
export function useMedicoesAFaturar(ativo = true) {
  const { toast } = useFeedback();
  const [medicoesAFaturar, setMedicoesAFaturar] = useState<MedicaoRecente[]>([]);

  const { loading } = useCarregamento({
    ativo,
    buscar: () => resumoService.listAFaturar(),
    aoChegar: setMedicoesAFaturar,
    aoLimpar: () => setMedicoesAFaturar([]),
    erro: 'Falha ao carregar as medições a faturar.',
  });

  /**
   * Faturar uma medição não muda esta lista — o que a tira daqui é o LANÇAMENTO
   * gerado, e o filtro de "já faturado" é feito no cliente contra o razão (ver
   * `resumoService.listAFaturar`). A releitura existe para o caso inverso: um
   * boletim aprovado no console entra nesta fila, e quem está no Financeiro não
   * tem como saber disso sem reler.
   */
  const recarregarAFaturar = useCallback(
    () =>
      // Sem a aba de Financeiro visitada não há lista para atualizar, e a
      // releitura é chamada de ações que `gestao` executa — ele aprova boletim e
      // nunca abre o Financeiro. Buscar assim mesmo seria uma ida ao servidor
      // por escrita, para um estado que ninguém lê.
      ativo
        ? resumoService
            .listAFaturar()
            .then(setMedicoesAFaturar)
            .catch(avisoRefetch(toast, 'as medições a faturar'))
        : Promise.resolve(),
    [ativo, toast]
  );

  return useMemo(
    () => ({ medicoesAFaturar, loading, recarregarAFaturar }),
    [medicoesAFaturar, loading, recarregarAFaturar]
  );
}
