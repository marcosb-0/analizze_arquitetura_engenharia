import { AlertTriangle, Clock, UserX } from 'lucide-react';
import { AgregadosComposicao, LinhaHH } from '../../types';
import { formatBRL } from '../../lib/preco';
import { participacao } from '../../lib/composicao';
import { corProcedencia, nivelDaFonte, rotuloProcedencia } from './acoesInsumo';
import { Aviso, PREENCHIMENTO } from '../ui';

/**
 * O que a composição diz além do custo: quanta hora ela consome, em que
 * proporção entre mão de obra e material, e quais cargos ela pede.
 *
 * Todos os números vêm de `catalogo_composicao_agregados` /
 * `catalogo_composicao_hh` — nada é somado aqui. Os percentuais SÃO calculados
 * localmente, mas são divisão de dois números do mesmo objeto, não uma segunda
 * apuração do custo.
 */

const CATEGORIAS: { chave: keyof AgregadosComposicao; rotulo: string; barra: string; texto: string }[] = [
  { chave: 'custoMaoDeObra', rotulo: 'Mão de obra', barra: PREENCHIMENTO.destaque, texto: 'text-violet-700' },
  { chave: 'custoMaterial', rotulo: 'Material', barra: PREENCHIMENTO.acao, texto: 'text-blue-700' },
  { chave: 'custoEquipamento', rotulo: 'Equipamento', barra: PREENCHIMENTO.atencao, texto: 'text-amber-700' },
  { chave: 'custoServico', rotulo: 'Serviço', barra: PREENCHIMENTO.positivo, texto: 'text-emerald-700' },
  { chave: 'custoTaxa', rotulo: 'Taxa', barra: PREENCHIMENTO.neutro, texto: 'text-slate-600' },
];

const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

interface ResumoComposicaoProps {
  agregados?: AgregadosComposicao;
  hh: LinhaHH[];
  unidade: string;
  /** Quantidade da calculadora — multiplica HH e custo, nunca os percentuais. */
  quantidade: number;
}

export default function ResumoComposicao({ agregados, hh, unidade, quantidade }: ResumoComposicaoProps) {
  if (!agregados) {
    return (
      <p className="text-2xs text-slate-500 leading-relaxed">
        Sem componentes não há HH nem quebra por categoria — os dois saem da estrutura, não do preço.
      </p>
    );
  }

  const semVinculo = hh.filter((c) => c.funcionariosVinculados === 0 && c.ehHora);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-[0.08em] flex items-center gap-1">
            <Clock size={12} aria-hidden /> {quantidade === 1 ? `HH por ${unidade}` : 'HH total'}
          </span>
          <span className="block mt-1 text-xl font-bold text-violet-700 font-mono leading-none">
            {numero(agregados.hhPorUnidade * quantidade)} h
          </span>
          {agregados.hhForaDeHora > 0 && (
            <span className="block mt-1.5 text-2xs text-amber-700 leading-snug">
              {agregados.hhForaDeHora} item(ns) de mão de obra fora de hora (mensalista ou empreitada)
              entram no custo mas não neste HH.
            </span>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-3">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-[0.08em]">
            {quantidade === 1 ? `Custo por ${unidade}` : 'Custo total'}
          </span>
          <span className="block mt-1 text-xl font-bold text-slate-900 font-mono leading-none">
            {formatBRL(agregados.custoTotal * quantidade)}
          </span>
          <span className="block mt-1 text-2xs text-slate-500">
            {agregados.qtdFolhas} insumo(s) final(is) · {agregados.profundidade} nível(is)
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-900">Composição do custo</h4>
        {CATEGORIAS.map((cat) => {
          const valor = agregados[cat.chave] as number;
          if (valor <= 0) return null;
          const pct = participacao(valor, agregados.custoTotal);
          return (
            <div key={cat.rotulo} className="flex items-center gap-2">
              <span className={`text-2xs font-bold w-24 shrink-0 ${cat.texto}`}>{cat.rotulo}</span>
              {/* A barra é decorativa: o número ao lado é o dado, e por isso ela é
                  `aria-hidden`. Decorativa não quer dizer invisível — `amber-500`
                  ficava a 1,95:1 da trilha e `emerald-500` a 2,26:1, ou seja, duas
                  das cinco categorias praticamente não apareciam. Os tons agora vêm
                  de `PREENCHIMENTO`, que é medido. */}
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" aria-hidden>
                <div className={`h-full ${cat.barra} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="text-2xs font-mono font-bold text-slate-700 w-14 text-right shrink-0">
                {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </span>
              <span className="text-2xs font-mono text-slate-600 w-24 text-right shrink-0">
                {formatBRL(valor * quantidade)}
              </span>
            </div>
          );
        })}
      </div>

      {hh.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold text-slate-900">Mão de obra por cargo</h4>
          {hh.map((cargo) => (
            <div key={cargo.insumoId} className="flex items-center justify-between gap-2 text-2xs">
              <span className="truncate text-slate-700 font-semibold" title={cargo.descricao}>
                {cargo.descricao}
              </span>
              <span className="flex items-center gap-2 shrink-0 font-mono">
                <span className="text-slate-700 font-bold">
                  {numero(cargo.coefAcumulado * quantidade)} {cargo.unidade}
                </span>
                <span className={`font-bold uppercase text-2xs ${corProcedencia(nivelDaFonte(cargo.precoFonte))}`}>
                  {rotuloProcedencia(nivelDaFonte(cargo.precoFonte), cargo.precoFonte)}
                </span>
                <span className="text-slate-800 font-bold w-20 text-right">{formatBRL(cargo.custo * quantidade)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* O aviso que fecha o vínculo com a aba Equipe: sem funcionário
          vinculado, este cargo é orçado pelo preço do catálogo e não pelo
          que a empresa efetivamente paga. */}
      {semVinculo.length > 0 && (
        <Aviso tom="neutro" icone={<UserX size={14} />}>
          <strong className="font-semibold">
            {semVinculo.length} cargo{semVinculo.length > 1 ? 's' : ''} sem ninguém da folha vinculado
          </strong>{' '}
          ({semVinculo.map((c) => c.descricao.split(' COM ')[0]).join(', ')}). Orçado{semVinculo.length > 1 ? 's' : ''} pelo
          preço de referência do catálogo; para usar o custo real, vincule o colaborador ao cargo na ficha
          dele, na aba Equipe.
        </Aviso>
      )}

      {agregados.folhasSemPreco > 0 && (
        <Aviso tom="atencao" icone={<AlertTriangle size={14} />}>
          {agregados.folhasSemPreco} insumo(s) desta composição estão sem preço. O custo total está
          incompleto — não é que valham zero.
        </Aviso>
      )}

      {agregados.folhasInativas > 0 && (
        <Aviso tom="atencao" icone={<AlertTriangle size={14} />}>
          {agregados.folhasInativas} insumo(s) desativado(s) continuam somando preço aqui. Troque ou
          remova.
        </Aviso>
      )}
    </div>
  );
}
