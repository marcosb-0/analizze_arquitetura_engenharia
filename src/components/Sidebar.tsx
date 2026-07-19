import React from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Truck,
  UserSquare2,
  FolderLock,
  TrendingUp,
  ChevronRight,
  Database,
  Sliders,
  Building2,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import type { Database as DB, Role } from '../lib/database.types';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gestao: 'Gestão / Engenharia',
  financeiro: 'Financeiro',
  campo: 'Campo',
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedProjectId: string | null;
  clearSelectedProject: () => void;
  counts: {
    clientes: number;
    propostas: number;
    fornecedores: number;
    projetos: number;
    equipe: number;
    documentos: number;
  };
  modoInterface: 'Simplificado' | 'Avançado';
  onToggleModoInterface: () => void;
  profile: DB['public']['Tables']['profiles']['Row'] | null;
  onSignOut: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  selectedProjectId,
  clearSelectedProject,
  counts,
  modoInterface,
  onToggleModoInterface,
  profile,
  onSignOut
}: SidebarProps) {
  const menuItems = modoInterface === 'Simplificado'
    ? [
        { id: 'dashboard', label: 'Início', icon: LayoutDashboard, count: null },
        { id: 'projetos', label: 'Minhas Obras', icon: Briefcase, count: counts.projetos },
        { id: 'pessoas', label: 'Pessoas', icon: Users, count: counts.clientes + counts.fornecedores + counts.equipe },
        { id: 'documentos', label: 'Documentos', icon: FolderLock, count: counts.documentos },
        { id: 'empresa', label: 'Gestão Empresa', icon: Building2, count: null },
        { id: 'catalogo', label: 'Catálogo Insumos', icon: Database, count: null },
      ]
    : [
        { id: 'dashboard', label: 'Indicadores', icon: LayoutDashboard, count: null },
        { id: 'projetos', label: 'Projetos (Obras)', icon: Briefcase, count: counts.projetos },
        { id: 'propostas', label: 'Propostas', icon: FileText, count: counts.propostas },
        { id: 'clientes', label: 'Clientes', icon: Users, count: counts.clientes },
        { id: 'fornecedores', label: 'Fornecedores', icon: Truck, count: counts.fornecedores },
        { id: 'equipe', label: 'Gestão de Equipe', icon: UserSquare2, count: counts.equipe },
        { id: 'documentos', label: 'Gestão Documental', icon: FolderLock, count: counts.documentos },
        { id: 'empresa', label: 'Gestão da Empresa', icon: Building2, count: null },
        { id: 'catalogo', label: 'Catálogo de Insumos', icon: Database, count: null },
      ];

  if (profile?.role === 'admin') {
    menuItems.push({ id: 'acessos', label: 'Gestão de Acessos', icon: ShieldCheck, count: null });
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId !== 'projetos') {
      clearSelectedProject();
    }
  };

  return (
    <aside id="sidebar-container" className="w-60 bg-white text-slate-700 flex flex-col h-screen border-r border-slate-100 shrink-0 select-none">
      
      {/* Brand Header */}
      <div id="sidebar-header" className="p-5 border-b border-slate-50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/15">
            <span className="font-bold text-white text-sm tracking-tighter">v</span>
          </div>
          <div className="text-left">
            <div className="flex items-baseline gap-0.5">
              <h1 className="font-bold text-slate-900 text-base tracking-tight leading-none font-sans">analizze</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 block"></span>
            </div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão de Obras</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav id="sidebar-nav" className="flex-1 py-5 px-3 text-xs space-y-1 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2.5 text-left">
          Menu Principal
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              id={`sidebar-tab-${item.id}`}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 rounded-lg relative ${
                isActive 
                  ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                <span>{item.label}</span>
              </div>

              {item.count !== null && item.count > 0 && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                  isActive 
                    ? 'bg-blue-100/60 text-blue-700' 
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Project Quick Context */}
      {selectedProjectId && (
        <div id="sidebar-quick-context" className="p-3.5 mx-3 mb-3 bg-blue-50/30 rounded-xl border border-blue-50 text-left shrink-0">
          <div className="flex items-center gap-1.5 mb-1 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp size={12} />
            <span>Atalho de Obra</span>
          </div>
          <p className="text-xs font-bold text-slate-800 truncate">Obra em Execução</p>
          <button
            id="sidebar-clear-project-btn"
            onClick={clearSelectedProject}
            className="mt-1.5 text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1 transition font-bold"
          >
            ← Voltar para lista
          </button>
        </div>
      )}

      {/* Simplified vs Advanced toggle widget right above footer */}
      <div className="p-3 mx-3 mb-2.5 bg-slate-50 rounded-xl border border-slate-150 text-left shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders size={12} className="text-slate-400" />
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Visualização Simples</span>
          </div>
          <button
            onClick={onToggleModoInterface}
            className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer outline-none ${
              modoInterface === 'Simplificado' ? 'bg-blue-600' : 'bg-slate-350'
            }`}
            title="Clique para alternar o modo de visualização do painel"
          >
            <span className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all ${
              modoInterface === 'Simplificado' ? 'right-0.5' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Footer Profile User Info */}
      <div id="sidebar-footer" className="p-4 border-t border-slate-50 bg-slate-50/40 shrink-0">
        <div className="flex items-center gap-3 text-left">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {(profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate">{profile?.full_name || profile?.email || 'Usuário'}</p>
            <p className="text-[10px] text-slate-400 font-semibold">{profile ? ROLE_LABELS[profile.role] : ''}</p>
          </div>
          <button
            onClick={onSignOut}
            title="Sair"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition shrink-0"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
