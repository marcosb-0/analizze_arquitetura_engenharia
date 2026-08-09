import React, { useState } from 'react';
import {
  EdicaoEtapa,
  EtapaCronograma,
  Funcionario,
  ModoAgendamento,
  Projeto,
} from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Input, Modal, Select } from '../ui';

/**
 * `nova` parte do prazo da obra e pode já nascer dentro de um grupo (`paiId`,
 * preenchido quando a pessoa clica em "Subetapa" na linha do grupo);
 * `edicao` carrega a etapa existente.
 */
export type AlvoEtapa =
  | { modo: 'nova'; paiId?: string }
  | { modo: 'edicao'; etapa: EtapaCronograma };

interface Props {
  alvo: AlvoEtapa | null;
  onFechar: () => void;
  projeto: Projeto;
  funcionarios: Funcionario[];
  /** A EAP inteira da obra, para o seletor de grupo. */
  etapas: EtapaCronograma[];
  /**
   * Etapas que já têm orçamento vinculado ou boletim de medição — não podem
   * virar grupo (fn_etapa_pai_sem_execucao recusaria, e a mensagem chegaria
   * depois de a pessoa preencher o formulário inteiro).
   */
  etapasComExecucao: ReadonlySet<string>;
  onCriar: (etapa: EtapaCronograma) => Promise<boolean>;
  onAtualizar: (id: string, patch: EdicaoEtapa) => Promise<boolean>;
}

export default function ModalEtapa({ alvo, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="etapa-cronograma-modal"
      open={!!alvo}
      onClose={onFechar}
      title={alvo?.modo === 'nova' ? 'Nova Etapa' : 'Editar Etapa'}
      description={
        alvo?.modo === 'nova' ? 'Uma nova frente de trabalho no cronograma.' : alvo?.etapa.nome
      }
      size="sm"
      bloqueado={salvando}
    >
      {alvo && (
        <Formulario
          {...resto}
          alvo={alvo}
          salvando={salvando}
          setSalvando={setSalvando}
          onFechar={onFechar}
        />
      )}
    </Modal>
  );
}

function Formulario({
  alvo,
  onFechar,
  projeto,
  funcionarios,
  etapas,
  etapasComExecucao,
  onCriar,
  onAtualizar,
  salvando,
  setSalvando,
}: Omit<Props, 'alvo'> & {
  alvo: AlvoEtapa;
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const etapa = alvo.modo === 'edicao' ? alvo.etapa : null;

  const [nome, setNome] = useState(etapa?.nome ?? '');
  // A etapa nova nasce dentro do prazo da obra — o caso comum é a etapa
  // esquecida no meio do cronograma.
  const [inicio, setInicio] = useState(etapa?.dataInicio ?? projeto.dataInicio);
  const [fim, setFim] = useState(etapa?.dataFim ?? projeto.dataFim);
  const [responsavel, setResponsavel] = useState(
    etapa?.responsavelId ?? projeto.responsavelInternoId ?? ''
  );
  const [ehMarco, setEhMarco] = useState(etapa?.ehMarco ?? false);
  const [paiId, setPaiId] = useState(alvo.modo === 'nova' ? (alvo.paiId ?? '') : '');
  const [agendamento, setAgendamento] = useState<ModoAgendamento>(
    etapa?.agendamento ?? 'manual'
  );

  /**
   * Grupos possíveis para uma etapa NOVA.
   *
   * Só aparece na criação, de propósito: mudar de grupo depois renumera as duas
   * listas de irmãos, e isso só pode ser gravado na mesma transação (o `unique`
   * é deferrable). Esse caminho é o arraste na grade / `Alt+←→`, que passa por
   * `cronogramaService.aplicar`. Duas portas de escrita para a mesma coisa é
   * como uma delas fica para trás.
   */
  const candidatosAGrupo = etapas.filter(
    (e) => e.nivel < 3 && !e.ehMarco && !etapasComExecucao.has(e.id)
  );

  // Marco é um instante: as duas datas são a mesma, e a de fim some do
  // formulário em vez de ficar lá desabilitada pedindo para ser entendida.
  const fimEfetivo = ehMarco ? inicio : fim;

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !inicio || !fimEfetivo) {
      toast.error('Preencha nome, início e fim da etapa.');
      return;
    }
    if (fimEfetivo < inicio) {
      toast.error('A data de fim da etapa não pode ser anterior ao início.');
      return;
    }

    setSalvando(true);
    const ok = etapa
      ? await onAtualizar(etapa.id, {
          nome: nome.trim(),
          dataInicio: inicio,
          dataFim: fimEfetivo,
          responsavelId: responsavel,
          ehMarco,
          agendamento,
        })
      : await onCriar({
          id: crypto.randomUUID(),
          projetoId: projeto.id,
          nome: nome.trim(),
          dataInicio: inicio,
          dataFim: fimEfetivo,
          responsavelId: responsavel,
          parentId: paiId,
          ehMarco,
          agendamento,
          // Derivados no banco (progresso, árvore, ordem); entram aqui só para
          // satisfazer o tipo — `useCronograma` relê a view logo em seguida.
          percentualExecutado: 0,
          status: 'Não Iniciado',
          ordem: 0,
          baselineInicio: '',
          baselineFim: '',
          baselineEm: '',
          nivel: 0,
          wbsCodigo: '',
          ehFolha: true,
          inicioEfetivo: inicio,
          fimEfetivo,
          updatedAt: '',
        });
    setSalvando(false);
    if (!ok) return;
    onFechar();
    toast.success(etapa ? 'Etapa atualizada.' : 'Etapa criada.');
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Nome da Etapa *
        </label>
        <Input
          id="etapa-nome-input"
          type="text"
          required
          disabled={salvando}
          placeholder="Ex: Impermeabilização da Laje"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>

      {alvo.modo === 'nova' && candidatosAGrupo.length > 0 && (
        <div>
          <label
            htmlFor="etapa-pai-select"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            Dentro do grupo
          </label>
          <Select
            id="etapa-pai-select"
            disabled={salvando}
            value={paiId}
            onChange={(e) => setPaiId(e.target.value)}
          >
            <option value="">Nível principal da obra</option>
            {candidatosAGrupo.map((e) => (
              <option key={e.id} value={e.id}>
                {'— '.repeat(e.nivel)}
                {e.wbsCodigo} {e.nome}
              </option>
            ))}
          </Select>
          <p className="text-2xs text-slate-500 mt-1">
            Depois de criada, mova a etapa pela grade do cronograma (arraste ou Alt+setas).
          </p>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          id="etapa-marco-check"
          type="checkbox"
          disabled={salvando}
          checked={ehMarco}
          onChange={(e) => setEhMarco(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-blue-600 cursor-pointer"
        />
        <span className="text-xs text-slate-700">
          É um marco
          <span className="block text-2xs text-slate-500">
            Data única, sem duração — entrega de projeto, liberação da prefeitura, início da
            concretagem.
          </span>
        </span>
      </label>

      {/* O interruptor entre "o cronograma manda" e "eu mando".
          Nasce manual em toda etapa (ver 20260809100000): ligar o automático de
          repente num cronograma já preenchido moveria datas que alguém digitou
          e negociou. Quem quer o reagendamento automático opta por ele. */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          id="etapa-agendamento-check"
          type="checkbox"
          disabled={salvando}
          checked={agendamento === 'automatico'}
          onChange={(e) => setAgendamento(e.target.checked ? 'automatico' : 'manual')}
          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-blue-600 cursor-pointer"
        />
        <span className="text-xs text-slate-700">
          Reagendar pelas predecessoras
          <span className="block text-2xs text-slate-500">
            Ligada, a etapa se move sozinha quando o que vem antes dela atrasa. Desligada, a data
            fica fixa e o cronograma apenas avisa quando ela não cabe mais.
          </span>
        </span>
      </label>

      <div className={ehMarco ? '' : 'grid grid-cols-2 gap-3'}>
        <div>
          <label
            htmlFor="etapa-inicio-input"
            className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
          >
            {ehMarco ? 'Data do marco *' : 'Início *'}
          </label>
          <Input
            id="etapa-inicio-input"
            type="date"
            required
            disabled={salvando}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        {!ehMarco && (
          <div>
            <label
              htmlFor="etapa-fim-input"
              className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
            >
              Fim *
            </label>
            <Input
              id="etapa-fim-input"
              type="date"
              required
              disabled={salvando}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Encarregado
        </label>
        <Select
          id="etapa-responsavel-select"
          disabled={salvando}
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
        >
          <option value="">A definir</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.cargo})
            </option>
          ))}
        </Select>
      </div>

      <p className="text-2xs text-slate-500 leading-relaxed">
        Progresso e status não são editáveis: saem das medições aprovadas desta etapa.
      </p>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-etapa-btn"
          type="submit"
          disabled={salvando}
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Salvando...</span>
            </>
          ) : (
            <span>{etapa ? 'Salvar Etapa' : 'Criar Etapa'}</span>
          )}
        </Button>
      </div>
    </form>
  );
}
