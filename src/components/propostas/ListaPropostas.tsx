import { useMemo } from 'react';
import { atrasoEntrada } from '../../lib/animacao';
import { AlertCircle, ArrowRight, FileText, Plus, Search } from 'lucide-react';
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
import {
  FILTROS_INICIAIS,
  ORDENS,
  STATUS_FILTRO,
  type FiltroValidade,
  type FiltrosCarteira,
  type OrdenacaoCarteira,
} from './filtrosCarteira';
import EstadoDaLista from '../EstadoDaLista';
import {
  Aviso,
  Button,
  Chip,
  FaixaKpis,
  FileiraPilulas,
  Input,
  Kpi,
  Pilula,
  SECAO_ESPACO,
  Select,
  SeletorOrdenacao,
  TableWrap,
  Td,
  Th,
} from '../ui';

interface Props {
  propostas: Proposta[];
  clientes: Cliente[];
  loading: boolean;
  filtros: FiltrosCarteira;
  onFiltrar: (filtros: FiltrosCarteira) => void;
  /** Abre a proposta — a carteira sai da tela e a proposta entra. */
  onAbrir: (id: string) => void;
  onNova: () => void;
}

/**
 * A CARTEIRA de propostas, ocupando a tela inteira.
 *
 * Era uma coluna de um terço com o detalhe ao lado, e cada proposta era um
 * cartão empilhado de quatro linhas. O que a geometria custava: as oito
 * informações da proposta (número, escopo, cliente, status, validade, valor,
 * itens, descritivo) não cabiam, e as que cabiam ficavam desalinhadas entre
 * linhas — comparar valor ou validade entre duas propostas exigia lê-las uma de
 * cada vez. Numa tabela de largura cheia cada campo tem coluna, e a pergunta que
 * traz alguém a esta tela ("o que está parado, o que vence, quanto vale") passa
 * a ser respondida varrendo uma coluna de cima a baixo.
 */
export default function ListaPropostas({
  propostas,
  clientes,
  loading,
  filtros,
  onFiltrar,
  onAbrir,
  onNova,
}: Props) {
  const { busca, status: filtroStatus, validade: filtroValidade, ordenacao } = filtros;
  const aplicar = (patch: Partial<FiltrosCarteira>) => onFiltrar({ ...filtros, ...patch });

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
   * Os três números da carteira, todos sobre a base inteira.
   *
   * Eles existem porque a largura apareceu: o "em aberto" e a taxa de conversão
   * respondem, antes de qualquer filtro, quanto dinheiro está na mesa e quanto
   * dele costuma fechar. A taxa é calculada sobre propostas DECIDIDAS — contar
   * as que ainda estão em elaboração ou aguardando resposta afundaria o índice
   * sem significar nada, já que elas ainda podem virar qualquer coisa.
   */
  const carteira = useMemo(() => {
    const emAberto = propostas.filter((p) => p.status === 'Elaboração' || p.status === 'Enviada');
    const aprovadas = propostas.filter((p) => p.status === 'Aprovada');
    const decididas = aprovadas.length + propostas.filter((p) => p.status === 'Rejeitada').length;
    return {
      emAberto: emAberto.length,
      valorEmAberto: emAberto.reduce((soma, p) => soma + p.valorEstimado, 0),
      aprovadas: aprovadas.length,
      valorAprovado: aprovadas.reduce((soma, p) => soma + p.valorEstimado, 0),
      decididas,
      taxa: decididas > 0 ? (aprovadas.length / decididas) * 100 : null,
    };
  }, [propostas]);

  return (
    <div className={SECAO_ESPACO}>
      <div id="propostas-title" className="flex items-center justify-between gap-3">
        <div className="text-left">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Propostas de Orçamento</h2>
          <p className="text-xs text-slate-500">
            A carteira comercial: o que está em elaboração, o que aguarda o cliente e o que já
            virou negócio. Abrir uma proposta leva ao orçamento, ao descritivo e ao caminho até o
            contrato e a obra.
          </p>
        </div>
        <Button id="add-proposta-btn" onClick={onNova} className="shrink-0">
          <Plus size={15} />
          <span>Nova Proposta</span>
        </Button>
      </div>

      <FaixaKpis id="propostas-kpis" colunas={3}>
        <Kpi
          rotulo="Em aberto"
          valor={formatBRL(carteira.valorEmAberto)}
          detalhe={`${carteira.emAberto} ${carteira.emAberto === 1 ? 'proposta' : 'propostas'} em elaboração ou com o cliente`}
        />
        <Kpi
          rotulo="Aprovado"
          valor={formatBRL(carteira.valorAprovado)}
          detalhe={`${carteira.aprovadas} ${carteira.aprovadas === 1 ? 'proposta aprovada' : 'propostas aprovadas'}`}
        />
        <Kpi
          rotulo="Taxa de conversão"
          valor={carteira.taxa === null ? '—' : `${carteira.taxa.toFixed(0)}%`}
          detalhe={
            carteira.taxa === null
              ? 'Nenhuma proposta decidida ainda'
              : `${carteira.aprovadas} de ${carteira.decididas} decididas`
          }
        />
      </FaixaKpis>

      <div className="space-y-3">
        <div id="propostas-filters" className="relative text-left">
          <Search className="absolute left-3 top-3 text-slate-500" size={14} />
          <Input
            id="proposta-search-input"
            type="text"
            placeholder="Buscar por descrição, número da proposta ou cliente..."
            value={busca}
            onChange={(e) => aplicar({ busca: e.target.value })} className="pl-9 pr-4"
          />
        </div>

        {/* O STATUS é fileira de pílulas, como nas outras listas: são quatro
            estados fixos, e o que se quer saber ao chegar aqui é quantos degraus
            o funil tem — dentro de um `<select>`, "Rejeitada" só existia para
            quem abrisse o menu. Validade continua em campo porque não é um
            estado da proposta, é um recorte de DATA sobre qualquer um deles: as
            duas fileiras lado a lado leriam como um estado só, partido em dois. */}
        <FileiraPilulas rotulo="Status da proposta">
          {STATUS_FILTRO.map((s) => (
            <Pilula key={s} ativo={filtroStatus === s} onClick={() => aplicar({ status: s })}>
              {s}
            </Pilula>
          ))}

          {/* `shrink-0`: sem ele os dois controles são espremidos em vez de
              descerem para a linha de baixo — o seletor de ordenação chega a
              mostrar "Mais re…" no lugar do nome da ordem. */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Select
              id="proposta-validade-filter"
              aria-label="Filtrar por validade"
              value={filtroValidade}
              tamanho="sm"
              onChange={(e) => aplicar({ validade: e.target.value as FiltroValidade })}
            >
              <option value="Todas">Validade: Todas</option>
              <option value="Vigentes">Vigentes</option>
              <option value="A vencer">A vencer ({DIAS_ALERTA_VALIDADE}d)</option>
              <option value="Vencidas">Vencidas</option>
            </Select>
            {/* O piso é MEDIDO, não escolhido: o `<select>` do seletor é
                `w-full`, e um elemento `w-full` conta como zero no cálculo de
                largura intrínseca do pai — dentro de um flex-item ele encolhia
                para 84px e mostrava "Mais re…" no lugar da ordem. 210px é o
                ponto em que o controle satura em 170px (127px do rótulo mais
                longo, "Validade mais próxima", + 16 de padding + 32 da seta);
                acima disso nada mais cresce. */}
            <SeletorOrdenacao
              opcoes={ORDENS}
              valor={ordenacao}
              onChange={(id) => aplicar({ ordenacao: id as OrdenacaoCarteira })}
              mostrando={filtradas.length}
              total={propostas.length}
              className="min-w-[210px]"
            />
          </div>
        </FileiraPilulas>

        {qtdVencidas > 0 && filtroValidade !== 'Vencidas' && (
          <Aviso
            tom="negativo"
            icone={<AlertCircle size={14} />}
            acoes={
              <Button
                variante="secundario"
                tamanho="sm"
                onClick={() => aplicar({ validade: 'Vencidas' })}
              >
                Ver
              </Button>
            }
          >
            <span className="font-bold">
              {qtdVencidas === 1
                ? '1 proposta em aberto passou da validade'
                : `${qtdVencidas} propostas em aberto passaram da validade`}
            </span>
          </Aviso>
        )}
      </div>

      <EstadoDaLista
        loading={loading}
        total={filtradas.length}
        totalSemFiltro={propostas.length}
        carregandoLabel="Carregando propostas..."
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
        onLimparFiltros={() => onFiltrar(FILTROS_INICIAIS)}
      >
        <TableWrap>
          <thead>
            <tr>
              <Th>Proposta</Th>
              <Th>Cliente</Th>
              <Th>Status</Th>
              <Th>Validade</Th>
              <Th align="right">Orçamento</Th>
              <Th align="right">Valor</Th>
              {/* A coluna do botão não tem nome: o rótulo está no próprio
                  botão de cada linha, e um "Ação" no cabeçalho só repetiria. */}
              <Th align="right"><span className="sr-only">Abrir</span></Th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((prop, index) => {
              const nomeCliente =
                clientes.find((c) => c.id === prop.clienteId)?.nome ?? 'Cliente não encontrado';
              const situacao = situacaoValidade(prop);
              const rotulo = rotuloValidade(prop);

              return (
                /* O clique na LINHA é conveniência de mouse; quem carrega a
                   navegação de verdade é o botão "Abrir" da última coluna —
                   um `<tr onClick>` sozinho é invisível para teclado e para
                   leitor de tela, que foi o defeito desta lista antes de ela
                   virar tabela. */
                <tr
                  key={prop.id}
                  id={`proposta-item-${prop.id}`}
                  onClick={() => onAbrir(prop.id)}
                  style={{ animationDelay: atrasoEntrada(index, 0.02, 0.3) }}
                  className="anim-fade-entra cursor-pointer transition hover:bg-slate-50"
                >
                  {/* `w-full max-w-0` é o que faz o ESCOPO ceder espaço em vez
                      de empurrar a tabela para fora da tela: numa tabela de
                      layout automático a célula reivindica a largura do texto
                      inteiro, e um teto em `ch` só troca um número arbitrário
                      por outro (38ch dava 439px de 996 e abria barra
                      horizontal). Com `max-width: 0` a coluna passa a valer o
                      que sobrar das outras seis, em qualquer largura de janela. */}
                  <Td className="w-full max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="data-font text-2xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                        {prop.numero}
                      </span>
                      <span className="font-bold text-slate-900 truncate" title={prop.descricao}>
                        {prop.descricao}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-slate-600">
                    <span className="block truncate max-w-[24ch]" title={nomeCliente}>
                      {nomeCliente}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge type="proposta" status={prop.status} />
                  </Td>
                  <Td>
                    {rotulo && TOM_VALIDADE[situacao] ? (
                      <Chip tom={TOM_VALIDADE[situacao]!}>{rotulo}</Chip>
                    ) : (
                      <span className="data-font text-slate-600">
                        {formatarDataBR(prop.dataValidade)}
                      </span>
                    )}
                  </Td>
                  {/* Quanto da proposta já está montado — invisível na coluna
                      estreita de antes, e é o que separa a proposta pronta
                      para enviar da que ainda é só um título.

                      O descritivo aparece pela EXCEÇÃO: "com descritivo" em
                      toda linha é uma palavra que não distingue nada e que
                      rouba largura do escopo, que é a coluna que se lê. O que
                      merece ser visto de longe é a proposta que iria ao
                      cliente só com a tabela de preços. */}
                  <Td align="right" className="text-slate-600 whitespace-nowrap">
                    {prop.qtdItens > 0
                      ? `${prop.qtdItens} ${prop.qtdItens === 1 ? 'item' : 'itens'}`
                      : 'Valor global'}
                    {prop.qtdSecoes === 0 && (
                      <span className="text-slate-500"> · sem descritivo</span>
                    )}
                  </Td>
                  <Td align="right" mono className="font-bold text-slate-950 whitespace-nowrap">
                    {formatBRL(prop.valorEstimado)}
                  </Td>
                  <Td align="right">
                    <Button
                      variante="acao"
                      tamanho="sm"
                      id={`abrir-proposta-btn-${prop.id}`}
                      onClick={() => onAbrir(prop.id)}
                    >
                      Abrir
                      <ArrowRight size={13} />
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </EstadoDaLista>
    </div>
  );
}
