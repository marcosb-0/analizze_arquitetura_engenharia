import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, FileText, Printer, Send, Sparkles } from 'lucide-react';
import {
  AjustePreco,
  Cliente,
  EmpresaConfig,
  Fornecedor,
  InsumoCatalogo,
  ItemProposta,
  ModeloTexto,
  Proposta,
  Projeto,
  SecaoProposta,
  Contrato,
} from '../../types';
import { NovoItemProposta } from '../../services/itensPropostaService';
import { FiltroCatalogo } from '../../services/catalogoService';
import { diasAte, formatarDataBR } from '../../lib/data';
import { situacaoValidade } from '../../lib/validadeProposta';
import ConfiancaPreco from '../ConfiancaPreco';
import PropostaItens from '../PropostaItens';
import CabecalhoProposta from './CabecalhoProposta';
import IndicadoresProposta from './IndicadoresProposta';
import PainelDescritivo from './PainelDescritivo';
import PainelRevisoes from './PainelRevisoes';
import DocumentoProposta from './DocumentoProposta';
import ModalRevisao from './ModalRevisao';
import { Button } from '../ui';

interface Props {
  proposta: Proposta;
  itens: ItemProposta[];
  /** O descritivo desta proposta — o texto que o documento imprime. */
  secoes: SecaoProposta[];
  /** A biblioteca da empresa, de onde saem os textos reutilizáveis. */
  modelos: ModeloTexto[];
  cliente?: Cliente;
  catalogo: InsumoCatalogo[];
  fornecedores: Fornecedor[];
  timbre: EmpresaConfig;
  /** A obra gerada por esta proposta, se já houver. */
  obra?: Projeto;
  /** O contrato gerado por esta proposta, se já houver. */
  contrato?: Contrato;
  /** O orçamento desta proposta ainda está sendo buscado. */
  carregando: boolean;
  duplicando: boolean;
  aplicarFiltroCatalogo: (patch: Partial<FiltroCatalogo>) => void;
  onMudarStatus: (status: Proposta['status']) => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onAbrirObra: (projetoId: string) => void;
  onIniciarConversao: () => void;
  onGerarContrato: () => void;
  onAbrirContrato: () => void;
  onAddRevision: (id: string, alteracoes: string, valor?: number) => Promise<boolean>;
  onUpdateBdi: (id: string, bdi: number) => Promise<void>;
  onUpdateBdiVisivelPdf: (id: string, visivel: boolean) => Promise<void>;
  onAddItem: (novo: NovoItemProposta) => Promise<ItemProposta | null>;
  onAjustarItem: (id: string, ajuste: AjustePreco) => Promise<ItemProposta | null>;
  onAjustarQuantidade: (id: string, quantidade: number) => Promise<ItemProposta | null>;
  onRemoveItem: (id: string) => Promise<void>;
  descritivo: Omit<Parameters<typeof PainelDescritivo>[0], 'propostaId' | 'secoes' | 'modelos' | 'carregando' | 'bloqueado' | 'motivoBloqueio'>;
}

/**
 * Coluna direita: tudo o que existe sobre a proposta selecionada.
 *
 * Recebe `bloqueado`/`motivoBloqueio` já resolvidos porque a mesma regra
 * governa o cabeçalho, o orçamento e o histórico — calculá-la em três lugares
 * era como as três telas passavam a discordar entre si.
 */
export default function DetalheProposta({
  proposta,
  itens,
  secoes,
  modelos,
  cliente,
  catalogo,
  fornecedores,
  timbre,
  obra,
  contrato,
  carregando,
  duplicando,
  aplicarFiltroCatalogo,
  onMudarStatus,
  onEditar,
  onDuplicar,
  onExcluir,
  onAbrirObra,
  onIniciarConversao,
  onGerarContrato,
  onAbrirContrato,
  onAddRevision,
  onUpdateBdi,
  onUpdateBdiVisivelPdf,
  onAddItem,
  onAjustarItem,
  onAjustarQuantidade,
  onRemoveItem,
  descritivo,
}: Props) {
  const [mostrarDocumento, setMostrarDocumento] = useState(false);
  const [novaRevisao, setNovaRevisao] = useState(false);

  const convertida = !!obra;
  const temItens = itens.length > 0;
  const situacao = situacaoValidade(proposta);
  // Negativo porque `diasAte` mede daqui para a frente e o envio ficou atrás.
  const diasDesdeEnvio = proposta.dataEnvio ? -(diasAte(proposta.dataEnvio) ?? 0) : null;

  /**
   * Uma proposta que já virou obra é o documento que originou um contrato em
   * execução: mexer nos itens, no BDI ou no status mudaria retroativamente o
   * valor de venda de uma obra em andamento. Rejeitada e aprovada também param
   * de aceitar edição — a aprovada ainda pode ser reaberta pelo status.
   */
  const bloqueado = convertida || proposta.status === 'Rejeitada' || proposta.status === 'Aprovada';
  const motivoBloqueio = convertida
    ? `Proposta já convertida na obra "${obra.nome}". O orçamento ficou congelado como registro do que foi vendido.`
    : proposta.status === 'Aprovada'
      ? 'Proposta aprovada pelo cliente. Para reabrir o orçamento, volte o status para Elaboração.'
      : proposta.status === 'Rejeitada'
        ? 'Proposta rejeitada. O orçamento fica preservado como histórico.'
        : undefined;

  /**
   * O que ainda falta para a proposta poder ir ao cliente. Só o que impede um
   * documento completo entra aqui — o motivo pelo qual a lista pode ficar
   * vazia, e então some da tela em vez de virar decoração permanente.
   */
  const pendencias = useMemo(() => {
    // `alvo` distingue as pendências que se resolvem no cadastro (o padrão) da
    // que se resolve no painel de descritivo, mais abaixo na mesma tela.
    const lista: { chave: string; texto: string; rotuloAcao: string; alvo?: 'descritivo' }[] = [];
    if (!temItens && proposta.valorManual <= 0) {
      lista.push({
        chave: 'valor',
        texto: 'A proposta está sem valor: monte o orçamento ou informe um valor global.',
        rotuloAcao: 'Informar valor',
      });
    }
    if (!proposta.prazoExecucaoDias) {
      lista.push({ chave: 'prazo', texto: 'Prazo de execução não definido.', rotuloAcao: 'Definir' });
    }
    if (!proposta.dataValidade) {
      lista.push({
        chave: 'validade',
        texto: 'Sem data de validade — o cliente não sabe até quando os preços valem.',
        rotuloAcao: 'Definir',
      });
    }
    // `qtdSecoes` conta só as seções COM texto (v_propostas). Uma proposta pode
    // ter cinco títulos criados e nenhum preenchido, e o documento sairia igual
    // ao de quem não escreveu nada.
    if (proposta.qtdSecoes === 0) {
      lista.push({
        chave: 'descritivo',
        texto: 'Sem descritivo técnico — o cliente recebe só a tabela de preços.',
        rotuloAcao: 'Escrever',
        alvo: 'descritivo',
      });
    }
    return lista;
  }, [proposta.valorManual, proposta.prazoExecucaoDias, proposta.dataValidade, proposta.qtdSecoes, temItens]);

  return (
    <div id="proposta-detail-view" className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
      <CabecalhoProposta
        proposta={proposta}
        nomeCliente={cliente?.nome ?? 'Cliente não encontrado'}
        convertida={convertida}
        bloqueado={bloqueado}
        motivoBloqueio={motivoBloqueio}
        duplicando={duplicando}
        onMudarStatus={onMudarStatus}
        onEditar={onEditar}
        onDuplicar={onDuplicar}
        onExcluir={onExcluir}
      />

      <IndicadoresProposta
        proposta={proposta}
        qtdItens={itens.length}
        bloqueado={bloqueado}
        onEditar={onEditar}
      />

      {/* O que falta antes de enviar. Com valor, prazo e validade saindo do
          cadastro, o risco novo é a proposta chegar ao cliente pela metade. Em
          vez de voltar a exigir tudo na criação, a tela diz o que ainda falta —
          e some sozinha quando não falta mais nada. */}
      {proposta.status === 'Elaboração' && !carregando && pendencias.length > 0 && (
        <div className="p-3 bg-blue-50/50 border border-blue-200/70 rounded-lg space-y-2 text-left">
          <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide flex items-center gap-1.5">
            <AlertCircle size={13} className="text-blue-500" />
            <span>Antes de enviar ao cliente</span>
          </h4>
          <ul className="space-y-1">
            {pendencias.map((p) => (
              <li key={p.chave} className="flex items-center gap-2 text-2xs text-blue-800">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <span className="flex-1">{p.texto}</span>
                <button
                  onClick={() => {
                    if (p.alvo !== 'descritivo') {
                      onEditar();
                      return;
                    }
                    document
                      .getElementById('proposta-descritivo')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="text-2xs font-bold text-blue-700 hover:text-blue-900 underline underline-offset-2 shrink-0"
                >
                  {p.rotuloAcao}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Marcos do ciclo comercial. Antes o status era um rótulo sem data e sem
          porquê: não dava para saber há quanto tempo o cliente estava com a
          proposta nem por que recusou. */}
      {proposta.dataEnvio && proposta.status !== 'Rejeitada' && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <Send size={13} className="text-slate-500 shrink-0" />
          <span>
            Enviada ao cliente em{' '}
            <strong className="text-slate-700 font-mono">{formatarDataBR(proposta.dataEnvio)}</strong>
            {proposta.status === 'Enviada' && diasDesdeEnvio !== null && (
              <>
                {' '}
                —{' '}
                {diasDesdeEnvio === 0
                  ? 'hoje'
                  : `há ${diasDesdeEnvio} ${diasDesdeEnvio === 1 ? 'dia' : 'dias'}`}{' '}
                aguardando resposta.
              </>
            )}
          </span>
        </div>
      )}

      {proposta.status === 'Rejeitada' && proposta.motivoRejeicao && (
        <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg text-left space-y-0.5">
          <h4 className="text-xs font-bold text-rose-800">Motivo da recusa</h4>
          <p className="text-xs text-rose-700 leading-relaxed italic">"{proposta.motivoRejeicao}"</p>
        </div>
      )}

      {/* Vencer não bloqueia nada — prorrogar prazo é rotina comercial. Mas
          seguir para aprovação sem perceber que expirou, não. */}
      {situacao === 'vencida' && (
        <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg flex items-start gap-2.5 text-left">
          <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-rose-800">Proposta fora da validade</h4>
            <p className="text-xs text-rose-700 leading-relaxed">
              Os preços expiraram em {formatarDataBR(proposta.dataValidade)}. Revise o orçamento e
              registre uma nova validade antes de reapresentá-la ao cliente — os custos do catálogo
              podem ter mudado desde então.
            </p>
          </div>
        </div>
      )}

      {/* Quanto desta proposta é preço firme e quanto é estimativa. Fica junto
          do orçamento porque é aqui que se decide o BDI: mandar rápido, sem
          cotar, é legítimo — decidir a margem no escuro não. */}
      {temItens && <ConfiancaPreco propostaId={proposta.id} recarregarEm={itens} />}

      {/* Orçamento da proposta — itens vindos do catálogo + BDI */}
      <PropostaItens
        proposta={proposta}
        itens={itens}
        catalogo={catalogo}
        fornecedores={fornecedores}
        bloqueado={bloqueado}
        carregando={carregando}
        motivoBloqueio={motivoBloqueio}
        aplicarFiltroCatalogo={aplicarFiltroCatalogo}
        onAddItem={onAddItem}
        onAjustarItem={onAjustarItem}
        onAjustarQuantidade={onAjustarQuantidade}
        onRemoveItem={onRemoveItem}
        onUpdateBdi={onUpdateBdi}
      />

      {/* Depois do orçamento e antes da emissão: é a ordem em que o documento
          se monta — os números, o texto que os explica, e então o papel. */}
      <PainelDescritivo
        propostaId={proposta.id}
        secoes={secoes}
        modelos={modelos}
        carregando={carregando}
        bloqueado={bloqueado}
        motivoBloqueio={motivoBloqueio}
        {...descritivo}
      />

      {/* Já convertida — o caminho acabou aqui; a RPC recusaria uma segunda obra. */}
      {obra && (
        <div
          id="proposal-converted-banner"
          className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles size={14} className="text-slate-500 shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Convertida na obra <strong className="text-slate-900">{obra.nome}</strong>. O orçamento
              desta proposta ficou congelado como registro do que foi vendido — alterações de escopo
              passam a ser feitas na obra.
            </p>
          </div>
          {/* O banner nomeava a obra sem oferecer caminho até ela. */}
          <button
            onClick={() => onAbrirObra(obra.id)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded transition active:scale-95 flex items-center gap-1 shrink-0"
          >
            Abrir obra <ArrowRight size={12} />
          </button>
        </div>
      )}

      {proposta.status === 'Aprovada' && !convertida && (
        <div
          id="proposal-conversion-banner"
          className="p-3 bg-emerald-50/55 border border-emerald-200 rounded-lg flex flex-col md:flex-row justify-between items-center gap-3 text-left"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Sparkles size={14} className="text-emerald-500" />
              <span>Pronto para Conversão</span>
            </h4>
            <p className="text-xs text-emerald-700 leading-relaxed max-w-lg">
              Esta proposta foi aprovada pelo cliente. Inicie a obra revisando o orçamento e o
              cronograma antes de confirmar — os valores partem da proposta, mas você ajusta tudo.
            </p>
          </div>
          {/* Duas saídas independentes, e a ordem entre elas é do negócio:
              obra que começa antes da assinatura acontece, e contrato assinado
              sem obra aberta também. Nenhuma das duas exige a outra. */}
          <div className="flex items-center gap-2 shrink-0">
            {contrato ? (
              <button
                onClick={onAbrirContrato}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-900 border border-emerald-300 hover:bg-emerald-100/60 px-2.5 py-1.5 rounded-lg transition active:scale-95 flex items-center gap-1"
              >
                <span>Contrato {contrato.numero}</span>
                <ArrowRight size={12} />
              </button>
            ) : (
              <button
                id={`generate-contract-btn-${proposta.id}`}
                onClick={onGerarContrato}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-900 border border-emerald-300 hover:bg-emerald-100/60 px-2.5 py-1.5 rounded-lg transition active:scale-95"
              >
                Gerar contrato
              </button>
            )}
            <button
              id={`convert-proposal-btn-${proposta.id}`}
              onClick={onIniciarConversao}
              className="bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              <span>Iniciar Obra</span>
            </button>
          </div>
        </div>
      )}

      {/* Convertida em obra mas ainda sem contrato: o banner de conversão sumiu
          e o caminho para gerar o contrato sumiria com ele. */}
      {proposta.status === 'Aprovada' && convertida && !contrato && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Esta proposta ainda não tem contrato. As cláusulas nascem do descritivo já negociado
            aqui.
          </p>
          <button
            id={`generate-contract-btn-${proposta.id}`}
            onClick={onGerarContrato}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded transition active:scale-95 shrink-0"
          >
            Gerar contrato
          </button>
        </div>
      )}

      {/* Print & PDF Automation Drawer */}
      <div className="p-3 bg-slate-900 text-slate-100 rounded-lg flex items-center justify-between text-left shadow-md">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Printer size={14} className="text-blue-400" />
            <span>Emissão de Proposta Técnica</span>
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Monta o documento oficial para entrega ao cliente. Na janela de impressão, escolha "Salvar
            como PDF" para gerar o arquivo.
          </p>
        </div>
        <Button
          id="generate-proposal-pdf-btn"
          onClick={() => setMostrarDocumento(true)} className="shrink-0"
        >
          <FileText size={13} />
          <span>Visualizar proposta</span>
        </Button>
      </div>

      <PainelRevisoes
        revisoes={proposta.revisoes}
        bloqueado={bloqueado}
        carregando={carregando}
        onNovaRevisao={() => setNovaRevisao(true)}
      />

      <DocumentoProposta
        aberto={mostrarDocumento}
        onFechar={() => setMostrarDocumento(false)}
        proposta={proposta}
        itens={itens}
        secoes={secoes}
        cliente={cliente}
        timbre={timbre}
        onAlternarBdiVisivel={onUpdateBdiVisivelPdf}
      />

      <ModalRevisao
        aberto={novaRevisao}
        onFechar={() => setNovaRevisao(false)}
        proposta={proposta}
        qtdItens={itens.length}
        onRegistrar={onAddRevision}
      />
    </div>
  );
}
