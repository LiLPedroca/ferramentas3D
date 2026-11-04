"""Verificação e download de atualizações publicadas como releases no GitHub.

Sem dependências de interface: a parte visual fica em app/ui/atualizador.py.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

REPOSITORIO = "LiLPedroca/ferramentas3D"
URL_ULTIMA_RELEASE = f"https://api.github.com/repos/{REPOSITORIO}/releases/latest"
SUFIXO_INSTALADOR = "Setup.exe"
TIMEOUT_SEGUNDOS = 10
# Identificação genérica do cliente, sem dados pessoais.
USER_AGENT = "ProgramaFerramentas3D-atualizador"


@dataclass(frozen=True)
class Release:
    versao: str
    url_instalador: str
    nome_instalador: str


def ler_versao(texto: str) -> tuple[int, ...]:
    """Converte 'v1.2.3' ou '1.2.3' em (1, 2, 3). Levanta ValueError se não for válido."""
    limpo = texto.strip().removeprefix("v").removeprefix("V")
    partes = limpo.split(".")
    if not partes or not all(p.isdigit() for p in partes):
        raise ValueError(f"Versão inválida: {texto!r}")
    return tuple(int(p) for p in partes)


def e_mais_nova(remota: str, atual: str) -> bool:
    """True se a versão remota for maior que a atual."""
    return ler_versao(remota) > ler_versao(atual)


def escolher_instalador(assets: list[dict]) -> dict | None:
    """Acha o asset do instalador entre os arquivos da release."""
    for asset in assets:
        if str(asset.get("name", "")).endswith(SUFIXO_INSTALADOR):
            return asset
    return None


def interpretar_release(dados: dict) -> Release | None:
    """Monta a Release a partir da resposta da API. Retorna None se não houver instalador."""
    asset = escolher_instalador(dados.get("assets", []))
    if asset is None:
        return None
    return Release(
        versao=str(dados.get("tag_name", "")).removeprefix("v").removeprefix("V"),
        url_instalador=str(asset["browser_download_url"]),
        nome_instalador=str(asset["name"]),
    )


def buscar_ultima_release(
    abrir: Callable[..., object] = urllib.request.urlopen,
) -> Release | None:
    """Consulta a última release publicada. Retorna None se não houver ou se a consulta falhar."""
    pedido = urllib.request.Request(
        URL_ULTIMA_RELEASE,
        headers={"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT},
    )
    try:
        with abrir(pedido, timeout=TIMEOUT_SEGUNDOS) as resposta:  # type: ignore[attr-defined]
            dados = json.loads(resposta.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    return interpretar_release(dados)


def verificar_atualizacao(versao_atual: str, abrir: Callable[..., object] = urllib.request.urlopen) -> Release | None:
    """Retorna a release se houver versão mais nova com instalador, senão None."""
    release = buscar_ultima_release(abrir)
    if release is None:
        return None
    try:
        if e_mais_nova(release.versao, versao_atual):
            return release
    except ValueError:
        return None
    return None


def baixar_instalador(release: Release, pasta_destino: Path) -> Path:
    """Baixa o instalador para a pasta indicada e devolve o caminho do arquivo."""
    pasta_destino.mkdir(parents=True, exist_ok=True)
    destino = pasta_destino / release.nome_instalador
    pedido = urllib.request.Request(release.url_instalador, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(pedido, timeout=TIMEOUT_SEGUNDOS * 6) as resposta, destino.open("wb") as arquivo:
        while bloco := resposta.read(1024 * 256):
            arquivo.write(bloco)
    return destino
