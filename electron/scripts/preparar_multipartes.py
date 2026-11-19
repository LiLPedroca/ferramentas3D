"""Monta o projeto multipartes de um copo a partir de três 3MF (base, tubo, argola).

Uso:
  python scripts/preparar_multipartes.py --copo 2 --base <base.3mf> --tubo <tubo.3mf>
         --argola <argola.3mf> --saida <novo.3mf>
  python scripts/preparar_multipartes.py --copo 1 --renomear <multipartes.3mf> --saida <novo.3mf>

Cada peça vai para uma placa, e objeto e partes se chamam só "base N",
"tubo N" e "argola N". A placa fica sem nome: o fatiador do Anycubic pela linha
de comando fecha sozinho quando a placa tem nome. Filamento 1 = preto, 2 = branco (o 3º filamento, se
houver, também vira branco). A primeira lâmina da base é unida à camada de cima
e recebe a assinatura Criae3D rebaixada 0,2 mm, como nos outros copos.
Nenhum arquivo de entrada é alterado; a saída precisa ser um arquivo novo.
Construção offline: numpy, trimesh, manifold3d, shapely, fonttools, matplotlib.
"""
import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import zipfile

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

from assinar_copos import atributos, objeto, matriz, ler_mesh, geometria_fechada
import manifold3d as md
from shapely.affinity import scale, translate
from shapely.geometry.polygon import orient

from assinatura_copos import construir_assinatura, poligonos, SITE, INSTAGRAM
from copos_malha import unir_partes
from copos_pintura import decodificar, remapear_pintura

PECAS = ('base', 'tubo', 'argola')
PROFUNDIDADE = .2
MAPA_EXTRUSOR = {1: 1, 2: 2, 3: 2}
PASSO_PLACA = 260 * 1.2  # distância entre placas no Bambu/Anycubic (mesa de 260 mm)
OBJ = re.compile(r'<object\b([^>]*)>([\s\S]*?)</object>')
IDENT = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1'


def esc(texto):
    return str(texto).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def nome_peca(peca, copo):
    return f'{peca} {copo}'


def ler_peca(caminho):
    """Lê um 3MF de uma peça: objeto com componentes (partes) e malhas no 3dmodel."""
    with zipfile.ZipFile(caminho) as z:
        texto = z.read('3D/3dmodel.model').decode('utf-8')
        config = z.read('Metadata/model_settings.config').decode('utf-8')
    itens = [atributos(m[1]) for m in re.finditer(r'<item\b([^>]*)/>', texto)]
    if len(itens) != 1: raise ValueError(f'{Path(caminho).name}: esperado um único objeto na mesa.')
    item = itens[0]
    raiz = objeto(texto, item['objectid'])
    comps = [atributos(m[1]) for m in re.finditer(r'<component\b([^>]*)/>', raiz[2])]
    if not comps or 'p:path' in ''.join(map(str, comps)): raise ValueError(f'{Path(caminho).name}: formato de peça inesperado.')
    cfg = objeto(config, item['objectid'])
    padrao = re.search(r'<metadata key="extruder" value="(\d+)"', cfg[2].split('<part')[0])
    padrao = int(padrao[1]) if padrao else 1
    extrusores = {}
    for p in re.finditer(r'<part\b([^>]*)>([\s\S]*?)</part>', cfg[2]):
        e = re.search(r'<metadata key="extruder" value="(\d+)"', p[2])
        m = re.search(r'<metadata key="matrix" value="([^"]+)"', p[2])
        if m and m[1].split() != IDENT.split(): raise ValueError(f'{Path(caminho).name}: parte com matriz própria.')
        extrusores[atributos(p[1])['id']] = int(e[1]) if e else padrao
    partes = []
    for c in comps:
        if c.get('transform') and not np.allclose(matriz(c['transform']), np.eye(4)): raise ValueError('Componente deslocado.')
        corpo = objeto(texto, c['objectid'])[2]
        partes.append(dict(id=c['objectid'], corpo=corpo, extrusor=MAPA_EXTRUSOR[extrusores.get(c['objectid'], padrao)]))
    return dict(item=item, partes=partes)


def malha_xml(v, f, pintura=None):
    verts = ''.join(f'<vertex x="{x:.15g}" y="{y:.15g}" z="{z:.15g}"/>' for x, y, z in v)
    if pintura is None:
        tris = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in f)
    else:
        tris = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"' + (f' paint_color="{p}"' if p else '') + '/>' for (a, b, c), p in zip(f, pintura))
    return '<mesh><vertices>' + verts + '</vertices><triangles>' + tris + '</triangles></mesh>'


@lru_cache(maxsize=20000)
def _pintura(codigo, padrao):
    # "10" e afins = só a cor da parte: some. O resto passa para preto/branco.
    if decodificar(codigo) == 0: return ''
    return remapear_pintura(codigo, MAPA_EXTRUSOR, padrao)


def pintura_preto_branco(corpo, padrao):
    """Conserva a pintura (ex.: assinatura já pintada) trocando o 3º filamento por branco."""
    def trocar(m):
        novo = _pintura(m[1], padrao)
        return f' paint_color="{novo}"' if novo else ''
    return re.sub(r'\s+paint_color="([^"]*)"', trocar, corpo)


def assinar_base(partes, desenho):
    """Une a lâmina do fundo com a parte logo acima e rebaixa a assinatura."""
    malhas = []
    for p in partes:
        v, f = ler_mesh(p['corpo'])
        malhas.append((p, v, f))
    z0 = min(v[:, 2].min() for _, v, _ in malhas)
    fundo = [m for m in malhas if abs(m[1][:, 2].min() - z0) < 1e-6]
    if len(fundo) != 1: raise ValueError('A base precisa de uma única lâmina no fundo.')
    lamina = fundo[0]
    topo = lamina[1][:, 2].max()
    vizinhas = [m for m in malhas if m is not lamina and z0 < m[1][:, 2].min() <= topo + 1e-6 and m[0]['extrusor'] == lamina[0]['extrusor']]
    if len(vizinhas) != 1: raise ValueError('Não achei a parte da mesma cor logo acima da lâmina do fundo.')
    vizinha = vizinhas[0]
    uniao = unir_partes([dict(vertices=lamina[1], faces=lamina[2]), dict(vertices=vizinha[1], faces=vizinha[2])])
    antes = geometria_fechada(uniao['vertices'], uniao['faces'])
    if not antes.is_volume: raise ValueError('Base unida não ficou fechada.')
    v, f = uniao['vertices'], uniao['faces']
    zmin = v[:, 2].min()
    mask = np.all(abs(v[f, 2] - zmin) < 1e-10, axis=1)
    disco = unary_union([Polygon(v[t, :2]) for t in f[mask]])
    x0, y0, x1, y1 = disco.bounds
    # Vista de baixo: espelha X para a leitura ficar certa olhando o fundo.
    marca = translate(scale(desenho['marca'], xfact=-1, yfact=1, origin=(0, 0)), (x0 + x1) / 2, (y0 + y1) / 2)
    if marca.difference(Polygon(disco.exterior).buffer(1e-7)).area > 1e-6: raise ValueError('Assinatura fora do fundo da base.')
    # Recorte sólido (Manifold): o fundo destas bases tem triângulos degenerados
    # que impedem refazer o fundo triângulo por triângulo.
    contornos = []
    for pol in poligonos(marca):
        pol = orient(pol, 1.0)
        contornos += [np.asarray(pol.exterior.coords)[:-1], *[np.asarray(i.coords)[:-1] for i in pol.interiors]]
    cortador = md.Manifold.extrude(md.CrossSection(contornos, md.FillRule.EvenOdd), 1 + PROFUNDIDADE).translate((0, 0, zmin - 1)).as_original()
    solido = md.Manifold(md.Mesh64(v.copy(order='C'), f.astype(np.uint64).copy(order='C')))
    resultado = solido - cortador
    if resultado.status() != md.Error.NoError or len(resultado.decompose()) != 1: raise ValueError('Falha ao rebaixar a assinatura.')
    malha = resultado.to_mesh64()
    rv, rf = np.asarray(malha.vert_properties)[:, :3], np.asarray(malha.tri_verts, dtype=np.int64)
    origem = np.zeros(len(rf), dtype=np.int64)
    for k, i in enumerate(malha.run_original_id): origem[malha.run_index[k] // 3:malha.run_index[k + 1] // 3] = i
    depois = geometria_fechada(rv, rf)
    volume_rebaixo = marca.area * PROFUNDIDADE
    if not depois.is_volume: raise ValueError('Assinatura deixou a base aberta.')
    if not np.allclose(antes.bounds, depois.bounds, atol=1e-6): raise ValueError('Envelope da base mudou.')
    if abs(antes.volume - depois.volume - volume_rebaixo) > .02: raise ValueError('Volume do rebaixo divergente.')
    no_fundo = np.all(abs(rv[rf, 2] - zmin) < 1e-9, axis=1)
    # 8 = filamento 2 (branco) na marca; 4 = filamento 1 (preto) no fundo.
    pintura = ['8' if o == cortador.original_id() else '4' if b else '' for o, b in zip(origem, no_fundo)]
    r = dict(vertices=rv, faces=rf)
    nova = dict(id=lamina[0]['id'], corpo='<mesh/>', extrusor=lamina[0]['extrusor'], malha=malha_xml(r['vertices'], r['faces'], pintura))
    restantes = [p for p in partes if p is not lamina[0] and p is not vizinha[0]]
    info = dict(volume_antes=float(antes.volume), volume_depois=float(depois.volume), volume_rebaixo=float(volume_rebaixo),
                triangulos=len(r['faces']), bounds=depois.bounds.tolist(), partes_unidas=[lamina[0]['id'], vizinha[0]['id']])
    return [nova, *restantes], info


def montar(copo, entradas, saida, desenho, perfil, assinar=True):
    saida = Path(saida)
    if saida.exists(): raise FileExistsError('A saída já existe; escolha outro arquivo.')
    if any(Path(e).resolve() == saida.resolve() for e in entradas.values()): raise ValueError('Use uma saída separada.')
    pecas = {p: ler_peca(entradas[p]) for p in PECAS}
    if assinar: pecas['base']['partes'], assinatura = assinar_base(pecas['base']['partes'], desenho)
    else: assinatura = 'mantida a do arquivo da base'
    proximo = 1
    arquivos, recursos, build, cfg_objs, placas, rels = {}, [], [], [], [], []
    for n, peca in enumerate(PECAS):
        dados, nome = pecas[peca], nome_peca(peca, copo)
        caminho = f'3D/Objects/{nome}.model'
        objs, comps, cfg_partes = [], [], []
        for parte in dados['partes']:
            pid = proximo; proximo += 1
            malha = parte.get('malha') or pintura_preto_branco(re.search(r'<mesh\b[\s\S]*?</mesh>', parte['corpo'])[0], parte['extrusor'])
            objs.append(f'<object id="{pid}" type="model">{malha}</object>')
            comps.append(f'<component p:path="/{esc(caminho)}" objectid="{pid}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>')
            cfg_partes.append(f'<part id="{pid}" subtype="normal_part"><metadata key="name" value="{esc(nome)}"/>'
                              f'<metadata key="matrix" value="{IDENT}"/><metadata key="extruder" value="{parte["extrusor"]}"/></part>')
        arquivos[caminho] = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
                             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
                             'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
                             'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">'
                             '<metadata name="BambuStudio:3mfVersion">1</metadata><resources>' + ''.join(objs) + '</resources><build/></model>')
        rels.append(f'<Relationship Target="/{esc(caminho)}" Id="rel-{n + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>')
        oid = proximo; proximo += 1
        recursos.append(f'<object id="{oid}" type="model"><components>{"".join(comps)}</components></object>')
        m = matriz(dados['item'].get('transform'))
        # Centro da peça no plano: as malhas podem vir no meio da mesa, não na origem.
        caixas = [ler_mesh(p.get('malha') or p['corpo'])[0] for p in dados['partes']]
        minimo, maximo = np.min([c.min(0) for c in caixas], 0), np.max([c.max(0) for c in caixas], 0)
        centro = m[:3, :3] @ np.array([(minimo[0] + maximo[0]) / 2, (minimo[1] + maximo[1]) / 2, 0])
        x, y = 130 + PASSO_PLACA * (n % 2) - centro[0], 130 - PASSO_PLACA * (n // 2) - centro[1]
        t = ' '.join(f'{k:.9g}' for k in [*m[:3, :3].T.reshape(-1), x, y, m[2, 3]])
        build.append(f'<item objectid="{oid}" transform="{t}" printable="1"/>')
        extrusor = dados['partes'][0]['extrusor']
        cfg_objs.append(f'<object id="{oid}"><metadata key="name" value="{esc(nome)}"/><metadata key="extruder" value="{extrusor}"/>' + ''.join(cfg_partes) + '</object>')
        placas.append(f'<plate><metadata key="plater_id" value="{n + 1}"/><metadata key="plater_name" value=""/><metadata key="locked" value="false"/>'
                      f'<model_instance><metadata key="object_id" value="{oid}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="{oid}"/></model_instance></plate>')
    arquivos['3D/3dmodel.model'] = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
        'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n'
        ' <metadata name="Application">BambuStudio-2.0.0.3</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
        f' <metadata name="Title">Copo {copo}</metadata>\n <resources>' + ''.join(recursos) + '</resources>\n <build>' + ''.join(build) + '</build>\n</model>')
    arquivos['3D/_rels/3dmodel.model.rels'] = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(rels) + '</Relationships>'
    arquivos['Metadata/model_settings.config'] = '<?xml version="1.0" encoding="UTF-8"?>\n<config>' + ''.join(cfg_objs) + ''.join(placas) + '</config>'
    arquivos['Metadata/project_settings.config'] = json.dumps(dict(perfil, filament_colour=['#000000', '#ffffff']), ensure_ascii=False)
    arquivos['[Content_Types].xml'] = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
        '<Default Extension="png" ContentType="image/png"/><Default Extension="config" ContentType="text/xml"/></Types>')
    arquivos['_rels/.rels'] = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    saida.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(saida, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for nome in ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', '3D/_rels/3dmodel.model.rels',
                     *[f'3D/Objects/{nome_peca(p, copo)}.model' for p in PECAS],
                     'Metadata/model_settings.config', 'Metadata/project_settings.config']:
            z.writestr(nome, arquivos[nome])
    return dict(copo=copo, arquivo=str(saida), placas=[nome_peca(p, copo) for p in PECAS], assinatura=assinatura,
                site=SITE, instagram=INSTAGRAM, paleta=['#000000', '#ffffff'],
                entradas={p: hashlib.sha256(Path(e).read_bytes()).hexdigest() for p, e in entradas.items()},
                saida_sha256=hashlib.sha256(saida.read_bytes()).hexdigest())


def renomear(copo, entrada, saida):
    """Só troca nomes de objetos e partes no model_settings.config."""
    entrada, saida = Path(entrada), Path(saida)
    if saida.exists(): raise FileExistsError('A saída já existe; escolha outro arquivo.')
    with zipfile.ZipFile(entrada) as z:
        infos = z.infolist(); arquivos = {i.filename: z.read(i.filename) for i in infos}
    config = arquivos['Metadata/model_settings.config'].decode('utf-8')
    nomes = {}
    def objeto_novo(m):
        atual = re.search(r'<metadata key="name" value="([^"]*)"', m[2])[1].lower()
        peca = next((p for p in PECAS if p in atual), None)
        if peca is None: raise ValueError(f'Objeto sem peça reconhecida: {atual}')
        nomes[atributos(m[1])['id']] = nome = nome_peca(peca, copo)
        return '<object' + m[1] + '>' + re.sub(r'(<metadata key="name" value=")[^"]*', lambda q: q[1] + nome, m[2]) + '</object>'
    config = OBJ.sub(objeto_novo, config)
    if sorted(nomes.values()) != sorted(nome_peca(p, copo) for p in PECAS): raise ValueError('Esperava base, tubo e argola.')
    arquivos['Metadata/model_settings.config'] = config.encode('utf-8')
    with zipfile.ZipFile(saida, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for info in infos:
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, arquivos[info.filename])
    return dict(arquivo=str(saida), nomes=nomes)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--copo', type=int, required=True)
    for peca in PECAS: p.add_argument(f'--{peca}', type=Path)
    p.add_argument('--sem-assinatura', action='store_true', help='a base já vem assinada')
    p.add_argument('--renomear', type=Path); p.add_argument('--saida', type=Path, required=True)
    a = p.parse_args()
    if a.renomear:
        print(json.dumps(renomear(a.copo, a.renomear, a.saida), ensure_ascii=False)); return
    assets = Path(__file__).resolve().parents[1] / 'src/renderer/assets'
    desenho = construir_assinatura(assets / 'copos/criae3d-logo.svg', assets / 'fontes/Rubik-Regular.ttf')
    perfil = json.loads((assets / 'copos/perfil-petg.json').read_text(encoding='utf-8'))
    report = montar(a.copo, {peca: getattr(a, peca) for peca in PECAS}, a.saida, desenho, perfil, assinar=not a.sem_assinatura)
    a.saida.with_suffix('.validacao.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__': main()
