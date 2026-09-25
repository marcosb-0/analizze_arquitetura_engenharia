import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { EmpresaConfig, Funcionario, InsumoCatalogo, RubricaEncargo } from '../../types';
import { parametrosDaEmpresa } from '../../lib/custoHora';
import { catalogoService } from '../../services/catalogoService';
import { CabecalhoPagina, PaginaAba } from '../ui';
import CustoPorCargo from './CustoPorCargo';
import ParametrosMaoDeObra from './ParametrosMaoDeObra';
import type { Nova } from './rascunhoEncargos';

/**
 * Equipe › Custo da mão de obra.
 *
 * A tabela de encargos morava em Configurações, ao lado do timbre das
 * propostas. Mas a pergunta que ela responde — quanto custa por hora o meu
 * pedreiro — nasce onde estão as pessoas, e a cadeia até a composição não
 * aparecia em tela nenhuma. Aqui ficam juntos o resultado (custo-hora por cargo
 * e o que o catálogo cobra) e os parâmetros que o produzem.
 *
 * O papel `financeiro` lê a Equipe e passa a ver esta visão em leitura; a
 * escrita continua admin/gestão, que é o que a RLS de `empresa_config` e
 * `encargos_rubricas` já exige.
 */

interface Props {
  seletor: ReactNode;
  funcionarios: Funcionario[];
  empresa: EmpresaConfig | null;
  rubricas: RubricaEncargo[];
  editavel: boolean;
  onSaveEmpresa: (config: Omit<EmpresaConfig, 'id' | 'logoUrl'>) => Promise<EmpresaConfig | null>;
  onSaveRubricas: (rubricas: RubricaEncargo[]) => Promise<boolean>;
  onCreate: (nova: Nova) => Promise<boolean>;
  onDelete: (codigo: string) => Promise<boolean>;
}

export default function CustoMaoDeObra({ seletor, funcionarios, empresa, rubricas, editavel, ...escritas }: Props) {
  const parametros = useMemo(() => parametrosDaEmpresa(empresa, rubricas), [empresa, rubricas]);

  /**
   * O preço que o catálogo cobra, relido sempre que um insumo da cadeia muda
   * — senão, depois de salvar os encargos, a coluna "No catálogo" mostraria o
   * preço velho ao lado do custo novo e acusaria uma divergência que não existe.
   * `listarMaoDeObra` é a lista curta que a ficha já usa no seletor de cargo.
   */
  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([]);
  useEffect(() => {
    let vivo = true;
    catalogoService
      .listarMaoDeObra()
      .then((itens) => { if (vivo) setInsumos(itens); })
      // Falhar aqui (ou o papel não ler o catálogo) só esconde as colunas do
      // catálogo; o custo-hora da folha continua visível.
      .catch(() => { if (vivo) setInsumos([]); });
    return () => { vivo = false; };
  }, [empresa, rubricas, funcionarios]);

  return (
    <PaginaAba largura="leitura">
      <CabecalhoPagina titulo="Equipe" descricao="Quanto cada pessoa custa por hora, e como esse custo chega às composições do catálogo." />
      {seletor}
      <CustoPorCargo funcionarios={funcionarios} parametros={parametros} insumos={insumos} />
      <ParametrosMaoDeObra empresa={empresa} rubricas={rubricas} editavel={editavel}
        onSaveEmpresa={escritas.onSaveEmpresa} onSaveRubricas={escritas.onSaveRubricas}
        onCreate={escritas.onCreate} onDelete={escritas.onDelete} />
    </PaginaAba>
  );
}
