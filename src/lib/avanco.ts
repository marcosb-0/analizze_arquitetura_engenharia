import { EtapaCronograma, EtapaOrcamentoVinculo, ItemOrcamento, Projeto, ResumoObra } from '../types';
import { dataLocal, hojeLocal } from './data';

/**
 * Avanço físico de uma obra, ponderado pelo valor orçado que cada etapa consome
 * (via `etapa_orcamento_vinculo`). Uma etapa que puxa R$200k de orçamento tem
 * que pesar mais que uma de R$5k.
 *
 * Cai para a média simples entre as etapas quando nenhuma tem vínculo de
 * orçamento — senão a soma ponderada dividiria por zero.
 *
 * Existia em três cópias (lista de obras, dashboard e console), sendo que só a
 * do console era ponderada: a mesma obra aparecia com dois números diferentes
 * dependendo da tela.
 *
 * Hoje sobrou UM chamador — o console, que já tem as listas da obra aberta em
 * memória. A lista de obras e o painel leem `ResumoObra.avancoFisico`, calculado
 * pela view `v_resumo_obra` (§4.2, item 23): eles precisavam do número de todas
 * as obras, e obtê-lo aqui custava baixar o núcleo inteiro.
 *
 * **A view reimplementa esta função em SQL.** É uma segunda cópia, e o motivo de
 * ela ser aceitável é que a primeira nunca foi o problema — o problema era o
 * DADO viajar. As três regras (sem etapas → 0; peso zero → média simples; senão
 * ponderada) estão trancadas dos dois lados: aqui por `avanco.test.ts`, lá pelo
 * comentário da migração e por `paridade com v_resumo_obra` no mesmo teste.
 *
 * Recebe as listas **já filtradas pela obra**.
 */
export function calcularAvancoFisico(
  etapas: EtapaCronograma[],
  vinculos: EtapaOrcamentoVinculo[],
  itens: ItemOrcamento[]
): number {
  if (etapas.length === 0) return 0;

  const orcadoPorItem = new Map(itens.map((i) => [i.id, i.valorOrcado]));
  const pesos = etapas.map((etapa) =>
    vinculos
      .filter((v) => v.etapaId === etapa.id)
      .reduce((soma, v) => soma + (v.pesoPercentual / 100) * (orcadoPorItem.get(v.itemOrcamentoId) ?? 0), 0)
  );

  const pesoTotal = pesos.reduce((a, b) => a + b, 0);
  if (pesoTotal <= 0) {
    const soma = etapas.reduce((acc, e) => acc + e.percentualExecutado, 0);
    return Math.round(soma / etapas.length);
  }

  const ponderada = etapas.reduce((acc, etapa, i) => acc + etapa.percentualExecutado * pesos[i], 0);
  return Math.round(ponderada / pesoTotal);
}

export interface RiscoObra {
  /** Etapas cujo prazo venceu sem estarem concluídas (status derivado na view). */
  etapasAtrasadas: number;
  /** Boletins aguardando aprovação de admin/gestão. */
  medicoesPendentes: number;
  /** Quanto o executado passou do orçado. Zero quando está dentro. */
  estouroOrcamento: number;
  /** Previsão de entrega já venceu e a obra não foi finalizada. */
  entregaVencida: boolean;
  /** Há qualquer sinal de atenção. */
  temRisco: boolean;
}

/**
 * Sinais de atenção de uma obra, para a lista mostrar o que só o dashboard
 * sabia.
 *
 * As três primeiras perguntas vêm do resumo agregado; a quarta é a data de
 * entrega, que está no próprio projeto e não precisa do servidor.
 *
 * `resumo` é opcional porque a lista renderiza antes de o resumo chegar: sem
 * isso, a primeira pintura mostraria "sem risco" por um instante e depois os
 * distintivos apareceriam — pior que não mostrar nada, porque "sem risco" é uma
 * afirmação. Ausente, só a entrega vencida é avaliada.
 */
export function avaliarRiscoObra(projeto: Projeto, resumo?: ResumoObra): RiscoObra {
  const etapasAtrasadas = resumo?.etapasAtrasadas ?? 0;
  const medicoesPendentes = resumo?.medicoesPendentes ?? 0;

  const orcado = resumo?.valorOrcado ?? 0;
  const executado = resumo?.valorExecutado ?? 0;
  const estouroOrcamento = executado > orcado ? executado - orcado : 0;

  const fim = dataLocal(projeto.dataFim);
  const entregaVencida =
    projeto.situacao !== 'Finalizado' && fim !== null && fim.getTime() < hojeLocal().getTime();

  return {
    etapasAtrasadas,
    medicoesPendentes,
    estouroOrcamento,
    entregaVencida,
    temRisco: etapasAtrasadas > 0 || medicoesPendentes > 0 || estouroOrcamento > 0 || entregaVencida,
  };
}
