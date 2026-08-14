import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { FOCO } from '../ui';

/**
 * Só monta a palheta quando ela abre — e é isso que mantém o cabeçalho barato.
 *
 * `PaletaBusca` assina cinco domínios de dado. Se ela fosse montada junto com o
 * cabeçalho, a barra superior voltaria a ser repintada a cada escrita de
 * cliente, obra ou proposta — exatamente o que a saída do `App` corrigiu (ver o
 * cabeçalho de `Cabecalho.tsx`). Fechada, este componente tem um `useState` e
 * um listener de teclado.
 *
 * `lazy` pelo mesmo motivo em outra escala: a palheta não entra no pacote que
 * carrega antes do login.
 */
const PaletaBusca = lazy(() => import('./PaletaBusca'));

export default function BuscaGlobal() {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // `metaKey` no Mac, `ctrlKey` no resto — e `e.key` minúsculo porque com
      // Shift ou CapsLock ele vem "K".
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberta(true);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  return (
    <>
      {/*
        É BOTÃO com cara de campo, não um `<input>`.

        O desenho do mockup é uma caixa de busca; o comportamento é o de uma
        palheta que abre por cima. Um `<input>` de verdade aqui prometeria que
        dá para digitar no lugar — e ao primeiro caractere o foco saltaria para
        outro campo, dentro do diálogo. O botão diz "isto abre a busca", que é o
        que de fato acontece, e é assim que Linear e GitHub resolvem o mesmo par.
      */}
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label="Buscar (Ctrl+K)"
        className={`mx-auto hidden h-9 w-full max-w-[460px] items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-slate-500 transition hover:border-slate-300 hover:bg-white sm:flex ${FOCO}`}
      >
        <Search size={14} className="shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left text-2xs">Buscar obra, proposta, cliente…</span>
        <kbd className="data-font shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-2xs text-slate-600">
          Ctrl K
        </kbd>
      </button>

      {aberta && (
        // Sem `fallback` visível: o pedaço é minúsculo e um esqueleto piscando
        // sobre o backdrop chamaria mais atenção do que a espera.
        <Suspense fallback={null}>
          <PaletaBusca onFechar={() => setAberta(false)} />
        </Suspense>
      )}
    </>
  );
}
