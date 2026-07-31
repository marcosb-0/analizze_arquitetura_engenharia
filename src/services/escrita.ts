/**
 * Escrita verificada.
 *
 * O PROBLEMA (§3.4 de docs/auditoria-completa.md): sob RLS, um papel sem política
 * de escrita não recebe erro nenhum. O `update`/`delete` casa com ZERO linhas e o
 * PostgREST devolve **200**. Sem contar as linhas afetadas, a tela remove o item,
 * mostra o toast de sucesso e comemora — enquanto o banco segue intacto.
 *
 * O projeto já conhecia isso e documentou em `projetosService.ts`, aplicando a
 * checagem em 8 lugares. Faltava em 30, incluindo casos que doem: desligar um
 * funcionário, revogar acesso de alguém a uma obra, marcar um pagamento como pago.
 *
 * Este helper existe para a checagem deixar de ser um bloco de cinco linhas que
 * alguém precisa lembrar de escrever. Uso:
 *
 *     const { data, error } = await supabase.from('x').update(p).eq('id', id).select('id');
 *     if (error) throw error;
 *     garantirEscrita(data, 'Nenhuma linha foi alterada — sem permissão para …');
 *
 * NOTA sobre `.single()`: uma escrita terminada em `.select().single()` **já**
 * lança quando não casa nenhuma linha (PGRST116), então não precisa deste helper.
 * O que precisa é a escrita que não pede retorno nenhum, ou que pede `.select()`
 * sem `.single()`.
 */

/**
 * Lança quando a escrita não atingiu nenhuma linha. Devolve as linhas para poder
 * ser usado em posição de expressão.
 *
 * `mensagem` vai direto para o toast do usuário — escreva o que ele pode fazer a
 * respeito, não o código do erro.
 */
export function garantirEscrita<T>(linhas: T[] | null, mensagem: string): T[] {
  if (!linhas || linhas.length === 0) {
    throw new Error(mensagem);
  }
  return linhas;
}

/** A mesma checagem para escrita de linha única, quando não se usou `.single()`. */
export function garantirEscritaUnica<T>(linhas: T[] | null, mensagem: string): T {
  return garantirEscrita(linhas, mensagem)[0];
}

/**
 * Mensagem padrão de recusa por permissão.
 *
 * Existe para as 30 mensagens não divergirem em 30 redações diferentes do mesmo
 * fato. `acao` completa a frase: `semPermissao('excluir esta obra')`.
 */
export function semPermissao(acao: string): string {
  return `Nenhuma linha foi alterada — seu perfil não tem permissão para ${acao}.`;
}
