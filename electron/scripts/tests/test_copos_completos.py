import sys,unittest
from pathlib import Path
import numpy as np
import trimesh
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from copos_malha import unir_partes
from preparar_copos_completos import arquivo_unico,ajustar_borda
import manifold3d as md
import zipfile,io,re

def parte(mesh):return dict(vertices=mesh.vertices,faces=mesh.faces)

class CoposCompletosTest(unittest.TestCase):
 def test_borda_conserva_labio_interno_ao_retirar_sobreposicao_externa(self):
  cilindro=lambda r:md.Manifold.cylinder(10,r,circular_segments=512)
  original=cilindro(44)-cilindro(40)
  esperado=256*np.sin(2*np.pi/512)*(4*(44**2-40**2)+6*(41.28**2-40**2))
  novo=ajustar_borda(original,6,[0,0],41.28)
  self.assertAlmostEqual(novo.volume(),esperado,places=6)
  self.assertEqual(len(novo.decompose()),1)

 def test_arquivo_tem_somente_copo_pintado_sem_componentes(self):
  m=trimesh.creation.box([2,2,2]);codigos=['4','8']*(len(m.faces)//2)
  b=arquivo_unico(m.vertices,m.faces,codigos,'Copo 2',{'filament_colour':['#000000','#ffffff']})
  with zipfile.ZipFile(io.BytesIO(b))as z:
   xml=z.read('3D/3dmodel.model').decode();cfg=z.read('Metadata/model_settings.config').decode()
   self.assertEqual(xml.count('<object '),1);self.assertEqual(xml.count('<mesh>'),1)
   self.assertNotIn('<components>',xml);self.assertEqual(xml.count('<item '),1)
   self.assertIn('name="Copo 2"',xml);self.assertIn('paint_color="8"',xml)
   self.assertEqual(cfg.count('<part '),1)
 def test_uniao_e_um_solido_fechado_sem_superficies_internas(self):
  a=trimesh.creation.box([2,2,2]);b=a.copy();b.apply_translation([1,0,0])
  r=unir_partes([parte(a),parte(b)])
  m=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertTrue(m.is_volume);self.assertEqual(len(m.split()),1)
  self.assertAlmostEqual(m.volume,12);self.assertTrue(np.allclose(m.bounds,[[-1,-1,-1],[2,1,1]]))
  self.assertEqual(len(r['origens']),len(m.faces))
  self.assertTrue(set(r['origens'][:,0])<={0,1})
 def test_nao_disfarca_pecas_soltas_no_mesmo_objeto(self):
  a=trimesh.creation.box([2,2,2]);b=a.copy();b.apply_translation([4,0,0])
  with self.assertRaisesRegex(ValueError,'desconectad'):
   unir_partes([parte(a),parte(b)])
 def test_conector_preenche_folga_sem_mudar_envelope(self):
  a=trimesh.creation.box([2,2,2]);b=a.copy();b.apply_translation([2.15,0,0])
  ponte=trimesh.creation.box([.35,1,1]);ponte.apply_translation([1.075,0,0])
  r=unir_partes([parte(a),parte(b)],conectores=[parte(ponte)])
  m=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertTrue(m.is_volume);self.assertEqual(len(m.split()),1)
  self.assertTrue(np.allclose(m.bounds,[[-1,-1,-1],[3.15,1,1]]))
 def test_fecha_folga_numerica_sem_alterar_peca(self):
  a=trimesh.creation.box([2,2,2]);b=a.copy();b.apply_translation([0,0,2+3e-8])
  r=unir_partes([parte(a),parte(b)],quantizacao=5)
  m=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
  self.assertEqual(len(m.split()),1);self.assertAlmostEqual(m.volume,16)
 def test_aceita_arrays_somente_leitura_retornados_pelo_manifold(self):
  m=trimesh.creation.box([2,2,2]);v=np.array(m.vertices);f=np.array(m.faces,dtype=np.uint64)
  v.setflags(write=False);f.setflags(write=False)
  r=unir_partes([dict(vertices=v,faces=f)])
  self.assertAlmostEqual(r['volume'],8)
 def test_preserva_triangularizacao_de_faces_pintadas(self):
  m=trimesh.creation.box([2,2,2]).subdivide()
  p=parte(m)
  r=unir_partes([p])
  self.assertEqual(len(r['faces']),len(m.faces))
  for t,origem in zip(r['faces'],r['origens']):
   a=r['vertices'][t];b=m.vertices[m.faces[origem[1]]]
   self.assertLess(np.max(np.min(np.linalg.norm(a[:,None]-b[None],axis=2),axis=1)),1e-10)

if __name__=='__main__':unittest.main()
