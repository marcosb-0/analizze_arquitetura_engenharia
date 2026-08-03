import { useEffect, useState } from 'react';
import { Database, Plus, Search } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo } from '../../services/catalogoService';

interface BarraCatalogoProps {
  filtro: FiltroCatalogo;
  aplicarFiltro: (patch: Partial<FiltroCatalogo>) => void;
  onAbrirSinapi: () => void;
  onNovoInsumo: () => void;
}

export default function BarraCatalogo({
  filtro,
  aplicarFiltro,
  onAbrirSinapi,
  onNovoInsumo,
}: BarraCatalogoProps) {
  // A busca é digitada localmente e só vira consulta depois de uma pausa — o
  // filtro roda no servidor agora, não faz sentido bater a cada tecla.
  const [buscaLocal, setBuscaLocal] = useState(filtro.busca ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtro.busca ?? '') !== buscaLocal) aplicarFiltro({ busca: buscaLocal });
    }, 350);
    return () => clearTimeout(t);
  }, [buscaLocal]);

  return (
    <div id="catalogo-action-bar" className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
        <input
          type="text"
          placeholder="Buscar por descrição, código, aplicação..."
          value={buscaLocal}
          onChange={(e) => setBuscaLocal(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 border border-slate-200/70 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 font-medium"
        />
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
        <select
          value={filtro.tipo ?? ''}
          onChange={(e) => aplicarFiltro({ tipo: (e.target.value || undefined) as InsumoCatalogo['tipo'] | undefined })}
          className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-600 font-semibold cursor-pointer"
        >
          <option value="">Todas as origens</option>
          <option value="SINAPI">Tabela SINAPI</option>
          <option value="Proprio">Itens próprios</option>
        </select>

        <select
          value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativos' : 'inativos'}
          onChange={(e) =>
            aplicarFiltro({ ativo: e.target.value === 'todos' ? undefined : e.target.value === 'ativos' })
          }
          className="border border-slate-200/70 rounded-lg py-1.5 px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-600 font-semibold cursor-pointer"
        >
          <option value="ativos">Apenas ativos</option>
          <option value="inativos">Apenas inativos</option>
          <option value="todos">Mostrar todos</option>
        </select>

        <button
          onClick={onAbrirSinapi}
          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs active:scale-95"
        >
          <Database size={14} className="text-blue-600" />
          <span>Buscar no SINAPI</span>
        </button>

        <button
          onClick={onNovoInsumo}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm active:scale-95"
        >
          <Plus size={14} />
          <span>Novo Insumo</span>
        </button>
      </div>
    </div>
  );
}
