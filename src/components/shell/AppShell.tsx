import TabViewport from '../abas/TabViewport';
import Cabecalho from './Cabecalho';
import SidebarConectada from './SidebarConectada';

/**
 * O quadro da aplicação: navegação à esquerda, breadcrumb em cima, aba no meio.
 *
 * Não recebe nem passa nada. As três peças assinam os contextos de que
 * precisam, e é por isso que uma cotação de fornecedor não repinta mais a
 * sidebar — que era o que acontecia quando isto era o `return` do `App`, junto
 * com os 19 hooks de dados (§1.2).
 */
export default function AppShell() {
  return (
    <div
      id="app-root-container"
      className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white"
    >
      {/* A sidebar tem ~14 destinos. Sem isto, quem navega por teclado percorre
          os 14 a cada troca de tela antes de chegar ao conteúdo. O link fica
          invisível até receber foco — primeiro elemento focável do documento.

          `tabIndex={-1}` no <main> é o que falta na maioria das implementações:
          sem ele o alvo do salto não é focável, o foco fica onde estava, e o
          link vira decoração que só funciona para quem enxerga. */}
      <a
        href="#main-content-area"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>

      <SidebarConectada />

      <main
        id="main-content-area"
        tabIndex={-1}
        className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden focus:outline-none"
      >
        <Cabecalho />
        <TabViewport />
      </main>
    </div>
  );
}
