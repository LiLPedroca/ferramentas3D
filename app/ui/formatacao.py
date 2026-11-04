"""Conversão entre texto digitado na interface e valores exatos (Fraction).

Aceita vírgula ou ponto como separador decimal, por causa do padrão brasileiro.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from fractions import Fraction

from app.core.calculadora import EntradaInvalida, to_reais


def parse_fracao(texto: str, nome: str) -> Fraction:
    """Converte o texto de um campo em Fraction exata.

    Levanta EntradaInvalida com mensagem em português se o texto estiver vazio ou mal formado.
    """
    limpo = texto.strip().replace(",", ".")
    if not limpo:
        raise EntradaInvalida(f"Preencha o campo: {nome}.")
    try:
        valor = Decimal(limpo)
    except InvalidOperation as erro:
        raise EntradaInvalida(f"Valor inválido em {nome}: '{texto}'.") from erro
    if not valor.is_finite():
        raise EntradaInvalida(f"Valor inválido em {nome}: '{texto}'.")
    return Fraction(valor)


def parse_inteiro(texto: str, nome: str) -> int:
    """Converte o texto de um campo em inteiro. Aceita somente dígitos."""
    limpo = texto.strip()
    if not limpo.isdigit():
        raise EntradaInvalida(f"{nome} deve ser um número inteiro.")
    return int(limpo)


def formatar_reais(valor: Fraction) -> str:
    """Formata para exibição no padrão brasileiro, por exemplo 'R$ 1.234,56'."""
    decimal = to_reais(valor)
    negativo = decimal < 0
    inteiro, centavos = f"{abs(decimal):.2f}".split(".")
    grupos = []
    while len(inteiro) > 3:
        grupos.insert(0, inteiro[-3:])
        inteiro = inteiro[:-3]
    grupos.insert(0, inteiro)
    texto = f"R$ {'.'.join(grupos)},{centavos}"
    return f"-{texto}" if negativo else texto
