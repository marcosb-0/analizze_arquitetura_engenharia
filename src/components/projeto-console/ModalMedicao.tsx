import React, { useState } from 'react';
import { AlertTriangle, Camera } from 'lucide-react';
import { EtapaCronograma, MedicaoObra, NovaMedicao, Projeto } from '../../types';
import { baseAcumulada, formatarQuantidade, preverMedicao } from '../../lib/medicaoQuantidade';
import { formatarPercentual } from '../../lib/percentual';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Input, Modal, Select, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido, vazio } from '../../lib/validacao';

interface Props {
  /** A etapa pré-selecionada, ou `''` para o lançamento avulso. `null` = fechado. */
  etapaInicial: string | null;
  onFechar: () => void;
  projeto: Projeto;
  etapas: EtapaCronograma[];
  /**
   * Os boletins já lançados na obra. É deles que sai a base do acumulado — e a
   * base conta o PENDENTE junto com o aprovado, porque é sobre ela que o
   * servidor vai derivar o percentual deste boletim.
   */
  medicoes: MedicaoObra[];
  onAdicionar: (med: NovaMedicao, fotos: File[]) => Promise<MedicaoObra | null>;
  onMudarSituacao: (projId: string, situacao: Projeto['situacao']) => Promise<boolean>;
}

export default function ModalMedicao({ etapaInicial, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="add-medicao-modal"
      open={etapaInicial !== null}
      onClose={onFechar}
      title="Lançar Medição Técnica"
      size="sm"
      bloqueado={salvando}
    >
      {/* Monta só quando abre: `fotos` (`File[]`) não pode sobreviver a um
          cancelamento, ou o próximo lançamento sobe os arquivos que o usuário
          desistiu de enviar — §3.6. */}
      {etapaInicial !== null && (
        <Formulario
          {...resto}
          etapaInicial={etapaInicial}
          salvando={salvando}
          setSalvando={setSalvando}
          onFechar={onFechar}
        />
      )}
    </Modal>
  );
}

function Formulario({
  etapaInicial,
  onFechar,
  projeto,
  etapas,
  medicoes,
  onAdicionar,
  onMudarSituacao,
  salvando,
  setSalvando,
}: Omit<Props, 'etapaInicial'> & {
  etapaInicial: string;
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'etapa' | 'valor'>();
  const [etapaId, setEtapaId] = useState(etapaInicial);
  const [valor, setValor] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);

  /**
   * O modo sai da ETAPA, não de um botão: quem decide se um serviço se mede em
   * m² ou em percentual é o planejamento da obra, e oferecer a escolha aqui
   * deixaria o mesmo serviço medido de dois jeitos em dois dias.
   */
  const etapaSelecionada = etapas.find((e) => e.id === etapaId);
  const prevista = etapaSelecionada?.quantidadePrevista;
  const unidade = etapaSelecionada?.unidade ?? '';
  const modo = prevista ? 'quantidade' : 'percentual';

  const numero = Number(valor.trim().replace(',', '.'));
  const base = prevista
    ? baseAcumulada(medicoes.filter((m) => m.etapaId === etapaId), prevista)
    : null;
  // A prévia é a segunda cópia da fórmula do servidor, e é assumida como tal
  // (ver lib/medicaoQuantidade.ts). O número GRAVADO sai do insert.
  const previa = base && prevista ? preverMedicao(base, numero, prevista) : null;

  // O fan-out financeiro (quais linhas de orçamento esta medição afeta, e em
  // quanto) e o percentual/status resultantes da etapa saem do servidor, de
  // `etapa_orcamento_vinculo` — aqui só se envia a medição crua e as fotos.
  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'etapa', invalido: naoEscolhido(etapaId), erro: 'Escolha a etapa medida.' },
        {
          campo: 'valor',
          invalido: vazio(valor),
          erro: modo === 'quantidade' ? 'Informe a quantidade executada.' : 'Informe o percentual executado.',
        },
        // A recusa do servidor (`fn_medicao_deriva_percentual`), uma ida ao banco
        // antes: uma quantidade pequena demais some no arredondamento do
        // percentual, e gravar zero inflaria o progresso sem mudar nada.
        {
          campo: 'valor',
          invalido: previa?.tipo === 'sem-efeito',
          erro:
            previa?.tipo === 'sem-efeito'
              ? `Esta quantidade não muda o percentual: a etapa já está em ${formatarPercentual(previa.acumuladoPercentual)} para ${formatarQuantidade(previa.acumuladoQuantidade, unidade)}. Junte as medições de mais dias num boletim só.`
              : '',
        },
      ])
    ) return;
    if (projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado') {
      toast.error(
        `Não é possível lançar medições com a obra "${projeto.situacao}".`,
        'Mude a situação da obra para "Em Execução" antes de medir.'
      );
      return;
    }

    setSalvando(true);
    try {
      const criada = await onAdicionar(
        {
          projetoId: projeto.id,
          etapaId,
          ...(modo === 'quantidade'
            ? { quantidadeMedida: numero }
            : { percentualMedido: numero }),
          observacoes: observacoes || 'Medição periódica realizada.',
        },
        fotos
      );
      // Sem isto a tela anunciava "boletim lançado" — e ainda promovia a obra
      // para "Em Execução" — por cima do toast de erro do hook.
      if (!criada) return;

      onFechar();
      // O percentual anunciado é o que VOLTOU do insert, não o da prévia: no
      // modo quantidade quem o calcula é o trigger, e num empate exato de
      // arredondamento os dois podem divergir em 1 ulp. Quem manda é o banco.
      toast.success(
        'Boletim de medição lançado.',
        modo === 'quantidade'
          ? `${formatarQuantidade(numero, unidade)} registrados (+${formatarPercentual(criada.percentualMedido)} da etapa).`
          : `Evolução de +${formatarPercentual(criada.percentualMedido)} registrada.`
      );
      // A primeira medição tira a obra de "Planejamento" automaticamente —
      // é o próprio sinal de que a execução começou de fato.
      if (projeto.situacao === 'Planejamento') {
        await onMudarSituacao(projeto.id, 'Em Execução');
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <Field id="add-med-etapa" label="Etapa de Obra Medida" erro={erros.etapa} required>
        {(props) => (
          <Select
            {...props}
            disabled={salvando}
            value={etapaId}
            onChange={(e) => { setEtapaId(e.target.value); limparErro('etapa'); }} className="font-semibold"
          >
            <option value="">Selecione a etapa aferida...</option>
            {etapas.map((step) => (
              <option key={step.id} value={step.id}>
                {step.nome} (Atual:{' '}
                {step.quantidadePrevista
                  ? `${formatarQuantidade(step.quantidadeExecutada)} de ${formatarQuantidade(step.quantidadePrevista, step.unidade)}`
                  : formatarPercentual(step.percentualExecutado)}
                )
              </option>
            ))}
          </Select>
        )}
      </Field>

      {/* O campo é UM só: no modo quantidade o de percentual não fica
          desabilitado pedindo para ser entendido — ele some, como a data de fim
          do marco em ModalEtapa. */}
      {modo === 'quantidade' && base && prevista ? (
        <div className="space-y-2">
          {/* O pendente aparece separado do aprovado de propósito: é a diferença
              entre o que a etapa MOSTRA (só aprovado) e a base sobre a qual o
              servidor vai derivar este boletim (aprovado + pendente). Sem isto,
              quem lança o segundo boletim do dia não entende o número. */}
          <p className="text-2xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
            Meta da etapa: <strong className="font-mono text-slate-800">{formatarQuantidade(prevista, unidade)}</strong>
            {' · '}aprovado:{' '}
            <strong className="font-mono text-slate-800">{formatarQuantidade(base.quantidadeAprovada, unidade)}</strong>
            {' '}({formatarPercentual(base.percentualAprovado)})
            {base.quantidadePendente > 0 && (
              <>
                {' · '}aguardando aprovação:{' '}
                <strong className="font-mono text-slate-800">
                  {formatarQuantidade(base.quantidadePendente, unidade)}
                </strong>
              </>
            )}
          </p>

          <Field id="add-med-quantidade" label={<>Quantidade executada nesta data ({unidade})</>} erro={erros.valor} required>
            {(props) => (
              <Input
                {...props}
                type="number"
                min="0.001"
                step="any"
                disabled={salvando}
                placeholder="Ex: 2"
                value={valor}
                onChange={(e) => { setValor(e.target.value); limparErro('valor'); }}
              />
            )}
          </Field>

          {previa?.tipo === 'ok' && (
            <p className="text-2xs text-slate-700 leading-relaxed">
              Este boletim: <strong className="text-blue-700">+{formatarPercentual(previa.percentual)}</strong>
              {' · '}a etapa ficaria em{' '}
              <strong className="text-slate-900">{formatarPercentual(previa.acumuladoPercentual)}</strong>
              {' '}({formatarQuantidade(previa.acumuladoQuantidade, unidade)} de {formatarQuantidade(prevista, unidade)})
            </p>
          )}
          {previa?.tipo === 'sem-efeito' && (
            <p className="text-2xs text-rose-800 font-semibold leading-relaxed bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              Quantidade pequena demais para mudar o percentual da etapa. Junte as medições de mais
              dias num boletim só.
            </p>
          )}
          {previa?.tipo === 'ok' && previa.excede && (
            <p className="text-2xs text-amber-900 font-semibold leading-relaxed bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-amber-700 mt-0.5 shrink-0" aria-hidden />
              <span>
                Passa da quantidade prevista: ficaria em{' '}
                {formatarQuantidade(previa.acumuladoQuantidade, unidade)} de{' '}
                {formatarQuantidade(prevista, unidade)}. O boletim pode ser lançado; a aprovação vai
                pedir confirmação.
              </span>
            </p>
          )}
        </div>
      ) : (
        <Field id="add-med-percent" label="Avanço Físico Medido nesta data (%)" erro={erros.valor} required>
          {(props) => (
            <Input
              {...props}
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              disabled={salvando}
              placeholder="Ex: 25"
              value={valor}
              onChange={(e) => { setValor(e.target.value); limparErro('valor'); }}
            />
          )}
        </Field>
      )}

      <Field id="add-med-obs" label="Notas Técnicas de Campo">
        {(props) => (
          <Textarea
            {...props}
            disabled={salvando}
            placeholder="Anotações sobre a execução, qualidade de acabamento, etc..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
          />
        )}
      </Field>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Registro Fotográfico Anexo
        </label>
        <input
          id="add-med-photo-input"
          type="file"
          accept="image/*"
          multiple
          disabled={salvando}
          onChange={(e) => setFotos([...fotos, ...Array.from(e.target.files ?? [])])}
          className="w-full border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:bg-slate-50"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {fotos.map((foto, idx) => (
            <span
              key={idx}
              className="bg-slate-100 text-slate-700 text-xs font-mono px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1.5"
            >
              <span>{foto.name}</span>
              <button
                type="button"
                disabled={salvando}
                onClick={() => setFotos(fotos.filter((_, i) => i !== idx))}
                className="text-slate-500 hover:text-rose-600 font-bold"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-medicao-btn"
          type="submit"
          disabled={salvando}
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Aferindo...</span>
            </>
          ) : (
            <>
              <Camera size={14} />
              <span>Registrar Boletim</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
