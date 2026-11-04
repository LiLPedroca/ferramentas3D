from fractions import Fraction

import pytest

from app.core.calculadora import EntradaInvalida
from app.ui.formatacao import formatar_reais, parse_fracao, parse_inteiro


def test_parse_aceita_virgula_e_ponto():
    assert parse_fracao("12,5", "x") == Fraction(25, 2)
    assert parse_fracao("12.5", "x") == Fraction(25, 2)


def test_parse_remove_espacos():
    assert parse_fracao("  3 ", "x") == Fraction(3)


@pytest.mark.parametrize("texto", ["", "   ", "abc", "1,2,3", "nan", "inf"])
def test_parse_rejeita_texto_invalido(texto):
    with pytest.raises(EntradaInvalida, match="x"):
        parse_fracao(texto, "x")


def test_parse_inteiro_aceita_somente_digitos():
    assert parse_inteiro(" 4 ", "Quantidade") == 4
    with pytest.raises(EntradaInvalida):
        parse_inteiro("2,5", "Quantidade")
    with pytest.raises(EntradaInvalida):
        parse_inteiro("-1", "Quantidade")


def test_formatar_reais_padrao_brasileiro():
    assert formatar_reais(Fraction(1234567, 1000)) == "R$ 1.234,57"
    assert formatar_reais(Fraction(5)) == "R$ 5,00"
    assert formatar_reais(Fraction(0)) == "R$ 0,00"


def test_formatar_reais_negativo():
    assert formatar_reais(Fraction(-1500, 1)) == "-R$ 1.500,00"
