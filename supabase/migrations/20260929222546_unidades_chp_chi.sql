-- CHP e CHI: custo horário produtivo e improdutivo de equipamento.
--
-- São as duas unidades com que se orça equipamento (retroescavadeira,
-- betoneira, rolo…): a hora em que a máquina trabalha custa depreciação +
-- juros + manutenção + operação + mão de obra do operador (CHP), e a hora em
-- que ela está na obra parada, à disposição, custa só a parte fixa (CHI).
-- Mesmo equipamento, dois preços — por isso são duas unidades, e não `h`.
--
-- O código fica em MAIÚSCULA, contrariando a regra do domínio: CHP/CHI são
-- siglas, a grafia oficial delas É maiúscula, e não há versão minúscula já
-- cadastrada com que possam conviver (a regra existe por causa de `UN`×`un`).
-- `unidades.test.ts` lista as siglas como exceção explícita.
--
-- Grupo `tempo`: a grandeza é hora. `fn_unidade_e_hora` NÃO reconhece CHP/CHI
-- de propósito — ela decide o HH de mão de obra, e hora-máquina somada ao
-- homem-hora misturaria grandezas.
insert into public.unidades_medida (codigo, nome, grupo, ordem) values
  ('CHP', 'Custo horário produtivo',   'tempo', 530),
  ('CHI', 'Custo horário improdutivo', 'tempo', 540)
on conflict (codigo) do nothing;
