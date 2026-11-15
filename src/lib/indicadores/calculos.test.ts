import { describe, expect, it } from 'vitest';
import type { Projeto, ResumoObra, Tarefa } from '../../types';
import {
  filtrosAtivos,
  opcoesDosFiltros,
  montarEscopo,
  previstoDaEtapa,
  quadroFinanceiro,
  quadroMedicoes,
  quadroObras,
  quadroPrazos,
  quadroProdutividade,
  quadroQualidade,
  variacao,
} from './calculos';
import type { ContratoBI, DadosBI, EtapaBI, FaturamentoBI, FiltrosBI, MedicaoBI } from './tipos';

const HOJE = '2026-11-15';

const obra = (id: string, extra: Partial<Projeto> = {}): Projeto => ({
  id, nome: `Obra ${id}`, clienteId: 'c1', responsavelInterno: '', enderecoObra: '',
  dataInicio: '', dataFim: '', situacao: 'Em Execução', ...extra,
});

let seq = 0;
const medicao = (extra: Partial<MedicaoBI>): MedicaoBI => ({
  id: `m${++seq}`, projetoId: 'A', etapaId: 'eA1', data: '2026-11-10', percentual: 10, status: 'Aprovada', valor: 0, ...extra,
});
const etapa = (extra: Partial<EtapaBI>): EtapaBI => ({
  id: `e${++seq}`, projetoId: 'A', nome: 'Etapa', percentualExecutado: 0, quantidadeExecutada: 0, peso: 0, ...extra,
});
const contrato = (extra: Partial<ContratoBI>): ContratoBI => ({
  id: `k${++seq}`, numero: 'CT-1', clienteId: 'c1', objeto: '', valorTotal: 0, status: 'Assinado', ...extra,
});
const faturamento = (extra: Partial<FaturamentoBI>): FaturamentoBI => ({
  id: `f${++seq}`, descricao: '', valor: 0, data: '2026-11-10', vencimento: '2026-11-30', pago: false, ...extra,
});

const filtros = (extra: Partial<FiltrosBI> = {}): FiltrosBI => ({
  periodo: 'mes', personalizado: { de: HOJE, ate: HOJE },
  obraId: null, contratoId: null, responsavelId: null, situacao: null, comparar: true, ...extra,
});

const vazio: DadosBI = { medicoes: [], etapas: [], contratos: [], faturamentos: [], rejeicoes: [] };
const projetos = [
  obra('A', { responsavelInternoId: 'r1' }),
  obra('B', { situacao: 'Planejamento', responsavelInternoId: 'r2' }),
  obra('C', { situacao: 'Finalizado', responsavelInternoId: 'r1' }),
];

describe('escopo dos filtros', () => {
  it('cruza obra, responsável e situação', () => {
    expect([...montarEscopo(projetos, [], filtros({ responsavelId: 'r1' }), HOJE).obras]).toEqual(['A', 'C']);
    expect([...montarEscopo(projetos, [], filtros({ responsavelId: 'r1', situacao: 'Finalizado' }), HOJE).obras]).toEqual(['C']);
    expect([...montarEscopo(projetos, [], filtros({ obraId: 'B', responsavelId: 'r1' }), HOJE).obras]).toEqual([]);
  });

  it('contrato recorta para a obra dele', () => {
    const k = contrato({ projetoId: 'B' });
    const e = montarEscopo(projetos, [k, contrato({ projetoId: 'A' })], filtros({ contratoId: k.id }), HOJE);
    expect([...e.obras]).toEqual(['B']);
    expect(e.contratos).toEqual([k]);
  });

  it('contrato sem obra não deixa passar obra nenhuma, mas continua no escopo', () => {
    const k = contrato({});
    const e = montarEscopo(projetos, [k], filtros({ contratoId: k.id }), HOJE);
    expect(e.obras.size).toBe(0);
    expect(e.contratos).toEqual([k]);
    // ...a não ser que o recorte fale de obra: aí ele não pertence a ele.
    expect(montarEscopo(projetos, [k], filtros({ contratoId: k.id, situacao: 'Em Execução' }), HOJE).contratos).toEqual([]);
  });

  it('registro sem obra só conta sem filtro de obra', () => {
    const t: Tarefa = { id: 't', titulo: '', status: 'Concluída', prioridade: 'Média', criadoPor: 'u', concluidaEm: '2026-11-10T12:00:00Z', createdAt: '' };
    expect(quadroProdutividade(vazio, [t], montarEscopo(projetos, [], filtros(), HOJE)).tarefasConcluidas.atual).toBe(1);
    expect(quadroProdutividade(vazio, [t], montarEscopo(projetos, [], filtros({ obraId: 'A' }), HOJE)).tarefasConcluidas.atual).toBe(0);
  });

  it('conta filtros ativos', () => {
    expect(filtrosAtivos(filtros())).toBe(0);
    expect(filtrosAtivos(filtros({ obraId: 'A', situacao: 'Pausado' }))).toBe(2);
  });
});

describe('variação', () => {
  it('sem base é null, não infinito', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBe(50);
    expect(variacao(5, 10)).toBe(-50);
  });
});

describe('financeiro', () => {
  const dados: DadosBI = {
    ...vazio,
    contratos: [contrato({ projetoId: 'A', valorTotal: 1000 }), contrato({ projetoId: 'B', valorTotal: 500, status: 'Minuta' })],
    medicoes: [
      medicao({ valor: 200, data: '2026-11-05' }),
      medicao({ valor: 100, data: '2026-10-05' }), // mesmo trecho do mês anterior
      medicao({ valor: 50, data: '2026-10-20' }),  // fora do trecho comparável
      medicao({ valor: 999, status: 'Pendente' }),
    ],
    faturamentos: [
      faturamento({ projetoId: 'A', valor: 150, pago: true, data: '2026-11-06' }),
      faturamento({ projetoId: 'A', valor: 100, pago: false, vencimento: '2026-11-01' }),
    ],
  };
  const q = quadroFinanceiro(dados, montarEscopo(projetos, dados.contratos, filtros(), HOJE), HOJE);

  it('minuta não é contratado, e pendente não é medido', () => {
    expect(q.contratado).toBe(1000);
    expect(q.medidoAcumulado).toBe(350);
    expect(q.saldoContratual).toBe(650);
  });

  it('fluxo do período com variação sobre o mesmo trecho anterior', () => {
    expect(q.medido).toEqual({ atual: 200, anterior: 100, variacao: 100 });
    expect(q.faturado.atual).toBe(250);
    expect(q.recebido.atual).toBe(150);
  });

  it('a receber, vencido e a faturar seguem fn_resultado_obra', () => {
    expect(q.aReceber).toBe(100);
    expect(q.vencido).toBe(100);
    expect(q.aFaturar).toBe(100); // 350 medido − 250 faturado
    const a = q.porObra.find((l) => l.projetoId === 'A')!;
    expect(a).toMatchObject({ contratado: 1000, medido: 350, faturado: 250, recebido: 150, aReceber: 100, saldo: 650 });
  });

  it('a soma das linhas por contrato fecha com o saldo total', () => {
    const d2: DadosBI = { ...dados, contratos: [contrato({ projetoId: 'A', valorTotal: 600 }), contrato({ projetoId: 'A', valorTotal: 400 })] };
    const q2 = quadroFinanceiro(d2, montarEscopo(projetos, d2.contratos, filtros(), HOJE), HOJE);
    expect(q2.porContrato.reduce((t, c) => t + c.saldo, 0)).toBeCloseTo(q2.saldoContratual);
    expect(q2.porContrato.map((c) => c.medido)).toEqual([210, 140]);
  });
});

describe('medições', () => {
  const dados: DadosBI = {
    ...vazio,
    medicoes: [
      medicao({ status: 'Aprovada', valor: 10 }),
      medicao({ status: 'Rejeitada' }),
      medicao({ status: 'Pendente' }),
      medicao({ status: 'Pendente', data: '2026-01-01' }),
      medicao({ status: 'Aprovada', projetoId: 'B', valor: 5 }),
    ],
  };

  it('conta por status, taxa só sobre decididas, e pendente de qualquer data', () => {
    const q = quadroMedicoes(dados, montarEscopo(projetos, [], filtros(), HOJE));
    expect(q.total.atual).toBe(4);
    expect(q.aprovadas.atual).toBe(2);
    expect(q.rejeitadas).toBe(1);
    expect(q.taxaAprovacao).toBeCloseTo(66.667, 2);
    expect(q.aguardandoAprovacao).toBe(2);
    expect(q.valorAprovado.atual).toBe(15);
    expect(q.evolucao.find((b) => b.balde.de === '2026-11-10')).toMatchObject({ Aprovada: 2, Rejeitada: 1, Pendente: 1 });
  });

  it('o filtro de obra chega a todos os números', () => {
    const q = quadroMedicoes(dados, montarEscopo(projetos, [], filtros({ obraId: 'B' }), HOJE));
    expect(q.total.atual).toBe(1);
    expect(q.valorAprovado.atual).toBe(5);
    expect(q.aguardandoAprovacao).toBe(0);
  });
});

describe('obras', () => {
  const resumo = (projetoId: string, extra: Partial<ResumoObra>): ResumoObra => ({
    projetoId, itensTotal: 0, valorOrcado: 0, valorContratado: 0, valorExecutado: 0, etapasTotal: 0,
    etapasAtrasadas: 0, etapasConcluidas: 0, avancoFisico: 0, medicoesTotal: 0, medicoesPendentes: 0, ...extra,
  });

  it('avanço médio ignora obra sem cronograma em vez de contá-la como zero', () => {
    const q = quadroObras(projetos, [
      resumo('A', { etapasTotal: 4, avancoFisico: 50, etapasAtrasadas: 1 }),
      resumo('B', { etapasTotal: 2, avancoFisico: 20 }),
      resumo('C', {}),
    ], montarEscopo(projetos, [], filtros(), HOJE));
    expect(q.avancoMedio).toBe(35);
    expect(q.obrasComCronograma).toBe(2);
    expect(q.obrasComAtraso).toBe(1);
    expect(q.porSituacao.find((s) => s.situacao === 'Em Execução')?.obras).toBe(1);
  });
});

describe('prazos', () => {
  it('previsto linear entre as datas, com teto nas pontas', () => {
    const e = { dataInicio: '2026-11-01', dataFim: '2026-11-10' };
    expect(previstoDaEtapa(e, '2026-10-31')).toBe(0);
    expect(previstoDaEtapa(e, '2026-11-05')).toBe(50);
    expect(previstoDaEtapa(e, '2026-11-10')).toBe(100);
    expect(previstoDaEtapa({}, '2026-11-05')).toBeNull();
  });

  it('atraso segue v_etapa_atrasada e o realizado de hoje bate com o executado da view', () => {
    const e1 = etapa({ dataInicio: '2026-11-01', dataFim: '2026-11-10', percentualExecutado: 60, peso: 300 });
    const e2 = etapa({ dataInicio: '2026-11-11', dataFim: '2026-11-20', percentualExecutado: 0, peso: 100 });
    const e3 = etapa({ dataInicio: '2026-11-01', dataFim: '2026-11-12', percentualExecutado: 100, peso: 0, baselineFim: '2026-11-08' });
    const dados: DadosBI = {
      ...vazio,
      etapas: [e1, e2, e3],
      medicoes: [
        medicao({ etapaId: e1.id, percentual: 40, data: '2026-11-03' }),
        medicao({ etapaId: e1.id, percentual: 20, data: '2026-11-12' }),
        medicao({ etapaId: e1.id, percentual: 30, status: 'Rejeitada' }),
        medicao({ etapaId: e3.id, percentual: 100, data: '2026-11-12' }),
      ],
    };
    const q = quadroPrazos(dados, montarEscopo(projetos, [], filtros(), HOJE), HOJE);
    expect(q.atrasadas.map((a) => [a.etapa.id, a.dias])).toEqual([[e1.id, 5]]);
    expect(q.vencendo.map((a) => a.etapa.id)).toEqual([e2.id]);
    expect(q.reprogramadas.map((a) => [a.etapa.id, a.dias])).toEqual([[e3.id, 4]]);
    // Ponderado: (60×300 + 0×100 + 100×0) / 400 = 45 — e3 tem peso zero.
    expect(q.realizadoHoje).toBeCloseTo(45);
    // Previsto hoje: e1 100, e2 50% (5 de 10 dias), e3 100 → (300 + 50) / 400.
    expect(q.previstoHoje).toBeCloseTo(87.5);
    expect(q.desvioHoje).toBeCloseTo(-42.5);
    // Antes do 2º boletim, só os 40% de e1 existiam.
    expect(q.curva.find((c) => c.balde.de === '2026-11-05')?.realizado).toBeCloseTo(30);
    expect(q.curva.at(-1)?.realizado).toBeCloseTo(45);
  });
});

describe('produtividade', () => {
  it('produção por unidade, sem somar m² com m³', () => {
    const e1 = etapa({ quantidadePrevista: 100, quantidadeExecutada: 40, unidade: 'm²' });
    const dados: DadosBI = {
      ...vazio,
      etapas: [e1],
      medicoes: [
        medicao({ etapaId: e1.id, quantidade: 30, unidade: 'm²' }),
        medicao({ etapaId: e1.id, quantidade: 10, unidade: 'm²', data: '2026-10-02' }),
        medicao({ quantidade: 5, unidade: 'm³' }),
      ],
    };
    const q = quadroProdutividade(dados, [], montarEscopo(projetos, [], filtros(), HOJE));
    expect(q.unidades).toEqual(['m²', 'm³']);
    expect(q.producao['m²'].reduce((t, b) => t + b.quantidade, 0)).toBe(30);
    expect(q.metas[0]).toMatchObject({ percentual: 40, noPeriodo: 30, ritmo: 2 });
    expect(q.execucaoMetas).toBe(40);
    expect(q.boletinsAprovados).toEqual({ atual: 2, anterior: 1, variacao: 100 });
  });
});

describe('qualidade', () => {
  it('rejeições do período com o motivo', () => {
    const r = medicao({ status: 'Rejeitada' });
    const dados: DadosBI = { ...vazio, medicoes: [r, medicao({}), medicao({ status: 'Pendente' })], rejeicoes: [{ medicaoId: r.id, motivo: 'Fora do traço' }] };
    const q = quadroQualidade(dados, montarEscopo(projetos, [], filtros(), HOJE));
    expect(q.rejeitadas.atual).toBe(1);
    expect(q.taxaRejeicao).toBe(50);
    expect(q.boletins[0].motivo).toBe('Fora do traço');
  });
});

describe('opções dos filtros', () => {
  const ps = [
    obra('A', { responsavelInternoId: 'r1', responsavelInterno: 'Ana' }),
    obra('B', { situacao: 'Pausado', responsavelInternoId: 'r2', responsavelInterno: 'Bia' }),
  ];
  const ks = [contrato({ projetoId: 'A' }), contrato({ projetoId: 'B' }), contrato({})];

  it('cada filtro recorta as opções dos outros', () => {
    const o = opcoesDosFiltros(ps, ks, filtros({ situacao: 'Pausado' }));
    expect(o.obras.map((p) => p.id)).toEqual(['B']);
    expect(o.contratos.map((c) => c.projetoId)).toEqual(['B']);
    expect(o.responsaveis).toEqual([{ id: 'r2', nome: 'Bia' }]);
  });

  it('a opção escolhida continua na lista', () => {
    const o = opcoesDosFiltros(ps, ks, filtros({ obraId: 'A', situacao: 'Pausado' }));
    expect(o.obras.map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('contrato sem obra só aparece sem recorte de obra', () => {
    expect(opcoesDosFiltros(ps, ks, filtros()).contratos).toHaveLength(3);
    expect(opcoesDosFiltros(ps, ks, filtros({ obraId: 'A' })).contratos.map((c) => c.projetoId)).toEqual(['A']);
  });
});
