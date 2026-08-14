import { AlertTriangle, Calendar, Clock, Clock3, DollarSign, MapPin, Percent, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EtapaCronograma, Funcionario, MedicaoObra, Projeto } from '../../types';
import { AvancoFisicoDetalhado, avisoDoAvanco } from '../../lib/avanco';
import { formatarDataBR } from '../../lib/data';
import { getWorkingDays } from '../../lib/diasUteis';
import { formatBRL } from '../../lib/preco';
import { StatusBadge } from '../../constants/status';
import { Card, FaixaKpis, Kpi, PREENCHIMENTO } from '../ui';

interface Props {
  projeto: Projeto;
  responsavelFuncionario?: Funcionario;
  progressoFisico: number;
  /** A procedência do número acima — ver `avisoDoAvanco`. */
  avancoFisico: AvancoFisicoDetalhado;
  saldoDisponivel: number;
  etapas: EtapaCronograma[];
  medicoes: MedicaoObra[];
}

/**
 * A visão geral da obra — redesenhada em 14/ago/2026 a partir do mockup
 * "Analizze - App".
 *
 * O desenho é o de duas colunas do mockup: à esquerda o que se ACOMPANHA
 * (números da obra e as frentes em curso), à direita o que se CONSULTA
 * (endereço, quem responde) e o que pede ação (riscos). Antes a aba era uma
 * pilha de três blocos onde "Localização e detalhes" — texto que não muda em
 * meses — ocupava metade da largura útil logo abaixo dos números.
 *
 * "Etapas em curso" é o bloco que faltava: a obra tinha avanço agregado no
 * topo e o cronograma inteiro numa aba separada, e nada no meio dizendo QUAIS
 * frentes estão abertas agora. É a pergunta que se faz ao abrir uma obra.
 */
export default function AbaGeral({
  projeto,
  responsavelFuncionario,
  progressoFisico,
  avancoFisico,
  saldoDisponivel,
  etapas,
  medicoes,
}: Props) {
  const avisoAvanco = avisoDoAvanco(avancoFisico);
  const diasUteis = getWorkingDays(projeto.dataInicio, projeto.dataFim);

  /**
   * Só FOLHA: grupo é soma dos filhos (ver `ehFolha` em `EtapaCronograma`), e
   * listar os dois lados faria a mesma frente aparecer duas vezes — uma como
   * "Estrutura 71%" e outra como as duas frentes que a compõem.
   */
  const emCurso = etapas
    .filter((e) => e.ehFolha && !e.ehMarco && e.percentualExecutado < 100)
    .sort((a, b) => b.percentualExecutado - a.percentualExecutado)
    .slice(0, 6);

  const medicoesPendentes = medicoes.filter((m) => m.status === 'Pendente').length;
  const etapasAtrasadas = etapas.filter((e) => e.ehFolha && e.status === 'Atrasado').length;

  const riscos: { id: string; icone: LucideIcon; tom: 'negativo' | 'atencao'; titulo: string; detalhe: string }[] = [];
  if (etapasAtrasadas > 0) {
    riscos.push({
      id: 'atrasadas',
      icone: AlertTriangle,
      tom: 'negativo',
      titulo: `${etapasAtrasadas} ${etapasAtrasadas === 1 ? 'etapa atrasada' : 'etapas atrasadas'}`,
      detalhe: 'Prazo vencido sem conclusão — abra o cronograma.',
    });
  }
  if (medicoesPendentes > 0) {
    riscos.push({
      id: 'medicoes',
      icone: Clock3,
      tom: 'atencao',
      titulo: `${medicoesPendentes} ${medicoesPendentes === 1 ? 'boletim aguardando' : 'boletins aguardando'} aprovação`,
      detalhe: 'O avanço só entra no financeiro depois da aprovação.',
    });
  }
  if (saldoDisponivel < 0) {
    riscos.push({
      id: 'saldo',
      icone: TrendingUp,
      tom: 'negativo',
      titulo: `${formatBRL(Math.abs(saldoDisponivel))} acima do orçado`,
      detalhe: 'O executado passou o valor orçado da obra.',
    });
  }

  return (
    <div id="tab-pane-geral" className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-5 items-start text-left">

      {/* ─────────── acompanhamento ─────────── */}
      <div className="min-w-0 flex flex-col gap-4">
        <Card>
          {/* Quick overview metric row — eram três caixas cinzentas com chip de
              ícone dentro do card do workspace, que por sua vez estava dentro do
              shell. Viraram três números. */}
          <FaixaKpis colunas={3}>
            <Kpi
              icone={<Percent size={13} />}
              rotulo="Evolução física média"
              valor={
                <span className="inline-flex items-center gap-1.5">
                  {progressoFisico}%
                  {/*
                    O KPI mostrava o percentual sem dizer de onde ele vem. Sem
                    vínculo etapa↔orçamento a conta é média simples, e uma etapa sem
                    vínculo não move o número nem quando é medida (§5.2, item 5).
                  */}
                  {avisoAvanco && (
                    <span role="img" aria-label={avisoAvanco} title={avisoAvanco} className="flex">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0" aria-hidden />
                    </span>
                  )}
                </span>
              }
              detalhe={
                avancoFisico.ponderado
                  ? 'Média das etapas ponderada pelo orçamento vinculado a cada uma.'
                  : 'Média simples das etapas: nenhuma tem item de orçamento vinculado.'
              }
            />
            <Kpi
              icone={<DollarSign size={13} />}
              rotulo="Saldo a executar"
              valor={
                <span className={saldoDisponivel >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {formatBRL(saldoDisponivel)}
                </span>
              }
              detalhe="Orçado menos executado — não desconta valores já contratados."
            />
            <Kpi
              icone={<Calendar size={13} />}
              rotulo="Previsão de entrega"
              valor={formatarDataBR(projeto.dataFim)}
              detalhe={`${diasUteis} dias úteis`}
            />
          </FaixaKpis>
        </Card>

        <Card>
          <h3 className="text-xs font-bold text-slate-900">Etapas em curso</h3>
          <div className="mt-3">
            {emCurso.length === 0 ? (
              <p className="py-3 text-2xs text-slate-500">
                {etapas.length === 0
                  ? 'Esta obra ainda não tem cronograma. Monte a EAP para acompanhar as frentes.'
                  : 'Nenhuma frente aberta — todas as etapas estão concluídas.'}
              </p>
            ) : (
              emCurso.map((etapa) => (
                <div
                  key={etapa.id}
                  className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)_60px] items-center gap-4 border-t border-slate-100 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{etapa.nome}</p>
                    <p className="data-font mt-0.5 truncate text-2xs text-slate-500">
                      {etapa.wbsCodigo} · {formatarDataBR(etapa.inicioEfetivo)} a {formatarDataBR(etapa.fimEfetivo)}
                    </p>
                  </div>
                  <span className="justify-self-start">
                    <StatusBadge type="etapa" status={etapa.status} size="sm" />
                  </span>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${etapa.status === 'Atrasado' ? PREENCHIMENTO.negativo : PREENCHIMENTO.acao}`}
                      style={{ width: `${Math.min(100, etapa.percentualExecutado)}%` }}
                    />
                  </div>
                  <span className="data-font text-right text-2xs font-bold text-slate-900">
                    {Math.round(etapa.percentualExecutado)}%
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ─────────── contexto e riscos ─────────── */}
      <div className="min-w-0 flex flex-col gap-4">
        {riscos.length > 0 && (
          <Card className="flex flex-col gap-2.5">
            <span className="text-xs font-bold text-slate-900">Riscos desta obra</span>
            {riscos.map((r) => {
              const Icone = r.icone;
              return (
                <div key={r.id} className="flex items-start gap-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      r.tom === 'negativo' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <Icone size={13} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xs font-semibold leading-snug text-slate-900">{r.titulo}</p>
                    <p className="mt-0.5 text-2xs leading-snug text-slate-500">{r.detalhe}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        <Card className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-900">Localização e prazo</span>
          <div className="flex flex-col gap-1.5 text-2xs text-slate-600">
            <span className="flex items-start gap-2">
              <MapPin size={13} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
              <span>{projeto.enderecoObra}</span>
            </span>
            <span className="flex items-center gap-2">
              <Calendar size={13} className="shrink-0 text-slate-500" aria-hidden="true" />
              Mobilização em {formatarDataBR(projeto.dataInicio)}
            </span>
            <span className="flex items-center gap-2">
              <Clock size={13} className="shrink-0 text-slate-500" aria-hidden="true" />
              {diasUteis} dias úteis (fim de semana descontado)
            </span>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-2xs font-bold text-blue-700">
            {projeto.responsavelInterno
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-2xs font-bold text-slate-900">{projeto.responsavelInterno}</p>
            <p className="truncate text-2xs text-slate-500">
              {responsavelFuncionario?.cargo || 'Responsável a definir'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
