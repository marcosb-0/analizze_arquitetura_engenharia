import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Cliente, EdicaoObra, Funcionario, Projeto } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { fimAntesDoInicio, naoEscolhido, vazio } from '../../lib/validacao';

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
  const { erros, validar, limparErro, areaRef } = useValidacao<'nome' | 'cliente' | 'inicio' | 'fim'>();
  const [nome, setNome] = useState(projeto.nome);
  const [clienteId, setClienteId] = useState(projeto.clienteId);
  const [responsavelId, setResponsavelId] = useState(projeto.responsavelInternoId ?? '');
  const [endereco, setEndereco] = useState(projeto.enderecoObra);
  const [inicio, setInicio] = useState(projeto.dataInicio);
  const [fim, setFim] = useState(projeto.dataFim);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'nome', invalido: vazio(nome), erro: 'Informe o nome da obra.' },
        { campo: 'cliente', invalido: naoEscolhido(clienteId), erro: 'Escolha o cliente da obra.' },
        { campo: 'inicio', invalido: vazio(inicio), erro: 'Informe a data de início.' },
        { campo: 'fim', invalido: vazio(fim), erro: 'Informe a previsão de entrega.' },
        { campo: 'fim', invalido: fimAntesDoInicio(inicio, fim), erro: 'A entrega não pode ser anterior ao início.' },
      ])
    ) return;
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
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <Field id="edit-obra-nome" label="Nome da Obra" erro={erros.nome} required>
        {(props) => (
          <Input
            {...props}
            type="text"
            disabled={salvando}
            value={nome}
            onChange={(e) => { setNome(e.target.value); limparErro('nome'); }}
          />
        )}
      </Field>

      <Field id="edit-obra-cliente" label="Cliente" erro={erros.cliente} required>
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

      <Field id="edit-obra-responsavel" label="Gerente de Obra">
        {(props) => (
          <Select
            {...props}
            disabled={salvando}
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
          >
            <option value="">A definir</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} ({f.cargo})
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="edit-obra-endereco" label="Endereço do Canteiro">
        {(props) => (
          <Input
            {...props}
            type="text"
            disabled={salvando}
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="edit-obra-inicio" label="Início" erro={erros.inicio} required>
          {(props) => (
            <Input
              {...props}
              type="date"
              disabled={salvando}
              value={inicio}
              onChange={(e) => { setInicio(e.target.value); limparErro('inicio'); }}
            />
          )}
        </Field>
        <Field id="edit-obra-fim" label="Previsão de Entrega" erro={erros.fim} required>
          {(props) => (
            <Input
              {...props}
              type="date"
              disabled={salvando}
              value={fim}
              onChange={(e) => { setFim(e.target.value); limparErro('fim'); }}
            />
          )}
        </Field>
      </div>

      <p className="text-2xs text-slate-500 leading-relaxed">
        Mudar o prazo da obra não move as etapas do cronograma — elas têm datas próprias e são
        editadas na aba Cronograma.
      </p>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-editar-obra-btn"
          type="submit"
          disabled={salvando}
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
        </Button>
      </div>
    </form>
  );
}
