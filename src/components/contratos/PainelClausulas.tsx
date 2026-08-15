import { useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Lock, Plus, Scale, Trash2 } from 'lucide-react';
import { ClausulaContrato, ModeloTexto } from '../../types';
import { rotuloClausula } from '../../lib/ordinais';
import { useCampoAutoSalvo } from '../../hooks/useCampoAutoSalvo';
import { Button, Card, CardHeader, IconButton, Input, Textarea } from '../ui';
import DrawerModelos from '../propostas/DrawerModelos';

interface Props {
  contratoId: string;
  clausulas: ClausulaContrato[];
  modelos: ModeloTexto[];
  carregando: boolean;
  bloqueado: boolean;
  motivoBloqueio?: string;
  onAdd: (contratoId: string, titulo: string) => Promise<ClausulaContrato | null>;
  onInserirModelo: (contratoId: string, modelo: ModeloTexto) => Promise<ClausulaContrato | null>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<ClausulaContrato, 'titulo' | 'corpo'>>
  ) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
  onReordenar: (id: string, direcao: -1 | 1) => Promise<void>;
  onAddModelo: Parameters<typeof DrawerModelos>[0]['onAddModelo'];
  onUpdateModelo: Parameters<typeof DrawerModelos>[0]['onUpdateModelo'];
  onAposentarModelo: Parameters<typeof DrawerModelos>[0]['onAposentarModelo'];
}

/**
 * As cláusulas do contrato.
 *
 * Gêmeo do `PainelDescritivo` da proposta, com duas diferenças que vêm do
 * domínio: não há escolha de posição (contrato não tem tabela de valores no
 * meio do texto) e cada bloco mostra o ordinal por extenso que sairá no papel —
 * quem edita precisa saber que está mexendo na CLÁUSULA QUARTA.
 *
 * Não foi extraído um componente comum com o painel da proposta: as duas telas
 * se parecem hoje, mas o que as diferencia é exatamente o que tende a crescer
 * (posição lá, ordinal aqui). Abstrair agora seria adivinhar a forma da
 * abstração antes de ter a segunda pressão real sobre ela.
 */
export default function PainelClausulas({
  contratoId,
  clausulas,
  modelos,
  carregando,
  bloqueado,
  motivoBloqueio,
  onAdd,
  onInserirModelo,
  onUpdate,
  onRemove,
  onReordenar,
  onAddModelo,
  onUpdateModelo,
  onAposentarModelo,
}: Props) {
  const [tituloNovo, setTituloNovo] = useState('');
  const [biblioteca, setBiblioteca] = useState(false);

  const ordenadas = [...clausulas].sort((a, b) => a.ordem - b.ordem);
  const semTexto = clausulas.filter((c) => c.corpo.trim() === '').length;

  /**
   * O número impresso conta só as cláusulas COM texto — é a regra do documento,
   * e a tela tem de mostrar a mesma coisa. Uma cláusula em branco no meio da
   * lista não pode fazer a tela dizer "QUINTA" onde o papel dirá "QUARTA".
   */
  const numeroImpresso = (id: string) =>
    ordenadas.filter((c) => c.corpo.trim() !== '').findIndex((c) => c.id === id) + 1;

  const adicionar = async () => {
    const titulo = tituloNovo.trim();
    if (!titulo) return;
    const criada = await onAdd(contratoId, titulo);
    if (criada) setTituloNovo('');
  };

  return (
    <Card id="contrato-clausulas" className="space-y-3">
      <CardHeader
        icon={<Scale size={14} />}
        title="Cláusulas"
        description={
          bloqueado
            ? motivoBloqueio
            : 'O corpo do contrato. Nasce do descritivo negociado na proposta e é editável até a assinatura.'
        }
        actions={
          !bloqueado && (
            <Button variante="secundario" onClick={() => setBiblioteca(true)}>
              <BookOpen size={13} />
              <span>Inserir modelo</span>
            </Button>
          )
        }
      />

      {carregando ? (
        <p className="text-2xs text-slate-500 py-3">Carregando as cláusulas…</p>
      ) : (
        <>
          {ordenadas.length === 0 ? (
            <div className="py-4 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700">Este contrato não tem cláusulas.</p>
              <p className="text-2xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Sem elas o documento sai só com o quadro-resumo. Comece por um modelo da biblioteca
                ou escreva a primeira abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordenadas.map((clausula, i) => {
                const n = numeroImpresso(clausula.id);
                return (
                  <div
                    key={clausula.id}
                    className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider pt-2 shrink-0 w-36">
                        {n > 0 ? rotuloClausula(n) : 'sem texto'}
                      </span>
                      <CampoTitulo
                        clausula={clausula}
                        indice={i}
                        bloqueado={bloqueado}
                        onUpdate={onUpdate}
                      />
                      {!bloqueado && (
                        <div className="flex items-center gap-1 shrink-0">
                          <IconButton
                            rotulo={`Mover "${clausula.titulo}" para cima`}
                            disabled={i === 0}
                            onClick={() => void onReordenar(clausula.id, -1)}
                          >
                            <ArrowUp size={13} />
                          </IconButton>
                          <IconButton
                            rotulo={`Mover "${clausula.titulo}" para baixo`}
                            disabled={i === ordenadas.length - 1}
                            onClick={() => void onReordenar(clausula.id, 1)}
                          >
                            <ArrowDown size={13} />
                          </IconButton>
                          <IconButton
                            rotulo={`Remover a cláusula "${clausula.titulo}"`}
                            tom="perigo"
                            onClick={() => {
                              if (confirm(`Remover a cláusula "${clausula.titulo}"?`)) {
                                void onRemove(clausula.id);
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      )}
                    </div>

                    <CampoCorpo clausula={clausula} bloqueado={bloqueado} onUpdate={onUpdate} />

                    {clausula.corpo.trim() === '' && (
                      <p className="text-2xs text-amber-700">Sem texto — não sai no documento.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {bloqueado ? (
            <p className="text-2xs text-slate-500 flex items-center gap-1.5 pt-1">
              <Lock size={11} className="shrink-0" />
              <span>{motivoBloqueio}</span>
            </p>
          ) : (
            <div className="flex items-end gap-2 pt-1 border-t border-slate-100">
              <div className="flex-1 space-y-1 pt-3">
                <label
                  htmlFor="nova-clausula-titulo"
                  className="text-2xs font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Nova cláusula
                </label>
                <Input
                  id="nova-clausula-titulo"
                  value={tituloNovo}
                  placeholder="Ex: Do Prazo, Do Pagamento, Da Rescisão"
                  onChange={(e) => setTituloNovo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void adicionar();
                    }
                  }}
                />
              </div>
              <Button onClick={() => void adicionar()} disabled={!tituloNovo.trim()} className="shrink-0">
                <Plus size={13} />
                <span>Adicionar</span>
              </Button>
            </div>
          )}

          {semTexto > 0 && !bloqueado && (
            <p className="text-2xs text-slate-500">
              {semTexto === 1
                ? '1 cláusula está sem texto e não será impressa.'
                : `${semTexto} cláusulas estão sem texto e não serão impressas.`}
            </p>
          )}
        </>
      )}

      <DrawerModelos
        aberto={biblioteca}
        onFechar={() => setBiblioteca(false)}
        modelos={modelos}
        escopo="contrato"
        onInserir={(modelo) => onInserirModelo(contratoId, modelo)}
        onAddModelo={onAddModelo}
        onUpdateModelo={onUpdateModelo}
        onAposentarModelo={onAposentarModelo}
      />
    </Card>
  );
}

/**
 * Título e redação da cláusula — os dois campos que gravam sozinhos.
 *
 * Mesma forma, e mesmo motivo, do descritivo da proposta: gravar a cada tecla
 * fazia a resposta atrasada do servidor reescrever o que estava sob o cursor, e
 * o texto voltava três caracteres atrás. Ver o cabeçalho de
 * `useCampoAutoSalvo`. Componentes próprios porque a lista é um `map` e um hook
 * por cláusula só existe se cada cláusula for um componente.
 */
function CampoTitulo({
  clausula,
  indice,
  bloqueado,
  onUpdate,
}: {
  clausula: ClausulaContrato;
  indice: number;
  bloqueado: boolean;
  onUpdate: Props['onUpdate'];
}) {
  const campo = useCampoAutoSalvo({
    valor: clausula.titulo,
    aoSalvar: (titulo) => onUpdate(clausula.id, { titulo }),
  });

  return (
    <Input
      {...campo}
      aria-label={`Título da cláusula ${indice + 1}`}
      disabled={bloqueado}
      className="flex-1 font-semibold"
    />
  );
}

function CampoCorpo({
  clausula,
  bloqueado,
  onUpdate,
}: {
  clausula: ClausulaContrato;
  bloqueado: boolean;
  onUpdate: Props['onUpdate'];
}) {
  const campo = useCampoAutoSalvo({
    valor: clausula.corpo,
    aoSalvar: (corpo) => onUpdate(clausula.id, { corpo }),
  });

  return (
    <Textarea
      {...campo}
      rows={4}
      disabled={bloqueado}
      aria-label={`Texto da cláusula "${clausula.titulo}"`}
      placeholder="Redação da cláusula. Cada linha vira um marcador; um parágrafo único sai corrido."
      className="leading-relaxed"
    />
  );
}
