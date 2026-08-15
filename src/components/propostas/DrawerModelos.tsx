import { useMemo, useState } from 'react';
import { BookOpen, Check, Plus, RotateCcw, Star } from 'lucide-react';
import { EscopoModelo, ModeloTexto, NovoModeloTexto, PosicaoSecao } from '../../types';
import { Button, Chip, Drawer, IconButton, Input, Select, Textarea } from '../ui';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  modelos: ModeloTexto[];
  /**
   * Onde o painel está sendo aberto. Filtra o que se OFERECE — no contrato não
   * faz sentido inserir um modelo marcado como "só proposta". O modo de
   * gerenciamento continua mostrando a biblioteca inteira: é a mesma biblioteca,
   * e escondê-la pela metade faria o mesmo modelo sumir conforme a tela.
   */
  escopo?: 'proposta' | 'contrato';
  /**
   * Devolve a seção/cláusula criada, ou null se a escrita falhou. O tipo é
   * `unknown` porque os dois lados criam coisas diferentes e este painel só
   * precisa saber se deu certo.
   */
  onInserir: (modelo: ModeloTexto) => Promise<unknown | null>;
  onAddModelo: (novo: NovoModeloTexto) => Promise<ModeloTexto | null>;
  onUpdateModelo: (id: string, patch: Partial<NovoModeloTexto>) => Promise<boolean>;
  onAposentarModelo: (id: string, ativo: boolean) => Promise<boolean>;
}

const SEM_CATEGORIA = '__todas__';

/**
 * A biblioteca de textos reutilizáveis, em dois modos no mesmo painel.
 *
 * Vive dentro da aba Propostas, e não junto do papel timbrado em Empresa, por
 * um motivo de acesso e não de arrumação: a matriz de `tabAccess` dá a aba
 * `empresa` a ['admin','financeiro'] e a aba `propostas` a ['admin','gestao'].
 * Com a biblioteca lá, gestão — que é quem escreve proposta — não alcançaria o
 * texto que sai nela, que foi exatamente o problema que este módulo corrige.
 *
 * Inserir um modelo COPIA o texto para a proposta. Editar o modelo depois não
 * mexe em nenhuma proposta já escrita, e é essa separação que impede o
 * documento entregue ao cliente de mudar sozinho.
 */
export default function DrawerModelos({
  aberto,
  onFechar,
  modelos,
  escopo: escopoDaTela = 'proposta',
  onInserir,
  onAddModelo,
  onUpdateModelo,
  onAposentarModelo,
}: Props) {
  const [gerenciando, setGerenciando] = useState(false);
  const [categoria, setCategoria] = useState(SEM_CATEGORIA);
  const [inserindo, setInserindo] = useState<string | null>(null);

  // Formulário de modelo novo. Sem componente à parte porque o corpo do Drawer
  // só monta quando ele abre — o estado já nasce limpo a cada abertura.
  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('Geral');
  // Nasce no escopo da tela em que se está criando: quem escreve um modelo de
  // dentro do contrato quase sempre quer um modelo de contrato.
  const [escopo, setEscopo] = useState<EscopoModelo>(escopoDaTela);
  const [posicao, setPosicao] = useState<PosicaoSecao>('antes');
  const [salvando, setSalvando] = useState(false);

  /** As categorias que já existem — o vocabulário é do negócio, não do código. */
  const categorias = useMemo(
    () => [...new Set(modelos.map((m) => m.categoria))].sort((a, b) => a.localeCompare(b)),
    [modelos]
  );

  const ofereciveis = useMemo(
    () => modelos.filter((m) => m.escopo === escopoDaTela || m.escopo === 'ambos'),
    [modelos, escopoDaTela]
  );

  const visiveis = useMemo(() => {
    const base = gerenciando ? modelos : ofereciveis.filter((m) => m.ativo);
    return base
      .filter((m) => categoria === SEM_CATEGORIA || m.categoria === categoria)
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.ordem - b.ordem);
  }, [gerenciando, modelos, ofereciveis, categoria]);

  const inserir = async (modelo: ModeloTexto) => {
    setInserindo(modelo.id);
    const criada = await onInserir(modelo);
    setInserindo(null);
    // Fecha ao inserir: o efeito é uma seção nova no painel atrás do painel, e
    // manter a biblioteca aberta esconderia justamente o resultado da ação.
    if (criada) onFechar();
  };

  const salvarNovo = async () => {
    if (!titulo.trim()) return;
    setSalvando(true);
    const criado = await onAddModelo({
      titulo,
      corpo,
      categoria: novaCategoria,
      escopo,
      posicao,
      // Vai para o fim da lista: um modelo novo não se impõe à ordem já pensada.
      ordem: Math.max(0, ...modelos.map((m) => m.ordem)) + 10,
      // Nunca nasce padrão. Entrar automaticamente em TODA proposta é a decisão
      // mais cara da biblioteca e tem de ser deliberada, não efeito de criar.
      padrao: false,
    });
    setSalvando(false);
    if (criado) {
      setTitulo('');
      setCorpo('');
    }
  };

  return (
    <Drawer
      open={aberto}
      onClose={onFechar}
      size="xl"
      icon={<BookOpen size={15} />}
      title="Biblioteca de modelos"
      description={
        gerenciando
          ? 'Os textos reutilizáveis da empresa. Editar aqui não altera proposta já escrita.'
          : escopoDaTela === 'contrato'
            ? 'Escolha um texto para copiar neste contrato. Depois de inserido, ele é editável ali.'
            : 'Escolha um texto para copiar nesta proposta. Depois de inserido, ele é editável ali.'
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variante="secundario" onClick={() => setGerenciando((v) => !v)}>
            {gerenciando ? 'Voltar a inserir' : 'Gerenciar modelos'}
          </Button>
          <Button variante="fantasma" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {categorias.length > 1 && (
          <label className="flex items-center gap-2 text-2xs text-slate-500">
            <span className="font-bold uppercase tracking-wider">Tipo de obra</span>
            <Select
              value={categoria}
              aria-label="Filtrar modelos por tipo de obra"
              onChange={(e) => setCategoria(e.target.value)}
              largura="automatica"
            >
              <option value={SEM_CATEGORIA}>Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
        )}

        {visiveis.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            {categoria === SEM_CATEGORIA
              ? 'A biblioteca está vazia. Crie o primeiro modelo em "Gerenciar modelos".'
              : 'Nenhum modelo neste tipo de obra.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visiveis.map((modelo) => (
              <li
                key={modelo.id}
                className={`border rounded-lg p-3 space-y-1.5 ${
                  modelo.ativo ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="truncate">{modelo.titulo}</span>
                      {modelo.padrao && (
                        <Chip
                          tom="atencao"
                          title="Entra automaticamente em toda proposta nova"
                          className="shrink-0 px-2 py-0.5"
                        >
                          padrão
                        </Chip>
                      )}
                      {!modelo.ativo && (
                        <span className="text-2xs text-slate-500 shrink-0">(aposentado)</span>
                      )}
                    </h4>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      {modelo.categoria} · imprime {modelo.posicao} dos valores
                    </p>
                  </div>

                  {gerenciando ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        rotulo={
                          modelo.padrao
                            ? `Deixar de usar "${modelo.titulo}" em toda proposta nova`
                            : `Usar "${modelo.titulo}" em toda proposta nova`
                        }
                        tom={modelo.padrao ? 'acao' : 'neutro'}
                        onClick={() => void onUpdateModelo(modelo.id, { padrao: !modelo.padrao })}
                      >
                        <Star size={13} />
                      </IconButton>
                      <IconButton
                        rotulo={
                          modelo.ativo
                            ? `Aposentar o modelo "${modelo.titulo}"`
                            : `Reativar o modelo "${modelo.titulo}"`
                        }
                        tom={modelo.ativo ? 'perigo' : 'acao'}
                        onClick={() => void onAposentarModelo(modelo.id, !modelo.ativo)}
                      >
                        {modelo.ativo ? <RotateCcw size={13} /> : <Check size={13} />}
                      </IconButton>
                    </div>
                  ) : (
                    <Button
                      tamanho="sm"
                      variante="secundario"
                      carregando={inserindo === modelo.id}
                      onClick={() => void inserir(modelo)}
                      className="shrink-0"
                    >
                      <Plus size={12} />
                      <span>Inserir</span>
                    </Button>
                  )}
                </div>

                {gerenciando ? (
                  <Textarea
                    rows={3}
                    value={modelo.corpo}
                    aria-label={`Texto do modelo "${modelo.titulo}"`}
                    onChange={(e) => void onUpdateModelo(modelo.id, { corpo: e.target.value })}
                    fundo="suave"
                    className="leading-relaxed"
                  />
                ) : (
                  <p className="text-2xs text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-line">
                    {modelo.corpo || 'Modelo sem texto.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {gerenciando && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <h4 className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Novo modelo</h4>
            <Input
              value={titulo}
              placeholder="Título — ex: Exclusões, Metodologia executiva"
              aria-label="Título do novo modelo"
              onChange={(e) => setTitulo(e.target.value)}
            />
            <Textarea
              rows={4}
              value={corpo}
              placeholder="Texto do modelo. Cada linha vira um marcador na impressão; um parágrafo único sai corrido."
              aria-label="Texto do novo modelo"
              onChange={(e) => setCorpo(e.target.value)}
              className="leading-relaxed"
            />
            <div className="flex flex-wrap items-end gap-2">
              <Input
                value={novaCategoria}
                aria-label="Tipo de obra do novo modelo"
                placeholder="Tipo de obra"
                onChange={(e) => setNovaCategoria(e.target.value)}
                largura="automatica"
                list="modelo-categorias"
              />
              <datalist id="modelo-categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Select
                value={escopo}
                aria-label="Onde o modelo pode ser usado"
                onChange={(e) => setEscopo(e.target.value as EscopoModelo)}
                largura="automatica"
              >
                <option value="proposta">só proposta</option>
                <option value="contrato">só contrato</option>
                <option value="ambos">proposta e contrato</option>
              </Select>
              {/* `posicao` só existe na proposta: o contrato numera as
                  cláusulas de forma corrida, sem tabela de valores no meio. */}
              {escopo !== 'contrato' && (
                <Select
                  value={posicao}
                  aria-label="Onde o modelo entra no documento"
                  onChange={(e) => setPosicao(e.target.value as PosicaoSecao)}
                  largura="automatica"
                >
                  <option value="antes">antes dos valores</option>
                  <option value="depois">depois dos valores</option>
                </Select>
              )}
              <Button onClick={() => void salvarNovo()} disabled={!titulo.trim()} carregando={salvando}>
                <Plus size={13} />
                <span>Salvar modelo</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
