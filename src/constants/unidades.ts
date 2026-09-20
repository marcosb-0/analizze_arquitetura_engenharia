/**
 * O domínio canônico de unidade de medida, espelhado da tabela
 * `unidades_medida` (migration `20260920132016_unidades_medida.sql`).
 *
 * POR QUE ESPELHAR EM VEZ DE BUSCAR: a lista tem 20 linhas, nunca muda sem uma
 * migration e é necessária para DESENHAR o formulário — buscá-la no servidor
 * faria todo `<Select>` de unidade nascer vazio e piscar. É o mesmo pacto que
 * `documentosRegras.ts` mantém com `allowed_mime_types` dos buckets: duas
 * cópias deliberadas, com um teste que falha se uma andar sem a outra.
 *
 * O `codigo` É a grafia oficial. Não existe lista de sinônimos de propósito:
 * apelido aceito é segunda grafia com carimbo oficial, e foi exatamente a
 * grafia livre que pôs `UN` e `un` lado a lado no catálogo — com o efeito
 * colateral de `quantidadeEtapa.ts` se recusar a somar quantidades que
 * divergiam só na caixa da letra.
 *
 * MUDOU AQUI? Mude também a migration, e vice-versa. `unidades.test.ts` trava
 * a lista inteira para que a divergência apareça como teste vermelho e não como
 * chave estrangeira violada em produção.
 */

export type GrupoUnidade =
  | 'contagem'
  | 'comprimento'
  | 'área'
  | 'volume'
  | 'massa'
  | 'tempo'
  | 'global';

export interface UnidadeMedida {
  codigo: string;
  nome: string;
  grupo: GrupoUnidade;
}

/** Na mesma ordem da coluna `ordem` do banco — é ela que ordena o `<Select>`. */
export const UNIDADES: readonly UnidadeMedida[] = [
  { codigo: 'un', nome: 'Unidade', grupo: 'contagem' },
  { codigo: 'cj', nome: 'Conjunto', grupo: 'contagem' },
  { codigo: 'pç', nome: 'Peça', grupo: 'contagem' },
  { codigo: 'par', nome: 'Par', grupo: 'contagem' },
  { codigo: 'cx', nome: 'Caixa', grupo: 'contagem' },
  { codigo: 'mlh', nome: 'Milheiro', grupo: 'contagem' },
  { codigo: 'sc', nome: 'Saco', grupo: 'contagem' },
  { codigo: 'm', nome: 'Metro', grupo: 'comprimento' },
  { codigo: 'km', nome: 'Quilômetro', grupo: 'comprimento' },
  { codigo: 'm²', nome: 'Metro quadrado', grupo: 'área' },
  { codigo: 'ha', nome: 'Hectare', grupo: 'área' },
  { codigo: 'm³', nome: 'Metro cúbico', grupo: 'volume' },
  { codigo: 'l', nome: 'Litro', grupo: 'volume' },
  { codigo: 'kg', nome: 'Quilograma', grupo: 'massa' },
  { codigo: 't', nome: 'Tonelada', grupo: 'massa' },
  { codigo: 'h', nome: 'Hora', grupo: 'tempo' },
  { codigo: 'dia', nome: 'Dia', grupo: 'tempo' },
  { codigo: 'mês', nome: 'Mês', grupo: 'tempo' },
  { codigo: 'vb', nome: 'Verba', grupo: 'global' },
  { codigo: '%', nome: 'Percentual', grupo: 'global' },
];

/** A que o formulário recorre quando não há nada escolhido. */
export const UNIDADE_PADRAO = 'un';

/** Os grupos na ordem em que aparecem, sem repetir — alimenta os `<optgroup>`. */
export const GRUPOS_UNIDADE: readonly GrupoUnidade[] = [
  ...new Set(UNIDADES.map((u) => u.grupo)),
];

export function unidadesDoGrupo(grupo: GrupoUnidade): UnidadeMedida[] {
  return UNIDADES.filter((u) => u.grupo === grupo);
}

/**
 * Rótulo legível de uma unidade — `m²` vira "Metro quadrado (m²)".
 *
 * Devolve o próprio código quando não reconhece, em vez de string vazia: dado
 * antigo gravado antes da chave estrangeira ainda pode aparecer numa leitura
 * histórica, e some-lo da tela seria pior que mostrá-lo cru.
 */
export function nomeDaUnidade(codigo: string): string {
  const u = UNIDADES.find((x) => x.codigo === codigo);
  return u ? `${u.nome} (${u.codigo})` : codigo;
}
