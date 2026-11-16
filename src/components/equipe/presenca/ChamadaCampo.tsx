import { useMemo, useState } from 'react';
import { CabecalhoPagina, FOCO, PaginaAba } from '../../ui';
import Spinner from '../../Spinner';
import { useChamada } from '../../../hooks/useChamada';
import { chavePresenca, dataPorExtenso, diaDaSemanaCurto, diasDaSemanaAberta, inicioDaSemana } from '../../../lib/presenca';
import { hojeISO } from '../../../lib/data';
import ListaChamada from './ListaChamada';

/**
 * A chamada do encarregado — a aba Equipe inteira, para o papel `campo`.
 *
 * O "calendário" é a fileira da semana, e não uma grade de mês: a semana
 * corrente é tudo o que ele pode mexer (`fn_presenca_semana_aberta`), e um mês
 * com 25 dias apagados é 25 lugares para tocar e não acontecer nada. A semana
 * fechada vira histórico e só a gestão corrige.
 */
export default function ChamadaCampo() {
  // Lido uma vez: a chamada aberta à meia-noite não deve trocar de dia sozinha
  // na mão de quem está anotando. Reabrir o app traz o dia novo.
  const [hoje] = useState(hojeISO);
  const [dia, setDia] = useState(hoje);
  const dias = useMemo(() => diasDaSemanaAberta(hoje), [hoje]);
  const { pessoas, lancamentos, loading, marcar, desmarcar, marcarVarios } = useChamada(inicioDaSemana(hoje), hoje);

  const faltamPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dias) m.set(d, pessoas.filter((p) => !lancamentos.has(chavePresenca(p.id, d))).length);
    return m;
  }, [dias, pessoas, lancamentos]);

  return (
    <PaginaAba largura="leitura">
      <CabecalhoPagina
        titulo="Chamada"
        descricao={<span className="text-sm first-letter:">{dataPorExtenso(dia)}{dia === hoje ? ' (hoje)' : ''}</span>}
      />

      <nav aria-label="Dia da chamada" className="-mt-2">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {dias.map((d) => {
            const faltam = faltamPorDia.get(d) ?? 0;
            const ativo = d === dia;
            return (
              <li key={d} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setDia(d)}
                  aria-current={ativo ? 'date' : undefined}
                  aria-label={`${dataPorExtenso(d)}${loading ? '' : faltam === 0 ? ', completo' : `, faltam ${faltam}`}`}
                  className={`flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl border-2 px-3 ${FOCO} ${
                    ativo ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-superficie text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm font-medium">{d === hoje ? 'hoje' : diaDaSemanaCurto(d)}</span>
                  <span className="text-lg font-semibold leading-none">{Number(d.slice(8))}</span>
                  {!loading && pessoas.length > 0 && (
                    <span aria-hidden="true" className={`mt-1 text-xs font-semibold ${faltam === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {faltam === 0 ? '✓' : `faltam ${faltam}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm text-slate-500">Dá para corrigir os dias desta semana. Semanas passadas, só a gestão.</p>
      </nav>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500" role="status">
          <Spinner size={28} />
          <p className="mt-2 text-sm">Carregando a equipe…</p>
        </div>
      ) : pessoas.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-800">Nenhum colaborador ativo. Peça à gestão para cadastrar a equipe.</p>
      ) : (
        <ListaChamada
          dia={dia}
          hoje={hoje}
          pessoas={pessoas}
          lancamentos={lancamentos}
          onMarcar={marcar}
          onDesmarcar={desmarcar}
          onMarcarVarios={marcarVarios}
        />
      )}
    </PaginaAba>
  );
}
