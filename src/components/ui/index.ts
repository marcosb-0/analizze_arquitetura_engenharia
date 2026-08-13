/**
 * Primitivos de UI. Importe daqui, não dos arquivos individuais.
 *
 *   import { Button, Modal, ModalForm, Field, Input } from './ui';
 *
 * Regra de convivência com o código antigo: tela tocada é tela migrada. Não
 * escreva `<button className="bg-blue-600 …">` novo — foi assim que se chegou a
 * 1.410 combinações distintas de className para 2.833 usos.
 */
export { Button, IconButton } from './Button';
export type { PropsNativas } from './tipos';
export { Field } from './Field';
export type { CampoRenderProps } from './Field';
export { Input, Textarea } from './Input';
export { Select } from './Select';
export { Modal, ModalBody, ModalForm } from './Modal';
export { Drawer } from './Drawer';
export { Card, CardHeader } from './Card';
export { Secao } from './Secao';
export { PaginaAba } from './PaginaAba';
export { Kpi, FaixaKpis } from './Kpi';
export { TableWrap, Th, Td } from './Table';
export { SeletorOrdenacao, CarregarMais } from './ControlesDeLista';
export {
  ALVO,
  ALVO_PERIGO_SEPARADO,
  FOCO,
  FOCO_PERIGO,
  CAMPO_BASE,
  CAMPO_FUNDO,
  CAMPO_LARGURA,
  CAMPO_TAMANHO,
  CAMPO_TAMANHO_MULTILINHA,
  COLUNA_ANCORADA,
  CONTROLE_ALTURA,
  CONTROLE_GRUPO,
  CONTROLE_GRUPO_ITEM,
  PAGINA_LARGURA,
  PREENCHIMENTO,
  SECAO_ESPACO,
} from './tokens';
export type { LarguraPagina } from './tokens';
