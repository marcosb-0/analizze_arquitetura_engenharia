import { describe, it, expect } from 'vitest';
import { calcularAvancoFisico, avaliarRiscoObra } from './avanco';
import type {
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  ItemOrcamento,
  Projeto,
  ResumoObra,
} from '../types';

/**
 * O avanço físico é o número que o cliente vê no relatório e que a diretoria usa
 * para decidir se a obra está no prazo. Existia em TRÊS cópias (lista de obras,
 * dashboard e console), e só a do console era ponderada pelo valor — a mesma obra
 * aparecia com dois percentuais diferentes dependendo da tela. Estes testes
 * trancam a única versão que sobrou.
 */

const etapa = (id: string, percentualExecutado: number, extra: Partial<EtapaCronograma> = {}): EtapaCronograma => ({
  id,
  projetoId: 'obra-1',
  nome: `Etapa ${id}`,
  dataInicio: '2026-01-01',
  dataFim: '2026-12-31',
  responsavelId: '',
  percentualExecutado,
  status: 'Em Andamento',
  // EAP: `ehFolha: true` é o padrão porque a folha é a unidade de trabalho —
  // os testes que criam grupo passam `ehFolha: false` explicitamente.
  parentId: '',
  ordem: 1,
  ehMarco: false,
  agendamento: 'manual',
  baselineInicio: '',
  baselineFim: '',
  baselineEm: '',
  nivel: 0,
  wbsCodigo: '',
  ehFolha: true,
  inicioEfetivo: '2026-01-01',
  fimEfetivo: '2026-12-31',
  updatedAt: '2026-08-09T10:00:00Z',
  ...extra,
});

const item = (id: string, valorOrcado: number, extra: Partial<ItemOrcamento> = {}): ItemOrcamento => ({
  id,
  projetoId: 'obra-1',
  categoria: 'Materiais',
  descricao: `Item ${id}`,
  valorOrcado,
  valorContratado: 0,
  valorExecutado: 0,
  ...extra,
});

const vinculo = (etapaId: string, itemOrcamentoId: string, pesoPercentual: number): EtapaOrcamentoVinculo => ({
  id: `${etapaId}-${itemOrcamentoId}`,
  etapaId,
  itemOrcamentoId,
  pesoPercentual,
});

describe('calcularAvancoFisico', () => {
  it('é zero sem etapas', () => {
    expect(calcularAvancoFisico([], [], [])).toBe(0);
  });

  it('pondera pelo valor orçado que cada etapa consome', () => {
    // Etapa caseira: R$ 200.000 e 100% feita. Etapa pequena: R$ 5.000 e 0%.
    // Média simples daria 50%; a ponderada tem de ficar perto de 100%.
    const etapas = [etapa('e1', 100), etapa('e2', 0)];
    const itens = [item('i1', 200_000), item('i2', 5_000)];
    const vinculos = [vinculo('e1', 'i1', 100), vinculo('e2', 'i2', 100)];

    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(98); // 200000/205000
  });

  it('a etapa de maior valor domina o resultado — o caso que motivou a ponderação', () => {
    const etapas = [etapa('e1', 0), etapa('e2', 100)];
    const itens = [item('i1', 200_000), item('i2', 5_000)];
    const vinculos = [vinculo('e1', 'i1', 100), vinculo('e2', 'i2', 100)];

    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(2);
  });

  it('respeita o peso parcial de um vínculo', () => {
    // A etapa consome só 50% de um item de R$ 100.000 → peso 50.000.
    const etapas = [etapa('e1', 100), etapa('e2', 0)];
    const itens = [item('i1', 100_000), item('i2', 50_000)];
    const vinculos = [vinculo('e1', 'i1', 50), vinculo('e2', 'i2', 100)];

    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(50); // 50000 / 100000
  });

  it('cai para média simples quando NENHUMA etapa tem vínculo — e isso muda o significado do número', () => {
    // Documenta a armadilha do §2.2 da auditoria: uma obra cadastrada sem
    // vínculos mostra um avanço NÃO ponderado, e nada na tela avisa.
    const etapas = [etapa('e1', 100), etapa('e2', 0)];
    const itens = [item('i1', 200_000), item('i2', 5_000)];

    expect(calcularAvancoFisico(etapas, [], itens)).toBe(50);
  });

  it('cai para média simples quando os vínculos apontam para itens de valor zero', () => {
    const etapas = [etapa('e1', 100), etapa('e2', 50)];
    const itens = [item('i1', 0), item('i2', 0)];
    const vinculos = [vinculo('e1', 'i1', 100), vinculo('e2', 'i2', 100)];

    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(75);
  });

  it('ignora vínculo que aponta para item inexistente em vez de somar NaN', () => {
    const etapas = [etapa('e1', 100), etapa('e2', 0)];
    const itens = [item('i1', 1_000)];
    const vinculos = [vinculo('e1', 'i1', 100), vinculo('e2', 'item-apagado', 100)];

    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(100);
  });

  /**
   * A EAP (20260809100000) trouxe grupos para dentro da mesma lista de etapas, e
   * grupo não é trabalho — é a soma das frentes dentro dele. Como grupo não
   * recebe medição (fn_execucao_so_em_folha), ele entra sempre com 0%.
   *
   * O ramo PONDERADO escapa por acidente (grupo não tem vínculo, logo peso 0), e
   * é justamente por isso que estes casos existem: o ramo de média simples
   * dividiria por um denominador inflado, e "sobrevive por acaso" é o que quebra
   * na próxima mudança.
   *
   * `v_resumo_obra` faz o mesmo recorte com `and e.eh_folha` — as duas pontas da
   * fórmula duplicada filtram pela MESMA coluna derivada.
   */
  it('não conta grupo da EAP na média simples — o caso que inflava o denominador', () => {
    // Uma obra com 1 grupo e 2 frentes a 100%: sem o recorte, 200/3 = 67%.
    const etapas = [
      etapa('grupo', 0, { ehFolha: false }),
      etapa('f1', 100, { parentId: 'grupo' }),
      etapa('f2', 100, { parentId: 'grupo' }),
    ];

    expect(calcularAvancoFisico(etapas, [], [])).toBe(100);
  });

  it('não conta grupo da EAP na média ponderada', () => {
    const etapas = [
      etapa('grupo', 0, { ehFolha: false }),
      etapa('f1', 100, { parentId: 'grupo' }),
      etapa('f2', 0, { parentId: 'grupo' }),
    ];
    const itens = [item('i1', 200_000), item('i2', 5_000)];
    const vinculos = [vinculo('f1', 'i1', 100), vinculo('f2', 'i2', 100)];

    // 200k a 100% contra 5k a 0% — o mesmo resultado que sem o grupo na lista.
    expect(calcularAvancoFisico(etapas, vinculos, itens)).toBe(98);
  });

  it('é zero quando a obra só tem grupos — não há frente para medir', () => {
    const etapas = [etapa('g1', 0, { ehFolha: false }), etapa('g2', 0, { ehFolha: false })];
    expect(calcularAvancoFisico(etapas, [], [])).toBe(0);
  });
});

/**
 * A view `v_resumo_obra` (migração 20260804110000) reimplementa
 * `calcularAvancoFisico` em SQL, porque a lista de obras e o painel precisam do
 * avanço de TODAS as obras e obtê-lo aqui custava baixar o núcleo inteiro.
 *
 * Duas implementações da mesma regra divergem em silêncio, e o sintoma é o
 * defeito que este arquivo existe para ter matado: a mesma obra com dois
 * números em duas telas. Este bloco é o lado JS da trava — os dados abaixo são
 * os do banco em 04/ago/2026, e os valores esperados são os que a view devolveu
 * quando foi conferida contra eles.
 */
describe('paridade com v_resumo_obra', () => {
  it('reproduz o avanço que a view calculou para as duas obras reais', () => {
    // Obra "Casa 200m²": etapa de 25% pesando 294 (item de 204 inteiro + metade
    // de um de 180) e etapa de 70% pesando 90. Duas etapas sem vínculo.
    const casa = calcularAvancoFisico(
      [etapa('e-alv', 25), etapa('e-fund', 70), etapa('e-x', 0), etapa('e-y', 0)],
      [vinculo('e-alv', 'i-terc', 100), vinculo('e-alv', 'i-mo', 50), vinculo('e-fund', 'i-mo', 50)],
      [item('i-terc', 204), item('i-mo', 180)]
    );
    expect(casa).toBe(36); // 13650 / 384 = 35,55 → a view devolveu 36

    // Obra "Setta": uma etapa de 20% com vínculo integral, quatro sem vínculo.
    const setta = calcularAvancoFisico(
      [etapa('s-fund', 20), etapa('s-a', 0), etapa('s-b', 0), etapa('s-c', 0), etapa('s-d', 0)],
      [vinculo('s-fund', 'i-reat', 100)],
      [item('i-reat', 1065.29)]
    );
    expect(setta).toBe(20);
  });

  it('arredonda para cima no meio exato — onde round() do Postgres e Math.round concordam', () => {
    // 50% e 0% com pesos 1 e 1 → 25. Um caso .5: pesos 1 e 2 com 25% e 0% → 8,33.
    // O que importa aqui é que o domínio é não-negativo: é a condição sob a qual
    // "meio para cima" (JS) e "meio para longe do zero" (Postgres) coincidem.
    const meio = calcularAvancoFisico(
      [etapa('a', 25), etapa('b', 0)],
      [vinculo('a', 'i1', 100), vinculo('b', 'i2', 100)],
      [item('i1', 100), item('i2', 100)]
    );
    expect(meio).toBe(13); // 2500/200 = 12,5 → 13
  });
});

describe('avaliarRiscoObra', () => {
  const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
    id: 'obra-1',
    nome: 'Obra 1',
    clienteId: 'c1',
    responsavelInterno: 'Alguém',
    enderecoObra: '',
    dataInicio: '2026-01-01',
    dataFim: '2099-12-31',
    situacao: 'Em Execução',
    ...extra,
  });

  const resumo = (extra: Partial<ResumoObra> = {}): ResumoObra => ({
    projetoId: 'obra-1',
    itensTotal: 0,
    valorOrcado: 0,
    valorContratado: 0,
    valorExecutado: 0,
    etapasTotal: 0,
    etapasAtrasadas: 0,
    etapasConcluidas: 0,
    avancoFisico: 0,
    medicoesTotal: 0,
    medicoesPendentes: 0,
    ...extra,
  });

  it('obra saudável não tem risco', () => {
    const r = avaliarRiscoObra(projeto(), resumo({ valorOrcado: 1000 }));
    expect(r.temRisco).toBe(false);
    expect(r).toMatchObject({ etapasAtrasadas: 0, medicoesPendentes: 0, estouroOrcamento: 0, entregaVencida: false });
  });

  it('conta etapa atrasada e medição pendente', () => {
    const r = avaliarRiscoObra(projeto(), resumo({ etapasAtrasadas: 2, medicoesTotal: 2, medicoesPendentes: 1 }));
    expect(r.etapasAtrasadas).toBe(2);
    expect(r.medicoesPendentes).toBe(1);
    expect(r.temRisco).toBe(true);
  });

  it('estouro de orçamento é a diferença, e zero quando está dentro', () => {
    const dentro = avaliarRiscoObra(projeto(), resumo({ valorOrcado: 1000, valorExecutado: 900 }));
    expect(dentro.estouroOrcamento).toBe(0);

    const fora = avaliarRiscoObra(projeto(), resumo({ valorOrcado: 1000, valorExecutado: 1250 }));
    expect(fora.estouroOrcamento).toBe(250);
    expect(fora.temRisco).toBe(true);
  });

  it('entrega vencida só vale para obra não finalizada', () => {
    const vencida = avaliarRiscoObra(projeto({ dataFim: '2020-01-01' }), resumo());
    expect(vencida.entregaVencida).toBe(true);

    const finalizada = avaliarRiscoObra(projeto({ dataFim: '2020-01-01', situacao: 'Finalizado' }), resumo());
    expect(finalizada.entregaVencida).toBe(false);
    expect(finalizada.temRisco).toBe(false);
  });

  it('obra sem data de entrega não conta como vencida', () => {
    expect(avaliarRiscoObra(projeto({ dataFim: '' }), resumo()).entregaVencida).toBe(false);
  });

  /**
   * A lista pinta antes de o resumo chegar. Sem resumo a resposta tem de ser
   * "nada a declarar", e não "sem risco" — a diferença aparece na tela como
   * distintivo que não deveria estar lá, ou pior, como ausência de um que
   * deveria. A entrega vencida é a única coisa avaliável, porque está no projeto.
   */
  it('sem resumo, só a entrega vencida é avaliada', () => {
    const semNada = avaliarRiscoObra(projeto());
    expect(semNada).toMatchObject({
      etapasAtrasadas: 0,
      medicoesPendentes: 0,
      estouroOrcamento: 0,
      entregaVencida: false,
      temRisco: false,
    });

    expect(avaliarRiscoObra(projeto({ dataFim: '2020-01-01' })).temRisco).toBe(true);
  });

  /**
   * O resumo vem de `v_resumo_obra`, que já é escopada por obra — o filtro por
   * `projetoId` que esta função fazia saiu junto. Fica o teste de que ela usa o
   * resumo que recebeu, e não procura nada.
   */
  it('usa o resumo recebido sem refiltrar por obra', () => {
    const r = avaliarRiscoObra(projeto(), resumo({ projetoId: 'obra-2', etapasAtrasadas: 3 }));
    expect(r.etapasAtrasadas).toBe(3);
  });
});
