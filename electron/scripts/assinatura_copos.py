"""Contornos da assinatura e rebaixo integrado ao mesh da base; sem objetos de texto."""
from pathlib import Path
import math
import xml.etree.ElementTree as ET
import numpy as np
from fontTools.pens.basePen import BasePen
from fontTools.svgLib.path import parse_path
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath, TextToPath
from shapely import constrained_delaunay_triangles
from shapely.affinity import translate, scale, rotate
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection, Point
from shapely.prepared import prep
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

SITE = 'www.criae3d.com.br'
INSTAGRAM = 'Instagram: _criae3d_'

def poligonos(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    return [p for item in g.geoms for p in poligonos(item)]

def preenchimento(contornos):
    resultado = GeometryCollection()
    for pontos in contornos:
        if len(pontos) < 3: continue
        p = Polygon(pontos)
        if not p.is_valid: p = p.buffer(0)
        resultado = resultado.symmetric_difference(p)
    return resultado

class ContornosSvg(BasePen):
    def __init__(self):
        super().__init__(None)
        self.contornos, self.atual = [], []
    def _moveTo(self, p):
        if self.atual: self._endPath()
        self.atual = [p]
    def _lineTo(self, p): self.atual.append(p)
    def _curveToOne(self, p1, p2, p3):
        p0 = np.asarray(self.atual[-1]);p1,p2,p3 = map(np.asarray,(p1,p2,p3))
        for t in np.linspace(0,1,25)[1:]:
            self.atual.append(tuple((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3))
    def _qCurveToOne(self, p1, p2):
        p0=np.asarray(self.atual[-1]);p1,p2=map(np.asarray,(p1,p2))
        for t in np.linspace(0,1,25)[1:]: self.atual.append(tuple((1-t)**2*p0+2*(1-t)*t*p1+t*t*p2))
    def _closePath(self): self._endPath()
    def _endPath(self):
        if len(self.atual)>2:self.contornos.append(self.atual)
        self.atual=[]

def construir_assinatura(svg, fonte):
    pen = ContornosSvg()
    for path in ET.parse(svg).getroot().iter('{http://www.w3.org/2000/svg}path'):
        parse_path(path.get('d',''),pen)
    pen._endPath()
    logo=preenchimento(pen.contornos)
    x0,y0,x1,y1=logo.bounds
    logo=scale(translate(logo,-(x0+x1)/2,-(y0+y1)/2),xfact=55/(x1-x0),yfact=-55/(x1-x0),origin=(0,0))
    glifos=[];formas=[logo]
    medidor=TextToPath()
    for arco,texto,tamanho,raio in [('superior',SITE,7.,30.),('inferior',INSTAGRAM,6.5,35.)]:
        prop=FontProperties(fname=str(fonte),size=tamanho)
        avancos=[medidor.get_text_width_height_descent(c,prop,False)[0] for c in texto]
        total=sum(avancos);cursor=0.
        for c,avanco in zip(texto,avancos):
            deslocamento=(cursor+avanco/2-total/2)/raio
            theta=math.pi/2-deslocamento if arco=='superior' else -math.pi/2+deslocamento
            angulo=theta-math.pi/2 if arco=='superior' else theta+math.pi/2
            centro=(raio*math.cos(theta),raio*math.sin(theta))
            forma=preenchimento(TextPath((0,0),c,size=tamanho,prop=prop).to_polygons()).buffer(.15,quad_segs=3) if not c.isspace() else GeometryCollection()
            forma=translate(rotate(translate(forma,-avanco/2,0),angulo,origin=(0,0),use_radians=True),*centro)
            glifos.append(dict(arco=arco,caractere=c,forma=forma,centro=centro,rotacao=angulo))
            if not forma.is_empty:formas.append(forma)
            cursor+=avanco
    marca=unary_union(formas)
    return dict(marca=MultiPolygon(poligonos(marca)),logo=MultiPolygon(poligonos(logo)),glifos=glifos)

def rebaixar_fundo(vertices, faces, marca, centro, profundidade=.2, por_triangulo=False):
    """Recebe coordenadas mundiais, mantém faces restantes e devolve seu mapa original.

    A marca foi composta como vista pelo lado externo inferior. Inverte X para
    a leitura correta olhando de baixo, com a câmera usando Z para cima.
    Pintura: 0 conserva a face original, 1 marca, 2 fundo.
    """
    if not 0 < profundidade <= .3: raise ValueError('Profundidade inválida.')
    vertices=np.asarray(vertices,dtype=float);faces=np.asarray(faces,dtype=np.int64)
    z0=float(vertices[:,2].min())
    fundo_mask=np.all(abs(vertices[faces,2]-z0)<1e-10,axis=1)
    if not fundo_mask.any():raise ValueError('Sem face plana no fundo da base.')
    fundo=unary_union([Polygon(vertices[f,:2]) for f in faces[fundo_mask]])
    # O eixo horizontal é espelhado ao observar a face externa de baixo.
    marca_mundo=translate(scale(marca,xfact=-1,yfact=1,origin=(0,0)),*centro)
    if marca_mundo.difference(fundo.buffer(1e-7)).area>1e-6:raise ValueError('Assinatura fora do fundo da base.')
    conservar=np.flatnonzero(~fundo_mask)
    pontos=list(map(tuple,vertices));mapa={tuple(np.round(p,10)):i for i,p in enumerate(vertices)}
    novas=[];pintura=[];pontos_novos={};paredes=set()
    def indice(x,y,z,contexto=None):
        p=(float(x),float(y),float(z));chave=tuple(np.round(p,10))
        if contexto is not None:
            face_id,ids,_sentido=contexto
            distancias=np.max(abs(vertices[ids,:2]-np.asarray(p[:2])),axis=1)
            proximo=int(np.argmin(distancias))
            if distancias[proximo]<1e-10:
                original=int(ids[proximo])
                if abs(vertices[original,2]-z)<1e-11:return original
                chave=('v',original,round(z,10))
            else:
                topologia=('f',face_id)
                for a,b in zip(ids,np.roll(ids,-1)):
                    u=vertices[a,:2];e=vertices[b,:2]-u;q=np.asarray(p[:2])-u;d=float(e@e)
                    if d and -1e-10<=float(q@e)/d<=1+1e-10 and abs(e[0]*q[1]-e[1]*q[0])/math.sqrt(d)<1e-10:
                        topologia=('e',min(int(a),int(b)),max(int(a),int(b)));break
                chave=topologia+chave
            tabela=pontos_novos
        else:tabela=mapa
        if chave not in tabela:tabela[chave]=len(pontos);pontos.append(p)
        return tabela[chave]
    def plano(forma,z,cor,contexto=None,sentido=-1):
        for pol in poligonos(forma):
            for t in constrained_delaunay_triangles(pol).geoms:
                if not pol.covers(t.representative_point()):continue
                ps=list(t.exterior.coords)[:3]
                a,b,c=map(np.asarray,ps)
                u,w=b-a,c-a
                if (u[0]*w[1]-u[1]*w[0])*sentido<0:ps=[ps[0],ps[2],ps[1]]
                novas.append([indice(x,y,z,contexto) for x,y in ps]);pintura.append(cor)
    def parede(ax,ay,bx,by,contexto=None):
        a0,b0,a1,b1=indice(ax,ay,z0,contexto),indice(bx,by,z0,contexto),indice(ax,ay,z0+profundidade,contexto),indice(bx,by,z0+profundidade,contexto)
        chave=tuple(sorted((a0,b0)))
        if chave in paredes:return
        paredes.add(chave)
        tris=[[a0,a1,b1],[a0,b1,b0]]
        if contexto is not None and contexto[2]>0:tris=[t[::-1]for t in tris]
        novas.extend(tris);pintura.extend([1,1])
    if por_triangulo:
        preparada=prep(marca_mundo);borda=marca_mundo.boundary
        for face_id in np.flatnonzero(fundo_mask):
            t=faces[face_id]
            tri=Polygon(vertices[t,:2])
            # Costuras degeneradas da triangulação original continuam no mesh.
            if tri.area<1e-12 or not preparada.intersects(tri):
                novas.append(t.tolist());pintura.append(2);continue
            dentro=tri.intersection(marca_mundo)
            u,w=vertices[t[1],:2]-vertices[t[0],:2],vertices[t[2],:2]-vertices[t[0],:2]
            sentido=1 if u[0]*w[1]-u[1]*w[0]>0 else -1
            contexto=(int(face_id),t,sentido)
            plano(tri.difference(marca_mundo),z0,2,contexto,sentido);plano(dentro,z0+profundidade,1,contexto,sentido)
            for pol in poligonos(dentro):
                pol=orient(pol,sign=1)
                for ring in [pol.exterior,*pol.interiors]:
                    xy=list(ring.coords)
                    for (ax,ay),(bx,by) in zip(xy,xy[1:]):
                        meio=Point((ax+bx)/2,(ay+by)/2)
                        if tri.boundary.distance(meio)>1e-8 or borda.distance(meio)<1e-10:parede(ax,ay,bx,by,contexto)
    else:
        plano(fundo.difference(marca_mundo),z0,2)
        plano(marca_mundo,z0+profundidade,1)
        for pol in poligonos(marca_mundo):
            pol=orient(pol,sign=1)
            for ring in [pol.exterior,*pol.interiors]:
                xy=list(ring.coords)
                for (ax,ay),(bx,by) in zip(xy,xy[1:]):parede(ax,ay,bx,by)
    return dict(vertices=np.asarray(pontos),faces=np.concatenate([faces[conservar],np.asarray(novas)],axis=0),pintura=np.concatenate([np.zeros(len(conservar),dtype=np.uint8),np.asarray(pintura,dtype=np.uint8)]),originais=np.concatenate([conservar,np.full(len(novas),-1)]),area=marca_mundo.area,profundidade=profundidade)
