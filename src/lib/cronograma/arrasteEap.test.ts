import { describe, it, expect } from 'vitest';
import {
  alturaDe,
  motivoParaNaoAgrupar,
  resolverDestino,
  zonaDoPonteiro,
} from './arrasteEap';
import { mover } from './reordenar';
import type { EtapaCronograma } from '../../types';

/**
 * O que estes testes trancam é a PARIDADE COM O BANCO.
 *
 * Cada recusa aqui existe porque uma trigger recusaria — `fn_etapa_hierarquia`
 * e `fn_etapa_pai_sem_execucao`. Se a tela deixar de recusar, o erro não some:
 * ele muda de lugar, e passa a chegar como um toast vermelho depois de a linha
 * ter pulado na tela, num gesto que já pareceu ter funcionado.
 *
 * O caso do nível é o único em que a tela é MAIS restritiva que o servidor, e
 * de propósito: a trigger roda sobre a linha que muda de pai, e as filhas dela
 * viajam sem disparar nada.
 */
const etapa = (id: string, extra: Partial<EtapaCronograma> = {}): EtapaCronograma => ({
  id,
  projetoId: 'obra-1',
  nome: `Etapa ${id}`,
  dataInicio: '2026-01-01',
  dataFim: '2026-12-31',
  responsavelId: '',
  percentualExecutado: 0,
  quantidadeExecutada: 0,
  status: 'Não Iniciado',
  parentId: '',
  ordem: 1,
  ehMarco: false,
  agendamento: 'manual',
  baselineInicio: '',
  baselineFim: '',
  baselineEm: '',
  nivel: 0,
  wbsCodigo: '',
  ehFolha: true,
  inicioEfetivo: '2026-01-01',
  fimEfetivo: '2026-12-31',
  updatedAt: '2026-08-10T10:00:00Z',
  ...extra,
});

/** grupo(1) > [x(1.1), y(1.2)] ; solta(2) */
const comGrupo = (): EtapaCronograma[] => [
  etapa('grupo', { ordem: 1, ehFolha: false }),
  etapa('x', { parentId: 'grupo', ordem: 1, nivel: 1 }),
  etapa('y', { parentId: 'grupo', ordem: 2, nivel: 1 }),
  etapa('solta', { ordem: 2 }),
];

/** Uma pilha de 4 níveis: n0 > n1 > n2 > n3 — a EAP cheia. */
const profunda = (): EtapaCronograma[] => [
  etapa('n0', { nivel: 0, ehFolha: false }),
  etapa('n1', { parentId: 'n0', nivel: 1, ehFolha: false }),
  etapa('n2', { parentId: 'n1', nivel: 2, ehFolha: false }),
  etapa('n3', { parentId: 'n2', nivel: 3 }),
];

const SEM_EXECUCAO = new Set<string>();

describe('zonaDoPonteiro', () => {
  it('divide a linha em antes / dentro / depois', () => {
    expect(zonaDoPonteiro(0.1, true)).toBe('antes');
    expect(zonaDoPonteiro(0.5, true)).toBe('dentro');
    expect(zonaDoPonteiro(0.9, true)).toBe('depois');
  });

  it('colapsa em duas metades quando o alvo não pode virar grupo', () => {
    // Sem isto, atravessar uma frente com orçamento — a maioria delas — pinta
    // o miolo de vermelho a cada linha percorrida.
    expect(zonaDoPonteiro(0.49, false)).toBe('antes');
    expect(zonaDoPonteiro(0.51, false)).toBe('depois');
  });
});

describe('alturaDe', () => {
  it('conta 0 na folha e 1 no grupo de um nível', () => {
    expect(alturaDe(comGrupo(), 'x')).toBe(0);
    expect(alturaDe(comGrupo(), 'grupo')).toBe(1);
  });

  it('conta a pilha inteira', () => {
    expect(alturaDe(profunda(), 'n0')).toBe(3);
    expect(alturaDe(profunda(), 'n2')).toBe(1);
  });
});

describe('motivoParaNaoAgrupar', () => {
  const alvo = (etapas: EtapaCronograma[], id: string) => etapas.find((e) => e.id === id)!;

  it('aceita um grupo comum', () => {
    const etapas = comGrupo();
    expect(motivoParaNaoAgrupar(etapas, 'solta', alvo(etapas, 'grupo'), SEM_EXECUCAO)).toBe('');
  });

  it('recusa a própria etapa e as descendentes dela', () => {
    const etapas = comGrupo();
    expect(motivoParaNaoAgrupar(etapas, 'grupo', alvo(etapas, 'grupo'), SEM_EXECUCAO)).not.toBe('');
    expect(motivoParaNaoAgrupar(etapas, 'grupo', alvo(etapas, 'x'), SEM_EXECUCAO)).not.toBe('');
  });

  it('recusa marco, execução e meta — as três de fn_etapa_pai_sem_execucao', () => {
    const etapas = [...comGrupo(), etapa('marco', { ehMarco: true, ordem: 3 })];
    expect(motivoParaNaoAgrupar(etapas, 'solta', alvo(etapas, 'marco'), SEM_EXECUCAO)).toMatch(
      /marco/
    );
    expect(motivoParaNaoAgrupar(etapas, 'solta', alvo(etapas, 'x'), new Set(['x']))).toMatch(
      /orçamento|medição/
    );

    const comMeta = comGrupo().map((e) =>
      e.id === 'x' ? { ...e, quantidadePrevista: 200, unidade: 'm²' } : e
    );
    expect(motivoParaNaoAgrupar(comMeta, 'solta', alvo(comMeta, 'x'), SEM_EXECUCAO)).toMatch(
      /meta/
    );
  });

  it('conta a subárvore inteira contra o teto de 4 níveis', () => {
    // A folha cabe dentro de n2 (viraria nível 3); o grupo de dois níveis, não
    // — os netos dele cairiam no nível 4 sem disparar trigger nenhuma, porque o
    // `parent_id` DELES não muda.
    const etapas = [
      ...profunda(),
      etapa('folha', { ordem: 2 }),
      etapa('pai', { ordem: 3, ehFolha: false }),
      etapa('filha', { parentId: 'pai', ordem: 1, nivel: 1 }),
    ];
    expect(motivoParaNaoAgrupar(etapas, 'folha', etapas.find((e) => e.id === 'n2')!, SEM_EXECUCAO)).toBe('');
    expect(
      motivoParaNaoAgrupar(etapas, 'pai', etapas.find((e) => e.id === 'n2')!, SEM_EXECUCAO)
    ).toMatch(/4 níveis/);
  });
});

describe('resolverDestino', () => {
  it('solta dentro do grupo, no fim das filhas dele', () => {
    const etapas = comGrupo();
    const r = resolverDestino(etapas, 'solta', 'grupo', 'dentro', SEM_EXECUCAO);
    expect(r.destino).toEqual({ paiId: 'grupo', indice: 2 });
    expect(r.recusa).toBe('');
  });

  it('solta antes e depois como irmão do alvo', () => {
    const etapas = comGrupo();
    expect(resolverDestino(etapas, 'solta', 'x', 'antes', SEM_EXECUCAO).destino).toEqual({
      paiId: 'grupo',
      indice: 0,
    });
    expect(resolverDestino(etapas, 'solta', 'x', 'depois', SEM_EXECUCAO).destino).toEqual({
      paiId: 'grupo',
      indice: 1,
    });
  });

  it('conta o índice na lista JÁ SEM a etapa arrastada', () => {
    // `y` depois de `x` dentro do mesmo grupo: sem descontar a própria linha, o
    // índice 2 jogaria `y` de volta onde ela já está e o gesto viraria um
    // no-op silencioso.
    const etapas = comGrupo();
    const r = resolverDestino(etapas, 'y', 'x', 'antes', SEM_EXECUCAO);
    expect(r.destino).toEqual({ paiId: 'grupo', indice: 0 });
    expect(mover(etapas, 'y', r.destino!)).toContainEqual({
      id: 'y',
      parentId: 'grupo',
      ordem: 1,
    });
  });

  it('não devolve destino nem recusa ao soltar sobre a própria linha', () => {
    const r = resolverDestino(comGrupo(), 'x', 'x', 'antes', SEM_EXECUCAO);
    expect(r).toEqual({ destino: null, recusa: '', resumo: '' });
  });

  it('recusa virar irmão de uma descendente da própria etapa', () => {
    const r = resolverDestino(comGrupo(), 'grupo', 'x', 'antes', SEM_EXECUCAO);
    expect(r.destino).toBeNull();
    expect(r.recusa).not.toBe('');
  });

  it('recusa o irmão que estouraria o teto de níveis', () => {
    // `pai` (1 nível abaixo) como irmão de `n3` cairia no nível 3 com a filha
    // no 4.
    const etapas = [
      ...profunda(),
      etapa('pai', { ordem: 2, ehFolha: false }),
      etapa('filha', { parentId: 'pai', ordem: 1, nivel: 1 }),
    ];
    expect(resolverDestino(etapas, 'pai', 'n3', 'depois', SEM_EXECUCAO).recusa).toMatch(
      /4 níveis/
    );
    // A folha sozinha cabe.
    expect(resolverDestino(etapas, 'filha', 'n3', 'depois', SEM_EXECUCAO).recusa).toBe('');
  });

  it('devolve o resumo que o rodapé e o leitor de tela anunciam', () => {
    const r = resolverDestino(comGrupo(), 'solta', 'grupo', 'dentro', SEM_EXECUCAO);
    expect(r.resumo).toContain('Etapa solta');
    expect(r.resumo).toContain('Etapa grupo');
  });
});
