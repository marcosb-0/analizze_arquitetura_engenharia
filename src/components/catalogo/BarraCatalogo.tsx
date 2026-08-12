import { useEffect, useState } from 'react';
import { Database, LayoutGrid, Plus, Rows3, Search } from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { FiltroCatalogo, OrdemCatalogo } from '../../services/catalogoService';
import { ALVO, Button, CONTROLE_GRUPO, CONTROLE_GRUPO_ITEM, Input, Select } from '../ui';
import { VisaoCatalogo } from './ListaInsumos';

/** Valor do seletor de ordenação: coluna + sentido num campo só. */
const ORDENS: { valor: string; rotulo: string; coluna: OrdemCatalogo; asc: boolean }[] = [
  { valor: 'descricao-asc', rotulo: 'Descrição (A-Z)', coluna: 'descricao', asc: true },
  { valor: 'descricao-desc', rotulo: 'Descrição (Z-A)', coluna: 'descricao', asc: false },
  { valor: 'preco_referencia-desc', rotulo: 'Maior preço', coluna: 'preco_referencia', asc: false },
  { valor: 'preco_referencia-asc', rotulo: 'Menor preço', coluna: 'preco_referencia', asc: true },
  { valor: 'categoria-asc', rotulo: 'Categoria', coluna: 'categoria', asc: true },
  { valor: 'unidade-asc', rotulo: 'Unidade', coluna: 'unidade', asc: true },
];

interface BarraCatalogoProps {
  filtro: FiltroCatalogo;
  aplicarFiltro: (patch: Partial<FiltroCatalogo>) => void;
  visao: VisaoCatalogo;
  onVisao: (v: VisaoCatalogo) => void;
  onAbrirSinapi: () => void;
  onNovoInsumo: () => void;
}

export default function BarraCatalogo({
  filtro,
  aplicarFiltro,
  visao,
  onVisao,
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
          onChange={(e) => aplicarFiltro({ tipo: (e.target.value || undefined) as InsumoCatalogo['tipo'] | undefined })} largura="automatica" className="font-semibold cursor-pointer"
        >
          <option value="">Todas as origens</option>
          <option value="SINAPI">Tabela SINAPI</option>
          <option value="Proprio">Itens próprios</option>
        </Select>

        {/* Sem este filtro não havia como listar só composições — que é a
            pergunta natural de quem vai orçar por serviço. */}
        <Select
          value={filtro.tipoItem ?? ''}
          onChange={(e) =>
            aplicarFiltro({ tipoItem: (e.target.value || undefined) as InsumoCatalogo['tipoItem'] | undefined })
          } largura="automatica" className="font-semibold cursor-pointer"
        >
          <option value="">Insumos e composições</option>
          <option value="Composicao">Só composições</option>
          <option value="Insumo">Só insumos</option>
        </Select>

        <Select
          value={filtro.ativo === undefined ? 'todos' : filtro.ativo ? 'ativos' : 'inativos'}
          onChange={(e) =>
            aplicarFiltro({ ativo: e.target.value === 'todos' ? undefined : e.target.value === 'ativos' })
          } largura="automatica" className="font-semibold cursor-pointer"
        >
          <option value="ativos">Apenas ativos</option>
          <option value="inativos">Apenas inativos</option>
          <option value="todos">Mostrar todos</option>
        </Select>

        {/* A ordenação vai ao servidor: a paginação é server-side, e ordenar só
            a página exibida daria uma lista que muda de ordem a cada página. */}
        <Select
          value={`${filtro.ordenarPor ?? 'descricao'}-${filtro.asc === false ? 'desc' : 'asc'}`}
          onChange={(e) => {
            const escolha = ORDENS.find((o) => o.valor === e.target.value);
            if (escolha) aplicarFiltro({ ordenarPor: escolha.coluna, asc: escolha.asc });
          }} largura="automatica" className="font-semibold cursor-pointer"
        >
          {ORDENS.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </Select>

        <div className={CONTROLE_GRUPO} role="group" aria-label="Visão da lista">
          <button
            type="button"
            aria-pressed={visao === 'tabela'}
            onClick={() => onVisao('tabela')}
            aria-label="Ver em tabela"
            title="Ver em tabela"
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${visao === 'tabela' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
          >
            <Rows3 size={14} />
          </button>
          <button
            type="button"
            aria-pressed={visao === 'cards'}
            onClick={() => onVisao('cards')}
            aria-label="Ver em cartões"
            title="Ver em cartões"
            className={`${CONTROLE_GRUPO_ITEM.base} ${ALVO.md} ${visao === 'cards' ? CONTROLE_GRUPO_ITEM.ativo : CONTROLE_GRUPO_ITEM.inativo}`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>

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
