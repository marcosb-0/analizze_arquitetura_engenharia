import { useEffect, useState } from 'react';
import { Database, Plus, Search } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo } from '../../services/catalogoService';
import { Button, Input, Select } from '../ui';

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
        <Search className="absolute left-3 top-2.5 text-slate-500" size={13} />
        <Input
          type="text"
          placeholder="Buscar por descrição, código, aplicação..."
          value={buscaLocal}
          onChange={(e) => setBuscaLocal(e.target.value)} className="pl-9 pr-3 font-medium"
        />
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
        <Select
          value={filtro.tipo ?? ''}
          onChange={(e) => aplicarFiltro({ tipo: (e.target.value || undefined) as InsumoCatalogo['tipo'] | undefined })} className="font-semibold cursor-pointer"
        >
          <option value="">Todas as origens</option>
          <option value="SINAPI">Tabela SINAPI</option>
          <option value="Proprio">Itens próprios</option>
        </Select>

        <Select
          value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativos' : 'inativos'}
          onChange={(e) =>
            aplicarFiltro({ ativo: e.target.value === 'todos' ? undefined : e.target.value === 'ativos' })
          } className="font-semibold cursor-pointer"
        >
          <option value="ativos">Apenas ativos</option>
          <option value="inativos">Apenas inativos</option>
          <option value="todos">Mostrar todos</option>
        </Select>

        <Button
          onClick={onAbrirSinapi} variante="secundario"
        >
          <Database size={14} className="text-blue-600" />
          <span>Buscar no SINAPI</span>
        </Button>

        <Button
          onClick={onNovoInsumo}
        >
          <Plus size={14} />
          <span>Novo Insumo</span>
        </Button>
      </div>
    </div>
  );
}
