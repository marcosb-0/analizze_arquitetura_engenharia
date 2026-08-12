/**
 * A rotina única de validação de formulário.
 *
 * §M, causa-raiz nº 5: **não havia rotina**. Cada formulário escrevia o seu
 * `if` e terminava num toast genérico — "Preencha todos os campos
 * obrigatórios" — que não diz QUAL campo, não marca o campo na tela e não leva
 * o cursor até ele. Em formulário de 12 campos isso é uma caça ao tesouro; no
 * assistente de obra é pior, porque o botão "Avançar" continua com cara de
 * ativo e o passo simplesmente não passa. O usuário conclui que travou.
 *
 * O que muda aqui: a validação devolve **erro por campo**, o `Field` pinta o
 * campo e anuncia a mensagem (`role="alert"` + `aria-invalid`), e o
 * `useValidacao` leva o foco ao primeiro inválido — na ordem da TELA, não na
 * ordem em que alguém escreveu os `if`.
 *
 * Este arquivo é puro de propósito: não conhece React nem DOM, então a regra de
 * negócio do formulário é testável sem montar componente. O que precisa do DOM
 * (foco, rolagem) mora no hook.
 */

/** Mensagem por campo. Campo ausente = campo válido. */
export type Erros<C extends string> = Partial<Record<C, string>>;

/**
 * Uma condição de invalidez, já com a frase que o usuário vai ler.
 *
 * `invalido` é avaliado por quem chama, e não uma função, porque quase toda
 * checagem daqui cruza dois campos ("entrega antes do início", "contratado
 * acima do orçado") e um validador por campo isolado obrigaria a inventar um
 * mecanismo de dependências para o caso raro.
 */
export interface Checagem<C extends string> {
  campo: C;
  invalido: boolean;
  /**
   * O que fazer, não o que faltou. "Informe o nome da obra" em vez de "Campo
   * obrigatório" — a segunda frase repete o que o asterisco já disse.
   */
  erro: string;
}

/**
 * Reduz a lista a um erro por campo, mantendo o PRIMEIRO da lista.
 *
 * A ordem importa: quem escreve declara da checagem mais grosseira para a mais
 * fina ("informe o valor" antes de "valor fora da faixa"), e mostrar as duas ao
 * mesmo tempo no mesmo campo só ocuparia espaço.
 */
export function coletarErros<C extends string>(checagens: Checagem<C>[]): Erros<C> {
  const erros: Erros<C> = {};
  for (const { campo, invalido, erro } of checagens) {
    if (invalido && erros[campo] === undefined) erros[campo] = erro;
  }
  return erros;
}

export function temErro<C extends string>(erros: Erros<C>): boolean {
  return Object.keys(erros).length > 0;
}

// ---------------------------------------------------------------------------
// Predicados
//
// Existem para que a lista de checagens se leia como a regra falada, e para que
// as bordas fiquem num lugar só. `'  '` é vazio, `'0'` não é vazio, `''` não é
// zero — cada um desses foi um bug em algum formulário deste app.
// ---------------------------------------------------------------------------

/** Texto ausente ou só de espaços. */
export const vazio = (valor: string | null | undefined): boolean => !valor || valor.trim() === '';

/** Nada foi escolhido num `<select>` — o `value=""` da opção "A definir". */
export const naoEscolhido = (valor: string | null | undefined): boolean => vazio(valor);

/**
 * O campo tem conteúdo que não é número. Vazio NÃO é inválido aqui: quem exige
 * presença declara um `vazio()` antes, na mesma lista.
 */
export const naoEhNumero = (valor: string): boolean => !vazio(valor) && Number.isNaN(Number(valor));

/** Número preenchido fora do intervalo fechado. Vazio passa (ver `naoEhNumero`). */
export const foraDaFaixa = (valor: string, min: number, max: number): boolean => {
  if (vazio(valor) || naoEhNumero(valor)) return false;
  const n = Number(valor);
  return n < min || n > max;
};

/** Número que precisa ser estritamente maior que zero. Vazio passa. */
export const naoEhPositivo = (valor: string | number): boolean => {
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (typeof valor === 'string' && vazio(valor)) return false;
  return Number.isNaN(n) || n <= 0;
};

/**
 * Fim antes do início, em datas `YYYY-MM-DD`.
 *
 * Comparação de string basta neste formato e evita o `new Date()` que atrasa um
 * dia em coluna `date` (ver `lib/data.ts`). Datas incompletas não acusam aqui —
 * a ausência é checada pelo `vazio()` do próprio campo.
 */
export const fimAntesDoInicio = (inicio: string, fim: string): boolean =>
  !vazio(inicio) && !vazio(fim) && fim < inicio;
