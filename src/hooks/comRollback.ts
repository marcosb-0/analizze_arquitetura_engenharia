import type { Dispatch, SetStateAction } from 'react';

/**
 * Atualização otimista com desfazer correto.
 *
 * O PROBLEMA (§3.5 da auditoria). O padrão em 34 handlers era:
 *
 *     const previous = catalogo;                    // ← valor do RENDER
 *     setCatalogo((prev) => prev.map(...));
 *     try { await servico.setAtivo(...) }
 *     catch { setCatalogo(previous); }              // ← restaura o RENDER, não o agora
 *
 * `previous` é o valor da variável no render em que o handler foi criado. Duas
 * mutações concorrentes — dois cliques rápidos em linhas diferentes de uma lista,
 * ou um clique durante um refetch — e o rollback da SEGUNDA **descarta o sucesso
 * da primeira**, porque restaura um estado anterior às duas.
 *
 * Não é hipótese de laboratório: os sítios afetados são justamente os alternadores
 * de lista (marcar pago, ativar/inativar, mudar papel), onde clicar em duas linhas
 * em sequência é o uso normal.
 *
 * A CORREÇÃO é capturar o estado anterior DENTRO da forma funcional, que o React
 * executa no momento da aplicação e não no do render:
 *
 *     const { aplicar, desfazer } = comRollback(setCatalogo);
 *     aplicar((prev) => prev.map(...));
 *     try { await servico.setAtivo(...) }
 *     catch { desfazer(); }
 *
 * Concentrar isso num helper — em vez de repetir a captura em 34 lugares — é o que
 * impede o 35º handler de voltar ao padrão errado.
 */
export interface Rollback<T> {
  /** Aplica a mudança otimista, capturando o estado imediatamente anterior a ela. */
  aplicar: (transformar: (atual: T) => T) => void;
  /**
   * Volta ao estado capturado. Não faz nada se `aplicar` nunca rodou — assim
   * chamar `desfazer()` num caminho de erro que falhou ANTES da atualização
   * otimista é inofensivo.
   */
  desfazer: () => void;
}

export function comRollback<T>(setter: Dispatch<SetStateAction<T>>): Rollback<T> {
  let anterior: T;
  let capturou = false;

  return {
    aplicar(transformar) {
      setter((prev) => {
        // Só a PRIMEIRA aplicação captura: um handler que aplica em dois passos
        // deve desfazer para antes do primeiro, não para o meio.
        if (!capturou) {
          anterior = prev;
          capturou = true;
        }
        return transformar(prev);
      });
    },
    /**
     * Forma funcional TAMBÉM aqui, e não por estilo — por correção.
     *
     * A primeira versão era `if (!capturou) return; setter(() => anterior);`, e
     * tinha um buraco que só o teste de hook expôs: a captura acontece dentro do
     * updater de `aplicar`, que o React executa na fase de render — **depois** de
     * a função assíncrona já ter seguido. Se a escrita falhar rápido, `desfazer()`
     * roda com `capturou` ainda `false` e vira um no-op SILENCIOSO: a linha some
     * da tela, o servidor recusa, e ela não volta.
     *
     * Na forma funcional o problema desaparece por construção. O React processa a
     * fila de updaters em ordem, então quando este aqui executa o de `aplicar` já
     * executou — `capturou` é verdadeiro e `anterior` está preenchido.
     *
     * O `capturou ? ... : prev` continua cobrindo o caso legítimo de `desfazer()`
     * sem `aplicar()` — vários handlers têm `return` antecipado antes da mutação.
     */
    desfazer() {
      setter((prev) => (capturou ? anterior : prev));
    },
  };
}
