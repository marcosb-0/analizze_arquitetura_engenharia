import type React from 'react';

/**
 * Atributos nativos repassados por `{...rest}` nos primitivos.
 *
 * ISTO ERA UM BURACO, E DEIXOU DE SER. A versão anterior era:
 *
 *     export interface PropsNativas { [atributo: string]: any }
 *
 * com um comentário explicando o motivo: `@types/react` não estava instalado, e
 * então `React.ButtonHTMLAttributes` e afins resolviam para `any` — herdar deles
 * não tipava nada e ainda escondia erros. O comentário terminava dizendo que
 * instalar os tipos "seria o caminho certo, mas expõe 24 mil linhas que nunca
 * foram checadas contra eles: é uma tarefa própria".
 *
 * Essa tarefa foi feita (Fase 1 da auditoria de 29/jul/2026). Os tipos estão
 * instalados, `strict` está ligado, e o custo real da checagem foi de 12 erros —
 * bem abaixo do que se temia. Não há mais razão para o `any`.
 *
 * O que muda na prática: `onChange={(e) => ...}` passa a saber que `e` é um
 * `ChangeEvent` do elemento certo, e `e.target.value` é `string` em vez de `any`.
 * Um atributo inexistente, ou com tipo errado, passa a ser erro de compilação —
 * que é justamente o que o índice de `any` engolia.
 *
 * O genérico existe porque cada primitivo embrulha um elemento diferente, e cada
 * elemento tem os seus atributos: `value`/`onChange` de um input não são os de um
 * `<div>`. O padrão `HTMLAttributes<HTMLElement>` serve os contêineres genéricos
 * (Card, células de tabela); os primitivos de formulário declaram o próprio tipo.
 */
export type PropsNativas<E extends HTMLElement = HTMLElement> = React.HTMLAttributes<E>;
