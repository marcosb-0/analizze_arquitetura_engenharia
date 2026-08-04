import { Database, Layers } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo } from '../../services/catalogoService';
import { CATEGORIAS, iconeCategoria } from './categorias';

interface SidebarCatalogoProps {
  /** Quantos itens o filtro atual devolve — vem do servidor, não do array local. */
  total: number;
  categoriaAtiva: FiltroCatalogo['categoria'];
  onCategoria: (categoria: InsumoCatalogo['categoria'] | undefined) => void;
}

export default function SidebarCatalogo({ total, categoriaAtiva, onCategoria }: SidebarCatalogoProps) {
  return (
    <div id="catalogo-sidebar" className="w-full xl:w-64 shrink-0 flex flex-col gap-4 self-start">
      <div id="db-stats-card" className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs text-left space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs">
          <Database size={16} className="text-blue-600" />
          <span>Banco de Custos</span>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
          <span className="text-2xs text-slate-500 font-bold block">Insumos no filtro atual</span>
          <p className="text-lg font-extrabold text-slate-800 font-mono">{total}</p>
        </div>
        <p className="text-2xs text-slate-500 font-semibold leading-relaxed">
          Cada alteração de preço vira um ponto no histórico automaticamente. Cotações nunca são apagadas —
          saem de circulação e continuam disponíveis como registro de negociação.
        </p>
      </div>

      <div id="catalogo-categories-card" className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs text-left">
        <span className="text-2xs font-bold text-slate-500 uppercase tracking-widest block px-2 mb-2">Categoria</span>
        <div className="space-y-0.5">
          <button
            onClick={() => onCategoria(undefined)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition ${
              !categoriaAtiva ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Layers size={14} />
            <span>Todas</span>
          </button>
          {CATEGORIAS.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoria(cat)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition ${
                categoriaAtiva === cat ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600 rounded-l-none' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {iconeCategoria(cat)}
              <span>{cat}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
