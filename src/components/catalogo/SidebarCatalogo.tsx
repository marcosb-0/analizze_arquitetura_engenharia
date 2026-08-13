import { Database, Layers } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo } from '../../services/catalogoService';
import { CATEGORIAS, iconeCategoria } from './categorias';
import { COLUNA_ANCORADA, Secao } from '../ui';

interface SidebarCatalogoProps {
  /** Quantos itens o filtro atual devolve — vem do servidor, não do array local. */
  total: number;
  categoriaAtiva: FiltroCatalogo['categoria'];
  onCategoria: (categoria: InsumoCatalogo['categoria'] | undefined) => void;
}

/**
 * Os dois blocos daqui eram cards brancos (`rounded-lg border-slate-100
 * shadow-xs`, o terceiro dialeto do app) ao lado do card da tabela: quatro
 * molduras entre a borda da tela e o primeiro insumo. Viraram seções abertas,
 * e a coluna passou a ficar ancorada com a rolagem da página.
 */
export default function SidebarCatalogo({ total, categoriaAtiva, onCategoria }: SidebarCatalogoProps) {
  return (
    <div id="catalogo-sidebar" className={`w-full xl:w-64 shrink-0 flex flex-col gap-6 ${COLUNA_ANCORADA}`}>
      <Secao id="db-stats-card" icone={<Database size={15} />} titulo="Banco de Custos" className="text-left">
        {/* Região viva: a busca do catálogo é servidor-side e troca a
            listagem inteira. Ver a nota em `ControlesDeLista`. */}
        <div aria-live="polite" aria-atomic="true">
          <span className="text-2xs text-slate-500 font-bold block uppercase tracking-wider">Insumos no filtro atual</span>
          <p className="text-xl font-bold text-slate-900 data-font">{total}</p>
        </div>
        <p className="text-2xs text-slate-500 font-semibold leading-relaxed mt-3">
          Cada alteração de preço vira um ponto no histórico automaticamente. Cotações nunca são apagadas —
          saem de circulação e continuam disponíveis como registro de negociação.
        </p>
      </Secao>

      <Secao id="catalogo-categories-card" titulo="Categoria" className="text-left">
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
      </Secao>
    </div>
  );
}
