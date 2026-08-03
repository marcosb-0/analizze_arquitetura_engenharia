import { Coins, FileCheck2, Layers, Settings, Wrench } from 'lucide-react';
import { InsumoCatalogo } from '../../types';

/** O que a barra lateral lista e o formulário oferece — mesma ordem nos dois. */
export const CATEGORIAS: InsumoCatalogo['categoria'][] = [
  'Material',
  'Mão de Obra',
  'Equipamento',
  'Serviço',
  'Taxa',
];

export const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE',
  'PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

export function iconeCategoria(cat: InsumoCatalogo['categoria']) {
  switch (cat) {
    case 'Material': return <Layers size={13} />;
    case 'Mão de Obra': return <Wrench size={13} />;
    case 'Equipamento': return <Settings size={13} />;
    case 'Serviço': return <FileCheck2 size={13} />;
    case 'Taxa': return <Coins size={13} />;
  }
}

export function corCategoria(cat: InsumoCatalogo['categoria']) {
  switch (cat) {
    case 'Material': return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'Mão de Obra': return 'bg-purple-50 text-purple-700 border-purple-100';
    case 'Equipamento': return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'Serviço': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'Taxa': return 'bg-rose-50 text-rose-700 border-rose-100';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}
