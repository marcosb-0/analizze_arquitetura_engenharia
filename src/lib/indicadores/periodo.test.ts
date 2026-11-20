import { describe, expect, it } from 'vitest';
import {
  baldesDoIntervalo,
  dentro,
  duracaoEmDias,
  indiceDoBalde,
  intervaloAnterior,
  intervaloDoPeriodo,
  comparaPeriodo,
  primeiraData,
} from './periodo';

describe('intervaloDoPeriodo', () => {
  const hoje = '2026-11-15'; // domingo

  it('vai do início da unidade de calendário até hoje', () => {
    expect(intervaloDoPeriodo('hoje', hoje)).toEqual({ de: hoje, ate: hoje });
    expect(intervaloDoPeriodo('semana', hoje)).toEqual({ de: '2026-11-09', ate: hoje });
    expect(intervaloDoPeriodo('mes', hoje)).toEqual({ de: '2026-11-01', ate: hoje });
    expect(intervaloDoPeriodo('trimestre', hoje)).toEqual({ de: '2026-10-01', ate: hoje });
    expect(intervaloDoPeriodo('ano', hoje)).toEqual({ de: '2026-01-01', ate: hoje });
  });

  it('semana começa na segunda, inclusive quando hoje é segunda', () => {
    expect(intervaloDoPeriodo('semana', '2026-11-09').de).toBe('2026-11-09');
  });

  it('personalizado inválido cai para hoje em vez de quebrar', () => {
    expect(intervaloDoPeriodo('personalizado', hoje, { de: '2026-11-20', ate: '2026-11-01' })).toEqual({ de: hoje, ate: hoje });
    expect(intervaloDoPeriodo('personalizado', hoje, { de: '2026-01-01', ate: '2026-02-01' })).toEqual({ de: '2026-01-01', ate: '2026-02-01' });
  });
});

describe('intervaloAnterior', () => {
  it('compara o mesmo trecho do mês anterior, não o mês inteiro', () => {
    expect(intervaloAnterior('mes', { de: '2026-11-01', ate: '2026-11-15' })).toEqual({ de: '2026-10-01', ate: '2026-10-15' });
  });

  it('prende o dia ao fim de um mês mais curto', () => {
    expect(intervaloAnterior('mes', { de: '2026-03-01', ate: '2026-03-31' })).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(intervaloAnterior('ano', { de: '2028-01-01', ate: '2028-02-29' })).toEqual({ de: '2027-01-01', ate: '2027-02-28' });
  });

  it('semana, dia e personalizado recuam a própria duração', () => {
    expect(intervaloAnterior('hoje', { de: '2026-11-15', ate: '2026-11-15' })).toEqual({ de: '2026-11-14', ate: '2026-11-14' });
    expect(intervaloAnterior('semana', { de: '2026-11-09', ate: '2026-11-15' })).toEqual({ de: '2026-11-02', ate: '2026-11-08' });
    expect(intervaloAnterior('personalizado', { de: '2026-01-10', ate: '2026-01-19' })).toEqual({ de: '2025-12-31', ate: '2026-01-09' });
  });

  it('trimestre recua três meses', () => {
    expect(intervaloAnterior('trimestre', { de: '2026-10-01', ate: '2026-11-15' })).toEqual({ de: '2026-07-01', ate: '2026-08-15' });
  });
});

describe('baldes', () => {
  it('até 31 dias, um por dia', () => {
    const b = baldesDoIntervalo({ de: '2026-11-01', ate: '2026-11-15' });
    expect(b).toHaveLength(15);
    expect(b[0]).toMatchObject({ de: '2026-11-01', ate: '2026-11-01', rotulo: '1/11' });
  });

  it('acima de 31 dias, um por mês, cortado nas pontas', () => {
    const b = baldesDoIntervalo({ de: '2026-01-10', ate: '2026-03-05' });
    expect(b.map((x) => [x.de, x.ate])).toEqual([
      ['2026-01-10', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-05'],
    ]);
    expect(b[0].rotulo).toBe('jan/26');
    expect(b[1].rotulo).toBe('fev');
  });

  it('acha o balde de uma data e recusa a que está fora', () => {
    const b = baldesDoIntervalo({ de: '2026-01-01', ate: '2026-11-15' });
    expect(indiceDoBalde(b, '2026-05-31')).toBe(4);
    expect(indiceDoBalde(b, '2026-11-16')).toBe(-1);
    expect(indiceDoBalde(b, '2025-12-31')).toBe(-1);
  });
});

describe('utilitários', () => {
  it('duração conta as duas pontas', () => {
    expect(duracaoEmDias({ de: '2026-11-01', ate: '2026-11-01' })).toBe(1);
    expect(duracaoEmDias({ de: '2026-02-01', ate: '2026-03-01' })).toBe(29);
  });

  it('dentro aceita timestamp e recusa vazio', () => {
    expect(dentro('2026-11-15T23:59:00Z', { de: '2026-11-15', ate: '2026-11-15' })).toBe(true);
    expect(dentro(undefined, { de: '2026-11-15', ate: '2026-11-15' })).toBe(false);
  });
});

describe('Tudo', () => {
  const hoje = '2026-11-20';

  it('começa no primeiro registro e cai no começo do ano sem registro', () => {
    expect(intervaloDoPeriodo('tudo', hoje, undefined, '2024-03-15')).toEqual({ de: '2024-03-15', ate: hoje });
    expect(intervaloDoPeriodo('tudo', hoje)).toEqual({ de: '2026-01-01', ate: hoje });
    // Registro com data futura não inverte o intervalo.
    expect(intervaloDoPeriodo('tudo', hoje, undefined, '2027-01-01')).toEqual({ de: '2026-01-01', ate: hoje });
  });

  it('acha a data mais antiga e desliga a comparação', () => {
    expect(primeiraData(['2026-05-01', undefined, '2025-02-10T12:00:00Z', null, ''])).toBe('2025-02-10');
    expect(primeiraData([])).toBeUndefined();
    expect(comparaPeriodo({ periodo: 'tudo', comparar: true })).toBe(false);
    expect(comparaPeriodo({ periodo: 'ano', comparar: true })).toBe(true);
  });
});
