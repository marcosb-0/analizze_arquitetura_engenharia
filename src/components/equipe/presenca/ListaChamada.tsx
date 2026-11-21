import { memo, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Chip, type TomChip, Typography, Titulo } from '../../ui';
import { chavePresenca, descreverPresenca, marcacaoDe, restantesComoPresentes, type Marcacao } from '../../../lib/presenca';
import type { DadosPresenca, MotivoFalta, PessoaChamada, Presenca } from '../../../types';
import BotoesMarcacao, { type AcaoChamada } from './BotoesMarcacao';
import { DialogoFalta, DialogoHora, DialogoTodosVieram } from './Dialogos';

const TOM: Record<Marcacao, TomChip> = {
  Veio: 'positivo',
  Atrasou: 'atencao',
  'Saiu cedo': 'atencao',
  'Atrasou e saiu cedo': 'atencao',
  Faltou: 'negativo',
};

function acoesAtivas(p: Presenca | undefined): Set<AcaoChamada> {
  const s = new Set<AcaoChamada>();
  if (!p) return s;
  if (p.situacao === 'Falta') s.add('faltou');
  else {
    if (p.horaChegada) s.add('atrasou');
    if (p.horaSaida) s.add('saiu');
    if (!p.horaChegada && !p.horaSaida) s.add('veio');
  }
  return s;
}

type Pergunta =
  | { tipo: 'chegada' | 'saida'; pessoa: PessoaChamada }
  | { tipo: 'falta'; pessoa: PessoaChamada }
  | { tipo: 'todos' };

interface Props {
  dia: string;
  hoje: string;
  pessoas: PessoaChamada[];
  lancamentos: ReadonlyMap<string, Presenca>;
  onMarcar: (dados: DadosPresenca) => Promise<boolean>;
  onDesmarcar: (funcionarioId: string, data: string) => Promise<boolean>;
  onMarcarVarios: (lista: DadosPresenca[]) => Promise<boolean>;
}

/**
 * A chamada de UM dia. A ordem é alfabética e NÃO muda ao marcar: mandar o
 * já anotado para o fim faria o próximo nome pular para debaixo do dedo
 * no meio do toque.
 */
function ListaChamada({ dia, hoje, pessoas, lancamentos, onMarcar, onDesmarcar, onMarcarVarios }: Props) {
  /** Cartões reabertos com "Mudar". */
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);

  const faltam = useMemo(() => restantesComoPresentes(pessoas, lancamentos, dia), [pessoas, lancamentos, dia]);
  const nomesQueFaltam = useMemo(() => {
    const ids = new Set(faltam.map((f) => f.funcionarioId));
    return pessoas.filter((p) => ids.has(p.id)).map((p) => p.nome);
  }, [faltam, pessoas]);

  const fecharCartao = (id: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      n.delete(id);
      return n;
    });

  const gravar = async (dados: DadosPresenca) => {
    setPergunta(null);
    if (await onMarcar(dados)) fecharCartao(dados.funcionarioId);
  };

  const escolher = (pessoa: PessoaChamada, acao: AcaoChamada) => {
    if (acao === 'veio') return gravar({ funcionarioId: pessoa.id, data: dia, situacao: 'Presente' });
    if (acao === 'faltou') return setPergunta({ tipo: 'falta', pessoa });
    setPergunta({ tipo: acao === 'atrasou' ? 'chegada' : 'saida', pessoa });
  };

  /** Atraso e saída cedo se somam: anotar um preserva o outro. */
  const gravarHora = (pessoa: PessoaChamada, tipo: 'chegada' | 'saida', hora: string) => {
    const atual = lancamentos.get(chavePresenca(pessoa.id, dia));
    const base = atual?.situacao === 'Presente' ? atual : undefined;
    return gravar({
      funcionarioId: pessoa.id,
      data: dia,
      situacao: 'Presente',
      horaChegada: tipo === 'chegada' ? hora : base?.horaChegada,
      horaSaida: tipo === 'saida' ? hora : base?.horaSaida,
      observacao: atual?.observacao,
    });
  };

  const gravarFalta = (pessoa: PessoaChamada, motivo: MotivoFalta | undefined) =>
    gravar({ funcionarioId: pessoa.id, data: dia, situacao: 'Falta', motivoFalta: motivo });

  const pessoaDaPergunta = pergunta && pergunta.tipo !== 'todos' ? pergunta.pessoa : null;
  const lancPergunta = pessoaDaPergunta ? lancamentos.get(chavePresenca(pessoaDaPergunta.id, dia)) : undefined;

  return (
    <div className="space-y-3">
      <Typography type="body" aria-live="polite">
        {faltam.length === 0
          ? <strong className="text-emerald-700">Todos anotados neste dia.</strong>
          : <>Faltam marcar: <strong className="text-slate-900">{faltam.length}</strong> de {pessoas.length}</>}
      </Typography>

      <ul className="space-y-3">
        {pessoas.map((pessoa) => {
          const lanc = lancamentos.get(chavePresenca(pessoa.id, dia));
          const expandido = !lanc || abertos.has(pessoa.id);
          return (
            <li key={pessoa.id} className="rounded-superficie border border-slate-200 bg-superficie p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Titulo papel="cartao" como="p" className="leading-tight">{pessoa.nome}</Titulo>
                  <Typography type="body" color="muted">{pessoa.cargo}</Typography>
                </div>
                {lanc && !expandido && (
                  <Button
                    variante="secundario"
                    onClick={() => setAbertos((a) => new Set(a).add(pessoa.id))}
                    aria-label={`Mudar a anotação de ${pessoa.nome}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Mudar
                  </Button>
                )}
              </div>

              {lanc && (
                <div className="mt-2">
                  <Chip tom={TOM[marcacaoDe(lanc)]} ponto>{descreverPresenca(lanc)}</Chip>
                </div>
              )}

              {expandido && (
                <div className="mt-3 space-y-2">
                  <BotoesMarcacao
                    nome={pessoa.nome}
                    ativas={acoesAtivas(lanc)}
                    onEscolher={(acao) => escolher(pessoa, acao)}
                  />
                  {lanc && (
                    <div className="flex justify-between gap-2">
                      <Button variante="fantasma" onClick={() => onDesmarcar(pessoa.id, dia).then((ok) => ok && fecharCartao(pessoa.id))}>
                        Apagar anotação
                      </Button>
                      <Button variante="secundario" onClick={() => fecharCartao(pessoa.id)}>Pronto</Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {faltam.length > 0 && (
        // Gruda no pé da tela: é o botão do dia normal, em que todo mundo veio
        // e o encarregado só anota a exceção. `-bottom-4`/`-bottom-6` descontam
        // o padding do `#tab-viewport` — `sticky` conta o padding do scroller,
        // e com `bottom-0` os nomes apareceriam numa fresta abaixo do botão.
        <div className="sticky -bottom-4 lg:-bottom-6 -mx-4 bg-slate-50 px-4 pb-4 pt-2 backdrop-blur lg:mx-0 lg:px-0">
          <button
            type="button"
            onClick={() => setPergunta({ tipo: 'todos' })}
            className="flex w-full min-h-16 items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-100 text-lg font-semibold text-emerald-700 shadow-cartao hover:bg-emerald-200"
          >
            {faltam.length === pessoas.length ? 'Todos vieram' : `Todos os outros vieram (${faltam.length})`}
          </button>
        </div>
      )}

      <DialogoHora
        aberto={pergunta?.tipo === 'chegada' || pergunta?.tipo === 'saida'}
        pergunta={
          pessoaDaPergunta
            ? pergunta?.tipo === 'chegada' ? `Que horas ${pessoaDaPergunta.nome} chegou?` : `Que horas ${pessoaDaPergunta.nome} saiu?`
            : ''
        }
        inicial={pergunta?.tipo === 'chegada' ? lancPergunta?.horaChegada : pergunta?.tipo === 'saida' ? lancPergunta?.horaSaida : undefined}
        sugerirAgora={dia === hoje}
        onConfirmar={(hora) => {
          if (pergunta && (pergunta.tipo === 'chegada' || pergunta.tipo === 'saida')) void gravarHora(pergunta.pessoa, pergunta.tipo, hora);
        }}
        onFechar={() => setPergunta(null)}
      />
      <DialogoFalta
        aberto={pergunta?.tipo === 'falta'}
        nome={pessoaDaPergunta?.nome ?? ''}
        onConfirmar={(motivo) => {
          if (pergunta?.tipo === 'falta') void gravarFalta(pergunta.pessoa, motivo);
        }}
        onFechar={() => setPergunta(null)}
      />
      <DialogoTodosVieram
        aberto={pergunta?.tipo === 'todos'}
        nomes={nomesQueFaltam}
        onConfirmar={() => {
          setPergunta(null);
          void onMarcarVarios(faltam);
        }}
        onFechar={() => setPergunta(null)}
      />
    </div>
  );
}

export default memo(ListaChamada);
