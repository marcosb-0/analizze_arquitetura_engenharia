import { describe, it, expect, vi } from 'vitest';
import { buscarTudo } from './paginacao';
import { garantirEscrita, garantirEscritaUnica, semPermissao } from './escrita';

/**
 * `buscarTudo` substitui 16 leituras que faziam `select('*')` sem `.range()` — e o
 * PostgREST corta em 1000 devolvendo HTTP 200. Como o helper virou o caminho de
 * TODA leitura completa do app, um erro aqui é um erro em todas elas.
 */
describe('buscarTudo', () => {
  /** Simula o PostgREST: devolve no máximo `ate - de + 1` linhas da fatia pedida. */
  const servidorCom = (total: number) => {
    const todas = Array.from({ length: total }, (_, i) => ({ id: i }));
    const chamadas: Array<[number, number]> = [];
    const pagina = (de: number, ate: number) => {
      chamadas.push([de, ate]);
      return Promise.resolve({ data: todas.slice(de, ate + 1), error: null });
    };
    return { pagina, chamadas };
  };

  it('devolve tudo quando cabe num bloco', async () => {
    const { pagina, chamadas } = servidorCom(42);
    await expect(buscarTudo(pagina)).resolves.toHaveLength(42);
    expect(chamadas).toEqual([[0, 999]]); // bloco incompleto = para aqui
  });

  it('tabela vazia devolve lista vazia, sem lançar', async () => {
    const { pagina, chamadas } = servidorCom(0);
    await expect(buscarTudo(pagina)).resolves.toEqual([]);
    expect(chamadas).toHaveLength(1);
  });

  it('atravessa o limite de 1000 — o bug que motivou o helper', async () => {
    const { pagina } = servidorCom(2500);
    const linhas = await buscarTudo<{ id: number }>(pagina);
    expect(linhas).toHaveLength(2500);
    // Sem duplicar nem pular nenhuma linha.
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2500);
    expect(linhas[0].id).toBe(0);
    expect(linhas[2499].id).toBe(2499);
  });

  it('exatamente 1000 exige uma segunda ida (o bloco veio cheio)', async () => {
    const { pagina, chamadas } = servidorCom(1000);
    await expect(buscarTudo(pagina)).resolves.toHaveLength(1000);
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('relança o erro do servidor em vez de devolver lista parcial', async () => {
    const pagina = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'conexão perdida' } });

    // Silêncio aqui seria o pior resultado possível: devolver 1000 linhas como se
    // fossem o conjunto completo é exatamente o bug original com outra causa.
    await expect(buscarTudo(pagina)).rejects.toMatchObject({ message: 'conexão perdida' });
  });

  it('para no teto de blocos em vez de girar para sempre', async () => {
    // Servidor que sempre devolve bloco cheio (filtro quebrado, por exemplo):
    // travar o navegador em silêncio não é melhor que um número errado.
    const pagina = vi.fn().mockResolvedValue({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      error: null,
    });
    const linhas = await buscarTudo(pagina);
    expect(pagina).toHaveBeenCalledTimes(50);
    expect(linhas).toHaveLength(50_000);
  });
});

/**
 * `garantirEscrita` existe porque um write recusado pela RLS volta como **200 com
 * zero linhas**. Ver §3.4 da auditoria.
 */
describe('garantirEscrita', () => {
  it('passa quando alguma linha foi afetada', () => {
    expect(garantirEscrita([{ id: 'a' }], 'não deveria lançar')).toEqual([{ id: 'a' }]);
  });

  it('lança quando zero linhas — o caso do write recusado em silêncio', () => {
    expect(() => garantirEscrita([], 'sem permissão')).toThrow('sem permissão');
  });

  it('lança quando o retorno é null', () => {
    expect(() => garantirEscrita(null, 'sem permissão')).toThrow('sem permissão');
  });

  it('garantirEscritaUnica devolve a primeira linha', () => {
    expect(garantirEscritaUnica([{ id: 'a' }, { id: 'b' }], 'x')).toEqual({ id: 'a' });
    expect(() => garantirEscritaUnica([], 'sem permissão')).toThrow('sem permissão');
  });

  it('semPermissao monta a frase completa', () => {
    expect(semPermissao('excluir esta obra')).toBe(
      'Nenhuma linha foi alterada — seu perfil não tem permissão para excluir esta obra.'
    );
  });
});
