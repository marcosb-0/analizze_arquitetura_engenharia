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
import { IconButton } from '../ui';
import { InsumoCatalogo } from '../../types';
import { melhorPreco, formatBRL } from '../../lib/preco';
import EstadoDaLista from '../EstadoDaLista';
import { corCategoria, iconeCategoria } from './categorias';

interface ListaInsumosProps {
  catalogo: InsumoCatalogo[];
  loading: boolean;
  paginas: number;
  paginaAtual: number;
  /** Vazio desabilita "Vincular": não há obra para receber o insumo. */
  temProjetos: boolean;
  /** Algum critério de busca/categoria/tipo/situação está aplicado — o filtro é do servidor. */
  filtrado: boolean;
  onLimparFiltros: () => void;
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
  filtrado,
  onLimparFiltros,
  verificandoUsos,
  onAbrirDetalhe,
  onEditar,
  onVincular,
  onSetAtivo,
  onExcluir,
  onNovoInsumo,
  onPagina,
}: ListaInsumosProps) {
  if (loading || catalogo.length === 0) {
    return (
      <EstadoDaLista
        loading={loading}
        total={catalogo.length}
        // O catálogo busca e pagina no servidor: o total sem filtro não chega
        // ao cliente, e a pergunta que dá para responder é se há critério ativo.
        totalSemFiltro={null}
        filtrado={filtrado}
        carregandoLabel="Carregando o banco de custos..."
        className="bg-white rounded-xl border border-slate-100 p-8 shadow-xs"
        vazio={{
          icon: Database,
          title: 'Nenhum insumo no banco de custos',
          description:
            'O catálogo guarda o preço histórico de materiais, mão de obra e equipamentos. Cadastre o primeiro insumo ou importe uma publicação do SINAPI.',
          actionLabel: 'Cadastrar novo insumo',
          onAction: onNovoInsumo,
        }}
        semResultado={{
          title: 'Nenhum insumo encontrado',
          description: 'Nenhum item corresponde à busca ou aos filtros de categoria, tipo e situação.',
        }}
        onLimparFiltros={onLimparFiltros}
      >
        {null}
      </EstadoDaLista>
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
          <IconButton
            rotulo="Página anterior"
            onClick={() => onPagina(paginaAtual - 1)}
            disabled={paginaAtual === 0}
            className="border border-slate-200"
          >
            <ChevronLeft size={14} />
          </IconButton>
          <span className="text-xs font-bold text-slate-500">
            Página {paginaAtual + 1} de {paginas}
          </span>
          <IconButton
            rotulo="Próxima página"
            onClick={() => onPagina(paginaAtual + 1)}
            disabled={paginaAtual >= paginas - 1}
            className="border border-slate-200"
          >
            <ChevronRight size={14} />
          </IconButton>
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

      {/* `min-w-0` na coluna de preço e `shrink-0` na de ações: sem os dois, o
          bloco de preço não encolhe abaixo do próprio conteúdo e empurra os
          quatro controles para fora do cartão — a barra de rolagem horizontal
          que a subida da escala tipográfica revelou (§6.1). O cartão já estava
          no limite; 1px a mais de fonte bastava. */}
      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
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

        <div className="flex items-center gap-1.5 shrink-0">
          <IconButton rotulo="Editar insumo" tom="acao" onClick={() => onEditar(item)}>
            <Pencil size={14} />
          </IconButton>
          <button
            onClick={() => onVincular(item)}
            disabled={!temProjetos}
            className="bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-extrabold text-2xs px-2 py-1 rounded-md transition flex items-center gap-1"
            title={!temProjetos ? 'Nenhuma obra cadastrada' : 'Vincular ao orçamento de uma obra'}
          >
            <Briefcase size={11} />
            <span>Vincular</span>
          </button>
          <IconButton
            rotulo={item.ativo ? 'Desativar insumo' : 'Reativar insumo'}
            onClick={() => onSetAtivo(item.id, !item.ativo)}
          >
            {item.ativo ? <ToggleRight size={18} className="text-blue-600" /> : <ToggleLeft size={18} />}
          </IconButton>
          <IconButton
            rotulo="Excluir insumo do catálogo"
            tom="perigo"
            carregando={verificandoUsos === item.id}
            onClick={() => onExcluir(item)}
            disabled={verificandoUsos === item.id}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
    </motion.div>
  );
}
