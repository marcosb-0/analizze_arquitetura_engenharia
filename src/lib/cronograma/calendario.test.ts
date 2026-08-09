import { describe, it, expect } from 'vitest';
import {
  CALENDARIO_BR,
  SEM_FERIADOS,
  calendarioDe,
  diaUtilAnterior,
  duracaoDiasUteis,
  ehDiaUtil,
  feriadosNacionais,
  proximoDiaUtil,
  somarDiasUteis,
} from './calendario';
import { getWorkingDays } from '../diasUteis';

/**
 * O prazo da obra sai daqui. Um erro de um dia nesta aritmética desloca todas as
 * sucessoras de uma cadeia, e o número continua parecendo plausível — que é
 * exatamente o modo de falha que este arquivo existe para travar.
 *
 * Dois casos merecem atenção especial e estão marcados abaixo: a mudança de
 * horário de verão (que pega qualquer implementação feita em milissegundos) e o
 * feriado que cai no fim de semana (que não pode ser descontado duas vezes).
 */

describe('feriadosNacionais', () => {
  it('acha a Páscoa e deriva Carnaval, Sexta-Santa e Corpus Christi', () => {
    // Páscoa de 2026: 05/04. Carnaval terça: 17/02. Sexta-Santa: 03/04.
    // Corpus Christi: 04/06.
    const f = feriadosNacionais(2026);
    expect(f.has('2026-02-16')).toBe(true); // Carnaval, segunda
    expect(f.has('2026-02-17')).toBe(true); // Carnaval, terça
    expect(f.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(f.has('2026-06-04')).toBe(true); // Corpus Christi
  });

  it('acerta a Páscoa em anos distantes', () => {
    // 2024: 31/03 → Sexta-Santa 29/03. 2030: 21/04 → Sexta-Santa 19/04.
    expect(feriadosNacionais(2024).has('2024-03-29')).toBe(true);
    expect(feriadosNacionais(2030).has('2030-04-19')).toBe(true);
  });

  it('traz os oito fixos', () => {
    const f = feriadosNacionais(2026);
    for (const d of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']) {
      expect(f.has(`2026-${d}`), d).toBe(true);
    }
  });

  it('Consciência Negra só a partir de 2024, quando virou lei federal', () => {
    // Lei 14.759/2023. Aplicá-la retroativamente encurtaria o prazo de uma obra
    // antiga sem que nada tivesse mudado nela.
    expect(feriadosNacionais(2023).has('2023-11-20')).toBe(false);
    expect(feriadosNacionais(2024).has('2024-11-20')).toBe(true);
  });
});

describe('ehDiaUtil', () => {
  it('recusa sábado e domingo', () => {
    expect(ehDiaUtil('2026-08-08')).toBe(false); // sábado
    expect(ehDiaUtil('2026-08-09')).toBe(false); // domingo
    expect(ehDiaUtil('2026-08-10')).toBe(true); //  segunda
  });

  it('recusa feriado em dia de semana', () => {
    expect(ehDiaUtil('2026-12-25')).toBe(false); // Natal, sexta
  });

  it('sem calendário de feriados, só o fim de semana pesa', () => {
    expect(ehDiaUtil('2026-12-25', SEM_FERIADOS)).toBe(true);
  });

  it('data vazia ou inválida não é dia útil', () => {
    expect(ehDiaUtil('')).toBe(false);
    expect(ehDiaUtil('2026-13-45')).toBe(false);
  });
});

describe('somarDiasUteis', () => {
  it('somar 1 a uma sexta cai na segunda', () => {
    expect(somarDiasUteis('2026-08-07', 1, SEM_FERIADOS)).toBe('2026-08-10');
  });

  it('anda para trás com n negativo', () => {
    expect(somarDiasUteis('2026-08-10', -1, SEM_FERIADOS)).toBe('2026-08-07');
  });

  it('n = 0 devolve a data como está, mesmo num sábado', () => {
    // Empurrar para o próximo útil aqui faria uma etapa de duração 1 mudar de
    // lugar sozinha só por ser recalculada. Quem quer isso chama proximoDiaUtil.
    expect(somarDiasUteis('2026-08-08', 0, SEM_FERIADOS)).toBe('2026-08-08');
  });

  it('pula o feriado', () => {
    // 25/12/2026 é sexta; somar 1 a 24/12 (quinta) pula Natal e o fim de semana.
    expect(somarDiasUteis('2026-12-24', 1)).toBe('2026-12-28');
  });

  /**
   * O TESTE QUE PEGA UMA IMPLEMENTAÇÃO EM MILISSEGUNDOS.
   *
   * No Brasil não há horário de verão desde 2019, mas o fuso do ambiente que
   * roda o app (ou o CI) não é escolha nossa. Somar 86.400.000 ms atravessando a
   * madrugada em que o relógio anda ou volta uma hora produz 23h ou 25h, e o
   * `Date` resultante cai no dia anterior ou no seguinte. `setDate` é imune
   * porque opera no calendário, não no instante.
   */
  it('não escorrega na virada de horário de verão', () => {
    // Domingos de virada no hemisfério norte (março e novembro) e no sul.
    for (const [de, ate] of [
      ['2026-03-06', '2026-03-16'],
      ['2026-10-30', '2026-11-09'],
      ['2026-02-13', '2026-02-23'],
    ]) {
      // 6 dias úteis à frente = uma semana e um dia, sem feriado no caminho.
      expect(somarDiasUteis(de, 6, SEM_FERIADOS), de).toBe(ate);
    }
  });

  it('atravessa meses e anos sem se perder', () => {
    expect(somarDiasUteis('2026-12-30', 3, SEM_FERIADOS)).toBe('2027-01-04');
  });
});

describe('proximoDiaUtil e diaUtilAnterior', () => {
  it('devolvem o próprio dia quando ele já é útil', () => {
    expect(proximoDiaUtil('2026-08-10')).toBe('2026-08-10');
    expect(diaUtilAnterior('2026-08-10')).toBe('2026-08-10');
  });

  it('empurram para frente e para trás a partir do fim de semana', () => {
    expect(proximoDiaUtil('2026-08-08')).toBe('2026-08-10'); // sábado → segunda
    expect(diaUtilAnterior('2026-08-08')).toBe('2026-08-07'); // sábado → sexta
  });
});

describe('duracaoDiasUteis', () => {
  it('conta as duas pontas — um dia só é 1, não 0', () => {
    expect(duracaoDiasUteis('2026-08-10', '2026-08-10', SEM_FERIADOS)).toBe(1);
  });

  it('uma semana corrida tem 5 dias úteis', () => {
    expect(duracaoDiasUteis('2026-08-10', '2026-08-16', SEM_FERIADOS)).toBe(5);
  });

  it('desconta o feriado que cai em dia de semana', () => {
    // Semana do Natal de 2026: 21 a 25 (seg-sex), com o Natal na sexta.
    expect(duracaoDiasUteis('2026-12-21', '2026-12-25', SEM_FERIADOS)).toBe(5);
    expect(duracaoDiasUteis('2026-12-21', '2026-12-25')).toBe(4);
  });

  it('NÃO desconta duas vezes o feriado que cai no fim de semana', () => {
    // 01/05/2027 é sábado. A semana continua com 5 dias úteis — o dia já não
    // contava. Descontar de novo é o erro clássico de somar as duas listas.
    expect(duracaoDiasUteis('2027-04-26', '2027-05-02')).toBe(5);
  });

  it('devolve 0 fora de ordem ou com data inválida', () => {
    expect(duracaoDiasUteis('2026-08-20', '2026-08-10')).toBe(0);
    expect(duracaoDiasUteis('', '2026-08-10')).toBe(0);
  });

  it('aceita um calendário próprio, para parada de obra', () => {
    const comParada = calendarioDe(['2026-08-12']);
    expect(duracaoDiasUteis('2026-08-10', '2026-08-14', comParada)).toBe(4);
  });
});

describe('getWorkingDays continua sendo a mesma porta', () => {
  it('delega para duracaoDiasUteis com o calendário brasileiro', () => {
    expect(getWorkingDays('2026-12-21', '2026-12-25')).toBe(
      duracaoDiasUteis('2026-12-21', '2026-12-25', CALENDARIO_BR)
    );
  });

  it('mantém o contrato antigo de entrada vazia', () => {
    expect(getWorkingDays('', '')).toBe(0);
  });
});
