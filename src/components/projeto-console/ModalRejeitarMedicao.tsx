import React, { useState } from 'react';
import { X } from 'lucide-react';
import { MedicaoObra } from '../../types';
import Spinner from '../Spinner';
import { Button, Field, Modal, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';

interface Props {
  /** A medição a recusar, ou `null` com o diálogo fechado. */
  medicao: MedicaoObra | null;
  nomeEtapa?: string;
  onFechar: () => void;
  /** Trava o diálogo enquanto a recusa está em curso. */
  ocupado: boolean;
  onConfirmar: (motivo: string) => Promise<void>;
}

/**
 * Rejeitar exige justificativa: o `confirm` compartilhado não coleta texto, e
 * sem motivo quem lançou o boletim (o campo, pelo app) fica sabendo só que foi
 * recusado. O banco aceita motivo nulo por compatibilidade — a obrigação é aqui.
 */
export default function ModalRejeitarMedicao({
  medicao,
  nomeEtapa,
  onFechar,
  ocupado,
  onConfirmar,
}: Props) {
  return (
    <Modal
      id="rejeitar-medicao-modal"
      open={!!medicao}
      onClose={onFechar}
      title="Rejeitar Medição"
      description={
        medicao ? `${nomeEtapa ?? 'Etapa removida'} · +${medicao.percentualMedido}%` : undefined
      }
      size="sm"
      bloqueado={ocupado}
    >
      {medicao && <Formulario ocupado={ocupado} onConfirmar={onConfirmar} onFechar={onFechar} />}
    </Modal>
  );
}

function Formulario({
  ocupado,
  onConfirmar,
  onFechar,
}: Pick<Props, 'ocupado' | 'onConfirmar' | 'onFechar'>) {
  const { erros, validar, limparErro, areaRef } = useValidacao<'motivo'>();
  const [motivo, setMotivo] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const texto = motivo.trim();
    if (
      !validar([
        {
          campo: 'motivo',
          invalido: texto.length < 5,
          erro: 'Descreva o motivo — quem lançou a medição precisa saber o que corrigir.',
        },
      ])
    ) return;
    await onConfirmar(texto);
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-xs text-slate-600 leading-relaxed">
        O boletim fica marcado como rejeitado e não afeta o orçamento. O motivo abaixo aparece no
        boletim para quem o lançou.
      </p>

      <Field id="motivo-rejeicao-input" label="Motivo da recusa" erro={erros.motivo} required>
        {(props) => (
          <Textarea
            {...props}
            autoFocus
            disabled={ocupado}
            rows={3}
            placeholder="Ex: falta o registro fotográfico da face norte; o percentual não confere com o executado em campo."
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); limparErro('motivo'); }}
          />
        )}
      </Field>

      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={ocupado} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-rejeitar-medicao-btn"
          type="submit"
          disabled={ocupado} variante="perigo"
        >
          {ocupado ? (
            <>
              <Spinner size={14} />
              <span>Rejeitando...</span>
            </>
          ) : (
            <>
              <X size={14} />
              <span>Rejeitar Boletim</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
