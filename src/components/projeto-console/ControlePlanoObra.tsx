import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatBRL } from '../../lib/preco';
import { formatarDataBR } from '../../lib/data';
import { controleObraService } from '../../services/controleObraService';
import type { DadosDaObra } from './useDadosDaObra';
import { Button, Field, Input, Secao, Select } from '../ui';

type Dados = Awaited<ReturnType<typeof controleObraService.carregar>>;

function terminoDoPlano(etapas: unknown): string | null {
  if (!Array.isArray(etapas)) return null;
  const datas = etapas.flatMap((e: { data_fim?: unknown }) =>
    typeof e.data_fim === 'string' ? [e.data_fim] : []);
  return datas.length ? datas.sort().at(-1) ?? null : null;
}

interface Props { projetoId: string; dados: DadosDaObra; podeGerenciar: boolean }

export default function ControlePlanoObra({ projetoId, dados, podeGerenciar }: Props) {
  const [estado, setEstado] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [etapaId, setEtapaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const carregar = useCallback(async () => {
    try { setEstado(await controleObraService.carregar(projetoId)); setErro(''); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar o controle da obra.'); }
  }, [projetoId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const ativos = useMemo(() => estado?.compromissos.filter((c) => c.situacao === 'Ativo') ?? [], [estado]);
  const comprometido = ativos.reduce((soma, c) => soma + Number(c.valor), 0);
  const custoConhecido = dados.insumos.reduce((soma, insumo) =>
    soma + (insumo.custoOrigem == null ? 0 : insumo.quantidade * insumo.custoOrigem), 0);
  const semCusto = dados.insumos.filter((i) => i.custoOrigem == null).length;
  const original = estado?.revisoes.at(-1);
  const vigente = estado?.revisoes[0];
  const fimAtual = dados.etapas.map((e) => e.dataFim).filter(Boolean).sort().at(-1);
  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true); setErro('');
    try { await acao(); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setOcupado(false); }
  };

  return <div className="space-y-5">
    <Secao titulo="Custos comprometidos">
      <p className="text-sm text-slate-600 mb-3">Registre aqui valores já aprovados para compra ou contratação. Eles representam custo reservado, antes do lançamento financeiro.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div>Custo de origem conhecido: <strong>{formatBRL(custoConhecido)}</strong></div>
        <div>Comprometido ativo: <strong>{formatBRL(comprometido)}</strong></div>
        <div>Diferença: <strong>{formatBRL(custoConhecido - comprometido)}</strong></div>
      </div>
      {semCusto > 0 && <p className="text-sm text-amber-800 mb-3">{semCusto} insumo(s) sem custo de origem. A diferença acima é parcial.</p>}
      {podeGerenciar && <form className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-4" onSubmit={(e) => {
        e.preventDefault();
        const numero = Number(valor);
        if (!etapaId || !descricao.trim() || !Number.isFinite(numero) || numero <= 0) { setErro('Informe etapa, descrição e custo maior que zero.'); return; }
        void executar(async () => { await controleObraService.comprometer(projetoId, etapaId, descricao, numero); setDescricao(''); setValor(''); });
      }}>
        <Field id="compromisso-etapa" label="Etapa">{(props) => <Select {...props} value={etapaId} onChange={(e) => setEtapaId(e.target.value)} disabled={ocupado}>
          <option value="">Selecione</option>{dados.folhas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Select>}</Field>
        <Field id="compromisso-descricao" label="Compra ou contratação">{(props) => <Input {...props} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={ocupado} />}</Field>
        <Field id="compromisso-valor" label="Custo reservado (R$)">{(props) => <Input {...props} type="number" min="0.01" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} disabled={ocupado} />}</Field>
        <Button type="submit" disabled={ocupado}>Registrar compromisso</Button>
      </form>}
      {ativos.length === 0 ? <p className="text-sm text-slate-500">Nenhum custo comprometido.</p> :
        <ul className="divide-y divide-slate-200">{ativos.map((c) => <li key={c.id} className="py-2 flex items-center justify-between gap-3 text-sm">
          <span><strong>{dados.etapas.find((e) => e.id === c.etapa_id)?.nome ?? 'Etapa removida'}</strong> · {c.descricao}</span>
          <span className="flex items-center gap-3"><strong>{formatBRL(Number(c.valor))}</strong>{podeGerenciar &&
            <Button type="button" disabled={ocupado} onClick={() => { const justificativa = window.prompt('Motivo do cancelamento:'); if (justificativa?.trim()) void executar(() => controleObraService.cancelar(c.id, justificativa)); }}>Cancelar</Button>}</span>
        </li>)}</ul>}
    </Secao>
    <Secao titulo="Linha de base e revisões aprovadas">
      <p className="text-sm text-slate-600 mb-3">Cada aprovação guarda uma foto imutável dos itens, etapas, vínculos e dependências. A primeira versão é o plano original; a última é o plano vigente.</p>
      {vigente && <div className="text-sm space-y-1 mb-4">
        <p>Original (v{original?.numero}): <strong>{formatBRL(Number(original?.receita_orcada))}</strong> em preço de venda.</p>
        <p>Vigente (v{vigente.numero}): <strong>{formatBRL(Number(vigente.receita_orcada))}</strong> · custo conhecido {vigente.custo_orcado == null ? 'indisponível' : formatBRL(Number(vigente.custo_orcado))}.</p>
        <p>Plano atual: <strong>{formatBRL(dados.totalOrcado)}</strong> · desvio da versão vigente {formatBRL(dados.totalOrcado - Number(vigente.receita_orcada))}.</p>
        <p>Entrega: original {terminoDoPlano(original?.etapas) ? formatarDataBR(terminoDoPlano(original?.etapas)!) : 'sem data'} · vigente {terminoDoPlano(vigente.etapas) ? formatarDataBR(terminoDoPlano(vigente.etapas)!) : 'sem data'} · atual {fimAtual ? formatarDataBR(fimAtual) : 'sem data'}.</p>
        <p>Custo atual conhecido: {formatBRL(custoConhecido)} · variação frente à versão vigente {vigente.custo_orcado == null ? 'indisponível' : formatBRL(custoConhecido - Number(vigente.custo_orcado))}.</p>
      </div>}
      {podeGerenciar && <form className="flex flex-wrap items-end gap-3 mb-4" onSubmit={(e) => {
        e.preventDefault(); if (!motivo.trim()) { setErro('Informe o motivo da aprovação.'); return; }
        void executar(async () => { await controleObraService.aprovarPlano(projetoId, motivo); setMotivo(''); });
      }}><Field id="revisao-motivo" label="Motivo da aprovação ou revisão">{(props) => <Input {...props} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={ocupado} />}</Field>
        <Button type="submit" disabled={ocupado}>{vigente ? 'Aprovar nova revisão' : 'Aprovar plano inicial'}</Button></form>}
      {!vigente ? <p className="text-sm text-slate-500">Nenhuma linha de base aprovada.</p> :
        <ul className="divide-y divide-slate-200">{estado?.revisoes.map((r) => <li key={r.id} className="py-2 text-sm">
          <strong>Versão {r.numero}</strong> · {formatarDataBR(r.aprovado_em.slice(0, 10))} · {r.motivo} · venda {formatBRL(Number(r.receita_orcada))}
        </li>)}</ul>}
    </Secao>
    {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}
  </div>;
}
