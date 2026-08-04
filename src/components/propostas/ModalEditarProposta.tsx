import React, { useState } from 'react';
import { Cliente, Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Input, Modal, Select, Textarea } from '../ui';

/** O que a edição do cabeçalho comercial pode mudar. */
export type EdicaoProposta = {
  clienteId: string;
  descricao: string;
  valorManual: number;
  bdiPercentual: number;
  prazoExecucaoDias?: number;
  dataValidade: string;
};

interface Props {
  /**
   * A proposta a editar, ou `null` com o diálogo fechado.
   *
   * É a proposta ALVO, não a selecionada: a duplicação abre a edição no mesmo
   * tique em que seleciona a cópia, e ler a seleção ali pegaria a proposta de
   * origem — o formulário editaria a errada.
   */
  proposta: Proposta | null;
  onFechar: () => void;
  clientes: Cliente[];
  /** Com itens, quem manda em `valor_estimado` é o banco. */
  temItens: boolean;
  onSalvar: (id: string, patch: EdicaoProposta) => Promise<boolean>;
}

export default function ModalEditarProposta({ proposta, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="edit-proposta-modal"
      open={!!proposta}
      onClose={onFechar}
      title="Editar proposta"
      description={proposta?.numero}
      size="md"
      bloqueado={salvando}
    >
      {proposta && (
        <Formulario
          {...resto}
          proposta={proposta}
          salvando={salvando}
          setSalvando={setSalvando}
          onFechar={onFechar}
        />
      )}
    </Modal>
  );
}

function Formulario({
  proposta,
  clientes,
  temItens,
  onSalvar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'proposta'> & {
  proposta: Proposta;
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [clienteId, setClienteId] = useState(proposta.clienteId);
  const [descricao, setDescricao] = useState(proposta.descricao);
  const [valor, setValor] = useState(String(proposta.valorManual ?? 0));
  const [bdi, setBdi] = useState(String(proposta.bdiPercentual ?? 0));
  const [prazoDias, setPrazoDias] = useState(
    proposta.prazoExecucaoDias ? String(proposta.prazoExecucaoDias) : ''
  );
  const [validade, setValidade] = useState(proposta.dataValidade || '');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !descricao.trim()) {
      toast.error('Cliente e descrição do escopo são obrigatórios.');
      return;
    }

    const dias = prazoDias.trim() ? parseInt(prazoDias, 10) : undefined;
    // O banco tem check de prazo > 0; barrar aqui explica o motivo em vez de
    // devolver a mensagem crua da constraint.
    if (dias !== undefined && (isNaN(dias) || dias <= 0)) {
      toast.error('Prazo inválido.', 'Informe o número de dias corridos, maior que zero.');
      return;
    }
    const valorNumero = valor.trim() ? parseFloat(valor) : 0;
    if (isNaN(valorNumero) || valorNumero < 0) {
      toast.error('Valor inválido.', 'Informe um número maior ou igual a zero.');
      return;
    }
    const bdiNumero = bdi.trim() ? parseFloat(bdi) : 0;
    if (isNaN(bdiNumero) || bdiNumero < -100 || bdiNumero > 1000) {
      toast.error('BDI inválido.', 'Informe um percentual entre -100 e 1000.');
      return;
    }

    setSalvando(true);
    const ok = await onSalvar(proposta.id, {
      clienteId,
      descricao: descricao.trim(),
      valorManual: valorNumero,
      bdiPercentual: bdiNumero,
      prazoExecucaoDias: dias,
      dataValidade: validade,
    });
    setSalvando(false);
    if (!ok) return;

    onFechar();
    toast.success(
      'Proposta atualizada.',
      temItens
        ? 'O valor continua vindo do orçamento; o valor digitado ficou guardado.'
        : 'Os novos dados já valem para o documento.'
    );
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto">
      <div>
        <label
          htmlFor="edit-prop-cliente"
          className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
        >
          Cliente Solicitante *
        </label>
        <Select
          id="edit-prop-cliente"
          required
          disabled={salvando}
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
        >
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label
          htmlFor="edit-prop-desc"
          className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
        >
          Descrição Técnica / Escopo *
        </label>
        <Textarea
          id="edit-prop-desc"
          required
          disabled={salvando}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="edit-prop-valor"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Valor Digitado (R$)
          </label>
          <Input
            id="edit-prop-valor"
            type="number"
            step="0.01"
            min="0"
            disabled={salvando || temItens}
            value={valor}
            onChange={(e) => setValor(e.target.value)} mono className="disabled:bg-slate-100"
          />
          {/* Com itens, quem manda em valor_estimado é o banco. Deixar o campo
              editável aqui daria a impressão de que o número digitado
              prevaleceria — e ele seria ignorado. */}
          <p className="text-2xs text-slate-500 mt-1 leading-tight">
            {temItens
              ? 'Bloqueado: o valor vem do orçamento montado. Remova os itens para voltar a digitá-lo.'
              : 'Vale enquanto a proposta não tiver itens de orçamento.'}
          </p>
        </div>
        <div>
          <label
            htmlFor="edit-prop-bdi"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            BDI (%)
          </label>
          <Input
            id="edit-prop-bdi"
            type="number"
            step="any"
            disabled={salvando}
            placeholder="Ex: 25"
            value={bdi}
            onChange={(e) => setBdi(e.target.value)} mono
          />
          <p className="text-2xs text-slate-500 mt-1 leading-tight">
            Aplicado sobre a soma dos itens.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="edit-prop-prazo"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Prazo de Execução
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              id="edit-prop-prazo"
              type="number"
              min="1"
              step="1"
              disabled={salvando}
              placeholder="Ex: 90"
              value={prazoDias}
              onChange={(e) => setPrazoDias(e.target.value)} mono
            />
            <span className="text-xs font-semibold text-slate-500 shrink-0">dias</span>
          </div>
          <p className="text-2xs text-slate-500 mt-1 leading-tight">
            Dias corridos. Deixe vazio enquanto não estiver definido.
          </p>
        </div>
        <div>
          <label
            htmlFor="edit-prop-validade"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Validade da Proposta
          </label>
          <Input
            id="edit-prop-validade"
            type="date"
            disabled={salvando}
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
          />
          <p className="text-2xs text-slate-500 mt-1 leading-tight">
            Até quando os preços valem para o cliente.
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
        >
          Cancelar
        </button>
        <Button
          id="submit-edit-proposta-btn"
          type="submit"
          disabled={salvando}
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Salvando...</span>
            </>
          ) : (
            <span>Salvar alterações</span>
          )}
        </Button>
      </div>
    </form>
  );
}
