import { useState } from 'react';
import { Link2, Trash2, TriangleAlert } from 'lucide-react';
import type {
  Dependencia,
  EtapaCronograma,
  MudancasCronograma,
  TipoDependencia,
} from '../../../types';
import { detectarCiclo } from '../../../lib/cronograma/grafo';
import { agendar, patchesDe } from '../../../lib/cronograma/agendar';
import { Button, Drawer, Field, IconButton, Input, Select } from '../../ui';
import { useFeedback } from '../../FeedbackContext';

interface Props {
  etapa: EtapaCronograma | null;
  onFechar: () => void;
  /** Só folhas — grupo não liga (fn_dependencia_integridade recusa). */
  folhas: EtapaCronograma[];
  dependencias: Dependencia[];
  podeGerenciar: boolean;
  onAplicar: (mudancas: MudancasCronograma) => Promise<boolean>;
}

const ROTULO_TIPO: Record<TipoDependencia, string> = {
  FS: 'Término → Início',
  SS: 'Início → Início',
  FF: 'Término → Término',
  SF: 'Início → Término',
};

const EXPLICA_TIPO: Record<TipoDependencia, string> = {
  FS: 'só começa depois que a predecessora termina',
  SS: 'começa junto com a predecessora',
  FF: 'termina junto com a predecessora',
  SF: 'termina quando a predecessora começa',
};

/**
 * As predecessoras de uma etapa, em formulário.
 *
 * **Este é o caminho principal, não o alternativo ao arraste.** Arrastar entre
 * duas barras é rápido para uma ligação e péssimo para dez — exige mira, rolagem
 * horizontal e as duas pontas visíveis ao mesmo tempo. Aqui a pessoa lança em
 * série sem sair do lugar, e quem usa teclado tem o recurso inteiro.
 *
 * É o mesmo princípio do `MenuDoCard` no kanban: o gesto é atalho, nunca a única
 * porta.
 */
export default function PainelDependencias({
  etapa,
  onFechar,
  folhas,
  dependencias,
  podeGerenciar,
  onAplicar,
}: Props) {
  return (
    <Drawer
      open={!!etapa}
      onClose={onFechar}
      title="Predecessoras"
      icon={<Link2 size={16} />}
      description={etapa?.nome}
      size="md"
    >
      {etapa && (
        <Corpo
          etapa={etapa}
          folhas={folhas}
          dependencias={dependencias}
          podeGerenciar={podeGerenciar}
          onAplicar={onAplicar}
        />
      )}
    </Drawer>
  );
}

function Corpo({
  etapa,
  folhas,
  dependencias,
  podeGerenciar,
  onAplicar,
}: Omit<Props, 'etapa' | 'onFechar'> & { etapa: EtapaCronograma }) {
  const { toast } = useFeedback();
  const [predecessora, setPredecessora] = useState('');
  const [tipo, setTipo] = useState<TipoDependencia>('FS');
  const [atraso, setAtraso] = useState('0');
  const [salvando, setSalvando] = useState(false);

  const minhas = dependencias.filter((d) => d.sucessoraId === etapa.id);
  const jaLigadas = new Set(minhas.map((d) => d.predecessoraId));
  const nomeDe = (id: string) => folhas.find((f) => f.id === id)?.nome ?? 'Etapa removida';

  /**
   * Candidatas: qualquer folha que não seja a própria etapa, que ainda não
   * esteja ligada, e que não crie ciclo. A checagem de ciclo é feita AQUI, na
   * montagem da lista — assim a opção impossível nem aparece, em vez de ser
   * oferecida e recusada pelo banco depois.
   */
  const candidatas = folhas.filter(
    (f) =>
      f.id !== etapa.id &&
      !jaLigadas.has(f.id) &&
      !detectarCiclo(dependencias, {
        id: 'candidata',
        projetoId: etapa.projetoId,
        predecessoraId: f.id,
        sucessoraId: etapa.id,
        tipo: 'FS',
        atrasoDias: 0,
      })
  );

  /**
   * A ligação e o reagendamento que ela provoca vão na MESMA chamada.
   *
   * Se fossem duas, uma falha no meio deixaria a ligação gravada com datas que
   * a contradizem — e a tela não teria como saber, porque cada chamada
   * isoladamente teria dado certo. É a razão de `fn_aplicar_cronograma` existir.
   *
   * Só as etapas em modo AUTOMÁTICO se movem; as fixadas ganham o aviso de
   * restrição violada e ficam onde estão.
   */
  const aplicarComReagendamento = async (
    mudanca: MudancasCronograma,
    depsResultantes: Dependencia[]
  ): Promise<boolean> => {
    const resultado = agendar({ nos: folhas, dependencias: depsResultantes });
    if (resultado.ciclo) {
      toast.error('Esta ligação criaria um ciclo entre as etapas.');
      return false;
    }
    const reagendadas = patchesDe(resultado);
    const ok = await onAplicar({ ...mudanca, etapas: reagendadas });
    if (ok && reagendadas.length > 0) {
      toast.success(
        `${reagendadas.length} ${reagendadas.length === 1 ? 'etapa foi reagendada' : 'etapas foram reagendadas'}.`
      );
    }
    return ok;
  };

  const adicionar = async () => {
    if (!predecessora) return;
    const nova: Dependencia = {
      id: crypto.randomUUID(),
      projetoId: etapa.projetoId,
      predecessoraId: predecessora,
      sucessoraId: etapa.id,
      tipo,
      atrasoDias: Number(atraso) || 0,
    };
    setSalvando(true);
    const ok = await aplicarComReagendamento({ depCriadas: [nova] }, [...dependencias, nova]);
    setSalvando(false);
    if (!ok) return;
    setPredecessora('');
    setAtraso('0');
    toast.success('Ligação criada.');
  };

  const remover = async (dep: Dependencia) => {
    setSalvando(true);
    // Remover também reagenda: sem a restrição, uma sucessora automática pode
    // voltar para mais cedo, e deixar a data velha seria mentir sobre o prazo.
    const ok = await aplicarComReagendamento(
      { depRemovidas: [dep.id] },
      dependencias.filter((d) => d.id !== dep.id)
    );
    setSalvando(false);
    if (ok) toast.success('Ligação removida.');
  };

  return (
    <div className="p-4 space-y-5 text-left">
      <p className="text-2xs text-slate-500 leading-relaxed">
        Uma predecessora define quando esta etapa pode começar. As etapas em modo
        automático são reagendadas sozinhas; as fixadas apenas avisam quando a data
        não cabe.
      </p>

      {minhas.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-3">
          Esta etapa não depende de nenhuma outra — ela pode começar a qualquer momento.
        </p>
      ) : (
        <ul className="space-y-2">
          {minhas.map((dep) => (
            <li
              key={dep.id}
              className="flex items-start justify-between gap-2 border border-slate-200 rounded p-2"
            >
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-slate-900 truncate">
                  {nomeDe(dep.predecessoraId)}
                </span>
                <span className="block text-2xs text-slate-500">
                  {ROTULO_TIPO[dep.tipo]} — {EXPLICA_TIPO[dep.tipo]}
                  {dep.atrasoDias !== 0 &&
                    `, com ${Math.abs(dep.atrasoDias)} ${
                      Math.abs(dep.atrasoDias) === 1 ? 'dia útil' : 'dias úteis'
                    } de ${dep.atrasoDias > 0 ? 'espera' : 'antecipação'}`}
                </span>
              </div>
              {podeGerenciar && (
                <IconButton
                  rotulo={`Remover a ligação com ${nomeDe(dep.predecessoraId)}`}
                  tom="perigo"
                  tamanho="sm"
                  disabled={salvando}
                  onClick={() => remover(dep)}
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeGerenciar && (
        <div className="border-t border-slate-200 pt-4 space-y-3">
          {candidatas.length === 0 ? (
            <p className="text-2xs text-slate-500 flex items-start gap-1.5">
              <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                Não há outra frente disponível: as restantes já estão ligadas ou criariam um
                ciclo.
              </span>
            </p>
          ) : (
            <>
              <Field label="Depende de">
                {({ id }) => (
                  <Select
                    id={id}
                    value={predecessora}
                    disabled={salvando}
                    onChange={(e) => setPredecessora(e.target.value)}
                  >
                    <option value="">Escolha a frente que vem antes</option>
                    {candidatas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.wbsCodigo} {f.nome}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={tipo}
                      disabled={salvando}
                      onChange={(e) => setTipo(e.target.value as TipoDependencia)}
                    >
                      {(['FS', 'SS', 'FF', 'SF'] as const).map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_TIPO[t]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Espera (dias úteis)" hint="Negativo antecipa">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="number"
                      min={-365}
                      max={365}
                      value={atraso}
                      disabled={salvando}
                      onChange={(e) => setAtraso(e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <Button
                bloco
                carregando={salvando}
                disabled={!predecessora || salvando}
                onClick={adicionar}
              >
                <Link2 size={13} />
                <span>Adicionar predecessora</span>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
