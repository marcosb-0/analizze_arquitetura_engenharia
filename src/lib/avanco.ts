import { EtapaCronograma, EtapaOrcamentoVinculo, ItemOrcamento, MedicaoObra, Projeto } from '../types';
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
 * dependendo da tela. Esta é a única fonte agora.
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

/** Mesma coisa, resolvendo o filtro por obra a partir das listas globais. */
export function avancoFisicoDaObra(
  projetoId: string,
  cronograma: EtapaCronograma[],
  vinculos: EtapaOrcamentoVinculo[],
  orcamentos: ItemOrcamento[]
): number {
  const etapas = cronograma.filter((e) => e.projetoId === projetoId);
  const etapaIds = new Set(etapas.map((e) => e.id));
  return calcularAvancoFisico(
    etapas,
    vinculos.filter((v) => etapaIds.has(v.etapaId)),
    orcamentos.filter((i) => i.projetoId === projetoId)
  );
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
 * sabia. Tudo vem de dados que a aba já carrega — nenhuma consulta nova.
 */
export function avaliarRiscoObra(
  projeto: Projeto,
  cronograma: EtapaCronograma[],
  medicoes: MedicaoObra[],
  orcamentos: ItemOrcamento[]
): RiscoObra {
  const etapasAtrasadas = cronograma.filter(
    (e) => e.projetoId === projeto.id && e.status === 'Atrasado'
  ).length;

  const medicoesPendentes = medicoes.filter(
    (m) => m.projetoId === projeto.id && m.status === 'Pendente'
  ).length;

  const itens = orcamentos.filter((i) => i.projetoId === projeto.id);
  const orcado = itens.reduce((acc, i) => acc + i.valorOrcado, 0);
  const executado = itens.reduce((acc, i) => acc + i.valorExecutado, 0);
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
