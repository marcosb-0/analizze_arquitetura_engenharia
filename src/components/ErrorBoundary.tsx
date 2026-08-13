import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui';
import { registrarErro } from '../lib/telemetria';

/**
 * O que fica no lugar da tela que quebrou.
 *
 * Até aqui não havia boundary nenhum (§1.3): um `throw` durante o render de
 * qualquer aba derrubava a **aplicação inteira** para tela branca — sem
 * sidebar, sem explicação e sem nada para clicar além do botão voltar. Há
 * `Suspense` desde a divisão em chunks, mas `Suspense` trata espera, não falha.
 *
 * São dois níveis, e a razão é onde o erro nasce:
 *
 * - **por aba** (`variante="aba"`), dentro do `TabViewport`: o quadro
 *   sobrevive. Quem estava no Catálogo continua vendo a sidebar e troca de aba
 *   sem recarregar nada.
 * - **na raiz** (`variante="aplicacao"`), em volta da árvore de contextos: os
 *   19 provedores de dados renderizam ACIMA do viewport, então um `throw` num
 *   hook não passa pelo boundary da aba. Sem este segundo nível, o caso mais
 *   provável de todos — dado inesperado chegando do banco — continuaria dando
 *   tela branca.
 */

/**
 * Falha de import dinâmico não é bug da tela: é o chunk que não veio.
 *
 * Acontece de verdade em produção sempre que um deploy troca o hash dos
 * arquivos enquanto alguém está com a página aberta — a aba pedida some do
 * servidor e o `lazy()` rejeita. "Tentar de novo" não resolve (o arquivo velho
 * não volta); recarregar resolve, porque busca o `index.html` novo. Por isso a
 * mensagem e o botão principal mudam.
 */
function ehFalhaDeChunk(erro: Error): boolean {
  const texto = `${erro.name}: ${erro.message}`;
  return (
    /dynamically imported module/i.test(texto) ||
    /Importing a module script failed/i.test(texto) ||
    /ChunkLoadError/i.test(texto)
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  variante?: 'aba' | 'aplicacao';
  /** Nome do módulo, para a mensagem dizer o que caiu. */
  escopo?: string;
}

interface ErrorBoundaryState {
  erro: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { erro: null };

  static getDerivedStateFromError(erro: Error): ErrorBoundaryState {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    /**
     * O ÚNICO lugar do app por onde passa toda falha de RENDER. O item 39
     * plugou aqui — mas não só aqui: render é a minoria dos erros deste app, e
     * `lib/telemetria` cobre também a `Promise` rejeitada num handler de
     * clique, que não passa por boundary nenhum.
     */
    registrarErro(erro, {
      origem: 'render',
      escopo: this.props.escopo ?? 'aplicação',
      componentes: info.componentStack ?? undefined,
    });
  }

  private tentarDeNovo = () => this.setState({ erro: null });

  private recarregar = () => window.location.reload();

  render() {
    const { erro } = this.state;
    const { children, variante = 'aba', escopo } = this.props;
    if (!erro) return children;

    const chunk = ehFalhaDeChunk(erro);
    const naRaiz = variante === 'aplicacao';
    const titulo = naRaiz ? 'Algo quebrou na aplicação' : `Algo quebrou em ${escopo ?? 'esta tela'}`;

    return (
      <div
        className={
          naRaiz
            ? 'flex h-screen items-center justify-center bg-slate-50 px-4'
            : 'flex items-center justify-center py-16 px-4'
        }
        role="alert"
      >
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-sm p-7 text-center anim-cartao">
          <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-4 border bg-amber-50 border-amber-100">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>

          <h2 className="text-sm font-bold text-slate-900 mb-1.5">
            {chunk ? 'Esta versão do sistema mudou' : titulo}
          </h2>

          <p className="text-xs text-slate-600 leading-relaxed">
            {chunk ? (
              <>
                Uma atualização foi publicada enquanto esta página estava aberta, e o módulo
                pedido não existe mais nesta versão. Recarregar resolve — nada do que você
                salvou se perdeu.
              </>
            ) : (
              <>
                A falha foi contida {naRaiz ? 'aqui' : 'nesta aba'} e{' '}
                {naRaiz
                  ? 'nenhum dado foi alterado por ela.'
                  : 'o resto do sistema continua funcionando — você pode trocar de módulo pelo menu.'}{' '}
                Se ela se repetir, avise a administração com o texto abaixo.
              </>
            )}
          </p>

          {/* A mensagem crua fica visível de propósito: é o que o usuário
              consegue copiar para o chamado. Sem isso o relato chega como
              "deu erro", e a pilha só existe no console de quem já fechou. */}
          <p className="text-2xs text-slate-500 mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left break-words font-mono">
            {erro.message || erro.name}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {chunk ? (
              <Button variante="primario" bloco onClick={this.recarregar}>
                <RefreshCw size={13} />
                Recarregar a página
              </Button>
            ) : (
              <>
                <Button variante="primario" bloco onClick={this.tentarDeNovo}>
                  <RotateCcw size={13} />
                  Tentar de novo
                </Button>
                <Button variante="secundario" bloco onClick={this.recarregar}>
                  Recarregar a página
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
