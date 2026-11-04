import io
import json

import pytest

from app.atualizacao import (
    buscar_ultima_release,
    e_mais_nova,
    escolher_instalador,
    interpretar_release,
    ler_versao,
    verificar_atualizacao,
)


def test_ler_versao_aceita_prefixo_v():
    assert ler_versao("v1.2.3") == (1, 2, 3)
    assert ler_versao("0.10.0") == (0, 10, 0)


@pytest.mark.parametrize("texto", ["", "abc", "1.x.0", "v"])
def test_ler_versao_rejeita_texto_invalido(texto):
    with pytest.raises(ValueError):
        ler_versao(texto)


def test_compara_versoes_numericamente():
    assert e_mais_nova("0.10.0", "0.9.0")
    assert e_mais_nova("v0.2.0", "0.1.0")
    assert not e_mais_nova("0.1.0", "0.1.0")
    assert not e_mais_nova("0.1.0", "0.2.0")


def test_escolhe_instalador_pelo_sufixo():
    assets = [
        {"name": "ProgramaFerramentas3D.exe"},
        {"name": "ProgramaFerramentas3D-Setup.exe", "browser_download_url": "https://x/setup"},
    ]
    assert escolher_instalador(assets)["name"] == "ProgramaFerramentas3D-Setup.exe"
    assert escolher_instalador([{"name": "ProgramaFerramentas3D.exe"}]) is None


def test_interpreta_release_com_instalador():
    dados = {
        "tag_name": "v0.2.0",
        "assets": [
            {"name": "ProgramaFerramentas3D-Setup.exe", "browser_download_url": "https://x/setup.exe"},
        ],
    }
    release = interpretar_release(dados)
    assert release.versao == "0.2.0"
    assert release.url_instalador == "https://x/setup.exe"
    assert release.nome_instalador == "ProgramaFerramentas3D-Setup.exe"


def test_release_sem_instalador_retorna_none():
    assert interpretar_release({"tag_name": "v0.2.0", "assets": []}) is None


class _RespostaFalsa(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _abridor_com(dados):
    def abrir(pedido, timeout):
        return _RespostaFalsa(json.dumps(dados).encode("utf-8"))

    return abrir


def _release_json(tag):
    return {
        "tag_name": tag,
        "assets": [{"name": "ProgramaFerramentas3D-Setup.exe", "browser_download_url": "https://x/s.exe"}],
    }


def test_verificar_retorna_release_quando_ha_versao_nova():
    release = verificar_atualizacao("0.1.0", abrir=_abridor_com(_release_json("v0.2.0")))
    assert release is not None
    assert release.versao == "0.2.0"


def test_verificar_retorna_none_quando_ja_esta_atualizado():
    assert verificar_atualizacao("0.2.0", abrir=_abridor_com(_release_json("v0.2.0"))) is None


def test_verificar_retorna_none_quando_falha_a_rede():
    def abrir_com_erro(pedido, timeout):
        raise OSError("sem internet")

    assert buscar_ultima_release(abrir_com_erro) is None
    assert verificar_atualizacao("0.1.0", abrir=abrir_com_erro) is None


def test_verificar_ignora_resposta_que_nao_e_json():
    def abrir_texto(pedido, timeout):
        return _RespostaFalsa(b"<html>erro</html>")

    assert buscar_ultima_release(abrir_texto) is None
