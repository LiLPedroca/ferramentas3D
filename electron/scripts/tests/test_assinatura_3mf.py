import sys,unittest,tempfile,zipfile,gzip,json,struct,hashlib
from pathlib import Path
import numpy as np
import trimesh
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from assinar_copos import processar_copo,codigo_pintura,ler_mesh,objeto,geometria_fechada
from assinatura_copos import construir_assinatura

ASSETS=Path(__file__).resolve().parents[2]/'src'/'renderer'/'assets'
def mesh_xml(mesh):
 v=''.join('<vertex x="%s" y="%s" z="%s"/>'%tuple(p)for p in mesh.vertices)
 f=''.join('<triangle v1="%d" v2="%d" v3="%d" paint_color="4"/>'%tuple(t)for t in mesh.faces)
 return '<mesh><vertices>'+v+'</vertices><triangles>'+f+'</triangles></mesh>'
def preparar(p,id):
 base=trimesh.creation.box([100,100,.2]);base.apply_translation([0,0,.1])
 cima=trimesh.creation.box([100,100,1.3]);cima.apply_translation([0,0,.85])
 if id==1:
  objetos='<object id="1">'+mesh_xml(base)+'</object><object id="2">'+mesh_xml(cima)+'</object>'
  componentes='<component objectid="1"/><component objectid="2"/>';parts='<part id="1"><metadata key="name" value="Base"/></part><part id="2"/>';rootid=10
 else:
  base=trimesh.creation.box([100,100,5]);base.apply_translation([0,0,2.5])
  objetos='<object id="19">'+mesh_xml(base)+'</object>';componentes='<component objectid="19"/>';parts='<part id="19"><metadata key="name" value="Copo"/></part>';rootid=20
 xml=f'<model><resources>{objetos}<object id="{rootid}"><components>{componentes}</components></object></resources><build><item objectid="{rootid}"/></build></model>'
 cfg=f'<config><object id="{rootid}">{parts}</object></config>'
 with zipfile.ZipFile(p/f'{id}.3mf','w')as z:
  z.writestr('3D/3dmodel.model',xml);z.writestr('Metadata/model_settings.config',cfg);z.writestr('Metadata/project_settings.config',json.dumps({'filament_colour':['#000000','#ffffff']}))
 b=json.dumps({'partes':[{'cor':'#000000'},{'cor':'#ffffff'}]}).encode();(p/f'{id}.bin.gz').write_bytes(gzip.compress(struct.pack('<I',len(b))+b))

class NativoTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.desenho=construir_assinatura(ASSETS/'copos'/'criae3d-logo.svg',ASSETS/'fontes'/'Rubik-Regular.ttf')
 def test_codigos_nativos_dos_filamentos(self):
  self.assertEqual([codigo_pintura(i)for i in [1,2,3,4]],['4','8','0C','1C'])
 def test_recusa_assinar_novamente_asset_pronto(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);saida=p/'saida';saida.mkdir()
   with zipfile.ZipFile(p/'2.3mf','w')as z:z.writestr('Metadata/model_settings.config','<config><metadata key="name" value="Copo completo com assinatura integrada"/></config>')
   with self.assertRaisesRegex(ValueError,'já possui assinatura'):
    processar_copo(2,p,saida,self.desenho)
   self.assertFalse((saida/'2.3mf').exists())
 def test_nao_soldar_vertices_de_malha_nativa_ja_fechada(self):
  a=trimesh.creation.box([1,1,1]);b=a.copy();b.apply_translation([1+1e-12,0,0]);m=trimesh.util.concatenate([a,b])
  self.assertTrue(m.is_volume)
  resultado=geometria_fechada(m.vertices,m.faces)
  self.assertTrue(resultado.is_volume)
  self.assertEqual(len(resultado.vertices),len(m.vertices))
 def test_base_fundida_sem_peca_de_logo_e_entrada_preservada(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);saida=p/'saida';saida.mkdir();preparar(p,1);antes=hashlib.sha256((p/'1.3mf').read_bytes()).hexdigest()
   r=processar_copo(1,p,saida,self.desenho)
   self.assertTrue(r['base_fundida']);self.assertTrue(r['malha_fechada'])
   self.assertEqual(hashlib.sha256((p/'1.3mf').read_bytes()).hexdigest(),antes)
   with zipfile.ZipFile(saida/'1.3mf')as z:
    xml=z.read('3D/3dmodel.model').decode();root=objeto(xml,10)[2]
    self.assertIn('objectid="1"',root);self.assertNotIn('objectid="2"',root)
    self.assertNotIn('<part id="2"',z.read('Metadata/model_settings.config').decode())
    v,f=ler_mesh(objeto(xml,1)[2]);m=trimesh.Trimesh(v,f,process=False);m.remove_unreferenced_vertices()
    self.assertTrue(m.is_watertight);self.assertEqual(len(m.split()),1)
    self.assertAlmostEqual(m.bounds[1,2],1.5)
 def test_copo_de_mesh_unico_continua_um_objeto(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d);saida=p/'saida';saida.mkdir();preparar(p,2)
   r=processar_copo(2,p,saida,self.desenho)
   self.assertFalse(r['base_fundida'])
   with zipfile.ZipFile(saida/'2.3mf')as z:
    xml=z.read('3D/3dmodel.model').decode();self.assertEqual(xml.count('<object '),2)
    self.assertEqual(xml.count('<component '),1)
    self.assertIn('paint_color="8"',objeto(xml,19)[2])

if __name__=='__main__':unittest.main()
