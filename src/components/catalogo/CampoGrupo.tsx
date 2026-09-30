import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useGruposCatalogo } from '../../hooks/useGruposCatalogo';
import { mensagemDeErro } from '../../lib/erros';
import { Button, Input } from '../ui';
import SelectGrupo from './SelectGrupo';

/**
 * Campo "Grupo" do cadastro de insumo, com criação de grupo ali mesmo.
 *
 * Sem o atalho, o primeiro "Impermeabilização" exigiria sair do cadastro, achar
 * uma tela de grupos e voltar — o mesmo beco que fazia gente digitar nomes
 * parecidos no catálogo (ver `BuscaInsumo`). O grupo criado já volta
 * selecionado e aparece no filtro da barra no mesmo instante, porque a lista é
 * uma só (`useGruposCatalogo`).
 */
export default function CampoGrupo({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (grupoId: string | undefined) => void;
}) {
  const { criarGrupo } = useGruposCatalogo();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    if (!nome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const grupo = await criarGrupo(nome);
      onChange(grupo.id);
      setCriando(false);
      setNome('');
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor="insumo-grupo" className="text-2xs font-bold text-slate-500 uppercase">Grupo</label>
      {criando ? (
        <div className="flex gap-2">
          <Input
            id="insumo-grupo"
            autoFocus
            value={nome}
            placeholder="Ex: Impermeabilização"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'insumo-grupo-erro' : undefined}
            onChange={(e) => { setNome(e.target.value); setErro(null); }}
            onKeyDown={(e) => {
              // Enter aqui cria o grupo; sem o preventDefault ele submeteria o
              // cadastro inteiro do insumo.
              if (e.key === 'Enter') { e.preventDefault(); void criar(); }
              if (e.key === 'Escape') { e.stopPropagation(); setCriando(false); setErro(null); }
            }}
          />
          <Button tamanho="md" onClick={criar} disabled={salvando || !nome.trim()} className="shrink-0">
            Criar
          </Button>
          <Button variante="secundario" tamanho="md" onClick={() => { setCriando(false); setErro(null); }} className="shrink-0">
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <SelectGrupo
            id="insumo-grupo"
            sempre
            vazio="Sem grupo"
            value={value}
            onChange={onChange}
            className="font-medium"
          />
          <Button variante="secundario" tamanho="md" onClick={() => setCriando(true)} className="shrink-0" title="Criar um grupo novo">
            <Plus size={13} aria-hidden />
            <span>Novo</span>
          </Button>
        </div>
      )}
      {erro && <p id="insumo-grupo-erro" className="text-2xs text-red-600">{erro}</p>}
    </div>
  );
}
