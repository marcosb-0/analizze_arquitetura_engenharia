import { describe, expect, it } from 'vitest';
import { Funcionario } from '../types';
import { custoColaborador, parametrosDaEmpresa, somarBeneficios } from './custoHora';

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

const EMPRESA = { encargosPercentual: 80, jornadaMensalHoras: 220 };

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
    // desligada e a cadeia de preço segue no SINAPI. Zero mentiria.
    const c = custoColaborador(ficha({ salarioBase: 3000 }), { encargosPercentual: null, jornadaMensalHoras: 220 });
    expect(c).toBeNull();
  });

  it('encargos só na ficha funcionam com a empresa em branco', () => {
    const c = custoColaborador(
      ficha({ salarioBase: 3000, encargosPercentual: 80, beneficios: { planoSaude: 250 } }),
      { encargosPercentual: null, jornadaMensalHoras: 220 }
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
      custoColaborador(ficha({ salarioBase: 3000, encargosPercentual: 80, beneficios: { planoSaude: 250 } }), {
        encargosPercentual: null,
        jornadaMensalHoras: 220,
      })?.custoHora
    ).toBe(25.68);
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
    expect(parametrosDaEmpresa({ encargosSociaisPercentual: null, jornadaMensalHoras: 220 })).toEqual({
      encargosPercentual: null,
      jornadaMensalHoras: 220,
    });
  });
});
