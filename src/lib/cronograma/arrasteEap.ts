import { EtapaCronograma } from '../../types';
import { movimentoValido } from './reordenar';
import { ehAncestral } from './wbs';

/**
 * Onde a etapa arrastada vai cair, decidido a partir da posição do ponteiro
 * dentro da linha sob ele.
 *
 * Este arquivo é só a DECISÃO — nada aqui escreve, mede DOM ou conhece React.
 * Quem produz as linhas a gravar continua sendo `mover()` em `reordenar.ts`, e
 * quem grava é `cronogramaService.aplicar`, numa transação só. A separação é a
 * mesma de `agendar.ts` para o arraste do Gantt, e existe pelo mesmo motivo:
 * as regras de recusa abaixo são as do BANCO, e um teste de unidade é o único
 * jeito honesto de trancá-las contra o próximo refactor da tela.
 *
 * As quatro recusas espelham, uma a uma, o que o servidor faria:
 *
 *   - `fn_etapa_hierarquia`  → sem ciclo, no máximo 4 níveis;
 *   - `fn_etapa_pai_sem_execucao` → quem tem vínculo de orçamento, boletim de
 *     medição ou meta quantitativa não pode VIRAR grupo;
 *   - marco não recebe frentes (é um instante, e a view rolaria as datas das
 *     filhas por cima dele).
 *
 * A diferença é o momento: aqui a recusa chega ANTES de soltar, com o motivo
 * na tela, em vez de virar um toast vermelho depois de a linha já ter pulado.
 */

/** Antes/depois é irmão do alvo; dentro é a última filha dele. */
export type Posicao = 'antes' | 'dentro' | 'depois';

/**
 * Nível máximo (0 na raiz). `fn_etapa_hierarquia` recusa acima disto com "A EAP
 * aceita no máximo 4 níveis".
 */
export const NIVEL_MAXIMO = 3;

/**
 * Quanto da altura da linha, em cima e embaixo, vira zona de "irmão".
 *
 * 28% deixa o miolo (44%) para "dentro", que é o alvo mais difícil de acertar e
 * o único que muda a estrutura da EAP. Abaixo de ~25% a zona de irmão fica
 * menor que a imprecisão de um dedo em tablet; acima de ~35% o miolo some.
 */
const ZONA_IRMAO = 0.28;

/**
 * A zona vertical em que o ponteiro está.
 *
 * `aceitaDentro` falso colapsa a linha em duas metades — é o que evita o
 * vermelho piscando ao atravessar uma frente que nunca poderia virar grupo (a
 * maioria delas, assim que ganham orçamento). O motivo vai para o rodapé como
 * aviso, não como recusa.
 */
export function zonaDoPonteiro(fracao: number, aceitaDentro: boolean): Posicao {
  if (!aceitaDentro) return fracao < 0.5 ? 'antes' : 'depois';
  if (fracao < ZONA_IRMAO) return 'antes';
  if (fracao > 1 - ZONA_IRMAO) return 'depois';
  return 'dentro';
}

/** Índice de filhas por pai, para as travessias não varrerem a lista por nó. */
function filhasPorPai(etapas: EtapaCronograma[]): Map<string, EtapaCronograma[]> {
  const mapa = new Map<string, EtapaCronograma[]>();
  for (const e of etapas) {
    if (e.parentId === '') continue;
    const irmas = mapa.get(e.parentId);
    if (irmas) irmas.push(e);
    else mapa.set(e.parentId, [e]);
  }
  return mapa;
}

/**
 * Quantos níveis a subárvore da etapa tem abaixo dela. Folha = 0.
 *
 * É o que falta na checagem do banco: `fn_etapa_hierarquia` roda sobre a linha
 * que MUDA de pai, e as filhas dela viajam junto sem disparar trigger nenhuma.
 * Arrastar um grupo de dois níveis para dentro de outro de nível 2 passaria
 * pelo servidor e deixaria netos no nível 4 — que a view numera, mas que a
 * própria regra proíbe. Contar aqui é o que fecha o buraco.
 */
export function alturaDe(etapas: EtapaCronograma[], id: string): number {
  const filhas = filhasPorPai(etapas);
  const vistos = new Set<string>([id]);
  let altura = 0;
  let nivel = filhas.get(id) ?? [];
  // O `vistos` protege de um ciclo local (A dentro de B, B dentro de A) — não
  // sobrevive às triggers do banco, mas sobrevive a um estado a meio caminho.
  while (nivel.length > 0 && altura < 64) {
    altura += 1;
    const proximo: EtapaCronograma[] = [];
    for (const e of nivel) {
      if (vistos.has(e.id)) continue;
      vistos.add(e.id);
      proximo.push(...(filhas.get(e.id) ?? []));
    }
    nivel = proximo;
  }
  return altura;
}

/**
 * Por que `alvo` não pode receber a etapa arrastada dentro dele. Vazio = pode.
 *
 * A ordem das perguntas é a ordem das mensagens que o usuário mais precisa: o
 * impedimento CONCRETO (tem orçamento, tem boletim, tem meta) antes do
 * estrutural (nível), porque os três primeiros têm conserto e o último não.
 *
 * `arrastadaId` nulo é a pergunta "cabe uma etapa NOVA aqui dentro?", que é a
 * mesma pergunta menos o ciclo e menos a subárvore a carregar. É o que decide
 * se a linha oferece o "+" — oferecer e ser recusado pelo servidor depois é
 * pior do que não oferecer.
 */
export function motivoParaNaoAgrupar(
  etapas: EtapaCronograma[],
  arrastadaId: string | null,
  alvo: EtapaCronograma,
  comExecucao: ReadonlySet<string>
): string {
  if (arrastadaId !== null) {
    if (alvo.id === arrastadaId) return 'Uma etapa não pode ficar dentro de si mesma.';
    if (ehAncestral(etapas, arrastadaId, alvo.id)) {
      return `"${alvo.nome}" está dentro da etapa que você arrasta.`;
    }
  }
  if (alvo.ehMarco) {
    return `"${alvo.nome}" é um marco: uma data única não tem frentes dentro dela.`;
  }
  if (comExecucao.has(alvo.id)) {
    return `"${alvo.nome}" tem orçamento vinculado ou boletim de medição e por isso não pode virar grupo.`;
  }
  if (alvo.quantidadePrevista != null) {
    return `"${alvo.nome}" tem meta própria e por isso não pode virar grupo. Apague a quantidade prevista dela primeiro.`;
  }
  const altura = arrastadaId === null ? 0 : alturaDe(etapas, arrastadaId);
  if (alvo.nivel + 1 + altura > NIVEL_MAXIMO) {
    return 'A EAP aceita no máximo 4 níveis.';
  }
  return '';
}

export interface Resolucao {
  /** Para onde `mover()` deve levar a etapa. `null` quando não há destino. */
  destino: { paiId: string | null; indice: number } | null;
  /** Por que o destino não serve. Vazio quando serve. */
  recusa: string;
  /** O que vai acontecer, em uma frase — para o rodapé e o leitor de tela. */
  resumo: string;
}

/**
 * O destino completo do gesto: para onde vai, ou por que não vai.
 *
 * `destino` só vem preenchido quando `recusa` está vazia — o chamador não
 * precisa checar os dois.
 */
export function resolverDestino(
  etapas: EtapaCronograma[],
  arrastadaId: string,
  alvoId: string,
  posicao: Posicao,
  comExecucao: ReadonlySet<string>
): Resolucao {
  const vazio: Resolucao = { destino: null, recusa: '', resumo: '' };
  const arrastada = etapas.find((e) => e.id === arrastadaId);
  const alvo = etapas.find((e) => e.id === alvoId);
  if (!arrastada || !alvo) return vazio;
  // Soltar sobre a própria linha é desistir do gesto, não um erro: nada a
  // dizer, nada a gravar.
  if (arrastadaId === alvoId) return vazio;

  if (posicao === 'dentro') {
    const recusa = motivoParaNaoAgrupar(etapas, arrastadaId, alvo, comExecucao);
    if (recusa) return { destino: null, recusa, resumo: '' };
    const filhas = etapas.filter((e) => e.parentId === alvoId && e.id !== arrastadaId);
    return {
      destino: { paiId: alvoId, indice: filhas.length },
      recusa: '',
      resumo: `Mover "${arrastada.nome}" para dentro de "${alvo.nome}".`,
    };
  }

  const paiDestino = alvo.parentId === '' ? null : alvo.parentId;
  if (!movimentoValido(etapas, arrastadaId, paiDestino)) {
    return {
      destino: null,
      recusa: `"${alvo.nome}" está dentro da etapa que você arrasta.`,
      resumo: '',
    };
  }
  // O alvo já está no nível de destino, então o teto vale sobre ele — não sobre
  // ele mais um, como no caso "dentro".
  if (alvo.nivel + alturaDe(etapas, arrastadaId) > NIVEL_MAXIMO) {
    return { destino: null, recusa: 'A EAP aceita no máximo 4 níveis.', resumo: '' };
  }

  // O índice é a posição na lista de destino JÁ SEM a etapa arrastada — é o
  // contrato de `mover()`, e é o que dispensa um `if` para "movi para baixo
  // dentro da mesma lista".
  const irmaos = etapas
    .filter((e) => e.parentId === alvo.parentId && e.id !== arrastadaId)
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  const posicaoDoAlvo = irmaos.findIndex((e) => e.id === alvoId);
  if (posicaoDoAlvo < 0) return vazio;

  return {
    destino: { paiId: paiDestino, indice: posicaoDoAlvo + (posicao === 'depois' ? 1 : 0) },
    recusa: '',
    resumo: `Mover "${arrastada.nome}" para ${posicao} de "${alvo.nome}".`,
  };
}
