import { useEffect, useMemo, useState } from 'react';

/**
 * Ordenação e paginação incremental para as listas de cadastro.
 *
 * Nenhuma lista do app permitia ordenar — Clientes, Fornecedores, Obras, Equipe,
 * Catálogo e Documentos ofereciam só busca por texto. Com 200 fornecedores ou 80
 * obras, achar "a mais recente" ou "a de maior valor" virava rolagem no olho.
 *
 * E só o Catálogo paginava: as outras renderizavam a lista inteira. Funciona com
 * os dados de hoje e degrada em silêncio conforme a construtora usa o sistema.
 *
 * A paginação aqui é incremental ("carregar mais") e não por números de página:
 * são listas de cards em coluna, onde o usuário está varrendo, não navegando
 * até um índice conhecido.
 */

export interface OpcaoOrdenacao<T> {
  id: string;
  label: string;
  /** Comparador no sentido já final — o hook não inverte nada. */
  comparar: (a: T, b: T) => number;
}

interface Config<T> {
  itens: T[];
  opcoes: OpcaoOrdenacao<T>[];
  /** Quantos itens mostrar de início e a cada "carregar mais". */
  porPagina?: number;
}

/** Comparador de texto ciente de acentos — "Álvaro" tem de vir antes de "Bruno". */
export const compararTexto = (a: string, b: string) =>
  (a ?? '').localeCompare(b ?? '', 'pt-BR', { sensitivity: 'base' });

/** Datas chegam como 'YYYY-MM-DD' ou ISO; string vazia vai para o fim. */
export const compararData = (a: string, b: string) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a); // mais recente primeiro
};

export function useListaOrdenada<T>({ itens, opcoes, porPagina = 30 }: Config<T>) {
  const [ordemId, setOrdemId] = useState(opcoes[0]?.id ?? '');
  const [limite, setLimite] = useState(porPagina);

  const ordenados = useMemo(() => {
    const opcao = opcoes.find((o) => o.id === ordemId) ?? opcoes[0];
    if (!opcao) return itens;
    // Cópia: `sort` altera no lugar, e `itens` costuma ser o array do hook de
    // dados — ordená-lo direto embaralharia o estado compartilhado da aplicação.
    return [...itens].sort(opcao.comparar);
  }, [itens, opcoes, ordemId]);

  // Mudar de filtro, de busca ou de ordem recomeça a paginação: sem isto, quem
  // já tinha carregado 90 itens continuava vendo 90 slots de uma lista nova.
  useEffect(() => {
    setLimite(porPagina);
  }, [itens, ordemId, porPagina]);

  const visiveis = useMemo(() => ordenados.slice(0, limite), [ordenados, limite]);
  const temMais = ordenados.length > limite;

  return {
    /** Já ordenados e cortados no limite atual — é isto que a tela renderiza. */
    visiveis,
    total: ordenados.length,
    mostrando: visiveis.length,
    temMais,
    restantes: Math.max(0, ordenados.length - limite),
    carregarMais: () => setLimite((l) => l + porPagina),
    ordemId,
    setOrdemId,
    opcoes,
  };
}
