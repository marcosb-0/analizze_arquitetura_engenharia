import { describe, it, expect } from 'vitest';
import { sugerirDuracao, equipeNecessaria } from './hh';

// 872,7 h é o HH real medido: 300 m² de alvenaria = 581,7 h de pedreiro +
// 291 h de servente, com os coeficientes do SINAPI 06/2026.
const HH_ALVENARIA_300M2 = 872.7;

describe('sugerirDuracao', () => {
  it('divide o HH pela capacidade diária da equipe', () => {
    // 872,7 h ÷ (4 pessoas × 8 h) = 27,27 → 28 dias.
    const s = sugerirDuracao(HH_ALVENARIA_300M2, 4, 8)!;
    expect(s.dias).toBe(28);
    expect(s.capacidadeDiaria).toBe(32);
  });

  it('arredonda para cima — meio dia de serviço ocupa um dia de obra', () => {
    expect(sugerirDuracao(9, 1, 8)!.dias).toBe(2);
  });

  it('respeita jornada diferente da padrão', () => {
    expect(sugerirDuracao(60, 1, 6)!.dias).toBe(10);
  });

  it('devolve null sem HH — não há o que sugerir', () => {
    // Zero dias seria uma afirmação falsa; ausência é ausência.
    expect(sugerirDuracao(0, 4, 8)).toBeNull();
  });

  it('devolve null sem equipe, em vez de Infinity', () => {
    expect(sugerirDuracao(100, 0, 8)).toBeNull();
  });

  it('devolve null sem jornada configurada', () => {
    expect(sugerirDuracao(100, 4, 0)).toBeNull();
  });
});

describe('equipeNecessaria', () => {
  it('responde quanta gente o prazo prometido exige', () => {
    // 872,7 h em 10 dias de 8 h = 10,9 → 11 pessoas.
    expect(equipeNecessaria(HH_ALVENARIA_300M2, 10, 8)).toBe(11);
  });

  it('fecha o ciclo com sugerirDuracao', () => {
    const dias = sugerirDuracao(HH_ALVENARIA_300M2, 4, 8)!.dias;
    // Com o prazo que 4 pessoas dão, a equipe necessária não pode passar de 4.
    expect(equipeNecessaria(HH_ALVENARIA_300M2, dias, 8)).toBeLessThanOrEqual(4);
  });

  it('devolve null para prazo zero', () => {
    expect(equipeNecessaria(100, 0, 8)).toBeNull();
  });
});
