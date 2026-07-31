import { describe, it, expect } from 'vitest';
import { calcularAvancoFisico, avancoFisicoDaObra, avaliarRiscoObra } from './avanco';
import type {
  EtapaCronograma,
  EtapaOrcamentoVinculo,
  ItemOrcamento,
  MedicaoObra,
  Projeto,
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
});

describe('avancoFisicoDaObra — filtra as listas globais pela obra', () => {
  it('não deixa etapa de outra obra influenciar o resultado', () => {
    const etapas = [
      etapa('e1', 100),
      etapa('e2', 0, { id: 'e2', projetoId: 'obra-2' }),
    ];
    const itens = [item('i1', 1_000), item('i2', 9_000, { projetoId: 'obra-2' })];
    const vinculos = [vinculo('e1', 'i1', 100), vinculo('e2', 'i2', 100)];

    expect(avancoFisicoDaObra('obra-1', etapas, vinculos, itens)).toBe(100);
    expect(avancoFisicoDaObra('obra-2', etapas, vinculos, itens)).toBe(0);
  });

  it('obra sem etapas é zero, não NaN', () => {
    expect(avancoFisicoDaObra('obra-inexistente', [], [], [])).toBe(0);
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

  const medicao = (status: MedicaoObra['status']): MedicaoObra => ({
    id: `m-${status}`,
    projetoId: 'obra-1',
    dataMedicao: '2026-06-01',
    etapaId: 'e1',
    percentualMedido: 10,
    valorMedido: 100,
    fotos: [],
    observacoes: '',
    status,
  });

  it('obra saudável não tem risco', () => {
    const r = avaliarRiscoObra(projeto(), [etapa('e1', 50)], [], [item('i1', 1000)]);
    expect(r.temRisco).toBe(false);
    expect(r).toMatchObject({ etapasAtrasadas: 0, medicoesPendentes: 0, estouroOrcamento: 0, entregaVencida: false });
  });

  it('conta etapa atrasada e medição pendente', () => {
    const r = avaliarRiscoObra(
      projeto(),
      [etapa('e1', 10, { status: 'Atrasado' }), etapa('e2', 0, { status: 'Atrasado' })],
      [medicao('Pendente'), medicao('Aprovada')],
      []
    );
    expect(r.etapasAtrasadas).toBe(2);
    expect(r.medicoesPendentes).toBe(1);
    expect(r.temRisco).toBe(true);
  });

  it('estouro de orçamento é a diferença, e zero quando está dentro', () => {
    const dentro = avaliarRiscoObra(projeto(), [], [], [item('i1', 1000, { valorExecutado: 900 })]);
    expect(dentro.estouroOrcamento).toBe(0);

    const fora = avaliarRiscoObra(projeto(), [], [], [item('i1', 1000, { valorExecutado: 1250 })]);
    expect(fora.estouroOrcamento).toBe(250);
    expect(fora.temRisco).toBe(true);
  });

  it('entrega vencida só vale para obra não finalizada', () => {
    const vencida = avaliarRiscoObra(projeto({ dataFim: '2020-01-01' }), [], [], []);
    expect(vencida.entregaVencida).toBe(true);

    const finalizada = avaliarRiscoObra(
      projeto({ dataFim: '2020-01-01', situacao: 'Finalizado' }),
      [], [], []
    );
    expect(finalizada.entregaVencida).toBe(false);
    expect(finalizada.temRisco).toBe(false);
  });

  it('obra sem data de entrega não conta como vencida', () => {
    expect(avaliarRiscoObra(projeto({ dataFim: '' }), [], [], []).entregaVencida).toBe(false);
  });

  it('só considera dados da própria obra', () => {
    const r = avaliarRiscoObra(
      projeto(),
      [etapa('e9', 0, { projetoId: 'obra-2', status: 'Atrasado' })],
      [{ ...medicao('Pendente'), projetoId: 'obra-2' }],
      [item('i9', 10, { projetoId: 'obra-2', valorExecutado: 9999 })]
    );
    expect(r.temRisco).toBe(false);
  });
});
