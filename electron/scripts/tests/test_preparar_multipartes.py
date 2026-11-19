import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
import zipfile

import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from assinar_copos import ler_mesh
from assinatura_copos import construir_assinatura
from preparar_multipartes import montar, renomear

ASSETS = Path(__file__).resolve().parents[2] / 'src/renderer/assets'


def peca(caminho, nome, caixas):
    """3MF no formato do Bambu: malhas no 3dmodel e um objeto com componentes."""
    objs, comps, partes = [], [], []
    for i, (lados, z0, extrusor) in enumerate(caixas, 1):
        m = trimesh.creation.box(lados); m.apply_translation([0, 0, z0 + lados[2] / 2])
        malha = ''.join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in m.vertices)
        tris = ''.join(f'<triangle v1="{a}" v2="{b}" v3="{c}" paint_color="10"/>' for a, b, c in m.faces)
        objs.append(f'<object id="{i}" type="model"><mesh><vertices>{malha}</vertices><triangles>{tris}</triangles></mesh></object>')
        comps.append(f'<component objectid="{i}"/>')
        partes.append(f'<part id="{i}" subtype="normal_part"><metadata key="name" value="Faixa {i}"/><metadata key="extruder" value="{extrusor}"/></part>')
    n = len(caixas) + 1
    modelo = f'<model><resources>{"".join(objs)}<object id="{n}" type="model"><components>{"".join(comps)}</components></object></resources><build><item objectid="{n}" transform="1 0 0 0 1 0 0 0 1 130 130 0" printable="1"/></build></model>'
    config = f'<config><object id="{n}"><metadata key="name" value="{nome}"/><metadata key="extruder" value="1"/>{"".join(partes)}</object><plate><metadata key="plater_name" value="{nome}"/></plate></config>'
    with zipfile.ZipFile(caminho, 'w') as z:
        z.writestr('3D/3dmodel.model', modelo); z.writestr('Metadata/model_settings.config', config)


class PrepararMultipartesTest(unittest.TestCase):
    def test_tres_placas_nomes_cores_e_assinatura(self):
        desenho = construir_assinatura(ASSETS / 'copos/criae3d-logo.svg', ASSETS / 'fontes/Rubik-Regular.ttf')
        with tempfile.TemporaryDirectory() as pasta:
            pasta = Path(pasta)
            peca(pasta / 'base.3mf', 'Copo base', [([90, 90, .25], 0, 1), ([90, 90, 5], .2, 1), ([90, 90, 5], 5.2, 2)])
            peca(pasta / 'tubo.3mf', 'Copo tubo', [([80, 80, 50], 10, 1)])
            peca(pasta / 'argola.3mf', 'Copo argola', [([80, 80, 5], 60, 3)])
            saida = pasta / '9-multipartes.3mf'
            r = montar(9, {p: pasta / f'{p}.3mf' for p in ('base', 'tubo', 'argola')}, saida, desenho, {'filament_colour': ['#ff0000']})
            with zipfile.ZipFile(saida) as z:
                config = z.read('Metadata/model_settings.config').decode()
                perfil = json.loads(z.read('Metadata/project_settings.config'))
                base = z.read('3D/Objects/base 9.model').decode()
                argola = z.read('3D/Objects/argola 9.model').decode()
            nomes = set(re.findall(r'key="name" value="([^"]*)"', config))
            self.assertEqual(nomes, {'base 9', 'tubo 9', 'argola 9'})
            self.assertEqual(re.findall(r'key="plater_name" value="([^"]*)"', config), ['', '', ''])
            self.assertEqual(perfil['filament_colour'], ['#000000', '#ffffff'])
            self.assertNotIn('extruder" value="3"', config)  # 3º filamento vira branco
            self.assertNotIn('paint_color="10"', argola)
            self.assertIn('paint_color="8"', base)  # marca branca
            self.assertAlmostEqual(r['assinatura']['volume_antes'] - r['assinatura']['volume_depois'], r['assinatura']['volume_rebaixo'], places=3)
            objetos = re.findall(r'<object id="\d+" type="model">([\s\S]*?)</object>', base)
            self.assertEqual(len(objetos), 2)  # lâmina do fundo unida à faixa de cima
            v, f = ler_mesh(objetos[0])
            self.assertTrue(trimesh.Trimesh(v, f, process=False).is_volume)
            with self.assertRaises(FileExistsError):
                montar(9, {p: pasta / f'{p}.3mf' for p in ('base', 'tubo', 'argola')}, saida, desenho, {})

    def test_renomear_troca_so_nomes(self):
        with tempfile.TemporaryDirectory() as pasta:
            pasta = Path(pasta); entrada = pasta / 'a.3mf'; saida = pasta / 'b.3mf'
            config = ('<config><object id="7"><metadata key="name" value="base drapeado"/><part id="1"><metadata key="name" value="PERSONALIZE AQUI"/></part></object>'
                      '<object id="9"><metadata key="name" value="tubo texturizado"/></object><object id="11"><metadata key="name" value="Argola branca"/></object>'
                      '<plate><metadata key="plater_name" value=""/></plate></config>')
            with zipfile.ZipFile(entrada, 'w') as z:
                z.writestr('Metadata/model_settings.config', config); z.writestr('3D/Objects/x.model', 'malha')
            r = renomear(1, entrada, saida)
            self.assertEqual(r['nomes'], {'7': 'base 1', '9': 'tubo 1', '11': 'argola 1'})
            with zipfile.ZipFile(saida) as z:
                novo = z.read('Metadata/model_settings.config').decode()
                self.assertEqual(z.read('3D/Objects/x.model'), b'malha')
            self.assertEqual(set(re.findall(r'key="name" value="([^"]*)"', novo)), {'base 1', 'tubo 1', 'argola 1'})
            self.assertIn('plater_name" value=""', novo)


if __name__ == '__main__': unittest.main()
