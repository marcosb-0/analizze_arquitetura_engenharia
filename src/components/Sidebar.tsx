import { useState } from 'react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { IconButton, MENU_GRUPO_ESPACO, MENU_ITEM, MENU_LARGURA, MENU_ROLAGEM } from './ui';
import type { Database as DB, Role } from '../lib/database.types';
import { canAccessConsoleTab, canAccessTab } from '../constants/tabAccess';
import { TAB_LABELS } from '../constants/abas';
import { MENU, MENU_OBRA, SECAO_LABELS, VOLTAR_PARA_OBRAS } from '../constants/menu';

const CHAVE_RECOLHIDO = 'analizze:menu-recolhido';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gestao: 'Gestão / Engenharia',
  financeiro: 'Financeiro',
  campo: 'Campo',
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** Nome da obra aberta — `null` quando não há obra, ou quando ela não foi
   *  encontrada (id de obra apagada no endereço). É a mesma condição que o
   *  `ProjetosConectado` usa para decidir entre console e lista. */
  activeProjectName: string | null;
  clearSelectedProject: () => void;
  /** Seção do console da obra aberta. `null` quando não há obra. */
  secaoObra: string | null;
  setSecaoObra: (secao: string) => void;
  /**
   * Selo por aba, indexado pelo mesmo id do menu. Ausente = sem selo; ver a
   * política em `SidebarConectada` (só desenha o que espera por alguém).
   */
  counts: Readonly<Record<string, number | undefined>>;
  profile: DB['public']['Tables']['profiles']['Row'] | null;
  onSignOut: () => void;
  /** Abaixo de `lg` a sidebar vira gaveta sobreposta; acima, é coluna fixa. */
  menuAberto: boolean;
  onFecharMenu: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeProjectName,
  clearSelectedProject,
  secaoObra,
  setSecaoObra,
  counts,
  profile,
  onSignOut,
  menuAberto,
  onFecharMenu
}: SidebarProps) {
  /**
   * Recolher o menu é preferência de layout, e por isso sobrevive ao recarregar.
   *
   * Sem persistir, quem trabalha com o menu recolhido — porque o Gantt e a
   * planilha orçamentária querem a tela toda — recolhia de novo a cada F5. É
   * `localStorage` e não estado de servidor de propósito: a preferência é da
   * MÁQUINA (monitor de 24" no escritório, notebook em obra), não da pessoa.
   */
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(CHAVE_RECOLHIDO) === '1');
  const alternarRecolhido = () =>
    setCollapsed((c) => {
      localStorage.setItem(CHAVE_RECOLHIDO, c ? '0' : '1');
      return !c;
    });
  // Recolhido só vale na coluna fixa; a gaveta é sempre larga.
  const recolhido = collapsed && !menuAberto;

  /**
   * A obra aberta assume o topo do menu.
   *
   * O console da obra é o maior subsistema do app e o nível onde se passa o dia,
   * e até aqui ele não tinha navegação nenhuma no menu: as seis seções viviam
   * num alternador dentro da página e a sidebar oferecia um cartão decorativo no
   * rodapé. Com o bloco, o contexto de trabalho fica onde o olho começa.
   *
   * A condição é o NOME ter chegado, e não haver id na rota. É a mesma que o
   * `ProjetosConectado` usa para escolher entre console e lista
   * (`obraAberta ? console : lista`), e as duas precisam ser a mesma: com o id
   * de uma obra apagada — ou de uma que o papel perdeu acesso — o conteúdo cai
   * na lista, e o menu ficaria afirmando um contexto de obra que não existe,
   * oferecendo seis seções que não levam a lugar nenhum. Visto na tela.
   */
  const obraAberta = activeProjectName !== null;

  const secoesDaObra = obraAberta
    ? MENU_OBRA.filter((s) => canAccessConsoleTab(profile?.role, s.aba))
    : [];

  /**
   * O menu que ESTE papel enxerga.
   *
   * A ordem e o agrupamento vêm de `constants/menu.ts`; aqui cai o que a matriz
   * de acesso não alcança — clicar num módulo sem RLS renderiza tela vazia ou
   * erro de permissão, não uma negativa útil. O grupo que fica sem nenhum item
   * some junto com o cabeçalho dele, senão o papel `campo` veria quatro títulos
   * maiúsculos anunciando nada.
   *
   * E o grupo `Obras` sai enquanto o bloco da obra existe: "← Todas as obras"
   * dentro do bloco já é esse destino, e dois caminhos para o mesmo lugar num
   * menu de doze linhas é ruído, não redundância útil.
   */
  const grupos = MENU
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter(
        (i) => canAccessTab(profile?.role, i.aba) && !(obraAberta && i.aba === 'projetos')
      ),
    }))
    .filter((grupo) => grupo.itens.length > 0);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== 'projetos') {
      clearSelectedProject();
    }
    // Na gaveta, escolher um destino tem de fechá-la — senão o menu fica por
    // cima do conteúdo que o usuário acabou de pedir.
    onFecharMenu();
  };

  return (
    <>
      {/* Véu da gaveta — só existe abaixo de `lg`, onde a sidebar sobrepõe. */}
      {menuAberto && (
        <div
          onClick={onFecharMenu}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
        />
      )}

    <aside
      id="sidebar-container"
      className={`${recolhido ? MENU_LARGURA.recolhido : MENU_LARGURA.aberto} ${MENU_LARGURA.base} bg-white text-slate-700 flex flex-col h-screen border-r border-slate-100 shrink-0 select-none transition-all duration-200
        fixed inset-y-0 left-0 z-40 lg:relative lg:translate-x-0
        ${menuAberto ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
    >

      {/* Collapse Toggle — sem sentido na gaveta, que já ocupa a largura toda. */}
      <IconButton
        rotulo={recolhido ? 'Expandir menu' : 'Recolher menu'}
        tom="acao"
        // `tamanho="sm"` são os 24 px que o `w-6 h-6` daqui pedia e nunca
        // conseguiu — o `-right-3` é metade de 24, e é o que faz a alça montar
        // exatamente em cima da borda do menu.
        tamanho="sm"
        forma="circulo"
        id="sidebar-collapse-toggle"
        onClick={alternarRecolhido}
        className="hidden lg:flex absolute -right-3 top-6 bg-white border border-slate-200 shadow-sm z-10"
      >
        {recolhido ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </IconButton>

      {/* Brand Header — desenho do mockup "Analizze - App".
          O quadrado passou de azul para `slate-900`: com a paleta nova, o azul
          é a cor de AÇÃO, e a marca no topo do menu não é um botão. Deixá-la
          azul punha, na mesma coluna, um azul que não se clica logo acima de
          seis que se clicam. A sombra colorida saiu junto (decoração). */}
      <div id="sidebar-header" className="p-4 border-b border-slate-100 shrink-0">
        <div className={`flex items-center gap-2.5 ${recolhido ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-slate-900 rounded-[10px] flex items-center justify-center shrink-0">
            <span className="font-bold text-white text-xs">A</span>
          </div>
          {!recolhido && (
            <div className="text-left min-w-0">
              <div className="flex items-baseline gap-0.5">
                <h1 className="font-bold text-slate-900 text-sm tracking-tight leading-none font-sans">analizze</h1>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block"></span>
              </div>
              {/* Sem caixa alta nem `tracking-widest`: no mockup a segunda
                  linha da marca é uma legenda calma, e o rótulo maiúsculo
                  espaçado é o que nomeia GRUPO de menu logo abaixo. Usar a
                  mesma forma nos dois fazia a legenda competir com os grupos. */}
              <p className="text-2xs text-slate-500 font-semibold mt-1 truncate">Gestão de obras</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav
        id="sidebar-nav"
        className={`flex-1 py-5 text-xs ${MENU_GRUPO_ESPACO.entreGrupos} ${MENU_ROLAGEM}`}
      >
        {obraAberta && (
          <div id="sidebar-obra" className={MENU_GRUPO_ESPACO.entreItens}>
            {/* O cabeçalho do bloco é o NOME DA OBRA, e é o único do menu que
                não é caixa alta: "COMERCIAL" e "CUSTOS" são rótulos de
                categoria, curtos e fixos; um nome próprio em maiúsculas perde a
                silhueta que o olho usa para reconhecê-lo, e nomes de obra são
                longos o bastante para truncar. Categoria = rótulo de 12 px;
                conteúdo = título de 14 px. */}
            {!recolhido && (
              <h2
                className="px-3 mb-2 text-xs font-bold text-slate-900 truncate text-left"
                title={activeProjectName}
              >
                {activeProjectName}
              </h2>
            )}

            <button
              id="sidebar-clear-project-btn"
              onClick={() => {
                clearSelectedProject();
                onFecharMenu();
              }}
              title={recolhido ? VOLTAR_PARA_OBRAS.rotulo : undefined}
              className={`${MENU_ITEM.base} ${MENU_ITEM.padding} ${
                recolhido ? 'justify-center' : 'justify-start gap-3'
              } ${MENU_ITEM.inativo}`}
            >
              <VOLTAR_PARA_OBRAS.icone size={16} className="text-slate-500 shrink-0" />
              {!recolhido && <span>{VOLTAR_PARA_OBRAS.rotulo}</span>}
            </button>

            {secoesDaObra.map((secao) => {
              const Icon = secao.icone;
              const isActive = activeTab === 'projetos' && secaoObra === secao.aba;
              const rotulo = SECAO_LABELS[secao.aba] ?? secao.aba;
              const selo = counts[`obra:${secao.aba}`];

              return (
                <button
                  key={secao.aba}
                  id={`sidebar-obra-${secao.aba}`}
                  onClick={() => {
                    setSecaoObra(secao.aba);
                    onFecharMenu();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={recolhido ? `${activeProjectName} · ${rotulo}` : undefined}
                  className={`${MENU_ITEM.base} ${MENU_ITEM.padding} ${recolhido ? 'justify-center' : 'justify-between'} ${
                    isActive ? MENU_ITEM.ativo : MENU_ITEM.inativo
                  }`}
                >
                  <div className={`flex items-center ${recolhido ? '' : 'gap-3'}`}>
                    <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-500'} />
                    {!recolhido && <span>{rotulo}</span>}
                  </div>
                  {!recolhido && selo !== undefined && selo > 0 && (
                    <span
                      className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-blue-100/60 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {selo}
                    </span>
                  )}
                </button>
              );
            })}

            {/* A única linha do menu, e ela separa DOIS ESCOPOS — o que é desta
                obra e o que é da construtora. Entre grupos do mesmo escopo, o
                espaço basta (é a tese do `SECAO_ESPACO` na escala do menu). */}
            <div className="mx-3 pt-3 border-b border-slate-100" />
          </div>
        )}

        {grupos.map((grupo, gIdx) => (
          <div
            key={grupo.titulo ?? `grupo-${gIdx}`}
            className={`${MENU_GRUPO_ESPACO.entreItens} ${
              // Grupo sem cabeçalho, e que não é o primeiro, recebe o espaço que
              // o cabeçalho ocuparia — senão ele encosta no grupo de cima. O
              // primeiro não precisa: acima dele está o topo do menu.
              !grupo.titulo && gIdx > 0 && !recolhido ? MENU_GRUPO_ESPACO.semCabecalho : ''
            }`}
          >
            {!recolhido && grupo.titulo && (
              <div
                className={`text-2xs font-bold text-slate-500 uppercase tracking-widest px-3 ${MENU_GRUPO_ESPACO.sobCabecalho} text-left`}
              >
                {grupo.titulo}
              </div>
            )}
            {/* Recolhido não há cabeçalho para separar os grupos: a linha
                assume. Vale para TODO grupo a partir do segundo, inclusive os
                sem título — antes ela dependia do cabeçalho existir, e o grupo
                de "Obras" (que não tem) ficava colado no vizinho. */}
            {recolhido && gIdx > 0 && <div className="mx-3 mb-1 border-t border-slate-100" />}
            {grupo.itens.map((item) => {
              const Icon = item.icone;
              const isActive = activeTab === item.aba;
              const rotulo = TAB_LABELS[item.aba] ?? item.aba;
              const selo = counts[item.aba];

              return (
                <button
                  key={item.aba}
                  id={`sidebar-tab-${item.aba}`}
                  onClick={() => handleTabClick(item.aba)}
                  aria-current={isActive ? 'page' : undefined}
                  // Recolhido o rótulo some, e o grupo com ele: o título devolve
                  // os dois ("Custos · Catálogo"), que é a única pista de
                  // agrupamento que sobra a essa largura.
                  title={recolhido ? [grupo.titulo, rotulo].filter(Boolean).join(' · ') : undefined}
                  className={`${MENU_ITEM.base} relative ${MENU_ITEM.padding} ${recolhido ? 'justify-center' : 'justify-between'} ${
                    isActive ? MENU_ITEM.ativo : MENU_ITEM.inativo
                  }`}
                >
                  <div className={`flex items-center ${recolhido ? '' : 'gap-3'}`}>
                    <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-500'} />
                    {!recolhido && <span>{rotulo}</span>}
                  </div>

                  {!recolhido && selo !== undefined && selo > 0 && (
                    <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-blue-100/60 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selo}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* O cartão "Atalho de Obra" que morava aqui saiu: ele repetia no rodapé o
          nome que o bloco do topo agora carrega, com um ícone de tendência que
          não tinha relação com o conteúdo e uma `border-blue-50` que, sobre
          fundo claro, não desenhava borda nenhuma. */}

      {/* Footer Profile User Info */}
      <div id="sidebar-footer" className="p-4 border-t border-slate-50 bg-slate-50/40 shrink-0">
        <div className={`flex items-center gap-3 text-left ${recolhido ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {(profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          {!recolhido && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{profile?.full_name || profile?.email || 'Usuário'}</p>
              <p className="text-2xs text-slate-500 font-semibold">{profile ? ROLE_LABELS[profile.role] : ''}</p>
            </div>
          )}
          {/* `tom="acao"`, e não `perigo`: sair não apaga nada. A Regra do Papel
              do DESIGN.md diz que a cor de um controle vem do papel dele, e o
              rose é do destrutivo — gastá-lo aqui rebaixa o único sinal que o
              app tem para "isto não tem volta". `perigo` ainda ganha
              `ALVO_PERIGO_SEPARADO`, um respiro extra do vizinho, que num botão
              de logout só afastava o alvo sem motivo. */}
          <IconButton rotulo="Sair" tom="acao" onClick={onSignOut}>
            <LogOut size={14} />
          </IconButton>
        </div>
      </div>
    </aside>
    </>
  );
}
