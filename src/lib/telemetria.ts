/**
 * O caminho único por onde um erro sai do navegador.
 *
 * §10.4 da auditoria: "um erro em produção só existe se o usuário relatar". O
 * `ErrorBoundary` já dizia, no comentário do `componentDidCatch`, que era ali
 * que a telemetria plugaria — mas o boundary vê **só falha de render**, e não é
 * de lá que vem a maioria dos erros deste app. Vêm de `Promise` rejeitada num
 * handler de clique, que hoje não deixa rastro nenhum: nem toast, nem console
 * fora do DevTools de quem já fechou a aba.
 *
 * Por isso este módulo, e não uma chamada de SDK dentro do boundary:
 *
 * 1. **Três origens, um funil.** Falha de render (boundary), rejeição não
 *    tratada e erro global (`window`). As duas últimas eram invisíveis.
 * 2. **O destino é plugável e o padrão não depende de conta nenhuma.** Sem DSN
 *    configurado a telemetria é console estruturado — que já é mais do que
 *    havia. Ligar Sentry é `configurarDestino` no `main.tsx`, sem tocar em
 *    nenhum dos pontos de captura. Ver o fim deste arquivo.
 * 3. **Nada sai daqui sem passar pela limpeza.** Este é um sistema com CPF,
 *    chave PIX e conta bancária em tela (§11), e mensagem de erro de banco
 *    carrega o valor que violou a constraint. Mandar `erro.message` cru para um
 *    serviço de terceiros é vazamento, não observabilidade.
 */

export interface ContextoErro {
  /** Onde nasceu: 'render', 'promessa', 'global', 'refetch'. */
  origem: string;
  /** O módulo ou a operação — 'catálogo', 'o resumo das obras'. */
  escopo?: string;
  /** Pilha de componentes, quando vier do boundary. */
  componentes?: string;
}

type Destino = (erro: Error, contexto: ContextoErro & { rota: string }) => void;

/**
 * Padrões de dado pessoal que aparecem em mensagem de erro deste app.
 *
 * Os três primeiros vêm de violação de constraint: o Postgres devolve o VALOR
 * que falhou, então `funcionarios_cpf_key` chega com o CPF dentro da mensagem.
 * O quarto é o token da sessão, que aparece em erro de rede com a URL inteira.
 *
 * Deliberadamente grosseiro e do lado seguro: prefere apagar um número de nota
 * fiscal a deixar passar um CPF. Quem investiga tem a origem, o escopo, a rota
 * e a pilha — o dígito não é o que falta.
 */
const SEGREDOS: [RegExp, string][] = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '«cpf»'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '«cnpj»'],
  [/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '«email»'],
  [/\b(?:eyJ[\w-]+\.){2}[\w-]+\b/g, '«token»'],
  // Sequência longa de dígitos: conta, agência, chave PIX aleatória.
  [/\b\d{9,}\b/g, '«digitos»'],
];

export function limpar(texto: string): string {
  return SEGREDOS.reduce((t, [padrao, marca]) => t.replace(padrao, marca), texto);
}

/** Console estruturado. Sem DSN, é isto — e já é mais do que havia. */
const consoleDestino: Destino = (erro, ctx) => {
  console.error(`[${ctx.origem}] ${ctx.escopo ?? 'aplicação'} — ${ctx.rota}`, erro, ctx.componentes ?? '');
};

let destino: Destino = consoleDestino;

/** Troca o destino. Chamar uma vez, no `main.tsx`, antes de montar a árvore. */
export function configurarDestino(novo: Destino) {
  destino = novo;
}

/**
 * A rota é o contexto mais barato e mais útil que existe aqui: desde o item 36
 * a URL É a aba mais a obra aberta, então ela já responde "onde a pessoa
 * estava" sem nenhum rastreamento próprio. O id da obra é opaco e fica.
 */
function rotaAtual(): string {
  return typeof window === 'undefined' ? '—' : window.location.pathname;
}

/**
 * Registra um erro. Nunca lança: telemetria que derruba o app é pior que
 * telemetria nenhuma, e este código roda dentro de `componentDidCatch` e de
 * handlers globais, onde um throw viraria laço.
 */
export function registrarErro(erro: unknown, contexto: ContextoErro): void {
  try {
    const normalizado =
      erro instanceof Error ? erro : new Error(typeof erro === 'string' ? erro : JSON.stringify(erro));
    // Cópia: apagar o dado pessoal no objeto original mudaria o que a tela
    // mostra ao usuário, e ali o valor é justamente o que ajuda ele a entender.
    const seguro = new Error(limpar(normalizado.message || normalizado.name));
    seguro.name = normalizado.name;
    seguro.stack = normalizado.stack && limpar(normalizado.stack);
    destino(seguro, { ...contexto, rota: rotaAtual() });
  } catch {
    // Sem fallback: se nem o console aceitou, não há para onde escalar.
  }
}

/**
 * Liga as duas origens que nenhum boundary alcança.
 *
 * `unhandledrejection` é a que importa: toda escrita deste app é `async`, e um
 * `await` que rejeita fora de um `try` morre em silêncio no navegador. Era o
 * maior ponto cego do §10.4, e não estava no diagnóstico.
 *
 * Idempotente porque o StrictMode monta duas vezes em desenvolvimento.
 */
let ligado = false;
export function ligarCapturaGlobal(): void {
  if (ligado || typeof window === 'undefined') return;
  ligado = true;

  window.addEventListener('unhandledrejection', (e) => {
    registrarErro(e.reason, { origem: 'promessa' });
  });

  window.addEventListener('error', (e) => {
    // `ErrorEvent` de recurso (imagem, script) não tem `error` e não é bug de
    // código — registrar todos encheria o destino de ruído de rede.
    if (e.error) registrarErro(e.error, { origem: 'global' });
  });
}

/**
 * ## Como ligar o Sentry, quando houver conta
 *
 * Nada nos pontos de captura muda — é este arquivo, e só ele:
 *
 * ```ts
 * // main.tsx, antes do createRoot
 * import * as Sentry from '@sentry/react';
 * import { configurarDestino, ligarCapturaGlobal } from './lib/telemetria';
 *
 * const dsn = import.meta.env.VITE_SENTRY_DSN;
 * if (dsn) {
 *   Sentry.init({ dsn, sendDefaultPii: false });
 *   configurarDestino((erro, ctx) =>
 *     Sentry.captureException(erro, { tags: { origem: ctx.origem, escopo: ctx.escopo }, extra: ctx })
 *   );
 * }
 * ligarCapturaGlobal();
 * ```
 *
 * O SDK **não** foi instalado, e é decisão e não pendência: são ~30 KB gzip no
 * caminho crítico que o §4.7 acabou de gastar trabalho para reduzir (230 → 188
 * KB), e sem DSN eles não fazem nada. O que faltava era o funil e a limpeza de
 * dado pessoal, que são a parte que não vem de biblioteca nenhuma.
 *
 * `sendDefaultPii: false` no exemplo é cinto e suspensório: a limpeza daqui já
 * roda antes, mas o SDK acrescenta IP e cabeçalhos por conta própria.
 */
