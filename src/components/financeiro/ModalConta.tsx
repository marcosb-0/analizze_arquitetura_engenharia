import React, { useState } from 'react';
import { ContaFinanceira } from '../../types';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useFeedback } from '../FeedbackContext';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEhNumero, vazio } from '../../lib/validacao';

interface ModalContaProps {
  open: boolean;
  /** Conta em edição; `null` = o diálogo está criando. */
  conta: ContaFinanceira | null;
  onClose: () => void;
  onAddConta: (conta: ContaFinanceira) => Promise<boolean>;
  onUpdateConta: (id: string, patch: Partial<ContaFinanceira>) => Promise<boolean>;
}

/**
 * O corpo do `Modal` só é montado enquanto ele está aberto, então o estado
 * nasce da conta recebida a cada abertura — sem helper de limpeza e sem risco
 * de um ponto de abertura esquecer de zerar os campos.
 */
export default function ModalConta({ open, conta, onClose, onAddConta, onUpdateConta }: ModalContaProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={conta ? `Editar conta — ${conta.nome}` : 'Vincular Nova Conta Financeira'}
      size="md"
    >
      <FormularioConta conta={conta} onClose={onClose} onAddConta={onAddConta} onUpdateConta={onUpdateConta} />
    </Modal>
  );
}

function FormularioConta({
  conta,
  onClose,
  onAddConta,
  onUpdateConta,
}: Omit<ModalContaProps, 'open'>) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'nome' | 'banco' | 'saldo'>();
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [banco, setBanco] = useState(conta?.banco ?? '');
  const [tipo, setTipo] = useState<'Corrente' | 'Poupança' | 'Caixa Interno'>(conta?.tipo ?? 'Corrente');
  const [saldo, setSaldo] = useState(conta ? String(conta.saldoInicial) : '');

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'nome', invalido: vazio(nome), erro: 'Dê um nome à conta.' },
        { campo: 'banco', invalido: vazio(banco), erro: 'Informe a instituição.' },
        { campo: 'saldo', invalido: vazio(saldo), erro: 'Informe o saldo inicial.' },
        { campo: 'saldo', invalido: naoEhNumero(saldo), erro: 'O saldo precisa ser um número (use ponto decimal).' },
      ])
    ) return;
    const saldoInicial = parseFloat(saldo);

    if (conta) {
      if (!(await onUpdateConta(conta.id, { nome, banco, tipo, saldoInicial }))) return;
      onClose();
      toast.success('Conta financeira atualizada.');
      return;
    }

    // O modal só fecha se o banco aceitou — senão o usuário perderia o que
    // digitou junto com o registro que não existiu.
    const nova: ContaFinanceira = {
      id: crypto.randomUUID(),
      nome,
      banco,
      tipo,
      saldoInicial,
      saldoAtual: saldoInicial,
      ativa: true,
    };
    if (!(await onAddConta(nova))) return;

    onClose();
    toast.success('Conta financeira registrada com sucesso.');
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={salvar} className="p-5 space-y-4 overflow-y-auto">
      <Field label="Nome Identificador da Conta" erro={erros.nome} required>
        {(props) => (
          <Input
            {...props}
            type="text"
            placeholder="Ex: Conta Caixa PJ, Fundo Reserva..."
            value={nome}
            onChange={(e) => { setNome(e.target.value); limparErro('nome'); }} fundo="suave"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Instituição / Banco" erro={erros.banco} required>
          {(props) => (
            <Input
              {...props}
              type="text"
              placeholder="Ex: Banco do Brasil, Itaú..."
              value={banco}
              onChange={(e) => { setBanco(e.target.value); limparErro('banco'); }} fundo="suave"
            />
          )}
        </Field>

        <Field label="Tipo de Caixa">
          {(props) => (
            <Select
              {...props}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as ContaFinanceira['tipo'])} fundo="suave" className="font-medium"
            >
              <option value="Corrente">Conta Corrente</option>
              <option value="Poupança">Conta Poupança</option>
              <option value="Caixa Interno">Caixa Interno (Caixinha)</option>
            </Select>
          )}
        </Field>
      </div>

      <Field label="Saldo Inicial de Implantação (R$)" erro={erros.saldo} required>
        {(props) => (
          <Input
            {...props}
            type="number"
            step="any"
            placeholder="0.00"
            value={saldo}
            onChange={(e) => { setSaldo(e.target.value); limparErro('saldo'); }} mono fundo="suave" className="font-bold"
          />
        )}
      </Field>

      <Button
        type="submit" bloco className="mt-2"
      >
        {conta ? 'Salvar Alterações' : 'Vincular Conta Bancária'}
      </Button>
    </form>
  );
}
