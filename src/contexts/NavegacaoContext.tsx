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
import { canAccessConsoleTab, canAccessTab } from '../constants/tabAccess';
import { lerRota, montarRota, ROTA_INICIAL, SECAO_INICIAL, type Rota } from '../lib/rotas';
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
  /** Seção do console da obra. `null` quando não há obra aberta. */
  secaoObra: string | null;
  /**
   * A proposta aberta. `null` é a CARTEIRA — a lista ocupa a tela inteira, e o
   * detalhe da proposta a substitui em vez de dividir a largura com ela.
   */
  propostaAberta: string | null;
  menuAberto: boolean;
  /** Abre uma aba e a marca como visitada (ver `dadosDeAbasVisitadas`). */
  setActiveTab: (tabId: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  /**
   * Abre uma proposta (id) ou volta para a carteira (`null`).
   *
   * `corrigindo` marca a chamada que CONSERTA o endereço em vez de navegar — o
   * link para uma proposta que não existe mais. Sem ela, a queda para a
   * carteira empilharia uma entrada no histórico, e o botão voltar devolveria o
   * usuário ao endereço quebrado, que cairia de novo: o voltar deixaria de
   * funcionar. É a mesma distinção `replaceState`/`pushState` que o efeito
   * abaixo documenta, exposta a quem sabe que está corrigindo.
   */
  setPropostaAberta: (id: string | null, corrigindo?: boolean) => void;
  /**
   * Troca a seção do console. Ignora quando não há obra aberta — a seção não
   * existe fora dela, e guardá-la "para depois" faria a próxima obra abrir na
   * seção da anterior.
   */
  setSecaoObra: (secao: string) => void;
  setMenuAberto: (aberto: boolean) => void;
  /**
   * Navegação com guarda de papel: os cartões do painel apontam para módulos
   * que o papel pode não acessar (a sidebar já vem filtrada; isto cobre o resto).
   */
  /**
   * O `registroId` é o segundo segmento da URL da aba de destino: a obra em
   * `projetos`, a proposta em `propostas`. Quem chama diz para ONDE ir e O QUE
   * abrir; qual campo do estado recebe o id é decisão daqui, não do chamador.
   */
  navigateTab: (tabId: string, registroId?: string | null) => void;
}

const NavegacaoCtx = createContext<Navegacao | null>(null);

/**
 * Contexto SEPARADO do de navegação, de propósito.
 *
 * Os 20 provedores de dados leem daqui. Se lessem do contexto de navegação,
 * abrir a gaveta do menu — ou selecionar uma obra — re-executaria os 20 hooks
 * sem que nada relativo a carregamento tivesse mudado.
 */
const DadosAtivosCtx = createContext<ReadonlySet<string> | null>(null);

/**
 * A obra aberta, isolada do resto da navegação — item 23, peça 2 (§4.2).
 *
 * Os quatro provedores escopados (orçamento, cronograma, medições, insumos) leem
 * daqui. Pelo mesmo motivo de `DadosAtivosCtx` ser separado: se lessem
 * `NavegacaoCtx`, abrir a gaveta do menu re-executaria os quatro hooks sem que a
 * obra tivesse mudado.
 *
 * `undefined` distingue "fora do provedor" de "nenhuma obra aberta", que é um
 * estado legítimo e o mais comum.
 */
const ObraEscopoCtx = createContext<string | null | undefined>(undefined);

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
/**
 * A obra cujas linhas devem estar carregadas. `null` = nenhuma, e os hooks
 * escopados limpam o estado em vez de buscar.
 */
export function useObraEscopo(): string | null {
  const obra = useContext(ObraEscopoCtx);
  if (obra === undefined) throw new Error('useObraEscopo() precisa estar dentro de <NavegacaoProvider>');
  return obra;
}

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

  /**
   * A seção da obra passa pela MESMA porta, com a matriz de acesso do console.
   *
   * Sem isto, `campo` colando `/projetos/<id>/cronograma` montaria a seção que
   * a matriz dele não tem — a tela apareceria e viria vazia, que é o modo de
   * falha que a guarda de aba acima existe para evitar. Ele cai em "Geral", e
   * **não** no painel: a obra ele pode ver; foi a seção que não era dele.
   */
  if (rota.secao && !canAccessConsoleTab(role, rota.secao)) {
    return { ...rota, secao: SECAO_INICIAL };
  }
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
  const {
    aba: activeTab,
    projetoId: selectedProjectId,
    secao: secaoObra,
    propostaId: propostaAberta,
  } = rota;
  // Abaixo de `lg` a sidebar é uma gaveta sobreposta — antes ela era coluna fixa
  // de 240px em qualquer largura, e o app simplesmente não abria num celular.
  const [menuAberto, setMenuAberto] = useState(false);

  /**
   * A próxima escrita de endereço CORRIGE em vez de navegar. Começa ligada por
   * causa da normalização da rota de entrada; ver o efeito que a consome.
   */
  const corrigindoEndereco = useRef(true);

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
      // outra aba. A proposta aberta segue a mesma regra: quem sai pela sidebar
      // e volta pela sidebar reencontra a proposta em que estava. `navigateTab`
      // é que zera as duas — lá o destino é escolhido, não é um desvio.
      definirRota((atual) => (atual.aba === tabId ? atual : { ...atual, aba: tabId }));
      marcarVisitada(tabId);
    },
    [marcarVisitada]
  );

  /**
   * Abrir ou fechar a obra sempre reposiciona a seção: abrir começa em "Geral",
   * fechar zera. Carregar a seção de uma obra para a seguinte abriria a próxima
   * obra no cronograma só porque a anterior estava lá — um estado que o usuário
   * não pediu e que o endereço não explica.
   */
  const setSelectedProjectId = useCallback((id: string | null) => {
    definirRota((atual) =>
      atual.projetoId === id ? atual : { ...atual, projetoId: id, secao: id ? SECAO_INICIAL : null }
    );
  }, []);

  const setSecaoObra = useCallback((secao: string) => {
    definirRota((atual) =>
      !atual.projetoId || atual.secao === secao ? atual : { ...atual, secao }
    );
  }, []);

  const setPropostaAberta = useCallback((id: string | null, corrigindo = false) => {
    definirRota((atual) => {
      if (atual.propostaId === id) return atual;
      // Antes de mudar o estado, e não depois: o efeito que escreve o endereço
      // roda na sequência desta atualização e é ele quem lê a ref.
      if (corrigindo) corrigindoEndereco.current = true;
      return { ...atual, propostaId: id };
    });
  }, []);

  const dadosAtivos = useMemo(() => {
    const conjunto = new Set<string>();
    for (const aba of abasVisitadas) {
      for (const dado of DADOS_POR_ABA[aba] ?? []) conjunto.add(dado);
    }
    return conjunto;
  }, [abasVisitadas]);

  const navigateTab = useCallback(
    (tabId: string, registroId: string | null = null) => {
      if (!canAccessTab(role, tabId)) return;
      const projetoId = tabId === 'projetos' ? registroId : null;
      definirRota({
        aba: tabId,
        projetoId,
        secao: projetoId ? SECAO_INICIAL : null,
        propostaId: tabId === 'propostas' ? registroId : null,
      });
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
  useEffect(() => {
    const caminho = montarRota(rota);
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
      secaoObra,
      propostaAberta,
      menuAberto,
      setActiveTab,
      setSelectedProjectId,
      setSecaoObra,
      setPropostaAberta,
      setMenuAberto,
      navigateTab,
    }),
    [
      activeTab,
      selectedProjectId,
      secaoObra,
      propostaAberta,
      menuAberto,
      setActiveTab,
      setSelectedProjectId,
      setSecaoObra,
      setPropostaAberta,
      navigateTab,
    ]
  );

  return (
    <DadosAtivosCtx.Provider value={dadosAtivos}>
      <ObraEscopoCtx.Provider value={selectedProjectId}>
        <NavegacaoCtx.Provider value={valor}>{children}</NavegacaoCtx.Provider>
      </ObraEscopoCtx.Provider>
    </DadosAtivosCtx.Provider>
  );
}
