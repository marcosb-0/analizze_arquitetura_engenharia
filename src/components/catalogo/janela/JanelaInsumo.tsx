import { useEffect, useState } from 'react';
import { AlertTriangle, Briefcase, FileText, LineChart, Pencil, Sigma, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import {
  ComponenteComposicao,
  CotacaoFornecedor,
  Fornecedor,
  InsumoCatalogo,
  LinhaHH,
  NovoInsumoCatalogo,
  PontoHistoricoPreco,
} from '../../../types';
import { cotacaoVencida, formatBRL, melhorPreco } from '../../../lib/preco';
import { participacao } from '../../../lib/composicao';
import { nomeDaUnidade } from '../../../constants/unidades';
import { EstadoComposicao } from '../../../services/catalogoService';
import Spinner from '../../Spinner';
import { Abas, AbaDef, Button, Chip, IconButton, Modal, ModalBody, PainelAba } from '../../ui';
import { rotuloProcedencia, tomProcedencia } from '../acoesInsumo';
import { iconeCategoria } from '../categorias';
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
 * ANTES (até 20/set/2026) eram duas, e competindo: um `Drawer` lateral com
 * metadados e, por cima dele, um `Modal` de composição atrás de um ícone Σ.
 * Hoje clicar em qualquer item abre esta janela, e o topo responde de uma vez
 * que item é este (código, categoria, tipo), quanto custa e o quanto esse
 * número é firme (procedência).
 *
 * 25/set/2026 — as AÇÕES subiram para o topo. Moravam no rodapé da aba Ficha, a
 * terceira: quem abria um insumo para editá-lo tinha de achar a aba certa
 * primeiro, e o "Vincular a obra" — o que se faz com um insumo — ficava a dois
 * cliques de onde a pessoa já estava.
 *
 * A aba Composição só existe para composição. Antes aparecia em todo item, e
 * para o insumo simples (a maioria) mostrava um parágrafo explicando que ali
 * não havia composição. Agora o insumo simples tem, na aba Preço, o botão
 * "Transformar em composição", que abre a aba já pronta para o primeiro
 * componente — o tipo continua sendo consequência, não escolha.
 */
type Aba = 'composicao' | 'preco' | 'ficha';

const PREFIXO = 'janela-insumo';

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
  onAlternarAtivo: (item: InsumoCatalogo) => void;
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
      description={
        insumo ? (
          <span className="data-font">
            {insumo.codigo} · {nomeDaUnidade(insumo.unidade)}
          </span>
        ) : undefined
      }
    >
      {/* `key` no id: trocar de item REMONTA o corpo inteiro, e é isso que faz
          a aba ativa, o detalhe carregado e todo o estado da composição
          nascerem limpos. A alternativa seria um efeito de reset por estado,
          que é uma lista para manter em dia. */}
      {/* `ModalBody` é o que dá margem e rolagem própria ao corpo. A janela
          nasceu sem ele: o conteúdo encostava nas bordas e, num item com
          árvore longa, rolava o diálogo inteiro — cabeçalho junto. */}
      {insumo && (
        <ModalBody>
          <CorpoJanela key={insumo.id} insumo={insumo} onFechar={onFechar} {...resto} />
        </ModalBody>
      )}
    </Modal>
  );
}

const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Um número do topo: rótulo pequeno em cima, valor condensado embaixo. */
function Metrica({ rotulo, children, detalhe }: { rotulo: string; children: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 data-font text-xl font-bold leading-tight text-slate-900">{children}</dd>
      {detalhe && <dd className="mt-1">{detalhe}</dd>}
    </div>
  );
}

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
  onAlternarAtivo,
  onExcluir,
  onAddCotacao,
  onDesativarCotacao,
  onAdotarPrecoCotacao,
  onAddComponente,
  onUpdateComponente,
  onRemoverComponente,
}: Omit<JanelaInsumoProps, 'insumo'> & { insumo: InsumoCatalogo }) {
  const ehComposicao = insumo.tipoItem === 'Composicao';
  /**
   * `montando` é o insumo simples que a pessoa pediu para transformar em
   * composição: a aba aparece antes de o item virar uma, e continua aberta
   * mesmo que o primeiro componente ainda não tenha voltado do servidor.
   */
  const [montando, setMontando] = useState(false);
  const temAbaComposicao = ehComposicao || montando;
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
  const cotacoesVigentes = detalhe?.cotacoes.filter((c) => c.ativa && !cotacaoVencida(c)).length;

  const abas: AbaDef<Aba>[] = [
    ...(temAbaComposicao
      ? [{ id: 'composicao' as const, rotulo: 'Composição', icone: <Sigma size={13} />, contagem: insumo.qtdComponentes || undefined }]
      : []),
    { id: 'preco', rotulo: 'Preço e cotações', icone: <LineChart size={13} />, contagem: cotacoesVigentes || undefined },
    { id: 'ficha', rotulo: 'Ficha', icone: <FileText size={13} /> },
  ];

  const transformarEmComposicao = () => {
    setMontando(true);
    setAba('composicao');
  };

  // Vincular e Editar abrem OUTRO diálogo; fechar esta janela antes é o que
  // impede duas superfícies empilhadas, que foi o que a janela veio desfazer.
  const vincular = () => { onFechar(); onVincular(insumo); };
  const editar = () => { onFechar(); onEditar(insumo); };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------
          Identidade + ações
          ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Chip tom="neutro">
            <span aria-hidden="true">{iconeCategoria(insumo.categoria)}</span>
            {insumo.categoria}
          </Chip>
          {ehComposicao ? (
            <Chip tom="informativo" title="Preço calculado a partir dos componentes">
              <Sigma size={12} aria-hidden="true" />
              Composição · {insumo.qtdComponentes} componente{insumo.qtdComponentes === 1 ? '' : 's'}
            </Chip>
          ) : (
            <Chip tom="neutro">Insumo</Chip>
          )}
          {!insumo.ativo && <Chip tom="atencao" ponto>Inativo</Chip>}
          {insumo.temComponenteInativo && (
            <Chip tom="atencao" title="Há insumo desativado somando preço nesta composição">
              <AlertTriangle size={12} aria-hidden="true" />
              Componente inativo
            </Chip>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            tamanho="sm"
            onClick={vincular}
            disabled={!temProjetos}
            title={temProjetos ? 'Incluir no orçamento de uma obra' : 'Nenhuma obra cadastrada'}
          >
            <Briefcase size={13} />
            <span>Vincular a obra</span>
          </Button>
          <Button tamanho="sm" variante="secundario" onClick={editar}>
            <Pencil size={13} />
            <span>Editar</span>
          </Button>
          <Button tamanho="sm" variante="secundario" onClick={() => onAlternarAtivo(insumo)}>
            {insumo.ativo ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
            <span>{insumo.ativo ? 'Desativar' : 'Reativar'}</span>
          </Button>
          <IconButton
            rotulo="Excluir do catálogo"
            tom="perigo"
            carregando={verificandoUsos === insumo.id}
            disabled={verificandoUsos === insumo.id}
            onClick={() => onExcluir(insumo)}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Números do item
          ------------------------------------------------------------------ */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-slate-50 px-4 py-3.5 sm:grid-cols-4">
        <Metrica
          rotulo={`Preço / ${insumo.unidade}`}
          detalhe={
            <span className="flex flex-wrap items-center gap-1.5">
              <Chip tom={tomProcedencia(melhor.nivel)}>{rotuloProcedencia(melhor.nivel, melhor.origem)}</Chip>
              {melhor.nivel <= 2 && melhor.diasIdade != null && (
                <span className="data-font text-2xs text-slate-500">há {melhor.diasIdade}d</span>
              )}
            </span>
          }
        >
          {formatBRL(melhor.preco)}
        </Metrica>

        {ehComposicao && ag ? (
          <>
            <Metrica rotulo={`HH / ${insumo.unidade}`}>
              {ag.hhPorUnidade > 0 ? <span className="text-violet-700">{numero(ag.hhPorUnidade)} h</span> : '—'}
            </Metrica>
            <Metrica rotulo="Mão de obra">
              {pctMO != null && pctMO > 0 ? `${numero(pctMO, 0)}%` : '—'}
            </Metrica>
          </>
        ) : (
          <>
            <Metrica rotulo="Referência do catálogo" detalhe={<span className="text-2xs text-slate-500">{insumo.precoFonte}</span>}>
              {formatBRL(insumo.precoReferencia)}
            </Metrica>
            <Metrica rotulo="Em composições">{insumo.usadoEmComposicoes || '—'}</Metrica>
          </>
        )}

        <Metrica rotulo="Obras que usaram">{insumo.obrasUtilizando || '—'}</Metrica>
      </dl>

      {/* O toast que avisava disto só aparecia ao VINCULAR — tarde, e só para
          quem ia vincular. O aviso é sobre o preço que o topo está mostrando. */}
      {melhor.ignoradasPorVencimento > 0 && (
        <p className="-mt-2 flex items-center gap-1.5 text-2xs text-amber-700">
          <AlertTriangle size={12} aria-hidden="true" />
          {melhor.ignoradasPorVencimento === 1
            ? 'Há 1 cotação vencida, fora do prazo de validade, que não entrou no melhor preço.'
            : `Há ${melhor.ignoradasPorVencimento} cotações vencidas, fora do prazo de validade, que não entraram no melhor preço.`}
        </p>
      )}

      {/* ------------------------------------------------------------------
          Abas
          ------------------------------------------------------------------ */}
      <div>
        <Abas abas={abas} ativa={aba} onTrocar={setAba} rotulo="Seções do insumo" prefixo={PREFIXO} />

        <PainelAba prefixo={PREFIXO} ativa={aba} className="pt-4">
          {aba === 'composicao' && (
            <AbaComposicao
              insumo={insumo}
              jornadaDiaria={jornadaDiaria}
              iniciarAdicionando={montando && !ehComposicao}
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
                // Hora de mão de obra e taxa não se decompõem em outros itens —
                // o convite ali seria ruído. A trava de verdade continua no banco.
                onTransformarEmComposicao={
                  temAbaComposicao || insumo.categoria === 'Mão de Obra' || insumo.categoria === 'Taxa'
                    ? undefined
                    : transformarEmComposicao
                }
              />
            )
          )}

          {aba === 'ficha' && <AbaFicha insumo={insumo} />}
        </PainelAba>
      </div>
    </div>
  );
}
