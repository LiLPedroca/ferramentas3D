import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

import numpy as np
import trimesh
from shapely.geometry import box, Polygon, Point

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from assinar_copos import objeto, ler_mesh
from preparar_copo_multipartes import preparar
from preparar_copo_multipartes import assinar_fundo


def mesh_xml(mesh, cor='0C'):
    return '<mesh><vertices>' + ''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x,y,z in mesh.vertices) + '</vertices><triangles>' + ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="{cor}"/>' for a,b,c in mesh.faces) + '</triangles></mesh>'


class MultipartesTest(unittest.TestCase):
    def test_preserva_costura_coplanar_no_fundo_nativo(self):
        caixa=trimesh.creation.box([10,10,1.5]); caixa.apply_translation([0,0,.75])
        v=caixa.vertices.copy(); f=caixa.faces.copy()
        i=int(np.flatnonzero(np.all(v[f,2]==0,axis=1))[0]); a,b,c=f[i]
        tri=Polygon(v[[a,b,c],:2]); p=next(q for q in [(7,2),(-7,2),(2,7),(2,-7)] if not tri.covers(Point(q)))
        n=len(v); v=np.vstack([v,[*p,0]]); f=np.vstack([np.delete(f,i,axis=0),[[a,b,n],[b,c,n],[c,a,n]]])
        r=assinar_fundo(v,f,box(-1,-1,1,1),[0,0])
        m=trimesh.Trimesh(r['vertices'],r['faces'],process=False)
        self.assertTrue(m.is_volume)
        self.assertAlmostEqual(m.volume,150-.8,places=6)

    def test_assina_uniao_e_preserva_tres_placas_texto_encaixes_e_miniaturas(self):
        with tempfile.TemporaryDirectory() as pasta:
            pasta=Path(pasta); entrada=pasta/'original.3mf'; saida=pasta/'novo.3mf'
            cubo=trimesh.creation.box([10,10,.2]); acabamento=trimesh.creation.box([10,10,1.3])
            objetos=''.join(f'<object id="{i}" type="model">{mesh_xml(cubo if i!=2 else acabamento, "1C" if i==3 else "0C")}</object>' for i in range(1,7))
            ext='<model><resources>'+objetos+'</resources></model>'
            comps=''.join(f'<component p:path="/3D/Objects/base.model" objectid="{i}" transform="1 0 0 0 1 0 0 0 1 0 0 { .1 if i==1 else .85 if i==2 else i*2}"/>' for i in range(1,7))
            main='<model><metadata name="Application">Nativo</metadata><resources><object id="7"><components>'+comps+'</components></object></resources><build><item objectid="7" transform="1 0 0 0 1 0 0 0 1 20 30 0"/></build></model>'
            texto='<slic3rpe:text text="PERSONALIZE AQUI"/><slic3rpe:shape depth="1"/>'
            cfg='<config><object id="7"><metadata key="extruder" value="3"/>'+''.join(f'<part id="{i}"><metadata key="extruder" value="{4 if i==3 else 3}"/>{texto if i==6 else ""}</part>' for i in range(1,7))+'</object>'+''.join(f'<plate><metadata key="plater_id" value="{i}"/></plate>' for i in range(1,4))+'</config>'
            arquivos={'3D/3dmodel.model':main.encode(),'3D/Objects/base.model':ext.encode(),'Metadata/model_settings.config':cfg.encode(),'Metadata/project_settings.config':b'{}','Metadata/plate_1.png':b'PNG ORIGINAL','3D/_rels/3dmodel.model.rels':b'REL ORIGINAL'}
            with zipfile.ZipFile(entrada,'w') as z:
                for nome,dados in arquivos.items(): z.writestr(nome,dados)
            report=preparar(entrada,saida,{'marca':box(-1,-1,1,1)},{'brim_type':'no_brim','filament_colour':['#000000','#ffffff']})
            with zipfile.ZipFile(saida) as z:
                self.assertEqual(z.namelist(),list(arquivos))
                self.assertEqual(z.read('Metadata/plate_1.png'),arquivos['Metadata/plate_1.png'])
                self.assertEqual(z.read('3D/_rels/3dmodel.model.rels'),arquivos['3D/_rels/3dmodel.model.rels'])
                novo=z.read('3D/Objects/base.model').decode(); raiz=z.read('3D/3dmodel.model').decode(); config=z.read('Metadata/model_settings.config').decode()
                self.assertNotIn('objectid="2"',raiz); self.assertNotIn('<part id="2"',config)
                self.assertIn(texto,config); self.assertEqual(config.count('<plate>'),3)
                self.assertNotIn('value="3"',config.split('<plate>')[0]); self.assertNotIn('paint_color="0C"',novo)
                for i in range(3,7):
                    v,f=ler_mesh(objeto(novo,i)[2]); vo,fo=ler_mesh(objeto(ext,i)[2])
                    self.assertTrue((v==vo).all()); self.assertTrue((f==fo).all())
                v,f=ler_mesh(objeto(novo,1)[2]); m=trimesh.Trimesh(v,f,process=False)
                self.assertTrue(m.is_volume); self.assertAlmostEqual(m.volume,150-.8,places=6)
                self.assertIn('paint_color="8"',objeto(novo,1)[2]); self.assertIn('paint_color="4"',objeto(novo,1)[2])
                self.assertEqual(json.loads(z.read('Metadata/project_settings.config'))['brim_type'],'no_brim')
            self.assertTrue(report['demais_geometrias_identicas']); self.assertEqual(report['placas'],3)
            with self.assertRaises(FileExistsError): preparar(entrada,saida,{'marca':box(-1,-1,1,1)},{})


if __name__=='__main__': unittest.main()
