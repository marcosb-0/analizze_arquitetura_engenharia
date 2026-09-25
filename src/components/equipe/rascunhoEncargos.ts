import { RubricaEncargo } from '../../types';

/**
 * O rascunho da tabela de encargos e as perguntas sobre ele. Fora do
 * componente para o pai (`ParametrosMaoDeObra`) decidir quando e em que ordem
 * salvar, e para o fast refresh não perder o estado da tabela a cada edição.
 */

export type Nova = Pick<RubricaEncargo, 'codigo' | 'grupo' | 'descricao' | 'percentualHorista' | 'percentualMensalista' | 'aplicaHorista' | 'aplicaMensalista'>;
export type Rascunho = { h: string; m: string; descricao: string; ativo: boolean; aplicaH: boolean; aplicaM: boolean; formula: RubricaEncargo['formula'] };
export type Rascunhos = Record<string, Rascunho>;

const texto = (n: number | null) => n == null ? '' : String(n).replace('.', ',');
export const formatoPct = (n: number | null) => n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
export function numero(s: string): number | null {
  const v = s.trim();
  return /^\d+(?:[,.]\d{1,4})?$/.test(v) ? Number(v.replace(',', '.')) : null;
}
export function erroNumero(s: string): string | null {
  if (!s.trim()) return null;
  const n = numero(s);
  if (n === null) return 'Use número com até 4 casas decimais.';
  return n > 300 ? 'Máximo: 300%.' : null;
}

/** O rascunho que reproduz exatamente o que está gravado. */
export function rascunhoDe(rubricas: readonly RubricaEncargo[]): Rascunhos {
  const inicial: Rascunhos = {};
  for (const r of rubricas) inicial[r.codigo] = {
    h: texto(r.percentualHorista), m: texto(r.percentualMensalista), descricao: r.descricao,
    ativo: r.ativo, aplicaH: r.aplicaHorista, aplicaM: r.aplicaMensalista, formula: r.formula,
  };
  return inicial;
}

/** As rubricas como ficariam se o rascunho fosse salvo agora. */
export function aplicarRascunho(rubricas: readonly RubricaEncargo[], rascunho: Rascunhos): RubricaEncargo[] {
  return rubricas.map((r) => {
    const d = rascunho[r.codigo];
    return d ? { ...r, descricao: d.descricao, ativo: d.ativo, formula: d.formula,
      aplicaHorista: d.aplicaH, aplicaMensalista: d.aplicaM,
      percentualHorista: r.grupo === 'D' || !d.aplicaH ? null : numero(d.h),
      percentualMensalista: r.grupo === 'D' || !d.aplicaM ? null : numero(d.m) } : r;
  });
}

/** Algum campo do rascunho que o banco recusaria. */
export function rascunhoInvalido(rubricas: readonly RubricaEncargo[], rascunho: Rascunhos): boolean {
  return rubricas.some((r) => {
    const d = rascunho[r.codigo];
    return !!d && (d.descricao.trim().length < 1 || d.descricao.trim().length > 120 ||
      (d.aplicaH && !!erroNumero(d.h)) || (d.aplicaM && !!erroNumero(d.m)));
  });
}

/** Rubricas ativas que incidem num regime e estão em branco. Em branco não é 0%. */
export function rubricasPendentes(editadas: readonly RubricaEncargo[]): RubricaEncargo[] {
  return editadas.filter((r) => r.ativo && !r.formula &&
    ((r.aplicaHorista && r.percentualHorista === null) || (r.aplicaMensalista && r.percentualMensalista === null)));
}

export function rubricasAlteradas(originais: readonly RubricaEncargo[], editadas: readonly RubricaEncargo[]): boolean {
  return editadas.some((r, i) => {
    const o = originais[i];
    return r.descricao !== o.descricao || r.ativo !== o.ativo || r.formula !== o.formula ||
      r.aplicaHorista !== o.aplicaHorista || r.aplicaMensalista !== o.aplicaMensalista ||
      r.percentualHorista !== o.percentualHorista || r.percentualMensalista !== o.percentualMensalista;
  });
}

