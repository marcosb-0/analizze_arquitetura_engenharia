import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Acesso } from '../../types';
import { useFeedback } from '../FeedbackContext';
import { Button, Input, Modal, Select } from '../ui';

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
  const [profileId, setProfileId] = useState('');
  const [papel, setPapel] = useState('');

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) {
      toast.error('Selecione um profissional para conceder acesso.');
      return;
    }
    const ok = await onConceder(profileId, papel);
    if (!ok) return;
    onFechar();
    toast.success('Acesso à obra concedido.');
  };

  return (
    <form onSubmit={submeter} className="p-4 space-y-4 text-left">
      <p className="text-2xs text-slate-500 leading-relaxed">
        Apenas usuários do app de campo precisam de concessão explícita — administração, gestão e
        financeiro já enxergam todas as obras.
      </p>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Profissional de Campo
        </label>
        <Select
          id="add-membro-profile-select"
          required
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {perfisDisponiveis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName || p.email}
            </option>
          ))}
        </Select>
        {perfisDisponiveis.length === 0 && (
          <p className="text-2xs text-amber-600 font-semibold mt-1">
            Nenhum usuário de campo disponível para conceder acesso.
          </p>
        )}
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
          Papel na Obra (Opcional)
        </label>
        <Input
          id="add-membro-papel-input"
          type="text"
          placeholder="Ex: Mestre de Obras"
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
        />
      </div>
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
