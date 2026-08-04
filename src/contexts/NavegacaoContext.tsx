import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DADOS_POR_ABA } from '../constants/abas';
import { canAccessTab } from '../constants/tabAccess';
import { useAuth } from './AuthContext';

/**
 * Onde o usuário está: aba aberta, obra aberta, gaveta do menu.
 *
 * Isto morava no `App` junto com os 19 hooks de dados, e era metade do problema
 * do §1.2: mudar de aba re-renderizava a árvore inteira, e uma mudança em
 * qualquer dado re-renderizava a sidebar e o breadcrumb, que não dependem de
 * dado nenhum. Separado, quem só precisa saber "que aba está aberta" assina só
 * isto.
 */
interface Navegacao {
  activeTab: string;
  selectedProjectId: string | null;
  menuAberto: boolean;
  /** Abre uma aba e a marca como visitada (ver `dadosDeAbasVisitadas`). */
  setActiveTab: (tabId: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  setMenuAberto: (aberto: boolean) => void;
  /**
   * Navegação com guarda de papel: os cartões do painel apontam para módulos
   * que o papel pode não acessar (a sidebar já vem filtrada; isto cobre o resto).
   */
  navigateTab: (tabId: string, projectId?: string | null) => void;
}

const NavegacaoCtx = createContext<Navegacao | null>(null);

/**
 * Contexto SEPARADO do de navegação, de propósito.
 *
 * Os 19 provedores de dados leem daqui. Se lessem do contexto de navegação,
 * abrir a gaveta do menu — ou selecionar uma obra — re-executaria os 19 hooks
 * sem que nada relativo a carregamento tivesse mudado.
 */
const DadosAtivosCtx = createContext<ReadonlySet<string> | null>(null);

export function useNavegacao(): Navegacao {
  const ctx = useContext(NavegacaoCtx);
  if (!ctx) throw new Error('useNavegacao() precisa estar dentro de <NavegacaoProvider>');
  return ctx;
}

/**
 * Se o conjunto de dados já foi pedido por alguma aba visitada.
 *
 * É o que cada provedor de dados passa ao seu hook. Diferente da versão que
 * vivia no `App`, não checa `active`: o `App` só monta esta árvore para sessão
 * ativa, então a checagem virou estrutural em vez de ficar repetida em cada
 * chamada de hook.
 */
export function useDadoAtivo(dado: string): boolean {
  const ativos = useContext(DadosAtivosCtx);
  if (!ativos) throw new Error('useDadoAtivo() precisa estar dentro de <NavegacaoProvider>');
  return ativos.has(dado);
}

export function NavegacaoProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeTab, definirAbaAtiva] = useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Abaixo de `lg` a sidebar é uma gaveta sobreposta — antes ela era coluna fixa
  // de 240px em qualquer largura, e o app simplesmente não abria num celular.
  const [menuAberto, setMenuAberto] = useState(false);

  /**
   * O conjunto só cresce: um dado carregado não é descartado ao sair da aba,
   * senão trocar de aba e voltar refaria tudo.
   *
   * O estado guardado são as ABAS visitadas, e os dados ativos são derivados
   * delas. A versão anterior guardava os dados e os sincronizava num `useEffect`
   * disparado pela troca de aba — um render a mais a cada navegação, para
   * calcular algo que já estava determinado pelo estado que acabara de mudar.
   */
  const [abasVisitadas, setAbasVisitadas] = useState<ReadonlySet<string>>(
    () => new Set(['dashboard'])
  );

  const setActiveTab = useCallback((tabId: string) => {
    definirAbaAtiva(tabId);
    setAbasVisitadas((atual) => (atual.has(tabId) ? atual : new Set([...atual, tabId])));
  }, []);

  const dadosAtivos = useMemo(() => {
    const conjunto = new Set<string>();
    for (const aba of abasVisitadas) {
      for (const dado of DADOS_POR_ABA[aba] ?? []) conjunto.add(dado);
    }
    return conjunto;
  }, [abasVisitadas]);

  const role = profile?.role;
  const navigateTab = useCallback(
    (tabId: string, projectId: string | null = null) => {
      if (!canAccessTab(role, tabId)) return;
      setActiveTab(tabId);
      setSelectedProjectId(projectId);
    },
    [role, setActiveTab]
  );

  const valor = useMemo(
    () => ({
      activeTab,
      selectedProjectId,
      menuAberto,
      setActiveTab,
      setSelectedProjectId,
      setMenuAberto,
      navigateTab,
    }),
    [activeTab, selectedProjectId, menuAberto, setActiveTab, navigateTab]
  );

  return (
    <DadosAtivosCtx.Provider value={dadosAtivos}>
      <NavegacaoCtx.Provider value={valor}>{children}</NavegacaoCtx.Provider>
    </DadosAtivosCtx.Provider>
  );
}
