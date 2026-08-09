import { describe, it, expect } from 'vitest';
import {
  aplainar,
  descendentes,
  ehAncestral,
  folhasDe,
  montarArvore,
  somenteFolhas,
} from './wbs';
import type { EtapaCronograma } from '../../types';

/**
 * A árvore da EAP é remontada no cliente a partir da lista plana da view, e a
 * numeração precisa bater com a que o Postgres calcula na CTE recursiva de
 * `v_etapas_cronograma` (20260809100000). Divergir significa a tela dizer "1.2"
 * onde o banco diz "1.3" — e o código da EAP é o que aparece no relatório
 * impresso e na conversa com o cliente.
 *
 * A CTE ordena por `ordem_path`, que é o array de `ordem` acumulado da raiz até
 * a folha; aqui a mesma coisa sai da ordenação por `ordem` em cada nível. Os
 * casos abaixo são o contrato entre as duas.
 */
const etapa = (
  id: string,
  extra: Partial<EtapaCronograma> = {}
): EtapaCronograma => ({
  id,
  projetoId: 'obra-1',
  nome: `Etapa ${id}`,
  dataInicio: '2026-01-01',
  dataFim: '2026-12-31',
  responsavelId: '',
  percentualExecutado: 0,
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
  updatedAt: '2026-08-09T10:00:00Z',
  ...extra,
});

/** Estrutura(1) > [Fôrma(1.1), Armação(1.2)] ; Acabamento(2) > Pintura(2.1) */
const obra = (): EtapaCronograma[] => [
  etapa('estrutura', { ordem: 1, ehFolha: false }),
  etapa('forma', { parentId: 'estrutura', ordem: 1 }),
  etapa('armacao', { parentId: 'estrutura', ordem: 2 }),
  etapa('acabamento', { ordem: 2, ehFolha: false }),
  etapa('pintura', { parentId: 'acabamento', ordem: 1 }),
];

describe('montarArvore', () => {
  it('numera a EAP em pré-ordem, como a CTE da view', () => {
    const plana = aplainar(montarArvore(obra()));
    expect(plana.map((n) => [n.etapa.id, n.wbs, n.nivel])).toEqual([
      ['estrutura', '1', 0],
      ['forma', '1.1', 1],
      ['armacao', '1.2', 1],
      ['acabamento', '2', 0],
      ['pintura', '2.1', 1],
    ]);
  });

  it('ordena irmãos por `ordem`, e não pela ordem de chegada da lista', () => {
    const embaralhada = [
      etapa('b', { ordem: 2 }),
      etapa('c', { ordem: 3 }),
      etapa('a', { ordem: 1 }),
    ];
    expect(montarArvore(embaralhada).map((n) => n.etapa.id)).toEqual(['a', 'b', 'c']);
  });

  it('desempata por id quando duas etapas têm a mesma ordem', () => {
    // Acontece antes do primeiro salvamento: `ordem` nasce com default 0.
    const empatadas = [etapa('z', { ordem: 0 }), etapa('a', { ordem: 0 })];
    expect(montarArvore(empatadas).map((n) => n.etapa.id)).toEqual(['a', 'z']);
  });

  /**
   * A NUMERAÇÃO É POSICIONAL, E ISSO É O CONTRATO COM A VIEW.
   *
   * Este caso existe porque a paridade que o cabeçalho deste arquivo promete
   * NÃO estava sendo testada: os demais casos comparam a numeração do cliente
   * consigo mesma, e passariam mesmo se o servidor numerasse de outro jeito.
   *
   * Era exatamente o que acontecia. A view montava o wbs_codigo a partir do
   * valor CRU de `ordem`, e bastava excluir uma etapa do meio — ordem 1,3,4 —
   * para o servidor dizer "3" onde a tela diz "2". Corrigido em
   * 20260809163932, que passou a numerar por `row_number()`.
   *
   * Se alguém trocar a numeração do cliente para usar `etapa.ordem`, este teste
   * cai e a migration correspondente precisa cair junto.
   */
  it('numera pela POSIÇÃO, não pelo valor de `ordem` — buraco não vira buraco no WBS', () => {
    const comBuraco = [
      etapa('a', { ordem: 1 }),
      etapa('b', { ordem: 3 }), // a de ordem 2 foi excluída
      etapa('c', { ordem: 47 }),
    ];
    expect(montarArvore(comBuraco).map((n) => n.wbs)).toEqual(['1', '2', '3']);
  });

  it('a numeração posicional também vale dentro de um grupo', () => {
    const comBuraco = [
      etapa('grupo', { ordem: 1, ehFolha: false }),
      etapa('x', { parentId: 'grupo', ordem: 5 }),
      etapa('y', { parentId: 'grupo', ordem: 9 }),
    ];
    const plana = aplainar(montarArvore(comBuraco));
    expect(plana.map((n) => n.wbs)).toEqual(['1', '1.1', '1.2']);
  });

  it('trata etapa órfã como raiz em vez de sumir com ela', () => {
    // Janela real: o console troca de obra antes de a nova busca chegar, ou a
    // RLS esconde o pai de um papel mas não a filha. Descartar seria o pior
    // modo de falha — a etapa some da tela e ninguém recebe erro.
    const orfa = [etapa('filha', { parentId: 'pai-que-nao-veio', ordem: 1 })];
    expect(montarArvore(orfa).map((n) => n.etapa.id)).toEqual(['filha']);
  });

  it('não entra em laço quando o estado local tem um ciclo', () => {
    // O banco barra (fn_etapa_hierarquia), mas um estado otimista a meio
    // caminho pode ter A dentro de B e B dentro de A.
    const ciclo = [
      etapa('a', { parentId: 'b', ordem: 1 }),
      etapa('b', { parentId: 'a', ordem: 1 }),
    ];
    expect(() => montarArvore(ciclo)).not.toThrow();
  });
});

describe('aplainar', () => {
  it('esconde os descendentes de um grupo recolhido, mas não o grupo', () => {
    const plana = aplainar(montarArvore(obra()), new Set(['estrutura']));
    expect(plana.map((n) => n.etapa.id)).toEqual([
      'estrutura',
      'acabamento',
      'pintura',
    ]);
  });

  it('sem nada recolhido devolve a árvore inteira', () => {
    expect(aplainar(montarArvore(obra()))).toHaveLength(5);
  });
});

describe('ehAncestral', () => {
  it('reconhece o pai direto e o avô', () => {
    const tresNiveis = [
      etapa('a', { ordem: 1, ehFolha: false }),
      etapa('b', { parentId: 'a', ordem: 1, ehFolha: false }),
      etapa('c', { parentId: 'b', ordem: 1 }),
    ];
    expect(ehAncestral(tresNiveis, 'a', 'c')).toBe(true);
    expect(ehAncestral(tresNiveis, 'b', 'c')).toBe(true);
  });

  it('não considera a própria etapa ancestral de si mesma', () => {
    expect(ehAncestral(obra(), 'estrutura', 'estrutura')).toBe(false);
  });

  it('é falso na direção contrária e entre ramos irmãos', () => {
    expect(ehAncestral(obra(), 'forma', 'estrutura')).toBe(false);
    expect(ehAncestral(obra(), 'estrutura', 'pintura')).toBe(false);
  });
});

describe('descendentes e folhas', () => {
  it('descendentes é estrito — não inclui a própria etapa', () => {
    expect(descendentes(obra(), 'estrutura').map((e) => e.id)).toEqual(['forma', 'armacao']);
  });

  it('folhasDe devolve a própria etapa quando ela já é folha', () => {
    // Evita um `if` em todo chamador que rola percentual de grupo.
    expect(folhasDe(obra(), 'pintura').map((e) => e.id)).toEqual(['pintura']);
  });

  it('folhasDe pula os grupos intermediários', () => {
    const tresNiveis = [
      etapa('a', { ordem: 1, ehFolha: false }),
      etapa('b', { parentId: 'a', ordem: 1, ehFolha: false }),
      etapa('c', { parentId: 'b', ordem: 1 }),
    ];
    expect(folhasDe(tresNiveis, 'a').map((e) => e.id)).toEqual(['c']);
  });

  it('somenteFolhas descarta os grupos — o recorte de todo agregado', () => {
    expect(somenteFolhas(obra()).map((e) => e.id)).toEqual(['forma', 'armacao', 'pintura']);
  });
});
