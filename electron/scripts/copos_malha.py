"""União estrutural offline, com origem por face para conservar a pintura."""
import numpy as np
import manifold3d as md
import trimesh

def unir_partes(partes,conectores=(),quantizacao=None):
    solidos=[];originais={}
    for i,p in enumerate([*partes,*conectores]):
        v=np.asarray(p['vertices'],dtype=np.float64)
        f=np.asarray(p['faces'],dtype=np.uint64)
        ids=np.arange(len(f),dtype=np.uint64)
        digitos=p.get('quantizacao',quantizacao)
        if digitos is not None:
            m=trimesh.Trimesh(np.round(v,digitos),f,process=False)
            m.merge_vertices(digits_vertex=digitos)
            v=np.asarray(m.vertices);f=np.asarray(m.faces,dtype=np.uint64)
            boas=(f[:,0]!=f[:,1])&(f[:,1]!=f[:,2])&(f[:,0]!=f[:,2])
            f=f[boas];ids=ids[boas]
        s=md.Manifold(md.Mesh64(v.copy(order='C'),f.copy(order='C'),face_id=ids.copy()))
        if s.status()!=md.Error.NoError:raise ValueError(f'Parte {i+1} não é um sólido válido: {s.status()}.')
        for id in s.to_mesh64().run_original_id:originais[id]=i
        solidos.append(s)
    unido=md.Manifold.batch_boolean(solidos,md.OpType.Add)
    if unido.status()!=md.Error.NoError:raise ValueError(f'Falha na união: {unido.status()}.')
    componentes=unido.decompose()
    # Ruído numérico da textura: muito menor que um milésimo de mm³ e
    # impossível de imprimir. Nunca descarta uma peça estrutural desconectada.
    uteis=[s for s in componentes if s.volume()>1e-5]
    if len(uteis)!=1:raise ValueError(f'O copo ainda tem {len(uteis)} componentes desconectados.')
    unido=uteis[0];mesh=unido.to_mesh64()
    origens=np.zeros((len(mesh.tri_verts),2),dtype=np.int64)
    for k,id in enumerate(mesh.run_original_id):
        lo,hi=mesh.run_index[k]//3,mesh.run_index[k+1]//3
        origens[lo:hi,0]=originais[id]
        origens[lo:hi,1]=np.asarray(mesh.face_id)[lo:hi]
    return dict(vertices=np.asarray(mesh.vert_properties)[:,:3],faces=np.asarray(mesh.tri_verts,dtype=np.int64),origens=origens,volume=unido.volume(),fragmentos_numericos=len(componentes)-1)
