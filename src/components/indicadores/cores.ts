import { PREENCHIMENTO_HEX } from '../ui';

/**
 * As cores dos gráficos do painel de indicadores.
 *
 * ## A paleta, e por que nesta ordem
 *
 * Validada com o `validate_palette.js` da skill de dataviz, nos dois temas:
 *
 *   claro  #1585cd · #047857 · #5558e8   — todos os 5 testes passam
 *   escuro #3c9bdb · #1b9464 · #8386f5   — todos os 5 testes passam
 *
 * A ORDEM é parte da validação. Azul ao lado do índigo reprova (ΔE 12,7 no
 * claro e 9,9 no escuro: quem enxerga cor normal já confunde os dois), então o
 * verde fica SEMPRE entre eles. Uma série nova entra no fim, e a quarta é o
 * "Outros" cinza, que tem de ser cinza.
 *
 * O verde é `--serie-receita`, e não `--fill-positivo`: no escuro o positivo é
 * `#34c282`, que sai da faixa de luminosidade ao lado do azul.
 *
 * Os tons de ESTADO (aprovada, pendente, rejeitada) não são série: vêm de
 * `PREENCHIMENTO_HEX` e nunca aparecem sem o rótulo ao lado.
 *
 * ## Texto nunca na cor da série
 *
 * Legenda, eixo e dica usam a tinta de texto; a cor fica só no quadradinho ao
 * lado do rótulo. Texto em `#5558e8` sobre o cartão escuro não passa contraste.
 */
export const SERIE = {
  primaria: PREENCHIMENTO_HEX.acao,
  secundaria: 'var(--serie-receita)',
  terciaria: PREENCHIMENTO_HEX.alternativo,
  outros: PREENCHIMENTO_HEX.neutro,
} as const;

export const ESTADO = {
  positivo: PREENCHIMENTO_HEX.positivo,
  atencao: PREENCHIMENTO_HEX.atencao,
  negativo: PREENCHIMENTO_HEX.negativo,
  neutro: PREENCHIMENTO_HEX.neutro,
} as const;

