/**
 * As regras da aba de tarefas, trancadas contra a próxima edição.
 *
 * O que aqui se protege não é "o código faz o que escrevi" — é um conjunto de
 * modos de falha que já custaram caro em outras telas deste projeto, e que
 * reaparecem sozinhos em qualquer módulo novo com data e agrupamento:
 *
 *   1. `date` interpretado como UTC (nove telas já erraram, com o helper pronto);
 *   2. `undefined` participando de ordenação e indo parar antes do que tem prazo;
 *   3. um agrupamento que descarta silenciosamente itens de um status.
 */
import { describe, it, expect } from 'vitest';
import type { Tarefa } from '../types';
import {
  COLUNAS,
  agruparPorStatus,
  concluidaRecente,
  contarMinhasAbertas,
  minhasDoDia,
  ordenarTarefas,
  situacaoPrazo,
} from './tarefas';

const HOJE = '2026-08-08';

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

describe('situacaoPrazo — a armadilha da coluna `date` (§ data.ts)', () => {
  it('classifica atrasada, hoje e futura pela comparação de string ISO', () => {
    expect(situacaoPrazo('2026-08-07', HOJE)).toBe('atrasada');
    expect(situacaoPrazo('2026-08-08', HOJE)).toBe('hoje');
    expect(situacaoPrazo('2026-08-09', HOJE)).toBe('futura');
    expect(situacaoPrazo(undefined, HOJE)).toBe('sem-prazo');
  });

  /**
   * O TESTE QUE JUSTIFICA O ARQUIVO. Se alguém trocar a comparação de string por
   * `new Date(prazo) < new Date(hoje)`, o construtor lê '2026-08-08' como
   * meia-noite UTC — 21h do dia 7 em São Paulo — e a tarefa de HOJE passa a ser
   * anunciada como ATRASADA para quem abre o app à noite. O bug não aparece de
   * manhã, que é quando se testa.
   */
  it('a virada de ano e o fim de mês não dependem de fuso nenhum', () => {
    expect(situacaoPrazo('2026-12-31', '2027-01-01')).toBe('atrasada');
    expect(situacaoPrazo('2027-01-01', '2026-12-31')).toBe('futura');
    expect(situacaoPrazo('2026-02-28', '2026-02-28')).toBe('hoje');
  });
});

describe('ordenarTarefas', () => {
  it('põe o prazo mais apertado primeiro', () => {
    const ordenada = ordenarTarefas([
      tarefa({ id: 'c', prazo: '2026-08-20' }),
      tarefa({ id: 'a', prazo: '2026-08-01' }),
      tarefa({ id: 'b', prazo: '2026-08-10' }),
    ]);
    expect(ordenada.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  /**
   * Sem a guarda de `undefined`, a comparação de strings coloca "sem prazo" no
   * começo — "algum dia" acima de "vence hoje", que é o inverso do que a lista
   * existe para dizer.
   */
  it('joga o que não tem prazo para o FIM, nunca para o começo', () => {
    const ordenada = ordenarTarefas([
      tarefa({ id: 'sem' }),
      tarefa({ id: 'com', prazo: '2026-09-30' }),
    ]);
    expect(ordenada.map((t) => t.id)).toEqual(['com', 'sem']);
  });

  it('desempata prazo igual pela prioridade', () => {
    const ordenada = ordenarTarefas([
      tarefa({ id: 'baixa', prazo: HOJE, prioridade: 'Baixa' }),
      tarefa({ id: 'alta', prazo: HOJE, prioridade: 'Alta' }),
      tarefa({ id: 'media', prazo: HOJE, prioridade: 'Média' }),
    ]);
    expect(ordenada.map((t) => t.id)).toEqual(['alta', 'media', 'baixa']);
  });

  it('não muda o array recebido', () => {
    const original = [tarefa({ id: 'b', prazo: '2026-08-20' }), tarefa({ id: 'a', prazo: '2026-08-01' })];
    ordenarTarefas(original);
    expect(original.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('concluidaRecente — o corte da coluna "Feito"', () => {
  it('mantém o que fechou dentro da janela e descarta o mais velho', () => {
    expect(concluidaRecente(tarefa({ id: 'a', concluidaEm: '2026-08-06T10:00:00Z' }), HOJE)).toBe(true);
    // 14 dias exatos ainda conta — o corte é inclusivo na borda.
    expect(concluidaRecente(tarefa({ id: 'b', concluidaEm: '2026-07-25T10:00:00Z' }), HOJE)).toBe(true);
    expect(concluidaRecente(tarefa({ id: 'c', concluidaEm: '2026-07-24T10:00:00Z' }), HOJE)).toBe(false);
  });

  /**
   * Concluir é otimista: o card muda de coluna antes de o servidor carimbar
   * `concluida_em`. Se "sem carimbo" contasse como antigo, a tarefa sumiria da
   * tela no exato gesto de concluí-la e voltaria no refresh seguinte.
   */
  it('sem carimbo do servidor conta como recente', () => {
    expect(concluidaRecente(tarefa({ id: 'a', status: 'Concluída' }), HOJE)).toBe(true);
  });
});

describe('agruparPorStatus', () => {
  it('distribui nas quatro colunas e ordena dentro de cada uma', () => {
    const grupos = agruparPorStatus(
      [
        tarefa({ id: 'f2', status: 'Fazendo', prazo: '2026-08-20' }),
        tarefa({ id: 'f1', status: 'Fazendo', prazo: '2026-08-02' }),
        tarefa({ id: 'r1', status: 'Em revisão' }),
        tarefa({ id: 'a1', status: 'A fazer' }),
      ],
      HOJE
    );
    expect(grupos['Fazendo'].map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(grupos['Em revisão']).toHaveLength(1);
    expect(grupos['A fazer']).toHaveLength(1);
    expect(grupos['Concluída']).toHaveLength(0);
  });

  it('esconde da coluna "Feito" o que fechou há muito tempo', () => {
    const grupos = agruparPorStatus(
      [
        tarefa({ id: 'nova', status: 'Concluída', concluidaEm: '2026-08-07T10:00:00Z' }),
        tarefa({ id: 'velha', status: 'Concluída', concluidaEm: '2026-01-01T10:00:00Z' }),
      ],
      HOJE
    );
    expect(grupos['Concluída'].map((t) => t.id)).toEqual(['nova']);
  });

  /**
   * As chaves são as quatro colunas, sempre — inclusive vazias. A tela mapeia
   * `COLUNAS` sobre este objeto, e uma chave ausente renderizaria `undefined.map`.
   */
  it('devolve as quatro colunas mesmo sem nenhuma tarefa', () => {
    const grupos = agruparPorStatus([], HOJE);
    for (const coluna of COLUNAS) expect(grupos[coluna]).toEqual([]);
  });
});

describe('minhasDoDia', () => {
  const lista = [
    tarefa({ id: 'atrasada', responsavelId: 'eu', prazo: '2026-08-01' }),
    tarefa({ id: 'hoje', responsavelId: 'eu', prazo: HOJE }),
    tarefa({ id: 'futura', responsavelId: 'eu', prazo: '2026-09-01' }),
    tarefa({ id: 'sem-data', responsavelId: 'eu' }),
    tarefa({ id: 'feita', responsavelId: 'eu', status: 'Concluída' }),
    tarefa({ id: 'de-outro', responsavelId: 'outra-pessoa', prazo: HOJE }),
    tarefa({ id: 'sem-dono', prazo: HOJE }),
  ];

  it('separa a minha pauta por urgência', () => {
    const blocos = minhasDoDia(lista, 'eu', HOJE);
    expect(blocos.atrasada.map((t) => t.id)).toEqual(['atrasada']);
    expect(blocos.hoje.map((t) => t.id)).toEqual(['hoje']);
    expect(blocos.futura.map((t) => t.id)).toEqual(['futura']);
    expect(blocos['sem-prazo'].map((t) => t.id)).toEqual(['sem-data']);
  });

  /**
   * Um to-do que omite item em silêncio é pior que não ter to-do. Tarefa sem
   * prazo tem de aparecer em ALGUM bloco — o descarte foi a primeira versão
   * desta função e escondia a maior parte da rotina de escritório, que é
   * justamente o que o módulo existe para registrar.
   */
  it('não engole a tarefa sem prazo', () => {
    const blocos = minhasDoDia([tarefa({ id: 'x', responsavelId: 'eu' })], 'eu', HOJE);
    const total = Object.values(blocos).reduce((n, b) => n + b.length, 0);
    expect(total).toBe(1);
  });

  it('ignora o que é de outra pessoa, o que não tem dono e o que já fechou', () => {
    const blocos = minhasDoDia(lista, 'eu', HOJE);
    const ids = Object.values(blocos).flat().map((t) => t.id);
    expect(ids).not.toContain('de-outro');
    expect(ids).not.toContain('sem-dono');
    expect(ids).not.toContain('feita');
  });

  it('sem usuário devolve tudo vazio em vez de a pauta alheia', () => {
    const blocos = minhasDoDia(lista, undefined, HOJE);
    expect(Object.values(blocos).flat()).toEqual([]);
  });
});

describe('contarMinhasAbertas — o selo do menu lateral', () => {
  it('conta só as minhas que ainda não fecharam', () => {
    const lista = [
      tarefa({ id: 'a', responsavelId: 'eu' }),
      tarefa({ id: 'b', responsavelId: 'eu', status: 'Fazendo' }),
      tarefa({ id: 'c', responsavelId: 'eu', status: 'Concluída' }),
      tarefa({ id: 'd', responsavelId: 'outra' }),
    ];
    expect(contarMinhasAbertas(lista, 'eu')).toBe(2);
    expect(contarMinhasAbertas(lista, undefined)).toBe(0);
  });
});
