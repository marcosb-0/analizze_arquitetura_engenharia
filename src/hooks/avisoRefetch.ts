/**
 * O que fazer quando um *refetch* falha.
 *
 * §10.4 da auditoria. Havia oito `.catch(() => {})` — completamente silenciosos —
 * em todas as funções `refresh*` dos hooks. Todas elas rodam DEPOIS de uma escrita
 * bem-sucedida, para trazer o que o banco recalculou por trigger: valor executado,
 * saldo de conta, percentual da etapa, resultado por obra.
 *
 * O silêncio é o pior comportamento possível justamente aí. A escrita funcionou, o
 * banco recalculou, e a tela continua mostrando o número ANTIGO — indefinidamente,
 * sem nenhum sinal. O usuário vê um total que não fecha e conclui que o sistema
 * está errado, quando o dado correto está no servidor a um F5 de distância.
 *
 * Não pode ser um `throw`: a escrita já teve sucesso e a tela já comemorou; lançar
 * daqui transformaria uma releitura falha num erro que parece ser da escrita.
 *
 * Então: avisa, com a ação que resolve.
 */
import type { ToastType } from '../components/FeedbackContext';

type Toast = Record<ToastType, (message: string, description?: string) => void>;

/**
 * Devolve um handler de `.catch` para uma função `refresh*`.
 *
 *     const refreshOrcamentos = () =>
 *       orcamentoService.list().then(setOrcamentos).catch(avisoRefetch(toast, 'o orçamento'));
 *
 * `oQue` completa a frase e deve ser um substantivo com artigo — é lido pelo
 * usuário final, não pelo desenvolvedor.
 */
export function avisoRefetch(toast: Toast, oQue: string) {
  return (err: unknown) => {
    const detalhe = err instanceof Error ? err.message : String(err);
    toast.warning(
      `A alteração foi salva, mas ${oQue} não pôde ser recarregado.`,
      `${detalhe} — os números na tela podem estar defasados. Recarregue a página.`
    );
  };
}
