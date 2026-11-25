"""Tapa o rebaixo de 0,2 mm da assinatura no fundo dos copos 1 a 3 (método antigo, v0.38).

Com o rebaixo, a 1ª camada sai com um buraco no lugar da logo e a cor da logo só começa na 2ª camada.
Este script deixa o fundo plano: os triângulos do teto do rebaixo descem para o fundo (z0), as paredes
do rebaixo saem, e cada face conserva a pintura que já tinha (a logo continua da mesma cor, agora a
partir da 1ª camada). O resto da malha não muda.

Uso: python scripts/tapar_rebaixo_assinatura.py <entrada.3mf> <saida.3mf> <arquivo do modelo> <id do objeto>
  ex.: ... 1.3mf 1-novo.3mf 3D/3dmodel.model 1
       ... 1-multipartes.3mf 1-mp-novo.3mf "3D/Objects/base drapeado com trava_2.model" 1
A saída não pode existir (nunca sobrescreve). Confere: malha fechada e volume ganho = área da marca × 0,2.
"""
import collections
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import trimesh

PROF = 0.2
RAIO_MARCA = 37.0  # mm: a assinatura antiga (logo, site em r 30, Instagram em r 35) cabe nesse raio
TOL = 1e-5
VERT = re.compile(r'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*/>')
TRI = re.compile(r'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"([^>]*?)/>')


def costurar(tris, v, z0):
    """Junções em T no fundo: a parede tinha, num lado, um vértice a mais que no outro. A aresta longa
    que ficou sozinha é dividida nos vértices soltos que estão sobre ela (leque a partir do vértice oposto)."""
    for _ in range(10):
        tris = [t for t in tris if len({t[0], t[1], t[2]}) == 3]
        cont = {}
        for i, (a, b, c, _r) in enumerate(tris):
            for x, y in ((a, b), (b, c), (c, a)):
                cont.setdefault((min(x, y), max(x, y)), []).append(i)
        soltas = [k for k, q in cont.items() if len(q) == 1]
        if not soltas:
            return tris
        nos = {k for e in soltas for k in e}
        # vértices soltos praticamente iguais (diferença de 1e-9 mm na malha original): vira um só
        lista = sorted(nos)
        igual = {}
        for i, k in enumerate(lista):
            for j in lista[i + 1:]:
                if j not in igual and k not in igual and np.abs(v[k] - v[j]).max() < 1e-6:
                    igual[j] = k
        if igual:
            tris = [t for t in ((igual.get(a, a), igual.get(b, b), igual.get(c, c), r) for a, b, c, r in tris)
                    if len({t[0], t[1], t[2]}) == 3]
            continue
        trocar = {}
        for x, y in soltas:
            if abs(v[x, 2] - z0) > TOL or abs(v[y, 2] - z0) > TOL:
                continue
            p, q = v[x, :2], v[y, :2]
            d = q - p
            L2 = float(d @ d)
            sobre = []
            for k in nos - {x, y}:
                if abs(v[k, 2] - z0) > TOL:
                    continue
                w = v[k, :2] - p
                s = float(w @ d) / L2
                if 1e-9 < s < 1 - 1e-9 and abs(d[0] * w[1] - d[1] * w[0]) / L2 ** .5 < TOL:
                    sobre.append((s, k))
            if sobre:
                trocar[cont[(x, y)][0]] = (x, y, [k for _s, k in sorted(sobre)])
        if not trocar:
            return tris
        novos = []
        for i, t in enumerate(tris):
            if i not in trocar:
                novos.append(t)
                continue
            a, b, c, r = t
            assert not re.search(r'paint_color="[0-9A-F]{3,}"', r), 'pintura subdividida numa face a dividir'
            x, y, meio = trocar[i]
            cic = [a, b, c]
            j = next(j for j in range(3) if {cic[j], cic[(j + 1) % 3]} == {x, y})
            u, w, o = cic[j], cic[(j + 1) % 3], cic[(j + 2) % 3]
            if u != x:
                meio = meio[::-1]
            seq = [u, *meio, w]
            novos.extend((seq[k], seq[k + 1], o, r) for k in range(len(seq) - 1))
        tris = novos
    return [t for t in tris if len({t[0], t[1], t[2]}) == 3]


def tapar(body):
    m = re.search(r'<mesh>\s*<vertices>([\s\S]*?)</vertices>\s*<triangles>([\s\S]*?)</triangles>\s*</mesh>', body)
    assert m, 'objeto sem malha'
    vtxt = [x.groups() for x in VERT.finditer(m[1])]
    v = np.array([[float(a) for a in g] for g in vtxt])
    tris = [(int(x[1]), int(x[2]), int(x[3]), x[4]) for x in TRI.finditer(m[2])]
    f = np.array([t[:3] for t in tris], dtype=np.int64)
    assert len(vtxt) == len(re.findall(r'<vertex\b', m[1])) and len(tris) == len(re.findall(r'<triangle\b', m[2]))
    z0 = v[:, 2].min()
    h = z0 + PROF
    zs = v[f][:, :, 2]
    p = v[f]
    nz = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])[:, 2]
    plano = np.all(abs(zs - zs[:, :1]) < TOL, axis=1)
    # centro do fundo; a marca vai até r ≈ 36,6 mm. Fora disso, no Copo 1, há lascas de área zero a 0,2 mm
    # (borda do drapeado) que não são rebaixo.
    no_chao = np.flatnonzero(plano & (abs(zs[:, 0] - z0) < TOL))
    xy = v[f[no_chao]][:, :, :2].reshape(-1, 2)
    centro = (xy.min(0) + xy.max(0)) / 2
    raio = np.hypot(p[:, :, 0].mean(1) - centro[0], p[:, :, 1].mean(1) - centro[1])
    teto = np.flatnonzero(plano & (abs(zs[:, 0] - h) < TOL) & (nz < 0) & (raio < RAIO_MARCA))
    assert len(teto), 'sem rebaixo de 0,2 mm no fundo'
    vt = set(f[teto].ravel().tolist())
    no_fundo = abs(v[:, 2] - z0) < TOL
    no_teto = abs(v[:, 2] - h) < TOL
    # parede: face em pé entre z0 e z0+0,2, dentro da marca (no Copo 2 as paredes têm vértices no meio da altura)
    entre = (v[:, 2] > z0 - TOL) & (v[:, 2] < h + TOL)
    paredes = [i for i in np.flatnonzero(~plano & (raio < RAIO_MARCA))
               if all(entre[k] for k in f[i]) and any(not no_fundo[k] for k in f[i])
               and all(no_fundo[k] or not no_teto[k] or k in vt for k in f[i])]
    # gêmeo no fundo de cada vértice do teto (mesmo x, y): o pé da parede
    pes = {}
    for i in paredes:
        for k in f[i]:
            if no_fundo[k]:
                pes.setdefault((round(v[k, 0], 5), round(v[k, 1], 5)), k)
    troca = {}
    baixar = []
    for k in vt:
        g = pes.get((round(v[k, 0], 5), round(v[k, 1], 5)))
        if g is None:
            baixar.append(k)  # vértice de dentro do teto: desce para o fundo
        else:
            troca[k] = g
    for k in baixar:
        vtxt[k] = (vtxt[k][0], vtxt[k][1], repr(float(z0)) if z0 != 0 else '0')
    do_teto = set(teto.tolist())
    das_paredes = set(paredes)
    novos = []
    for i, (a, b, c, resto) in enumerate(tris):
        if i in das_paredes:
            continue
        if i in do_teto:
            a, b, c = (troca.get(k, k) for k in (a, b, c))
            if len({a, b, c}) < 3:
                continue  # lasca do teto que virou linha no fundo
        novos.append((a, b, c, resto))
    v2 = np.array([[float(x) for x in g] for g in vtxt])
    novos = costurar(novos, v2, z0)
    # conferência
    f2 = np.array([t[:3] for t in novos], dtype=np.int64)
    antes = trimesh.Trimesh(v, f, process=False)
    depois = trimesh.Trimesh(v2, f2, process=False)
    area = float(antes.area_faces[teto].sum())
    ganho = depois.volume - antes.volume
    print(f'  teto {len(teto)} faces ({area:.3f} mm²), paredes {len(paredes)}, vértices descidos {len(baixar)}, gêmeos {len(troca)}')
    print(f'  fechada antes {antes.is_watertight} depois {depois.is_watertight}; volume +{ganho:.4f} (esperado {area * PROF:.4f})')
    print(f'  orientada antes {antes.is_winding_consistent} depois {depois.is_winding_consistent}')
    assert depois.is_watertight or not antes.is_watertight, 'a malha ficou aberta'
    assert depois.is_winding_consistent or not antes.is_winding_consistent, 'faces com orientação trocada'
    assert abs(ganho - area * PROF) < max(0.01, 1e-4 * area), 'volume ganho não confere'
    assert abs(depois.bounds[0][2] - z0) < TOL and abs(depois.bounds[1][2] - antes.bounds[1][2]) < TOL
    q = v2[f2]
    r2 = np.hypot(q[:, :, 0].mean(1) - centro[0], q[:, :, 1].mean(1) - centro[1])
    sobra = np.flatnonzero(np.all(abs(q[:, :, 2] - h) < TOL, axis=1) & (r2 < RAIO_MARCA)
                           & (np.cross(q[:, 1] - q[:, 0], q[:, 2] - q[:, 0])[:, 2] < 0))
    assert not len(sobra), 'ainda há teto de rebaixo'
    vxml = ''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in vtxt)
    txml = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"{r}/>' for a, b, c, r in novos)
    return body[:m.start()] + f'<mesh><vertices>{vxml}</vertices><triangles>{txml}</triangles></mesh>' + body[m.end():]


def tapar_refazendo_fundo(body):
    """Para malhas com folhas internas de espessura zero na região das letras (Copo 2 inteiro), onde descer
    o teto não fecha a malha: tira toda a laje do fundo dentro do raio da marca (faces entre z0 e z0+0,2:
    fundo, paredes, teto e folhas) e triangula de novo o disco do fundo, plano, com o mesmo contorno de
    fora. A marca leva a pintura que tinha no teto; o resto do disco, a pintura que tinha no fundo."""
    import shapely
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    m = re.search(r'<mesh>\s*<vertices>([\s\S]*?)</vertices>\s*<triangles>([\s\S]*?)</triangles>\s*</mesh>', body)
    vtxt = [x.groups() for x in VERT.finditer(m[1])]
    v = np.array([[float(a) for a in g] for g in vtxt])
    tris = [(int(x[1]), int(x[2]), int(x[3]), x[4]) for x in TRI.finditer(m[2])]
    f = np.array([t[:3] for t in tris], dtype=np.int64)
    z0 = v[:, 2].min()
    h = z0 + PROF
    p = v[f]
    nz = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])[:, 2]
    plano = np.all(abs(p[:, :, 2] - p[:, :1, 2]) < TOL, axis=1)
    no_chao = np.flatnonzero(plano & (abs(p[:, 0, 2] - z0) < TOL))
    xy = p[no_chao][:, :, :2].reshape(-1, 2)
    centro = (xy.min(0) + xy.max(0)) / 2
    raio = np.hypot(p[:, :, 0].mean(1) - centro[0], p[:, :, 1].mean(1) - centro[1])
    # a laje inteira do fundo (até a borda): no Copo 2, triângulos compridos do fundo vão do meio até a borda
    na_laje = np.all((p[:, :, 2] > z0 - TOL) & (p[:, :, 2] < h + TOL), axis=1)
    teto = np.flatnonzero(na_laje & plano & (abs(p[:, 0, 2] - h) < TOL) & (nz < 0) & (raio < RAIO_MARCA))
    chao = np.flatnonzero(na_laje & plano & (abs(p[:, 0, 2] - z0) < TOL) & (nz < 0))
    pintura = lambda i: (re.search(r'paint_color="([^"]*)"', tris[i][3]) or [None, ''])[1]
    tinta_marca = collections.Counter(pintura(i) for i in teto).most_common(1)[0][0]
    tinta_fundo = collections.Counter(pintura(i) for i in chao).most_common(1)[0][0]
    marca = unary_union([Polygon(t[:, :2]) for t in p[teto]])
    sai = set(np.flatnonzero(na_laje).tolist())
    ficam = [t for i, t in enumerate(tris) if i not in sai]
    # contorno do buraco: arestas que ficaram sem par
    cont = collections.Counter()
    for a, b, c, _r in ficam:
        for x, y in ((a, b), (b, c), (c, a)):
            cont[(x, y)] += 1
    soltas = [(x, y) for (x, y) in cont if (y, x) not in cont]
    assert soltas and all(abs(v[k, 2] - z0) < TOL for e in soltas for k in e), 'o buraco não ficou só no fundo'
    seguinte = {}
    for x, y in soltas:
        assert x not in seguinte, 'contorno do buraco com bifurcação'
        seguinte[x] = y
    laco = [soltas[0][0]]
    while seguinte[laco[-1]] != laco[0]:
        laco.append(seguinte[laco[-1]])
    assert len(laco) == len(soltas), 'o buraco tem mais de um contorno'
    disco = Polygon(v[laco, :2])
    assert disco.is_valid
    indice = {tuple(np.round(v[k, :2], 9)): k for k in laco}
    novos_v = []

    def idx(x, y):
        k = (round(x, 9), round(y, 9))
        if k not in indice:
            indice[k] = len(vtxt) + len(novos_v)
            novos_v.append((repr(float(x)), repr(float(y)), repr(float(z0)) if z0 != 0 else '0'))
        return indice[k]
    novos_t = []
    regioes = ((marca.intersection(disco), tinta_marca), (disco.difference(marca), tinta_fundo))
    soma = 0.0
    for regiao, tinta in regioes:
        resto = f' paint_color="{tinta}"' if tinta else ''
        for tri in shapely.constrained_delaunay_triangles(regiao).geoms:
            (a, b, c, _) = tri.exterior.coords
            if tri.area < 1e-12:
                continue
            soma += tri.area
            ia, ib, ic = idx(*a), idx(*b), idx(*c)
            # virada para baixo (o fundo é visto de baixo): sentido horário visto de cima
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0:
                ib, ic = ic, ib
            novos_t.append((ia, ib, ic, resto))
    vtxt2 = vtxt + novos_v
    tudo = ficam + novos_t
    v2 = np.array([[float(x) for x in g] for g in vtxt2])
    tudo = costurar(tudo, v2, z0)
    f2 = np.array([t[:3] for t in tudo], dtype=np.int64)
    antes = trimesh.Trimesh(v, f, process=False)
    depois = trimesh.Trimesh(v2, f2, process=False)
    ganho = depois.volume - antes.volume
    print(f'  laje {len(sai)} faces tiradas; disco {disco.area:.3f} mm² (triangulado {soma:.3f}), marca {marca.area:.3f} mm²; pinturas marca {tinta_marca!r} fundo {tinta_fundo!r}')
    print(f'  fechada {depois.is_watertight}, orientada {depois.is_winding_consistent}; volume +{ganho:.4f} (esperado ≈ {marca.area * PROF:.4f})')
    assert abs(soma - disco.area) < 1e-3
    assert depois.is_watertight and depois.is_winding_consistent, 'a malha ficou aberta'
    assert abs(ganho - marca.area * PROF) < 0.05 * marca.area * PROF
    vxml = ''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in vtxt2)
    txml = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"{r}/>' for a, b, c, r in tudo)
    return body[:m.start()] + f'<mesh><vertices>{vxml}</vertices><triangles>{txml}</triangles></mesh>' + body[m.end():]


def main():
    refazer = '--refazer-fundo' in sys.argv
    if refazer:
        sys.argv.remove('--refazer-fundo')
    origem, destino, membro, oid = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    assert not destino.exists(), 'a saída já existe'
    with zipfile.ZipFile(origem) as z:
        infos = z.infolist()
        dados = {i.filename: z.read(i.filename) for i in infos}
    texto = dados[membro].decode('utf-8')
    om = next(x for x in re.finditer(r'<object\b([^>]*)>([\s\S]*?)</object>', texto)
              if re.search(rf'\bid="{re.escape(oid)}"', x[1]))
    print(f'{origem.name}: {membro} objeto {oid}')
    novo = tapar_refazendo_fundo(om[2]) if refazer else tapar(om[2])
    dados[membro] = (texto[:om.start(2)] + novo + texto[om.end(2):]).encode('utf-8')
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for i in infos:
            z.writestr(i.filename, dados[i.filename])
    print('  ok:', destino)


if __name__ == '__main__':
    main()
