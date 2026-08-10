import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Clock, Users } from 'lucide-react';
import { HHDaEtapa } from '../../types';
import { etapaHHService } from '../../services/etapaHHService';
import { useEmpresaConfigDados } from '../../contexts/DadosContext';
import { EMPRESA_FALLBACK } from '../../constants/empresa';
import { formatBRL } from '../../lib/preco';
import { equipeNecessaria, sugerirDuracao } from '../../lib/hh';
import { duracaoDiasUteis, somarDiasUteis } from '../../lib/cronograma/calendario';
import Spinner from '../Spinner';
import { Button, Input } from '../ui';

/**
 * HH previsto da etapa e o prazo que ele implica.
 *
 * SUGERE, NUNCA SOBRESCREVE. O CPM roda no cliente e recalcula o caminho
 * crítico a partir das datas; mexer no fim por baixo rearranjaria o cronograma
 * inteiro sem ninguém ter pedido. Por isso o número aparece ao lado do que está
 * agendado e o botão de aplicar é do usuário.
 *
 * Só aparece na EDIÇÃO: etapa nova ainda não tem insumo vinculado, e um painel
 * dizendo "0 h" na criação seria ruído em toda etapa criada.
 */
interface PainelHHEtapaProps {
  etapaId: string;
  dataInicio: string;
  dataFim: string;
  /** Aplica o prazo sugerido — o usuário decide, o painel só oferece. */
  onAplicarPrazo: (novaDataFim: string) => void;
  desabilitado?: boolean;
}

const numero = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export default function PainelHHEtapa({
  etapaId,
  dataInicio,
  dataFim,
  onAplicarPrazo,
  desabilitado = false,
}: PainelHHEtapaProps) {
  // Lido do contexto e não recebido por prop: atravessar a jornada do conector
  // da aba até aqui passaria por quatro componentes que não têm nada a ver com
  // custo-hora. `empresa_config` é linha única e `auth_read_empresa_config`
  // libera SELECT para qualquer autenticado, então o provedor global responde.
  const { empresa } = useEmpresaConfigDados();
  const jornadaDiaria = empresa?.jornadaDiariaHoras ?? EMPRESA_FALLBACK.jornadaDiariaHoras;

  const [dados, setDados] = useState<HHDaEtapa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [equipeTexto, setEquipeTexto] = useState('4');

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    etapaHHService
      .daEtapa(etapaId)
      .then((d) => {
        if (!cancelado) setDados(d);
      })
      // Silencioso de propósito: é um painel informativo dentro de um
      // formulário de edição. Um toast de erro aqui atrapalharia quem só quer
      // renomear a etapa, e o painel simplesmente não aparece.
      .catch(() => {
        if (!cancelado) setDados(null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [etapaId]);

  if (carregando) {
    return (
      <div className="flex justify-center py-3">
        <Spinner size={14} />
      </div>
    );
  }

  if (!dados || dados.hhTotal <= 0) return null;

  const tamanhoEquipe = Number(equipeTexto.trim().replace(',', '.'));
  const sugestao = sugerirDuracao(dados.hhTotal, tamanhoEquipe, jornadaDiaria);
  // Dias ÚTEIS, com o mesmo calendário (e feriados) que o CPM usa para agendar:
  // comparar a sugestão contra dias corridos daria uma diferença que não é de
  // produtividade, é de fim de semana.
  const diasAgendados = dataInicio && dataFim ? duracaoDiasUteis(dataInicio, dataFim) : null;
  const exigida =
    diasAgendados != null && diasAgendados > 0
      ? equipeNecessaria(dados.hhTotal, diasAgendados, jornadaDiaria)
      : null;

  const aplicar = () => {
    if (!sugestao || !dataInicio) return;
    // `somarDiasUteis` e não aritmética de Date: a duração é em dias úteis, e
    // o helper já pula fim de semana e feriado com o mesmo calendário do CPM.
    // Também evita o `new Date(string)` sobre coluna `date`, que volta um dia.
    onAplicarPrazo(somarDiasUteis(dataInicio, sugestao.dias - 1));
  };

  return (
    <div className="bg-violet-50/50 border border-violet-200 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-2xs font-bold text-violet-900 uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={11} aria-hidden /> HH previsto desta etapa
        </span>
        <span className="font-mono font-extrabold text-violet-900">
          {numero(dados.hhTotal)} h
        </span>
      </div>

      {dados.hhPorCargo.length > 0 && (
        <div className="space-y-0.5">
          {dados.hhPorCargo.map((c) => (
            <div key={c.insumoId} className="flex items-center justify-between gap-2 text-2xs">
              <span className="truncate text-slate-600" title={c.descricao}>{c.descricao}</span>
              <span className="font-mono text-slate-700 shrink-0">
                {numero(c.horas)} h · {formatBRL(c.custo)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 pt-1 border-t border-violet-200/70">
        <div className="space-y-1 w-24">
          <label htmlFor="hh-equipe" className="text-2xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Users size={10} aria-hidden /> Equipe
          </label>
          <Input
            id="hh-equipe"
            type="text"
            inputMode="numeric"
            value={equipeTexto}
            onChange={(e) => setEquipeTexto(e.target.value)} mono
          />
        </div>
        <div className="flex-1 min-w-0">
          {sugestao ? (
            <p className="text-2xs text-slate-700 leading-relaxed">
              {tamanhoEquipe} pessoa{tamanhoEquipe === 1 ? '' : 's'} × {numero(jornadaDiaria)} h/dia ={' '}
              <strong className="font-mono">{numero(sugestao.capacidadeDiaria)} h/dia</strong> →{' '}
              <strong className="text-violet-900">{sugestao.dias} dia{sugestao.dias === 1 ? '' : 's'}</strong>
              {diasAgendados != null && (
                <span className="text-slate-500"> · agendado: {diasAgendados} dia{diasAgendados === 1 ? '' : 's'}</span>
              )}
            </p>
          ) : (
            <p className="text-2xs text-slate-500">Informe o tamanho da equipe para ver o prazo.</p>
          )}
        </div>
        {sugestao && (
          <Button
            type="button"
            variante="secundario"
            disabled={desabilitado || !dataInicio}
            onClick={aplicar}
          >
            <CalendarClock size={12} />
            <span>Aplicar prazo</span>
          </Button>
        )}
      </div>

      {exigida != null && sugestao != null && exigida > tamanhoEquipe && (
        <p className="text-2xs text-amber-900 font-semibold leading-relaxed bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Para fechar em {diasAgendados} dia{diasAgendados === 1 ? '' : 's'} seriam necessárias{' '}
          <strong>{exigida} pessoas</strong>, não {tamanhoEquipe}.
        </p>
      )}

      {/* Dois avisos que impedem o número de parecer mais completo do que é. */}
      {dados.origem === 'ponderado' && (
        <p className="text-2xs text-slate-600 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={11} className="text-slate-500 mt-0.5 shrink-0" aria-hidden />
          Aproximado: nenhum insumo está amarrado diretamente a esta etapa, então a quantidade foi
          rateada pelo peso do vínculo com o orçamento — e o peso reparte valor, não hora.
        </p>
      )}
      {dados.insumosSemHH > 0 && (
        <p className="text-2xs text-slate-600 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={11} className="text-slate-500 mt-0.5 shrink-0" aria-hidden />
          {dados.insumosSemHH} insumo(s) desta etapa não têm mão de obra em hora (composição sem
          estrutura aberta, material ou serviço). O HH acima cobre só o resto.
        </p>
      )}
    </div>
  );
}
