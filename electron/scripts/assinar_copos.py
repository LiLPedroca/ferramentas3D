"""Prepara cópias 3MF assinadas, sem sobrescrever as referências de entrada.

Uso: python scripts/assinar_copos.py --entrada <assets/copos> --saida <pasta nova>
Entrada: assets ainda sem assinatura (por exemplo, v0.37.1); não reprocessar
os assets atuais. Dependências de construção: numpy, trimesh, manifold3d,
shapely>=2.1, fonttools e matplotlib. O aplicativo não precisa de Python.
"""
import argparse,gzip,hashlib,json,re,struct,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
import trimesh
import manifold3d as md
from shapely.geometry import Polygon
from shapely.ops import unary_union
from assinatura_copos import construir_assinatura,rebaixar_fundo

OBJ=re.compile(r'<object\b([^>]*)>([\s\S]*?)</object>')
VERT=re.compile(r'<vertex\b[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*z="([^"]+)"[^>]*/>')
TRI=re.compile(r'<triangle\b[^>]*v1="(\d+)"[^>]*v2="(\d+)"[^>]*v3="(\d+)"[^>]*/>')
def atributos(s):return dict(re.findall(r'([\w:]+)="([^"]*)"',s))
def objeto(text,id):return next(m for m in OBJ.finditer(text)if atributos(m[1]).get('id')==str(id))
def matriz(s):
    a=np.array(list(map(float,s.split()))) if s else np.array([1,0,0,0,1,0,0,0,1,0,0,0.])
    m=np.eye(4);m[:3,:3]=a[:9].reshape(3,3).T;m[:3,3]=a[9:12];return m
def ler_mesh(body):
    v=np.fromiter((float(x)for t in VERT.finditer(body)for x in t.groups()),float).reshape(-1,3)
    f=np.fromiter((int(x)for t in TRI.finditer(body)for x in t.groups()),np.int64).reshape(-1,3)
    return v,f
def geometria_fechada(v,f):
    mesh=trimesh.Trimesh(v,f,process=False)
    if mesh.is_volume:return mesh
    mesh.merge_vertices(digits_vertex=10)
    # Triângulos colineares podem costurar uma junção em T na malha original.
    # Retira apenas faces com índice repetido após unir posições coincidentes.
    t=mesh.faces
    mesh.update_faces((t[:,0]!=t[:,1])&(t[:,1]!=t[:,2])&(t[:,0]!=t[:,2]))
    mesh.remove_unreferenced_vertices()
    return mesh
def codigo_pintura(filamento):
    if not 1<=filamento<=33:raise ValueError('Filamento fora do intervalo.')
    return str(filamento*4) if filamento<=2 else f'{filamento-3:X}C' if filamento<18 else f'{filamento-18:X}FC'
def encontrar_base(arquivos):
    path='3D/3dmodel.model';text=arquivos[path].decode()
    build=re.search(r'<build\b[^>]*>([\s\S]*?)</build>',text)[1]
    item=atributos(re.search(r'<item\b([^>]*)/>',build)[1])
    root=objeto(text,item['objectid']);componentes=list(re.finditer(r'<component\b([^>]*)/>',root[2]))
    c=atributos(componentes[0][1]);m=matriz(item.get('transform'))@matriz(c.get('transform'))
    basepath=c.get('p:path',path).lstrip('/')
    texto=arquivos[basepath].decode();base=objeto(texto,c['objectid'])
    return dict(path=basepath,texto=texto,base=base,m=m,item=item,componentes=componentes,root=root)

def processar_copo(id,entrada,saida,desenho):
    origem=entrada/f'{id}.3mf'
    with zipfile.ZipFile(origem)as z:arquivos={n:z.read(n)for n in z.namelist()}
    config_origem=arquivos.get('Metadata/model_settings.config',b'').decode()
    if any(marca in config_origem for marca in ['Base integrada Criae3D','Copo completo com assinatura integrada']):
        raise ValueError('O modelo já possui assinatura. Use os assets anteriores à assinatura como entrada.')
    fonte_hash=hashlib.sha256(origem.read_bytes()).hexdigest()
    pacote=gzip.decompress((entrada/f'{id}.bin.gz').read_bytes());n=struct.unpack_from('<I',pacote)[0]
    info=json.loads(pacote[4:4+n]);paleta=[p['cor']for p in info['partes']]
    del pacote
    cores=json.loads(arquivos['Metadata/project_settings.config'])['filament_colour']
    indices=[next(i+1 for i,c in enumerate(cores)if c[:7].lower()==cor.lower())for cor in paleta]
    codigos={1:codigo_pintura(indices[0]),2:codigo_pintura(indices[1])}
    dados=encontrar_base(arquivos);body=dados['base'][2];v,f=ler_mesh(body);faces_anteriores=len(f)
    M=dados['m'];world=v@M[:3,:3].T+M[:3,3]
    mesh_antes=geometria_fechada(world,f)
    fundida=False
    if id==1:
        c2=atributos(dados['componentes'][1][1]);o2=objeto(dados['texto'],c2['objectid']);v2,f2=ler_mesh(o2[2])
        faces_anteriores+=len(f2)
        M2=matriz(dados['item'].get('transform'))@matriz(c2.get('transform'))
        mesh2=geometria_fechada(v2@M2[:3,:3].T+M2[:3,3],f2)
        # Manifold trata as degenerescências combinatórias da malha nativa;
        # removê-las antes da união pode abrir a topologia de letras antigas.
        a=md.Manifold(md.Mesh64(world,f.astype(np.uint64)))
        b=md.Manifold(md.Mesh64(v2@M2[:3,:3].T+M2[:3,3],f2.astype(np.uint64)))
        if a.status()!=md.Error.NoError or b.status()!=md.Error.NoError:raise ValueError(f'Base original inválida para fusão: {a.status()}, {b.status()}.')
        unido=a+b
        if unido.status()!=md.Error.NoError:raise ValueError('Falha ao unir a base.')
        u=unido.to_mesh64();world=np.asarray(u.vert_properties)[:,:3];f=np.asarray(u.tri_verts,dtype=np.int64)
        mesh_antes=geometria_fechada(world,f);fundida=True
        if not mesh_antes.is_volume:raise ValueError(f'A base fundida não ficou fechada: fechada={mesh_antes.is_watertight}, orientação={mesh_antes.is_winding_consistent}, volume={mesh_antes.volume}.')
    z0=world[:,2].min();mask=np.all(abs(world[f,2]-z0)<1e-10,axis=1)
    disco=unary_union([Polygon(world[t,:2])for t in f[mask]])
    centro=[(disco.bounds[0]+disco.bounds[2])/2,(disco.bounds[1]+disco.bounds[3])/2]
    resultado=rebaixar_fundo(world,f,desenho['marca'],centro,por_triangulo=id==2)
    depois=geometria_fechada(resultado['vertices'],resultado['faces'])
    esperado=mesh_antes.volume-resultado['area']*resultado['profundidade']
    if not depois.is_volume:
        depois=trimesh.Trimesh(resultado['vertices'],resultado['faces'],process=False)
        arestas,contagem=np.unique(depois.edges_sorted,axis=0,return_counts=True)
        abertas=arestas[contagem!=2]
        amostra=depois.vertices[abertas[:5]].tolist()
        raise ValueError(f'Copo {id}: malha não fechada/orientada após assinatura (antes fechada: {mesh_antes.is_watertight}); {len(abertas)} arestas: {amostra}')
    if not np.allclose(depois.bounds,mesh_antes.bounds,atol=1e-6):raise ValueError('Envelope da base mudou.')
    if abs(depois.volume-esperado)>.02:raise ValueError(f'Volume divergente: {depois.volume} × {esperado}')
    inversa=np.linalg.inv(M);local=resultado['vertices']@inversa[:3,:3].T+inversa[:3,3]
    # Mantém a representação exata dos vértices e dos atributos de pintura fora do fundo.
    if not fundida:local[:len(v)]=v
    inicio=0 if fundida else len(v)
    verts=(''if fundida else''.join(t[0]for t in VERT.finditer(body)))+''.join(f'<vertex x="{x:.10f}" y="{y:.10f}" z="{z:.10f}"/>'for x,y,z in local[inicio:])
    manter=np.flatnonzero(~mask)
    if fundida:
        tris=['<triangle v1="%d" v2="%d" v3="%d"/>'%tuple(t)for t in f[manter]]
    else:
        tris=[t[0]for i,t in enumerate(TRI.finditer(body))if not mask[i]]
    k=len(manter)
    tris.extend('<triangle v1="%d" v2="%d" v3="%d" paint_color="%s"/>'%(*t,codigos[int(c)])for t,c in zip(resultado['faces'][k:],resultado['pintura'][k:]))
    novo_mesh='<mesh><vertices>'+verts+'</vertices><triangles>'+''.join(tris)+'</triangles></mesh>'
    novo_body=re.sub(r'<mesh\b[\s\S]*?</mesh>',lambda _:novo_mesh,body,count=1)
    texto=dados['texto'];base=dados['base'];texto=texto[:base.start(2)]+novo_body+texto[base.end(2):]
    arquivos[dados['path']]=texto.encode()
    cfg=ET.fromstring(arquivos['Metadata/model_settings.config']);obj_cfg=cfg.find(f"object[@id='{dados['item']['objectid']}']")
    part=obj_cfg.find(f"part[@id='{atributos(base[1])['id']}']")
    if fundida:
        # A referência antiga continua no resource, mas não é mais parte selecionável do conjunto.
        root_text=arquivos['3D/3dmodel.model'].decode();root_match=objeto(root_text,dados['item']['objectid'])
        novo_root=re.sub(r'<component\b([^>]*)/>',lambda q:''if atributos(q[1]).get('objectid')==c2['objectid'] else q[0],root_match[2])
        arquivos['3D/3dmodel.model']=(root_text[:root_match.start(2)]+novo_root+root_text[root_match.end(2):]).encode()
        obj_cfg.remove(obj_cfg.find(f"part[@id='{c2['objectid']}']"))
    nome=part.find("metadata[@key='name']")
    if nome is not None:nome.set('value','Base integrada Criae3D'if id!=2 else'Copo completo com assinatura integrada')
    for q in part.iter():
        if 'face_count'in q.attrib:q.set('face_count',str(len(resultado['faces'])))
    for q in obj_cfg.findall('metadata'):
        if 'face_count'in q.attrib:q.set('face_count',str(int(q.get('face_count'))+len(resultado['faces'])-faces_anteriores))
    arquivos['Metadata/model_settings.config']=ET.tostring(cfg,encoding='utf-8',xml_declaration=True)
    destino=saida/f'{id}.3mf'
    with zipfile.ZipFile(destino,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
        for nome,dados_arquivo in arquivos.items():z.writestr(nome,dados_arquivo)
    report=dict(id=id,origem_sha256=fonte_hash,arquivo=str(destino.name),base_fundida=fundida,malha_fechada=True,volume_antes=float(mesh_antes.volume),volume_depois=float(depois.volume),volume_removido=float(resultado['area']*.2),bounds_base=depois.bounds.tolist(),triangulos_base=len(resultado['faces']),paleta=paleta,filamentos=indices,rebaixo_mm=.2)
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--entrada',type=Path,required=True);p.add_argument('--saida',type=Path,required=True);p.add_argument('--copo',type=int,choices=[1,2,3]);args=p.parse_args()
    if args.entrada.resolve()==args.saida.resolve():raise ValueError('Use saída separada; referências não podem ser sobrescritas.')
    args.saida.mkdir(parents=True,exist_ok=True)
    ids=[args.copo]if args.copo else[1,2,3]
    for i in ids:
        if (args.saida/f'{i}.3mf').exists():raise FileExistsError('A saída já existe. Use uma nova pasta de validação.')
    assets=Path(__file__).resolve().parents[1]/'src'/'renderer'/'assets'
    desenho=construir_assinatura(assets/'copos'/'criae3d-logo.svg',assets/'fontes'/'Rubik-Regular.ttf')
    report=[processar_copo(i,args.entrada,args.saida,desenho)for i in ids]
    (args.saida/'assinatura.json').write_text(json.dumps(dict(site='www.criae3d.com.br',instagram='Instagram: _criae3d_',copos=report),ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
