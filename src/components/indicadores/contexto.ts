import type { Projeto, ResumoObra, Tarefa } from '../../types';
import type { Escopo } from '../../lib/indicadores/calculos';
import type { AcessoBI, CategoriaBI, DadosBI, FiltrosBI } from '../../lib/indicadores/tipos';

/**
 * O que toda visão de categoria recebe. Uma interface só, e não sete listas de
 * props, porque o ponto do painel é que os sete recortes leem o MESMO escopo —
 * se cada visão recebesse a sua fatia, bastaria esquecer uma prop para um
 * gráfico ignorar o filtro sem ninguém notar.
 */
export interface ContextoVisao {
  dados: DadosBI;
  acesso: AcessoBI;
  escopo: Escopo;
  /** Os filtros como estão — para a fatia já escolhida aparecer marcada. */
  filtros: FiltrosBI;
  projetos: Projeto[];
  resumos: ResumoObra[];
  tarefas: Tarefa[];
  hoje: string;
  /** Comparar com o período anterior está ligado. */
  comparar: boolean;
  rotuloAnterior: string;
  nomeObra: (id: string | undefined) => string;
  nomeCliente: (id: string | undefined) => string;
  nomeFuncionario: (id: string | undefined) => string;
  /** Filtro cruzado: o clique num gráfico vira filtro do painel inteiro. */
  filtrar: (mudanca: Partial<FiltrosBI>) => void;
  irPara: (categoria: CategoriaBI) => void;
  abrirObra: (id: string) => void;
}

/** Leva até a tabela de detalhe — o destino do clique num KPI. */
export function rolarPara(id: string) {
  // `requestAnimationFrame`: o recorte que o KPI liga re-renderiza a tabela
  // antes, e rolar no mesmo tique mira a altura antiga.
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** O nome curto da obra no eixo do gráfico. O nome inteiro vai na dica. */
export function encurtar(texto: string, max = 22): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export const GRADE_GRAFICOS = 'grid grid-cols-1 gap-5 xl:grid-cols-2';
