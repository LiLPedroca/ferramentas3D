import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from copos_pintura import remapear_pintura,permutar_pintura,cor_em,transferir_pintura

class PinturaTest(unittest.TestCase):
 def test_remapeia_filamentos_e_cor_padrao_sem_perder_subdivisao(self):
  self.assertEqual(remapear_pintura('0C',{3:1},3),'4')
  self.assertEqual(remapear_pintura('',{3:2},3),'8')
  codigo='48483'
  antes=[cor_em(codigo,p)for p in [[.05,.05],[.9,.05],[.05,.9],[.33,.33]]]
  novo=remapear_pintura(codigo,{1:2,2:1},1)
  self.assertEqual([cor_em(novo,p)for p in [[.05,.05],[.9,.05],[.05,.9],[.33,.33]]],[3-c for c in antes])
 def test_rotacionar_vertices_nao_rotaciona_o_desenho(self):
  vertices=np.array([[0.,0.],[1.,0.],[0.,1.]])
  for codigo in ['48483','88442','8002','0000800300303']:
   for perm in [[0,1,2],[1,2,0],[2,0,1]]:
    novo=permutar_pintura(codigo,perm)
    for p in [[.04,.07],[.84,.03],[.04,.8],[.33,.32],[.6,.12]]:
     self.assertEqual(cor_em(novo,p,vertices[perm]),cor_em(codigo,p,vertices))
 def test_recusa_codigo_invalido_ou_filamento_nao_mapeado(self):
  with self.assertRaises(ValueError):remapear_pintura('XYZ',{1:1},1)
  with self.assertRaises(ValueError):remapear_pintura('0C',{1:1},1)
 def test_pintura_subdividida_uniforme_nao_exige_deformar_desenho(self):
  a=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.]])
  codigo,erro=transferir_pintura('44443',a,a/2,tolerancia=.02)
  self.assertEqual(codigo,'4');self.assertEqual(erro,0)

 def test_transferencia_limita_deslocamento_da_pintura(self):
  a=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]])
  b=a[[1,2,0]]+np.array([.01,0,0])
  codigo,erro=transferir_pintura('48483',a,b,tolerancia=.02)
  self.assertAlmostEqual(erro,.01)
  self.assertEqual(codigo,permutar_pintura('48483',[1,2,0]))
  with self.assertRaisesRegex(ValueError,'deslocamento'):
   transferir_pintura('48483',a,b+1,tolerancia=.02)

if __name__=='__main__':unittest.main()
