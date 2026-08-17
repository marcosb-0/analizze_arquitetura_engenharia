import React, { useState } from 'react';
import type { PessoaAtribuivel, PrioridadeTarefa, Projeto, StatusTarefa, Tarefa } from '../../types';
import type { DadosTarefa } from '../../services/tarefasService';
import { Button, Field, Input, Modal, ModalForm, Select, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { vazio } from '../../lib/validacao';
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
  /**
   * O dia clicado no calendário. Sem isto, criar a partir de uma célula obriga a
   * redigitar a data que a pessoa acabou de apontar com o cursor.
   */
  prazoSugerido?: string;
  /**
   * A coluna clicada no quadro.
   *
   * Ela também FAZ APARECER o campo "Situação" na criação, que de outro modo só
   * existe na edição — e isso é deliberado: o padrão continua "nasce A fazer",
   * mas quem apertou o "+" de uma coluna específica escolheu a coluna, e o
   * formulário não pode calar sobre o que vai gravar.
   */
  statusSugerido?: StatusTarefa;
  /**
   * Quem está criando. Vira o responsável padrão da tarefa NOVA.
   *
   * Antes o campo nascia em "Sem responsável", e o efeito era uma tarefa que
   * some: `minhasDoDia` só mostra o que é seu, então quem criava pelo quadro
   * via a tarefa aparecer lá e sumir da própria lista, sem nada explicando. O
   * padrão de qualquer to-do é o contrário — a tarefa é de quem a escreveu até
   * ser delegada, e delegar continua a um clique de distância.
   *
   * Só vale na criação: na edição o dono é o que já está gravado.
   */
  meuId?: string;
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
          : 'Já nasce no seu nome. Troque o responsável para delegar, ou deixe sem dono para que fique na coluna do time.'
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

function Formulario({
  tarefa,
  pessoas,
  projetos,
  obraSugerida,
  prazoSugerido,
  statusSugerido,
  meuId,
  onClose,
  onSalvar,
}: ModalTarefaProps) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'titulo'>();
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '');
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? '');
  const [status, setStatus] = useState<StatusTarefa>(tarefa?.status ?? statusSugerido ?? 'A fazer');
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(tarefa?.prioridade ?? 'Média');
  // Na criação, eu. Na edição, quem já era — `?? ''` no fim porque o dono pode
  // ter sido removido de propósito, e ali "sem responsável" é o valor correto.
  const [responsavelId, setResponsavelId] = useState(
    tarefa ? (tarefa.responsavelId ?? '') : (meuId ?? '')
  );
  const [projetoId, setProjetoId] = useState(tarefa?.projetoId ?? obraSugerida ?? '');
  const [prazo, setPrazo] = useState(tarefa?.prazo ?? prazoSugerido ?? '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar([{ campo: 'titulo', invalido: vazio(titulo), erro: 'Descreva a tarefa em uma linha.' }])) return;

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
      ref={areaRef as React.RefObject<HTMLFormElement>}
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
      <Field label="O que precisa ser feito" erro={erros.titulo} required>
        {(p) => (
          <Input
            {...p}
            autoFocus
            maxLength={200}
            placeholder="Ex: Renovar o seguro da frota"
            value={titulo}
            onChange={(e) => { setTitulo(e.target.value); limparErro('titulo'); }}
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
        <Field
          label="Responsável"
          hint={
            responsavelId
              ? undefined
              : 'Sem dono, ela fica só no quadro — não entra na lista de tarefas de ninguém.'
          }
        >
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

        {/* Na edição sempre; na criação, só quando veio de uma coluna do
            quadro. O padrão continua "nasce A fazer": oferecer a coluna em toda
            criação convidaria a registrar tarefa já concluída. */}
        {(tarefa || statusSugerido) && (
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
