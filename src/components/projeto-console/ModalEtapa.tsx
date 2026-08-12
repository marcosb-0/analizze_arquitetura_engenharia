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
import { Button, Field, Input, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { fimAntesDoInicio, vazio } from '../../lib/validacao';
import PainelHHEtapa from './PainelHHEtapa';
import PainelQuantidadeEtapa from './PainelQuantidadeEtapa';

/**
 * As duas coisas que uma linha da EAP pode ser.
 *
 * A distinção não existe no banco — lá, grupo é simplesmente uma etapa que TEM
 * filhas (`eh_folha` é derivado). Ela existe aqui porque os dois formulários
 * são quase disjuntos: grupo não tem prazo (a view rola as datas das frentes
 * por cima), não tem encarregado, não recebe medição e não pode ter meta
 * própria (`fn_etapa_meta_quantitativa`). Mostrar esses campos num grupo é
 * oferecer cinco controles que o servidor ignora ou recusa.
 */
export type TipoEtapa = 'grupo' | 'atividade';

/**
 * `nova` parte do prazo da obra e pode já nascer dentro de um grupo (`paiId`,
 * preenchido quando a pessoa clica em "+" na linha do grupo); `edicao` carrega
 * a etapa existente.
 *
 * `ehGrupo` na edição vem de a etapa TER filhas hoje, e não de como ela foi
 * criada: um grupo esvaziado volta a ser uma frente comum, e o formulário
 * acompanha.
 */
export type AlvoEtapa =
  | { modo: 'nova'; tipo: TipoEtapa; paiId?: string }
  | { modo: 'edicao'; etapa: EtapaCronograma; ehGrupo: boolean };

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

/** Título e subtítulo saem do que o formulário de fato vai pedir. */
function cabecalho(alvo: AlvoEtapa | null): { titulo: string; descricao?: string } {
  if (!alvo) return { titulo: 'Etapa' };
  if (alvo.modo === 'edicao') {
    return {
      titulo: alvo.ehGrupo ? 'Editar Grupo' : 'Editar Etapa',
      descricao: alvo.etapa.nome,
    };
  }
  return alvo.tipo === 'grupo'
    ? {
        titulo: 'Novo Grupo',
        descricao: 'Uma pasta da EAP. O prazo e o progresso saem das frentes que entrarem nela.',
      }
    : { titulo: 'Nova Atividade', descricao: 'Uma frente de trabalho com prazo e medição.' };
}

export default function ModalEtapa({ alvo, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  const { titulo, descricao } = cabecalho(alvo);
  return (
    <Modal
      id="etapa-cronograma-modal"
      open={!!alvo}
      onClose={onFechar}
      title={titulo}
      description={descricao}
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
  const { erros, validar, limparErro, areaRef } = useValidacao<'nome' | 'inicio' | 'fim' | 'quantidade' | 'unidade'>();
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
   * O formulário reduzido: só nome e onde a linha entra.
   *
   * Vale para o grupo NOVO e para a edição de um grupo que já tem filhas — nos
   * dois casos prazo, encarregado, marco e meta não têm efeito, e três deles o
   * banco recusaria.
   */
  const soGrupo = alvo.modo === 'nova' ? alvo.tipo === 'grupo' : alvo.ehGrupo;

  /**
   * Grupos possíveis para uma etapa NOVA.
   *
   * Só aparece na criação, de propósito: mudar de grupo depois renumera as duas
   * listas de irmãos, e isso só pode ser gravado na mesma transação (o `unique`
   * é deferrable). Esse caminho é o arraste na grade / `Alt+←→`, que passa por
   * `cronogramaService.aplicar`. Duas portas de escrita para a mesma coisa é
   * como uma delas fica para trás.
   *
   * `quantidadePrevista` entra no filtro pelo mesmo motivo que `etapasComExecucao`:
   * `fn_etapa_pai_sem_execucao` recusa virar grupo quem tem meta própria, e a
   * recusa chegaria depois do formulário preenchido.
   */
  const candidatosAGrupo = etapas.filter(
    (e) =>
      e.nivel < 3 && !e.ehMarco && !etapasComExecucao.has(e.id) && e.quantidadePrevista == null
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
    // O grupo valida só o nome — ele não tem datas nem meta (ver abaixo).
    if (soGrupo && !validar([{ campo: 'nome', invalido: vazio(nome), erro: 'Dê um nome ao grupo.' }])) return;

    /**
     * O grupo é gravado com o mínimo, e o mínimo é intencional.
     *
     * Na CRIAÇÃO as datas vão nulas: `v_etapas_cronograma` rola `inicio_efetivo`
     * e `fim_efetivo` dos descendentes, então qualquer data digitada aqui seria
     * ignorada no instante em que a primeira frente entrasse — um campo que
     * mente. Na EDIÇÃO só o nome viaja: mandar `dataInicio: ''` apagaria as
     * datas que a etapa tinha antes de virar grupo, e elas voltam a valer se
     * ela for esvaziada.
     */
    if (soGrupo) {
      setSalvando(true);
      const salvo = etapa
        ? await onAtualizar(etapa.id, { nome: nome.trim() })
        : await onCriar({
            id: crypto.randomUUID(),
            projetoId: projeto.id,
            nome: nome.trim(),
            dataInicio: '',
            dataFim: '',
            responsavelId: '',
            parentId: paiId,
            ehMarco: false,
            agendamento: 'manual',
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
            inicioEfetivo: '',
            fimEfetivo: '',
            updatedAt: '',
          });
      setSalvando(false);
      if (!salvo) return;
      onFechar();
      toast.success(
        etapa ? 'Grupo atualizado.' : 'Grupo criado.',
        etapa ? undefined : 'Arraste as frentes para dentro dele, ou use o "+" na linha do grupo.'
      );
      return;
    }

    if (
      !validar([
        { campo: 'nome', invalido: vazio(nome), erro: 'Dê um nome à etapa.' },
        { campo: 'inicio', invalido: vazio(inicio), erro: ehMarco ? 'Informe a data do marco.' : 'Informe a data de início.' },
        { campo: 'fim', invalido: vazio(fimEfetivo), erro: 'Informe a data de fim.' },
        { campo: 'fim', invalido: fimAntesDoInicio(inicio, fimEfetivo), erro: 'O fim não pode ser anterior ao início.' },
        // Espelha `etapas_cronograma_quantidade_pareada`. Validar aqui e não só
        // no banco pelo mesmo motivo de `etapasComExecucao`: a recusa do
        // servidor chegaria depois de a pessoa ter preenchido tudo.
        {
          campo: 'quantidade',
          invalido: temMeta && qtdTexto === '',
          erro: 'Quantidade e unidade andam juntas — informe as duas, ou apague as duas para medir em percentual.',
        },
        {
          campo: 'quantidade',
          invalido: temMeta && qtdTexto !== '' && (!Number.isFinite(qtdNumero) || qtdNumero <= 0),
          erro: 'A quantidade prevista precisa ser maior que zero.',
        },
        {
          campo: 'unidade',
          invalido: temMeta && unTexto === '',
          erro: 'Informe a unidade, ou apague a quantidade para medir em percentual.',
        },
      ])
    ) return;

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
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <Field id="etapa-nome-input" label={soGrupo ? 'Nome do Grupo' : 'Nome da Etapa'} erro={erros.nome} required>
        {(props) => (
          <Input
            {...props}
            type="text"
            disabled={salvando}
            placeholder={soGrupo ? 'Ex: Fundação' : 'Ex: Impermeabilização da Laje'}
            value={nome}
            onChange={(e) => { setNome(e.target.value); limparErro('nome'); }}
          />
        )}
      </Field>

      {alvo.modo === 'nova' && candidatosAGrupo.length > 0 && (
        <Field id="etapa-pai-select" label="Dentro do grupo" hint="Depois de criada, mova a etapa pela grade do cronograma (arraste ou Alt+setas).">
          {(props) => (
            <Select
              {...props}
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
          )}
        </Field>
      )}

      {/* Tudo daqui até o encarregado é da ATIVIDADE. No grupo, nenhum destes
          campos tem efeito: as datas são roladas das frentes, a responsabilidade
          mora na frente, marco é o oposto de grupo, e a meta o banco recusa
          (fn_etapa_meta_quantitativa). Some, em vez de ficar desabilitado
          pedindo para ser entendido — a mesma escolha da data de fim do marco. */}
      {soGrupo ? (
        <p className="text-2xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
          Grupo é uma pasta da EAP: o prazo, o progresso e o custo dele são a soma das frentes que
          estiverem dentro. Por isso ele não tem data, encarregado nem meta próprios — quem tem são
          as atividades.
        </p>
      ) : (
        <>
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
            <Field id="etapa-inicio-input" label={ehMarco ? 'Data do marco' : 'Início'} erro={erros.inicio} required>
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
            {!ehMarco && (
              <Field id="etapa-fim-input" label="Fim" erro={erros.fim} required>
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
            )}
          </div>

          {/* A meta quantitativa: o que transforma "medi 1%" em "executei 2 m²".
              Opcional de propósito — "Mobilização" e "Administração da obra" não
              têm unidade, e forçar um "1 vb" artificial seria pior que medir em
              percentual. Marco não entra: é um instante, não um serviço. */}
          {!ehMarco && (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <Field id="etapa-quantidade-input" label="Quantidade prevista" erro={erros.quantidade}>
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min="0.001"
                      step="any"
                      disabled={salvando}
                      placeholder="Ex: 200"
                      value={quantidade}
                      onChange={(e) => { setQuantidade(e.target.value); limparErro('quantidade'); }}
                    />
                  )}
                </Field>
                <Field id="etapa-unidade-input" label="Unidade" erro={erros.unidade}>
                  {(props) => (
                    <Input
                      {...props}
                      type="text"
                      maxLength={20}
                      disabled={salvando}
                      placeholder="m²"
                      value={unidade}
                      onChange={(e) => { setUnidade(e.target.value); limparErro('unidade'); }}
                    />
                  )}
                </Field>
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

          <Field id="etapa-responsavel-select" label="Encarregado">
            {(props) => (
              <Select
                {...props}
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
            )}
          </Field>

          <p className="text-2xs text-slate-500 leading-relaxed">
            Progresso e status não são editáveis: saem das medições aprovadas desta etapa.
          </p>
        </>
      )}

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
            <span>
              {etapa ? 'Salvar' : soGrupo ? 'Criar Grupo' : 'Criar Etapa'}
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}
