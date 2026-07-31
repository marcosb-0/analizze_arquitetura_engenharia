import { describe, it, expect } from 'vitest';
import { comRollback } from './comRollback';

/**
 * Simula `useState` de forma fiel ao que importa aqui: o updater funcional recebe
 * o valor ATUAL no momento da aplicação, não o do momento em que foi criado.
 */
function estadoFalso<T>(inicial: T) {
  let valor = inicial;
  const setter = (acao: T | ((prev: T) => T)) => {
    valor = typeof acao === 'function' ? (acao as (prev: T) => T)(valor) : acao;
  };
  return { setter, atual: () => valor };
}

describe('comRollback', () => {
  it('aplica a transformação', () => {
    const { setter, atual } = estadoFalso([1, 2, 3]);
    const { aplicar } = comRollback<number[]>(setter);
    aplicar((prev) => [...prev, 4]);
    expect(atual()).toEqual([1, 2, 3, 4]);
  });

  it('desfazer volta ao estado imediatamente anterior', () => {
    const { setter, atual } = estadoFalso([1, 2, 3]);
    const { aplicar, desfazer } = comRollback<number[]>(setter);
    aplicar((prev) => prev.filter((n) => n !== 2));
    expect(atual()).toEqual([1, 3]);
    desfazer();
    expect(atual()).toEqual([1, 2, 3]);
  });

  it('desfazer sem aplicar é inofensivo', () => {
    const { setter, atual } = estadoFalso(['a']);
    const { desfazer } = comRollback<string[]>(setter);
    desfazer();
    expect(atual()).toEqual(['a']);
  });

  /**
   * O TESTE QUE JUSTIFICA O HELPER.
   *
   * Duas mutações concorrentes: a primeira tem sucesso, a segunda falha e desfaz.
   * O sucesso da primeira tem de sobreviver.
   */
  it('rollback de uma mutação não descarta o sucesso de outra', () => {
    type Lista = { id: string; pago: boolean }[];
    const { setter, atual } = estadoFalso<Lista>([
      { id: 'a', pago: false },
      { id: 'b', pago: false },
    ]);

    // Mutação 1: marca 'a' como pago — e dá certo (nunca desfaz).
    const m1 = comRollback(setter);
    m1.aplicar((prev) => prev.map((x) => (x.id === 'a' ? { ...x, pago: true } : x)));

    // Mutação 2: marca 'b' — e falha, então desfaz.
    const m2 = comRollback(setter);
    m2.aplicar((prev) => prev.map((x) => (x.id === 'b' ? { ...x, pago: true } : x)));
    m2.desfazer();

    // 'a' segue pago (o sucesso da primeira sobreviveu) e 'b' voltou a false.
    expect(atual()).toEqual([
      { id: 'a', pago: true },
      { id: 'b', pago: false },
    ]);
  });

  it('o padrão ANTIGO perderia o sucesso da primeira — é o bug que isto corrige', () => {
    type Lista = { id: string; pago: boolean }[];
    const { setter, atual } = estadoFalso<Lista>([
      { id: 'a', pago: false },
      { id: 'b', pago: false },
    ]);

    // Reprodução literal do padrão anterior: `previous` capturado do "render".
    const previousDoRender: Lista = atual();

    setter((prev: Lista) => prev.map((x) => (x.id === 'a' ? { ...x, pago: true } : x)));
    setter((prev: Lista) => prev.map((x) => (x.id === 'b' ? { ...x, pago: true } : x)));
    setter(previousDoRender); // rollback da segunda

    // 'a' perdeu o pagamento que já tinha sido confirmado pelo servidor.
    expect(atual()).toEqual([
      { id: 'a', pago: false },
      { id: 'b', pago: false },
    ]);
  });

  /**
   * REGRESSÃO. O React não executa o updater na hora: ele enfileira e roda na fase
   * de render. A primeira versão de `comRollback` fazia `if (!capturou) return;` em
   * `desfazer()`, e por isso virava no-op SILENCIOSO quando a escrita falhava antes
   * de o React drenar a fila — a linha sumia da tela e não voltava.
   *
   * Este `estadoAdiado` reproduz a fila do React: os updaters só rodam em
   * `drenar()`. Com a correção (desfazer também é funcional), a ordem da fila
   * garante que a captura já aconteceu quando o desfazer executa.
   */
  it('desfazer funciona mesmo quando o updater ainda não drenou — o bug do no-op silencioso', () => {
    let valor = [1, 2, 3];
    const fila: ((prev: number[]) => number[])[] = [];
    const setter = (acao: number[] | ((prev: number[]) => number[])) => {
      fila.push(typeof acao === 'function' ? (acao as (p: number[]) => number[]) : () => acao);
    };
    const drenar = () => {
      for (const f of fila.splice(0)) valor = f(valor);
    };

    const { aplicar, desfazer } = comRollback<number[]>(setter);
    aplicar((prev) => prev.filter((n) => n !== 2)); // ainda NÃO executou
    desfazer(); // a escrita falhou antes de o React drenar

    drenar();
    expect(valor).toEqual([1, 2, 3]);
  });

  it('duas aplicações no mesmo handler desfazem para antes da primeira', () => {
    const { setter, atual } = estadoFalso([1]);
    const { aplicar, desfazer } = comRollback<number[]>(setter);
    aplicar((prev) => [...prev, 2]);
    aplicar((prev) => [...prev, 3]);
    expect(atual()).toEqual([1, 2, 3]);
    desfazer();
    expect(atual()).toEqual([1]);
  });
});
