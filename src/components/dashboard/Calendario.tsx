import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, IconButton } from '../ui';

/**
 * O calendário do canto do painel — desenho do mockup "Analizze - App".
 *
 * É o único bloco da tela inicial que não mostra dado do banco: ele situa a
 * pessoa no mês, e é contra ele que "entrega em 28/02" e "BM parado há 6 dias"
 * ganham escala. Por isso não recebe props de dados — recebê-las faria dele
 * mais um painel de números, que a coluna já tem três.
 *
 * As setas MUDAM o mês de verdade. No mockup elas são decorativas (protótipo
 * estático); aqui um controle que não faz nada seria pior do que não existir.
 */

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function Calendario() {
  const hoje = useMemo(() => new Date(), []);
  const [refMes, setRefMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));

  const { celulas, ehMesDeHoje } = useMemo(() => {
    const ano = refMes.getFullYear();
    const mes = refMes.getMonth();
    // `getDay()` do dia 1 é quantas casas vazias o mês precisa antes de começar.
    const vazias = new Date(ano, mes, 1).getDay();
    // Dia 0 do mês seguinte é o último dia deste mês.
    const totalDias = new Date(ano, mes + 1, 0).getDate();

    const lista: (number | null)[] = [
      ...Array.from({ length: vazias }, () => null),
      ...Array.from({ length: totalDias }, (_, i) => i + 1),
    ];

    return {
      celulas: lista,
      ehMesDeHoje: ano === hoje.getFullYear() && mes === hoje.getMonth(),
    };
  }, [refMes, hoje]);

  const irMes = (passo: number) =>
    setRefMes((m) => new Date(m.getFullYear(), m.getMonth() + passo, 1));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-900">
          {MESES[refMes.getMonth()]} {refMes.getFullYear()}
        </span>
        <span className="flex items-center gap-0.5">
          <IconButton rotulo="Mês anterior" tamanho="sm" onClick={() => irMes(-1)}>
            <ChevronLeft size={14} />
          </IconButton>
          <IconButton rotulo="Próximo mês" tamanho="sm" onClick={() => irMes(1)}>
            <ChevronRight size={14} />
          </IconButton>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-2xs font-semibold text-slate-500">
        {DIAS_DA_SEMANA.map((d, i) => (
          // O índice entra na chave porque S/Q se repetem: "S" de segunda e "S"
          // de sábado são a mesma string e brigariam pela mesma chave.
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {celulas.map((dia, i) => {
          if (dia === null) return <span key={`vazio-${i}`} className="h-7" />;
          const ehHoje = ehMesDeHoje && dia === hoje.getDate();
          return (
            <span
              key={dia}
              aria-current={ehHoje ? 'date' : undefined}
              className={`h-7 flex items-center justify-center rounded-full text-2xs ${
                ehHoje ? 'bg-blue-600 font-bold text-white' : 'text-slate-700'
              }`}
            >
              {dia}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
