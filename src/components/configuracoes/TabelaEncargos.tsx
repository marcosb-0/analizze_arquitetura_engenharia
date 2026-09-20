import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { GrupoEncargo, RubricaEncargo } from '../../types';
import { calcularRubricas, totaisEncargos } from '../../lib/encargos';
import { Aviso, Button, Input, Secao, TableWrap, Td, Th } from '../ui';

/**
 * A tabela de encargos sociais — grupos A, B, C e D, nos dois regimes.
 *
 * Esta tela é uma CALCULADORA: o que ela produz é o percentual único que
 * `fn_custo_hora_folha` já consumia. Nada a jusante sabe que rubricas existem.
 *
 * Três coisas que a tela precisa dizer e que o número sozinho não diz:
 *
 * - **Grupo D é derivado.** As duas linhas mostram a fórmula por extenso e não
 *   aceitam digitação. Ver o grupo D se mover ao editar o INSS é a prova, para
 *   quem usa, de que a conta é de verdade.
 * - **Branco é pergunta em aberto**, e o total não fecha enquanto houver uma.
 *   A tela cobra em vez de somar o que tem.
 * - **"Não incide" é resposta.** B1, B2 e B7 não alcançam o mensalista, e a
 *   célula mostra um traço, não um zero.
 *
 * Os percentuais ficam em estado de TEXTO pelo mesmo motivo de
 * `EmpresaIdentidade`: `number | null` faria "vazio" e "0" virarem a mesma
 * coisa, e 0% é resposta legítima.
 */

interface TabelaEncargosProps {
  rubricas: RubricaEncargo[];
  /** Só para o selo: quem liga a chave é o formulário da identidade. */
  encargosModo: 'Direto' | 'Rubricas';
  onSave: (rubricas: RubricaEncargo[]) => Promise<boolean>;
}

const TITULO_GRUPO: Record<GrupoEncargo, string> = {
  A: 'Grupo A — obrigações sociais',
  B: 'Grupo B — recebem incidência do grupo A',
  C: 'Grupo C — rescisórios, sem incidência do grupo A',
  D: 'Grupo D — reincidências (calculado)',
};

const FORMULA_POR_EXTENSO: Record<string, string> = {
  'A*B': '= Total A × Total B',
  'A*B-A1*B4': '= Total A × Total B − INSS × 13º',
  'A*C2+A8*C1': '= Total A × Aviso trabalhado + FGTS × Aviso indenizado',
};

const GRUPOS: readonly GrupoEncargo[] = ['A', 'B', 'C', 'D'];

/** Aceita vírgula, e distingue vazio de zero. */
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function paraTexto(valor: number | null): string {
  return valor == null ? '' : String(valor).replace('.', ',');
}

function formatarPercentual(valor: number | null): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

export default function TabelaEncargos({ rubricas, encargosModo, onSave }: TabelaEncargosProps) {
  const [rascunho, setRascunho] = useState<Record<string, { h: string; m: string; ativo: boolean }>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const inicial: Record<string, { h: string; m: string; ativo: boolean }> = {};
    for (const r of rubricas) {
      inicial[r.codigo] = {
        h: paraTexto(r.percentualHorista),
        m: paraTexto(r.percentualMensalista),
        ativo: r.ativo,
      };
    }
    setRascunho(inicial);
  }, [rubricas]);

  /** As rubricas como estão na tela agora — a base de todo cálculo ao vivo. */
  const editadas = useMemo<RubricaEncargo[]>(
    () =>
      rubricas.map((r) => {
        const d = rascunho[r.codigo];
        if (!d) return r;
        return {
          ...r,
          percentualHorista: r.formula ? null : paraNumero(d.h),
          percentualMensalista: r.formula ? null : paraNumero(d.m),
          ativo: d.ativo,
        };
      }),
    [rubricas, rascunho]
  );

  const calculadas = useMemo(() => calcularRubricas(editadas), [editadas]);
  const totais = useMemo(() => totaisEncargos(editadas), [editadas]);

  /** Quantas perguntas seguem em aberto — é o que impede o total de fechar. */
  const emBranco = useMemo(
    () =>
      editadas.filter(
        (r) =>
          r.ativo &&
          !r.formula &&
          ((r.aplicaHorista && r.percentualHorista == null) ||
            (r.aplicaMensalista && r.percentualMensalista == null))
      ).length,
    [editadas]
  );

  const alterado = useMemo(
    () =>
      editadas.some((r, i) => {
        const o = rubricas[i];
        return (
          r.percentualHorista !== o.percentualHorista ||
          r.percentualMensalista !== o.percentualMensalista ||
          r.ativo !== o.ativo
        );
      }),
    [editadas, rubricas]
  );

  const editar = (codigo: string, campo: 'h' | 'm', valor: string) =>
    setRascunho((prev) => ({ ...prev, [codigo]: { ...prev[codigo], [campo]: valor } }));

  const alternarAtivo = (codigo: string) =>
    setRascunho((prev) => ({ ...prev, [codigo]: { ...prev[codigo], ativo: !prev[codigo].ativo } }));

  const handleSalvar = async () => {
    setSalvando(true);
    await onSave(editadas);
    setSalvando(false);
  };

  const celulaEditavel = (r: RubricaEncargo, regime: 'h' | 'm') => {
    const incide = regime === 'h' ? r.aplicaHorista : r.aplicaMensalista;
    if (!incide) {
      return (
        <span className="text-slate-500" title="Não incide neste regime">
          —
        </span>
      );
    }
    return (
      <Input
        aria-label={`${r.descricao} — ${regime === 'h' ? 'horista' : 'mensalista'} (%)`}
        value={rascunho[r.codigo]?.[regime] ?? ''}
        onChange={(e) => editar(r.codigo, regime, e.target.value)}
        disabled={!rascunho[r.codigo]?.ativo}
        placeholder="—"
        tamanho="sm"
        fundo="suave"
        largura="percentual"
        mono
        className="text-right"
      />
    );
  };

  return (
    <Secao
      icone={<Calculator size={16} aria-hidden="true" />}
      titulo="Tabela de encargos sociais"
      descricao="Os grupos A, B, C e D somam o percentual que entra no custo-hora da mão de obra própria."
      acoes={
        <Button onClick={handleSalvar} disabled={!alterado || salvando}>
          {salvando ? 'Salvando…' : 'Salvar tabela'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Aviso tom="informativo">
          A estrutura segue o SINAPI, mas os percentuais são seus: eles mudam com o regime
          tributário, a desoneração, a convenção coletiva, o FAP e o estado da obra. Confira cada
          linha contra a sua folha antes de orçar por aqui.
          {encargosModo === 'Direto' && (
            <> Hoje a empresa ainda orça pelo percentual direto — esta tabela está só em conferência.</>
          )}
        </Aviso>

        {emBranco > 0 && (
          <Aviso tom="atencao">
            {emBranco === 1
              ? '1 rubrica ativa ainda está sem percentual'
              : `${emBranco} rubricas ativas ainda estão sem percentual`}
            , então o total não fecha. Preencha, desative a rubrica, ou deixe claro que ela não
            incide. Em branco não é zero: somar o que já existe daria um encargo menor do que o
            real, sem nada na tela indicando isso.
          </Aviso>
        )}

        <TableWrap>
          <thead>
            <tr>
              <Th className="w-16">Código</Th>
              <Th>Rubrica</Th>
              <Th align="right" className="w-32">Horista</Th>
              <Th align="right" className="w-32">Mensalista</Th>
              <Th align="center" className="w-20">Ativa</Th>
            </tr>
          </thead>
          {GRUPOS.map((grupo) => (
            <tbody key={grupo}>
              <tr>
                <Td colSpan={5} className="bg-slate-50 font-semibold text-slate-700">
                  {TITULO_GRUPO[grupo]}
                </Td>
              </tr>
              {calculadas
                .filter((r) => r.grupo === grupo)
                .map((r) => (
                  <tr key={r.codigo} className={r.ativo ? '' : 'opacity-60'}>
                    <Td mono>{r.codigo}</Td>
                    <Td>
                      {r.descricao}
                      {r.calculada && r.formula && (
                        <span className="ml-2 text-slate-500">{FORMULA_POR_EXTENSO[r.formula]}</span>
                      )}
                    </Td>
                    <Td align="right" mono={r.calculada}>
                      {r.calculada ? formatarPercentual(r.valorHorista) : celulaEditavel(r, 'h')}
                    </Td>
                    <Td align="right" mono={r.calculada}>
                      {r.calculada ? formatarPercentual(r.valorMensalista) : celulaEditavel(r, 'm')}
                    </Td>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={r.ativo}
                        onChange={() => alternarAtivo(r.codigo)}
                        aria-label={`${r.descricao} — rubrica ativa`}
                        className="size-4 accent-blue-600"
                      />
                    </Td>
                  </tr>
                ))}
              <tr>
                <Td />
                <Td className="font-semibold text-slate-700">Total {grupo}</Td>
                <Td align="right" mono className="font-semibold text-slate-900">
                  {formatarPercentual(totais[grupo].horista)}
                </Td>
                <Td align="right" mono className="font-semibold text-slate-900">
                  {formatarPercentual(totais[grupo].mensalista)}
                </Td>
                <Td />
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr>
              <Td />
              <Td className="font-bold text-slate-900">Total dos encargos</Td>
              <Td align="right" mono className="font-bold text-slate-900">
                {formatarPercentual(totais.total.horista)}
              </Td>
              <Td align="right" mono className="font-bold text-slate-900">
                {formatarPercentual(totais.total.mensalista)}
              </Td>
              <Td />
            </tr>
          </tfoot>
        </TableWrap>
      </div>
    </Secao>
  );
}
