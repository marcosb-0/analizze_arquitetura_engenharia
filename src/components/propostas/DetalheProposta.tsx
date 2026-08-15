import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, FileSignature, FileText, Printer, Send, Sparkles } from 'lucide-react';
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
import { Aviso, Button, Card, PREENCHIMENTO } from '../ui';

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
    <div id="proposta-detail-view" className="space-y-4 text-left">
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
        <Aviso tom="informativo" icone={<AlertCircle size={14} />}>
          <span className="block text-2xs font-bold uppercase tracking-wide">
            Antes de enviar ao cliente
          </span>
          <ul className="mt-1.5 space-y-1">
            {pendencias.map((p) => (
              <li key={p.chave} className="flex items-center gap-2 text-2xs">
                {/* O marcador era `bg-blue-400` — 2,4:1 sobre o fundo pálido do
                    aviso, abaixo do piso de 3:1. Agora sai do mesmo token da
                    barra de progresso, medido nos três fundos do app. */}
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PREENCHIMENTO.acao}`} />
                <span className="flex-1">{p.texto}</span>
                <Button
                  /* `secundario` e não `acao`: o texto de `acao` é `slate-500`,
                     e cinza sobre o fundo tingido do aviso reprova o piso de
                     contraste (medido: 4,36:1 no aviso negativo). */
                  variante="secundario"
                  tamanho="sm"
                  onClick={() => {
                    if (p.alvo !== 'descritivo') {
                      onEditar();
                      return;
                    }
                    document
                      .getElementById('proposta-descritivo')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {p.rotuloAcao}
                </Button>
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      {/* Marcos do ciclo comercial. Antes o status era um rótulo sem data e sem
          porquê: não dava para saber há quanto tempo o cliente estava com a
          proposta nem por que recusou. */}
      {proposta.dataEnvio && proposta.status !== 'Rejeitada' && (
        <Aviso tom="neutro" icone={<Send size={13} />}>
          <span>
            Enviada ao cliente em{' '}
            <strong className="data-font font-bold">{formatarDataBR(proposta.dataEnvio)}</strong>
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
        </Aviso>
      )}

      {proposta.status === 'Rejeitada' && proposta.motivoRejeicao && (
        <Aviso tom="negativo" icone={<AlertCircle size={14} />}>
          <span className="block font-bold">Motivo da recusa</span>
          <p className="leading-relaxed italic">"{proposta.motivoRejeicao}"</p>
        </Aviso>
      )}

      {/* Vencer não bloqueia nada — prorrogar prazo é rotina comercial. Mas
          seguir para aprovação sem perceber que expirou, não. */}
      {situacao === 'vencida' && (
        <Aviso tom="negativo" icone={<AlertCircle size={15} />}>
          <span className="block font-bold">Proposta fora da validade</span>
          <p className="leading-relaxed">
            Os preços expiraram em {formatarDataBR(proposta.dataValidade)}. Revise o orçamento e
            registre uma nova validade antes de reapresentá-la ao cliente — os custos do catálogo
            podem ter mudado desde então.
          </p>
        </Aviso>
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
        <Aviso
          tom="neutro"
          icone={<Sparkles size={14} />}
          className="anim-fade-entra"
          /* O banner nomeava a obra sem oferecer caminho até ela. */
          acoes={
            <Button variante="suave" tamanho="sm" onClick={() => onAbrirObra(obra.id)}>
              Abrir obra <ArrowRight size={12} />
            </Button>
          }
        >
          <span id="proposal-converted-banner" className="leading-relaxed">
            Convertida na obra <strong className="font-bold">{obra.nome}</strong>. O orçamento desta
            proposta ficou congelado como registro do que foi vendido — alterações de escopo passam a
            ser feitas na obra.
          </span>
        </Aviso>
      )}

      {proposta.status === 'Aprovada' && !convertida && (
        /* O CONVITE do fluxo comercial, e por isso o painel `destaque`.
           Era um bloco verde com dois botões verdes de tons diferentes e um
           terceiro verde sólido — quatro verdes, nenhum deles significando
           "aprovado" (o status já diz isso três blocos acima); era só a cor do
           estado vazando para os controles, que a Regra do Papel proíbe. O
           `variante="destaque"` é o mesmo bloco que o mockup usa para CTA
           financeiro: um lugar do app com fundo saturado, e este é do mesmo
           tamanho — "a proposta virou negócio, comece a obra". */
        <Card
          id="proposal-conversion-banner"
          variante="destaque"
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-left"
        >
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold flex items-center gap-1.5">
              <Sparkles size={14} aria-hidden="true" />
              <span>Pronto para conversão</span>
            </h4>
            <p className="text-2xs leading-relaxed max-w-lg opacity-90">
              Esta proposta foi aprovada pelo cliente. Inicie a obra revisando o orçamento e o
              cronograma antes de confirmar — os valores partem da proposta, mas você ajusta tudo.
            </p>
          </div>
          {/* Duas saídas independentes, e a ordem entre elas é do negócio:
              obra que começa antes da assinatura acontece, e contrato assinado
              sem obra aberta também. Nenhuma das duas exige a outra. */}
          <div className="flex items-center gap-2 shrink-0">
            {contrato ? (
              <Button variante="secundario" onClick={onAbrirContrato}>
                <span>Contrato {contrato.numero}</span>
                <ArrowRight size={12} />
              </Button>
            ) : (
              <Button
                id={`generate-contract-btn-${proposta.id}`}
                variante="secundario"
                onClick={onGerarContrato}
              >
                Gerar contrato
              </Button>
            )}
            <Button id={`convert-proposal-btn-${proposta.id}`} onClick={onIniciarConversao}>
              Iniciar obra
            </Button>
          </div>
        </Card>
      )}

      {/* Convertida em obra mas ainda sem contrato: o banner de conversão sumiu
          e o caminho para gerar o contrato sumiria com ele. */}
      {proposta.status === 'Aprovada' && convertida && !contrato && (
        <Aviso
          tom="neutro"
          icone={<FileSignature size={14} />}
          acoes={
            <Button
              id={`generate-contract-btn-${proposta.id}`}
              variante="suave"
              tamanho="sm"
              onClick={onGerarContrato}
            >
              Gerar contrato
            </Button>
          }
        >
          Esta proposta ainda não tem contrato. As cláusulas nascem do descritivo já negociado aqui.
        </Aviso>
      )}

      {/* A EMISSÃO do documento.
          Era o único bloco `bg-slate-900` do app — uma faixa preta com sombra
          `shadow-md`, texto de apoio em `slate-500` sobre preto (3,4:1, reprova
          para corpo) e um ícone `blue-400`. Nada nesta tela justifica um bloco
          escuro: ele não flutua, não é status e não é o CTA (o CTA de conversão
          está logo acima, e dois blocos gritando disputam a mesma decisão).
          Como `<Card>` ele volta a ser o que é — a última parada da tela. */}
      <Card className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-left">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="p-1.5 bg-blue-50 rounded-lg text-blue-600 shrink-0" aria-hidden="true">
            <Printer size={14} />
          </span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900">Emissão da proposta técnica</h4>
            <p className="text-2xs text-slate-500 mt-0.5 max-w-md leading-snug">
              Monta o documento oficial para entrega ao cliente. Na janela de impressão, escolha
              "Salvar como PDF" para gerar o arquivo.
            </p>
          </div>
        </div>
        <Button
          id="generate-proposal-pdf-btn"
          onClick={() => setMostrarDocumento(true)} className="shrink-0"
        >
          <FileText size={13} />
          <span>Visualizar proposta</span>
        </Button>
      </Card>

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
