import React, { useState } from 'react';
import { EdicaoEtapa, EtapaCronograma, Funcionario, Projeto } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Modal } from '../ui';

/** `nova` parte do prazo da obra; `edicao` carrega a etapa existente. */
export type AlvoEtapa = { modo: 'nova' } | { modo: 'edicao'; etapa: EtapaCronograma };

interface Props {
  alvo: AlvoEtapa | null;
  onFechar: () => void;
  projeto: Projeto;
  funcionarios: Funcionario[];
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

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !inicio || !fim) {
      toast.error('Preencha nome, início e fim da etapa.');
      return;
    }
    if (fim < inicio) {
      toast.error('A data de fim da etapa não pode ser anterior ao início.');
      return;
    }

    setSalvando(true);
    const ok = etapa
      ? await onAtualizar(etapa.id, {
          nome: nome.trim(),
          dataInicio: inicio,
          dataFim: fim,
          responsavelId: responsavel,
        })
      : await onCriar({
          id: crypto.randomUUID(),
          projetoId: projeto.id,
          nome: nome.trim(),
          dataInicio: inicio,
          dataFim: fim,
          responsavelId: responsavel,
          // Derivados no banco; entram aqui só para satisfazer o tipo.
          percentualExecutado: 0,
          status: 'Não Iniciado',
        });
    setSalvando(false);
    if (!ok) return;
    onFechar();
    toast.success(etapa ? 'Etapa atualizada.' : 'Etapa criada.');
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left overflow-y-auto flex-1">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Nome da Etapa *
        </label>
        <input
          id="etapa-nome-input"
          type="text"
          required
          disabled={salvando}
          placeholder="Ex: Impermeabilização da Laje"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 text-slate-800 disabled:bg-slate-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Início *
          </label>
          <input
            id="etapa-inicio-input"
            type="date"
            required
            disabled={salvando}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Fim *
          </label>
          <input
            id="etapa-fim-input"
            type="date"
            required
            disabled={salvando}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus:border-blue-600 disabled:bg-slate-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          Encarregado
        </label>
        <select
          id="etapa-responsavel-select"
          disabled={salvando}
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 bg-white text-slate-700 disabled:bg-slate-50"
        >
          <option value="">A definir</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.cargo})
            </option>
          ))}
        </select>
      </div>

      <p className="text-2xs text-slate-400 leading-relaxed">
        Progresso e status não são editáveis: saem das medições aprovadas desta etapa.
      </p>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <button
          type="button"
          disabled={salvando}
          onClick={onFechar}
          className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          id="submit-etapa-btn"
          type="submit"
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-60"
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Salvando...</span>
            </>
          ) : (
            <span>{etapa ? 'Salvar Etapa' : 'Criar Etapa'}</span>
          )}
        </button>
      </div>
    </form>
  );
}
