/**
 * Busca cujo resultado é DESCARTADO se o efeito for limpo antes de ela terminar.
 *
 * O PROBLEMA (§3.7 da auditoria): nenhum dos 20 hooks usava `AbortController` nem
 * flag de desmontagem. O padrão era
 *
 *     service.list().then(setDados)
 *
 * e nada impedia uma resposta obsoleta de chegar depois e sobrescrever dado novo.
 * Acontece em três situações reais, todas do uso normal:
 *
 *   1. o usuário abre uma aba, sai antes de carregar e volta — duas buscas em voo,
 *      e a mais LENTA vence, ainda que seja a mais antiga;
 *   2. `ativo` volta a false (perfil desativado, troca de aba) e a resposta em voo
 *      repovoa um estado que deveria estar vazio;
 *   3. a sessão troca de usuário e a busca do usuário anterior chega depois — o
 *      caso mais grave, porque mistura dado de dois perfis diferentes.
 *
 * Por que não `AbortController`: o supabase-js aceita `abortSignal` por consulta,
 * mas os services fazem de 1 a 3 consultas por chamada e alguns paginam em blocos
 * (`buscarTudo`). Propagar um sinal por toda essa cadeia é uma mudança de
 * assinatura em 21 services para economizar tráfego já emitido. O que causa BUG é
 * a aplicação do resultado obsoleto, e é isso que se corta aqui — o custo de rede
 * de uma resposta descartada é o mesmo de antes.
 *
 * Uso: o retorno JÁ É a função de limpeza do efeito.
 *
 *     useEffect(() => {
 *       if (!userId || !ativo) { limpar(); return; }
 *       setLoading(true);
 *       return comCancelamento(
 *         () => clientesService.list(),
 *         setClientes,
 *         (err) => toast.error('Falha ao carregar clientes.', err.message),
 *         () => setLoading(false)
 *       );
 *     }, [userId, ativo, toast]);
 */
export function comCancelamento<T>(
  buscar: () => Promise<T>,
  aoChegar: (dados: T) => void,
  aoFalhar: (err: { message: string }) => void,
  aoFinalizar?: () => void
): () => void {
  let cancelado = false;

  buscar()
    .then((dados) => {
      if (!cancelado) aoChegar(dados);
    })
    .catch((err: unknown) => {
      // Silenciar o erro de uma busca cancelada é correto: o usuário já saiu
      // daquela tela, e um toast sobre dado que ele não está mais vendo é ruído.
      if (!cancelado) aoFalhar(err instanceof Error ? err : { message: String(err) });
    })
    .finally(() => {
      // `setLoading(false)` também é descartado: o efeito seguinte já assumiu o
      // controle de `loading`, e apagá-lo aqui produziria um pisca.
      if (!cancelado && aoFinalizar) aoFinalizar();
    });

  return () => {
    cancelado = true;
  };
}
