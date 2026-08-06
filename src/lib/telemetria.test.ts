import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { limpar, registrarErro, configurarDestino, type ContextoErro } from './telemetria';

/**
 * O que este arquivo protege é a **limpeza**, não o encanamento.
 *
 * Telemetria é o único código do app que envia conteúdo para fora do navegador,
 * e este é um sistema com CPF, chave PIX e conta bancária (§11). O modo de falha
 * é silencioso por construção: o dado vaza para o serviço de terceiros e nada na
 * tela muda. Só um teste acusa.
 */

describe('limpeza de dado pessoal antes de sair do navegador', () => {
  /**
   * As mensagens abaixo não são inventadas: é o formato com que o Postgres
   * devolve violação de constraint pelo PostgREST — com o VALOR que falhou
   * dentro do texto. É por isso que a limpeza é necessária.
   */
  it.each([
    ['CPF com pontuação', 'Key (cpf)=(123.456.789-01) already exists.', '123.456.789-01'],
    ['CPF sem pontuação', 'duplicate key value: 12345678901', '12345678901'],
    ['CNPJ', 'Key (cpf_cnpj)=(12.345.678/0001-99) already exists.', '12.345.678/0001-99'],
    ['e-mail', 'User already registered: jose.silva@construtora.com.br', 'jose.silva@construtora.com.br'],
    ['conta bancária', 'check_conta violated: 004512300', '004512300'],
  ])('apaga %s', (_nome, mensagem, segredo) => {
    const saida = limpar(mensagem);
    expect(saida).not.toContain(segredo);
    expect(saida).toMatch(/«(cpf|cnpj|email|digitos)»/);
  });

  it('apaga o token da sessão, que chega junto da URL em erro de rede', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-DEF_123';
    expect(limpar(`Failed to fetch ${jwt}`)).toBe('Failed to fetch «token»');
  });

  /**
   * O outro lado, e o que torna a regra utilizável: apagar demais transforma
   * toda mensagem em «digitos» e a telemetria deixa de dizer o que quebrou.
   */
  it('preserva o que faz a mensagem ser útil', () => {
    const texto = 'new row for relation "medicoes_obra" violates check constraint "medicao_percentual_valido"';
    expect(limpar(texto)).toBe(texto);
  });

  it('preserva número pequeno — percentual, quantidade, código de erro', () => {
    expect(limpar('PGRST116: 0 rows returned for etapa 42')).toBe('PGRST116: 0 rows returned for etapa 42');
  });
});

describe('registrarErro', () => {
  const recebidos: { erro: Error; ctx: ContextoErro & { rota: string } }[] = [];

  beforeEach(() => {
    recebidos.length = 0;
    configurarDestino((erro, ctx) => recebidos.push({ erro, ctx }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('limpa a mensagem E a pilha antes de entregar ao destino', () => {
    const erro = new Error('Key (cpf)=(123.456.789-01) already exists.');
    erro.stack = 'Error: Key (cpf)=(123.456.789-01)\n    at salvar (useFuncionarios.ts:88)';

    registrarErro(erro, { origem: 'refetch', escopo: 'a equipe' });

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0].erro.message).not.toContain('123.456.789-01');
    // A pilha vazava o mesmo dado e é o lugar mais fácil de esquecer.
    expect(recebidos[0].erro.stack).not.toContain('123.456.789-01');
    expect(recebidos[0].erro.stack).toContain('useFuncionarios.ts:88');
  });

  /**
   * O objeto original vai para a TELA (o `ErrorBoundary` mostra `erro.message`
   * para o usuário copiar no chamado). Limpar no lugar tiraria dele justamente
   * o dado que o ajuda a entender qual cadastro está duplicado.
   */
  it('não altera o erro original', () => {
    const erro = new Error('Key (cpf)=(123.456.789-01) already exists.');
    registrarErro(erro, { origem: 'render' });
    expect(erro.message).toContain('123.456.789-01');
  });

  it('aceita rejeição que não é Error — `reject("deu ruim")` é comum', () => {
    registrarErro('falhou o upload', { origem: 'promessa' });
    expect(recebidos[0].erro.message).toBe('falhou o upload');
  });

  /**
   * Roda dentro de `componentDidCatch` e de um handler de `error` global: um
   * throw daqui viraria laço de erro, ou substituiria a tela de falha contida
   * por tela branca — exatamente o que o `ErrorBoundary` existe para evitar.
   */
  it('não lança quando o destino lança', () => {
    configurarDestino(() => {
      throw new Error('destino fora do ar');
    });
    expect(() => registrarErro(new Error('x'), { origem: 'global' })).not.toThrow();
  });

  it('carrega a rota, que desde o item 36 é a aba mais a obra aberta', () => {
    registrarErro(new Error('x'), { origem: 'render', escopo: 'catálogo' });
    expect(recebidos[0].ctx).toMatchObject({ origem: 'render', escopo: 'catálogo' });
    expect(typeof recebidos[0].ctx.rota).toBe('string');
  });
});
