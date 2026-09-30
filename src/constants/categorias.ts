import type { CategoriaCusto, InsumoCatalogo } from '../types';

/**
 * Rótulo de tela das categorias — o valor gravado não muda, o que a pessoa lê
 * sim.
 *
 * O catálogo tinha UMA categoria "Serviço", e ela chegava à proposta como
 * "Terceiros". Quem cadastrava reboco e alvenaria cadastrava o serviço que a
 * PRÓPRIA empresa executa, e lia na proposta que era subcontratado. Desde
 * 20260930214831 são duas:
 *
 *   'Serviço'              → "Serviço próprio"        → orçamento 'Serviços'
 *   'Serviço terceirizado' → "Serviço terceirizado"   → orçamento 'Terceiros'
 *
 * Os valores 'Serviço' e 'Terceiros' continuam gravados assim: renomeá-los
 * obrigaria a reescrever as funções do banco que os comparam e as revisões
 * congeladas de proposta, que guardam a categoria como texto. Toda tela que
 * MOSTRA uma categoria passa por aqui; a que só compara usa o valor cru.
 */
const ROTULO_INSUMO: Record<InsumoCatalogo['categoria'], string> = {
  'Material': 'Material',
  'Mão de Obra': 'Mão de Obra',
  'Equipamento': 'Equipamento',
  'Serviço': 'Serviço próprio',
  'Serviço terceirizado': 'Serviço terceirizado',
  'Taxa': 'Taxa',
};

const ROTULO_CUSTO: Record<CategoriaCusto, string> = {
  'Materiais': 'Materiais',
  'Mão de Obra': 'Mão de Obra',
  'Equipamentos': 'Equipamentos',
  'Serviços': 'Serviços próprios',
  'Terceiros': 'Serviços terceirizados',
  'Deslocamentos': 'Deslocamentos',
  'Administração': 'Administração',
  'Contingências': 'Contingências',
};

/** Categoria do catálogo como a tela a escreve. */
export function rotuloCategoriaInsumo(categoria: InsumoCatalogo['categoria']): string {
  return ROTULO_INSUMO[categoria] ?? categoria;
}

/**
 * Categoria de custo (proposta, orçamento da obra) como a tela a escreve.
 * Aceita `string` porque revisões congeladas e desvios chegam como texto.
 */
export function rotuloCategoriaCusto(categoria: string): string {
  return ROTULO_CUSTO[categoria as CategoriaCusto] ?? categoria;
}

/** As oito categorias de custo, na ordem dos seletores. */
export const CATEGORIAS_CUSTO: CategoriaCusto[] = [
  'Materiais', 'Mão de Obra', 'Equipamentos', 'Serviços', 'Terceiros',
  'Deslocamentos', 'Administração', 'Contingências',
];
