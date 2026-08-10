import { describe, it, expect } from 'vitest';
import { LinhaComposicaoExpandida } from '../types';
import {
  ehDescendenteDe,
  chaveDoNo,
  linhasVisiveis,
  chavesComFilhos,
  coeficienteParaProdutividade,
  produtividadeParaCoeficiente,
  desvioDoIndice,
  somarFolhas,
  participacao,
} from './composicao';

function linha(over: Partial<LinhaComposicaoExpandida> & { caminho: string[] }): LinhaComposicaoExpandida {
  return {
    nivel: over.caminho.length,
    ordem: over.caminho,
    componenteId: over.caminho.join('-'),
    paiId: 'topo',
    insumoId: over.caminho[over.caminho.length - 1],
    descricao: 'item',
    unidade: 'UN',
    categoria: 'Material',
    tipoItem: 'Insumo',
    ativo: true,
    coeficiente: 1,
    coefAcumulado: 1,
    ehFolha: true,
    ehHora: false,
    precoUnitario: 1,
    precoNivel: 4,
    precoFonte: 'Referência',
    custo: 0,
    ...over,
  };
}

// A árvore usada nos testes espelha o dado real: alvenaria com pedreiro,
// servente, tijolo e argamassa, e cimento dentro da argamassa.
//   [ped] [ser] [tij] [arg] → [arg, cim]
const ARVORE: LinhaComposicaoExpandida[] = [
  linha({ caminho: ['ped'], custo: 65.19, ehHora: true, categoria: 'Mão de Obra' }),
  linha({ caminho: ['ser'], custo: 24.13, ehHora: true, categoria: 'Mão de Obra' }),
  linha({ caminho: ['tij'], custo: 51.44 }),
  linha({ caminho: ['arg'], custo: 6.72, ehFolha: false, tipoItem: 'Composicao' }),
  linha({ caminho: ['arg', 'cim'], custo: 6.72, coefAcumulado: 8.96 }),
];

describe('ehDescendenteDe', () => {
  it('reconhece descendente pelo prefixo do caminho', () => {
    expect(ehDescendenteDe(ARVORE[4], ['arg'])).toBe(true);
  });

  it('não considera um nó descendente de si mesmo', () => {
    expect(ehDescendenteDe(ARVORE[3], ['arg'])).toBe(false);
  });

  it('não confunde irmãos que contêm os mesmos insumos', () => {
    // Dois ramos com os mesmos ids em ordem diferente: contenção de array diria
    // que um é ancestral do outro. É a razão de a comparação ser por prefixo.
    const ramoA = linha({ caminho: ['arg', 'cim'] });
    expect(ehDescendenteDe(ramoA, ['cim'])).toBe(false);
  });

  it('não reconhece parentesco quando o prefixo diverge no meio', () => {
    const neto = linha({ caminho: ['arg', 'areia', 'x'] });
    expect(ehDescendenteDe(neto, ['arg', 'cim'])).toBe(false);
  });
});

describe('linhasVisiveis', () => {
  it('devolve tudo quando nada está recolhido', () => {
    expect(linhasVisiveis(ARVORE, new Set())).toHaveLength(5);
  });

  it('esconde a subárvore mas mantém o nó recolhido visível', () => {
    const visiveis = linhasVisiveis(ARVORE, new Set(['arg']));
    expect(visiveis).toHaveLength(4);
    expect(visiveis.map(chaveDoNo)).toContain('arg');
    expect(visiveis.map(chaveDoNo)).not.toContain('arg/cim');
  });

  it('ignora chave recolhida que não corresponde a nenhum nó', () => {
    expect(linhasVisiveis(ARVORE, new Set(['inexistente']))).toHaveLength(5);
  });
});

describe('chavesComFilhos', () => {
  it('marca só os nós que não são folha', () => {
    expect(chavesComFilhos(ARVORE)).toEqual(new Set(['arg']));
  });
});

describe('conversão coeficiente ⇄ produtividade', () => {
  it('converte o coeficiente do SINAPI em unidades por dia', () => {
    // 1,939 h/m² com jornada de 8 h = 4,126 m² por dia por pedreiro.
    expect(coeficienteParaProdutividade(1.939, 8)).toBeCloseTo(4.126, 3);
  });

  it('volta ao coeficiente sem perder o valor', () => {
    const prod = coeficienteParaProdutividade(1.939, 8)!;
    expect(produtividadeParaCoeficiente(prod, 8)).toBeCloseTo(1.939, 6);
  });

  it('devolve null em vez de Infinity quando a entrada é zero', () => {
    // Renderizar Infinity daria "∞ m²/dia" na tela; a tela precisa poder
    // distinguir "não dá para converter" de um número.
    expect(coeficienteParaProdutividade(0, 8)).toBeNull();
    expect(produtividadeParaCoeficiente(0, 8)).toBeNull();
  });

  it('devolve null quando a jornada não foi configurada', () => {
    expect(coeficienteParaProdutividade(1.939, 0)).toBeNull();
  });

  it('devolve null para entrada não numérica', () => {
    expect(coeficienteParaProdutividade(NaN, 8)).toBeNull();
  });
});

describe('desvioDoIndice', () => {
  it('é negativo quando a equipe rende mais que o SINAPI', () => {
    expect(desvioDoIndice(1.65, 1.939)).toBeCloseTo(-14.9, 1);
  });

  it('é zero quando o índice está intacto', () => {
    expect(desvioDoIndice(1.939, 1.939)).toBe(0);
  });

  it('é null quando o índice é próprio (sem referência)', () => {
    expect(desvioDoIndice(1.65, undefined)).toBeNull();
  });
});

describe('somarFolhas', () => {
  it('soma só as folhas — o galho carrega o subtotal e duplicaria', () => {
    // 65,19 + 24,13 + 51,44 + 6,72 (cimento). O 6,72 da argamassa é o mesmo
    // dinheiro do cimento visto do galho: somá-lo daria 154,20 em vez de 147,48.
    expect(somarFolhas(ARVORE)).toBeCloseTo(147.48, 2);
  });

  it('devolve zero para árvore vazia', () => {
    expect(somarFolhas([])).toBe(0);
  });
});

describe('participacao', () => {
  it('calcula o percentual da parcela', () => {
    expect(participacao(89.32, 160.92)).toBeCloseTo(55.5, 1);
  });

  it('devolve zero em vez de NaN quando o total é zero', () => {
    expect(participacao(10, 0)).toBe(0);
  });
});
