import { Briefcase, Calendar, Pencil, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { InsumoCatalogo } from '../../../types';
import { formatBRL } from '../../../lib/preco';
import { formatarDataBR } from '../../../lib/data';
import { nomeDaUnidade } from '../../../constants/unidades';
import { useFeedback } from '../../FeedbackContext';
import Spinner from '../../Spinner';
import { Button } from '../../ui';

/**
 * A aba Ficha: o que o item É, fora do preço e da estrutura — e as ações que
 * agem sobre ele.
 *
 * As quatro ações do rodapé vieram do drawer de detalhe. Só "Vincular a obra"
 * e "Editar" fecham a janela antes de agir, porque as duas abrem outro diálogo
 * e empilhar superfícies é exatamente o que esta janela veio desfazer.
 * Desativar e excluir não fecham: o resultado delas se vê aqui mesmo.
 */
interface AbaFichaProps {
  insumo: InsumoCatalogo;
  temProjetos: boolean;
  verificandoUsos: string | null;
  onFechar: () => void;
  onVincular: (item: InsumoCatalogo) => void;
  onEditar: (item: InsumoCatalogo) => void;
  onSetAtivo: (id: string, ativo: boolean) => Promise<void>;
  onExcluir: (item: InsumoCatalogo) => void;
}

export default function AbaFicha({
  insumo,
  temProjetos,
  verificandoUsos,
  onFechar,
  onVincular,
  onEditar,
  onSetAtivo,
  onExcluir,
}: AbaFichaProps) {
  const { confirm } = useFeedback();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 space-y-3">
        <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Metadados</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-2xs text-slate-500 font-semibold block">Código</span>
            <p className="font-extrabold text-slate-800 font-mono mt-0.5">{insumo.codigo}</p>
          </div>
          <div>
            {/* Nome por extenso, não só o símbolo: `m³` e `m²` se confundem num
                relance, e aqui há espaço para a forma que não se confunde. */}
            <span className="text-2xs text-slate-500 font-semibold block">Unidade</span>
            <p className="font-bold text-slate-800 mt-0.5">{nomeDaUnidade(insumo.unidade)}</p>
          </div>
          <div>
            <span className="text-2xs text-slate-500 font-semibold block">Categoria</span>
            <p className="font-bold text-slate-800 mt-0.5">{insumo.categoria}</p>
          </div>
          <div>
            <span className="text-2xs text-slate-500 font-semibold block">Preço de referência</span>
            <p className="font-extrabold text-slate-800 font-mono mt-0.5">{formatBRL(insumo.precoReferencia)}</p>
          </div>
          <div>
            <span className="text-2xs text-slate-500 font-semibold block">Origem do preço</span>
            <p className="font-bold text-slate-800 mt-0.5">{insumo.precoFonte}</p>
          </div>
          <div>
            <span className="text-2xs text-slate-500 font-semibold block">Atualizado em</span>
            <p className="font-bold text-slate-600 mt-0.5 flex items-center gap-1">
              <Calendar size={11} aria-hidden />
              {formatarDataBR(insumo.dataAtualizacaoPreco)}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <span className="text-2xs text-slate-500 font-semibold block">Uso em obras</span>
            <p className="font-bold text-slate-800 mt-0.5">
              {insumo.obrasUtilizando === 0
                ? 'Ainda não usado em nenhum orçamento'
                : `${insumo.obrasUtilizando} obra(s) já orçaram este insumo`}
            </p>
          </div>
        </div>
      </div>

      {insumo.composicao && (
        <div className="space-y-1 bg-blue-50/20 p-3 rounded-lg border border-blue-50">
          <span className="text-2xs font-bold text-blue-800 block uppercase tracking-wide">Ficha técnica / especificação</span>
          <p className="text-xs text-slate-600 leading-relaxed italic">"{insumo.composicao}"</p>
        </div>
      )}

      {insumo.aplicacao && (
        <div className="space-y-1 bg-amber-50/20 p-3 rounded-lg border border-amber-50">
          <span className="text-2xs font-bold text-amber-800 block uppercase tracking-wide">Aplicações</span>
          <p className="text-xs text-slate-600 leading-relaxed">{insumo.aplicacao}</p>
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2.5">
        <Button
          onClick={() => { onFechar(); onVincular(insumo); }}
          disabled={!temProjetos}
        >
          <Briefcase size={13} />
          <span>Vincular a obra</span>
        </Button>
        <Button
          onClick={() => { onFechar(); onEditar(insumo); }}
          variante="secundario"
          aria-label="Editar insumo"
          title="Editar insumo"
        >
          <Pencil size={13} />
        </Button>
        <Button
          variante="secundario"
          aria-label={insumo.ativo ? 'Desativar' : 'Reativar'}
          title={insumo.ativo ? 'Desativar' : 'Reativar'}
          onClick={() =>
            confirm({
              title: insumo.ativo ? 'Desativar insumo' : 'Reativar insumo',
              message: insumo.ativo
                ? `"${insumo.descricao}" deixa de aparecer para novos orçamentos, mas continua vinculado aos orçamentos que já o usaram — a procedência do histórico fica intacta.`
                : `"${insumo.descricao}" volta a ficar disponível para orçamentos.`,
              tone: 'normal',
              confirmLabel: insumo.ativo ? 'Desativar' : 'Reativar',
              onConfirm: async () => {
                await onSetAtivo(insumo.id, !insumo.ativo);
                onFechar();
              },
            })
          }
        >
          {insumo.ativo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
        </Button>
        <button
          onClick={() => onExcluir(insumo)}
          disabled={verificandoUsos === insumo.id}
          className="bg-rose-50 border border-rose-100 hover:bg-rose-100 disabled:opacity-50 active:scale-95 text-rose-700 font-bold px-3 rounded-lg text-xs flex items-center gap-1.5 transition"
          aria-label="Excluir do catálogo"
          title="Excluir do catálogo"
        >
          {verificandoUsos === insumo.id ? <Spinner size={13} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}
