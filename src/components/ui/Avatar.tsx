/**
 * As iniciais de uma pessoa num disco — a marca de quem é quem no app.
 *
 * ## Quatro grafias para a mesma coisa
 *
 * Contadas antes deste arquivo: `bg-blue-600` + branco (a sessão na sidebar),
 * `bg-slate-900` + branco (a mesma sessão na topbar, redesenhada em 14/ago sem
 * a sidebar junto), `bg-blue-50` + borda + `text-blue-800` + `shadow-xs` (o
 * colaborador na equipe da obra) e `bg-blue-600` outra vez (a conta na aba
 * Acessos). Dois deles são o MESMO usuário na MESMA tela, em duas cores.
 *
 * ## Por que o disco de lista não é azul
 *
 * O azul é a cor de AÇÃO (DESIGN.md, Colors). Uma tabela de trinta contas com
 * trinta discos azuis é trinta falsos convites a clicar, e ainda deixa o único
 * botão azul da tela sem destaque nenhum. Na lista o disco é `slate-100` com
 * texto `slate-700`: identifica sem competir.
 *
 * `solido` (slate-900) fica para a SESSÃO — uma ocorrência por tela, no canto
 * onde ela responde "quem sou eu aqui", e é o tom que a topbar já tinha
 * escolhido no redesenho.
 *
 * A borda saiu junto com a sombra: `shadow-xs` num disco de 40 px sobre cartão
 * branco não desenha nada além de sujar a curva.
 */

const TONS = {
  solido: 'bg-slate-900 text-white',
  suave: 'bg-slate-100 text-slate-700',
} as const;

const TAMANHOS = {
  sm: 'h-8 w-8 text-2xs',
  md: 'h-10 w-10 text-xs',
} as const;

/**
 * As letras do disco.
 *
 * Havia duas regras diferentes para a MESMA pessoa: a topbar dava a inicial de
 * cada parte do nome ("Marcos Barreto" → MB) e a sidebar cortava as duas
 * primeiras letras ("Marcos Barreto" → MA). O comentário da topbar já dizia que
 * dois avatares da mesma pessoa com letras diferentes "é o tipo de incoerência
 * que ninguém relata mas todo mundo estranha" — e continuavam os dois no ar,
 * porque a regra morava no componente de tela, não no avatar.
 *
 * O e-mail perde o domínio antes de tudo: `@` e o que vem depois é do provedor,
 * não da pessoa. Sobra "ma" de marcosbarreto5531@… — pouco, mas ainda melhor do
 * que um boneco genérico, porque identifica a SESSÃO.
 */
function iniciaisDe(nome?: string | null): string {
  const base = (nome || '?').replace(/@.*$/, '').trim();
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  return (
    partes.length > 1 ? partes.slice(0, 2).map((p) => p[0]).join('') : base.slice(0, 2)
  ).toUpperCase();
}

interface AvatarProps {
  /** Nome completo, e-mail, o que houver. */
  nome?: string | null;
  tom?: keyof typeof TONS;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}

export function Avatar({ nome, tom = 'suave', tamanho = 'sm', className = '' }: AvatarProps) {
  const iniciais = iniciaisDe(nome);
  return (
    <span
      // Decorativo: o nome sempre aparece por escrito ao lado ou no `title` de
      // quem chama. Anunciar "JD" antes de "João Dias" só atrapalha.
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold
        ${TONS[tom]} ${TAMANHOS[tamanho]} ${className}`}
    >
      {iniciais}
    </span>
  );
}
