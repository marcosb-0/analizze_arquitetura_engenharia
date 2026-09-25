import { AlertTriangle, Link2Off, Users } from 'lucide-react';
import { Funcionario, InsumoCatalogo } from '../../types';
import { custoColaborador, type CustoColaborador, type ParametrosCusto } from '../../lib/custoHora';
import { formatBRL } from '../../lib/preco';
import { rotuloProcedencia } from '../catalogo/acoesInsumo';
import { Avatar, Aviso, FOCO, Secao, TableWrap, Td, Th } from '../ui';

/**
 * A cadeia inteira numa tabela: quem está na folha → quanto custa por hora →
 * qual insumo do catálogo isso precifica → em quantas composições entra.
 *
 * Antes cada elo morava numa tela (encargos em Configurações, salário na ficha,
 * preço no catálogo) e nenhuma mostrava a ligação. Dois dos três ativos em
 * produção não alimentavam composição nenhuma, e nada dizia isso.
 *
 * O custo-hora do cargo é o MAIOR entre os ativos vinculados, como em
 * `fn_custo_hora_folha`: orça pelo pior caso. `custoColaborador` é o espelho
 * testado da função do banco; a coluna "No catálogo" é o número que o banco
 * efetivamente usa, e as duas têm de bater.
 */

interface Props {
  funcionarios: Funcionario[];
  parametros: ParametrosCusto | null;
  /** Insumos de mão de obra ativos. Vazio para quem não lê o catálogo (financeiro). */
  insumos: InsumoCatalogo[];
  onAbrirFicha: (id: string) => void;
}

interface LinhaCargo {
  insumoId: string;
  insumo: InsumoCatalogo | undefined;
  pessoas: Funcionario[];
  /** O maior custo entre os ativos que têm custo definido. */
  maior: { func: Funcionario; custo: CustoColaborador } | null;
  semCusto: number;
}

export default function CustoPorCargo({ funcionarios, parametros, insumos, onAbrirFicha }: Props) {
  const ativos = funcionarios.filter((f) => f.status === 'Ativo');

  const porInsumo = new Map<string, Funcionario[]>();
  for (const f of ativos) {
    if (!f.catalogoMaoDeObraId) continue;
    porInsumo.set(f.catalogoMaoDeObraId, [...(porInsumo.get(f.catalogoMaoDeObraId) ?? []), f]);
  }

  const linhas: LinhaCargo[] = [...porInsumo.entries()].map(([insumoId, pessoas]) => {
    let maior: LinhaCargo['maior'] = null;
    let semCusto = 0;
    for (const func of pessoas) {
      const custo = custoColaborador(func, parametros);
      if (!custo) { semCusto += 1; continue; }
      if (!maior || custo.custoHora > maior.custo.custoHora) maior = { func, custo };
    }
    return { insumoId, insumo: insumos.find((i) => i.id === insumoId), pessoas, maior, semCusto };
  }).sort((a, b) => (a.insumo?.descricao ?? a.pessoas[0].cargo).localeCompare(b.insumo?.descricao ?? b.pessoas[0].cargo, 'pt-BR'));

  const semVinculo = ativos.filter((f) => !f.catalogoMaoDeObraId);
  const leCatalogo = insumos.length > 0;

  return (
    <Secao
      icone={<Users size={15} />}
      titulo="Custo-hora por cargo"
      descricao="Como a folha chega ao catálogo: o maior custo por hora entre os ativos de cada cargo vinculado é o preço da mão de obra nas composições."
    >
      <div className="space-y-4">
        {linhas.length === 0 ? (
          <Aviso tom="informativo">
            Nenhum funcionário ativo está vinculado a um insumo de mão de obra do catálogo, então a folha não entra em
            nenhuma composição. O vínculo é feito na ficha, em “É mão de obra direta”.
          </Aviso>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Cargo no catálogo</Th>
                <Th align="right">Ativos</Th>
                <Th align="right">Custo por hora</Th>
                {leCatalogo && <Th align="right">No catálogo</Th>}
                {leCatalogo && <Th align="right">Composições</Th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const noCatalogo = l.insumo;
                const usaFolha = noCatalogo?.precoFonteEfetiva === 'Folha';
                const diverge = usaFolha && l.maior != null && Math.abs(noCatalogo.precoVigente - l.maior.custo.custoHora) >= 0.005;
                return (
                  <tr key={l.insumoId}>
                    <Td>
                      <span className="font-semibold text-slate-900">{noCatalogo?.descricao ?? l.pessoas[0].cargo}</span>
                      {noCatalogo && <span className="ml-1.5 font-mono text-2xs text-slate-500">{noCatalogo.codigo}</span>}
                      {l.maior && (
                        <span className="block text-2xs text-slate-600">
                          Maior:{' '}
                          <button type="button" onClick={() => onAbrirFicha(l.maior!.func.id)} className="font-semibold text-blue-600 hover:underline">
                            {l.maior.func.nome}
                          </button>{' '}
                          · encargos {l.maior.custo.encargosPercentual.toLocaleString('pt-BR')}% ·{' '}
                          {l.maior.custo.jornada.toLocaleString('pt-BR')} h/mês
                        </span>
                      )}
                      {l.semCusto > 0 && (
                        <span className="block text-2xs text-amber-700">
                          {l.semCusto} sem custo definido (salário ou encargos em branco)
                        </span>
                      )}
                    </Td>
                    <Td align="right" mono>{l.pessoas.length}</Td>
                    <Td align="right" mono className="font-bold text-slate-900">
                      {l.maior ? formatBRL(l.maior.custo.custoHora) : '—'}
                    </Td>
                    {leCatalogo && (
                      <Td align="right">
                        {noCatalogo ? (
                          <>
                            <span className="font-mono text-slate-800">{formatBRL(noCatalogo.precoVigente)}</span>
                            <span className={`block text-2xs ${usaFolha && !diverge ? 'text-slate-500' : 'text-amber-700'}`}>
                              {diverge ? 'Diverge do custo da ficha' : rotuloProcedencia(noCatalogo.precoNivel, noCatalogo.precoFonteEfetiva)}
                            </span>
                          </>
                        ) : (
                          <span className="text-2xs text-amber-700">Insumo inativo</span>
                        )}
                      </Td>
                    )}
                    {leCatalogo && <Td align="right" mono>{noCatalogo?.usadoEmComposicoes ?? '—'}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        {leCatalogo && linhas.some((l) => l.insumo && l.insumo.precoFonteEfetiva !== 'Folha') && (
          <Aviso tom="atencao" icone={<AlertTriangle size={14} />}>
            Algum cargo vinculado não está sendo orçado pela folha — o catálogo usa outra fonte. Acontece quando
            nenhum ativo do cargo tem custo definido (salário ou encargos em branco).
          </Aviso>
        )}

        {semVinculo.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Link2Off size={13} className="text-slate-500" aria-hidden />
              Ativos fora das composições <span className="font-mono text-slate-500">{semVinculo.length}</span>
            </p>
            <p className="text-2xs text-slate-600 leading-relaxed max-w-prose">
              Entram no custo da folha, mas em nenhum preço de serviço. Se alguém aqui é mão de obra direta, abra a ficha
              e vincule o cargo; administração e engenharia ficam fora mesmo.
            </p>
            {/* Um nome por botão, e não uma frase corrida: cada um leva à ficha
                onde o vínculo se faz. */}
            <ul className="flex flex-wrap gap-2">
              {semVinculo.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onAbrirFicha(f.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-superficie py-1 pl-1 pr-3 text-2xs transition hover:border-slate-300 ${FOCO}`}
                  >
                    <Avatar nome={f.nome} tamanho="xs" />
                    <span className="font-semibold text-slate-800">{f.nome}</span>
                    <span className="text-slate-500">{f.cargo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Secao>
  );
}
