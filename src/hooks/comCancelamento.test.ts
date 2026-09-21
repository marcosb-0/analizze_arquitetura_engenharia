import { describe, it, expect, vi } from 'vitest';
import { comCancelamento } from './comCancelamento';

/** Promessa que só resolve/rejeita quando este teste mandar. */
function promessaControlada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Deixa as continuações de promessa já agendadas rodarem. */
const drenar = () => new Promise<void>((r) => setTimeout(r, 0));

describe('comCancelamento', () => {
  it('aplica o resultado quando não foi cancelado', async () => {
    const { promessa, resolver } = promessaControlada<number[]>();
    const aoChegar = vi.fn();
    const aoFinalizar = vi.fn();

    comCancelamento(() => promessa, aoChegar, vi.fn(), aoFinalizar);
    resolver([1, 2]);
    await drenar();

    expect(aoChegar).toHaveBeenCalledWith([1, 2]);
    expect(aoFinalizar).toHaveBeenCalledOnce();
  });

  it('DESCARTA o resultado que chega depois do cancelamento', async () => {
    const { promessa, resolver } = promessaControlada<number[]>();
    const aoChegar = vi.fn();
    const aoFinalizar = vi.fn();

    const cancelar = comCancelamento(() => promessa, aoChegar, vi.fn(), aoFinalizar);
    cancelar(); // o efeito foi limpo antes de a resposta chegar
    resolver([1, 2]);
    await drenar();

    expect(aoChegar).not.toHaveBeenCalled();
    // `aoFinalizar` também não roda: quem assumiu `loading` foi o efeito seguinte.
    expect(aoFinalizar).not.toHaveBeenCalled();
  });

  it('descarta o ERRO de uma busca cancelada — toast sobre tela que o usuário deixou é ruído', async () => {
    const { promessa, rejeitar } = promessaControlada<number[]>();
    const aoFalhar = vi.fn();

    const cancelar = comCancelamento(() => promessa, vi.fn(), aoFalhar);
    cancelar();
    rejeitar(new Error('rede caiu'));
    await drenar();

    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it('propaga o erro quando NÃO foi cancelado', async () => {
    const { promessa, rejeitar } = promessaControlada<number[]>();
    const aoFalhar = vi.fn();

    comCancelamento(() => promessa, vi.fn(), aoFalhar);
    rejeitar(new Error('rede caiu'));
    await drenar();

    expect(aoFalhar).toHaveBeenCalledWith(expect.objectContaining({ message: 'rede caiu' }));
  });

  it('normaliza rejeição que não é Error', async () => {
    const { promessa, rejeitar } = promessaControlada<number[]>();
    const aoFalhar = vi.fn();

    comCancelamento(() => promessa, vi.fn(), aoFalhar);
    rejeitar('string solta');
    await drenar();

    expect(aoFalhar).toHaveBeenCalledWith({ message: 'string solta' });
  });

  /**
   * O CENÁRIO QUE JUSTIFICA O HELPER: duas buscas em voo, a antiga terminando
   * DEPOIS da nova. Sem cancelamento, a lenta vence e a tela mostra dado velho.
   */
  it('a resposta lenta e obsoleta não sobrescreve a rápida e atual', async () => {
    const antiga = promessaControlada<string>();
    const nova = promessaControlada<string>();
    let estado = '';
    const aplicar = (v: string) => {
      estado = v;
    };

    const cancelarAntiga = comCancelamento(() => antiga.promessa, aplicar, vi.fn());
    cancelarAntiga(); // o efeito rodou de novo: a primeira busca é abandonada
    comCancelamento(() => nova.promessa, aplicar, vi.fn());

    nova.resolver('dado atual');
    await drenar();
    expect(estado).toBe('dado atual');

    antiga.resolver('dado obsoleto'); // chega tarde
    await drenar();
    expect(estado).toBe('dado atual'); // e é ignorado
  });

  /**
   * REGRESSÃO: o erro do Supabase é um OBJETO SIMPLES, não `Error`. A versão
   * anterior fazia `err instanceof Error ? err : { message: String(err) }`, o
   * `instanceof` dava falso e a tela recebia `[object Object]` no lugar da
   * causa — foi assim que um HTTP 400 derrubou a aba Configurações inteira sem
   * dizer por quê. Quem trocar isto de volta por `instanceof` quebra aqui.
   */
  it('preserva a mensagem de um erro do Supabase, que não é instância de Error', async () => {
    const erroDoPostgrest = {
      message: 'column encargos_rubricas.sistema does not exist',
      details: null,
      hint: null,
      code: '42703',
    };
    expect(erroDoPostgrest).not.toBeInstanceOf(Error);

    const aoFalhar = vi.fn();
    comCancelamento(() => Promise.reject(erroDoPostgrest), vi.fn(), aoFalhar);
    await drenar();

    expect(aoFalhar).toHaveBeenCalledOnce();
    expect(aoFalhar.mock.calls[0][0].message).toBe(
      'column encargos_rubricas.sistema does not exist'
    );
  });
});
