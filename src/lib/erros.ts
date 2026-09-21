/**
 * A mensagem legível de um erro, venha ele de onde vier.
 *
 * O PROBLEMA: `err instanceof Error ? err.message : String(err)` parece cobrir
 * os dois casos, mas **erro do Supabase não é `Error`**. O supabase-js devolve
 * `{ data, error }` com `error` sendo um OBJETO SIMPLES — `{ message, details,
 * hint, code }` — e `buscarTudo` o repassa com `throw error`. O `instanceof`
 * falha, cai no `String(err)`, e o usuário lê **`[object Object]`** no lugar da
 * única frase que diria o que aconteceu.
 *
 * Não é hipótese: foi assim que um `column encargos_rubricas.sistema does not
 * exist` (HTTP 400, que derrubava a aba Configurações inteira) chegou à tela
 * como `[object Object]`. O erro estava ali o tempo todo, só ilegível — o
 * fallback destruía a informação exatamente no caso mais comum do app, porque
 * TODO erro de servidor aqui é um objeto simples do PostgREST.
 *
 * A ordem dos ramos é a regra: procurar `message` ANTES de apelar para
 * `String`. `String` é o último recurso, não o segundo.
 */

/** O que `String(objeto)` produz quando não há `toString` próprio. */
const INUTIL = '[object Object]';

/** O que a tela mostra quando o erro realmente não carrega texto nenhum. */
const SEM_DESCRICAO = 'Erro sem descrição.';

export function mensagemDeErro(erro: unknown): string {
  if (typeof erro === 'string') return erro.trim() || SEM_DESCRICAO;

  // `Error` primeiro por ser o caso barato, não por ser o mais frequente.
  if (erro instanceof Error && erro.message.trim()) return erro.message;

  // O caso que o `instanceof` não pega: objeto com `message` de texto. Cobre o
  // PostgrestError, o AuthError e o StorageError — as três origens de erro de
  // servidor do app.
  if (erro !== null && typeof erro === 'object') {
    const { message } = erro as { message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
    // Chegou aqui: é objeto e não tem `message` aproveitável. `String()` não
    // ajuda — daria `[object Object]`, ou o inútil `"Error"` para um
    // `new Error('')`, que o próprio teste deste módulo flagrou.
    return SEM_DESCRICAO;
  }

  // Só primitivos passam daqui: número, boolean e afins ainda dizem algo.
  const texto = String(erro);
  return texto.trim() === '' || texto === INUTIL ? SEM_DESCRICAO : texto;
}
