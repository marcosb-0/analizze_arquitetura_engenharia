/**
 * Leitura completa de uma tabela, em blocos.
 *
 * O PROBLEMA (§4.2 de docs/auditoria-completa.md): `select('*')` sem `.range()`
 * **parece** trazer tudo, mas o PostgREST corta em 1000 linhas e devolve **HTTP
 * 200**. Sem erro, sem aviso, sem cabeçalho que o código leia.
 *
 * E os totais do app são somados sobre esses arrays no cliente: o dashboard, o
 * avanço físico ponderado (`lib/avanco.ts`) e as métricas do Financeiro. A partir
 * da linha 1001, os números passam a estar **errados e silenciosos** — que é pior
 * do que estarem lentos ou ausentes, porque continuam plausíveis.
 *
 * O projeto já tinha corrigido isso DUAS vezes, com comentário explicando a
 * armadilha em cada lugar (`catalogoService`, `financeiroService`), e não havia
 * generalizado. Este módulo é a generalização.
 *
 * O QUE ISTO NÃO RESOLVE, e é importante não confundir: o teto de MEMÓRIA
 * continua. Carregar o orçamento de todas as obras para somar no cliente é
 * errado por outro motivo, e a correção é escopar a leitura por obra + agregar no
 * servidor (padrão de `fn_resultado_obra`). Isso é mudança de arquitetura e
 * segue pendente. Aqui se resolve só a **incorreção**: os números voltam a estar
 * certos, ainda que continuem sendo obtidos de forma caro.
 */

/** Tamanho do bloco. O PostgREST corta em 1000 de qualquer jeito. */
const BLOCO = 1000;

/**
 * Teto de segurança. Sem ele, um erro de filtro que faça a consulta devolver a
 * tabela inteira viraria um laço que trava o navegador em silêncio — trocar um
 * número errado por uma aba congelada não é progresso.
 */
const MAX_BLOCOS = 50;

type Resposta<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Busca em blocos até esgotar e devolve o conjunto completo.
 *
 * `pagina` recebe o intervalo e devolve a consulta pronta. **Inclua sempre um
 * desempate estável no `order`** (normalmente `id`): sem ele, duas linhas com o
 * mesmo valor de ordenação podem repetir ou pular entre blocos, e o resultado
 * fica errado de um jeito ainda mais difícil de notar que o corte original.
 *
 *     const linhas = await buscarTudo((de, ate) =>
 *       supabase.from('v_itens_orcamento').select('*')
 *         .order('created_at', { ascending: true })
 *         .order('id', { ascending: true })
 *         .range(de, ate)
 *     );
 */
export async function buscarTudo<T>(pagina: (de: number, ate: number) => PromiseLike<Resposta<T>>): Promise<T[]> {
  const todos: T[] = [];

  for (let bloco = 0; bloco < MAX_BLOCOS; bloco++) {
    const de = bloco * BLOCO;
    const { data, error } = await pagina(de, de + BLOCO - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todos.push(...data);
    // Bloco incompleto = última página. Evita uma ida extra ao servidor.
    if (data.length < BLOCO) return todos;
  }

  return todos;
}
