import type { InsumoCatalogo } from '../../types';

/** O mínimo de cada item para o painel do catálogo — nada de preço por linha nem cotação. */
export interface LinhaResumoCatalogo {
  tipoItem: InsumoCatalogo['tipoItem'];
  categoria: InsumoCatalogo['categoria'];
  ativo: boolean;
  precoNivel: InsumoCatalogo['precoNivel'];
  precoDiasIdade: number | null;
  obrasUtilizando: number;
  grupoId: string | null;
}

/** Preço praticado ou cotado mais velho que isto pede revalidação. */
export const DIAS_PRECO_ANTIGO = 180;

export interface ResumoCatalogo {
  ativos: number;
  insumos: number;
  composicoes: number;
  inativos: number;
  /** Nível 1: cotação firme ou folha da empresa. */
  firmes: number;
  /** Nível 4: só a referência de cadastro, sem preço real por trás. */
  soReferencia: number;
  /** Níveis 1–2 com a origem mais velha que `DIAS_PRECO_ANTIGO`. */
  antigos: number;
  emUso: number;
  porCategoria: Map<InsumoCatalogo['categoria'], number>;
  /** Índice 0..3 = níveis 1..4. */
  porNivel: [number, number, number, number];
  /** `null` = sem grupo. */
  porGrupo: Map<string | null, number>;
}

/** Tudo conta só itens ATIVOS, menos `inativos` — o inativo não entra em orçamento novo. */
export function resumoCatalogo(linhas: LinhaResumoCatalogo[]): ResumoCatalogo {
  const r: ResumoCatalogo = {
    ativos: 0, insumos: 0, composicoes: 0, inativos: 0, firmes: 0, soReferencia: 0, antigos: 0, emUso: 0,
    porCategoria: new Map(), porNivel: [0, 0, 0, 0], porGrupo: new Map(),
  };
  for (const l of linhas) {
    if (!l.ativo) { r.inativos += 1; continue; }
    r.ativos += 1;
    if (l.tipoItem === 'Composicao') r.composicoes += 1; else r.insumos += 1;
    if (l.precoNivel === 1) r.firmes += 1;
    if (l.precoNivel === 4) r.soReferencia += 1;
    if (l.precoNivel <= 2 && (l.precoDiasIdade ?? 0) > DIAS_PRECO_ANTIGO) r.antigos += 1;
    if (l.obrasUtilizando > 0) r.emUso += 1;
    r.porNivel[l.precoNivel - 1] += 1;
    r.porCategoria.set(l.categoria, (r.porCategoria.get(l.categoria) ?? 0) + 1);
    r.porGrupo.set(l.grupoId, (r.porGrupo.get(l.grupoId) ?? 0) + 1);
  }
  return r;
}
