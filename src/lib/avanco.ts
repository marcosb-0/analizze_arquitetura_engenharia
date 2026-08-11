import { EtapaCronograma, EtapaOrcamentoVinculo, ItemOrcamento, Projeto, ResumoObra } from '../types';
import { dataLocal, hojeLocal } from './data';
import { somenteFolhas } from './cronograma/wbs';

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
 *
 * **Só as FOLHAS contam, e o filtro é feito aqui dentro de propósito** (EAP,
 * 20260809100000). Um grupo da EAP não é trabalho, é a soma das frentes dentro
 * dele: como grupo não recebe medição, ele entra com 0%, e o ramo de média
 * simples passaria a dividir por um denominador inflado — uma obra com 5 grupos
 * e 15 frentes a 100% mostraria 75%. O ramo ponderado escaparia por acidente
 * (grupo não tem vínculo, logo peso 0), e é justamente esse tipo de "sobrevive
 * por acaso" que quebra na próxima mudança.
 *
 * Filtrar aqui, e não em cada chamador, porque `v_resumo_obra` faz o mesmo
 * recorte pela mesma coluna derivada (`eh_folha`): as duas pontas da fórmula
 * duplicada precisam concordar sem depender de ninguém lembrar.
 */
export function calcularAvancoFisico(
  todasAsEtapas: EtapaCronograma[],
  vinculos: EtapaOrcamentoVinculo[],
  itens: ItemOrcamento[]
): number {
  return detalharAvancoFisico(todasAsEtapas, vinculos, itens).percentual;
}

/** O mesmo número, mais o que ele significa. Ver `detalharAvancoFisico`. */
export interface AvancoFisicoDetalhado {
  /** O percentual que as telas mostram. */
  percentual: number;
  /**
   * `false` = média simples: nenhuma folha tem vínculo de orçamento, então
   * todas pesaram igual. O número parece o mesmo e significa outra coisa.
   */
  ponderado: boolean;
  /**
   * Folhas sem nenhum vínculo. No ramo ponderado elas entram com peso ZERO —
   * uma frente sem vínculo pode ir a 100% sem mover este número um ponto.
   */
  folhasSemVinculo: number;
  totalDeFolhas: number;
}

/**
 * O avanço com a procedência junto — §2.2 (fricção 6) e §5.2 (item 5) da
 * auditoria.
 *
 * O cálculo é o mesmo de sempre; o que faltava era a tela poder dizer QUAL dos
 * dois ramos produziu o número. Sem vínculo nenhum a conta cai para média
 * simples, e a legenda da aba Medições afirmava "média geral ponderada das
 * etapas" — texto fixo, verdadeiro só num dos casos. E com vínculo parcial é
 * pior que média simples: quem não tem vínculo entra com peso zero e some da
 * conta, sem sair da tela.
 *
 * Devolver isto em vez de esconder é a diferença entre um número errado e um
 * número que avisa do que ele depende.
 */
export function detalharAvancoFisico(
  todasAsEtapas: EtapaCronograma[],
  vinculos: EtapaOrcamentoVinculo[],
  itens: ItemOrcamento[]
): AvancoFisicoDetalhado {
  const etapas = somenteFolhas(todasAsEtapas);
  if (etapas.length === 0) {
    return { percentual: 0, ponderado: false, folhasSemVinculo: 0, totalDeFolhas: 0 };
  }

  const orcadoPorItem = new Map(itens.map((i) => [i.id, i.valorOrcado]));
  const pesos = etapas.map((etapa) =>
    vinculos
      .filter((v) => v.etapaId === etapa.id)
      .reduce((soma, v) => soma + (v.pesoPercentual / 100) * (orcadoPorItem.get(v.itemOrcamentoId) ?? 0), 0)
  );

  // Sem vínculo NENHUM — não "com peso 0". Uma folha ligada a um item de valor
  // zero está vinculada: o orçamento é que diz que ela não vale nada, e isso é
  // resposta, não omissão. Contar as duas juntas mandaria o usuário procurar um
  // vínculo que já existe.
  const folhasSemVinculo = etapas.filter(
    (etapa) => !vinculos.some((v) => v.etapaId === etapa.id)
  ).length;

  const pesoTotal = pesos.reduce((a, b) => a + b, 0);
  if (pesoTotal <= 0) {
    const soma = etapas.reduce((acc, e) => acc + e.percentualExecutado, 0);
    return {
      percentual: Math.round(soma / etapas.length),
      ponderado: false,
      folhasSemVinculo,
      totalDeFolhas: etapas.length,
    };
  }

  const ponderada = etapas.reduce((acc, etapa, i) => acc + etapa.percentualExecutado * pesos[i], 0);
  return {
    percentual: Math.round(ponderada / pesoTotal),
    ponderado: true,
    folhasSemVinculo,
    totalDeFolhas: etapas.length,
  };
}

/**
 * O que a tela precisa dizer sobre o avanço, ou `null` quando o número é o que
 * aparenta ser.
 *
 * Mora aqui, e não em cada aba, porque as duas telas que mostram o percentual
 * têm de dar a MESMA explicação — foi a discordância entre telas que motivou
 * `calcularAvancoFisico` a existir.
 */
export function avisoDoAvanco(avanco: AvancoFisicoDetalhado): string | null {
  if (avanco.totalDeFolhas === 0) return null;

  if (!avanco.ponderado) {
    return 'Nenhuma etapa tem item de orçamento vinculado, então todas pesam igual neste número. Vincule os itens para o avanço refletir o valor de cada frente.';
  }

  if (avanco.folhasSemVinculo > 0) {
    // Pior que a média simples, e mais difícil de perceber: estas etapas entram
    // na conta com peso zero. Podem ir a 100% sem mover o percentual.
    const s = avanco.folhasSemVinculo > 1 ? 's' : '';
    return `${avanco.folhasSemVinculo} de ${avanco.totalDeFolhas} etapa${s} sem item de orçamento vinculado: ela${s} não entra${avanco.folhasSemVinculo > 1 ? 'm' : ''} neste percentual, nem quando for medida.`;
  }

  return null;
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
