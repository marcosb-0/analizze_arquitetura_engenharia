import { describe, it, expect } from 'vitest';
import { criarEscala, diasEntre, somarDias, PX_POR_DIA } from './escalaTempo';

/**
 * Se `xDeData` e `dataDeX` não forem inversas ao dia, arrastar uma barra grava
 * uma data diferente da que a pessoa viu sob o cursor — e o erro é de um dia,
 * plausível o bastante para ninguém desconfiar.
 */

describe('diasEntre', () => {
  it('conta zero no mesmo dia e sinal negativo para trás', () => {
    expect(diasEntre('2026-08-10', '2026-08-10')).toBe(0);
    expect(diasEntre('2026-08-10', '2026-08-17')).toBe(7);
    expect(diasEntre('2026-08-17', '2026-08-10')).toBe(-7);
  });

  it('atravessa mês, ano e ano bissexto', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    // 2028 é bissexto: fevereiro tem 29 dias.
    expect(diasEntre('2028-02-01', '2028-03-01')).toBe(29);
  });

  /**
   * O TESTE QUE PEGA A IMPLEMENTAÇÃO INGÊNUA.
   *
   * Subtrair dois `Date` locais e dividir por 86.400.000 devolve 9,958… ou
   * 10,042 quando o intervalo atravessa uma virada de horário de verão, e o
   * truncamento vira um dia inteiro de erro. `Date.UTC` não tem esse problema
   * porque UTC não tem horário de verão.
   */
  it('não escorrega na virada de horário de verão', () => {
    expect(diasEntre('2026-03-06', '2026-03-16')).toBe(10);
    expect(diasEntre('2026-10-30', '2026-11-09')).toBe(10);
    expect(diasEntre('2026-02-13', '2026-02-23')).toBe(10);
  });

  it('devolve 0 para data ausente em vez de NaN', () => {
    // NaN aqui viraria `left: NaNpx` e a barra sumiria da tela sem erro.
    expect(diasEntre('', '2026-08-10')).toBe(0);
    expect(diasEntre('2026-08-10', 'lixo')).toBe(0);
  });
});

describe('somarDias', () => {
  it('anda para frente e para trás pelo calendário', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('criarEscala', () => {
  const escala = criarEscala('2026-08-01', '2026-08-31', 'dia');

  it('a origem fica em x = 0', () => {
    expect(escala.xDeData('2026-08-01')).toBe(0);
  });

  it('cada dia vale pxPorDia', () => {
    expect(escala.xDeData('2026-08-11')).toBe(10 * PX_POR_DIA.dia);
  });

  it('a largura cobre as duas pontas, inclusive', () => {
    expect(escala.largura).toBe(31 * PX_POR_DIA.dia);
  });

  it('xDeData e dataDeX são inversas ao dia', () => {
    for (const iso of ['2026-08-01', '2026-08-15', '2026-08-31']) {
      expect(escala.dataDeX(escala.xDeData(iso))).toBe(iso);
    }
  });

  it('dataDeX arredonda para o dia mais próximo — o snap do arraste', () => {
    const meio = PX_POR_DIA.dia;
    expect(escala.dataDeX(meio + PX_POR_DIA.dia * 0.4)).toBe('2026-08-02');
    expect(escala.dataDeX(meio + PX_POR_DIA.dia * 0.6)).toBe('2026-08-03');
  });

  it('vale nos três zooms', () => {
    for (const zoom of ['dia', 'semana', 'mes'] as const) {
      const e = criarEscala('2026-01-01', '2026-12-31', zoom);
      expect(e.dataDeX(e.xDeData('2026-06-15')), zoom).toBe('2026-06-15');
    }
  });

  it('aguenta uma obra de três anos sem estourar', () => {
    const longa = criarEscala('2026-01-01', '2028-12-31', 'mes');
    expect(longa.largura).toBeCloseTo(1096 * PX_POR_DIA.mes, 5);
    expect(longa.dataDeX(longa.xDeData('2027-07-04'))).toBe('2027-07-04');
  });
});

describe('ticks', () => {
  it('no zoom dia, a faixa de baixo é dia a dia e a de cima é o mês', () => {
    const e = criarEscala('2026-08-01', '2026-08-31', 'dia');
    const { bandas, marcas } = e.ticks(0, e.largura);
    expect(marcas).toHaveLength(31);
    expect(marcas[0].rotulo).toBe('S1'); // 01/08/2026 é sábado
    expect(bandas.map((b) => b.rotulo)).toEqual(['ago/26']);
  });

  it('no zoom semana, as marcas começam na segunda-feira', () => {
    const e = criarEscala('2026-08-05', '2026-08-31', 'semana');
    const { marcas } = e.ticks(0, e.largura);
    // 05/08/2026 é quarta; a primeira marca é a segunda daquela semana (03/08).
    expect(marcas[0].chave).toBe('2026-08-03');
    expect(marcas[1].chave).toBe('2026-08-10');
  });

  it('no zoom mês, a faixa de cima vira o ano', () => {
    const e = criarEscala('2026-01-01', '2027-12-31', 'mes');
    const { bandas, marcas } = e.ticks(0, e.largura);
    expect(bandas.map((b) => b.rotulo)).toEqual(['2026', '2027']);
    expect(marcas).toHaveLength(24);
  });

  it('recorta pela janela visível em vez de emitir a obra inteira', () => {
    // É o que impede 730 nós de cabeçalho numa obra de dois anos.
    const e = criarEscala('2026-01-01', '2027-12-31', 'dia');
    const { marcas } = e.ticks(0, 200);
    expect(marcas.length).toBeLessThan(60);
    expect(e.ticks(0, e.largura).marcas.length).toBeGreaterThan(700);
  });

  it('a largura de cada banda acompanha o tamanho real do mês', () => {
    const e = criarEscala('2026-02-01', '2026-03-31', 'dia');
    const { bandas } = e.ticks(0, e.largura);
    expect(bandas[0].largura).toBe(28 * PX_POR_DIA.dia); // fevereiro de 2026
    expect(bandas[1].largura).toBe(31 * PX_POR_DIA.dia); // março
  });
});
