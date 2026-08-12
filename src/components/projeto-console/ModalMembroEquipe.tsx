import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Acesso } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Button, Field, Input, Modal, Select } from '../ui';
import { useValidacao } from '../../hooks/useValidacao';
import { naoEscolhido } from '../../lib/validacao';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Perfis de campo que ainda NÃO têm acesso a esta obra. */
  perfisDisponiveis: Acesso[];
  onConceder: (profileId: string, papel: string) => Promise<boolean>;
}

export default function ModalMembroEquipe({ aberto, onFechar, ...resto }: Props) {
  return (
    <Modal
      id="add-membro-equipe-modal"
      open={aberto}
      onClose={onFechar}
      title="Conceder Acesso à Obra"
      size="sm"
    >
      <Formulario {...resto} onFechar={onFechar} />
    </Modal>
  );
}

function Formulario({ perfisDisponiveis, onConceder, onFechar }: Omit<Props, 'aberto'>) {
  const { toast } = useFeedback();
  const { erros, validar, limparErro, areaRef } = useValidacao<'profissional'>();
  const [profileId, setProfileId] = useState('');
  const [papel, setPapel] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !validar([
        { campo: 'profissional', invalido: naoEscolhido(profileId), erro: 'Escolha quem receberá o acesso.' },
      ])
    ) return;
    const ok = await onConceder(profileId, papel);
    if (!ok) return;
    onFechar();
    toast.success('Acesso à obra concedido.');
  };

  return (
    <form ref={areaRef as React.RefObject<HTMLFormElement>} onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-2xs text-slate-500 leading-relaxed">
        Apenas usuários do app de campo precisam de concessão explícita — administração, gestão e
        financeiro já enxergam todas as obras.
      </p>
      <div>
        <Field id="add-membro-profile-select" label="Profissional de Campo" erro={erros.profissional} required>
          {(props) => (
            <Select
              {...props}
              value={profileId}
              onChange={(e) => { setProfileId(e.target.value); limparErro('profissional'); }}
            >
              <option value="">Selecione...</option>
              {perfisDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName || p.email}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {perfisDisponiveis.length === 0 && (
          <p className="text-2xs text-amber-600 font-semibold mt-1">
            Nenhum usuário de campo disponível para conceder acesso.
          </p>
        )}
      </div>
      <Field id="add-membro-papel-input" label="Papel na Obra (Opcional)">
        {(props) => (
          <Input
            {...props}
            type="text"
            placeholder="Ex: Mestre de Obras"
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
          />
        )}
      </Field>
      <div className="pt-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">
        <Button variante="fantasma" onClick={onFechar}>
          Cancelar
        </Button>
        <Button
          id="submit-membro-equipe-btn"
          type="submit"
        >
          <UserPlus size={14} />
          <span>Conceder</span>
        </Button>
      </div>
    </form>
  );
}
