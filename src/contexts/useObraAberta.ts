import { useMemo } from 'react';
import type { Projeto, Proposta } from '../types';
import { useNavegacao } from './NavegacaoContext';
import { useProjetosDados, usePropostasDados } from './DadosContext';

/**
 * A obra aberta no console, se houver.
 *
 * Cruza navegação com dados, e por isso não pertence a nenhum dos dois: o
 * breadcrumb e o conector de projetos precisam da mesma resposta, e resolvê-la
 * em dois lugares é como o nome da obra aparecia defasado no cabeçalho depois de
 * uma edição.
 */
export function useObraAberta(): Projeto | undefined {
  const { selectedProjectId } = useNavegacao();
  const { projetos } = useProjetosDados();

  return useMemo(
    () => (selectedProjectId ? projetos.find((p) => p.id === selectedProjectId) : undefined),
    [projetos, selectedProjectId]
  );
}

/**
 * A proposta aberta, pelo mesmo motivo e com o mesmo formato.
 *
 * `undefined` cobre os dois casos em que o breadcrumb não tem o que escrever: a
 * carteira aberta (rota sem proposta) e o id que não casa com nenhuma linha
 * carregada — proposta excluída, link antigo, ou a aba ainda buscando. Nos três
 * o nível simplesmente não aparece, em vez de aparecer vazio.
 */
export function usePropostaAberta(): Proposta | undefined {
  const { propostaAberta } = useNavegacao();
  const { propostas } = usePropostasDados();

  return useMemo(
    () => (propostaAberta ? propostas.find((p) => p.id === propostaAberta) : undefined),
    [propostas, propostaAberta]
  );
}
