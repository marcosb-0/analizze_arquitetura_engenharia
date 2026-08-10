import { describe, it, expect } from 'vitest';
import {
  baseAcumulada,
  preverMedicao,
  formatarQuantidade,
  BoletimMedido,
} from './medicaoQuantidade';

/**
 * A fórmula da medição por unidade vive em dois lugares: aqui e em
 * `fn_medicao_deriva_percentual` (20260815100000). Este arquivo é o lado JS da
 * trava.
 *
 * O defeito que ela existe para matar é sutil e caro: arredondar cada
 * incremento isoladamente faz o acumulado NUNCA fechar. Três medições de 1 m²
 * numa etapa de 3 m² dariam 33,33 × 3 = 99,99, a etapa ficaria eternamente "Em
 * Andamento" e o cliente veria uma obra 99,99% pronta sem nada a executar.
 */

const boletim = (
  percentualMedido: number,
  extra: Partial<BoletimMedido> = {}
): BoletimMedido => ({ percentualMedido, status: 'Aprovada', ...extra });

/** Encadeia medições como o banco encadeia: cada uma deriva sobre as anteriores. */
function sequencia(prevista: number, quantidades: number[]): BoletimMedido[] {
  const lancados: BoletimMedido[] = [];
  for (const q of quantidades) {
    const previa = preverMedicao(baseAcumulada(lancados, prevista), q, prevista);
    if (previa.tipo !== 'ok') throw new Error(`medição de ${q} recusada: ${previa.tipo}`);
    lancados.push({
      percentualMedido: previa.percentual,
      quantidadeMedida: q,
      status: 'Aprovada',
    });
  }
  return lancados;
}

const somaPercentual = (bs: BoletimMedido[]) =>
  bs.filter((b) => b.status !== 'Rejeitada').reduce((s, b) => s + b.percentualMedido, 0);

describe('preverMedicao — o acumulado fecha', () => {
  it('1 de 3, três vezes, fecha em exatamente 100 (e não em 99,99)', () => {
    expect(somaPercentual(sequencia(3, [1, 1, 1]))).toBe(100);
  });

  it('fecha em 100 também com uma meta que não divide bonito', () => {
    expect(somaPercentual(sequencia(7, [3, 4]))).toBe(100);
    expect(somaPercentual(sequencia(120, [10, 35, 0.5, 74.5]))).toBe(100);
  });

  it('o acumulado é sempre round(100 × qtd / prevista, 4) — a invariante inteira', () => {
    const lancados = sequencia(3, [1, 1]);
    const base = baseAcumulada(lancados, 3);
    expect(base.quantidade).toBe(2);
    expect(base.percentual).toBeCloseTo(66.6667, 10);
  });

  it('uma rejeição no meio é absorvida INTEIRA pelo boletim seguinte', () => {
    const lancados = sequencia(3, [1, 1, 1]);
    // O do meio some: a quantidade dele volta a ser devida, e o percentual dele
    // sai da conta. A fórmula ingênua (delta de acumulados) carregaria a deriva
    // para sempre a partir daqui.
    lancados[1] = { ...lancados[1], status: 'Rejeitada' };

    const previa = preverMedicao(baseAcumulada(lancados, 3), 1, 3);
    expect(previa.tipo).toBe('ok');
    if (previa.tipo !== 'ok') return;

    expect(somaPercentual([...lancados, { percentualMedido: previa.percentual, status: 'Aprovada' }]))
      .toBe(100);
  });
});

describe('baseAcumulada — de onde vem a base', () => {
  it('conta o pendente junto com o aprovado: quem mede depois mede em cima dele', () => {
    const base = baseAcumulada(
      [
        boletim(33.3333, { quantidadeMedida: 1, status: 'Aprovada' }),
        boletim(33.3334, { quantidadeMedida: 1, status: 'Pendente' }),
      ],
      3
    );
    expect(base.quantidade).toBe(2);
    expect(base.quantidadeAprovada).toBe(1);
    expect(base.quantidadePendente).toBe(1);
  });

  it('ignora o rejeitado nos dois lados da conta', () => {
    const base = baseAcumulada(
      [boletim(50, { quantidadeMedida: 5 }), boletim(50, { quantidadeMedida: 5, status: 'Rejeitada' })],
      10
    );
    expect(base.quantidade).toBe(5);
    expect(base.percentual).toBe(50);
  });

  it('lê boletim antigo em percentual como a quantidade que ele implica', () => {
    // Etapa que só HOJE ganhou meta de 100 m², depois de dois boletins de 25%.
    // 25% de uma etapa que declara 100 m² *significa* 25 m² — é derivação, não
    // invenção, e é o que permite adotar a medição por unidade numa obra em
    // andamento sem reescrever histórico.
    const base = baseAcumulada([boletim(25), boletim(25)], 100);
    expect(base.quantidade).toBe(50);

    const previa = preverMedicao(base, 10, 100);
    expect(previa).toMatchObject({ tipo: 'ok', percentual: 10, acumuladoPercentual: 60 });
  });
});

describe('preverMedicao — as recusas e os avisos', () => {
  it('recusa o boletim cujo delta some no arredondamento, em vez de gravar zero', () => {
    // Empurrar para o mínimo inflaria o progresso em silêncio; devolver 0 seria
    // um boletim que não mudou nada. As duas coisas são piores que recusar.
    const previa = preverMedicao(baseAcumulada([], 1_000_000), 0.0001, 1_000_000);
    expect(previa.tipo).toBe('sem-efeito');
  });

  it('avisa do excesso sem bloquear — o gate é a aprovação, não o lançamento', () => {
    const previa = preverMedicao(baseAcumulada([], 3), 5, 3);
    expect(previa).toMatchObject({ tipo: 'ok', excede: true, acumuladoPercentual: 166.6667 });
  });

  it('não excede quando fecha exatamente na meta', () => {
    const previa = preverMedicao(baseAcumulada(sequencia(10, [6]), 10), 4, 10);
    expect(previa).toMatchObject({ tipo: 'ok', excede: false, acumuladoPercentual: 100 });
  });

  it('trata entrada vazia, zero, negativa e meta ausente como "ainda não há prévia"', () => {
    const base = baseAcumulada([], 10);
    expect(preverMedicao(base, Number.NaN, 10).tipo).toBe('invalida');
    expect(preverMedicao(base, 0, 10).tipo).toBe('invalida');
    expect(preverMedicao(base, -1, 10).tipo).toBe('invalida');
    expect(preverMedicao(base, 5, 0).tipo).toBe('invalida');
  });

  it('arredonda a quantidade para as 3 casas do banco antes de prever', () => {
    // Prever sobre o número cru mostraria um percentual que o insert não
    // reproduz: numeric(14,3) trunca a 4ª casa na gravação.
    const previa = preverMedicao(baseAcumulada([], 100), 2.00049, 100);
    expect(previa).toMatchObject({ tipo: 'ok', acumuladoQuantidade: 2 });
  });
});

/**
 * Os números abaixo são os que `fn_medicao_deriva_percentual` devolveu no banco
 * em 10/ago/2026, no roteiro de verificação de 20260815100000 (executado dentro
 * de uma transação desfeita). É o análogo do `paridade com v_resumo_obra` de
 * `avanco.test.ts`: se um dos dois lados mudar sozinho, este bloco quebra.
 */
describe('paridade com fn_medicao_deriva_percentual', () => {
  it('reproduz os três boletins de 1 m² numa etapa de 3 m²', () => {
    const lancados = sequencia(3, [1, 1, 1]);
    expect(lancados.map((b) => b.percentualMedido)).toEqual([33.3333, 33.3334, 33.3333]);
    expect(somaPercentual(lancados)).toBe(100);
  });

  it('reproduz o rebase depois da rejeição do boletim do meio', () => {
    const lancados = sequencia(3, [1, 1, 1]);
    lancados[1] = { ...lancados[1], status: 'Rejeitada' };
    const previa = preverMedicao(baseAcumulada(lancados, 3), 1, 3);
    expect(previa).toMatchObject({ tipo: 'ok', percentual: 33.3334, acumuladoPercentual: 100 });
  });

  it('reproduz o overrun de 5 m² numa etapa de 3 m²', () => {
    expect(preverMedicao(baseAcumulada([], 3), 5, 3)).toMatchObject({
      tipo: 'ok',
      percentual: 166.6667,
    });
  });
});

describe('formatarQuantidade', () => {
  it('não arrasta zeros que a pessoa não digitou', () => {
    expect(formatarQuantidade(2)).toBe('2');
    expect(formatarQuantidade(2.5, 'm²')).toBe('2,5 m²');
    expect(formatarQuantidade(1234.567, 'm³')).toBe('1.234,567 m³');
  });
});
