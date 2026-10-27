import { useState } from 'react';
import { MODALIDADES, TITULO_MODALIDADE, type ModalidadeProposta } from '../../lib/materiaisProposta';
import { Aviso, Field, Select } from '../ui';

interface Props {
  /** `proposta.modalidade` — a coluna que o valor gravado segue. */
  modalidade?: ModalidadeProposta;
  bloqueado: boolean;
  onSalvar: (modalidade: ModalidadeProposta) => Promise<boolean>;
}

export default function ModalidadeContratacao({ modalidade, bloqueado, onSalvar }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  return (
    <section className="space-y-3" aria-label={TITULO_MODALIDADE}>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
        <Field label={TITULO_MODALIDADE}>
          {campo => <Select {...campo} value={modalidade ?? ''} disabled={bloqueado || salvando} aria-label={TITULO_MODALIDADE} onChange={async e => {
            const valor = e.target.value as ModalidadeProposta;
            if (!valor) return;
            setSalvando(true);
            setErro(false);
            try { setErro(!await onSalvar(valor)); } catch { setErro(true); }
            finally { setSalvando(false); }
          }}>
            <option value="" disabled>Selecione o fornecimento</option>
            {Object.entries(MODALIDADES).map(([id, m]) => <option key={id} value={id}>{m.rotulo}</option>)}
          </Select>}
        </Field>
        <p className="text-xs text-slate-500 leading-relaxed">
          {salvando ? 'Salvando modalidade…' : modalidade ? MODALIDADES[modalidade].texto : 'Defina quem fornece os materiais. A escolha fica no descritivo, no PDF e nas cláusulas que dão origem ao contrato.'}
        </p>
      </div>
      <p className="text-2xs text-slate-500">Em “Só mão de obra”, o material de cada serviço sai do valor da proposta — no orçamento, no PDF, na revisão, no contrato e na conversão em obra. A divisão vem das composições. Os quantitativos também são calculados a partir das composições.</p>
      {erro && <Aviso tom="negativo">Não foi possível salvar a modalidade. Tente novamente.</Aviso>}
    </section>
  );
}
