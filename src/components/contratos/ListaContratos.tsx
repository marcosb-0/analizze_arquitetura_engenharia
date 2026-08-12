import { useMemo, useState } from 'react';
import { ArrowUpRight, FileSignature, Search } from 'lucide-react';
import { Cliente, Contrato, StatusContrato } from '../../types';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import EstadoDaLista from '../EstadoDaLista';
import { Button, Input, Select } from '../ui';

interface Props {
  contratos: Contrato[];
  clientes: Cliente[];
  loading: boolean;
  selecionadoId?: string;
  onSelecionar: (id: string) => void;
  /** Leva a Propostas: é lá que o contrato nasce, no painel da proposta aprovada. */
  onIrParaPropostas: () => void;
}

/** Os quatro estados, com o tom que a lista usa para cada um. */
const TOM_STATUS: Record<StatusContrato, string> = {
  Minuta: 'bg-slate-100 text-slate-700 border-slate-200',
  Emitido: 'bg-blue-50 text-blue-700 border-blue-200',
  Assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Encerrado: 'bg-slate-50 text-slate-500 border-slate-200',
};

const TODOS = '__todos__';

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
    <div
      id="contratos-list-col"
      className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden"
    >
      <div className="p-3 border-b border-slate-200 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
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
        <div className="flex items-center gap-2">
          {/* `min-w-[160px]` não é enfeite: `flex-1` é `flex: 1 1 0%`, então este
              contêiner encolhia até sobrarem 2 px úteis dentro da coluna estreita
              — restava só a lupa e não havia onde digitar (auditoria-360 §M, o
              pior colapso de campo do produto). O piso garante o campo legível
              antes de o select levar o resto. */}
          <div className="relative flex-1 min-w-[160px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              aria-hidden
            />
            <Input
              value={busca}
              aria-label="Buscar contrato por número, objeto ou cliente"
              placeholder="Buscar…"
              onChange={(e) => setBusca(e.target.value)}
              className="pl-7"
              tamanho="sm"
            />
          </div>
          <Select
            value={status}
            aria-label="Filtrar por situação"
            onChange={(e) => setStatus(e.target.value)}
            tamanho="sm"
            largura="automatica"
            className="shrink-0"
          >
            <option value={TODOS}>Todos</option>
            <option value="Minuta">Minuta</option>
            <option value="Emitido">Emitido</option>
            <option value="Assinado">Assinado</option>
            <option value="Encerrado">Encerrado</option>
          </Select>
        </div>
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
              className={`w-full text-left p-3 transition hover:bg-slate-50 ${
                contrato.id === selecionadoId ? 'bg-blue-50/60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xs font-mono font-bold text-blue-600">{contrato.numero}</span>
                <span
                  className={`text-2xs font-semibold px-1.5 py-0.5 rounded border shrink-0 ${TOM_STATUS[contrato.status]}`}
                >
                  {contrato.status}
                </span>
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
    </div>
  );
}
