"""Gera os arquivos do Copo 4 no catálogo a partir dos dois projetos aprovados pelo Pedro (23/11/2026).

Uso:
  python preparar_copo4.py --inteiro "<copo 4 - copo inteiro.3mf>" --multipartes "<copo 4.3mf>"

Os projetos de origem usam 3 filamentos (1 sem uso, 2 = preto, 3 = branco). No programa os copos
têm 2 filamentos: 1 = principal (preto) e 2 = detalhes (branco). O script troca os números dos
filamentos, a pintura (paint_color) e o perfil (perfil-petg.json), e grava em assets/copos:
  4.3mf             malha única (pintada, logo fundida) no meio da mesa, para o catálogo e o STL
  4-multipartes.3mf base e tubo em placas separadas, com a baioneta
A prévia (4.bin.gz) sai do 4.3mf com scripts/preparar-copo.mjs.
Os arquivos de origem não são alterados.
"""
import argparse
import json
import re
import zipfile
from pathlib import Path

PASTA = Path(__file__).resolve().parent.parent / 'src' / 'renderer' / 'assets' / 'copos'
PERFIL = PASTA / 'perfil-petg.json'
FILAMENTO = {'1': '1', '2': '1', '3': '2'}  # origem -> programa (o 1 só aparece como padrão do objeto)
PINTURA = {'8': '4', '0C': '8'}           # preto 2 -> 1, branco 3 -> 2
CENTRO_MESA = 128.0


def trocar_pintura(texto):
    def troca(m):
        assert m[1] in PINTURA, f'pintura inesperada: {m[1]}'
        return f'paint_color="{PINTURA[m[1]]}"'
    return re.sub(r'paint_color="([0-9A-F]+)"', troca, texto)


def trocar_extrusor(texto):
    def troca(m):
        assert m[1] in FILAMENTO, f'filamento inesperado: {m[1]}'
        return f'key="extruder" value="{FILAMENTO[m[1]]}"'
    return re.sub(r'key="extruder" value="(\d+)"', troca, texto)


def perfil():
    return json.dumps(json.loads(PERFIL.read_text(encoding='utf-8')), indent=4, ensure_ascii=False)


def ajustes_do_objeto(cfg):
    """Configurações por objeto que a assinatura precisa (2 camadas de fundo, sem brim)."""
    return {k: re.findall(r'<metadata key="%s" value="([^"]*)"/>' % k, cfg) for k in ('bottom_shell_layers', 'brim_type')}


def inteiro(origem, destino):
    with zipfile.ZipFile(origem) as z:
        arqs = {n: z.read(n) for n in z.namelist()}
    modelos = [n for n in arqs if n.startswith('3D/Objects/') and n.endswith('.model')]
    assert len(modelos) == 1, modelos
    texto = arqs[modelos[0]].decode()
    malha = re.search(r'<mesh>[\s\S]*</mesh>', texto)[0]
    assert malha.count('<mesh>') == 1
    vs = [tuple(map(float, m)) for m in re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/>', malha)]
    xs, ys = [v[0] for v in vs], [v[1] for v in vs]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    vert = ''.join(f'<vertex x="{x - cx + CENTRO_MESA:.6f}" y="{y - cy + CENTRO_MESA:.6f}" z="{z:.6f}"/>' for x, y, z in vs)
    tris = trocar_pintura(re.search(r'<triangles>[\s\S]*</triangles>', malha)[0])
    cfg = arqs['Metadata/model_settings.config'].decode()
    aj = ajustes_do_objeto(cfg)
    assert aj['bottom_shell_layers'] == ['2'] and aj['brim_type'] == ['no_brim'], aj
    nome = 'Copo 4'
    padrao = FILAMENTO[re.search(r'<object id="\d+">\s*<metadata key="name" value="[^"]*"/>\s*<metadata key="extruder" value="(\d+)"/>', cfg)[1]]
    modelo = ('<?xml version="1.0" encoding="UTF-8"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">'
              f'<metadata name="Application">Programa Ferramentas 3D</metadata><metadata name="Title">{nome}</metadata>'
              '<metadata name="Criae3D:MalhaUnica">1</metadata>'
              f'<resources><object id="1" type="model" name="{nome}"><mesh><vertices>{vert}</vertices>{tris}</mesh></object></resources>'
              '<build><item objectid="1"/></build></model>')
    config = ('<?xml version="1.0" encoding="UTF-8"?>\n<config><object id="1">'
              f'<metadata key="name" value="{nome}"/><metadata key="extruder" value="{padrao}"/>'
              '<metadata key="brim_type" value="no_brim"/><metadata key="bottom_shell_layers" value="2"/>'
              f'<part id="1" subtype="normal_part"><metadata key="name" value="{nome}"/><metadata key="extruder" value="{padrao}"/></part>'
              '</object></config>')
    saida = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="modelo" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
        '3D/3dmodel.model': modelo,
        'Metadata/model_settings.config': config,
        'Metadata/project_settings.config': perfil(),
    }
    gravar(destino, saida)
    print('inteiro', destino.name, 'filamento padrão', padrao, 'vértices', len(vs), 'centro antigo', round(cx, 3), round(cy, 3))


def multipartes(origem, destino):
    with zipfile.ZipFile(origem) as z:
        arqs = {n: z.read(n) for n in z.namelist()}
    saida = {}
    for n, d in arqs.items():
        if n.startswith('Metadata/') and n != 'Metadata/model_settings.config':
            continue  # miniaturas, pausas e perfil antigos: o perfil vem do programa
        if n.endswith('.model'):
            d = trocar_pintura(d.decode())
            if n == '3D/3dmodel.model':
                d = re.sub(r'<metadata name="Title">[^<]*</metadata>', '<metadata name="Title">Copo 4</metadata>', d)
        elif n == 'Metadata/model_settings.config':
            d = d.decode()
            d = re.sub(r'\s*<metadata key="(?:thumbnail_file|thumbnail_no_light_file|top_file|pick_file|filament_map_mode|filament_maps)"[^>]*/>', '', d)
            d = trocar_extrusor(d)
            assert ajustes_do_objeto(d) == {'bottom_shell_layers': ['2'], 'brim_type': ['no_brim']}
        saida[n] = d
    saida['Metadata/project_settings.config'] = perfil()
    gravar(destino, saida)
    print('multipartes', destino.name, sorted(saida))


def gravar(destino, arquivos):
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for n, d in arquivos.items():
            z.writestr(n, d if isinstance(d, bytes) else d.encode('utf-8'))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inteiro', required=True, type=Path)
    ap.add_argument('--multipartes', required=True, type=Path)
    ap.add_argument('--saida', type=Path, default=PASTA)
    a = ap.parse_args()
    inteiro(a.inteiro, a.saida / '4.3mf')
    multipartes(a.multipartes, a.saida / '4-multipartes.3mf')
