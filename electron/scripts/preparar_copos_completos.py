"""Prepara cópias dos assets v0.38.0: um copo, um mesh, pintura e perfil PETG.

python scripts/preparar_copos_completos.py --entrada <assets antigos> --saida <nova pasta>
Dependências de construção: numpy, trimesh e manifold3d. Não são usadas pelo app.
"""
import argparse,gzip,hashlib,io,json,re,struct,zipfile
from pathlib import Path
from functools import lru_cache
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET
import numpy as np
import trimesh
import manifold3d as md
from assinar_copos import atributos,objeto,matriz,ler_mesh
from copos_malha import unir_partes
from copos_pintura import remapear_pintura,decodificar,transferir_pintura

def arquivo_unico(vertices,faces,codigos,nome,perfil,metadados=''):
    nome=escape(nome,{'"':'&quot;'})
    vs=''.join(f'<vertex x="{x:.15g}" y="{y:.15g}" z="{z:.15g}"/>'for x,y,z in vertices)
    ts=''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="{cor}"/>'for (a,b,c),cor in zip(faces,codigos))
    if len(faces)!=len(codigos):raise ValueError('Pintura incompleta.')
    xml=f'<?xml version="1.0" encoding="UTF-8"?><model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter"><metadata name="Application">Programa Ferramentas 3D</metadata><metadata name="Title">{nome}</metadata><metadata name="Criae3D:MalhaUnica">1</metadata>{metadados}<resources><object id="1" type="model" name="{nome}"><mesh><vertices>{vs}</vertices><triangles>{ts}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>'
    cfg=f'<config><object id="1"><metadata key="name" value="{nome}"/><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"><metadata key="name" value="{nome}"/><metadata key="extruder" value="1"/></part></object></config>'
    arquivos={'3D/3dmodel.model':xml,'Metadata/model_settings.config':cfg,'Metadata/project_settings.config':json.dumps(perfil),
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="modelo" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'}
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
        for n,v in arquivos.items():z.writestr(n,v.encode())
    return out.getvalue()

def ler_partes(entrada,id):
    with zipfile.ZipFile(entrada/f'{id}.3mf')as z:arquivos={n:z.read(n)for n in z.namelist()}
    main=arquivos['3D/3dmodel.model'].decode()
    if 'Criae3D:MalhaUnica'in main:raise ValueError('Asset já preparado. Use os assets anteriores como entrada.')
    pacote=gzip.decompress((entrada/f'{id}.bin.gz').read_bytes());n=struct.unpack_from('<I',pacote)[0]
    paleta=[p['cor'].lower()for p in json.loads(pacote[4:4+n])['partes']]
    cores=json.loads(arquivos['Metadata/project_settings.config'])['filament_colour']
    mapa={next(i+1 for i,c in enumerate(cores)if c[:7].lower()==cor):j+1 for j,cor in enumerate(paleta)}
    item=atributos(re.search(r'<build\b[^>]*>\s*<item\b([^>]*)/>',main)[1]);cfg=ET.fromstring(arquivos['Metadata/model_settings.config'])
    configuracao=cfg.find(f"object[@id='{item['objectid']}']");defaults={};nomes={}
    parent=configuracao.find("metadata[@key='extruder']");principal=int(parent.get('value','1'))if parent is not None else 1
    for p in configuracao.findall('part'):
        e=p.find("metadata[@key='extruder']");defaults[p.get('id')]=int(e.get('value','1'))if e is not None else principal
        e=p.find("metadata[@key='name']");nomes[p.get('id')]=e.get('value','')if e is not None else''
    partes=[];removidos=[]
    @lru_cache(maxsize=20000)
    def pintar(codigo,padrao):return remapear_pintura(codigo,mapa,padrao or 1)
    def visitar(path,oid,M):
        text=arquivos[path].decode();o=objeto(text,oid)
        if '<mesh>'in o[2]:
            nome=nomes.get(oid,'')
            # O drapeado branco integra o copo completo e participa da união.
            v,f=ler_mesh(o[2]);v=v@M[:3,:3].T+M[:3,3]
            padrao=defaults.get(oid,int(atributos(o[1]).get('pindex','0'))+1)
            codes=[]
            for t in re.finditer(r'<triangle\b[^>]*/>',o[2]):
                a=atributos(t[0]);codes.append(pintar(a.get('paint_color',''),padrao))
            partes.append(dict(vertices=v,faces=f,codigos=codes,nome=nome,id=oid,originais=v.copy()))
        else:
            for m in re.finditer(r'<component\b([^>]*)/>',o[2]):
                c=atributos(m[1]);visitar(c.get('p:path',path).lstrip('/'),c['objectid'],M@matriz(c.get('transform')))
    visitar('3D/3dmodel.model',item['objectid'],matriz(item.get('transform')))
    metadados=''.join(m[0]for m in re.finditer(r'<metadata\b[^>]*name="(?:Designer|License|Copyright|CopyRight)"[^>]*>[\s\S]*?</metadata>',main))
    return partes,metadados,removidos

def ajustar_borda(s,nivel,centro,raio_limite_labio):
    # Retira somente a sobreposição externa; o lábio que guia o alumínio
    # conserva toda a altura e a superfície interna original.
    limite=md.Manifold.cylinder(400,raio_limite_labio,circular_segments=512).translate([*centro,-100])
    return s.trim_by_plane([0,0,1],nivel)+(s^limite)

def preparar(entrada,saida,id,perfil):
    partes,metadados,removidos=ler_partes(entrada,id)
    bounds=np.array([np.min([p['vertices'].min(0)for p in partes],axis=0),np.max([p['vertices'].max(0)for p in partes],axis=0)])
    ajuste_borda=0.
    if id==3:
        corpo=partes[-1];borda=partes[-2]
        nivel=round(float(corpo['vertices'][:,2].max()),5)
        ajuste_borda=nivel-float(borda['vertices'][:,2].min())
        corpo['vertices'][abs(corpo['vertices'][:,2]-nivel)<1e-5,2]=nivel
        for p in partes[:-1]:p['quantizacao']=5
        m=trimesh.Trimesh(np.round(borda['vertices'],5),borda['faces'],process=False);m.merge_vertices(digits_vertex=5)
        s=ajustar_borda(md.Manifold(md.Mesh64(np.array(m.vertices),np.array(m.faces,dtype=np.uint64))),nivel,[128,128],41.26)
        if s.status()!=md.Error.NoError:raise ValueError('Falha no encontro da borda superior.')
        q=s.to_mesh64();cor=borda['codigos'][0]
        if len(set(borda['codigos']))!=1:raise ValueError('Borda com pintura subdividida; não recortar sem revisão.')
        borda.update(vertices=np.array(q.vert_properties)[:,:3],faces=np.array(q.tri_verts),codigos=[cor]*len(q.tri_verts))
    conectores=[]
    if id==1:
        a=md.Manifold.cylinder(5.4,42.05,circular_segments=512)-md.Manifold.cylinder(5.4,41.5,circular_segments=512)
        q=a.translate([130,130,129.9]).to_mesh64()
        conectores=[dict(vertices=np.array(q.vert_properties)[:,:3],faces=np.array(q.tri_verts),codigos=['8']*len(q.tri_verts))]
    if id==2:
        p=partes[0];s=md.Manifold(md.Mesh64(p['vertices'].copy(),p['faces'].astype(np.uint64)))
        # A fonte tem uma componente indexada; o motor pode separar resíduos
        # de volume < 1e-5 mm³ ao avaliar dobras quase coplanares. Não altera
        # a malha/pintura original por causa desse ruído da avaliação.
        if s.status()!=md.Error.NoError or sum(abs(c.volume())>1e-5 for c in s.decompose())!=1:raise ValueError('O Copo 2 não é um sólido completo.')
        usados,inversa=np.unique(p['faces'],return_inverse=True)
        p['vertices']=p['vertices'][usados];p['faces']=inversa.reshape(-1,3)
        r=dict(vertices=p['vertices'],faces=p['faces'],volume=s.volume(),fragmentos_numericos=0);codigos=p['codigos'];erromax=0.;aproximadas=0
    else:
        r=unir_partes(partes,conectores);np.savez(saida/f'{id}-uniao.npz',v=r['vertices'],f=r['faces'],origens=r['origens']);fontes=[*partes,*conectores];codigos=[];erromax=0.;aproximadas=0
        for t,(origem,face)in zip(r['faces'],r['origens']):
            p=fontes[origem];code=p['codigos'][face]
            if not isinstance(decodificar(code),int):
                a=p.get('originais',p['vertices'])[p['faces'][face]];b=r['vertices'][t]
                code,erro=transferir_pintura(code,a,b,tolerancia=.4)
                erromax=max(erromax,erro);aproximadas+=erro>2e-5
            codigos.append(code)
    depois=np.array([r['vertices'].min(0),r['vertices'].max(0)])
    if not np.allclose(bounds,depois,atol=2e-5):raise ValueError('Envelope do copo mudou durante a união.')
    if abs(depois[1,2]-depois[0,2]-145)>1e-4:raise ValueError('Altura diferente de 145 mm.')
    perfil=dict(perfil,filament_colour=['#000000','#ffffff'])
    destino=saida/f'{id}.3mf'
    destino.write_bytes(arquivo_unico(r['vertices'],r['faces'],codigos,f'Copo {id}',perfil,metadados))
    np.savez(saida/f'{id}-malha.npz',v=r['vertices'],f=r['faces'])
    report=dict(id=id,arquivo=destino.name,malha_unica=True,altura=float(depois[1,2]-depois[0,2]),bounds=depois.tolist(),volume=float(r['volume']),triangulos=len(r['faces']),fragmentos_numericos=r['fragmentos_numericos'],acessorios_retirados=removidos,ajuste_encontro_borda_mm=ajuste_borda,faces_pintura_reparametrizadas=aproximadas,erro_max_pintura_mm=erromax,entrada_sha256=hashlib.sha256((entrada/f'{id}.3mf').read_bytes()).hexdigest())
    report['partes_preservadas']=[p['nome']for p in partes]
    (saida/f'{id}-validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False),flush=True);return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--entrada',type=Path,required=True);p.add_argument('--saida',type=Path,required=True);p.add_argument('--copo',type=int,choices=[1,2,3]);args=p.parse_args()
    if args.entrada.resolve()==args.saida.resolve():raise ValueError('Use saída separada para preservar as referências.')
    args.saida.mkdir(exist_ok=True,parents=True);ids=[args.copo]if args.copo else[1,2,3]
    for i in ids:
        if (args.saida/f'{i}.3mf').exists():raise FileExistsError('Arquivo de saída já existe; escolha uma nova pasta.')
    perfil=json.loads((Path(__file__).resolve().parents[1]/'src/renderer/assets/copos/perfil-petg.json').read_text(encoding='utf-8'))
    report=[preparar(args.entrada,args.saida,i,perfil)for i in ids]
    (args.saida/'validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
