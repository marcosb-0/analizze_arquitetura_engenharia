import { useState } from 'react';
import { Button, FOCO, Modal } from '../../ui';
import { MOTIVOS_FALTA } from '../../../lib/presenca';
import type { MotivoFalta } from '../../../types';

/** Hora atual em 'HH:MM', arredondada para baixo de 5 em 5 minutos. */
function agora(): string {
  const d = new Date();
  const m = Math.floor(d.getMinutes() / 5) * 5;
  return `${String(d.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface DialogoHoraProps {
  aberto: boolean;
  /** "Que horas o João chegou?" */
  pergunta: string;
  /** Hora já anotada, quando é correção. */
  inicial?: string;
  /** Só sugere a hora de agora quando a chamada é de hoje. */
  sugerirAgora: boolean;
  onConfirmar: (hora: string) => void;
  onFechar: () => void;
}

/**
 * Pergunta UMA coisa: a hora. Na chamada de hoje ela já vem com a hora de
 * agora, porque o caso comum é anotar no momento em que a pessoa chega ou vai
 * embora — aí é só tocar "Anotar".
 *
 * O campo é `type="time"` cru e grande: o celular abre o relógio de rolar dele,
 * que o encarregado já conhece do despertador. O `<Input>` do app tem 40 px de
 * altura, que é altura de escritório.
 */
export function DialogoHora({ aberto, pergunta, inicial, sugerirAgora, onConfirmar, onFechar }: DialogoHoraProps) {
  return (
    <Modal open={aberto} onClose={onFechar} title={pergunta} size="sm">
      <CorpoHora inicial={inicial ?? (sugerirAgora ? agora() : '')} onConfirmar={onConfirmar} onFechar={onFechar} />
    </Modal>
  );
}

/** Componente próprio para o estado nascer limpo a cada abertura (o corpo do Modal monta ao abrir). */
function CorpoHora({ inicial, onConfirmar, onFechar }: { inicial: string; onConfirmar: (h: string) => void; onFechar: () => void }) {
  const [hora, setHora] = useState(inicial);
  return (
    <form
      className="px-6 pb-6 pt-2 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (hora) onConfirmar(hora);
      }}
    >
      <input
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
        aria-label="Hora"
        className={`block w-full min-h-16 rounded-xl border-2 border-slate-400 bg-superficie text-center text-2xl font-semibold text-slate-900 ${FOCO}`}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variante="secundario" bloco onClick={onFechar}>Voltar</Button>
        <Button type="submit" bloco disabled={!hora}>Anotar</Button>
      </div>
    </form>
  );
}

interface DialogoFaltaProps {
  aberto: boolean;
  nome: string;
  onConfirmar: (motivo: MotivoFalta | undefined) => void;
  onFechar: () => void;
}

/**
 * O motivo da falta, em botões. Um toque já grava — não há "Confirmar" depois
 * de escolher. "Não sei" grava a falta sem motivo, para a pergunta nunca
 * impedir a anotação.
 */
export function DialogoFalta({ aberto, nome, onConfirmar, onFechar }: DialogoFaltaProps) {
  return (
    <Modal open={aberto} onClose={onFechar} title={`${nome} faltou. Por quê?`} size="sm">
      <div className="px-6 pb-6 pt-2 grid gap-2">
        {MOTIVOS_FALTA.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onConfirmar(m)}
            className={`min-h-14 rounded-xl border-2 border-rose-300 bg-rose-50 text-lg font-semibold text-rose-700 hover:bg-rose-100 ${FOCO}`}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onConfirmar(undefined)}
          className={`min-h-14 rounded-xl border-2 border-slate-400 bg-superficie text-lg font-semibold text-slate-800 hover:bg-slate-50 ${FOCO}`}
        >
          Não sei
        </button>
      </div>
    </Modal>
  );
}

interface DialogoConfirmarProps {
  aberto: boolean;
  nomes: string[];
  onConfirmar: () => void;
  onFechar: () => void;
}

/** A confirmação do "todos os outros vieram" — mostra QUEM vai ser marcado. */
export function DialogoTodosVieram({ aberto, nomes, onConfirmar, onFechar }: DialogoConfirmarProps) {
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={nomes.length === 1 ? 'Marcar 1 pessoa como "Veio"?' : `Marcar ${nomes.length} pessoas como "Veio"?`}
      size="sm"
    >
      <div className="px-6 pb-6 pt-2 space-y-4">
        <ul className="max-h-64 overflow-y-auto rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-800">
          {nomes.map((n) => <li key={n} className="py-1">{n}</li>)}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variante="secundario" bloco onClick={onFechar}>Voltar</Button>
          <Button type="button" bloco onClick={onConfirmar}>Sim, vieram</Button>
        </div>
      </div>
    </Modal>
  );
}
