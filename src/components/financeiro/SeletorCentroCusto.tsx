import { CentroCusto } from '../../types';
import { Select } from '../ui';

/**
 * O seletor da dimensão organizacional do razão (20260920015643).
 *
 * Três regras que valem em toda tela que lança dinheiro:
 *
 *  1. só centro **analítico** é opção — o sintético agrupa e o banco recusa
 *     lançamento nele (`trg_z_lancamento_deriva_projeto`);
 *  2. o sintético ainda assim aparece, `disabled`, porque sem ele a lista vira
 *     uma sequência de nomes sem hierarquia e "Escritório" e "Obra tal" ficam
 *     no mesmo plano;
 *  3. centro **inativo** some, salvo quando é o que o lançamento em edição já
 *     usa — tirá-lo faria o `<select>` cair no primeiro item e trocar o centro
 *     de um lançamento antigo sem ninguém pedir.
 *
 * A indentação usa espaço fino (U+2007, figure space) porque `<option>` colapsa
 * espaço comum: o navegador mostraria tudo rente à esquerda.
 */
const RECUO = '   ';

export function opcoesDeCentro(centros: CentroCusto[], selecionado?: string): CentroCusto[] {
  return centros.filter((c) => c.ativo || c.id === selecionado);
}

interface SeletorCentroCustoProps {
  /** A árvore inteira, na ordem de `caminho` (é como o service já devolve). */
  centros: CentroCusto[];
  valor: string;
  onChange: (centroId: string) => void;
  disabled?: boolean;
  /** Texto da opção vazia. Omitido => o campo não oferece "nenhum". */
  rotuloVazio?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  className?: string;
}

export default function SeletorCentroCusto({
  centros,
  valor,
  onChange,
  disabled,
  rotuloVazio,
  className,
  ...props
}: SeletorCentroCustoProps) {
  const visiveis = opcoesDeCentro(centros, valor);

  return (
    <Select
      {...props}
      value={valor}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      fundo="suave"
      className={className}
    >
      {rotuloVazio !== undefined && <option value="">{rotuloVazio}</option>}
      {visiveis.map((centro) => (
        <option
          key={centro.id}
          value={centro.id}
          disabled={centro.tipo === 'Sintetico'}
        >
          {RECUO.repeat(Math.max(0, centro.nivel - 1))}
          {centro.codigo} {centro.nome}
          {centro.ativo ? '' : ' (inativo)'}
        </option>
      ))}
    </Select>
  );
}
