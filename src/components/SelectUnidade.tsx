import { GRUPOS_UNIDADE, unidadesDoGrupo } from '../constants/unidades';
import { Select } from './ui';

/**
 * Escolha de unidade de medida a partir do domínio canônico.
 *
 * Substitui o `<input type="text">` que existia no cadastro de insumo e na
 * composição da proposta. A diferença não é de conforto: com texto livre, a
 * base real chegou a ter `UN` e `un` como coisas diferentes, e o código que
 * agrega quantidade por etapa (`lib/quantidadeEtapa.ts`) se RECUSA a somar
 * quando as grafias divergem. O campo aberto produzia silenciosamente o dado
 * que fazia outra tela parar de responder.
 *
 * `<optgroup>` por grupo (contagem, área, volume…) porque a lista tem 20 itens
 * e o que o usuário procura é "a de área", não a décima da lista.
 *
 * Fica fora de `components/ui` de propósito: `ui` é o sistema de design, e este
 * componente conhece um domínio do negócio. O que ele reusa de lá é o `Select`,
 * com os tokens de altura e tamanho que todo controle do app respeita.
 */
interface SelectUnidadeProps {
  id?: string;
  value: string;
  onChange: (codigo: string) => void;
  tamanho?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export default function SelectUnidade({ value, onChange, tamanho = 'md', className, ...rest }: SelectUnidadeProps) {
  return (
    <Select
      {...rest}
      tamanho={tamanho}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {GRUPOS_UNIDADE.map((grupo) => (
        <optgroup key={grupo} label={grupo}>
          {unidadesDoGrupo(grupo).map((u) => (
            <option key={u.codigo} value={u.codigo}>
              {u.nome} ({u.codigo})
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
