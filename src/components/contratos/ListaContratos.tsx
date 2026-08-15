import { useMemo, useState } from 'react';
import { ArrowUpRight, FileSignature, Search } from 'lucide-react';
import { Cliente, Contrato, StatusContrato } from '../../types';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import EstadoDaLista from '../EstadoDaLista';
import { StatusBadge } from '../../constants/status';
import { Button, Card, FileiraPilulas, Input, Pilula } from '../ui';
import { COLUNA_ANCORADA, LINHA_SELECIONADA } from '../ui';

interface Props {
  contratos: Contrato[];
  clientes: Cliente[];
  loading: boolean;
  selecionadoId?: string;
  onSelecionar: (id: string) => void;
  /** Leva a Propostas: é lá que o contrato nasce, no painel da proposta aprovada. */
  onIrParaPropostas: () => void;
}

/** O `TOM_STATUS` local saiu: o tom de cada estado mora em `STATUS_CONFIG.contrato`. */

const TODOS = '__todos__';

/** A fileira de filtro, na ordem do ciclo de vida — não na alfabética. */
const SITUACOES: readonly (StatusContrato | typeof TODOS)[] = [
  TODOS,
  'Minuta',
  'Emitido',
  'Assinado',
  'Encerrado',
];

export default function ListaContratos({
  contratos,
  clientes,
  loading,
  selecionadoId,
  onSelecionar,
  onIrParaPropostas,
}: Props) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<string>(TODOS);

  const nomeCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome])),
    [clientes]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contratos.filter((c) => {
      if (status !== TODOS && c.status !== status) return false;
      if (!termo) return true;
      const cliente = nomeCliente.get(c.clienteId) ?? '';
      return (
        c.numero.toLowerCase().includes(termo) ||
        c.objeto.toLowerCase().includes(termo) ||
        cliente.toLowerCase().includes(termo)
      );
    });
  }, [contratos, busca, status, nomeCliente]);

  return (
    <Card
      semPadding
      id="contratos-list-col"
      className={`flex flex-col overflow-hidden ${COLUNA_ANCORADA}`}
    >
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Era 12px em CAIXA ALTA — a forma que o app reserva para RÓTULO de
              grupo. As outras quatro listas mestre põem aqui o título de 14px
              em caixa mista, que é o que isto é: o nome do bloco. */}
          <h2 className="text-sm font-bold text-slate-900">
            Contratos ({filtrados.length})
          </h2>
          {/* Não há "Novo" aqui, e o botão que ficou no lugar dele diz por quê:
              o contrato se gera no painel da proposta aprovada. Um "Novo" que
              abrisse formulário criaria contrato sem proposta; um "Novo" que
              apenas navegasse mentiria no rótulo. */}
          <Button
            tamanho="sm"
            variante="secundario"
            onClick={onIrParaPropostas}
            title="O contrato é gerado no painel de uma proposta aprovada"
          >
            <span>Gerar de uma proposta</span>
            <ArrowUpRight size={12} />
          </Button>
        </div>
        {/* A busca ficou sozinha na linha: ela dividia o espaço com o select de
            situação e por isso precisava de um piso de 160 px para não colapsar
            (auditoria-360 §M, o pior colapso de campo do produto). Sem o vizinho
            não há de quem se defender. */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
            aria-hidden
          />
          <Input
            value={busca}
            aria-label="Buscar contrato por número, objeto ou cliente"
            placeholder="Buscar por número, objeto ou cliente…"
            onChange={(e) => setBusca(e.target.value)}
            className="pl-7"
          />
        </div>

        {/* O select de situação virou fileira de pílulas, como em Obras: são
            quatro estados fixos, e dentro do menu "Encerrado" só existia para
            quem abrisse a lista. */}
        <FileiraPilulas rotulo="Situação do contrato">
          {SITUACOES.map((s) => (
            <Pilula key={s} ativo={status === s} onClick={() => setStatus(s)}>
              {s === TODOS ? 'Todos' : s}
            </Pilula>
          ))}
        </FileiraPilulas>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        <EstadoDaLista
          loading={loading}
          total={filtrados.length}
          totalSemFiltro={contratos.length}
          carregandoLabel="Carregando contratos..."
          vazio={{
            icon: FileSignature,
            title: 'Nenhum contrato ainda',
            description:
              'O contrato nasce da proposta: primeiro ela vai ao cliente, e depois do aceite o contrato é gerado no painel dela, já com o descritivo negociado virando cláusula.',
            actionLabel: 'Ver propostas',
            onAction: onIrParaPropostas,
          }}
          onLimparFiltros={() => {
            setBusca('');
            setStatus(TODOS);
          }}
        >
          {filtrados.map((contrato) => (
            <button
              key={contrato.id}
              onClick={() => onSelecionar(contrato.id)}
              aria-current={contrato.id === selecionadoId ? 'true' : undefined}
              className={`w-full text-left p-3 transition ${
                contrato.id === selecionadoId ? LINHA_SELECIONADA.ativa : LINHA_SELECIONADA.inativa
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xs font-mono font-bold text-blue-600">{contrato.numero}</span>
                <StatusBadge type="contrato" status={contrato.status} size="sm" />
              </div>
              <p className="text-xs font-semibold text-slate-900 mt-0.5 line-clamp-2">
                {contrato.objeto}
              </p>
              <p className="text-2xs text-slate-500 mt-0.5">
                {nomeCliente.get(contrato.clienteId) ?? 'Cliente não encontrado'}
              </p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-2xs font-mono font-semibold text-slate-700">
                  {formatBRL(contrato.valorTotal)}
                </span>
                {contrato.dataAssinatura && (
                  <span className="text-2xs text-slate-500">
                    assinado em {formatarDataBR(contrato.dataAssinatura)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </EstadoDaLista>
      </div>
    </Card>
  );
}
