import { motion } from 'motion/react';
import {
  AlertTriangle,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Database,
  Pencil,
  Sigma,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { InsumoCatalogo } from '../../types';
import { melhorPreco, formatBRL } from '../../lib/preco';
import EmptyState from '../EmptyState';
import Spinner from '../Spinner';
import { corCategoria, iconeCategoria } from './categorias';

interface ListaInsumosProps {
  catalogo: InsumoCatalogo[];
  loading: boolean;
  paginas: number;
  paginaAtual: number;
  /** Vazio desabilita "Vincular": não há obra para receber o insumo. */
  temProjetos: boolean;
  /** Id do insumo cujos usos estão sendo consultados antes de oferecer a exclusão. */
  verificandoUsos: string | null;
  onAbrirDetalhe: (id: string) => void;
  onEditar: (item: InsumoCatalogo) => void;
  onVincular: (item: InsumoCatalogo) => void;
  onSetAtivo: (id: string, ativo: boolean) => void;
  onExcluir: (item: InsumoCatalogo) => void;
  onNovoInsumo: () => void;
  onPagina: (pagina: number) => void;
}

export default function ListaInsumos({
  catalogo,
  loading,
  paginas,
  paginaAtual,
  temProjetos,
  verificandoUsos,
  onAbrirDetalhe,
  onEditar,
  onVincular,
  onSetAtivo,
  onExcluir,
  onNovoInsumo,
  onPagina,
}: ListaInsumosProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-12 shadow-xs flex justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (catalogo.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-8 shadow-xs text-center">
        <EmptyState
          icon={Database}
          title="Nenhum insumo encontrado"
          description="Não há itens correspondentes aos filtros selecionados."
          actionLabel="Cadastrar novo insumo"
          onAction={onNovoInsumo}
        />
      </div>
    );
  }

  return (
    <>
      <div id="catalogo-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {catalogo.map((item, index) => (
          <CardInsumo
            key={item.id}
            item={item}
            index={index}
            temProjetos={temProjetos}
            verificandoUsos={verificandoUsos}
            onAbrirDetalhe={onAbrirDetalhe}
            onEditar={onEditar}
            onVincular={onVincular}
            onSetAtivo={onSetAtivo}
            onExcluir={onExcluir}
          />
        ))}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onPagina(paginaAtual - 1)}
            disabled={paginaAtual === 0}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-bold text-slate-500">
            Página {paginaAtual + 1} de {paginas}
          </span>
          <button
            onClick={() => onPagina(paginaAtual + 1)}
            disabled={paginaAtual >= paginas - 1}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 transition"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}

type CardInsumoProps = Pick<
  ListaInsumosProps,
  'temProjetos' | 'verificandoUsos' | 'onAbrirDetalhe' | 'onEditar' | 'onVincular' | 'onSetAtivo' | 'onExcluir'
> & { item: InsumoCatalogo; index: number };

function CardInsumo({
  item,
  index,
  temProjetos,
  verificandoUsos,
  onAbrirDetalhe,
  onEditar,
  onVincular,
  onSetAtivo,
  onExcluir,
}: CardInsumoProps) {
  const melhor = melhorPreco(item);
  const economia = item.precoReferencia - melhor.preco;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
      className={`bg-white p-4 rounded-xl border shadow-xs hover:shadow hover:border-blue-200 transition cursor-pointer flex flex-col justify-between relative ${
        !item.ativo ? 'opacity-60 bg-slate-50' : 'border-slate-200/70'
      }`}
      onClick={() => onAbrirDetalhe(item.id)}
    >
      <div>
        <div className="flex justify-between items-start gap-1">
          <span className={`text-2xs font-extrabold uppercase tracking-wider px-2 py-0.5 border rounded-full flex items-center gap-1 ${corCategoria(item.categoria)}`}>
            {iconeCategoria(item.categoria)}
            {item.categoria}
          </span>
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${item.tipo === 'SINAPI' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
            {item.tipo === 'SINAPI' ? `SINAPI ${item.codigoSINAPI ?? ''}` : 'PRÓPRIO'}
          </span>
        </div>

        <div className="mt-3">
          <h4 className="font-extrabold text-xs text-slate-900 leading-snug line-clamp-2" title={item.descricao}>
            {item.descricao}
          </h4>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-2xs text-slate-500 font-bold">
              Un: <span className="text-slate-600 font-mono font-bold uppercase">{item.unidade}</span>
            </span>
            {item.tipo === 'SINAPI' && item.uf && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                <span className="text-2xs text-slate-500 font-bold">
                  <span className="text-slate-600 font-mono">{item.uf}</span>
                  {item.mesReferencia ? ` ${item.mesReferencia}` : ''}
                  {item.desonerado ? ' des.' : ''}
                </span>
              </>
            )}
            {item.obrasUtilizando > 0 && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                <span className="text-2xs font-bold text-blue-600" title="Obras que já usaram este insumo">
                  {item.obrasUtilizando} obra{item.obrasUtilizando > 1 ? 's' : ''}
                </span>
              </>
            )}
            {item.tipoItem === 'Composicao' && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                {/* "vazia" é o rótulo certo para uma composição que
                    o usuário criou e não preencheu — mas mentiria
                    sobre uma adotada do SINAPI no modo "custo
                    SINAPI", onde a ausência de componentes é a
                    escolha e o preço é o oficial. */}
                <span
                  className={`text-2xs font-bold flex items-center gap-0.5 ${
                    item.qtdComponentes === 0 && item.precoFonte === 'SINAPI'
                      ? 'text-slate-500'
                      : 'text-indigo-600'
                  }`}
                  title={
                    item.qtdComponentes > 0
                      ? 'Preço calculado a partir dos componentes'
                      : item.precoFonte === 'SINAPI'
                        ? 'Adotada com o custo publicado pelo SINAPI, sem abrir os componentes'
                        : 'Composição ainda sem componentes — preço digitado'
                  }
                >
                  <Sigma size={9} />
                  {item.qtdComponentes > 0
                    ? `${item.qtdComponentes} comp.`
                    : item.precoFonte === 'SINAPI'
                      ? 'custo SINAPI'
                      : 'vazia'}
                </span>
              </>
            )}
            {item.temComponenteInativo && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                <span className="text-2xs font-bold text-amber-700 flex items-center gap-0.5" title="Há insumo desativado somando preço nesta composição">
                  <AlertTriangle size={9} /> revisar
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-end" onClick={(e) => e.stopPropagation()}>
        <div>
          {/* A procedência é parte do número: R$ 32 de cotação
              firme e R$ 32 de referência SINAPI decidem margens
              diferentes. Cor e rótulo saem do nível resolvido
              pelo banco (fn_preco_vigente). */}
          <span className={`text-2xs font-bold block uppercase tracking-wide ${
            melhor.nivel === 1 ? 'text-emerald-600'
            : melhor.nivel === 2 ? 'text-sky-600'
            : melhor.nivel === 3 ? 'text-slate-500'
            : 'text-amber-600'
          }`}>
            {melhor.nivel === 1 ? 'Cotação firme'
             : melhor.nivel === 2 ? 'Praticado'
             : melhor.nivel === 3 ? 'Estimado'
             : 'Referência SINAPI'}
            {melhor.nivel <= 2 && melhor.diasIdade != null && (
              <span className="text-slate-500 normal-case font-semibold"> · {melhor.diasIdade}d</span>
            )}
          </span>
          <span className="text-sm font-extrabold text-slate-900 font-mono">{formatBRL(melhor.preco)}</span>
          {melhor.nivel <= 2 && economia > 0 && (
            <span className="block text-2xs text-emerald-600 font-bold">
              {formatBRL(economia)} abaixo da referência
            </span>
          )}
          {melhor.ignoradasPorVencimento > 0 && (
            <span className="flex items-center gap-1 text-2xs text-amber-600 font-bold mt-0.5">
              <AlertTriangle size={9} /> {melhor.ignoradasPorVencimento} cotação vencida
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEditar(item)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
            title="Editar insumo"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onVincular(item)}
            disabled={!temProjetos}
            className="bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-extrabold text-2xs px-2 py-1 rounded-md transition flex items-center gap-1"
            title={!temProjetos ? 'Nenhuma obra cadastrada' : 'Vincular ao orçamento de uma obra'}
          >
            <Briefcase size={11} />
            <span>Vincular</span>
          </button>
          <button
            onClick={() => onSetAtivo(item.id, !item.ativo)}
            className="p-1.5 text-slate-500 hover:text-slate-600 hover:bg-slate-50 rounded transition"
            title={item.ativo ? 'Desativar insumo' : 'Reativar insumo'}
          >
            {item.ativo ? <ToggleRight size={18} className="text-blue-600" /> : <ToggleLeft size={18} />}
          </button>
          <button
            onClick={() => onExcluir(item)}
            disabled={verificandoUsos === item.id}
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 rounded transition"
            title="Excluir insumo do catálogo"
          >
            {verificandoUsos === item.id ? <Spinner size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
