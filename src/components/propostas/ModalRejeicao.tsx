import React, { useState } from 'react';
import { Proposta } from '../../types';
import { useFeedback } from '../FeedbackContext';
import Spinner from '../Spinner';
import { Button, Field, Modal, Textarea } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { vazio } from '../../lib/validacao';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  proposta: Proposta;
  onRejeitar: (id: string, motivo: string) => Promise<boolean>;
}

/**
 * Recusa sem motivo registrado é a informação mais cara do ciclo indo embora —
 * preço, prazo, escopo ou concorrente. Por isso a recusa não passa pelo
 * seletor de status direto.
 */
export default function ModalRejeicao({ aberto, onFechar, ...resto }: Props) {
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      id="rejeicao-modal"
      open={aberto}
      onClose={onFechar}
      title="Registrar recusa"
      size="sm"
      bloqueado={salvando}
    >
      <Formulario {...resto} salvando={salvando} setSalvando={setSalvando} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({
  proposta,
  onRejeitar,
  onFechar,
  salvando,
  setSalvando,
}: Omit<Props, 'aberto'> & {
  salvando: boolean;
  setSalvando: (v: boolean) => void;
}) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'motivo'>();
  const [motivo, setMotivo] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar([{ campo: 'motivo', invalido: vazio(motivo), erro: 'Informe o motivo da recusa.' }])) return;
    setSalvando(true);
    const ok = await onRejeitar(proposta.id, motivo.trim());
    setSalvando(false);
    if (!ok) return;
    onFechar();
    toast.success('Proposta marcada como rejeitada.', 'O motivo ficou registrado no histórico.');
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-xs text-slate-600 leading-relaxed">
        A proposta <strong className="font-mono text-slate-900">{proposta.numero}</strong> será
        marcada como rejeitada. O orçamento fica preservado como histórico.
      </p>
      <Field
        id="motivo-rejeicao"
        label="Motivo da recusa"
        erro={erros.motivo}
        hint="É o dado que explica a taxa de conversão — sem ele, só se sabe que perdeu."
        required
      >
        {(props) => (
          <Textarea
            {...props}
            autoFocus
            disabled={salvando}
            rows={3}
            placeholder="Ex: preço acima do concorrente; prazo de execução incompatível; obra adiada pelo cliente."
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); limparErro('motivo'); }}
          />
        )}
      </Field>
      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" disabled={salvando} onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={salvando} variante="perigo"
        >
          {salvando ? (
            <>
              <Spinner size={14} />
              <span>Registrando...</span>
            </>
          ) : (
            <span>Marcar como rejeitada</span>
          )}
        </Button>
      </div>
    </form>
  );
}
