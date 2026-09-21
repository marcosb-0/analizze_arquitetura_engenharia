import { describe, expect, it } from 'vitest';
import { FormulaEncargo, RubricaEncargo } from '../types';
import { calcularRubricas, totaisEncargos, totalEncargos } from './encargos';
import { arredondar } from './preco';

/**
 * A tabela oficial, para conferir a conta contra um documento e não contra a
 * própria implementação.
 *
 * Fonte: SINAPI – Cálculos e Parâmetros, Apêndice 15 – Encargos Sociais –
 * Paraíba, Caixa Econômica Federal, vigência a partir de 01/2025, coluna SEM
 * DESONERAÇÃO. Os totais publicados são:
 *
 *            HORISTA   MENSALISTA
 *   A         36,80%      36,80%
 *   B         46,88%      17,11%
 *   C         12,27%       9,33%
 *   D         17,65%       6,61%
 *   TOTAL    113,60%      69,85%
 *
 * SOBRE OS CENTAVOS QUE NÃO BATEM: a tabela publicada arredonda cada célula
 * para 2 casas e soma as células arredondadas; esta implementação carrega 4
 * casas até o fim, como `numeric(7,4)` no banco. Daí 6,6019 aqui contra 6,61
 * publicado no total do grupo D do mensalista. A diferença é de arredondamento
 * acumulado, não de fórmula — e as células individuais (D1 e D2) batem à
 * centésima, que é o que prova a fórmula.
 */
function tabela(patch: Partial<Record<string, Partial<RubricaEncargo>>> = {}): RubricaEncargo[] {
  const linha = (
    codigo: string,
    grupo: RubricaEncargo['grupo'],
    descricao: string,
    h: number | null,
    m: number | null,
    ordem: number
  ): RubricaEncargo => ({
    codigo,
    grupo,
    descricao,
    sistema: true,
    percentualHorista: h,
    percentualMensalista: m,
    aplicaHorista: true,
    // `null` no mensalista destas três é "não incide", e a tabela oficial
    // imprime exatamente isso: B1, B2 e B7 não alcançam quem recebe o mês
    // inteiro independente de domingo, feriado ou chuva.
    aplicaMensalista: m !== null,
    formula: null,
    ordem,
    ativo: true,
    ...patch[codigo],
  });

  const derivada = (
    codigo: string,
    descricao: string,
    formula: FormulaEncargo,
    ordem: number
  ): RubricaEncargo => ({
    codigo,
    grupo: 'D',
    descricao,
    sistema: true,
    percentualHorista: null,
    percentualMensalista: null,
    aplicaHorista: true,
    aplicaMensalista: true,
    formula,
    ordem,
    ativo: true,
    ...patch[codigo],
  });

  return [
    linha('A1', 'A', 'INSS', 20, 20, 110),
    linha('A2', 'A', 'SESI', 1.5, 1.5, 120),
    linha('A3', 'A', 'SENAI', 1, 1, 130),
    linha('A4', 'A', 'INCRA', 0.2, 0.2, 140),
    linha('A5', 'A', 'SEBRAE', 0.6, 0.6, 150),
    linha('A6', 'A', 'Salário Educação', 2.5, 2.5, 160),
    linha('A7', 'A', 'Seguro Contra Acidentes de Trabalho', 3, 3, 170),
    linha('A8', 'A', 'FGTS', 8, 8, 180),
    linha('A9', 'A', 'SECONCI', 0, 0, 190),

    linha('B1', 'B', 'Repouso Semanal Remunerado', 18.02, null, 210),
    linha('B2', 'B', 'Feriados', 4.31, null, 220),
    linha('B3', 'B', 'Auxílio-Enfermidade', 0.86, 0.65, 230),
    linha('B4', 'B', '13º Salário', 10.96, 8.33, 240),
    linha('B5', 'B', 'Licença Paternidade', 0.07, 0.05, 250),
    linha('B6', 'B', 'Faltas Justificadas', 0.73, 0.56, 260),
    linha('B7', 'B', 'Dias de Chuvas', 2.04, null, 270),
    linha('B8', 'B', 'Auxílio Acidente de Trabalho', 0.1, 0.07, 280),
    linha('B9', 'B', 'Férias Gozadas', 9.76, 7.42, 290),
    linha('B10', 'B', 'Salário Maternidade', 0.03, 0.03, 300),

    linha('C1', 'C', 'Aviso Prévio Indenizado', 4.53, 3.45, 310),
    linha('C2', 'C', 'Aviso Prévio Trabalhado', 0.11, 0.08, 320),
    linha('C3', 'C', 'Férias Indenizadas', 4.29, 3.26, 330),
    linha('C4', 'C', 'Depósito Rescisão Sem Justa Causa', 2.96, 2.25, 340),
    linha('C5', 'C', 'Indenização Adicional', 0.38, 0.29, 350),

    derivada('D1', 'Reincidência de Grupo A sobre Grupo B', 'A*B', 410),
    derivada('D2', 'Reincidência de A sobre aviso trabalhado e do FGTS sobre indenizado', 'A*C2+A8*C1', 420),
  ];
}

const de = (rubricas: RubricaEncargo[], codigo: string) =>
  calcularRubricas(rubricas).find((r) => r.codigo === codigo);

describe('subtotais dos grupos digitados', () => {
  it('reproduz os totais de A, B e C da tabela publicada', () => {
    const t = totaisEncargos(tabela());
    expect(t.A).toEqual({ horista: 36.8, mensalista: 36.8 });
    expect(t.B).toEqual({ horista: 46.88, mensalista: 17.11 });
    expect(t.C).toEqual({ horista: 12.27, mensalista: 9.33 });
  });

  it('o grupo A é igual nos dois regimes — não é coincidência', () => {
    // A incide sobre a remuneração, seja ela qual for. É definição, não um
    // descuido da tabela a ser "corrigido" depois.
    const t = totaisEncargos(tabela());
    expect(t.A.horista).toBe(t.A.mensalista);
  });
});

describe('grupo D — as reincidências', () => {
  /**
   * Estes quatro números foram conferidos contra as quatro células publicadas
   * ANTES de existir código que os produzisse. É o que torna este teste uma
   * prova da fórmula, e não um retrato do que a implementação faz hoje.
   */
  it('D1 = A × B, conferido contra a tabela (17,25% e 6,30%)', () => {
    const t = tabela();
    expect(de(t, 'D1')?.valorHorista).toBe(17.2518); // 36,80 × 46,88 ÷ 100
    expect(de(t, 'D1')?.valorMensalista).toBe(6.2965); // 36,80 × 17,11 ÷ 100
  });

  it('D2 = A × C2 + FGTS × C1, conferido contra a tabela (0,40% e 0,31%)', () => {
    // O FGTS aparece sozinho porque aviso prévio INDENIZADO não é remuneração:
    // INSS e terceiros não incidem, só o FGTS. Já o aviso TRABALHADO é tempo
    // trabalhado e leva o grupo A inteiro. A assimetria é a razão de D2 existir.
    const t = tabela();
    expect(de(t, 'D2')?.valorHorista).toBe(0.4029); // 36,80×0,11 + 8×4,53
    expect(de(t, 'D2')?.valorMensalista).toBe(0.3054); // 36,80×0,08 + 8×3,45
  });

  it('desonerar muda só o A1, e o grupo D se move sozinho', () => {
    // A prova de que D é calculado e não guardado. Com desoneração o INSS cai
    // de 20% para 5% e a variante de D1 desconta o INSS sobre o 13º
    // (Lei nº 14.973/2024). Publicados: 9,67% e 0,39%.
    const t = tabela({
      A1: { percentualHorista: 5, percentualMensalista: 5 },
      D1: { formula: 'A*B-A1*B4' },
    });
    expect(totaisEncargos(t).A.horista).toBe(21.8);
    expect(de(t, 'D1')?.valorHorista).toBe(9.6718); // 21,80×46,88 − 5×10,96
    expect(de(t, 'D2')?.valorHorista).toBe(0.3864); // 21,80×0,11 + 8×4,53
  });

  it('rubrica desativada sai do grupo E dos operandos de D', () => {
    // Desativar o FGTS tira 8 pontos de A, o que move D1, e tira o segundo
    // termo inteiro de D2. Se D estivesse guardado, nada disso aconteceria.
    const semFgts = tabela({ A8: { ativo: false } });
    expect(totaisEncargos(semFgts).A.horista).toBe(28.8);
    expect(de(semFgts, 'D1')?.valorHorista).toBe(13.5014); // 28,80 × 46,88
    expect(de(semFgts, 'D2')?.valorHorista).toBeNull(); // sem A8 não há como somar
  });
});

describe('o total geral', () => {
  it('fecha em 113,60% horista e 69,85% mensalista', () => {
    const t = totaisEncargos(tabela());
    // 4 casas contra as 2 da tabela publicada — ver o cabeçalho deste arquivo.
    expect(t.total.horista).toBe(113.6047);
    expect(t.total.mensalista).toBe(69.8419);
  });

  it('é a soma dos quatro grupos, arredondada como o Postgres', () => {
    const t = totaisEncargos(tabela());
    const somaIngenua =
      (t.A.horista ?? 0) + (t.B.horista ?? 0) + (t.C.horista ?? 0) + (t.D.horista ?? 0);

    // A soma direta em ponto flutuante dá 113.60470000000001. O total NÃO é
    // esse número: `arredondar` fecha em 4 casas pela via decimal, que é o que
    // `numeric(7,4)` faz do outro lado. Deixar o resíduo passar colocaria um
    // dígito de lixo em toda comparação com o banco.
    expect(somaIngenua).not.toBe(113.6047);
    expect(arredondar(somaIngenua, 4)).toBe(113.6047);
    expect(t.total.horista).toBe(113.6047);
  });
});

describe('nulo é "não respondida", nunca zero', () => {
  it('uma rubrica em branco anula o grupo inteiro, não some da soma', () => {
    // O modo de falha que esta regra existe para impedir: `sum()` ignoraria o
    // FGTS em branco e devolveria 28,80 — um número errado que não parece
    // errado, cobrado em toda composição do catálogo.
    const t = totaisEncargos(tabela({ A8: { percentualHorista: null } }));
    expect(t.A.horista).toBeNull();
    expect(t.A.mensalista).toBe(36.8); // o outro regime segue respondido
  });

  it('grupo em branco derruba o total e o grupo D junto', () => {
    const t = totaisEncargos(tabela({ B4: { percentualHorista: null } }));
    expect(t.B.horista).toBeNull();
    expect(t.D.horista).toBeNull(); // D1 depende de B
    expect(t.total.horista).toBeNull();
    expect(t.total.mensalista).toBe(69.8419); // e o mensalista não é contaminado
  });

  it('tudo zerado e ativo é 0%, que é resposta diferente de "não sei"', () => {
    // O caso PJ no nível da empresa. Zero e nulo precisam continuar sendo
    // coisas distintas aqui, como são em `custoColaborador`.
    const zerada = tabela().map((r) => ({
      ...r,
      percentualHorista: r.formula ? null : 0,
      percentualMensalista: r.formula ? null : 0,
    }));
    expect(totalEncargos(zerada, 'Horista')).toBe(0);
  });
});

describe('"não incide" é diferente de "em branco"', () => {
  it('B1, B2 e B7 não entram no mensalista e não o deixam incompleto', () => {
    const t = totaisEncargos(tabela());
    // 46,88 − 18,02 − 4,31 − 2,04 = 22,51 seria a conta ingênua; a diferença
    // para 17,11 são os percentuais menores das outras sete no mensalista.
    expect(t.B.mensalista).toBe(17.11);
    expect(t.B.mensalista).not.toBeNull();
  });

  it('marcar "não incide" exclui a rubrica daquele regime só', () => {
    const t = totaisEncargos(tabela({ A9: { aplicaHorista: false, percentualHorista: null } }));
    expect(t.A.horista).toBe(36.8); // A9 é 0% nesta tabela
    expect(t.A.mensalista).toBe(36.8);
  });
});

describe('fórmula desconhecida falha alto', () => {
  it('não devolve null, que sumiria da soma em silêncio', () => {
    // Uma fórmula que entrou no CHECK do banco e não no `switch` daqui. Se
    // isto devolvesse null, o encargo sairia menor sem erro — o mesmo modo de
    // falha de uma coluna esquecida num trigger de propagação.
    const t = tabela({ D1: { formula: 'A*Z' as FormulaEncargo } });
    expect(() => calcularRubricas(t)).toThrow(/Fórmula de encargo desconhecida/);
  });
});
