import type { ComponentProps } from 'react';
import { useGruposCatalogo } from '../../hooks/useGruposCatalogo';
import { Select } from '../ui';

/**
 * Escolha de grupo de serviço (Alvenaria, Revestimento cerâmico…).
 *
 * O mesmo componente serve de FILTRO (barra do catálogo, seletor da proposta,
 * busca de componente) e de CAMPO (cadastro do insumo); só muda o texto da
 * opção vazia — "Todos os grupos" num, "Sem grupo" no outro. Como o
 * `SelectUnidade`, fica fora de `components/ui` porque conhece o domínio.
 *
 * Sem grupos cadastrados, o filtro não aparece: um seletor com uma opção só
 * ("Todos") é ruído.
 */
interface SelectGrupoProps extends Omit<ComponentProps<typeof Select>, 'value' | 'onChange' | 'children'> {
  value: string | undefined;
  onChange: (grupoId: string | undefined) => void;
  /** Texto da opção vazia. */
  vazio?: string;
  /** Mostra mesmo sem grupos — o cadastro precisa do campo para existir. */
  sempre?: boolean;
}

export default function SelectGrupo({
  value,
  onChange,
  vazio = 'Todos os grupos',
  sempre = false,
  ...rest
}: SelectGrupoProps) {
  const { grupos } = useGruposCatalogo();
  if (!sempre && grupos.length === 0) return null;

  return (
    <Select
      aria-label="Grupo de serviço"
      {...rest}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{vazio}</option>
      {grupos.map((g) => (
        <option key={g.id} value={g.id}>{g.nome}</option>
      ))}
    </Select>
  );
}
