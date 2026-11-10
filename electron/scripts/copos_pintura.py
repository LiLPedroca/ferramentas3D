"""Pintura TriangleSelector: remapeia cores e acompanha rotações de vértices."""
from functools import lru_cache
import numpy as np

@lru_cache(maxsize=20000)
def decodificar(codigo):
    if not codigo:return 0
    try:nibbles=[int(c,16)for c in codigo[::-1]]
    except ValueError:raise ValueError('Código de pintura inválido.')
    pos=0
    def ler(profundidade=0):
        nonlocal pos
        if pos>=len(nibbles)or profundidade>24:raise ValueError('Pintura incompleta ou profunda demais.')
        n=nibbles[pos];pos+=1;lados=n&3
        if lados:
            filhos=[None]*(4 if lados==3 else lados+1)
            for j in range(len(filhos)-1,-1,-1):filhos[j]=ler(profundidade+1)
            return lados,0 if lados==3 else n>>2,tuple(filhos)
        cor=n>>2
        if cor==3:
            if pos>=len(nibbles):raise ValueError('Filamento incompleto.')
            n=nibbles[pos];pos+=1;cor=n+3
            if n==15:
                if pos>=len(nibbles):raise ValueError('Filamento incompleto.')
                cor=nibbles[pos]+18;pos+=1
        return cor
    return ler()

def codificar(no):
    valores=[]
    def escrever(n):
        if isinstance(n,int):
            if not 0<=n<=33:raise ValueError('Filamento inválido.')
            valores.extend([n*4]if n<3 else[12,n-3]if n<18 else[12,15,n-18]);return
        lados,especial,filhos=n;valores.append(lados|(0 if lados==3 else especial<<2))
        for f in filhos[::-1]:escrever(f)
    escrever(no);return ''.join(f'{n:X}'for n in valores[::-1])

def remapear_pintura(codigo,mapa,padrao):
    def trocar(n):
        if isinstance(n,int):
            cor=mapa.get(n or padrao)
            if cor is None:raise ValueError(f'Filamento não mapeado: {n or padrao}.')
            return cor
        return n[0],n[1],tuple(trocar(f)for f in n[2])
    return codificar(trocar(decodificar(codigo)))

def dividir(v,lados,especial):
    a,b,c=[np.asarray(v[(especial+j)%3])for j in range(3)]
    ab,ac,bc=(a+b)/2,(a+c)/2,(b+c)/2
    if lados==1:return [[a,b,bc],[bc,c,a]]
    if lados==2:return [[a,ab,ac],[ab,b,ac],[b,c,ac]]
    return [[a,ab,ac],[ab,b,bc],[bc,c,ac],[ab,bc,ac]]

@lru_cache(maxsize=20000)
def _girar(no,perm):
    if isinstance(no,int)or perm==(0,1,2):return no
    lados,especial,filhos=no;novo_especial=perm.index(especial)if lados!=3 else 0
    v=np.array([[0.,0.],[1.,0.],[0.,1.]])
    originais=dividir(v,lados,especial);novos=dividir(v[list(perm)],lados,novo_especial);resultado=[]
    for t in novos:
        pontos={tuple(p)for p in t}
        j=next((j for j,q in enumerate(originais)if pontos=={tuple(p)for p in q}),None)
        if j is None:raise ValueError('Permutação de pintura incompatível.')
        indice={tuple(p):k for k,p in enumerate(originais[j])}
        resultado.append(_girar(filhos[j],tuple(indice[tuple(p)]for p in t)))
    return lados,novo_especial,tuple(resultado)

def permutar_pintura(codigo,perm):return codificar(_girar(decodificar(codigo),tuple(perm)))

def transferir_pintura(codigo,origem,destino,tolerancia=2e-5):
    """Transporta o desenho pelo mapa afim dos vértices, com erro limitado.

    Só admite rotações que conservam o sentido da face. O deslocamento de
    qualquer ponto pintado fica limitado ao maior deslocamento dos vértices.
    """
    def folhas(n):
        return {n} if isinstance(n,int) else set().union(*(folhas(f) for f in n[2]))
    cores=folhas(decodificar(codigo))
    if len(cores)==1:return codificar(next(iter(cores))),0.
    origem,destino=np.asarray(origem),np.asarray(destino)
    permutacoes=[(0,1,2),(1,2,0),(2,0,1)]
    erros=[float(np.linalg.norm(origem[list(p)]-destino,axis=1).max())for p in permutacoes]
    k=int(np.argmin(erros));erro=erros[k]
    if erro>tolerancia:raise ValueError(f'Pintura excede o deslocamento permitido: {erro:.6f} mm.')
    return permutar_pintura(codigo,permutacoes[k]),erro

def cor_em(codigo,p,vertices=None):
    p=np.asarray(p);v=np.asarray(vertices if vertices is not None else[[0.,0.],[1.,0.],[0.,1.]])
    def dentro(t):
        a,b,c=np.asarray(t);u,w,q=b-a,c-a,p-a;uu,uw,ww,qu,qw=u@u,u@w,w@w,q@u,q@w;d=uu*ww-uw*uw
        if abs(d)<1e-25:return False
        x,y=(ww*qu-uw*qw)/d,(uu*qw-uw*qu)/d
        return min(x,y)>=-1e-8 and x+y<=1+1e-8
    def ler(n,t):
        if isinstance(n,int):return n
        filhos=dividir(t,n[0],n[1])
        for f,q in zip(n[2],filhos):
            if dentro(q):return ler(f,q)
        raise ValueError('Ponto fora do triângulo pintado.')
    return ler(decodificar(codigo),v)
