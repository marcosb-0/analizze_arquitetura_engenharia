import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Cliente, EdicaoObra, Funcionario, Projeto } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  projeto: Projeto;
  clientes: Cliente[];
  funcionarios: Funcionario[];
  onSalvar: (id: string, patch: EdicaoObra) => Promise<boolean>;
}

export default function ModalEditarObra({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="editar-obra-modal"
      open={aberto}
      onClose={onFechar}
      title="Editar Obra"
      description="A situação da obra muda pelo seletor do cabeçalho."
      size="md"
      bloqueado={salvando}
    >
      {/* Os campos nascem do `projeto` a cada abertura — reabrir depois de
          cancelar não traz os valores digitados da vez anterior (§3.6). */}
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({
  projeto,
  clientes,
  funcionarios,
  onSalvar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [nome, setNome] = useState(projeto.nome);
  const [clienteId, setClienteId] = useState(projeto.clienteId);
  const [responsavelId, setResponsavelId] = useState(projeto.responsavelInternoId ?? '');
  const [endereco, setEndereco] = useState(projeto.enderecoObra);
  const [inicio, setInicio] = useState(projeto.dataInicio);
  const [fim, setFim] = useState(projeto.dataFim);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !clienteId || !inicio || !fim) {
      toast.error('Preencha nome, cliente, início e previsão de entrega.');
      return;
    }
    if (fim < inicio) {
      toast.error('A previsão de entrega não pode ser anterior ao início.');
      return;
    }
    setSalvando(true);
    const ok = await onSalvar(projeto.id, {
      nome: nome.trim(),
      clienteId,
      responsavelInternoId: responsavelId,
      enderecoObra: endereco.trim(),
      dataInicio: inicio,
      dataFim: fim,
    });
    setSalvando(false);
    if (!ok) return;
    onFechar();
    toast.success('Dados da obra atualizados.');
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Nome da Obra *
        </label>
        <input
          id="edit-obra-nome"
          type="text"
          required
          disabled={salvando}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Cliente *
        </label>
        <select
          id="edit-obra-cliente"
          required
          disabled={salvando}
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Gerente de Obra
        </label>
        <select
          id="edit-obra-responsavel"
          disabled={salvando}
          value={responsavelId}
          onChange={(e) => setResponsavelId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
        >
          <option value="">A definir</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.cargo})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Endereço do Canteiro
        </label>
        <input
          id="edit-obra-endereco"
          type="text"
          disabled={salvando}
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Início *
          </label>
          <input
            id="edit-obra-inicio"
            type="date"
            required
            disabled={salvando}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Previsão de Entrega *
          </label>
          <input
            id="edit-obra-fim"
            type="date"
            required
            disabled={salvando}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
      </div>

      <p className="text-2xs text-slate-400 leading-relaxed">
        Mudar o prazo da obra não move as etapas do cronograma — elas têm datas próprias e são
        editadas na aba Cronograma.
      </p>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          id="submit-editar-obra-btn"
          type="submit"
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Pencil size={14} />
              <span>Salvar Alterações</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
