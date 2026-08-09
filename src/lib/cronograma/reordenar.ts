import { EtapaCronograma, PatchOrdem } from '../../types';
import { ehAncestral } from './wbs';

/**
 * Reposicionar uma etapa na EAP, como um conjunto mínimo de linhas a gravar.
 *
 * Toda função aqui devolve `PatchOrdem[]` — nunca escreve, nunca chama serviço.
 * Quem grava é `cronogramaService.aplicar`, numa transação só, e o motivo está
 * no cabeçalho de 20260809100000: o `unique (projeto, pai, ordem)` é
 * `deferrable initially deferred`, e cada chamada do PostgREST é uma transação
 * própria. Trocar duas etapas de lugar em dois updates colide no primeiro.
 *
 * "Mínimo" é literal: só entram as linhas cujo pai ou ordem realmente mudou. A
 * renumeração densa de uma lista de irmãos costuma mexer em duas ou três, não
 * na obra inteira — e uma linha a menos no payload é uma linha a menos para a
 * contagem do `get diagnostics` cobrar.
 *
 * As filhas de uma etapa que se move NÃO entram: o `parent_id` delas não muda,
 * elas viajam junto de graça.
 */

/** Raiz é '' no domínio e NULL no banco. O service converte; aqui normalizamos. */
const RAIZ = '';

function normalizar(paiId: string | null): string {
  return paiId ?? RAIZ;
}

/** Os irmãos de um pai, na ordem canônica (ordem, depois id). */
function irmaosDe(etapas: EtapaCronograma[], paiId: string): EtapaCronograma[] {
  return etapas
    .filter((e) => e.parentId === paiId)
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

/**
 * O destino é aceitável?
 *
 * Duas recusas, e as duas existem porque o resultado seria invisível em vez de
 * errado: soltar uma etapa dentro de si mesma ou dentro de uma subetapa dela
 * cria um ramo que a CTE da view — que desce a partir das raízes — nunca
 * alcança. A obra apareceria com o cronograma vazio, sem erro nenhum. O banco
 * também barra (fn_etapa_hierarquia); aqui é para o arraste poder recusar o
 * alvo ANTES de soltar, em vez de mostrar um toast depois.
 */
export function movimentoValido(
  etapas: EtapaCronograma[],
  id: string,
  paiId: string | null
): boolean {
  const destino = normalizar(paiId);
  if (destino === RAIZ) return true;
  if (destino === id) return false;
  return !ehAncestral(etapas, id, destino);
}

/**
 * Move `id` para a posição `indice` dentro de `paiId`.
 *
 * `indice` é a posição na lista de destino JÁ SEM a etapa movida — é assim que
 * um indicador de arraste entre duas linhas se traduz sem um `if` para o caso
 * "movi para baixo dentro da mesma lista".
 */
export function mover(
  etapas: EtapaCronograma[],
  id: string,
  destino: { paiId: string | null; indice: number }
): PatchOrdem[] {
  const etapa = etapas.find((e) => e.id === id);
  if (!etapa) return [];

  const paiDestino = normalizar(destino.paiId);
  if (!movimentoValido(etapas, id, destino.paiId)) return [];

  const paiOrigem = etapa.parentId;
  const mesmaLista = paiOrigem === paiDestino;

  const origem = irmaosDe(etapas, paiOrigem).filter((e) => e.id !== id);
  const alvo = mesmaLista ? origem : irmaosDe(etapas, paiDestino);

  const indice = Math.max(0, Math.min(destino.indice, alvo.length));
  alvo.splice(indice, 0, etapa);

  const patches: PatchOrdem[] = [];
  const renumerar = (lista: EtapaCronograma[], paiDaLista: string) => {
    lista.forEach((e, i) => {
      const ordem = i + 1;
      if (e.ordem === ordem && e.parentId === paiDaLista) return;
      patches.push({ id: e.id, parentId: paiDaLista === RAIZ ? null : paiDaLista, ordem });
    });
  };

  renumerar(alvo, paiDestino);
  if (!mesmaLista) renumerar(origem, paiOrigem);

  return patches;
}

/**
 * Vira subetapa do irmão anterior — `Alt+→`, a convenção de todo outliner.
 *
 * Sem irmão anterior não há para onde indentar (a primeira linha de uma lista
 * não tem sob quem ficar), e a função devolve vazio em vez de inventar um pai.
 *
 * A etapa entra no FIM das filhas do novo pai, que é onde a pessoa espera vê-la
 * — logo abaixo da linha em que ela já estava.
 *
 * O que esta função NÃO checa: se o futuro pai tem orçamento vinculado ou
 * medição. Isso é invariante de banco (fn_etapa_pai_sem_execucao) porque
 * depende de tabelas que a tela nem sempre tem carregadas, e a mensagem de lá
 * já explica a saída ao usuário.
 */
export function indentar(etapas: EtapaCronograma[], id: string): PatchOrdem[] {
  const etapa = etapas.find((e) => e.id === id);
  if (!etapa) return [];

  const irmaos = irmaosDe(etapas, etapa.parentId);
  const posicao = irmaos.findIndex((e) => e.id === id);
  if (posicao <= 0) return [];

  const novoPai = irmaos[posicao - 1];
  return mover(etapas, id, {
    paiId: novoPai.id,
    indice: irmaosDe(etapas, novoPai.id).length,
  });
}

/**
 * Sobe um nível, virando o irmão logo depois do antigo pai — `Alt+←`.
 *
 * Escolha explícita: os irmãos que vinham DEPOIS dela continuam onde estão.
 * MS Project e Word os transformam em filhos da etapa desindentada, e é a
 * fonte clássica de "desindentei uma linha e a metade de baixo do plano se
 * mexeu". Aqui uma tecla move uma linha, e só.
 */
export function desindentar(etapas: EtapaCronograma[], id: string): PatchOrdem[] {
  const etapa = etapas.find((e) => e.id === id);
  if (!etapa || etapa.parentId === RAIZ) return [];

  const pai = etapas.find((e) => e.id === etapa.parentId);
  if (!pai) return [];

  const avo = pai.parentId;
  const posicaoDoPai = irmaosDe(etapas, avo).findIndex((e) => e.id === pai.id);

  return mover(etapas, id, {
    paiId: avo === RAIZ ? null : avo,
    indice: posicaoDoPai + 1,
  });
}

/**
 * Troca de lugar com o irmão vizinho — `Alt+↑` / `Alt+↓`.
 *
 * Fica dentro da mesma lista de propósito: subir para fora do grupo é
 * desindentar, e misturar as duas coisas na mesma tecla é o que faz uma linha
 * "sumir" para dentro do grupo de cima sem que ninguém entenda por quê.
 */
export function moverEntreIrmaos(
  etapas: EtapaCronograma[],
  id: string,
  direcao: -1 | 1
): PatchOrdem[] {
  const etapa = etapas.find((e) => e.id === id);
  if (!etapa) return [];

  const irmaos = irmaosDe(etapas, etapa.parentId);
  const posicao = irmaos.findIndex((e) => e.id === id);
  const destino = posicao + direcao;
  if (posicao < 0 || destino < 0 || destino >= irmaos.length) return [];

  return mover(etapas, id, {
    paiId: etapa.parentId === RAIZ ? null : etapa.parentId,
    indice: destino,
  });
}
