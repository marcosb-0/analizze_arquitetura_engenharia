import { useEffect, useState } from 'react';
import { Briefcase, Calendar, Layers, Pencil, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import {
  ComponenteComposicao,
  CotacaoFornecedor,
  Fornecedor,
  InsumoCatalogo,
  PontoHistoricoPreco,
} from '../../types';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import { useFeedback } from '../FeedbackContext';
import { Button, Drawer } from '../ui';
import Spinner from '../Spinner';
import { iconeCategoria } from './categorias';
import GraficoHistorico from './GraficoHistorico';
import MapaCotacoes from './MapaCotacoes';
import PainelComposicao from './PainelComposicao';

type DetalheCarregado = {
  historicoPrecos: PontoHistoricoPreco[];
  cotacoes: CotacaoFornecedor[];
  componentes: ComponenteComposicao[];
};

interface DetalheInsumoProps {
  /** `null` mantém o painel fechado. Vem da listagem, para acompanhar o item recarregado. */
  insumo: InsumoCatalogo | null;
  fornecedores: Fornecedor[];
  temProjetos: boolean;
  verificandoUsos: string | null;
  carregarDetalhe: (insumoId: string, incluirComponentes?: boolean) => Promise<DetalheCarregado | null>;
  onClose: () => void;
  onVincular: (item: InsumoCatalogo) => void;
  onEditar: (item: InsumoCatalogo) => void;
  onSetAtivo: (id: string, ativo: boolean) => Promise<void>;
  onExcluir: (item: InsumoCatalogo) => void;
  onAddCotacao: (insumoId: string, quote: CotacaoFornecedor) => Promise<CotacaoFornecedor | null>;
  onDesativarCotacao: (insumoId: string, cotacaoId: string) => Promise<void>;
  onAdotarPrecoCotacao: (insumoId: string, preco: number) => Promise<InsumoCatalogo | null>;
  onAddComponente: (
    composicaoId: string,
    entrada: { insumoId: string; coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<ComponenteComposicao[] | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<ComponenteComposicao[] | null>;
  buscarCandidatosComponente: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
}

export default function DetalheInsumo({ insumo, onClose, ...resto }: DetalheInsumoProps) {
  return (
    <Drawer
      id="catalogo-detail-drawer"
      open={!!insumo}
      onClose={onClose}
      title={insumo?.descricao}
      ariaLabel={insumo ? `Detalhes de ${insumo.descricao}` : undefined}
      description={insumo
        ? `${insumo.categoria} · ${insumo.tipoItem === 'Composicao' ? 'Composição' : 'Insumo'}`
        : undefined}
      icon={insumo ? iconeCategoria(insumo.categoria) : undefined}
      size="md"
    >
      {insumo && <CorpoDetalhe insumo={insumo} onClose={onClose} {...resto} />}
    </Drawer>
  );
}

/**
 * O corpo só existe enquanto o painel está aberto — o `Drawer` monta os filhos
 * dentro do `AnimatePresence`. Por isso o detalhe é buscado aqui, na montagem,
 * em vez de num efeito que observava o id lá em cima: abrir o painel É o
 * disparo, e fechar já descarta o que foi lido.
 */
function CorpoDetalhe({
  insumo,
  fornecedores,
  temProjetos,
  verificandoUsos,
  carregarDetalhe,
  onClose,
  onVincular,
  onEditar,
  onSetAtivo,
  onExcluir,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
  buscarCandidatosComponente,
}: Omit<DetalheInsumoProps, 'insumo'> & { insumo: InsumoCatalogo }) {
  const { confirm } = useFeedback();
  const [detalhe, setDetalhe] = useState<DetalheCarregado | null>(null);
  const [carregando, setCarregando] = useState(true);

  const ehComposicao = insumo.tipoItem === 'Composicao';

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    // A lista de componentes só é buscada para composição — para insumo simples
    // a resposta é vazia por construção, e seria uma ida ao servidor a mais.
    carregarDetalhe(insumo.id, ehComposicao)
      .then((d) => {
        if (!cancelado) setDetalhe(d);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [insumo.id, ehComposicao]);

  const recarregarDetalhe = async () => {
    setDetalhe(await carregarDetalhe(insumo.id, ehComposicao));
  };

  const aposMexerEmComponente = async (resultado: ComponenteComposicao[] | null) => {
    if (!resultado) return false;
    await recarregarDetalhe();
    return true;
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-3">
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Metadados</span>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-2xs text-slate-500 font-semibold block">Unidade</span>
              <p className="font-extrabold text-slate-800 font-mono mt-0.5 uppercase">{insumo.unidade}</p>
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
                <Calendar size={11} />
                {formatarDataBR(insumo.dataAtualizacaoPreco)}
              </p>
            </div>
            {insumo.tipo === 'SINAPI' && (
              <div className="col-span-2">
                <span className="text-2xs text-slate-500 font-semibold block">Identidade SINAPI</span>
                <p className="font-bold text-slate-800 mt-0.5 font-mono text-2xs">
                  {insumo.codigoSINAPI ?? '—'} · {insumo.uf ?? 'UF?'} ·{' '}
                  {insumo.mesReferencia ?? 'mês?'} ·{' '}
                  {insumo.desonerado === undefined ? 'regime?' : insumo.desonerado ? 'desonerado' : 'não desonerado'}
                </p>
              </div>
            )}
            <div className="col-span-2">
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

        {carregando ? (
          <div className="flex justify-center py-6">
            <Spinner size={16} />
          </div>
        ) : (
          <>
            {ehComposicao && (
              <PainelComposicao
                insumo={insumo}
                componentes={detalhe?.componentes ?? []}
                buscarCandidatosComponente={buscarCandidatosComponente}
                onAddComponente={onAddComponente}
                onUpdateComponente={onUpdateComponente}
                onRemoverComponente={onRemoverComponente}
                aposMexer={aposMexerEmComponente}
              />
            )}

            {insumo.usadoEmComposicoes > 0 && (
              <div className="flex items-start gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <Layers size={11} className="text-slate-500 mt-0.5 shrink-0" />
                <p className="text-2xs text-slate-600 font-semibold leading-relaxed">
                  Este item entra em {insumo.usadoEmComposicoes} composição(ões). Mudar o preço dele
                  recalcula todas elas e registra o novo custo no histórico de cada uma.
                </p>
              </div>
            )}

            <GraficoHistorico historico={detalhe?.historicoPrecos ?? []} />

            <MapaCotacoes
              insumo={insumo}
              cotacoes={detalhe?.cotacoes ?? []}
              fornecedores={fornecedores}
              ehComposicao={ehComposicao}
              onAddCotacao={onAddCotacao}
              onDesativarCotacao={onDesativarCotacao}
              onAdotarPrecoCotacao={onAdotarPrecoCotacao}
              recarregarDetalhe={recarregarDetalhe}
            />
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2.5 shrink-0">
        <Button
          onClick={() => {
            onClose();
            onVincular(insumo);
          }}
          disabled={!temProjetos} className="flex-1"
        >
          <Briefcase size={13} />
          <span>Vincular a obra</span>
        </Button>
        <Button
          onClick={() => {
            onClose();
            onEditar(insumo);
          }}
          aria-label="Editar insumo"
          title="Editar insumo" variante="secundario"
        >
          <Pencil size={13} />
        </Button>
        <Button
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
                onClose();
              },
            })
          } variante="secundario"
          aria-label={insumo.ativo ? 'Desativar' : 'Reativar'}
          title={insumo.ativo ? 'Desativar' : 'Reativar'}
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
    </>
  );
}
