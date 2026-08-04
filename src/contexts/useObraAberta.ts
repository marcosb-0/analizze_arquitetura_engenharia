import { useMemo } from 'react';
import type { Projeto } from '../types';
import { useNavegacao } from './NavegacaoContext';
import { useProjetosDados } from './DadosContext';

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
