import React, { useState } from 'react';
import type { PessoaAtribuivel, PrioridadeTarefa, Projeto, StatusTarefa, Tarefa } from '../../types';
import type { DadosTarefa } from '../../services/tarefasService';
import { Button, Field, Input, Modal, ModalForm, Select, Textarea } from '../ui';
import { useFeedback } from '../FeedbackContext';
import { COLUNAS } from '../../lib/tarefas';
import { PRIORIDADES } from './constantes';

interface ModalTarefaProps {
  open: boolean;
  /** Tarefa em edição; `null` = o diálogo está criando. */
  tarefa: Tarefa | null;
  pessoas: PessoaAtribuivel[];
  projetos: Projeto[];
  /** Preenche a obra quando o filtro por obra está ativo — economiza um passo. */
  obraSugerida?: string;
  onClose: () => void;
  onSalvar: (dados: DadosTarefa) => Promise<boolean>;
}

export default function ModalTarefa(props: ModalTarefaProps) {
  const { open, tarefa, onClose } = props;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tarefa ? 'Editar tarefa' : 'Nova tarefa'}
      description={
        tarefa
          ? 'As alterações valem para quem já recebeu a tarefa.'
          : 'Sem responsável ela fica na coluna do time, visível para quem puder assumir.'
      }
      size="lg"
    >
      {/* O corpo do Modal só monta quando ele abre, então o estado do formulário
          nasce da tarefa recebida a cada abertura — sem helper de limpeza e sem
          risco de um ponto de abertura esquecer de zerar os campos. */}
      <Formulario {...props} />
    </Modal>
  );
}

function Formulario({ tarefa, pessoas, projetos, obraSugerida, onClose, onSalvar }: ModalTarefaProps) {
  const { toast } = useFeedback();
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '');
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? '');
  const [status, setStatus] = useState<StatusTarefa>(tarefa?.status ?? 'A fazer');
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(tarefa?.prioridade ?? 'Média');
  const [responsavelId, setResponsavelId] = useState(tarefa?.responsavelId ?? '');
  const [projetoId, setProjetoId] = useState(tarefa?.projetoId ?? obraSugerida ?? '');
  const [prazo, setPrazo] = useState(tarefa?.prazo ?? '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error('Descreva a tarefa em uma linha.');
      return;
    }

    setSalvando(true);
    // O diálogo só fecha se o servidor aceitou — senão a pessoa perderia o que
    // digitou junto com o registro que não chegou a existir.
    const ok = await onSalvar({
      titulo,
      descricao,
      status,
      prioridade,
      responsavelId: responsavelId || undefined,
      projetoId: projetoId || undefined,
      prazo: prazo || undefined,
    });
    setSalvando(false);
    if (!ok) return;

    onClose();
    toast.success(tarefa ? 'Tarefa atualizada.' : 'Tarefa criada.');
  };

  return (
    <ModalForm
      onSubmit={salvar}
      className="space-y-3"
      footer={
        <>
          <Button variante="secundario" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" carregando={salvando}>
            {tarefa ? 'Salvar alterações' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      <Field label="O que precisa ser feito" required>
        {(p) => (
          <Input
            {...p}
            autoFocus
            maxLength={200}
            placeholder="Ex: Renovar o seguro da frota"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            fundo="suave"
          />
        )}
      </Field>

      <Field label="Detalhes" hint="Opcional — o combinado, o número do protocolo, o contato.">
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            fundo="suave"
          />
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsável" hint={responsavelId ? undefined : 'Ninguém é avisado enquanto estiver sem dono.'}>
          {(p) => (
            <Select {...p} value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} fundo="suave">
              <option value="">Sem responsável</option>
              {pessoas.map((pessoa) => (
                <option key={pessoa.id} value={pessoa.id}>
                  {pessoa.nome}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Prazo" hint="Opcional. Sem prazo, a tarefa fica no fim da pauta.">
          {(p) => (
            <Input
              {...p}
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              fundo="suave"
            />
          )}
        </Field>

        <Field label="Obra" hint="Deixe em branco se for da empresa.">
          {(p) => (
            <Select {...p} value={projetoId} onChange={(e) => setProjetoId(e.target.value)} fundo="suave">
              <option value="">Empresa (sem obra)</option>
              {projetos.map((obra) => (
                <option key={obra.id} value={obra.id}>
                  {obra.nome}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Prioridade">
          {(p) => (
            <Select
              {...p}
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
              fundo="suave"
            >
              {PRIORIDADES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Só na edição: uma tarefa nova nasce "A fazer", e oferecer a coluna na
            criação convida a criar tarefa já concluída. */}
        {tarefa && (
          <Field label="Situação" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as StatusTarefa)} fundo="suave">
                {COLUNAS.map((coluna) => (
                  <option key={coluna} value={coluna}>
                    {coluna}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </ModalForm>
  );
}
