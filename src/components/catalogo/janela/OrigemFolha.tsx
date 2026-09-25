import { Users } from 'lucide-react';
import { InsumoCatalogo } from '../../../types';
import { useEmpresaConfigDados, useFuncionariosDados } from '../../../contexts/DadosContext';
import { custoColaborador, parametrosDaEmpresa } from '../../../lib/custoHora';
import { formatBRL } from '../../../lib/preco';
import { Aviso } from '../../ui';

/**
 * De onde sai o preço "Folha da empresa" de um insumo de mão de obra.
 *
 * O selo dizia só a fonte; quem orça não via qual ficha, com quais encargos,
 * virou aquele número. Refaz a conta com `custoColaborador` — o espelho testado
 * de `fn_custo_hora_folha` — sobre os ativos vinculados e mostra a do MAIOR,
 * que é a que o banco usa.
 *
 * Lê os provedores direto, como `PainelHHEtapa`: repassar funcionários e
 * encargos da aba até a janela atravessaria três componentes que não têm nada
 * a ver com custo-hora. Catálogo e Equipe são lidos pelos mesmos papéis
 * (admin/gestão), então isto não mostra a ninguém um salário que ele já não
 * alcançava pela Equipe — e o preço já o revela pela conta inversa.
 */
export default function OrigemFolha({ insumo }: { insumo: InsumoCatalogo }) {
  const { funcionarios } = useFuncionariosDados();
  const { empresa, rubricas } = useEmpresaConfigDados();
  if (insumo.precoFonteEfetiva !== 'Folha') return null;

  const parametros = parametrosDaEmpresa(empresa, rubricas);
  const vinculados = funcionarios.filter((f) => f.status === 'Ativo' && f.catalogoMaoDeObraId === insumo.id);
  const maior = vinculados
    .map((func) => ({ func, custo: custoColaborador(func, parametros) }))
    .filter((x): x is { func: typeof x.func; custo: NonNullable<typeof x.custo> } => x.custo != null)
    .sort((a, b) => b.custo.custoHora - a.custo.custoHora)[0];

  return (
    <Aviso tom="neutro" icone={<Users size={14} />}>
      {maior ? (
        <>
          Preço da folha: maior custo por hora entre {vinculados.length}{' '}
          {vinculados.length === 1 ? 'ativo vinculado' : 'ativos vinculados'} — {maior.func.nome}.{' '}
          <span className="font-mono">
            {maior.custo.beneficiosTotal > 0 && '('}
            {formatBRL(maior.func.salarioBase ?? 0)} × (1 + {maior.custo.encargosPercentual.toLocaleString('pt-BR')}%)
            {maior.custo.beneficiosTotal > 0 && ` + ${formatBRL(maior.custo.beneficiosTotal)})`} ÷{' '}
            {maior.custo.jornada.toLocaleString('pt-BR')} h = {formatBRL(maior.custo.custoHora)}
          </span>
          . Encargos e jornada em{' '}
          <a className="font-semibold text-blue-600 underline" href="/equipe?secao=custos">Equipe › Custo da mão de obra</a>.
        </>
      ) : (
        <>O preço vem da folha de pagamento dos funcionários ativos vinculados a este cargo, em Equipe.</>
      )}
    </Aviso>
  );
}
