import React from 'react';
import { ListBox, Select as HeroSelect } from '@heroui/react';
import {
  CAMPO_BASE,
  CAMPO_FUNDO,
  CAMPO_LARGURA,
  CAMPO_TAMANHO,
  CONTROLE_ALTURA,
  FundoCampo,
  LarguraCampo,
  Tamanho,
} from './tokens';

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  tamanho?: Tamanho;
  fundo?: FundoCampo;
  /** `automatica` para filtro que não deve tomar a linha. Ver `CAMPO_LARGURA`. */
  largura?: LarguraCampo;
  children?: React.ReactNode;
  className?: string;
}

interface Opcao {
  chave: string;
  valor: string;
  rotulo: React.ReactNode;
  texto: string;
  desabilitada: boolean;
}
interface Grupo {
  rotulo?: string;
  opcoes: Opcao[];
}

// React Aria não aceita chave vazia, e `<option value="">Todas</option>` é o caso comum.
const VAZIO = '__vazio__';

const textoDe = (n: React.ReactNode): string =>
  React.Children.toArray(n)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : React.isValidElement(c) ? textoDe((c.props as { children?: React.ReactNode }).children) : ''))
    .join('');

/** Lê os `<option>`/`<optgroup>` dos filhos (inclusive de `map` e Fragment) como lista. */
function lerOpcoes(children: React.ReactNode, grupos: Grupo[] = [{ opcoes: [] }]): Grupo[] {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const p = c.props as { value?: unknown; disabled?: boolean; label?: string; children?: React.ReactNode };
    if (c.type === 'optgroup') {
      const g: Grupo = { rotulo: p.label, opcoes: [] };
      grupos.push(g);
      lerOpcoes(p.children, [g]);
    } else if (c.type === 'option') {
      const texto = textoDe(p.children);
      const valor = p.value === undefined ? texto : String(p.value);
      grupos[grupos.length - 1].opcoes.push({
        chave: valor === '' ? VAZIO : valor,
        valor,
        rotulo: p.children,
        texto,
        desabilitada: !!p.disabled,
      });
    } else {
      lerOpcoes(p.children, grupos);
    }
  });
  return grupos;
}

// Classes que posicionam o controle no layout do pai ficam na raiz; o resto (peso, cor, tamanho) vai ao gatilho.
const LAYOUT = /^(col-|row-|flex-|shrink|grow|basis|self-|order-|-?m[trblxy]?-|max-w|min-w|w-|h-|absolute|relative|z-|hidden)/;

/**
 * Seletor do HeroUI atrás da interface do `<select>` nativo: os `<option>` viram
 * itens da lista e `onChange` recebe `{ target: { value } }`, então as telas não
 * mudam. Perde o seletor do sistema no celular — decisão tomada em 16/nov/2026.
 *
 * shortcut: só lê value/disabled/label dos filhos e entrega `target.value`;
 * `name`, `multiple` e `form` não existem aqui — acrescentar se algum uso precisar.
 */
export function Select({ tamanho = 'md', fundo = 'branco', largura = 'cheia', className = '', children, value, defaultValue, onChange, disabled, id, title, ...rest }: SelectProps) {
  const grupos = lerOpcoes(children).filter((g) => g.opcoes.length || g.rotulo);
  const todas = grupos.flatMap((g) => g.opcoes);
  const [interno, setInterno] = React.useState(defaultValue === undefined ? '' : String(defaultValue));
  const atual = value === undefined ? interno : String(value);
  // Valor que não está nas opções (ainda carregando): nativo mostrava a primeira; aqui fica sem seleção.
  const chaveAtual = todas.find((o) => o.valor === atual)?.chave ?? null;

  // O `Field` rotula por `htmlFor`, que não nomeia o gatilho do React Aria: liga por aria-labelledby.
  const [rotuloId, setRotuloId] = React.useState<string>();
  React.useEffect(() => {
    const l = id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`) : null;
    if (!l) return;
    if (!l.id) l.id = `${id}-rotulo`;
    setRotuloId(l.id);
  }, [id]);

  const classes = className.split(/\s+/).filter(Boolean);
  const naRaiz = classes.filter((c) => LAYOUT.test(c)).join(' ');
  const noGatilho = classes.filter((c) => !LAYOUT.test(c)).join(' ');

  const aoSelecionar = (chave: React.Key | null) => {
    const o = todas.find((x) => x.chave === chave);
    if (!o) return;
    setInterno(o.valor);
    onChange?.({ target: { value: o.valor, id }, currentTarget: { value: o.valor, id } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  };

  const item = (o: Opcao) => (
    <ListBox.Item key={o.chave} id={o.chave} textValue={o.texto || ' '} isDisabled={o.desabilitada}>
      {o.rotulo}
      <ListBox.ItemIndicator />
    </ListBox.Item>
  );

  return (
    <HeroSelect
      aria-label={rest['aria-label'] ?? (rest['aria-labelledby'] || id ? undefined : 'Selecionar')}
      aria-labelledby={rest['aria-labelledby'] ?? rotuloId}
      aria-describedby={rest['aria-describedby']}
      isInvalid={rest['aria-invalid'] === true || rest['aria-invalid'] === 'true'}
      isRequired={rest['aria-required'] === true || rest['aria-required'] === 'true'}
      isDisabled={disabled}
      selectedKey={chaveAtual}
      onSelectionChange={aoSelecionar}
      className={`${CAMPO_LARGURA[largura]} ${naRaiz}`}
    >
      <HeroSelect.Trigger
        id={id}
        className={`${CAMPO_BASE} ${CAMPO_FUNDO[fundo]} ${CAMPO_TAMANHO[tamanho]} ${CONTROLE_ALTURA[tamanho]} w-full min-h-0 pe-7 flex items-center justify-between gap-2 text-left cursor-pointer data-[disabled]:cursor-not-allowed data-[disabled]:bg-slate-50 data-[disabled]:text-slate-400 data-[invalid]:border-rose-400 ${noGatilho}`}
        ref={(el: HTMLButtonElement | null) => {
          if (el) el.title = title ?? '';
        }}
      >
        <HeroSelect.Value className="truncate text-[length:inherit]" />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>
          {grupos.map((g, i) =>
            g.rotulo ? (
              <ListBox.Section key={g.rotulo + i} aria-label={g.rotulo}>
                {g.opcoes.map(item)}
              </ListBox.Section>
            ) : (
              g.opcoes.map(item)
            ),
          )}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}
