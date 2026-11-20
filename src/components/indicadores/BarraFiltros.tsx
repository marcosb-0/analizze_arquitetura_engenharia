import { useState } from 'react';
import { CalendarRange, SlidersHorizontal, X } from 'lucide-react';
import type { Projeto, SituacaoProjeto } from '../../types';
import { Button, Card, Field, FileiraPilulas, Input, Pilula, Select, Checkbox } from '../ui';
import { SITUACOES } from '../../lib/indicadores/calculos';
import {
  comparaPeriodo,
  formatarIntervalo,
  intervaloValido,
  ROTULO_PERIODO,
  type Intervalo,
  type PresetPeriodo,
} from '../../lib/indicadores/periodo';
import type { ContratoBI, FiltrosBI } from '../../lib/indicadores/tipos';

const PRESETS: PresetPeriodo[] = ['hoje', 'semana', 'mes', 'trimestre', 'ano', 'tudo', 'personalizado'];

interface Props {
  filtros: FiltrosBI;
  onMudar: (mudanca: Partial<FiltrosBI>) => void;
  onLimpar: () => void;
  ativos: number;
  /** Já recortadas pelos OUTROS filtros — ver `opcoesDosFiltros`. */
  obras: Projeto[];
  /** `null` = o papel não lê contratos; o filtro some em vez de ficar vazio. */
  contratos: ContratoBI[] | null;
  responsaveis: { id: string; nome: string }[];
  intervalo: Intervalo;
  anterior: Intervalo;
}

/**
 * A barra de filtros — uma fileira só, acima de tudo que ela filtra.
 *
 * Período em pílulas (são seis opções curtas e saber que existem é metade do
 * valor), e as quatro dimensões em `<select>`, porque obra e contrato são
 * conjuntos abertos. As opções de cada select já vêm recortadas pelos outros
 * filtros: escolher "Pausado" deixa no select de obra só as obras pausadas, e
 * escolher a obra deixa no de contrato só os contratos dela. É o que impede o
 * usuário de montar uma combinação que nunca terá dado.
 */
export default function BarraFiltros({
  filtros, onMudar, onLimpar, ativos, obras, contratos, responsaveis, intervalo, anterior,
}: Props) {
  // No celular as quatro dimensões empilhadas empurravam os KPIs para baixo da
  // dobra. Ficam recolhidas atrás de um botão que mostra quantas estão ligadas;
  // a partir de `sm` a grade aparece sempre.
  const [abertos, setAbertos] = useState(false);
  return (
    <Card className="space-y-4">
      <SeletorPeriodo filtros={filtros} onMudar={onMudar} />

      <Button
        variante="secundario"
        tamanho="sm"
        className="sm:hidden"
        aria-expanded={abertos}
        aria-controls="bi-dimensoes"
        onClick={() => setAbertos((a) => !a)}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        {abertos ? 'Ocultar filtros' : `Filtrar por obra, contrato…${ativos > 0 ? ` (${ativos})` : ''}`}
      </Button>

      <div id="bi-dimensoes" className={`${abertos ? 'grid' : 'hidden'} grid-cols-1 gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4`}>
        <Field label="Obra">
          {(p) => (
            <Select {...p} value={filtros.obraId ?? ''} onChange={(e) => onMudar({ obraId: e.target.value || null })}>
              <option value="">Todas as obras</option>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Select>
          )}
        </Field>
        {contratos && (
          <Field label="Contrato">
            {(p) => (
              <Select {...p} value={filtros.contratoId ?? ''} onChange={(e) => onMudar({ contratoId: e.target.value || null })}>
                <option value="">Todos os contratos</option>
                {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}{c.objeto ? ` · ${c.objeto}` : ''}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Responsável">
          {(p) => (
            <Select {...p} value={filtros.responsavelId ?? ''} onChange={(e) => onMudar({ responsavelId: e.target.value || null })}>
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Situação da obra">
          {(p) => (
            <Select {...p} value={filtros.situacao ?? ''} onChange={(e) => onMudar({ situacao: (e.target.value || null) as SituacaoProjeto | null })}>
              <option value="">Todas as situações</option>
              {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-2xs text-slate-500">
          <span className="font-semibold text-slate-800">{filtros.periodo === 'tudo' ? 'Todo o histórico' : formatarIntervalo(intervalo)}</span>
          {comparaPeriodo(filtros) && <> · comparado com {formatarIntervalo(anterior)}</>}
        </p>
        {ativos > 0 && (
          <Button variante="fantasma" tamanho="sm" onClick={onLimpar}>
            <X size={14} aria-hidden="true" /> Limpar filtros ({ativos})
          </Button>
        )}
      </div>
    </Card>
  );
}

export type FiltroPeriodo = Pick<FiltrosBI, 'periodo' | 'personalizado' | 'comparar'>;

/** Pílulas de período, "comparar" e o intervalo personalizado — também usado na Visão geral do Financeiro. */
export function SeletorPeriodo({ filtros, onMudar }: { filtros: FiltroPeriodo; onMudar: (mudanca: Partial<FiltroPeriodo>) => void }) {
  const custom = filtros.personalizado;
  const customInvalido = filtros.periodo === 'personalizado' && !intervaloValido(custom);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FileiraPilulas rotulo="Período">
          {PRESETS.map((p) => (
            <Pilula
              key={p}
              ativo={filtros.periodo === p}
              onClick={() => onMudar({ periodo: p })}
              icone={p === 'personalizado' ? <CalendarRange size={14} /> : undefined}
            >
              {ROTULO_PERIODO[p]}
            </Pilula>
          ))}
        </FileiraPilulas>
        <Checkbox
          checked={comparaPeriodo(filtros)}
          disabled={filtros.periodo === 'tudo'}
          onChange={(v) => onMudar({ comparar: v })}
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800"
        >
          Comparar com o período anterior
        </Checkbox>
      </div>

      {filtros.periodo === 'personalizado' && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="De" erro={customInvalido ? 'A data inicial precisa ser anterior à final.' : undefined}>
            {(p) => <Input {...p} type="date" value={custom.de} max={custom.ate || undefined} onChange={(e) => onMudar({ personalizado: { ...custom, de: e.target.value } })} />}
          </Field>
          <Field label="Até">
            {(p) => <Input {...p} type="date" value={custom.ate} min={custom.de || undefined} onChange={(e) => onMudar({ personalizado: { ...custom, ate: e.target.value } })} />}
          </Field>
        </div>
      )}
    </>
  );
}
