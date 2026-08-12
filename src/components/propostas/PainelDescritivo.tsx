import { useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, FileText, Lock, Plus, Trash2 } from 'lucide-react';
import { ModeloTexto, PosicaoSecao, SecaoProposta } from '../../types';
import { Button, Card, CardHeader, IconButton, Input, Select, Textarea } from '../ui';
import DrawerModelos from './DrawerModelos';

interface Props {
  propostaId: string;
  secoes: SecaoProposta[];
  modelos: ModeloTexto[];
  carregando: boolean;
  bloqueado: boolean;
  motivoBloqueio?: string;
  onAdd: (propostaId: string, titulo: string, posicao: PosicaoSecao) => Promise<SecaoProposta | null>;
  onInserirModelo: (propostaId: string, modelo: ModeloTexto) => Promise<SecaoProposta | null>;
  onUpdate: (
    id: string,
    patch: Partial<Pick<SecaoProposta, 'titulo' | 'corpo' | 'posicao'>>
  ) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
  onReordenar: (id: string, direcao: -1 | 1) => Promise<void>;
  onAddModelo: Parameters<typeof DrawerModelos>[0]['onAddModelo'];
  onUpdateModelo: Parameters<typeof DrawerModelos>[0]['onUpdateModelo'];
  onAposentarModelo: Parameters<typeof DrawerModelos>[0]['onAposentarModelo'];
}

/**
 * O descritivo técnico da proposta.
 *
 * Fica entre o orçamento e o botão de imprimir porque essa é a ordem em que o
 * documento se monta: os números, depois o texto que os explica, depois a
 * emissão. Antes deste painel o texto vinha de duas colunas globais da empresa
 * e toda proposta saía dizendo a mesma coisa sobre obras diferentes.
 */
export default function PainelDescritivo({
  propostaId,
  secoes,
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
  const [posicaoNova, setPosicaoNova] = useState<PosicaoSecao>('antes');
  const [biblioteca, setBiblioteca] = useState(false);

  const ordenadas = [...secoes].sort(
    (a, b) => a.posicao.localeCompare(b.posicao) || a.ordem - b.ordem
  );
  const semTexto = secoes.filter((s) => s.corpo.trim() === '').length;

  const adicionar = async () => {
    const titulo = tituloNovo.trim();
    if (!titulo) return;
    const criada = await onAdd(propostaId, titulo, posicaoNova);
    if (criada) setTituloNovo('');
  };

  return (
    <Card id="proposta-descritivo" className="space-y-3">
      <CardHeader
        icon={<FileText size={14} />}
        title="Descritivo Técnico"
        description={
          bloqueado
            ? motivoBloqueio
            : 'O que o documento diz sobre ESTA obra: escopo, premissas, exclusões, garantia.'
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
        <p className="text-2xs text-slate-500 py-3">Carregando o descritivo…</p>
      ) : (
        <>
          {ordenadas.length === 0 ? (
            /* Não usa EstadoDaLista: não há filtro nesta tela, então os três
               estados dele viram um só — e o caminho de saída é o formulário
               logo abaixo, que já está visível. */
            <div className="py-4 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700">
                Esta proposta ainda não tem descritivo.
              </p>
              <p className="text-2xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Sem ele o cliente recebe só a tabela de preços. Comece por um modelo da biblioteca ou
                escreva a primeira seção abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordenadas.map((secao, i) => {
                const bloco = ordenadas.filter((s) => s.posicao === secao.posicao);
                const iNoBloco = bloco.findIndex((s) => s.id === secao.id);
                return (
                  <div
                    key={secao.id}
                    className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40"
                  >
                    <div className="flex items-start gap-2">
                      <Input
                        value={secao.titulo}
                        aria-label={`Título da seção ${i + 1}`}
                        disabled={bloqueado}
                        onChange={(e) => {
                          /* Sem estado local por seção: a gravação é otimista e
                             o hook já repinta a lista com o valor digitado. */
                          void onUpdate(secao.id, { titulo: e.target.value });
                        }}
                        className="flex-1 font-semibold"
                      />
                      {!bloqueado && (
                        <div className="flex items-center gap-1 shrink-0">
                          <IconButton
                            rotulo={`Mover "${secao.titulo}" para cima`}
                            disabled={iNoBloco === 0}
                            onClick={() => void onReordenar(secao.id, -1)}
                          >
                            <ArrowUp size={13} />
                          </IconButton>
                          <IconButton
                            rotulo={`Mover "${secao.titulo}" para baixo`}
                            disabled={iNoBloco === bloco.length - 1}
                            onClick={() => void onReordenar(secao.id, 1)}
                          >
                            <ArrowDown size={13} />
                          </IconButton>
                          <IconButton
                            rotulo={`Remover a seção "${secao.titulo}"`}
                            tom="perigo"
                            onClick={() => {
                              if (confirm(`Remover a seção "${secao.titulo}" desta proposta?`)) {
                                void onRemove(secao.id);
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      )}
                    </div>

                    <Textarea
                      rows={4}
                      value={secao.corpo}
                      disabled={bloqueado}
                      aria-label={`Texto da seção "${secao.titulo}"`}
                      placeholder="Escreva aqui o texto desta seção. Cada linha vira um marcador; um parágrafo único sai como texto corrido."
                      onChange={(e) => void onUpdate(secao.id, { corpo: e.target.value })}
                      className="leading-relaxed"
                    />

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-2xs text-slate-500">
                        <span>Imprimir</span>
                        <Select
                          value={secao.posicao}
                          disabled={bloqueado}
                          aria-label={`Posição da seção "${secao.titulo}" no documento`}
                          onChange={(e) =>
                            void onUpdate(secao.id, { posicao: e.target.value as PosicaoSecao })
                          }
                          largura="automatica"
                        >
                          <option value="antes">antes dos valores</option>
                          <option value="depois">depois dos valores</option>
                        </Select>
                      </label>
                      {secao.corpo.trim() === '' && (
                        <span className="text-2xs text-amber-700">
                          Sem texto — não sai no documento.
                        </span>
                      )}
                    </div>
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
                  htmlFor="nova-secao-titulo"
                  className="text-2xs font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Nova seção
                </label>
                <Input
                  id="nova-secao-titulo"
                  value={tituloNovo}
                  placeholder="Ex: Premissas, Exclusões, Metodologia executiva"
                  onChange={(e) => setTituloNovo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void adicionar();
                    }
                  }}
                />
              </div>
              <Select
                value={posicaoNova}
                aria-label="Onde a nova seção entra no documento"
                onChange={(e) => setPosicaoNova(e.target.value as PosicaoSecao)}
                largura="automatica" className="shrink-0"
              >
                <option value="antes">antes dos valores</option>
                <option value="depois">depois dos valores</option>
              </Select>
              <Button onClick={() => void adicionar()} disabled={!tituloNovo.trim()} className="shrink-0">
                <Plus size={13} />
                <span>Adicionar</span>
              </Button>
            </div>
          )}

          {semTexto > 0 && !bloqueado && (
            <p className="text-2xs text-slate-500">
              {semTexto === 1
                ? '1 seção está sem texto e não será impressa.'
                : `${semTexto} seções estão sem texto e não serão impressas.`}
            </p>
          )}
        </>
      )}

      <DrawerModelos
        aberto={biblioteca}
        onFechar={() => setBiblioteca(false)}
        modelos={modelos}
        onInserir={(modelo) => onInserirModelo(propostaId, modelo)}
        onAddModelo={onAddModelo}
        onUpdateModelo={onUpdateModelo}
        onAposentarModelo={onAposentarModelo}
      />
    </Card>
  );
}
