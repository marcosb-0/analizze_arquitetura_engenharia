/**
 * A aritmética do calendário de tarefas, trancada contra a próxima edição.
 *
 * Os três modos de falha que este arquivo existe para pegar são os mesmos que já
 * custaram caro em outras telas — e todos aparecem só em certos meses, que é o
 * que os faz sobreviver a uma conferida rápida na tela:
 *
 *   1. `new Date('2026-08-01')` lido como UTC, que devolve 31/jul em UTC-3 e
 *      desloca a grade inteira em uma coluna;
 *   2. a grade com número FIXO de semanas, que ou corta o fim do mês ou pendura
 *      uma faixa vazia;
 *   3. o agrupamento que descarta em silêncio o que não tem prazo.
 */
import { describe, it, expect } from 'vitest';
import type { Tarefa } from '../types';
import {
  DIAS_SEMANA,
  agruparPorPrazo,
  deslocarMes,
  gradeDoMes,
  inicioDoMes,
  mesDe,
  rotuloMes,
} from './calendarioTarefas';

function tarefa(t: Partial<Tarefa> & { id: string }): Tarefa {
  return {
    titulo: `Tarefa ${t.id}`,
    status: 'A fazer',
    prioridade: 'Média',
    criadoPor: 'u-admin',
    createdAt: '2026-08-01T12:00:00Z',
    ...t,
  };
}

describe('inicioDoMes / mesDe', () => {
  it('reduz qualquer dia ao 1º do mês dele', () => {
    expect(inicioDoMes('2026-08-31')).toBe('2026-08-01');
    expect(inicioDoMes('2026-01-01')).toBe('2026-01-01');
    expect(mesDe('2026-08-31')).toBe('2026-08');
  });
});

describe('deslocarMes', () => {
  it('anda para frente e para trás dentro do ano', () => {
    expect(deslocarMes('2026-08-01', 1)).toBe('2026-09-01');
    expect(deslocarMes('2026-08-01', -1)).toBe('2026-07-01');
  });

  /**
   * A virada de ano é o caso que uma implementação por manipulação de string
   * (`mes + 1`) erra: dezembro + 1 vira "mês 13", e a grade fica vazia sem erro
   * nenhum na tela.
   */
  it('atravessa a virada de ano nos dois sentidos', () => {
    expect(deslocarMes('2026-12-01', 1)).toBe('2027-01-01');
    expect(deslocarMes('2026-01-01', -1)).toBe('2025-12-01');
  });

  /**
   * `setMonth` sobre o dia 31 pularia o mês seguinte inteiro (31/mar + 1 mês =
   * 1º/mai, porque abril não tem 31). Aqui a âncora é normalizada antes, e é
   * este teste que impede alguém de tirar a normalização por parecer redundante.
   */
  it('normaliza a âncora antes de andar, então o dia 31 não pula um mês', () => {
    expect(deslocarMes('2026-03-31', 1)).toBe('2026-04-01');
  });
});

describe('rotuloMes', () => {
  it('escreve o mês por extenso em português', () => {
    expect(rotuloMes('2026-08-01')).toBe('agosto de 2026');
  });
});

describe('gradeDoMes', () => {
  it('tem sete colunas, na mesma ordem do cabeçalho', () => {
    const semanas = gradeDoMes('2026-08-01');
    expect(DIAS_SEMANA).toHaveLength(7);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  /**
   * O TESTE QUE JUSTIFICA O ARQUIVO. 1º/ago/2026 é um SÁBADO: a grade tem de
   * começar no domingo anterior, 26/jul. Se alguém trocar `dataLocal` por
   * `new Date(iso)`, a data base vira 31/jul (meia-noite UTC lida em UTC-3), a
   * grade começa em 26/jul mesmo assim por acidente em alguns meses — e erra
   * uma coluna inteira nos meses em que o dia 1º cai perto da borda.
   */
  it('começa no domingo anterior ao dia 1º e termina no sábado seguinte ao último', () => {
    const semanas = gradeDoMes('2026-08-01');
    expect(semanas[0][0]).toBe('2026-07-26');
    expect(semanas[0][6]).toBe('2026-08-01');
    expect(semanas.at(-1)!.at(-1)).toBe('2026-09-05');
  });

  /**
   * O número de semanas VARIA, e forçá-lo em 6 acrescenta uma faixa vazia em
   * quase todo mês. Fevereiro de 2026 é o caso extremo: 28 dias começando num
   * domingo cabem em 4 semanas exatas, sem um único dia de outro mês.
   */
  it('emite só as semanas que o mês ocupa', () => {
    expect(gradeDoMes('2026-02-01')).toHaveLength(4);
    expect(gradeDoMes('2026-11-01')).toHaveLength(5);
    expect(gradeDoMes('2026-08-01')).toHaveLength(6);
  });

  it('cobre todos os dias do mês, sem buraco nem repetição', () => {
    const dias = gradeDoMes('2026-08-01').flat();
    const doMes = dias.filter((d) => mesDe(d) === '2026-08');
    expect(doMes).toHaveLength(31);
    expect(new Set(dias).size).toBe(dias.length);
  });

  /** Qualquer dia serve de âncora — a tela guarda o 1º, mas não é obrigação. */
  it('não depende de a âncora ser o dia 1º', () => {
    expect(gradeDoMes('2026-08-17')).toEqual(gradeDoMes('2026-08-01'));
  });
});

describe('agruparPorPrazo', () => {
  it('indexa pelo dia do prazo e separa o que não tem data', () => {
    const { porDia, semPrazo } = agruparPorPrazo([
      tarefa({ id: 'a', prazo: '2026-08-12' }),
      tarefa({ id: 'b', prazo: '2026-08-12' }),
      tarefa({ id: 'c' }),
    ]);

    expect(porDia['2026-08-12'].map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(semPrazo.map((t) => t.id)).toEqual(['c']);
  });

  /**
   * A tarefa sem prazo é a MAIORIA das tarefas de escritório. Se ela sumir do
   * agrupamento, o calendário passa a esconder metade do módulo sem dizer — e é
   * o trilho "Sem data" que deixa de ter o que mostrar.
   */
  it('não descarta a tarefa sem prazo', () => {
    const { semPrazo } = agruparPorPrazo([tarefa({ id: 'a' }), tarefa({ id: 'b' })]);
    expect(semPrazo).toHaveLength(2);
  });

  /**
   * Ao contrário do quadro, que corta a concluída antiga da coluna "Feito" para
   * ela não virar cemitério: no calendário a data já separa passado de presente,
   * e um mês sem o que foi feito conta metade da história.
   */
  it('mantém a concluída no dia dela', () => {
    const { porDia } = agruparPorPrazo([
      tarefa({ id: 'a', prazo: '2026-01-05', status: 'Concluída', concluidaEm: '2026-01-05T10:00:00Z' }),
    ]);
    expect(porDia['2026-01-05']).toHaveLength(1);
  });

  it('ordena cada dia pela mesma régua do quadro — prioridade desempata', () => {
    const { porDia } = agruparPorPrazo([
      tarefa({ id: 'baixa', prazo: '2026-08-12', prioridade: 'Baixa' }),
      tarefa({ id: 'alta', prazo: '2026-08-12', prioridade: 'Alta' }),
    ]);
    expect(porDia['2026-08-12'].map((t) => t.id)).toEqual(['alta', 'baixa']);
  });
});
