import { describe, expect, it } from 'vitest';
import { montarControladoria, type FontesControladoria } from './controladoria';

const fontesVazias: FontesControladoria = {
  propostas: [], projetos: [], resultados: [], resumos: [], margens: [],
  lancamentos: [], medicoesRecentes: [], custos: [], compromissos: [],
};

describe('Controladoria', () => {
  it('usa a raiz da árvore sem somar os centros filhos outra vez', () => {
    const custos = [
      { centroId: 'raiz', codigo: '1000', nome: 'Empresa', tipo: 'Sintetico', natureza: 'Administrativo', ativo: true, nivel: 1, caminho: '1000', despesaLancada: 0, despesaPaga: 0, receitaLancada: 0, receitaRecebida: 0, despesaLancadaArvore: 300, despesaPagaArvore: 200, receitaLancadaArvore: 500, receitaRecebidaArvore: 400 },
      { centroId: 'obras', codigo: '2000', nome: 'Obras', paiId: 'raiz', tipo: 'Sintetico', natureza: 'Obra', ativo: true, nivel: 2, caminho: '1000 / 2000', despesaLancada: 0, despesaPaga: 0, receitaLancada: 0, receitaRecebida: 0, despesaLancadaArvore: 300, despesaPagaArvore: 200, receitaLancadaArvore: 500, receitaRecebidaArvore: 400 },
    ] as FontesControladoria['custos'];
    const quadro = montarControladoria({ ...fontesVazias, custos });
    expect(quadro.raiz?.despesaLancadaArvore).toBe(300);
    expect(quadro.grupos).toHaveLength(1);
  });

  it('não mistura compromisso ativo com despesa realizada e exclui margem sem custo completo', () => {
    const quadro = montarControladoria({
      ...fontesVazias,
      compromissos: [{ id: 'c1', projetoId: 'o1', etapaId: 'e1', descricao: 'Pedido', valor: 120, criadoEm: '2026-09-20' }],
      margens: [
        { projetoId: 'o1', itensTotal: 2, itensConhecidos: 2, vendaTotal: 300, custoTotal: 200, margemValor: 100 },
        { projetoId: 'o2', itensTotal: 2, itensConhecidos: 1, vendaTotal: 300, custoTotal: 100, margemValor: 200 },
      ],
    });
    expect(quadro.compromissosAtivos).toBe(120);
    expect(quadro.margemProjetada).toBe(100);
    expect(quadro.margemCobertura).toEqual({ completas: 1, total: 2 });
  });

  it('conta somente propostas enviadas como valor em negociação', () => {
    const propostas = [
      { id: '1', status: 'Enviada', valorEstimado: 80 },
      { id: '2', status: 'Aprovada', valorEstimado: 90 },
      { id: '3', status: 'Elaboração', valorEstimado: 40 },
    ] as FontesControladoria['propostas'];
    const quadro = montarControladoria({ ...fontesVazias, propostas });
    expect(quadro.propostasEnviadas).toBe(1);
    expect(quadro.valorEmNegociacao).toBe(80);
  });

  it('reúne fatos dos pilares sem somá-los como um único custo', () => {
    const propostas = [{ id: 'p1', numero: 'P-1', status: 'Enviada', valorEstimado: 90, dataEnvio: '2026-09-18' }] as FontesControladoria['propostas'];
    const medicoesRecentes = [{ id: 'm1', projetoId: 'o1', dataMedicao: '2026-09-19', etapaNome: 'Fundação', status: 'Aprovada', valorMedido: 40 }] as FontesControladoria['medicoesRecentes'];
    const compromissos = [{ id: 'c1', projetoId: 'o1', etapaId: 'e1', descricao: 'Concreto', valor: 30, criadoEm: '2026-09-20T10:00:00' }];
    const quadro = montarControladoria({ ...fontesVazias, propostas, medicoesRecentes, compromissos });
    expect(quadro.fatos.map((f) => f.origem)).toEqual(['Operação', 'Operação', 'Comercial']);
    expect(quadro.compromissosAtivos).toBe(30);
  });
});
