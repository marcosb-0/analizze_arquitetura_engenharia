import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { EtapaCronograma, Projeto } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

export interface NovaMedicao {
  projetoId: string;
  etapaId: string;
  percentualMedido: number;
  observacoes: string;
}

interface Props {
  /** A etapa pré-selecionada, ou `''` para o lançamento avulso. `null` = fechado. */
  etapaInicial: string | null;
  onFechar: () => void;
  projeto: Projeto;
  etapas: EtapaCronograma[];
  onAdicionar: (med: NovaMedicao, fotos: File[]) => Promise<boolean>;
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
  const [etapaId, setEtapaId] = useState(etapaInicial);
  const [percentual, setPercentual] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);

  // O fan-out financeiro (quais linhas de orçamento esta medição afeta, e em
  // quanto) e o percentual/status resultantes da etapa saem do servidor, de
  // `etapa_orcamento_vinculo` — aqui só se envia a medição crua e as fotos.
  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etapaId || !percentual) {
      toast.error('Preencha a Etapa e o Percentual Executado.');
      return;
    }
    if (projeto.situacao === 'Pausado' || projeto.situacao === 'Finalizado') {
      toast.error(
        `Não é possível lançar medições com a obra "${projeto.situacao}".`,
        'Mude a situação da obra para "Em Execução" antes de medir.'
      );
      return;
    }

    setSalvando(true);
    try {
      const ok = await onAdicionar(
        {
          projetoId: projeto.id,
          etapaId,
          percentualMedido: parseFloat(percentual),
          observacoes: observacoes || 'Medição periódica realizada.',
        },
        fotos
      );
      // Sem isto a tela anunciava "boletim lançado" — e ainda promovia a obra
      // para "Em Execução" — por cima do toast de erro do hook.
      if (!ok) return;

      onFechar();
      toast.success('Boletim de medição lançado.', `Evolução de +${percentual}% registrada.`);
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
    <form onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Etapa de Obra Medida *
        </label>
        <select
          id="add-med-etapa"
          required
          disabled={salvando}
          value={etapaId}
          onChange={(e) => setEtapaId(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 font-semibold disabled:bg-slate-50"
        >
          <option value="">Selecione a etapa aferida...</option>
          {etapas.map((step) => (
            <option key={step.id} value={step.id}>
              {step.nome} (Atual: {step.percentualExecutado}%)
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Avanço Físico Medido nesta data (%) *
        </label>
        <input
          id="add-med-percent"
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          required
          disabled={salvando}
          placeholder="Ex: 25"
          value={percentual}
          onChange={(e) => setPercentual(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Notas Técnicas de Campo
        </label>
        <textarea
          id="add-med-obs"
          disabled={salvando}
          placeholder="Anotações sobre a execução, qualidade de acabamento, etc..."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
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
                className="text-slate-400 hover:text-rose-600 font-bold"
              >
                ×
              </button>
            </span>
          ))}
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
        <button
          id="submit-medicao-btn"
          type="submit"
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5"
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
        </button>
      </div>
    </form>
  );
}
