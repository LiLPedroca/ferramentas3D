"""Checagem de atualização em segundo plano, com aviso ao usuário.

A consulta e o download rodam em threads, para a janela não travar.
Os resultados voltam para a thread da interface por meio de um QObject (controlador),
porque mostrar caixas de diálogo fora da thread principal não é seguro.
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PySide6.QtCore import QObject, QThread, Signal, Slot
from PySide6.QtWidgets import QApplication, QMessageBox, QWidget

from app.atualizacao import Release, baixar_instalador, verificar_atualizacao
from app.versao import VERSAO

# Flags do Inno Setup: instala sem perguntas. O instalador reabre o programa ao terminar.
FLAGS_INSTALADOR = ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"]


class _VerificarThread(QThread):
    terminou = Signal(object)

    def run(self) -> None:
        self.terminou.emit(verificar_atualizacao(VERSAO))


class _BaixarThread(QThread):
    concluido = Signal(str)
    falhou = Signal(str)

    def __init__(self, release: Release) -> None:
        super().__init__()
        self._release = release

    def run(self) -> None:
        pasta = Path(tempfile.gettempdir()) / "ProgramaFerramentas3D-atualizacao"
        try:
            caminho = baixar_instalador(self._release, pasta)
        except OSError as erro:
            self.falhou.emit(str(erro))
            return
        self.concluido.emit(str(caminho))


class _Controlador(QObject):
    """Vive na thread da interface e recebe os resultados das threads de trabalho."""

    def __init__(self, janela: QWidget) -> None:
        super().__init__(janela)
        self._janela = janela
        self._threads: list[QThread] = []

    def iniciar_verificacao(self) -> None:
        thread = _VerificarThread()
        thread.terminou.connect(self._ao_encontrar)
        self._guardar(thread)

    @Slot(object)
    def _ao_encontrar(self, release: Release | None) -> None:
        if release is None:
            return
        resposta = QMessageBox.question(
            self._janela,
            "Atualização disponível",
            f"Existe a versão {release.versao} (você tem a {VERSAO}).\n\nDeseja atualizar agora?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if resposta != QMessageBox.StandardButton.Yes:
            return
        baixador = _BaixarThread(release)
        baixador.concluido.connect(self._ao_baixar)
        baixador.falhou.connect(self._ao_falhar)
        self._guardar(baixador)

    @Slot(str)
    def _ao_baixar(self, caminho: str) -> None:
        subprocess.Popen([caminho, *FLAGS_INSTALADOR])
        QApplication.quit()

    @Slot(str)
    def _ao_falhar(self, erro: str) -> None:
        QMessageBox.warning(
            self._janela,
            "Atualização",
            f"Não foi possível baixar a atualização.\n\n{erro}",
        )

    def _guardar(self, thread: QThread) -> None:
        # Mantém a referência viva até a thread terminar.
        self._threads.append(thread)
        thread.start()


def checar_em_segundo_plano(janela: QWidget) -> None:
    """Consulta o GitHub sem travar a janela e pergunta se há versão nova."""
    controlador = _Controlador(janela)
    janela._controlador_atualizacao = controlador  # evita que o coletor de lixo o remova
    controlador.iniciar_verificacao()
