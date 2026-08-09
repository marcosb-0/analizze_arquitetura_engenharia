import { EtapaCronograma } from '../../types';

/**
 * A árvore da EAP montada a partir da lista plana que a view devolve.
 *
 * O servidor já resolve `nivel`, `wbs_codigo` e `eh_folha` (v_etapas_cronograma),
 * e continua sendo a fonte da verdade. Aqui a árvore é remontada mesmo assim
 * porque a TELA precisa da estrutura, não só do rótulo: recolher um grupo,
 * recusar um destino de arraste que está dentro da própria etapa, ou rolar o
 * percentual das frentes para o grupo são perguntas sobre filhos e descendentes,
 * e responder cada uma varrendo a lista plana seria O(n²) por quadro de arraste.
 *
 * `wbs.test.ts` guarda a paridade com a CTE recursiva da view: se as duas
 * numerações divergirem, a tela mostra "1.2" onde o banco diz "1.3".
 */
export interface NoArvore {
  etapa: EtapaCronograma;
  filhos: NoArvore[];
  /** 0 na raiz. */
  nivel: number;
  /** "1", "1.2", "1.2.3". */
  wbs: string;
}

/** Raiz é `parentId` vazio — o service traduz o NULL do banco para ''. */
const EH_RAIZ = (e: EtapaCronograma) => e.parentId === '';

/**
 * Monta a floresta em pré-ordem, ordenando irmãos por `ordem` e desempatando
 * por `id`.
 *
 * Uma etapa cujo pai não está na lista é tratada como RAIZ, e isso é deliberado.
 * Acontece de verdade em duas janelas: entre trocar de obra e a nova busca
 * chegar (o provedor de dados é externo ao `key` do console), e quando a RLS
 * esconde o pai de um papel mas não a filha. Descartá-la faria a etapa
 * DESAPARECER da tela sem erro nenhum — que é o pior modo de falha possível
 * numa tela de planejamento.
 */
export function montarArvore(etapas: EtapaCronograma[]): NoArvore[] {
  const presentes = new Set(etapas.map((e) => e.id));
  const filhosPorPai = new Map<string, EtapaCronograma[]>();
  const raizes: EtapaCronograma[] = [];

  for (const etapa of etapas) {
    if (EH_RAIZ(etapa) || !presentes.has(etapa.parentId)) {
      raizes.push(etapa);
      continue;
    }
    const irmaos = filhosPorPai.get(etapa.parentId);
    if (irmaos) irmaos.push(etapa);
    else filhosPorPai.set(etapa.parentId, [etapa]);
  }

  const ordenar = (lista: EtapaCronograma[]) =>
    [...lista].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));

  // Ciclo (A dentro de B, B dentro de A) não sobrevive às triggers do banco,
  // mas sobrevive a um estado local a meio caminho. Sem `vistos`, a recursão
  // abaixo não terminaria.
  const vistos = new Set<string>();

  const construir = (lista: EtapaCronograma[], nivel: number, prefixo: string): NoArvore[] =>
    ordenar(lista).flatMap((etapa, i) => {
      if (vistos.has(etapa.id)) return [];
      vistos.add(etapa.id);
      const wbs = prefixo ? `${prefixo}.${i + 1}` : String(i + 1);
      return [{
        etapa,
        nivel,
        wbs,
        filhos: construir(filhosPorPai.get(etapa.id) ?? [], nivel + 1, wbs),
      }];
    });

  return construir(raizes, 0, '');
}

/**
 * A árvore de volta em lista, na ordem em que a tela desenha as linhas — e é
 * essa posição que vira a coordenada Y das barras e das setas do Gantt.
 *
 * Um grupo recolhido aparece; os descendentes dele, não.
 */
export function aplainar(arvore: NoArvore[], recolhidos: ReadonlySet<string> = new Set()): NoArvore[] {
  const saida: NoArvore[] = [];
  const descer = (nos: NoArvore[]) => {
    for (const no of nos) {
      saida.push(no);
      if (!recolhidos.has(no.etapa.id)) descer(no.filhos);
    }
  };
  descer(arvore);
  return saida;
}

/** Índice de pai por filho, para as travessias abaixo não remontarem a árvore. */
function paiPorFilho(etapas: EtapaCronograma[]): Map<string, string> {
  return new Map(etapas.filter((e) => e.parentId !== '').map((e) => [e.id, e.parentId]));
}

/**
 * `candidatoId` está em algum ponto acima de `alvoId`?
 *
 * É a pergunta que barra o movimento absurdo — soltar um grupo dentro de uma
 * frente dele mesmo. Sobe do alvo até a raiz em vez de descer do candidato:
 * a subida é linear na profundidade (≤ 4), a descida é linear na obra inteira.
 */
export function ehAncestral(
  etapas: EtapaCronograma[],
  candidatoId: string,
  alvoId: string
): boolean {
  if (candidatoId === alvoId) return false;
  const pais = paiPorFilho(etapas);
  let atual = pais.get(alvoId);
  let passos = 0;
  while (atual !== undefined && passos < 64) {
    if (atual === candidatoId) return true;
    atual = pais.get(atual);
    passos += 1;
  }
  return false;
}

/** Descendentes estritos de `id`, em pré-ordem. Não inclui a própria etapa. */
export function descendentes(etapas: EtapaCronograma[], id: string): EtapaCronograma[] {
  const filhosPorPai = new Map<string, EtapaCronograma[]>();
  for (const e of etapas) {
    if (e.parentId === '') continue;
    const irmaos = filhosPorPai.get(e.parentId);
    if (irmaos) irmaos.push(e);
    else filhosPorPai.set(e.parentId, [e]);
  }

  const saida: EtapaCronograma[] = [];
  const vistos = new Set<string>([id]);
  const fila = [...(filhosPorPai.get(id) ?? [])];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (vistos.has(atual.id)) continue;
    vistos.add(atual.id);
    saida.push(atual);
    fila.push(...(filhosPorPai.get(atual.id) ?? []));
  }
  return saida;
}

/**
 * As folhas sob `id` — as únicas que carregam trabalho de verdade.
 *
 * É o que alimenta o rollup de percentual do grupo: `calcularAvancoFisico` das
 * folhas descendentes, com os mesmos vínculos e itens que o console já tem em
 * memória. Uma etapa-folha responde a si mesma, para o chamador não precisar
 * de um `if`.
 */
export function folhasDe(etapas: EtapaCronograma[], id: string): EtapaCronograma[] {
  const abaixo = descendentes(etapas, id);
  if (abaixo.length === 0) {
    const propria = etapas.find((e) => e.id === id);
    return propria ? [propria] : [];
  }
  return abaixo.filter((e) => e.ehFolha);
}

/**
 * Só as folhas da lista.
 *
 * É o recorte que TODO agregado precisa: grupo não é trabalho, é soma. Sem
 * isto, `calcularAvancoFisico` cairia na média simples dividindo por um
 * denominador que inclui grupos a 0% — uma obra com 5 grupos e 15 frentes a
 * 100% mostraria 75%. As views fazem o mesmo recorte pela coluna `eh_folha`,
 * e é de propósito que os dois lados filtrem pelo MESMO derivado.
 */
export function somenteFolhas(etapas: EtapaCronograma[]): EtapaCronograma[] {
  return etapas.filter((e) => e.ehFolha);
}
