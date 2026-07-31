import { describe, it, expect } from 'vitest';
import { dataLocal, formatarDataBR, hojeLocal, diasAte, hojeISO } from './data';

/**
 * Estas funções existem por causa de um bug de fuso que já apareceu na tela:
 * `new Date('2026-07-24')` é interpretado como meia-noite **UTC**, e em UTC−3
 * isso é 21h do dia 23 — a data aparecia um dia menor.
 *
 * Os testes são escritos para valer em QUALQUER fuso da máquina que os roda
 * (asserções sobre dia/mês/ano local, nunca sobre o instante absoluto). Um teste
 * que só passa em America/Sao_Paulo não protegeria contra a regressão de alguém
 * rodando o CI em UTC — que é exatamente onde o CI roda.
 */
describe('dataLocal', () => {
  it('lê YYYY-MM-DD como meia-noite LOCAL, não UTC', () => {
    const d = dataLocal('2026-07-24')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julho
    expect(d.getDate()).toBe(24); // o bug fazia virar 23
    expect(d.getHours()).toBe(0);
  });

  it('aceita timestamp completo usando só a parte da data', () => {
    const d = dataLocal('2026-07-24T18:30:00Z')!;
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(0);
  });

  it('devolve null para ausente, vazio ou inválido', () => {
    expect(dataLocal(undefined)).toBeNull();
    expect(dataLocal(null)).toBeNull();
    expect(dataLocal('')).toBeNull();
    expect(dataLocal('não é data')).toBeNull();
  });

  it('não escorrega no primeiro dia do mês, que é onde o bug de fuso aparecia', () => {
    const d = dataLocal('2026-03-01')!;
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });
});

describe('formatarDataBR', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatarDataBR('2026-07-24')).toBe('24/07/2026');
  });

  it('usa o fallback em vez de "Invalid Date" quando o campo vem vazio', () => {
    expect(formatarDataBR('')).toBe('—');
    expect(formatarDataBR(null)).toBe('—');
    expect(formatarDataBR(undefined, 'sem data')).toBe('sem data');
  });
});

describe('hojeLocal / hojeISO', () => {
  it('hojeLocal é meia-noite de hoje', () => {
    const h = hojeLocal();
    const agora = new Date();
    expect(h.getFullYear()).toBe(agora.getFullYear());
    expect(h.getMonth()).toBe(agora.getMonth());
    expect(h.getDate()).toBe(agora.getDate());
    expect(h.getHours()).toBe(0);
    expect(h.getMinutes()).toBe(0);
  });

  it('hojeISO usa o dia LOCAL — toISOString() daria o dia UTC', () => {
    const agora = new Date();
    const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(
      agora.getDate()
    ).padStart(2, '0')}`;
    expect(hojeISO()).toBe(esperado);
  });

  it('hojeISO e dataLocal são inversos', () => {
    expect(dataLocal(hojeISO())!.getTime()).toBe(hojeLocal().getTime());
  });
});

describe('diasAte', () => {
  const emDias = (n: number) => {
    const d = hojeLocal();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('hoje é 0, futuro é positivo, passado é negativo', () => {
    expect(diasAte(emDias(0))).toBe(0);
    expect(diasAte(emDias(1))).toBe(1);
    expect(diasAte(emDias(30))).toBe(30);
    expect(diasAte(emDias(-1))).toBe(-1);
    expect(diasAte(emDias(-45))).toBe(-45);
  });

  it('atravessa a virada do horário de verão sem errar a contagem', () => {
    // Onde há DST, um dos dias tem 23h ou 25h. `Math.round` sobre a divisão por
    // 86400000 é o que impede o resultado de virar 29 ou 31.
    expect(diasAte(emDias(60))).toBe(60);
    expect(diasAte(emDias(-60))).toBe(-60);
  });

  it('devolve null quando não há data', () => {
    expect(diasAte(undefined)).toBeNull();
    expect(diasAte('')).toBeNull();
  });
});
