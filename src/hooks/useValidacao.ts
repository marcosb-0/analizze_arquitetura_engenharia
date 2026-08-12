import { useCallback, useEffect, useRef, useState } from 'react';
import { Checagem, Erros, coletarErros, temErro } from '../lib/validacao';

/**
 * A metade com DOM da rotina única de validação (ver `lib/validacao.ts`).
 *
 * Guarda os erros do formulário e, a cada tentativa de envio malsucedida, leva
 * o foco ao primeiro campo inválido — que é o que faltava para o formulário
 * "falar". Sem isso o usuário de um assistente de 3 passos vê o botão não
 * responder e não tem como saber que o problema está três telas acima.
 *
 * **O primeiro inválido é o primeiro na ORDEM DO DOM**, achado por
 * `aria-invalid`, e não o primeiro da lista de checagens. Os dois quase sempre
 * coincidem, mas quando divergem quem manda é a tela: o usuário procura de cima
 * para baixo, não na ordem em que os `if` foram escritos. De brinde, isso faz o
 * mecanismo funcionar sem `ref` por campo — o `Field` já marca `aria-invalid`,
 * então quem migrar um formulário para o primitivo ganha o foco de graça.
 */
export function useValidacao<C extends string>() {
  const [erros, setErros] = useState<Erros<C>>({});
  const areaRef = useRef<HTMLElement | null>(null);
  /**
   * Contador de tentativas, não os erros, como gatilho do efeito: enviar duas
   * vezes seguidas com o MESMO erro precisa focar de novo. Comparando o objeto
   * de erros, a segunda tentativa não mexeria em nada e o formulário voltaria a
   * ficar mudo justo para quem já não entendeu na primeira.
   */
  const [tentativa, setTentativa] = useState(0);

  /**
   * Valida e publica os erros. Devolve `true` quando pode seguir — a chamada
   * vira `if (!validar([...])) return;` no início do submit.
   */
  const validar = useCallback((checagens: Checagem<C>[]): boolean => {
    const novos = coletarErros(checagens);
    setErros(novos);
    setTentativa((n) => n + 1);
    return !temErro(novos);
  }, []);

  /**
   * Apaga o erro de um campo enquanto ele é editado. Chamado no `onChange`, faz
   * a mensagem sumir quando o usuário começa a consertar, em vez de acusar até
   * o próximo envio.
   */
  const limparErro = useCallback((campo: C) => {
    setErros((atuais) => {
      if (atuais[campo] === undefined) return atuais;
      const proximos = { ...atuais };
      delete proximos[campo];
      return proximos;
    });
  }, []);

  const limparTudo = useCallback(() => setErros({}), []);

  useEffect(() => {
    if (tentativa === 0 || !temErro(erros)) return;
    // `areaRef` não ligado cai no documento inteiro: um formulário fora de
    // diálogo continua funcionando, só perde a proteção contra achar um campo
    // inválido de outra tela aberta ao mesmo tempo.
    const raiz: ParentNode = areaRef.current ?? document;
    const alvo = raiz.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!alvo) return;
    // Rolagem separada do foco: dentro do corpo rolável de um diálogo, o
    // `focus()` sozinho encosta o campo na borda. `auto` e não `smooth` — é
    // resposta a uma ação do usuário, e animar aqui atrapalha quem pediu
    // movimento reduzido.
    alvo.focus({ preventScroll: true });
    // O `?.` não é paranoia: o jsdom da suíte não implementa `scrollIntoView`, e
    // sem ele o teste que protege o FOCO quebraria por causa da ROLAGEM.
    alvo.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    // Só `tentativa` no vetor: `erros` muda a cada tecla digitada (o
    // `limparErro`), e reagir a ele roubaria o foco do campo sendo editado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tentativa]);

  return { erros, validar, limparErro, limparTudo, areaRef };
}
