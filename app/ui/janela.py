"""Janela principal da calculadora de custo e preço de impressão 3D."""

from __future__ import annotations

from fractions import Fraction

from PySide6.QtWidgets import (
    QFormLayout,
    QGroupBox,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from app.core.calculadora import (
    Entrada,
    EntradaInvalida,
    calcular,
    pecas_para_pagar_impressora,
)
from app.ui.formatacao import formatar_reais, parse_fracao, parse_inteiro
from app.versao import VERSAO

# (nome exibido, valor inicial). Lucro inicial é provisório: ver decisão em aberto no CONTEXTO.md.
CAMPOS_ENTRADA = [
    ("Peso do lote (g)", ""),
    ("Preço do filamento (R$/kg)", ""),
    ("Potência da impressora (W)", ""),
    ("Horas de impressão", ""),
    ("Tarifa de energia (R$/kWh)", ""),
    ("Custo por hora da impressora (R$)", ""),
    ("Mão de obra do lote (R$)", "0"),
    ("Lucro sobre o custo (%)", "0"),
    ("Quantidade de peças", "1"),
    ("Valor da impressora (R$)", ""),
]


class JanelaCalculadora(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(f"Calculadora de custo 3D - v{VERSAO}")
        self._campos: dict[str, QLineEdit] = {}

        raiz = QWidget()
        layout = QVBoxLayout(raiz)

        grupo_entrada = QGroupBox("Dados do lote")
        formulario = QFormLayout(grupo_entrada)
        for nome, inicial in CAMPOS_ENTRADA:
            campo = QLineEdit(inicial)
            self._campos[nome] = campo
            formulario.addRow(nome, campo)
        layout.addWidget(grupo_entrada)

        self._botao_calcular = QPushButton("Calcular")
        self._botao_calcular.clicked.connect(self._ao_calcular)
        layout.addWidget(self._botao_calcular)

        self._mensagem = QLabel("")
        self._mensagem.setWordWrap(True)
        layout.addWidget(self._mensagem)

        grupo_resultado = QGroupBox("Resultado")
        self._resultado = QFormLayout(grupo_resultado)
        self._rotulos_resultado: dict[str, QLabel] = {}
        for nome in (
            "Filamento",
            "Energia",
            "Impressora",
            "Mão de obra",
            "Custo do lote",
            "Preço do lote",
            "Custo por peça",
            "Preço por peça",
            "Lucro por peça",
            "Peças para pagar a impressora",
        ):
            rotulo = QLabel("-")
            self._rotulos_resultado[nome] = rotulo
            self._resultado.addRow(nome, rotulo)
        layout.addWidget(grupo_resultado)

        self.setCentralWidget(raiz)

    def _ler_entrada(self) -> tuple[Entrada, Fraction]:
        """Lê os campos e devolve a Entrada e o valor da impressora. Levanta EntradaInvalida."""

        def fracao(nome: str) -> Fraction:
            return parse_fracao(self._campos[nome].text(), nome)

        entrada = Entrada(
            peso_g=fracao("Peso do lote (g)"),
            preco_kg=fracao("Preço do filamento (R$/kg)"),
            potencia_w=fracao("Potência da impressora (W)"),
            horas=fracao("Horas de impressão"),
            tarifa_kwh=fracao("Tarifa de energia (R$/kWh)"),
            custo_hora_impressora=fracao("Custo por hora da impressora (R$)"),
            mao_de_obra=fracao("Mão de obra do lote (R$)"),
            lucro_pct=fracao("Lucro sobre o custo (%)"),
            quantidade=parse_inteiro(self._campos["Quantidade de peças"].text(), "Quantidade de peças"),
        )
        valor_impressora = fracao("Valor da impressora (R$)")
        return entrada, valor_impressora

    def _ao_calcular(self) -> None:
        try:
            entrada, valor_impressora = self._ler_entrada()
            resultado = calcular(entrada)
            pecas = pecas_para_pagar_impressora(valor_impressora, resultado.lucro_unitario)
        except EntradaInvalida as erro:
            self._mensagem.setText(str(erro))
            return

        self._mensagem.setText("")
        valores = {
            "Filamento": formatar_reais(resultado.filamento),
            "Energia": formatar_reais(resultado.energia),
            "Impressora": formatar_reais(resultado.impressora),
            "Mão de obra": formatar_reais(resultado.mao_de_obra),
            "Custo do lote": formatar_reais(resultado.custo_lote),
            "Preço do lote": formatar_reais(resultado.preco_lote),
            "Custo por peça": formatar_reais(resultado.custo_unitario),
            "Preço por peça": formatar_reais(resultado.preco_unitario),
            "Lucro por peça": formatar_reais(resultado.lucro_unitario),
            "Peças para pagar a impressora": (
                str(pecas) if pecas is not None else "Sem lucro por peça: não é possível calcular"
            ),
        }
        for nome, texto in valores.items():
            self._rotulos_resultado[nome].setText(texto)
