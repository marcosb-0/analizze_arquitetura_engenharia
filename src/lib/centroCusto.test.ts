import { describe, expect, it } from 'vitest';
import { comDescendentes } from './centroCusto';
import { CentroCusto } from '../types';

const centro = (id: string, caminho: string, nivel: number): CentroCusto => ({
  id,
  codigo: caminho.split(' / ').at(-1)!,
  nome: `Centro ${id}`,
  tipo: 'Analitico',
  natureza: 'Administrativo',
  ativo: true,
  nivel,
  caminho,
  temFilhos: false,
});

// A armadilha do prefixo é real: '110' é prefixo de '1100', e um startsWith sem
// o separador faria a subárvore de um centro engolir a do vizinho.
const ARVORE: CentroCusto[] = [
  centro('raiz', '1000', 1),
  centro('adm', '1000 / 1100', 2),
  centro('escritorio', '1000 / 1100 / 1110', 3),
  centro('comercial', '1000 / 1100 / 1120', 3),
  centro('curto', '1000 / 110', 2),
  centro('filho-do-curto', '1000 / 110 / 1', 3),
  centro('obras', '1000 / 2000', 2),
];

describe('comDescendentes', () => {
  it('inclui o próprio centro', () => {
    expect(comDescendentes(ARVORE, 'escritorio')).toEqual(new Set(['escritorio']));
  });

  it('traz a subárvore inteira de um agrupador', () => {
    expect(comDescendentes(ARVORE, 'adm')).toEqual(new Set(['adm', 'escritorio', 'comercial']));
  });

  it('não deixa o prefixo de um código engolir o vizinho mais longo', () => {
    const daRaizCurta = comDescendentes(ARVORE, 'curto');
    expect(daRaizCurta).toEqual(new Set(['curto', 'filho-do-curto']));
    expect(daRaizCurta.has('adm')).toBe(false);
    expect(daRaizCurta.has('escritorio')).toBe(false);
  });

  it('da raiz, alcança tudo', () => {
    expect(comDescendentes(ARVORE, 'raiz').size).toBe(ARVORE.length);
  });

  it('centro desconhecido devolve só ele — filtro não vira "tudo"', () => {
    expect(comDescendentes(ARVORE, 'sumiu')).toEqual(new Set(['sumiu']));
  });
});
