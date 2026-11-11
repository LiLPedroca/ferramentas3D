"""Assina uma cópia do projeto nativo Copo 1, conservando placas e texto editável.

Construção offline: numpy, trimesh, manifold3d e dependências de assinatura_copos.
Nenhuma referência de entrada é sobrescrita; a saída deve ser um arquivo novo.
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
from assinatura_copos import construir_assinatura, rebaixar_fundo, SITE, INSTAGRAM
from copos_malha import unir_partes
from copos_pintura import remapear_pintura, transferir_pintura

MAPA = {3: 1, 4: 2}
TRIANGULO = re.compile(r'<triangle\b[^>]*/>')


def assinar_fundo(v,f,marca,centro):
    # A lâmina nativa possui dobras coplanares sobrepostas: reconstruir o disco
    # pela união 2D apaga suas costuras e abre o sólido. Preserva cada triângulo.
    return rebaixar_fundo(v,f,marca,centro,por_triangulo=True)


def partes_config(config):
    """Não reserializa XML: o texto nativo contém prefixo slic3rpe não declarado."""
    defaults={}
    for ob in re.finditer(r'<object\b([^>]*)>([\s\S]*?)</object>',config):
        principal=re.search(r'<metadata key="extruder" value="(\d+)"',ob[2].split('<part')[0])
        padrao=int(principal[1]) if principal else 3
        for p in re.finditer(r'<part\b([^>]*)>([\s\S]*?)</part>',ob[2]):
            cor=re.search(r'<metadata key="extruder" value="(\d+)"',p[2])
            defaults[(atributos(ob[1])['id'],atributos(p[1])['id'])]=int(cor[1]) if cor else padrao
    return defaults


def preparar(entrada, saida, desenho, perfil):
    entrada,saida=Path(entrada),Path(saida)
    if entrada.resolve()==saida.resolve(): raise ValueError('Use uma cópia de saída separada.')
    if saida.exists(): raise FileExistsError('A saída já existe; escolha outro arquivo.')
    with zipfile.ZipFile(entrada) as z:
        infos=z.infolist(); arquivos={i.filename:z.read(i.filename) for i in infos}
    originais=arquivos.copy()
    principal='3D/3dmodel.model'; configpath='Metadata/model_settings.config'
    main=arquivos[principal].decode('utf-8'); config=arquivos[configpath].decode('utf-8')
    if 'Base integrada Criae3D' in config: raise ValueError('Projeto já assinado.')
    defaults=partes_config(config)
    itens={atributos(m[1])['objectid']:atributos(m[1]) for m in re.finditer(r'<item\b([^>]*)/>',main)}
    base=objeto(main,7)
    componentes={atributos(m[1])['objectid']:atributos(m[1]) for m in re.finditer(r'<component\b([^>]*)/>',base[2])}
    if not {'1','2'}.issubset(componentes): raise ValueError('Base e acabamento originais não encontrados.')
    caminhos={c.get('p:path',principal).lstrip('/') for c in componentes.values()}
    if len(caminhos)!=1: raise ValueError('Base e acabamento devem estar no mesmo recurso nativo.')
    caminho=next(iter(caminhos)); externo=arquivos[caminho].decode('utf-8')
    partes=[]; transformacoes={}
    for id in ('1','2'):
        o=objeto(externo,id); v,f=ler_mesh(o[2])
        M=matriz(itens['7'].get('transform'))@matriz(componentes[id].get('transform'))
        transformacoes[id]=M
        padrao=defaults.get(('7',id),3)
        codigos=[remapear_pintura(atributos(t[0]).get('paint_color',''),MAPA,padrao) for t in TRIANGULO.finditer(o[2])]
        partes.append(dict(vertices=v@M[:3,:3].T+M[:3,3],faces=f,codigos=codigos))
    uniao=unir_partes(partes)
    antes=geometria_fechada(uniao['vertices'],uniao['faces'])
    if not antes.is_volume: raise ValueError('Base fundida não é fechada e orientada.')
    v,f=uniao['vertices'],uniao['faces']; z0=v[:,2].min()
    mask=np.all(abs(v[f,2]-z0)<1e-10,axis=1)
    fundo=unary_union([Polygon(v[t,:2]) for t in f[mask]])
    x0,y0,x1,y1=fundo.bounds; centro=[(x0+x1)/2,(y0+y1)/2]
    resultado=assinar_fundo(v,f,desenho['marca'],centro)
    depois=geometria_fechada(resultado['vertices'],resultado['faces'])
    esperado=antes.volume-resultado['area']*resultado['profundidade']
    if not depois.is_volume: raise ValueError('Assinatura deixou a base aberta ou sem orientação.')
    if not np.allclose(antes.bounds,depois.bounds,atol=1e-6): raise ValueError('Envelope da base mudou.')
    if abs(depois.volume-esperado)>.02: raise ValueError('Volume do rebaixo divergente.')
    inv=np.linalg.inv(transformacoes['1'])
    local=resultado['vertices']@inv[:3,:3].T+inv[:3,3]
    codigos=[]
    for t,pintura,original in zip(resultado['faces'],resultado['pintura'],resultado['originais']):
        if pintura: codigos.append('8' if pintura==1 else '4')
        else:
            origem,face=uniao['origens'][original]; p=partes[origem]
            codigo,_=transferir_pintura(p['codigos'][face],p['vertices'][p['faces'][face]],resultado['vertices'][t])
            codigos.append(codigo)
    verts=''.join(f'<vertex x="{x:.15g}" y="{y:.15g}" z="{z:.15g}"/>' for x,y,z in local)
    tris=''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="{cor}"/>' for (a,b,c),cor in zip(resultado['faces'],codigos))
    mesh='<mesh><vertices>'+verts+'</vertices><triangles>'+tris+'</triangles></mesh>'
    o=objeto(externo,1); body=re.sub(r'<mesh\b[\s\S]*?</mesh>',lambda _:mesh,o[2],count=1)
    externo=externo[:o.start(2)]+body+externo[o.end(2):]
    # O recurso 2 sem referência é conservado para não destruir dados nativos.
    novo_base=re.sub(r'<component\b([^>]*)/>',lambda q:'' if atributos(q[1]).get('objectid')=='2' else q[0],base[2])
    main=main[:base.start(2)]+novo_base+main[base.end(2):]
    arquivos[principal]=main.encode('utf-8'); arquivos[caminho]=externo.encode('utf-8')
    # Remapeia apenas a pintura e o material; vértices, faces e ordem restantes são idênticos.
    defaults_recurso={}
    for root,item in itens.items():
        o=objeto(main,root)
        for c in re.finditer(r'<component\b([^>]*)/>',o[2]):
            a=atributos(c[1]); path=a.get('p:path',principal).lstrip('/')
            defaults_recurso[(path,a['objectid'])]=defaults.get((root,a['objectid']),3)
    @lru_cache(maxsize=20000)
    def remapear(codigo,padrao): return remapear_pintura(codigo,MAPA,padrao)
    for path in list(arquivos):
        if not path.endswith('.model'): continue
        texto=arquivos[path].decode('utf-8')
        def pintar_objeto(m):
            id=atributos(m[1]).get('id')
            if path==caminho and id=='1': return m[0]
            if '<mesh>' not in m[2]: return m[0]
            padrao=defaults_recurso.get((path,id),defaults.get(('7',id),3))
            def pintar(t):
                codigo=remapear(atributos(t[0]).get('paint_color',''),padrao)
                limpo=re.sub(r'\s+paint_color="[^"]*"','',t[0])
                return limpo[:-2]+f' paint_color="{codigo}"/>'
            return '<object'+m[1]+'>'+TRIANGULO.sub(pintar,m[2])+'</object>'
        texto=re.sub(r'<object\b([^>]*)>([\s\S]*?)</object>',pintar_objeto,texto)
        arquivos[path]=texto.encode('utf-8')
    ob=objeto(config,7)
    body=re.sub(r'<part\b([^>]*)>[\s\S]*?</part>',lambda p:'' if atributos(p[1]).get('id')=='2' else p[0],ob[2])
    # Um nome inequívoco também impede uma segunda aplicação acidental.
    part=re.search(r'<part\b[^>]*id="1"[^>]*>[\s\S]*?</part>',body)
    atualizado=re.sub(r'(<metadata key="name" value=")[^"]*',r'\g<1>Base integrada Criae3D',part[0],count=1)
    if atualizado==part[0]: atualizado=part[0].replace('>', '><metadata key="name" value="Base integrada Criae3D"/>',1)
    body=body[:part.start()]+atualizado+body[part.end():]
    config=config[:ob.start(2)]+body+config[ob.end(2):]
    config=re.sub(r'(<metadata key="extruder" value=")([34])("/>)',lambda m:m[1]+str(MAPA[int(m[2])])+m[3],config)
    arquivos[configpath]=config.encode('utf-8')
    perfil=dict(perfil,filament_colour=['#000000','#ffffff'])
    arquivos['Metadata/project_settings.config']=json.dumps(perfil,ensure_ascii=False).encode('utf-8')
    # Prova geométrica para todos os objetos externos exceto a base substituída.
    bounds=[]
    for path,dados in originais.items():
        if not path.endswith('.model'): continue
        texto=dados.decode('utf-8'); novo=arquivos[path].decode('utf-8')
        for o in re.finditer(r'<object\b([^>]*)>([\s\S]*?)</object>',texto):
            id=atributos(o[1])['id']
            if '<mesh>' not in o[2] or (path==caminho and id=='1'): continue
            va,fa=ler_mesh(o[2]); vb,fb=ler_mesh(objeto(novo,id)[2])
            if not np.array_equal(va,vb) or not np.array_equal(fa,fb): raise ValueError('Geometria de outra peça mudou.')
            bounds.append(dict(recurso=path,id=id,bounds=[va.min(0).tolist(),va.max(0).tolist()],triangulos=len(fa)))
    alterados=[n for n in arquivos if arquivos[n]!=originais[n]]
    placas=len(re.findall(r'<plate\b',config))
    if placas!=len(re.findall(r'<plate\b',originais[configpath].decode())): raise ValueError('Número de placas mudou.')
    report=dict(entrada_sha256=hashlib.sha256(entrada.read_bytes()).hexdigest(),arquivo=str(saida),placas=placas,
        base_fundida=True,malha_fechada=True,sem_objeto_logo_separado=True,demais_geometrias_identicas=True,
        bounds_demais_partes=bounds,bounds_base=depois.bounds.tolist(),volume_antes=float(antes.volume),volume_depois=float(depois.volume),
        volume_rebaixo=float(resultado['area']*.2),triangulos_base=len(resultado['faces']),rebaixo_mm=.2,
        site=SITE,instagram=INSTAGRAM,paleta=['#000000','#ffffff'],arquivos_alterados=alterados,
        arquivos_preservados=[n for n in arquivos if n not in alterados])
    saida.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(saida,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for info in infos:
            info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,arquivos[info.filename])
    report['saida_sha256']=hashlib.sha256(saida.read_bytes()).hexdigest()
    saida.with_suffix('.validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--entrada',type=Path,required=True); p.add_argument('--saida',type=Path,required=True)
    args=p.parse_args(); assets=Path(__file__).resolve().parents[1]/'src/renderer/assets'
    desenho=construir_assinatura(assets/'copos/criae3d-logo.svg',assets/'fontes/Rubik-Regular.ttf')
    perfil=json.loads((assets/'copos/perfil-petg.json').read_text(encoding='utf-8'))
    print(json.dumps(preparar(args.entrada,args.saida,desenho,perfil),ensure_ascii=False),flush=True)


if __name__=='__main__': main()
