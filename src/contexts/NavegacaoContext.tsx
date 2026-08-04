import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DADOS_POR_ABA } from '../constants/abas';
import { canAccessTab } from '../constants/tabAccess';
import { lerRota, montarRota, ROTA_INICIAL, type Rota } from '../lib/rotas';
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

/**
 * Onde o endereço atual manda ir — ou o painel, se ele não manda a lugar nenhum
 * que este papel possa abrir.
 *
 * O papel entra aqui porque a URL é a única porta de entrada que a sidebar não
 * filtra: ela já esconde os módulos sem acesso, mas um link colado por um
 * colega alcança qualquer aba. Sem esta guarda, `financeiro` abrindo
 * `/catalogo` veria a tela montada e vazia — a RLS devolve nada — em vez de ser
 * levado para onde ele pode trabalhar.
 */
function rotaDeEntrada(role: Parameters<typeof canAccessTab>[0]): Rota {
  const rota = lerRota(window.location.pathname);
  if (!rota || !canAccessTab(role, rota.aba)) return ROTA_INICIAL;
  return rota;
}

export function NavegacaoProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const role = profile?.role;

  /**
   * Aba e obra num estado só, porque a URL é uma coisa só.
   *
   * Separados, uma navegação que mexe nos dois (abrir a obra vinda de uma
   * proposta) escreveria dois endereços no histórico, e o botão voltar levaria
   * a um estado intermediário que ninguém pediu.
   *
   * O papel é lido na inicialização e não depois: esta árvore só é montada para
   * sessão com perfil carregado e ativo (ver a guarda no `App`), então não
   * existe o primeiro render com `role` indefinido que obrigaria a revalidar a
   * rota quando o perfil chegasse.
   */
  const [rota, definirRota] = useState<Rota>(() => rotaDeEntrada(role));
  const { aba: activeTab, projetoId: selectedProjectId } = rota;
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
    // A aba de ENTRADA, e não o painel: quem abre `/equipe` direto precisa que
    // os dados de equipe sejam pedidos, senão a tela do link chega vazia.
    () => new Set([rota.aba])
  );

  const marcarVisitada = useCallback((tabId: string) => {
    setAbasVisitadas((atual) => (atual.has(tabId) ? atual : new Set([...atual, tabId])));
  }, []);

  const setActiveTab = useCallback(
    (tabId: string) => {
      // A obra aberta NÃO é limpa aqui, e isso é o comportamento de antes: quem
      // troca de aba pela sidebar já a limpa explicitamente, e o atalho de obra
      // depende de ela sobreviver. `montarRota` é que não a escreve na URL de
      // outra aba.
      definirRota((atual) => (atual.aba === tabId ? atual : { ...atual, aba: tabId }));
      marcarVisitada(tabId);
    },
    [marcarVisitada]
  );

  const setSelectedProjectId = useCallback((id: string | null) => {
    definirRota((atual) => (atual.projetoId === id ? atual : { ...atual, projetoId: id }));
  }, []);

  const dadosAtivos = useMemo(() => {
    const conjunto = new Set<string>();
    for (const aba of abasVisitadas) {
      for (const dado of DADOS_POR_ABA[aba] ?? []) conjunto.add(dado);
    }
    return conjunto;
  }, [abasVisitadas]);

  const navigateTab = useCallback(
    (tabId: string, projectId: string | null = null) => {
      if (!canAccessTab(role, tabId)) return;
      definirRota({ aba: tabId, projetoId: projectId });
      marcarVisitada(tabId);
    },
    [role, marcarVisitada]
  );

  /**
   * O estado escreve o endereço.
   *
   * Um efeito só, e não uma chamada a `pushState` em cada handler: `setActiveTab`
   * e `setSelectedProjectId` são chamados de sete lugares, e a versão por
   * handler deixaria de fora justamente os que ninguém lembra — o "voltar para
   * a lista" do cabeçalho, o console que fecha, a obra recém-criada pelo wizard.
   */
  const corrigindoEndereco = useRef(true);
  useEffect(() => {
    const caminho = montarRota(rota.aba, rota.projetoId);
    /**
     * Duas escritas diferentes no histórico, e confundi-las quebra o botão
     * voltar em silêncio:
     *
     * - `replaceState` CORRIGE o endereço atual — a normalização da entrada
     *   (`/indicadores` → `/`) e o link quebrado ou sem permissão que caiu no
     *   painel. Empilhar isso faria o voltar devolver o usuário ao endereço
     *   ruim, que corrigiria de novo: o botão voltar deixaria de funcionar.
     * - `pushState` é navegação de verdade, feita pelo usuário dentro do app.
     */
    const corrigindo = corrigindoEndereco.current;
    corrigindoEndereco.current = false;
    if (caminho === window.location.pathname) return;
    window.history[corrigindo ? 'replaceState' : 'pushState']({}, '', caminho);
  }, [rota]);

  /**
   * E o endereço escreve o estado, quando quem navega é o browser.
   *
   * `definirRota` recebe sempre um objeto novo, de propósito: devolver o estado
   * atual quando nada mudou pularia o efeito acima e deixaria
   * `corrigindoEndereco` ligado — a PRÓXIMA navegação do usuário viraria um
   * `replaceState`, e o histórico perderia uma entrada sem nenhum sintoma no
   * lugar onde o erro foi cometido.
   */
  useEffect(() => {
    const aoNavegarNoBrowser = () => {
      const alvo = rotaDeEntrada(role);
      corrigindoEndereco.current = true;
      definirRota({ ...alvo });
      marcarVisitada(alvo.aba);
    };
    window.addEventListener('popstate', aoNavegarNoBrowser);
    return () => window.removeEventListener('popstate', aoNavegarNoBrowser);
  }, [role, marcarVisitada]);

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
    [activeTab, selectedProjectId, menuAberto, setActiveTab, setSelectedProjectId, navigateTab]
  );

  return (
    <DadosAtivosCtx.Provider value={dadosAtivos}>
      <NavegacaoCtx.Provider value={valor}>{children}</NavegacaoCtx.Provider>
    </DadosAtivosCtx.Provider>
  );
}
