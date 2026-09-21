import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from './erros';

describe('mensagemDeErro', () => {
  it('lê a mensagem de um Error', () => {
    expect(mensagemDeErro(new Error('Falhou feio'))).toBe('Falhou feio');
  });

  /**
   * O caso que motivou o módulo: o erro do PostgREST é objeto SIMPLES, não
   * `Error`. Antes disto, `instanceof` falhava e a tela mostrava
   * `[object Object]` em vez desta frase.
   */
  it('lê a mensagem de um erro do Supabase, que não é instância de Error', () => {
    const erro = {
      message: 'column encargos_rubricas.sistema does not exist',
      details: null,
      hint: null,
      code: '42703',
    };
    expect(erro).not.toBeInstanceOf(Error);
    expect(mensagemDeErro(erro)).toBe('column encargos_rubricas.sistema does not exist');
  });

  it('aceita uma string crua', () => {
    expect(mensagemDeErro('Sem rede')).toBe('Sem rede');
  });

  /** A garantia central: `[object Object]` nunca chega ao usuário. */
  it('nunca devolve [object Object] para um objeto sem message', () => {
    expect(mensagemDeErro({ code: 500 })).not.toContain('[object');
    expect(mensagemDeErro({})).toBe('Erro sem descrição.');
  });

  it('não devolve mensagem vazia quando o campo existe mas é branco', () => {
    expect(mensagemDeErro({ message: '   ' })).toBe('Erro sem descrição.');
    expect(mensagemDeErro(new Error(''))).toBe('Erro sem descrição.');
    expect(mensagemDeErro('')).toBe('Erro sem descrição.');
  });

  it('ignora message que não é texto', () => {
    expect(mensagemDeErro({ message: { nested: true } })).toBe('Erro sem descrição.');
    expect(mensagemDeErro({ message: 42 })).toBe('Erro sem descrição.');
  });

  it('preserva o que dá para ler de valores primitivos', () => {
    expect(mensagemDeErro(404)).toBe('404');
    expect(mensagemDeErro(null)).toBe('null');
  });
});
