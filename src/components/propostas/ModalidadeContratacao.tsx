import { useState } from 'react';
import type { SecaoProposta } from '../../types';
import { MODALIDADES, TITULO_MODALIDADE, modalidadeDaProposta, type ModalidadeProposta } from '../../lib/materiaisProposta';
import { Aviso, Field, Select } from '../ui';

interface Props {
  secoes: SecaoProposta[];
  bloqueado: boolean;
  onSalvar: (modalidade: ModalidadeProposta) => Promise<boolean>;
}

export default function ModalidadeContratacao({ secoes, bloqueado, onSalvar }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const modalidade = modalidadeDaProposta(secoes);
  return (
    <section className="space-y-3" aria-label={TITULO_MODALIDADE}>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
        <Field label={TITULO_MODALIDADE}>
          {campo => <Select {...campo} value={modalidade} disabled={bloqueado || salvando} aria-label={TITULO_MODALIDADE} onChange={async e => {
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
      <p className="text-2xs text-slate-500">A modalidade define o fornecimento; não altera preços automaticamente. Confira se o orçamento inclui somente o que será contratado. Os quantitativos são calculados a partir das composições.</p>
      {erro && <Aviso tom="negativo">Não foi possível salvar a modalidade. Tente novamente.</Aviso>}
    </section>
  );
}
