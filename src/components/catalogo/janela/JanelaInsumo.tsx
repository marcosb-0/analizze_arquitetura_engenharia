import { useEffect, useState } from 'react';
import { Clock, FileText, LineChart, Sigma } from 'lucide-react';
import {
  ComponenteComposicao,
  CotacaoFornecedor,
  Fornecedor,
  InsumoCatalogo,
  LinhaHH,
  NovoInsumoCatalogo,
  PontoHistoricoPreco,
} from '../../../types';
import { formatBRL, melhorPreco } from '../../../lib/preco';
import { participacao } from '../../../lib/composicao';
import { EstadoComposicao } from '../../../services/catalogoService';
import Spinner from '../../Spinner';
import { Modal } from '../../ui';
import { corProcedencia, rotuloProcedencia } from '../acoesInsumo';
import { corCategoria, iconeCategoria } from '../categorias';
import AbaComposicao from './AbaComposicao';
import AbaFicha from './AbaFicha';
import AbaPreco from './AbaPreco';

type DetalheCarregado = {
  historicoPrecos: PontoHistoricoPreco[];
  cotacoes: CotacaoFornecedor[];
  componentes: ComponenteComposicao[];
};

/**
 * A janela de um item do catálogo — uma superfície só, no meio da tela.
 *
 * ANTES eram duas, e competindo: clicar na linha abria um `Drawer` lateral de
 * 448 px com metadados e um cartão de composição que só mostrava três números;
 * a composição de verdade estava atrás de um ícone Σ na coluna de ações, num
 * `Modal` que abria POR CIMA do drawer sem fechá-lo. Para chegar ao que o
 * catálogo tem de mais importante eram dois cliques em dois lugares, e o alvo
 * natural — a linha inteira — levava ao lugar errado.
 *
 * AGORA clicar em qualquer item abre esta janela. A composição é uma aba, não
 * um destino separado, e o cabeçalho responde de uma vez as três perguntas que
 * o drawer respondia em espaços diferentes: que item é este (código), quanto
 * ele custa (preço vigente) e o quanto esse número é firme (procedência).
 *
 * A aba inicial depende do item: composição abre na estrutura, insumo simples
 * abre no preço — que é o que cada um tem a dizer.
 */
type Aba = 'composicao' | 'preco' | 'ficha';

interface JanelaInsumoProps {
  /** `null` mantém a janela fechada. Vem da listagem, para acompanhar o item recarregado. */
  insumo: InsumoCatalogo | null;
  fornecedores: Fornecedor[];
  temProjetos: boolean;
  verificandoUsos: string | null;
  jornadaDiaria: number;
  carregarDetalhe: (insumoId: string, incluirComponentes?: boolean) => Promise<DetalheCarregado | null>;
  carregarComposicao: (id: string) => Promise<(EstadoComposicao & { hh: LinhaHH[] }) | null>;
  buscarCandidatos: (termo: string, excluirId: string) => Promise<InsumoCatalogo[]>;
  onCriarInsumo: (novo: NovoInsumoCatalogo) => Promise<InsumoCatalogo | null>;
  onFechar: () => void;
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
  ) => Promise<EstadoComposicao | null>;
  onUpdateComponente: (
    componenteId: string,
    composicaoId: string,
    patch: { coeficiente: number; observacao?: string }
  ) => Promise<EstadoComposicao | null>;
  onRemoverComponente: (componenteId: string, composicaoId: string) => Promise<EstadoComposicao | null>;
}

export default function JanelaInsumo({ insumo, onFechar, ...resto }: JanelaInsumoProps) {
  return (
    <Modal
      id="janela-insumo"
      open={!!insumo}
      onClose={onFechar}
      size="full"
      title={insumo ? insumo.descricao : 'Insumo'}
      description={insumo ? `${insumo.codigo} · ${insumo.categoria}` : undefined}
    >
      {/* `key` no id: trocar de item REMONTA o corpo inteiro, e é isso que faz
          a aba ativa, o detalhe carregado e todo o estado da composição
          nascerem limpos. A alternativa seria um efeito de reset por estado,
          que é uma lista para manter em dia. */}
      {insumo && <CorpoJanela key={insumo.id} insumo={insumo} onFechar={onFechar} {...resto} />}
    </Modal>
  );
}

const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

function CorpoJanela({
  insumo,
  fornecedores,
  temProjetos,
  verificandoUsos,
  jornadaDiaria,
  carregarDetalhe,
  carregarComposicao,
  buscarCandidatos,
  onCriarInsumo,
  onFechar,
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
}: Omit<JanelaInsumoProps, 'insumo'> & { insumo: InsumoCatalogo }) {
  const ehComposicao = insumo.tipoItem === 'Composicao';
  const [aba, setAba] = useState<Aba>(ehComposicao ? 'composicao' : 'preco');
  const [detalhe, setDetalhe] = useState<DetalheCarregado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    carregarDetalhe(insumo.id, ehComposicao)
      .then((d) => { if (!cancelado) setDetalhe(d); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [insumo.id, ehComposicao, carregarDetalhe]);

  const recarregarDetalhe = async () => {
    setDetalhe(await carregarDetalhe(insumo.id, ehComposicao));
  };

  const melhor = melhorPreco(insumo);
  const ag = insumo.agregados;
  const pctMO = ag ? participacao(ag.custoMaoDeObra, ag.custoTotal) : null;

  const abas: { id: Aba; rotulo: string; icone: React.ReactNode }[] = [
    { id: 'composicao', rotulo: 'Composição', icone: <Sigma size={12} aria-hidden /> },
    { id: 'preco', rotulo: 'Preço', icone: <LineChart size={12} aria-hidden /> },
    { id: 'ficha', rotulo: 'Ficha', icone: <FileText size={12} aria-hidden /> },
  ];

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------
          Cabeçalho de identidade
          ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-200">
        {/* SEM repetir a descrição nem o código: o cabeçalho do próprio `Modal`
            já os exibe (`title` e `description`), e medido no navegador o nome
            aparecia duas vezes, uma embaixo da outra. O que sobra aqui é o que
            o cabeçalho do Modal não sabe dizer — a categoria com sua cor e o
            estado do item. */}
        <div className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${corCategoria(insumo.categoria)}`}>
            {iconeCategoria(insumo.categoria)}
            {insumo.categoria}
          </span>
          {!insumo.ativo && (
            <span className="text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              inativo
            </span>
          )}
        </div>

        <div className="flex items-start gap-5 shrink-0">
          <div>
            <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
              Preço / {insumo.unidade}
            </span>
            <span className="text-base font-extrabold text-slate-900 font-mono">
              {formatBRL(insumo.precoVigente)}
            </span>
            <span className={`text-2xs font-bold uppercase tracking-wide block ${corProcedencia(melhor.nivel)}`}>
              {rotuloProcedencia(melhor.nivel, melhor.origem)}
            </span>
          </div>

          {/* Os dois números que só a composição tem. Eles ficavam num cartão
              dentro do drawer que existia só para dizer "vale a pena abrir" —
              agora estão no cabeçalho da coisa já aberta. */}
          {ehComposicao && ag && (
            <>
              <div>
                <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
                  HH / {insumo.unidade}
                </span>
                <span className="text-base font-extrabold text-violet-800 font-mono flex items-center gap-1">
                  {ag.hhPorUnidade > 0 ? (
                    <><Clock size={12} aria-hidden />{numero(ag.hhPorUnidade)}</>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">
                  Mão de obra
                </span>
                <span className="text-base font-extrabold text-slate-800 font-mono">
                  {pctMO != null && pctMO > 0 ? `${numero(pctMO, 0)}%` : '—'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Abas
          ------------------------------------------------------------------ */}
      <div role="tablist" aria-label="Seções do insumo" className="flex items-center gap-1 border-b border-slate-200 -mt-1">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            type="button"
            aria-selected={aba === a.id}
            aria-controls={`painel-${a.id}`}
            id={`aba-${a.id}`}
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition ${
              aba === a.id
                ? 'border-indigo-600 text-indigo-800'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {a.icone}
            <span>{a.rotulo}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
        {aba === 'composicao' && (
          <AbaComposicao
            insumo={insumo}
            jornadaDiaria={jornadaDiaria}
            carregarComposicao={carregarComposicao}
            buscarCandidatos={buscarCandidatos}
            onCriarInsumo={onCriarInsumo}
            onAddComponente={onAddComponente}
            onUpdateComponente={onUpdateComponente}
            onRemoverComponente={onRemoverComponente}
          />
        )}

        {aba === 'preco' && (
          carregando ? (
            <div className="flex justify-center py-10"><Spinner size={18} /></div>
          ) : (
            <AbaPreco
              insumo={insumo}
              fornecedores={fornecedores}
              historico={detalhe?.historicoPrecos ?? []}
              cotacoes={detalhe?.cotacoes ?? []}
              onAddCotacao={onAddCotacao}
              onDesativarCotacao={onDesativarCotacao}
              onAdotarPrecoCotacao={onAdotarPrecoCotacao}
              recarregarDetalhe={recarregarDetalhe}
            />
          )
        )}

        {aba === 'ficha' && (
          <AbaFicha
            insumo={insumo}
            temProjetos={temProjetos}
            verificandoUsos={verificandoUsos}
            onFechar={onFechar}
            onVincular={onVincular}
            onEditar={onEditar}
            onSetAtivo={onSetAtivo}
            onExcluir={onExcluir}
          />
        )}
      </div>
    </div>
  );
}
