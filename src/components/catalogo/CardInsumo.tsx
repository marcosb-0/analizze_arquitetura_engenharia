import { motion } from 'motion/react';
import {
  AlertTriangle,
  Briefcase,
  Pencil,
  Sigma,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { IconButton } from '../ui';
import { InsumoCatalogo } from '../../types';
import { melhorPreco, formatBRL } from '../../lib/preco';
import { corCategoria, iconeCategoria } from './categorias';
import { AcoesInsumo, corProcedencia, estadoComposicao, rotuloProcedencia } from './acoesInsumo';

/**
 * Visão em cartão do insumo. Extraída de `ListaInsumos` quando a tabela densa
 * entrou como visão padrão — os dois desenhos convivem, e o cartão continua
 * sendo o melhor para ler procedência de relance (cor, selo, economia).
 */
export default function CardInsumo({
  item,
  index,
  temProjetos,
  verificandoUsos,
  onAbrirDetalhe,
  onEditar,
  onVincular,
  onSetAtivo,
  onExcluir,
  onAbrirComposicao,
}: AcoesInsumo & { item: InsumoCatalogo; index: number }) {
  const melhor = melhorPreco(item);
  const economia = item.precoReferencia - melhor.preco;
  const comp = item.tipoItem === 'Composicao' ? estadoComposicao(item) : null;
  const hh = item.agregados?.hhPorUnidade ?? 0;

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
            {comp && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                <span
                  className={`text-2xs font-bold flex items-center gap-0.5 ${comp.alerta ? 'text-slate-500' : 'text-indigo-600'}`}
                  title={comp.titulo}
                >
                  <Sigma size={9} />
                  {comp.texto}
                </span>
              </>
            )}
            {hh > 0 && (
              <>
                <span className="text-slate-300" aria-hidden>•</span>
                <span className="text-2xs font-bold text-violet-700 font-mono" title="Homem-hora por unidade desta composição">
                  {hh.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} h/{item.unidade}
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
          controles para fora do cartão — a barra de rolagem horizontal que a
          subida da escala tipográfica revelou (§6.1). */}
      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          {/* A procedência é parte do número: R$ 32 de cotação firme e R$ 32 de
              referência SINAPI decidem margens diferentes. */}
          <span className={`text-2xs font-bold block uppercase tracking-wide ${corProcedencia(melhor.nivel)}`}>
            {rotuloProcedencia(melhor.nivel, melhor.origem)}
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
          {item.tipoItem === 'Composicao' && (
            <IconButton rotulo="Abrir composição" tom="acao" onClick={() => onAbrirComposicao(item)}>
              <Sigma size={14} />
            </IconButton>
          )}
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
