import React, { useState } from 'react';
import { Cliente, Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Input, Modal, Select, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { foraDaFaixa, naoEscolhido, vazio } from '../../lib/validacao';

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
  const { erros, validar, limparErro, areaRef } = useValidacao<'cliente' | 'descricao' | 'valor' | 'bdi' | 'prazo'>();
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
    const dias = prazoDias.trim() ? parseInt(prazoDias, 10) : undefined;
    const valorNumero = valor.trim() ? parseFloat(valor) : 0;
    const bdiNumero = bdi.trim() ? parseFloat(bdi) : 0;

    if (
      !validar([
        { campo: 'cliente', invalido: naoEscolhido(clienteId), erro: 'Escolha o cliente solicitante.' },
        { campo: 'descricao', invalido: vazio(descricao), erro: 'Descreva o escopo da proposta.' },
        {
          campo: 'valor',
          invalido: Number.isNaN(valorNumero) || valorNumero < 0,
          erro: 'Informe um número maior ou igual a zero.',
        },
        {
          campo: 'bdi',
          invalido: Number.isNaN(bdiNumero) || foraDaFaixa(String(bdiNumero), -100, 1000),
          erro: 'Informe um percentual entre -100 e 1000.',
        },
        // O banco tem check de prazo > 0; barrar aqui explica o motivo em vez de
        // devolver a mensagem crua da constraint.
        {
          campo: 'prazo',
          invalido: dias !== undefined && (Number.isNaN(dias) || dias <= 0),
          erro: 'Informe o número de dias corridos, maior que zero.',
        },
      ])
    ) return;

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
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto">
      <Field id="edit-prop-cliente" label="Cliente Solicitante" erro={erros.cliente} required>
        {(props) => (
          <Select
            {...props}
            disabled={salvando}
            value={clienteId}
            onChange={(e) => { setClienteId(e.target.value); limparErro('cliente'); }}
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="edit-prop-desc" label="Descrição Técnica / Escopo" erro={erros.descricao} required>
        {(props) => (
          <Textarea
            {...props}
            disabled={salvando}
            value={descricao}
            onChange={(e) => { setDescricao(e.target.value); limparErro('descricao'); }}
            rows={3}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {/* Com itens, quem manda em valor_estimado é o banco. Deixar o campo
            editável aqui daria a impressão de que o número digitado
            prevaleceria — e ele seria ignorado. */}
        <Field
          id="edit-prop-valor"
          label="Valor Digitado (R$)"
          erro={erros.valor}
          hint={
            temItens
              ? 'Bloqueado: o valor vem do orçamento montado. Remova os itens para voltar a digitá-lo.'
              : 'Vale enquanto a proposta não tiver itens de orçamento.'
          }
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.01"
              min="0"
              disabled={salvando || temItens}
              value={valor}
              onChange={(e) => { setValor(e.target.value); limparErro('valor'); }} mono className="disabled:bg-slate-100"
            />
          )}
        </Field>
        <Field id="edit-prop-bdi" label="BDI (%)" erro={erros.bdi} hint="Aplicado sobre a soma dos itens.">
          {(props) => (
            <Input
              {...props}
              type="number"
              step="any"
              disabled={salvando}
              placeholder="Ex: 25"
              value={bdi}
              onChange={(e) => { setBdi(e.target.value); limparErro('bdi'); }} mono
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="edit-prop-prazo"
          label="Prazo de Execução"
          erro={erros.prazo}
          hint="Dias corridos. Deixe vazio enquanto não estiver definido."
        >
          {(props) => (
            <div className="flex items-center gap-1.5">
              <Input
                {...props}
                type="number"
                min="1"
                step="1"
                disabled={salvando}
                placeholder="Ex: 90"
                value={prazoDias}
                onChange={(e) => { setPrazoDias(e.target.value); limparErro('prazo'); }} mono
              />
              <span className="text-xs font-semibold text-slate-500 shrink-0">dias</span>
            </div>
          )}
        </Field>
        <Field
          id="edit-prop-validade"
          label="Validade da Proposta"
          hint="Até quando os preços valem para o cliente."
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              disabled={salvando}
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
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
