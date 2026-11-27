"""Copo 4 novo (liso, 27/11/2026): gera assets/copos/4.3mf e 4-multipartes.3mf a partir dos arquivos do Pedro.

Uso:
  python scripts/preparar_copo4_liso.py --inteiro "<copo 4.3mf>" --multipartes "<Copo-tres-pecas.3mf>"

- Inteiro: as 5 partes (base 0,2 mm, argola inferior, chanfro, corpo, argola da boca) viram UMA malha, com a cor
  de cada parte pintada (paint_color "8" = filamento 2, detalhes; sem pintura = filamento 1, principal).
- Multipartes: base, tubo e argola, cada um na sua placa (1, 2 e 3), já na posição de imprimir.
- Nos dois, a assinatura (logo + site + Instagram) é fundida no fundo e pintada na cor principal, só nas
  camadas 1 e 2 (bottom_shell_layers = 2, sem brim). O fundo deste copo tem raio 43,2 mm: o site vai no
  raio 34 e o Instagram no 38,5 (texto até r 40,1; folga de 3,1 mm até a borda).
Depois: node scripts/preparar-copo.mjs 4 (prévia) e a miniatura 4.png no modo de captura.
Os arquivos de origem não são alterados.
"""
import argparse
import re
import sys
import zipfile
from pathlib import Path

import manifold3d as md
import numpy as np
import trimesh
from shapely.affinity import scale
from shapely.geometry.polygon import orient

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import assinatura_copos as ac  # noqa: E402

PASTA = SCRIPTS.parent / 'src' / 'renderer' / 'assets' / 'copos'
FONTE = SCRIPTS.parent / 'src' / 'renderer' / 'assets' / 'fontes' / 'Rubik-Regular.ttf'
RAIO_SITE, RAIO_INSTAGRAM = 34.0, 38.5
ESPESSURA_MARCA = 0.4
CENTRO_MESA = 128.0
PASSO_PLACA = 312.0  # distância entre placas no projeto (igual ao Copo 2)

_src = (SCRIPTS / 'assinatura_copos.py').read_text(encoding='utf-8')
_alvo = "('superior',SITE,7.,30.),('inferior',INSTAGRAM,6.5,35.)"
assert _alvo in _src
exec(compile(_src.replace(_alvo, f"('superior',SITE,7.,{RAIO_SITE}),('inferior',INSTAGRAM,6.5,{RAIO_INSTAGRAM})"), 'assinatura', 'exec'), ac.__dict__)


def ler_zip(caminho):
    with zipfile.ZipFile(caminho) as z:
        return {n: z.read(n) for n in z.namelist()}


def malha_do_objeto(texto, oid):
    corpo = re.search(r'<object id="%s"[^>]*>([\s\S]*?)</object>' % oid, texto)[1]
    v = np.array(re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"', corpo), dtype=float)
    f = np.array(re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"', corpo), dtype=np.int64)
    return v, f


def solido(v, f):
    m = md.Manifold(md.Mesh64(np.ascontiguousarray(v, dtype=float), np.ascontiguousarray(f, dtype=np.uint64)))
    assert m.status() == md.Error.NoError, m.status()
    return m


def marca_extrudada(z0):
    """Assinatura espelhada (lida olhando de baixo), extrudada de z0 - 1 até z0 + 0,4."""
    marca = ac.construir_assinatura(PASTA / 'criae3d-logo.svg', FONTE)['marca']
    marca = scale(marca, xfact=-1, yfact=1, origin=(0, 0))
    contornos = []
    for p in ac.poligonos(marca):
        p = orient(p, sign=1)
        contornos.append(np.asarray(p.exterior.coords)[:-1])
        for q in p.interiors:
            contornos.append(np.asarray(q.coords)[:-1])
    cs = md.CrossSection([c.tolist() for c in contornos], md.FillRule.EvenOdd)
    return md.Manifold.extrude(cs, ESPESSURA_MARCA + 1).translate((0, 0, z0 - 1))


def com_assinatura(pecas, cor):
    """Une as peças (cada uma com a sua cor em `cor[original_id]`), funde a marca no fundo e devolve
    vértices, triângulos e o filamento de cada triângulo (a marca: 1 nas faces do fundo)."""
    u = md.Manifold.batch_boolean(pecas, md.OpType.Add)
    assert u.status() == md.Error.NoError
    partes = sorted(u.decompose(), key=lambda m: -m.volume())
    # faces que se encostam exatamente deixam lascas de volume zero: ficam de fora
    assert all(abs(m.volume()) < 1e-3 for m in partes[1:]), [m.volume() for m in partes]
    u = partes[0]
    volume_antes = u.volume()
    z0 = u.bounding_box()[2]
    ext = marca_extrudada(z0)
    lo = (u ^ ext).as_original()
    id_marca = lo.original_id()
    u = (u - ext) + lo
    k = u.to_mesh64()
    v = np.asarray(k.vert_properties)[:, :3]
    f = np.asarray(k.tri_verts, dtype=np.int64)
    ro = np.asarray(k.run_original_id)
    ri = np.asarray(k.run_index)
    origem = np.zeros(len(f), dtype=np.int64)
    for j, o in enumerate(ro):
        origem[ri[j] // 3:ri[j + 1] // 3] = o
    tm = trimesh.Trimesh(v, f, process=False)
    assert tm.is_volume and abs(tm.volume - volume_antes) < 0.05, (tm.is_volume, tm.volume, volume_antes)
    fundo = np.all(abs(v[f, 2] - z0) < 1e-9, axis=1)
    cor_marca_fundo = None
    filamentos = []
    for i, o in enumerate(origem):
        if o == id_marca:
            # as faces do fundo da marca saem na cor principal (1); as paredes da marca, na cor da peça de baixo
            filamentos.append(1 if fundo[i] else None)
        else:
            # faces que vieram do corte da marca (sem peça de origem) também ficam com a cor do fundo
            filamentos.append(cor.get(int(o)))
    desconhecidas = sum(1 for i, o in enumerate(origem) if o != id_marca and int(o) not in cor)
    if desconhecidas:
        print(f'  {desconhecidas} faces do corte da marca na cor do fundo')
    # paredes/teto da marca: cor do que está em volta (a peça do fundo)
    cor_fundo = cor[pecas_do_fundo(origem, fundo, id_marca)]
    filamentos = [cor_fundo if c is None else c for c in filamentos]
    area = float(tm.area_faces[fundo & (origem == id_marca)].sum())
    raio = float(np.hypot(v[f[fundo & (origem == id_marca)].reshape(-1), 0] - (v[:, 0].min() + v[:, 0].max()) / 2,
                          v[f[fundo & (origem == id_marca)].reshape(-1), 1] - (v[:, 1].min() + v[:, 1].max()) / 2).max())
    print(f'  fechada, volume {tm.volume:.1f} mm³, marca {area:.1f} mm² até r {raio:.2f}, z0 {z0:.3f}')
    return v, f, filamentos


def pecas_do_fundo(origem, fundo, id_marca):
    outros = origem[fundo & (origem != id_marca)]
    valores, contagem = np.unique(outros, return_counts=True)
    return int(valores[contagem.argmax()])


def malha_xml(v, f, filamentos, padrao, dx=0.0, dy=0.0):
    codigo = {1: '4', 2: '8'}
    tris = ''.join(
        (f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="{codigo[p]}"/>' if p != padrao else f'<triangle v1="{a}" v2="{b}" v3="{c}"/>')
        for (a, b, c), p in zip(f, filamentos))
    verts = ''.join(f'<vertex x="{x + dx:.6f}" y="{y + dy:.6f}" z="{z:.6f}"/>' for x, y, z in v)
    return f'<mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh>'


def perfil():
    return (PASTA / 'perfil-petg.json').read_text(encoding='utf-8')


TIPOS = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
         '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
         '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
         '<Default Extension="config" ContentType="application/xml"/></Types>')
RELS = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="modelo" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')


def gravar(destino, arquivos):
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for n, d in arquivos.items():
            z.writestr(n, d if isinstance(d, bytes) else d.encode('utf-8'))


def inteiro(origem, destino):
    arqs = ler_zip(origem)
    raiz = arqs['3D/3dmodel.model'].decode()
    cfg = arqs['Metadata/model_settings.config'].decode()
    sub = [n for n in arqs if n.startswith('3D/Objects/') and n.endswith('.model')]
    assert len(sub) == 1, sub
    texto = arqs[sub[0]].decode()
    pecas, cor = [], {}
    for comp in re.findall(r'<component\b[^>]*/>', raiz):
        oid = re.search(r'objectid="(\d+)"', comp)[1]
        dz = float(re.search(r'transform="([^"]+)"', comp)[1].split()[-1])
        parte = re.search(r'<part id="%s"[\s\S]*?</part>' % oid, cfg)[0]
        nome = re.search(r'key="name" value="([^"]*)"', parte)[1]
        extrusor = int(re.search(r'key="extruder" value="(\d+)"', parte)[1])
        v, f = malha_do_objeto(texto, oid)
        m = solido(v + [0, 0, dz], f).as_original()
        cor[m.original_id()] = extrusor
        pecas.append(m)
        print(f'  parte {oid} {nome}: filamento {extrusor}, z {m.bounding_box()[2]:.2f}–{m.bounding_box()[5]:.2f}')
    v, f, filamentos = com_assinatura(pecas, cor)
    cx, cy = (v[:, 0].min() + v[:, 0].max()) / 2, (v[:, 1].min() + v[:, 1].max()) / 2
    v = v - [cx - CENTRO_MESA, cy - CENTRO_MESA, v[:, 2].min()]
    nome = 'Copo 4'
    modelo = ('<?xml version="1.0" encoding="UTF-8"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">'
              f'<metadata name="Application">Programa Ferramentas 3D</metadata><metadata name="Title">{nome}</metadata>'
              '<metadata name="Criae3D:MalhaUnica">1</metadata>'
              f'<resources><object id="1" type="model" name="{nome}">{malha_xml(v, f, filamentos, 1)}</object></resources>'
              '<build><item objectid="1"/></build></model>')
    config = ('<?xml version="1.0" encoding="UTF-8"?>\n<config><object id="1">'
              f'<metadata key="name" value="{nome}"/><metadata key="extruder" value="1"/>'
              '<metadata key="brim_type" value="no_brim"/><metadata key="bottom_shell_layers" value="2"/>'
              f'<part id="1" subtype="normal_part"><metadata key="name" value="{nome}"/><metadata key="extruder" value="1"/></part>'
              '</object></config>')
    gravar(destino, {'[Content_Types].xml': TIPOS, '_rels/.rels': RELS, '3D/3dmodel.model': modelo,
                     'Metadata/model_settings.config': config, 'Metadata/project_settings.config': perfil()})
    print('inteiro', destino, 'na mesa', [round(v[:, k].min(), 2) for k in (0, 1)], [round(v[:, k].max(), 2) for k in (0, 1)], 'altura', round(v[:, 2].max(), 2))


def multipartes(origem, destino):
    texto = ler_zip(origem)['3D/3dmodel.model'].decode()
    nomes = dict(re.findall(r'<object id="(\d+)" type="model" name="([^"]+)"', texto))
    assert sorted(nomes.values()) == ['Argola', 'Base', 'Tubo'], nomes
    por_nome = {n: oid for oid, n in nomes.items()}
    # placa, nome no projeto, filamento padrão
    ordem = [('Base', 'base copo 4', 2), ('Tubo', 'tubo copo 4', 1), ('Argola', 'argola copo 4', 2)]
    objetos, itens, configs, placas = [], [], [], []
    for k, (origem_nome, nome, filamento) in enumerate(ordem):
        v, f = malha_do_objeto(texto, por_nome[origem_nome])
        v = v - [(v[:, 0].min() + v[:, 0].max()) / 2, (v[:, 1].min() + v[:, 1].max()) / 2, v[:, 2].min()]
        if origem_nome == 'Base':
            m = solido(v, f).as_original()
            v, f, fil = com_assinatura([m], {m.original_id(): filamento})
        else:
            assert trimesh.Trimesh(v, f, process=False).is_volume, origem_nome
            fil = [filamento] * len(f)
        oid = k + 1
        objetos.append(f'<object id="{oid}" type="model" name="{nome}">{malha_xml(v, f, fil, filamento)}</object>')
        # placas em grade de 2 colunas, como o fatiador arruma: 1 (130,130), 2 (442,130), 3 (130,-182)
        x = CENTRO_MESA + 2 + (k % 2) * PASSO_PLACA
        y = CENTRO_MESA + 2 - (k // 2) * PASSO_PLACA
        itens.append(f'<item objectid="{oid}" transform="1 0 0 0 1 0 0 0 1 {x:g} {y:g} 0" printable="1"/>')
        extra = '<metadata key="brim_type" value="no_brim"/><metadata key="bottom_shell_layers" value="2"/>' if origem_nome == 'Base' else ''
        configs.append(f'<object id="{oid}"><metadata key="name" value="{nome}"/><metadata key="extruder" value="{filamento}"/>{extra}'
                       f'<part id="{oid}" subtype="normal_part"><metadata key="name" value="{nome}"/>'
                       '<metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>'
                       f'<metadata key="extruder" value="{filamento}"/></part></object>')
        placas.append(f'<plate><metadata key="plater_id" value="{k + 1}"/><metadata key="plater_name" value=""/><metadata key="locked" value="false"/>'
                      f'<model_instance><metadata key="object_id" value="{oid}"/><metadata key="instance_id" value="0"/>'
                      f'<metadata key="identify_id" value="{oid}"/></model_instance></plate>')
        print(f'  {nome}: placa {k + 1}, filamento {filamento}, altura {v[:, 2].max():.2f}, Ø {v[:, 0].max() - v[:, 0].min():.2f}')
    # com as marcas do BambuStudio o fatiador lê as placas do model_settings (sem elas junta tudo na placa 1)
    modelo = ('<?xml version="1.0" encoding="UTF-8"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
              'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" unit="millimeter">'
              '<metadata name="Application">BambuStudio-2.0.0.3</metadata><metadata name="BambuStudio:3mfVersion">1</metadata>'
              '<metadata name="Title">Copo 4</metadata>'
              f'<resources>{"".join(objetos)}</resources><build>{"".join(itens)}</build></model>')
    config = '<?xml version="1.0" encoding="UTF-8"?>\n<config>' + ''.join(configs) + ''.join(placas) + '</config>'
    gravar(destino, {'[Content_Types].xml': TIPOS, '_rels/.rels': RELS, '3D/3dmodel.model': modelo,
                     'Metadata/model_settings.config': config, 'Metadata/project_settings.config': perfil()})
    print('multipartes', destino)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--inteiro', required=True, type=Path)
    ap.add_argument('--multipartes', required=True, type=Path)
    ap.add_argument('--saida', type=Path, default=PASTA)
    a = ap.parse_args()
    inteiro(a.inteiro, a.saida / '4.3mf')
    multipartes(a.multipartes, a.saida / '4-multipartes.3mf')
