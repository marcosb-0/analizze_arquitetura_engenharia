import { useCallback } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { IconButton } from '../ui';
import { TAB_LABELS } from '../../constants/abas';
import { SECAO_LABELS } from '../../constants/menu';
import { SECAO_INICIAL } from '../../lib/rotas';
import { useAuth } from '../../contexts/AuthContext';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta } from '../../contexts/useObraAberta';
import BuscaGlobal from './BuscaGlobal';

/**
 * Barra superior: gaveta (abaixo de `lg`), breadcrumb clicável, busca global e
 * a identidade de quem está logado.
 *
 * Assina navegação e a obra aberta. Enquanto vivia no `App`, era repintada a
 * cada lançamento financeiro, cada cotação e cada toast — e é por isso que a
 * busca entra como `<BuscaGlobal>`, que só assina domínio de dado quando a
 * palheta abre.
 *
 * ## A altura continua 56 px, e o mockup diz 60
 *
 * Os 4 px de diferença não são esquecimento: `COLUNA_ANCORADA` (tokens.ts) é
 * `calc(100vh-104px)`, e esse 104 é 56 da topbar + 24 de padding do scroller +
 * 24 de respiro — um número MEDIDO no navegador, não somado no papel (o
 * comentário do token conta o episódio). Subir a barra para 60 sem refazer a
 * medição deslocaria em silêncio a lista ancorada de quatro telas
 * mestre/detalhe. Quatro pixels de fidelidade não pagam esse risco.
 */
export default function Cabecalho() {
  const { activeTab, menuAberto, secaoObra, setMenuAberto, setSecaoObra, setSelectedProjectId, navigateTab } =
    useNavegacao();
  const obraAberta = useObraAberta();
  const { profile } = useAuth();

  /**
   * Iniciais para o avatar. `full_name` nasce igual ao e-mail do cadastro, e aí
   * "ma" (de marcosbarreto5531@…) é o melhor que dá para fazer — ainda assim
   * melhor do que um boneco genérico, porque identifica a SESSÃO.
   */
  const iniciais = (() => {
    const base = (profile?.full_name || profile?.email || '?').replace(/@.*$/, '');
    const partes = base.split(/[\s._-]+/).filter(Boolean);
    // Nome composto dá a inicial de cada parte; token único dá as duas
    // primeiras letras — que é o que o avatar do rodapé da sidebar já fazia, e
    // dois avatares da mesma pessoa com letras diferentes na mesma tela é o
    // tipo de incoerência que ninguém relata mas todo mundo estranha.
    return (partes.length > 1 ? partes.slice(0, 2).map((p) => p[0]).join('') : base.slice(0, 2)).toUpperCase();
  })();

  const abrirMenu = useCallback(() => setMenuAberto(true), [setMenuAberto]);
  const voltarParaLista = useCallback(() => setSelectedProjectId(null), [setSelectedProjectId]);
  const irParaInicio = useCallback(() => navigateTab('dashboard'), [navigateTab]);
  const irParaGeral = useCallback(() => setSecaoObra(SECAO_INICIAL), [setSecaoObra]);

  /**
   * "Geral" não vira nível.
   *
   * Ela é a seção padrão e é a que não aparece na URL — escrevê-la no caminho de
   * migalhas acrescentaria uma palavra que não distingue nada, e faria o nome da
   * obra deixar de ser a folha justamente no caso mais comum.
   */
  const secaoNoCaminho = obraAberta && secaoObra && secaoObra !== SECAO_INICIAL ? secaoObra : null;

  return (
    <header
      id="top-navbar"
      className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center gap-4 px-4 lg:px-6"
    >
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        {/* Abre a gaveta. Some a partir de `lg`, onde a sidebar já está visível. */}
        <IconButton
          rotulo="Abrir menu de navegação"
          onClick={abrirMenu}
          aria-expanded={menuAberto}
          className="lg:hidden -ml-1"
        >
          <Menu size={18} />
        </IconButton>

        {/* Breadcrumbs dinâmicos e clicáveis — cada nível anterior navega de volta */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          {/* Raiz: Indicadores (= página inicial). Clicável quando não estamos nela. */}
          {activeTab === 'dashboard' ? (
            <span className="font-semibold text-slate-700">{TAB_LABELS.dashboard}</span>
          ) : (
            <button
              onClick={irParaInicio}
              className="font-semibold text-slate-500 hover:text-blue-600 transition"
            >
              {TAB_LABELS.dashboard}
            </button>
          )}

          {/* Nível do módulo. Clicável (volta para a lista) quando há um projeto aberto. */}
          {activeTab !== 'dashboard' && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              {obraAberta ? (
                <button
                  onClick={voltarParaLista}
                  className="font-semibold text-slate-500 hover:text-blue-600 transition"
                >
                  {TAB_LABELS[activeTab] ?? activeTab}
                </button>
              ) : (
                <span className="font-semibold text-slate-700">{TAB_LABELS[activeTab] ?? activeTab}</span>
              )}
            </>
          )}

          {/* Nível do projeto. Vira clicável quando há uma seção depois dele —
              e leva a "Geral", que é onde a obra abre. */}
          {obraAberta && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              {secaoNoCaminho ? (
                <button
                  onClick={irParaGeral}
                  className="font-semibold text-slate-500 hover:text-blue-600 transition truncate max-w-[16ch] lg:max-w-none"
                >
                  {obraAberta.nome}
                </button>
              ) : (
                <span className="font-extrabold text-blue-600">{obraAberta.nome}</span>
              )}
            </>
          )}

          {/* Nível da seção da obra: página atual, não clicável. */}
          {secaoNoCaminho && (
            <>
              <ChevronRight size={13} className="text-slate-300" aria-hidden />
              <span className="font-extrabold text-blue-600">{SECAO_LABELS[secaoNoCaminho]}</span>
            </>
          )}
        </nav>
      </div>

      {/* A busca ocupa o meio e é o que empurra o avatar para a direita —
          `mx-auto` dentro de um irmão que cresce. */}
      <div className="flex-1 min-w-0">
        <BuscaGlobal />
      </div>

      <span
        title={`${profile?.full_name || profile?.email || 'Sessão'}${profile?.role ? ` · ${profile.role}` : ''}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-2xs font-bold text-white"
      >
        {iniciais}
      </span>
    </header>
  );
}
