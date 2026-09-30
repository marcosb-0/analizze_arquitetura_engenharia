import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { GrupoCatalogo } from '../types';
import { catalogoService } from '../services/catalogoService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Grupos de serviço do catálogo (`catalogo_grupos`), compartilhados por todas
 * as telas que filtram ou cadastram por grupo.
 *
 * Um armazém de módulo, e não um provedor em `DadosContext`, porque quem usa a
 * lista está espalhado em profundidade: a barra do catálogo, o cadastro do
 * insumo, a busca de componente dentro da janela da composição e o seletor da
 * proposta. Passar por props atravessaria cinco camadas que não a usam. E é uma
 * lista só: o grupo criado no cadastro precisa aparecer no filtro da barra no
 * mesmo instante, o que estado local em cada tela não daria.
 *
 * Carrega uma vez por sessão, na primeira tela que pedir, e só para quem lê o
 * catálogo (admin e gestão — a mesma matriz da tabela).
 */
type Estado = { grupos: GrupoCatalogo[]; carregado: boolean };

let estado: Estado = { grupos: [], carregado: false };
let emVoo: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function publicar(novo: Estado) {
  estado = novo;
  ouvintes.forEach((o) => o());
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function carregar(): Promise<void> {
  if (estado.carregado) return Promise.resolve();
  emVoo ??= catalogoService
    .listarGrupos()
    .then((grupos) => publicar({ grupos, carregado: true }))
    // Sem grupos a tela funciona (o filtro só fica vazio); o erro não merece
    // toast em cada aba que monta a lista.
    .catch(() => publicar({ grupos: [], carregado: true }))
    .finally(() => { emVoo = null; });
  return emVoo;
}

const ordenar = (lista: GrupoCatalogo[]) =>
  [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export function useGruposCatalogo() {
  const { session, role } = useAuth();
  const userId = session?.user.id;
  const podeLer = role === 'admin' || role === 'gestao';
  const atual = useSyncExternalStore(assinar, () => estado);

  useEffect(() => {
    if (!userId || !podeLer) {
      // Troca de usuário: o próximo que logar não herda a lista do anterior.
      if (estado.carregado) publicar({ grupos: [], carregado: false });
      return;
    }
    void carregar();
  }, [userId, podeLer]);

  /** Cria e devolve o grupo; erro sobe para quem chamou mostrar no formulário. */
  const criarGrupo = useCallback(async (nome: string): Promise<GrupoCatalogo> => {
    const criado = await catalogoService.criarGrupo(nome);
    publicar({ grupos: ordenar([...estado.grupos, criado]), carregado: true });
    return criado;
  }, []);

  return { grupos: atual.grupos, criarGrupo };
}
