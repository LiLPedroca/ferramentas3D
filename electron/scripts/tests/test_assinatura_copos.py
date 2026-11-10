import sys,unittest
from pathlib import Path
import numpy as np
import trimesh
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from assinatura_copos import construir_assinatura, rebaixar_fundo, SITE, INSTAGRAM

ASSETS=Path(__file__).resolve().parents[2]/'src'/'renderer'/'assets'

class AssinaturaTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.desenho=construir_assinatura(ASSETS/'copos'/'criae3d-logo.svg',ASSETS/'fontes'/'Rubik-Regular.ttf')
 def test_textos_e_underscores(self):
  self.assertEqual(SITE,'www.criae3d.com.br')
  self.assertEqual(INSTAGRAM,'Instagram: _criae3d_')
  inferiores=[x for x in self.desenho['glifos'] if x['arco']=='inferior']
  self.assertEqual(''.join(x['caractere'] for x in inferiores),INSTAGRAM)
  self.assertEqual(sum(x['caractere']=='_' and not x['forma'].is_empty for x in inferiores),2)
  self.assertLess(inferiores[0]['centro'][0],inferiores[-1]['centro'][0])
  self.assertTrue(all(abs(x['rotacao'])<np.pi/2 for x in inferiores))
 def test_marca_cabe_na_base(self):
  geometria=self.desenho['marca']
  self.assertTrue(geometria.is_valid)
  for pol in geometria.geoms:
   self.assertLess(max(np.hypot(x,y) for x,y in pol.exterior.coords),38)
  self.assertGreater(self.desenho['logo'].area,50)
  self.assertTrue(any(len(p.interiors)>0 for p in self.desenho['logo'].geoms))
 def test_rebaixo_fechado_orientado_sem_objeto_separado(self):
  caixa=trimesh.creation.box(extents=[100,100,5]);caixa.apply_translation([0,0,2.5])
  r=rebaixar_fundo(caixa.vertices,caixa.faces,self.desenho['marca'],[0,0],profundidade=.2)
  mesh=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertTrue(mesh.is_watertight)
  self.assertTrue(mesh.is_winding_consistent)
  self.assertTrue(mesh.is_volume)
  self.assertEqual(len(mesh.split()),1)
  self.assertTrue(np.allclose(mesh.bounds,caixa.bounds))
  self.assertAlmostEqual(mesh.volume,caixa.volume-self.desenho['marca'].area*.2,places=5)
  self.assertGreater(np.count_nonzero(r['pintura']==1),100)
  self.assertGreater(np.count_nonzero(r['pintura']==2),100)
  marca=r['faces'][r['pintura']==1];self.assertAlmostEqual(mesh.vertices[marca][:,:,2].max(),.2,places=8)
 def test_recusa_marca_fora_do_fundo(self):
  caixa=trimesh.creation.box(extents=[20,20,5]);caixa.apply_translation([0,0,2.5])
  with self.assertRaisesRegex(ValueError,'fora'):
   rebaixar_fundo(caixa.vertices,caixa.faces,self.desenho['marca'],[0,0])
 def test_preserva_chanfro_microscopico_acima_do_plano_inferior(self):
  n=64;v=[]
  for raio,z in [(40,0),(40.00001,2e-7),(41,2)]:
   v.extend([[raio*np.cos(2*np.pi*k/n),raio*np.sin(2*np.pi*k/n),z]for k in range(n)])
  v.extend([[0,0,0],[0,0,2]]);f=[]
  for k in range(n):
   q=(k+1)%n;f.extend([[3*n,q,k],[3*n+1,2*n+k,2*n+q]])
   for j in range(2):f.extend([[j*n+k,j*n+q,(j+1)*n+q],[j*n+k,(j+1)*n+q,(j+1)*n+k]])
  v=np.asarray(v);f=np.asarray(f);antes=trimesh.Trimesh(v,f,process=False)
  self.assertTrue(antes.is_volume)
  r=rebaixar_fundo(v,f,self.desenho['marca'],[0,0]);depois=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertTrue(depois.is_watertight)
  self.assertAlmostEqual(depois.volume,antes.volume-self.desenho['marca'].area*.2,places=5)
 def test_preserva_dobra_coplanar_com_faces_sobrepostas(self):
  from shapely.geometry import Polygon,Point
  caixa=trimesh.creation.box(extents=[100,100,5]);caixa.apply_translation([0,0,2.5])
  v=caixa.vertices.copy();f=caixa.faces.copy();i=int(np.flatnonzero(np.all(v[f,2]==0,axis=1))[0]);a,b,c=f[i]
  tri=Polygon(v[[a,b,c],:2]);p=next(q for q in [(20,20),(-20,20),(20,-20),(-20,-20)]if not tri.covers(Point(q)))
  n=len(v);v=np.vstack([v,[*p,0]]);f=np.vstack([np.delete(f,i,axis=0),[[a,b,n],[b,c,n],[c,a,n]]])
  antes=trimesh.Trimesh(v,f,process=False);self.assertTrue(antes.is_volume)
  r=rebaixar_fundo(v,f,self.desenho['marca'],[0,0],por_triangulo=True)
  depois=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertTrue(depois.is_volume)
  self.assertAlmostEqual(depois.volume,antes.volume-self.desenho['marca'].area*.2,places=5)

if __name__=='__main__':unittest.main()
