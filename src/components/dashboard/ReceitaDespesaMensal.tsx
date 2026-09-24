import { useMemo } from 'react';
import type { LancamentoFinanceiro } from '../../types';

/**
 * Receitas × despesas LANÇADAS por mês (competência pela data do lançamento),
 * nos últimos seis meses. É o único gráfico do painel de Indicadores.
 *
 * - Duas barras por mês em ordem fixa (receita à esquerda), com 2px de
 *   superfície entre elas e topo de 4px — a posição é a codificação
 *   secundária que a cor verde/vermelha precisa para quem tem daltonismo
 *   (validado: claro passa em tudo; escuro fica na faixa 6–8 de ΔE, legal só
 *   com legenda + ordem fixa + valor no hover, que estão aqui).
 * - Cor de série vem de `--serie-receita`/`--serie-despesa` (tema.css), texto
 *   nunca na cor da série.
 * - Hover mostra o valor; a tabela escondida dá a mesma leitura ao leitor de
 *   tela.
 */
interface Props {
  lancamentos: LancamentoFinanceiro[];
  formatar: (valor: number) => string;
  meses?: number;
}

const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function ReceitaDespesaMensal({ lancamentos, formatar, meses = 6 }: Props) {
  const dados = useMemo(() => {
    const hoje = new Date();
    const lista = Array.from({ length: meses }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1 - i), 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { chave, rotulo: NOMES[d.getMonth()], receita: 0, despesa: 0 };
    });
    const porChave = new Map(lista.map((m) => [m.chave, m]));
    for (const l of lancamentos) {
      const mes = porChave.get(l.data.slice(0, 7));
      if (!mes) continue;
      if (l.tipo === 'Receita') mes.receita += l.valor;
      else mes.despesa += l.valor;
    }
    return lista;
  }, [lancamentos, meses]);

  const maximo = Math.max(0, ...dados.flatMap((m) => [m.receita, m.despesa]));
  const altura = (v: number) => `${maximo > 0 ? Math.max(v > 0 ? 2 : 0, (v / maximo) * 100) : 0}%`;
  const vazio = maximo === 0;

  return (
    <figure className="relative m-0">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">Lançado por mês</span>
        <span className="flex items-center gap-3 text-2xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--serie-receita)' }} aria-hidden="true" />
            Receitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--serie-despesa)' }} aria-hidden="true" />
            Despesas
          </span>
        </span>
      </figcaption>

      {vazio ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
          Nenhum lançamento nos últimos {meses} meses.
        </p>
      ) : (
        <div className="relative mt-3" aria-hidden="true">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
          <div className="flex h-28 items-end gap-3 border-b border-slate-300">
            {dados.map((m) => (
              <div key={m.chave} className="group relative flex h-full flex-1 items-end justify-center gap-0.5">
                <div className="w-full max-w-4 rounded-t-[4px]" style={{ height: altura(m.receita), background: 'var(--serie-receita)' }} />
                <div className="w-full max-w-4 rounded-t-[4px]" style={{ height: altura(m.despesa), background: 'var(--serie-despesa)' }} />
                {/* Dica de hover: alvo é a coluna inteira do mês, maior que as barras. */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-superficie px-2.5 py-1.5 text-2xs shadow-[0_8px_16px_-8px_rgb(var(--sombra-cor)/0.3)] group-hover:block">
                  <span className="block font-bold capitalize text-slate-900">{m.rotulo}</span>
                  <span className="block text-slate-600">Receitas <b className="data-font text-slate-900">{formatar(m.receita)}</b></span>
                  <span className="block text-slate-600">Despesas <b className="data-font text-slate-900">{formatar(m.despesa)}</b></span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3">
            {dados.map((m) => (
              <span key={m.chave} className="flex-1 text-center text-2xs font-semibold capitalize text-slate-500">{m.rotulo}</span>
            ))}
          </div>
        </div>
      )}

      {/* Dois cuidados para a tabela escondida não dar ao DOCUMENTO uma 2ª barra
          de rolagem: o `sr-only` vai num <div> (tabela ignora `height: 1px` e
          ficava com 192px) e o <figure> é `relative` (senão o absoluto se ancora
          no <body>, fora do corte do #tab-viewport, e vaza abaixo da janela). */}
      <div className="sr-only">
        <table>
          <caption>Receitas e despesas lançadas por mês</caption>
          <thead><tr><th scope="col">Mês</th><th scope="col">Receitas</th><th scope="col">Despesas</th></tr></thead>
          <tbody>
            {dados.map((m) => (
              <tr key={m.chave}><th scope="row">{m.rotulo}</th><td>{formatar(m.receita)}</td><td>{formatar(m.despesa)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
