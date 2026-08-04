import React, { useState } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { Cliente, NovaProposta, Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  clientes: Cliente[];
  onCriar: (prop: NovaProposta) => Promise<Proposta | null>;
  onCriada: (proposta: Proposta) => void;
}

export default function ModalNovaProposta({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="add-proposta-modal"
      open={aberto}
      onClose={onFechar}
      title="Adicionar Nova Proposta"
      size="md"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

/**
 * Criar uma proposta pede só o mínimo que a identifica: para quem e do quê.
 *
 * Valor, BDI, prazo e validade saíram daqui porque não se sabem no instante em
 * que a proposta nasce — são o resultado de montar o orçamento. Exigi-los na
 * abertura produzia números inventados só para o formulário aceitar (o
 * "A definir" gravado como prazo era exatamente isso). Todos continuam
 * editáveis a qualquer momento pelo botão Editar do painel.
 */
function Formulario({
  clientes,
  onCriar,
  onCriada,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [clienteId, setClienteId] = useState('');
  const [descricao, setDescricao] = useState('');

  /**
   * O `<select>` mostra o primeiro cliente quando nada foi escolhido, então o
   * valor efetivo tem de acompanhá-lo. Derivar em vez de sincronizar com efeito
   * também cobre a lista de clientes chegando com o diálogo já aberto — antes
   * disso, o estado ficava em '' enquanto a tela exibia um nome.
   */
  const clienteEfetivo =
    clienteId && clientes.some((c) => c.id === clienteId) ? clienteId : (clientes[0]?.id ?? '');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteEfetivo || !descricao.trim()) {
      toast.error('Informe o cliente e a descrição do escopo.');
      return;
    }

    setSalvando(true);

    // Quem numera é o banco: contar o array em memória reaproveitava o número
    // de uma proposta excluída e batia na unique de `propostas.numero`. O
    // número real chega no retorno.
    const criada = await onCriar({
      id: crypto.randomUUID(),
      clienteId: clienteEfetivo,
      descricao: descricao.trim(),
      // Nasce zerada: sem itens e sem valor digitado, a proposta vale zero — e
      // um zero visível é mais honesto do que um palpite pedido no cadastro.
      valorManual: 0,
      bdiPercentual: 0,
      prazoExecucaoDias: undefined,
      dataValidade: '',
      status: 'Elaboração',
    });

    setSalvando(false);
    // O hook já mostrou o motivo da falha — sem proposta gravada não há o que
    // comemorar nem o que selecionar.
    if (!criada) return;

    onCriada(criada);
    onFechar();
    toast.success(
      `Proposta ${criada.numero} criada.`,
      'Monte o orçamento e informe prazo e validade quando fecharem.'
    );
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <div>
        <label
          htmlFor="add-prop-cliente-select"
          className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
        >
          Cliente Solicitante *
        </label>
        {clientes.length === 0 ? (
          // Sem cliente não existe proposta. Antes o combo abria vazio e o erro
          // só aparecia ao tentar salvar.
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-2xs text-amber-800 leading-relaxed">
              Nenhum cliente cadastrado. Cadastre o cliente na aba <strong>Clientes</strong> antes de
              abrir a proposta.
            </p>
          </div>
        ) : (
          <select
            id="add-prop-cliente-select"
            required
            disabled={salvando}
            value={clienteEfetivo}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full border border-slate-200 rounded p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Descrição Técnico / Escopo da Obra *
        </label>
        <textarea
          id="add-prop-desc"
          required
          disabled={salvando}
          placeholder="Ex: Execução de drywall acústico, fiação de 220V e pintura geral"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          className="w-full border border-slate-200 rounded p-2 text-xs focus:border-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <p className="text-2xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5 leading-relaxed">
        Valor, BDI, prazo e validade são definidos depois, quando o orçamento fechar — pelo botão{' '}
        <strong className="text-slate-700">Editar</strong> no painel da proposta.
      </p>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
        >
          Cancelar
        </button>
        <button
          id="submit-add-proposta-btn"
          type="submit"
          disabled={salvando || clientes.length === 0}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Criando...</span>
            </>
          ) : (
            <>
              <FileText size={14} />
              <span>Salvar Proposta</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
