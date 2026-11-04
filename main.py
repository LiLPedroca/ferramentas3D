"""Ponto de entrada do Programa Ferramentas 3D."""

import sys

from PySide6.QtWidgets import QApplication

from app.ui.atualizador import checar_em_segundo_plano
from app.ui.janela import JanelaCalculadora


def main() -> int:
    aplicativo = QApplication(sys.argv)
    janela = JanelaCalculadora()
    janela.show()
    checar_em_segundo_plano(janela)
    return aplicativo.exec()


if __name__ == "__main__":
    sys.exit(main())
