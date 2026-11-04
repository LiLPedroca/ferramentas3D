from fractions import Fraction as F

import pytest

from app.core.calculadora import (
    Entrada,
    EntradaInvalida,
    calcular,
    pecas_para_pagar_impressora,
    to_reais,
)


def entrada(**kw):
    base = dict(
        peso_g=F(100),
        preco_kg=F(100),
        potencia_w=F(200),
        horas=F(2),
        tarifa_kwh=F(1),
        custo_hora_impressora=F(3),
        mao_de_obra=F(5),
        lucro_pct=F(50),
        quantidade=1,
    )
    base.update(kw)
    return Entrada(**base)


def test_filamento_energia_impressora_e_mao_de_obra():
    r = calcular(entrada())
    assert r.filamento == F(10)  # 100 g / 1000 × R$100/kg
    assert r.impressora == F(6)
    assert r.mao_de_obra == F(5)


def test_energia_exata():
    r = calcular(entrada())
    assert r.energia == F(2, 5)  # 200 W / 1000 × 2 h × R$1/kWh = R$0,40


def test_custo_total_e_preco_com_lucro_sobre_custo():
    r = calcular(entrada())
    custo = F(10) + F(200, 1000) * 2 + F(6) + F(5)
    assert r.custo_lote == custo
    assert r.preco_lote == custo * F(3, 2)


def test_divisao_por_quantidade():
    r = calcular(entrada(quantidade=4))
    assert r.custo_unitario == r.custo_lote / 4
    assert r.preco_unitario == r.preco_lote / 4


def test_lucro_unitario():
    r = calcular(entrada(quantidade=2))
    assert r.lucro_unitario == r.preco_unitario - r.custo_unitario


def test_lucro_zero_preco_igual_custo():
    r = calcular(entrada(lucro_pct=F(0)))
    assert r.preco_lote == r.custo_lote


def test_valores_negativos_sao_recusados():
    with pytest.raises(EntradaInvalida):
        entrada(peso_g=F(-1))


def test_quantidade_invalida():
    with pytest.raises(EntradaInvalida):
        entrada(quantidade=0)


def test_pecas_para_pagar_impressora_arredonda_para_cima():
    assert pecas_para_pagar_impressora(F(1000), F(30)) == 34  # 33,33 → 34


def test_pecas_sem_lucro_retorna_none():
    assert pecas_para_pagar_impressora(F(1000), F(0)) is None
    assert pecas_para_pagar_impressora(F(1000), F(-5)) is None


def test_to_reais_arredonda_meio_para_cima():
    assert str(to_reais(F(1, 8))) == "0.13"  # 0,125
    assert str(to_reais(F(10, 3))) == "3.33"


def test_nao_ha_erro_de_ponto_flutuante():
    # 0,1 + 0,2 em float daria 0,30000000000000004
    r = calcular(entrada(peso_g=F(0), horas=F(0), mao_de_obra=F(1, 10)))
    r2 = calcular(entrada(peso_g=F(0), horas=F(0), mao_de_obra=F(2, 10)))
    assert r.custo_lote + r2.custo_lote == F(3, 10)
