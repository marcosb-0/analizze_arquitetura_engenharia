import { describe, expect, it } from 'vitest';
import { Funcionario } from '../types';
import { ParametrosCusto, custoColaborador, parametrosDaEmpresa, somarBeneficios } from './custoHora';
import { RubricaEncargo } from '../types';

/** Ficha mínima; cada teste sobrescreve só o que está examinando. */
function ficha(patch: Partial<Funcionario> = {}): Funcionario {
  return {
    id: 'f1',
    nome: 'Fulano',
    cargo: 'Pedreiro',
    cpf: '',
    telefone: '',
    email: '',
    dataAdmissao: '',
    status: 'Ativo',
    observacoes: '',
    dadosPagamento: {},
    beneficios: {},
    ...patch,
  };
}

/**
 * Parâmetros da empresa no modo 'Direto' — o comportamento anterior à tabela de
 * rubricas (20260920150001).
 *
 * NENHUM número esperado deste arquivo mudou quando as rubricas entraram, e é
 * de propósito: se um só destes valores precisasse ser editado, 'Direto' teria
 * deixado de reproduzir o comportamento de hoje e a migration estaria movendo
 * preço de obra em andamento.
 */
function empresa(patch: Partial<ParametrosCusto> = {}): ParametrosCusto {
  return {
    encargosPercentual: 80,
    encargosModo: 'Direto',
    encargosRubricas: { horista: null, mensalista: null },
    jornadaMensalHoras: 220,
    ...patch,
  };
}

const EMPRESA = empresa();

describe('custoColaborador', () => {
  it('herda encargos e jornada da empresa quando a ficha não os define', () => {
    const c = custoColaborador(ficha({ salarioBase: 3000 }), EMPRESA);
    expect(c?.custoHora).toBe(24.55); // 3000 × 1,80 ÷ 220
    expect(c?.encargosHerdados).toBe(true);
    expect(c?.jornadaHerdada).toBe(true);
  });

  it('soma os benefícios ao custo mensal', () => {
    const c = custoColaborador(
      ficha({ salarioBase: 3000, beneficios: { valeTransporte: 200, valeAlimentacao: 400 } }),
      EMPRESA
    );
    expect(c?.beneficiosTotal).toBe(600);
    expect(c?.custoMensal).toBe(6000); // 5400 de folha + 600
    expect(c?.custoHora).toBe(27.27);
  });

  it('usa os encargos da ficha por cima do padrão da empresa', () => {
    const c = custoColaborador(ficha({ salarioBase: 3000, encargosPercentual: 20 }), EMPRESA);
    expect(c?.encargosPercentual).toBe(20);
    expect(c?.encargosHerdados).toBe(false);
    expect(c?.custoHora).toBe(16.36); // 3600 ÷ 220
  });

  it('encargo de 0% é resposta, não ausência — não cai na herança', () => {
    // O caso do PJ. Um `||` no lugar do `??` devolveria os 80% da empresa aqui.
    const c = custoColaborador(ficha({ salarioBase: 3000, encargosPercentual: 0 }), EMPRESA);
    expect(c?.encargosPercentual).toBe(0);
    expect(c?.custoHora).toBe(13.64);
  });

  it('meia jornada dobra o custo por hora do mesmo salário', () => {
    const integral = custoColaborador(ficha({ salarioBase: 2000 }), EMPRESA);
    const meio = custoColaborador(ficha({ salarioBase: 2000, jornadaMensalHoras: 110 }), EMPRESA);
    expect(integral?.custoHora).toBe(16.36);
    expect(meio?.custoHora).toBe(32.73);
    expect(meio?.jornadaHerdada).toBe(false);
  });

  it('sem encargos na ficha nem na empresa não há custo/hora', () => {
    // Espelha o `having` vazio de fn_custo_hora_folha: a fonte Folha fica
    // desligada e a cadeia de preço segue no catálogo. Zero mentiria.
    const c = custoColaborador(ficha({ salarioBase: 3000 }), empresa({ encargosPercentual: null }));
    expect(c).toBeNull();
  });

  it('encargos só na ficha funcionam com a empresa em branco', () => {
    const c = custoColaborador(
      ficha({ salarioBase: 3000, encargosPercentual: 80, beneficios: { planoSaude: 250 } }),
      empresa({ encargosPercentual: null })
    );
    expect(c?.custoHora).toBe(25.68);
  });

  it('sem salário, salário zero ou empresa não carregada devolve null', () => {
    expect(custoColaborador(ficha(), EMPRESA)).toBeNull();
    expect(custoColaborador(ficha({ salarioBase: 0 }), EMPRESA)).toBeNull();
    expect(custoColaborador(ficha({ salarioBase: 3000 }), null)).toBeNull();
  });

  it('destrincha os encargos em reais para a ficha não fazer a conta', () => {
    const c = custoColaborador(ficha({ salarioBase: 3000, beneficios: { outros: 100 } }), EMPRESA);
    expect(c?.encargosValor).toBe(2400);
    expect(c?.custoFolha).toBe(5400);
  });

  /**
   * Paridade com `fn_custo_hora_folha`: estes três valores foram lidos do
   * Postgres em transação revertida contra os mesmos dados de entrada. Se um
   * deles quebrar, a ficha e o orçamento passaram a discordar — conferir o
   * corpo da função em 20260810141000 antes de mexer no teste.
   */
  it('bate com o valor calculado pelo banco', () => {
    expect(
      custoColaborador(
        ficha({ salarioBase: 3000, beneficios: { valeTransporte: 200, valeAlimentacao: 400 } }),
        EMPRESA
      )?.custoHora
    ).toBe(27.27);
    expect(
      custoColaborador(
        ficha({ salarioBase: 2000, encargosPercentual: 20, jornadaMensalHoras: 110 }),
        EMPRESA
      )?.custoHora
    ).toBe(21.82);
    expect(
      custoColaborador(
        ficha({ salarioBase: 3000, encargosPercentual: 80, beneficios: { planoSaude: 250 } }),
        empresa({ encargosPercentual: null })
      )?.custoHora
    ).toBe(25.68);
  });
});

/**
 * O terceiro degrau da herança, introduzido em 20260920150001.
 *
 * Os totais usados aqui (87,10 horista / 66,82 mensalista) são arbitrários de
 * propósito: quem confere a SOMA das rubricas é `encargos.test.ts`. Aqui só se
 * verifica qual dos três degraus respondeu.
 */
describe('custoColaborador com a tabela de rubricas', () => {
  const RUBRICAS = empresa({
    encargosModo: 'Rubricas',
    encargosRubricas: { horista: 87.1, mensalista: 66.82 },
  });

  it("modo 'Direto' ignora as rubricas mesmo com elas preenchidas", () => {
    // A prova de compatibilidade: ligar a tabela não muda nada enquanto a
    // chave não virar. Mesmo 24,55 do primeiro teste deste arquivo.
    const c = custoColaborador(
      ficha({ salarioBase: 3000 }),
      empresa({ encargosRubricas: { horista: 87.1, mensalista: 66.82 } })
    );
    expect(c?.custoHora).toBe(24.55);
    expect(c?.encargosOrigem).toBe('empresa');
  });

  it('sem regime na ficha usa a coluna mensalista', () => {
    // Mensalista é o padrão porque `salarioBase` é mensal e 220 h já inclui o
    // repouso semanal — ver o comentário de `regimeEncargos` em types.ts.
    const c = custoColaborador(ficha({ salarioBase: 3000 }), RUBRICAS);
    expect(c?.encargosPercentual).toBe(66.82);
    expect(c?.encargosOrigem).toBe('rubricas');
    expect(c?.custoHora).toBe(22.75); // 3000 × 1,6682 ÷ 220
  });

  it('regime Horista troca a coluna, e sai bem mais caro', () => {
    const c = custoColaborador(
      ficha({ salarioBase: 3000, regimeEncargos: 'Horista' }),
      RUBRICAS
    );
    expect(c?.encargosPercentual).toBe(87.1);
    expect(c?.custoHora).toBe(25.51); // 3000 × 1,8710 ÷ 220
  });

  it('a ficha ainda vence a tabela, inclusive com 0%', () => {
    const c = custoColaborador(ficha({ salarioBase: 3000, encargosPercentual: 0 }), RUBRICAS);
    expect(c?.encargosPercentual).toBe(0);
    expect(c?.encargosOrigem).toBe('ficha');
  });

  it('tabela incompleta cai no número digitado da empresa', () => {
    // Espelha o `coalesce` de fn_custo_hora_folha: total nulo não zera o
    // encargo, só passa a vez para o degrau seguinte. É o que mantém a chave
    // reversível sem quebrar preço.
    const c = custoColaborador(
      ficha({ salarioBase: 3000 }),
      empresa({ encargosModo: 'Rubricas', encargosRubricas: { horista: null, mensalista: null } })
    );
    expect(c?.custoHora).toBe(24.55);
    expect(c?.encargosOrigem).toBe('empresa');
  });

  it('tabela incompleta E empresa em branco não produz custo/hora', () => {
    const c = custoColaborador(
      ficha({ salarioBase: 3000 }),
      empresa({
        encargosModo: 'Rubricas',
        encargosPercentual: null,
        encargosRubricas: { horista: null, mensalista: null },
      })
    );
    expect(c).toBeNull();
  });
});

describe('somarBeneficios', () => {
  it('trata ausente como zero e soma os quatro', () => {
    expect(somarBeneficios(undefined)).toBe(0);
    expect(somarBeneficios({})).toBe(0);
    expect(somarBeneficios({ valeTransporte: 200, valeAlimentacao: 400, planoSaude: 250, outros: 50 })).toBe(900);
  });
});

describe('parametrosDaEmpresa', () => {
  it('preserva o null dos encargos e devolve null sem empresa carregada', () => {
    expect(parametrosDaEmpresa(null)).toBeNull();
    expect(
      parametrosDaEmpresa({
        encargosSociaisPercentual: null,
        encargosModo: 'Direto',
        jornadaMensalHoras: 220,
      })
    ).toEqual({
      encargosPercentual: null,
      encargosModo: 'Direto',
      encargosRubricas: { horista: null, mensalista: null },
      jornadaMensalHoras: 220,
    });
  });

  it('tabela sem nenhuma rubrica ativa é "não configurada", não 0%', () => {
    // Mesmo argumento de 20260810121000 para o campo escalar: zero faria a mão
    // de obra própria parecer custar só o salário.
    const inativa: RubricaEncargo[] = [
      {
        codigo: 'A1',
        grupo: 'A',
        descricao: 'INSS',
        sistema: true,
        percentualHorista: 20,
        percentualMensalista: 20,
        aplicaHorista: true,
        aplicaMensalista: true,
        formula: null,
        ordem: 110,
        ativo: false,
      },
    ];
    const p = parametrosDaEmpresa(
      { encargosSociaisPercentual: 80, encargosModo: 'Rubricas', jornadaMensalHoras: 220 },
      inativa
    );
    expect(p?.encargosRubricas).toEqual({ horista: null, mensalista: null });
  });
});
