import { useCallback } from 'react';
import { ChevronRight, Menu } from 'lucide-react';
import { IconButton } from '../ui';
import { TAB_LABELS } from '../../constants/abas';
import { SECAO_LABELS } from '../../constants/menu';
import { SECAO_INICIAL } from '../../lib/rotas';
import { useNavegacao } from '../../contexts/NavegacaoContext';
import { useObraAberta } from '../../contexts/useObraAberta';

/**
 * Barra superior: botão da gaveta (abaixo de `lg`) e breadcrumb clicável.
 *
 * Assina navegação e a obra aberta. Enquanto vivia no `App`, era repintada a
 * cada lançamento financeiro, cada cotação e cada toast.
 */
export default function Cabecalho() {
  const { activeTab, menuAberto, secaoObra, setMenuAberto, setSecaoObra, setSelectedProjectId, navigateTab } =
    useNavegacao();
  const obraAberta = useObraAberta();

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
      className="bg-white border-b border-slate-100 h-14 shrink-0 flex items-center justify-between px-4 lg:px-6"
    >
      <div className="flex items-center gap-3 min-w-0">
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
    </header>
  );
}
