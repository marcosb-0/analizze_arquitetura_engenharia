/**
 * O projeto não tem `@types/react` instalado (ver o comentário em
 * ProjetoConsole.FotoBoletim). Isso significa que `React.ButtonHTMLAttributes`,
 * `React.HTMLAttributes` e afins resolvem para `any` — e `interface X extends any`
 * colapsa para uma interface vazia, então herdar deles não tipa nada e ainda
 * esconde erros.
 *
 * Aqui os primitivos declaram as props que realmente usam e liberam o resto por
 * esta passagem. Não é tão estrito quanto os tipos oficiais do React, mas é
 * honesto sobre o que o compilador consegue verificar neste projeto — e é o
 * mesmo padrão do restante do código.
 *
 * Instalar `@types/react` seria o caminho certo, mas expõe 24 mil linhas que
 * nunca foram checadas contra eles: é uma tarefa própria, não um efeito colateral
 * desta.
 */
export interface PropsNativas {
  /** Atributos nativos repassados ao elemento (onClick, value, disabled, id…). */
  [atributo: string]: any;
}
