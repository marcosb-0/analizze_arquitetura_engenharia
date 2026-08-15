import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Campo de texto que grava sozinho, sem perder o que está sendo digitado.
 *
 * ## O defeito que ele existe para apagar
 *
 * O descritivo da proposta e as cláusulas do contrato gravavam A CADA TECLA,
 * direto no `onChange`, sem estado local — "a gravação é otimista e o hook já
 * repinta a lista com o valor digitado", dizia o comentário. O que ele não
 * previu é que a resposta do servidor VOLTA, e volta velha.
 *
 * Medido no app, digitando dez caracteres seguidos numa seção do descritivo:
 * **os três primeiros sobreviveram e os sete seguintes sumiram**. A conta é
 * simples e não tem nada de aleatório — a cada tecla sai um PATCH; enquanto o
 * primeiro viaja (~300 ms no Supabase), o usuário digita mais três; a resposta
 * chega com o texto de três teclas atrás, o hook a escreve no estado, e o
 * `<Textarea>` controlado obedece: o campo volta no tempo e o cursor salta para
 * o fim. "Digito 3 caracteres e já vai pra outro lugar" é exatamente isso — o
 * número 3 não é regra nenhuma, é quantas teclas cabem numa ida e volta.
 *
 * ## A regra que conserta
 *
 * **Enquanto o campo está em edição, quem manda é o campo.** O valor de fora só
 * entra quando ninguém está digitando nele; a gravação espera o silêncio e
 * acontece também ao sair do campo. Uma resposta atrasada não tem mais como
 * reescrever o que está sob o cursor.
 *
 * É a mesma forma que `InputQuantidade`, `InputPreco` e `InputMotivo` já usavam
 * na tabela do orçamento (estado local + confirmação no `blur`), com o
 * acréscimo que texto longo pede: gravar sozinho, para ninguém perder um
 * parágrafo por ter fechado a tela sem tirar o foco do campo.
 */

interface Config {
  /** O valor de fora — o que o servidor/estado tem hoje. */
  valor: string;
  /**
   * Grava. É chamada com o texto inteiro, nunca com um pedaço.
   *
   * Só é chamada quando há mudança de verdade: reabrir o campo e sair sem
   * digitar não escreve no banco.
   */
  aoSalvar: (texto: string) => void | Promise<unknown>;
  /** Silêncio de digitação antes de gravar. */
  atraso?: number;
}

export function useCampoAutoSalvo({ valor, aoSalvar, atraso = 600 }: Config) {
  const [texto, setTexto] = useState(valor);

  const editando = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O texto ainda não gravado. `null` = não há nada a gravar. */
  const pendente = useRef<string | null>(null);
  /**
   * A função de gravar vive numa ref porque ela chega nova a cada render (é uma
   * seta escrita no JSX do painel). Sem isto, o `useEffect` de limpeza
   * remontaria a cada render e o temporizador nunca chegaria ao fim.
   */
  const salvar = useRef(aoSalvar);
  useEffect(() => {
    salvar.current = aoSalvar;
  });

  /**
   * O valor de fora só entra quando o campo NÃO está em edição — é esta linha
   * que impede a resposta atrasada de reescrever o que está sob o cursor.
   */
  useEffect(() => {
    if (editando.current) return;
    setTexto(valor);
  }, [valor]);

  const gravar = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const alvo = pendente.current;
    pendente.current = null;
    if (alvo === null) return;
    void salvar.current(alvo);
  }, []);

  /**
   * Sair da tela com gravação pendente não pode custar o texto.
   *
   * O `blur` cobre o caso comum (clicar em qualquer outro lugar tira o foco
   * antes), mas não cobre desmontagem sem foco perdido — e o "voltar para a
   * carteira" da proposta é um botão a dois centímetros do descritivo.
   */
  useEffect(() => gravar, [gravar]);

  return {
    value: texto,
    onChange: (e: { target: { value: string } }) => {
      const novo = e.target.value;
      setTexto(novo);
      pendente.current = novo;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(gravar, atraso);
    },
    onFocus: () => {
      editando.current = true;
    },
    onBlur: () => {
      editando.current = false;
      gravar();
    },
  };
}
