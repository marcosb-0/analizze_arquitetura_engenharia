import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button, CabecalhoPagina, FaixaKpis, Field, FileiraPilulas, Input, Kpi, PaginaAba, Pilula, Secao, TableWrap, Td, Th, Typography } from '../../ui';
import Spinner from '../../Spinner';
import { useChamada } from '../../../hooks/useChamada';
import { formatarDataBR, hojeISO } from '../../../lib/data';
import { deslocarMes, inicioDoMes } from '../../../lib/calendarioTarefas';
import {
  chavePresenca,
  csvDetalhado,
  csvResumo,
  descreverPresenca,
  dataPorExtenso,
  diaDaSemanaCurto,
  diasDoPeriodo,
  inicioDaSemana,
  marcacaoDe,
  resumirPorPessoa,
  somarDias,
  type Marcacao,
} from '../../../lib/presenca';
import type { Funcionario, PessoaChamada } from '../../../types';
import { DESCRICAO_EQUIPE } from '../descricao';
import ListaChamada from './ListaChamada';

/** Acima disto a grade dia a dia vira uma parede; fica só o resumo. */
const MAX_DIAS_GRADE = 62;

const SIMBOLO: Record<Marcacao, { letra: string; cor: string }> = {
  Veio: { letra: '✓', cor: 'text-emerald-700' },
  Atrasou: { letra: 'A', cor: 'bg-amber-100 text-amber-700' },
  'Saiu cedo': { letra: 'S', cor: 'bg-amber-100 text-amber-700' },
  'Atrasou e saiu cedo': { letra: 'AS', cor: 'bg-amber-100 text-amber-700' },
  Faltou: { letra: 'F', cor: 'bg-rose-100 text-rose-700' },
};

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  seletor: ReactNode;
  /** Todos, inclusive desligados: o relatório de meses atrás precisa do nome de quem saiu. */
  funcionarios: Funcionario[];
  /** admin/gestão — mesma fronteira de `gestao_all_presencas`. */
  editavel: boolean;
}

/**
 * A presença vista do escritório: o período que se quiser, para a contabilidade.
 *
 * Três blocos, na ordem das perguntas: "quanto faltou no período" (os números),
 * "quem e quando" (a grade e o resumo, que é o que se exporta) e "corrigir um
 * dia" — a gestão edita qualquer dia passado, inclusive da semana que o
 * encarregado já não alcança.
 */
export default function PresencaEquipe({ seletor, funcionarios, editavel }: Props) {
  const [hoje] = useState(hojeISO);
  const [de, setDe] = useState(() => inicioDoMes(hoje));
  const [ate, setAte] = useState(hoje);
  const [diaEdicao, setDiaEdicao] = useState(hoje);
  const edicaoRef = useRef<HTMLDivElement>(null);

  // Período invertido não busca: o banco devolveria vazio e pareceria "ninguém faltou".
  const periodoValido = !!de && !!ate && de <= ate;
  const { pessoas: ativos, lancamentos, loading, marcar, desmarcar, marcarVarios } = useChamada(de, ate, periodoValido);

  const presencas = useMemo(() => [...lancamentos.values()], [lancamentos]);

  /** Ativos + quem saiu mas tem lançamento no período. */
  const pessoasRelatorio = useMemo<PessoaChamada[]>(() => {
    const comLancamento = new Set(presencas.map((p) => p.funcionarioId));
    return funcionarios
      .filter((f) => f.status === 'Ativo' || comLancamento.has(f.id))
      .map((f) => ({ id: f.id, nome: f.status === 'Ativo' ? f.nome : `${f.nome} (desligado)`, cargo: f.cargo }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [funcionarios, presencas]);

  const resumo = useMemo(() => resumirPorPessoa(pessoasRelatorio, presencas), [pessoasRelatorio, presencas]);
  const totais = useMemo(
    () =>
      resumo.reduce(
        (t, r) => ({ faltas: t.faltas + r.faltas, atrasos: t.atrasos + r.atrasos, saidas: t.saidas + r.saidasCedo }),
        { faltas: 0, atrasos: 0, saidas: 0 }
      ),
    [resumo]
  );

  const dias = useMemo(() => (periodoValido ? diasDoPeriodo(de, ate) : []), [periodoValido, de, ate]);
  /** Dia útil (seg–sáb) já passado sem nenhuma anotação: chamada esquecida. */
  const diasSemChamada = useMemo(() => {
    const comAlguma = new Set(presencas.map((p) => p.data));
    return dias.filter((d) => d <= hoje && diaDaSemanaCurto(d) !== 'dom' && !comAlguma.has(d));
  }, [dias, presencas, hoje]);

  const periodo = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte > hoje ? hoje : novoAte);
    setDiaEdicao(novoAte > hoje ? hoje : novoAte);
  };
  const mesPassado = deslocarMes(hoje, -1);

  const abrirDia = (d: string) => {
    setDiaEdicao(d);
    edicaoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * O dia em correção fica preso ao período carregado: fora dele os
   * lançamentos não estão em memória, e a lista mostraria todo mundo "não
   * anotado" num dia já preenchido — convidando a gravar por cima.
   */
  const fimEdicao = ate > hoje ? hoje : ate;
  const diaVisivel = diaEdicao < de ? de : diaEdicao > fimEdicao ? fimEdicao : diaEdicao;

  const sufixoArquivo = `${de}_a_${ate}`;

  return (
    <PaginaAba largura="painel">
      <CabecalhoPagina titulo="Equipe" descricao={DESCRICAO_EQUIPE} />
      <div className="-mt-2">{seletor}</div>

      <Secao
        titulo="Período"
        acoes={
          <FileiraPilulas rotulo="Atalhos de período">
            <Pilula ativo={de === inicioDaSemana(hoje) && ate === hoje} onClick={() => periodo(inicioDaSemana(hoje), hoje)}>Esta semana</Pilula>
            <Pilula ativo={de === inicioDoMes(hoje) && ate === hoje} onClick={() => periodo(inicioDoMes(hoje), hoje)}>Este mês</Pilula>
            <Pilula
              ativo={de === mesPassado && ate === somarDias(inicioDoMes(hoje), -1)}
              onClick={() => periodo(mesPassado, somarDias(inicioDoMes(hoje), -1))}
            >
              Mês passado
            </Pilula>
          </FileiraPilulas>
        }
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label="De">
            {(p) => <Input {...p} type="date" largura="automatica" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} />}
          </Field>
          <Field label="Até" erro={periodoValido || !de || !ate ? undefined : 'O fim vem antes do início.'}>
            {(p) => <Input {...p} type="date" largura="automatica" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variante="secundario" disabled={!periodoValido || loading} onClick={() => baixar(`presenca_resumo_${sufixoArquivo}.csv`, csvResumo(resumo))}>
              <Download size={14} aria-hidden="true" />
              Baixar resumo
            </Button>
            <Button
              variante="secundario"
              disabled={!periodoValido || loading}
              onClick={() => baixar(`presenca_detalhada_${sufixoArquivo}.csv`, csvDetalhado(pessoasRelatorio, presencas))}
            >
              <Download size={14} aria-hidden="true" />
              Baixar dia a dia
            </Button>
          </div>
        </div>
      </Secao>

      {loading ? (
        <div className="flex justify-center py-16 text-blue-600" role="status" aria-label="Carregando presença">
          <Spinner size={20} />
        </div>
      ) : periodoValido && (
        <>
          <FaixaKpis colunas={4} className="rounded-superficie bg-superficie border border-slate-200/70 p-5">
            <Kpi rotulo="Faltas" valor={totais.faltas} detalhe={`${formatarDataBR(de)} a ${formatarDataBR(ate)}`} />
            <Kpi rotulo="Atrasos" valor={totais.atrasos} />
            <Kpi rotulo="Saídas antecipadas" valor={totais.saidas} />
            <Kpi
              rotulo="Dias sem chamada"
              valor={diasSemChamada.length}
              detalhe={diasSemChamada.length > 0 ? `último: ${formatarDataBR(diasSemChamada[diasSemChamada.length - 1])}` : 'seg. a sáb.'}
              onClick={diasSemChamada.length > 0 && editavel ? () => abrirDia(diasSemChamada[diasSemChamada.length - 1]) : undefined}
            />
          </FaixaKpis>

          <Secao titulo="Por colaborador" descricao="O que vai para a contabilidade. Falta sem motivo anotado conta como sem aviso na planilha.">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Colaborador</Th>
                  <Th align="right">Presenças</Th>
                  <Th align="right">Faltas</Th>
                  <Th align="right">Avisou</Th>
                  <Th align="right">Atestado</Th>
                  <Th align="right">Sem aviso</Th>
                  <Th align="right">Atrasos</Th>
                  <Th align="right">Saídas cedo</Th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => (
                  <tr key={r.pessoa.id}>
                    <Td>
                      <span className="font-medium text-slate-800">{r.pessoa.nome}</span>
                      <span className="block text-xs text-slate-500">{r.pessoa.cargo}</span>
                    </Td>
                    <Td align="right" mono>{r.presencas}</Td>
                    <Td align="right" mono className={r.faltas > 0 ? 'font-semibold text-rose-700' : ''}>{r.faltas}</Td>
                    <Td align="right" mono>{r.faltasPorMotivo.Avisou}</Td>
                    <Td align="right" mono>{r.faltasPorMotivo.Atestado}</Td>
                    <Td align="right" mono>{r.faltasPorMotivo['Sem aviso'] + r.faltasPorMotivo['Sem motivo']}</Td>
                    <Td align="right" mono className={r.atrasos > 0 ? 'font-semibold text-amber-700' : ''}>{r.atrasos}</Td>
                    <Td align="right" mono>{r.saidasCedo}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Secao>

          {dias.length <= MAX_DIAS_GRADE ? (
            <Secao
              titulo="Dia a dia"
              descricao={<>✓ veio · A atrasou · S saiu cedo · F faltou · em branco: não anotado.{editavel && ' Toque num dia para corrigir.'}</>}
            >
              <TableWrap>
                <thead>
                  <tr>
                    <Th fixa>Colaborador</Th>
                    {dias.map((d) => (
                      <Th key={d} align="center" className={`px-1 ${diaDaSemanaCurto(d) === 'dom' ? 'bg-slate-100' : ''}`}>
                        {editavel ? (
                          <button type="button" onClick={() => abrirDia(d)} className="rounded-lg hover:text-blue-700 hover:underline" aria-label={`Corrigir ${dataPorExtenso(d)}`}>
                            <span className="block">{diaDaSemanaCurto(d).slice(0, 1)}</span>
                            {Number(d.slice(8))}
                          </button>
                        ) : (
                          <>
                            <span className="block">{diaDaSemanaCurto(d).slice(0, 1)}</span>
                            {Number(d.slice(8))}
                          </>
                        )}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pessoasRelatorio.map((pessoa) => (
                    <tr key={pessoa.id}>
                      <Th fixa scope="row" className="font-medium text-slate-800">{pessoa.nome}</Th>
                      {dias.map((d) => {
                        const p = lancamentos.get(chavePresenca(pessoa.id, d));
                        const s = p ? SIMBOLO[marcacaoDe(p)] : null;
                        return (
                          <Td key={d} align="center" className={`px-1 ${diaDaSemanaCurto(d) === 'dom' ? 'bg-slate-50' : ''}`} title={p ? descreverPresenca(p, true) : undefined}>
                            {s && <span className={`inline-block min-w-6 rounded-lg px-0.5 text-xs font-semibold ${s.cor}`}>{s.letra}</span>}
                            {p && <span className="sr-only">{descreverPresenca(p, true)}</span>}
                          </Td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Secao>
          ) : (
            <Typography type="body-sm" color="muted">
              O período tem {dias.length} dias. A grade dia a dia aparece até {MAX_DIAS_GRADE}; a planilha "dia a dia" traz tudo.
            </Typography>
          )}

          {editavel && (
            <div ref={edicaoRef} className="scroll-mt-4">
              <Secao
                titulo="Corrigir um dia"
                descricao="A mesma chamada do encarregado, para qualquer dia do período. Só aparecem os colaboradores ativos."
                acoes={
                  <Field label="Dia" labelOculto>
                    {(p) => (
                      <Input {...p} type="date" largura="automatica" value={diaVisivel} min={de} max={fimEdicao} onChange={(e) => e.target.value && setDiaEdicao(e.target.value)} />
                    )}
                  </Field>
                }
              >
                <Typography type="body" weight="medium" className="mb-3 first-letter:">{dataPorExtenso(diaVisivel)}</Typography>
                <div className="max-w-2xl">
                  <ListaChamada
                    dia={diaVisivel}
                    hoje={hoje}
                    pessoas={ativos}
                    lancamentos={lancamentos}
                    onMarcar={marcar}
                    onDesmarcar={desmarcar}
                    onMarcarVarios={marcarVarios}
                  />
                </div>
              </Secao>
            </div>
          )}
        </>
      )}
    </PaginaAba>
  );
}
