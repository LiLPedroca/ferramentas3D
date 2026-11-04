"""Cálculo de custo e preço de impressão 3D.

Toda a aritmética usa Fraction para não acumular erro de arredondamento.
Arredondamento para centavos acontece só na exibição (to_reais).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction


class EntradaInvalida(ValueError):
    """Dado de entrada fora do esperado."""


def _positivo_ou_zero(nome: str, valor: Fraction) -> Fraction:
    if valor < 0:
        raise EntradaInvalida(f"{nome} não pode ser negativo.")
    return valor


@dataclass(frozen=True)
class Entrada:
    """Dados de um lote de impressão.

    peso_g: peso total do lote em gramas.
    preco_kg: preço do filamento por kg.
    potencia_w: potência da impressora em watts.
    horas: tempo total de impressão do lote.
    tarifa_kwh: preço da energia por kWh.
    custo_hora_impressora: custo por hora de uso da impressora.
    mao_de_obra: mão de obra do lote.
    lucro_pct: percentual de lucro sobre o custo (não é margem sobre venda).
    quantidade: número de peças no lote.
    """

    peso_g: Fraction
    preco_kg: Fraction
    potencia_w: Fraction
    horas: Fraction
    tarifa_kwh: Fraction
    custo_hora_impressora: Fraction
    mao_de_obra: Fraction
    lucro_pct: Fraction
    quantidade: int

    def __post_init__(self) -> None:
        for nome in (
            "peso_g",
            "preco_kg",
            "potencia_w",
            "horas",
            "tarifa_kwh",
            "custo_hora_impressora",
            "mao_de_obra",
            "lucro_pct",
        ):
            _positivo_ou_zero(nome, getattr(self, nome))
        if not isinstance(self.quantidade, int) or self.quantidade < 1:
            raise EntradaInvalida("A quantidade de peças deve ser um inteiro maior que zero.")


@dataclass(frozen=True)
class Resultado:
    filamento: Fraction
    energia: Fraction
    impressora: Fraction
    mao_de_obra: Fraction
    custo_lote: Fraction
    preco_lote: Fraction
    custo_unitario: Fraction
    preco_unitario: Fraction

    @property
    def lucro_unitario(self) -> Fraction:
        return self.preco_unitario - self.custo_unitario


def calcular(entrada: Entrada) -> Resultado:
    """Calcula custos e preços de um lote.

    Filamento = peso (g) / 1000 × preço/kg.
    Energia = potência (W) / 1000 × horas × tarifa/kWh.
    Impressora = horas × custo/hora.
    Preço = custo × (1 + lucro% / 100), sobre o custo do lote.
    """
    filamento = entrada.peso_g / 1000 * entrada.preco_kg
    energia = entrada.potencia_w / 1000 * entrada.horas * entrada.tarifa_kwh
    impressora = entrada.horas * entrada.custo_hora_impressora
    custo_lote = filamento + energia + impressora + entrada.mao_de_obra
    preco_lote = custo_lote * (1 + entrada.lucro_pct / 100)
    return Resultado(
        filamento=filamento,
        energia=energia,
        impressora=impressora,
        mao_de_obra=entrada.mao_de_obra,
        custo_lote=custo_lote,
        preco_lote=preco_lote,
        custo_unitario=custo_lote / entrada.quantidade,
        preco_unitario=preco_lote / entrada.quantidade,
    )


def pecas_para_pagar_impressora(valor_impressora: Fraction, lucro_por_peca: Fraction) -> int | None:
    """Quantas peças vendidas pagam a impressora.

    Retorna None quando não é possível calcular (lucro zero ou negativo).
    """
    if valor_impressora < 0:
        raise EntradaInvalida("O valor da impressora não pode ser negativo.")
    if lucro_por_peca <= 0:
        return None
    return math.ceil(valor_impressora / lucro_por_peca)


def to_reais(valor: Fraction) -> Decimal:
    """Converte para reais, arredondando para centavos (meio para cima)."""
    numerador, denominador = valor.numerator, valor.denominator
    return (Decimal(numerador) / Decimal(denominador)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
