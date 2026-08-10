import React, { useState } from 'react';
import {
  EdicaoEtapa,
  EtapaCronograma,
  Funcionario,
  InsumoProjeto,
  ModoAgendamento,
  Projeto,
} from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Input, Modal, Select } from '../ui';
import PainelHHEtapa from './PainelHHEtapa';
import PainelQuantidadeEtapa from './PainelQuantidadeEtapa';

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
  /** Para sugerir a meta quantitativa a partir do que já está amarrado à etapa. */
  insumos: InsumoProjeto[];
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
  insumos,
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
  // Texto, e não número: o campo vazio é o modo percentual, e `0`/`NaN` não
  // servem para representar "não preenchido" num input numérico controlado.
  const [quantidade, setQuantidade] = useState(
    etapa?.quantidadePrevista != null ? String(etapa.quantidadePrevista) : ''
  );
  const [unidade, setUnidade] = useState(etapa?.unidade ?? '');

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

  // Marco não tem serviço a medir (o banco recusa por check), então marcar a
  // caixa descarta a meta em vez de guardá-la escondida para explodir no save.
  const qtdTexto = ehMarco ? '' : quantidade.trim();
  const unTexto = ehMarco ? '' : unidade.trim();
  const qtdNumero = Number(qtdTexto.replace(',', '.'));
  const temMeta = qtdTexto !== '' || unTexto !== '';

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
    // Espelha `etapas_cronograma_quantidade_pareada`. Validar aqui e não só no
    // banco pelo mesmo motivo de `etapasComExecucao`: a recusa do servidor
    // chegaria depois de a pessoa ter preenchido o formulário inteiro.
    if (temMeta && (qtdTexto === '' || unTexto === '')) {
      toast.error(
        'Quantidade e unidade andam juntas.',
        'Informe as duas para medir por unidade, ou apague as duas para medir em percentual.'
      );
      return;
    }
    if (temMeta && (!Number.isFinite(qtdNumero) || qtdNumero <= 0)) {
      toast.error('A quantidade prevista da etapa precisa ser maior que zero.');
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
          // `null` LIMPA a meta e devolve a etapa ao modo percentual — é o que
          // acontece quando a pessoa apaga os dois campos. `undefined` seria
          // "não mexer", e a meta ficaria lá.
          quantidadePrevista: temMeta ? qtdNumero : null,
          unidade: temMeta ? unTexto : null,
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
          quantidadePrevista: temMeta ? qtdNumero : undefined,
          unidade: temMeta ? unTexto : undefined,
          // Derivados no banco (progresso, árvore, ordem); entram aqui só para
          // satisfazer o tipo — `useCronograma` relê a view logo em seguida.
          percentualExecutado: 0,
          quantidadeExecutada: 0,
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

      {/* A meta quantitativa: o que transforma "medi 1%" em "executei 2 m²".
          Opcional de propósito — "Mobilização" e "Administração da obra" não
          têm unidade, e forçar um "1 vb" artificial seria pior que medir em
          percentual. Marco não entra: é um instante, não um serviço. */}
      {!ehMarco && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <div>
              <label
                htmlFor="etapa-quantidade-input"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
              >
                Quantidade prevista
              </label>
              <Input
                id="etapa-quantidade-input"
                type="number"
                min="0.001"
                step="any"
                disabled={salvando}
                placeholder="Ex: 200"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="etapa-unidade-input"
                className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1"
              >
                Unidade
              </label>
              <Input
                id="etapa-unidade-input"
                type="text"
                maxLength={20}
                disabled={salvando}
                placeholder="m²"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              />
            </div>
          </div>
          <p className="text-2xs text-slate-500 leading-relaxed">
            Com a meta preenchida, os boletins desta etapa são lançados na unidade dela e o
            percentual sai da conta. Deixe em branco para medir em percentual.
          </p>
          {/* Só na edição, como o painel de HH: etapa nova ainda não tem insumo
              amarrado, e o painel nasceria vazio em toda criação. */}
          {etapa && (
            <PainelQuantidadeEtapa
              etapaId={etapa.id}
              insumos={insumos}
              onUsar={(q, u) => {
                setQuantidade(String(q));
                setUnidade(u);
              }}
              desabilitado={salvando}
            />
          )}
        </div>
      )}

      {/* Só na edição: etapa nova ainda não tem insumo vinculado, e o painel
          nasceria dizendo "0 h" em toda criação. Sugere prazo, nunca
          sobrescreve — o CPM recalcula o caminho crítico a partir das datas. */}
      {etapa && !ehMarco && (
        <PainelHHEtapa
          etapaId={etapa.id}
          dataInicio={inicio}
          dataFim={fim}
          onAplicarPrazo={setFim}
          desabilitado={salvando}
        />
      )}

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
