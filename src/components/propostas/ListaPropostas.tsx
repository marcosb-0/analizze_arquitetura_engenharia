import { useMemo, useState } from 'react';
import { atrasoEntrada } from '../../lib/animacao';
import { AlertCircle, FileText, Plus, Search } from 'lucide-react';
import { Cliente, Proposta } from '../../types';
import { formatarDataBR } from '../../lib/data';
import { formatBRL } from '../../lib/preco';
import {
  TOM_VALIDADE,
  DIAS_ALERTA_VALIDADE,
  rotuloValidade,
  situacaoValidade,
} from '../../lib/validadeProposta';
import { StatusBadge } from '../../constants/status';
import EstadoDaLista from '../EstadoDaLista';
import {
  Aviso,
  Button,
  COLUNA_ANCORADA,
  Card,
  Chip,
  FileiraPilulas,
  Input,
  LINHA_SELECIONADA,
  Pilula,
  Select,
  SeletorOrdenacao,
} from '../ui';

type FiltroValidade = 'Todas' | 'Vigentes' | 'A vencer' | 'Vencidas';
type Ordenacao = 'Recentes' | 'Maior valor' | 'Menor valor' | 'Validade' | 'Cliente';

/** Na ordem do funil comercial: nasce em elaboração, vai ao cliente, é decidida. */
const STATUS_FILTRO = ['Todas', 'Elaboração', 'Enviada', 'Aprovada', 'Rejeitada'] as const;

const ORDENS: { id: Ordenacao; label: string }[] = [
  { id: 'Recentes', label: 'Mais recentes' },
  { id: 'Maior valor', label: 'Maior valor' },
  { id: 'Menor valor', label: 'Menor valor' },
  { id: 'Validade', label: 'Validade mais próxima' },
  { id: 'Cliente', label: 'Cliente (A–Z)' },
];

interface Props {
  propostas: Proposta[];
  clientes: Cliente[];
  loading: boolean;
  selecionadaId?: string;
  onSelecionar: (proposta: Proposta) => void;
  onNova: () => void;
}

/**
 * Coluna esquerda: busca, filtros, indicadores de carteira e a lista.
 *
 * Os quatro filtros vivem aqui, e não no componente-pai, porque nada fora desta
 * coluna os lê — o painel de detalhe segue a proposta selecionada, não o filtro.
 */
export default function ListaPropostas({
  propostas,
  clientes,
  loading,
  selecionadaId,
  onSelecionar,
  onNova,
}: Props) {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('Todas');
  const [filtroValidade, setFiltroValidade] = useState<FiltroValidade>('Todas');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('Recentes');

  const filtradas = useMemo(() => {
    const termo = busca.toLowerCase();
    const lista = propostas.filter((p) => {
      const cliente = clientes.find((c) => c.id === p.clienteId);
      const casaBusca =
        p.numero.toLowerCase().includes(termo) ||
        p.descricao.toLowerCase().includes(termo) ||
        (cliente ? cliente.nome.toLowerCase().includes(termo) : false);

      const casaStatus = filtroStatus === 'Todas' || p.status === filtroStatus;

      const situacao = situacaoValidade(p);
      const casaValidade =
        filtroValidade === 'Todas' ||
        (filtroValidade === 'Vencidas' && situacao === 'vencida') ||
        (filtroValidade === 'A vencer' && (situacao === 'a-vencer' || situacao === 'vence-hoje')) ||
        (filtroValidade === 'Vigentes' && (situacao === 'vigente' || situacao === 'sem-validade'));

      return casaBusca && casaStatus && casaValidade;
    });

    // `propostas` já chega ordenada por created_at desc — "Recentes" é a ordem
    // natural e não precisa reordenar.
    if (ordenacao === 'Recentes') return lista;

    const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '';
    return [...lista].sort((a, b) => {
      switch (ordenacao) {
        case 'Maior valor':
          return b.valorEstimado - a.valorEstimado;
        case 'Menor valor':
          return a.valorEstimado - b.valorEstimado;
        case 'Validade':
          // Sem validade vai para o fim, não para o começo como faria a
          // comparação de strings vazias.
          if (!a.dataValidade) return 1;
          if (!b.dataValidade) return -1;
          return a.dataValidade.localeCompare(b.dataValidade);
        case 'Cliente':
          return nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId), 'pt-BR');
        default:
          return 0;
      }
    });
  }, [propostas, clientes, busca, filtroStatus, filtroValidade, ordenacao]);

  // Contagem sobre a base inteira, não sobre o filtro — é um alerta de que há
  // trabalho parado, e some justamente se o usuário já estiver olhando para ele.
  const qtdVencidas = useMemo(
    () => propostas.filter((p) => situacaoValidade(p) === 'vencida').length,
    [propostas]
  );

  /**
   * Taxa de conversão sobre propostas DECIDIDAS. Contar as que ainda estão em
   * elaboração ou aguardando resposta afundaria o índice sem significar nada —
   * elas ainda podem virar qualquer coisa.
   */
  const conversao = useMemo(() => {
    const aprovadas = propostas.filter((p) => p.status === 'Aprovada').length;
    const decididas = aprovadas + propostas.filter((p) => p.status === 'Rejeitada').length;
    return { aprovadas, decididas, taxa: decididas > 0 ? (aprovadas / decididas) * 100 : null };
  }, [propostas]);

  return (
    <Card
      semPadding
      id="propostas-list-col"
      className={`lg:col-span-1 flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}
    >
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">Propostas de Orçamento</h3>
          <Button
            id="add-proposta-btn"
            onClick={onNova}
          >
            <Plus size={14} />
            <span>Nova Proposta</span>
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 text-slate-500" size={14} />
          <Input
            id="proposta-search-input"
            type="text"
            placeholder="Buscar por descrição, número ou cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)} className="pl-8 pr-3"
          />
        </div>

        {/* O STATUS virou fileira de pílulas, como nas outras listas: são quatro
            estados fixos, e o que se quer saber ao chegar aqui é quantos degraus
            o funil tem — dentro do `<select>`, "Rejeitada" só existia para quem
            abrisse o menu. Validade continua em campo porque não é um estado da
            proposta, é um recorte de DATA sobre qualquer um deles: as duas
            fileiras lado a lado leriam como um estado só, partido em dois. */}
        <FileiraPilulas rotulo="Status da proposta">
          {STATUS_FILTRO.map((s) => (
            <Pilula key={s} ativo={filtroStatus === s} onClick={() => setFiltroStatus(s)}>
              {s}
            </Pilula>
          ))}
        </FileiraPilulas>

        <div className="flex items-center gap-2">
          <Select
            id="proposta-validade-filter"
            aria-label="Filtrar por validade"
            value={filtroValidade}
            tamanho="sm"
            onChange={(e) => setFiltroValidade(e.target.value as FiltroValidade)}
          >
            <option value="Todas">Validade: Todas</option>
            <option value="Vigentes">Vigentes</option>
            <option value="A vencer">A vencer ({DIAS_ALERTA_VALIDADE}d)</option>
            <option value="Vencidas">Vencidas</option>
          </Select>
          {/* Ordenar é o mesmo controle das outras quatro listas de cadastro, e
              era o único que reescrevia o próprio `<select>` — sem o ícone e sem
              o contador de resultados que as irmãs mostram. */}
          <SeletorOrdenacao
            opcoes={ORDENS}
            valor={ordenacao}
            onChange={(id) => setOrdenacao(id as Ordenacao)}
            mostrando={filtradas.length}
            total={propostas.length}
            className="min-w-0 flex-1"
          />
        </div>

        {/* Taxa de conversão: o indicador que resume a saúde comercial. */}
        {conversao.taxa !== null && (
          <div className="flex items-center justify-between text-2xs">
            <span className="font-bold text-slate-500 uppercase tracking-wider">
              Taxa de conversão
            </span>
            <span className="text-slate-500">
              <strong className="data-font text-slate-900">{conversao.taxa.toFixed(0)}%</strong>{' '}
              · {conversao.aprovadas} de {conversao.decididas} decididas
            </span>
          </div>
        )}

        {qtdVencidas > 0 && filtroValidade !== 'Vencidas' && (
          <Aviso
            tom="negativo"
            icone={<AlertCircle size={13} />}
            acoes={
              <Button variante="secundario" tamanho="sm" onClick={() => setFiltroValidade('Vencidas')}>
                Ver
              </Button>
            }
          >
            <span className="text-2xs font-bold">
              {qtdVencidas === 1
                ? '1 proposta em aberto passou da validade'
                : `${qtdVencidas} propostas em aberto passaram da validade`}
            </span>
          </Aviso>
        )}
      </div>

      <div
        id="propostas-scroll-area"
        role="listbox"
        aria-label="Propostas"
        className="flex-1 overflow-y-auto divide-y divide-slate-100"
      >
        <EstadoDaLista
          loading={loading}
          total={filtradas.length}
          totalSemFiltro={propostas.length}
          carregandoLabel="Carregando propostas..."
          className="p-4"
          vazio={{
            icon: FileText,
            title: 'Nenhuma proposta cadastrada',
            description: 'Cadastre orçamentos comerciais para as obras de seus clientes. Uma proposta aprovada vira obra pelo assistente de conversão.',
            actionLabel: 'Nova Proposta',
            onAction: onNova,
          }}
          semResultado={{
            title: 'Nenhuma proposta encontrada',
            description: 'Nenhuma proposta corresponde à busca ou aos filtros de status e validade.',
          }}
          onLimparFiltros={() => { setBusca(''); setFiltroStatus('Todas'); setFiltroValidade('Todas'); }}
        >
          {filtradas.map((prop, index) => {
            const selecionada = selecionadaId === prop.id;
            const nomeCliente =
              clientes.find((c) => c.id === prop.clienteId)?.nome ?? 'Cliente não encontrado';
            const situacao = situacaoValidade(prop);
            const rotulo = rotuloValidade(prop);

            return (
              <div
                key={prop.id}
                id={`proposta-item-${prop.id}`}
                // Era um div com onClick: invisível para teclado e para
                // leitores de tela. Como a lista controla o painel ao lado,
                // o papel correto é o de opção numa lista de seleção.
                role="option"
                aria-selected={selecionada}
                tabIndex={0}
                onClick={() => onSelecionar(prop)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelecionar(prop);
                  }
                }}
                style={{ animationDelay: atrasoEntrada(index) }}
                className={`anim-lista p-3 cursor-pointer transition text-left space-y-1.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  selecionada ? LINHA_SELECIONADA.ativa : LINHA_SELECIONADA.inativa
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    {prop.numero}
                  </span>
                  <StatusBadge type="proposta" status={prop.status} />
                </div>
                <h4 className="font-bold text-xs text-slate-900 truncate">{prop.descricao}</h4>
                <p className="text-xs text-slate-500 truncate">Cliente: {nomeCliente}</p>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                  {rotulo && TOM_VALIDADE[situacao] ? (
                    <Chip tom={TOM_VALIDADE[situacao]!}>{rotulo}</Chip>
                  ) : (
                    <span className="text-xs text-slate-500 font-mono">
                      Validade: {formatarDataBR(prop.dataValidade)}
                    </span>
                  )}
                  <span className="font-mono text-xs font-bold text-slate-950">
                    {formatBRL(prop.valorEstimado)}
                  </span>
                </div>
              </div>
            );
          })}
        </EstadoDaLista>
      </div>
    </Card>
  );
}
