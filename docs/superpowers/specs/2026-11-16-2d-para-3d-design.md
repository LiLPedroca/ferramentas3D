# 2D para 3D (substitui o Criador de logos): desenho

16/11/2026. Pedido do Pedro, aprovado no caminho "A".

## Por quê

O Pedro usou o "2D para 3D" do Gestor 3D (gestor3d.pro): subiu o escudo do Santos e a peça saiu certa,
sem ajuste nenhum. O nosso Criador de logos exige mexer em cores, limpeza e correção, e no mesmo escudo
saiu serrilhado e perdeu o branco. Ele quer **colocar uma imagem e ter a peça pronta**, com **qualidade e
suavidade máximas**, e acredita que a nossa pode superar a deles. Também gostou de ver no 3D a peça na
mesa **com as medidas** (X e Y em mm).

## Objetivos

1. Imagem entra, peça sai pronta: fundo tirado, cores achadas, partes geradas, sem o Pedro mexer.
2. Peça **sem base**: cada parte (região ligada de uma cor) é um volume próprio, lado a lado, todas
   começando na mesa.
3. Clicar numa parte para trocar **a cor** ou **a altura** dela (2 a 10 mm).
4. Bordas mais lisas que as do Gestor 3D no escudo do Santos (`dev/fotos-teste/santos.png`, 447 px).
5. 3D com a mesa da Kobra X e as cotas X e Y em mm.
6. Exportar 3MF (uma parte por cor) e STL; abrir no fatiador; calcular custo; salvar em Meus modelos.

## Não objetivos

- Estilos de base (contorno, círculo, retângulo), borda e relevo: saem da tela.
- Exportar PNG/SVG, ímã, placa, logo em pé (o Pedro já recusou).
- Paleta livre: as cores são só as 14 prontas.
- Nenhuma cópia da tela do Gestor 3D (nome, cores, textos, ícones). Os recursos sim, a aparência não.

## O que seria um fracasso

- Precisar corrigir à mão no caso comum (logo com fundo liso).
- Frestas ou sobreposição entre partes vizinhas (fatiador mostra vão, ou peça não fecha).
- Tela poluída: textos longos, controles que o Pedro não pediu.
- Perder modelos salvos do Criador de logos.

## Restrições

- Regras do `AGENTS.md`: pt-BR, interface mínima, Manifold sempre com `comEscopo`/`guardar`, malhas
  fechadas e orientadas, nada de "Em breve".
- Mesma tela `logo` e mesmo lugar no catálogo. Novo nome na interface: **"2D para 3D"**.
- Cores lado a lado na mesma camada **só imprimem com AMS/ACE**. Sem AMS, ver "Modo sem AMS".
- Imagens pequenas (o Santos tem 447 px) precisam sair lisas mesmo assim.
- Release só no PC do Pedro até ele dizer "pode lançar".

## Caminhos considerados

- **A) Refazer a tela como "2D para 3D" (escolhido).** Mesma tela, motor de mapa/vetorizador reaproveitado,
  geometria nova sem base, edição por parte, 3D com cotas.
- B) Só pôr "sem base" e cotas no Criador atual. Menos trabalho, mas mantém a tela que não agrada.
- Versão web: arquivada pelo Pedro.

## Como funciona

### Fluxo

1. Tela vazia: área para soltar/escolher a imagem (PNG, JPG, WEBP, HEIC, SVG).
2. Ao abrir: recorte do fundo (só o fundo ligado à borda, como hoje com "áreas internas" desligado),
   cores automáticas puxadas para as 14 prontas (`mapa-logo.js`), partes geradas, prévia 2D mostrada.
3. Linha de informação discreta no alto da prévia: `100,0 × 120,5 mm · 52 partes · alturas 3 a 10 mm`.
4. Botões "2D" e "3D" para alternar a prévia.

### Painel (lateral, mínimo)

- **Imagem:** miniatura, "Trocar imagem".
- **Cores:** chips das cores achadas com "×" e "+ Cor" (o mesmo comportamento da v0.51: cores-alvo).
- **Medidas:** largura e altura em mm com cadeado de proporção (padrão 100 mm de largura); altura das
  partes (padrão para todas).
- **Argola** (Pedro, 16/11: "fica como opção"): chave em Medidas, **desligada** por padrão. Ligada, a
  argola entra na borda da silhueta (reaproveitar `prenderArgola`, que já procura outro ponto da borda),
  pode ser arrastada na prévia 2D como hoje, tem a altura padrão das partes e a cor da parte em que
  encosta (chamada minha). Furo e parede usam os padrões de hoje, sem campos na tela.
- Mais nada. Base, borda e relevo saem.

### Partes

- Parte = cada contorno externo de uma cor, com seus furos, depois da vetorização. Uma parte por ilha.
- As partes formam uma **partição exata** da silhueta: vizinhas dividem a mesma linha de borda, sem vão
  e sem sobreposição (gerar cada cor e subtrair as já feitas, como hoje, e conferir em teste).
- Altura padrão: **3 mm** para todas (chamada minha: 2 mm de 100 mm de largura fica frágil, e as cores
  só se prendem pela lateral). Limite 2 a 10 mm, passo de 0,2 mm (uma camada de 0,20 mm).
- Ilhas soltas (coroa e estrelas do Santos) são partes normais. Ilha menor que ~1,5 mm² some e vira a
  cor vizinha (não imprime e só polui).

### Editar no 2D

- **Clique numa parte**: abre um balão pequeno com as 14 cores e um campo de altura. Trocar vale **só
  para aquela parte**; uma caixinha "Todas desta cor" aplica a todas as partes da mesma cor.
- Parte escolhida fica destacada (contorno).
- **Borracha** (apaga área; vira fundo) e **Varinha** (apaga a mancha ligada) continuam, sobre a peça,
  como na v0.51. Pincel e Balde de cor saem: trocar cor agora é por parte.
- Desfazer/Refazer (Ctrl+Z/Ctrl+Y) cobrem cor, altura e borracha.
- As escolhas por parte (cor, altura) são guardadas por um ponto de referência dentro da parte (pixel do
  mapa), para sobreviver quando a peça é refeita (mudar tamanho, tirar cor). Se o ponto cair fora de
  qualquer parte depois de uma mudança, a escolha é descartada.

### 3D

- Mesa da Kobra X com a grade de 10 mm (reaproveitar a mesa do `viewer3d.js`).
- Cotas: linha **X** (vermelha) na frente e linha **Y** (verde) ao lado, com o valor em mm (2 casas)
  escrito junto, como etiqueta 2D que acompanha a câmera. Altura máxima vai na linha de informação.
- Arrastar gira, rolar aproxima. Clique numa parte no 3D também abre o balão (raycast, como a v0.51 já
  faz para corrigir).

### Qualidade e suavidade

- Mapa de cores até **2000 px** no lado maior (hoje 800). Imagem menor é ampliada antes com
  interpolação suave, e a borda sai com **fração de pixel** pelo meio-tom da imagem original
  (o `misturas` do vetorizador).
- Curvas Bézier com erro máximo menor (≤ 0,15 px do mapa) e cantos vivos preservados (`afiarCantos`).
- Na hora de virar sólido, cada curva é amostrada com corda de no máximo **0,05 mm** (bem abaixo da linha
  de 0,4 mm do bico), para não aparecer facetas no 3D nem no fatiador.
- SVG enviado é desenhado direto no tamanho do mapa (já é assim).
- Meta: no Santos, 100 mm de largura, nenhum degrau visível no 3D a 300% de zoom nas curvas da bola e do
  escudo; 4 cores achadas (preto, branco, dourado, amarelo); branco de dentro do escudo mantido.
- Desempenho: gerar a peça em até ~2 s no PC do Pedro; editar uma parte (cor/altura) sem refazer a
  vetorização (só a geometria daquela cor).

### Modo sem AMS

Na pergunta "Como você vai imprimir?", se for **sem AMS**, a peça vira **degraus por cor**: cada cor
ganha uma faixa de altura própria, uma acima da outra, e a pausa M600 fica no começo de cada faixa
(`camadaDaTroca`). A cor de baixo vira a "base" das outras (por baixo de todas as partes); cada cor de
cima sobe só nas suas partes. A ordem padrão: a cor de maior área embaixo. O balão de altura, nesse
modo, mostra a ordem das cores em vez da altura por parte. Com AMS, a peça é a de partes lado a lado.

### Exportar

- 3MF: um objeto com **uma parte por cor** (todas as partes daquela cor juntas, cada uma na sua altura),
  filamento em `model_settings.config` como hoje; pausas só no modo sem AMS.
- STL: a peça inteira.
- Calcular custo e Abrir no fatiador: os de hoje (`modelos-acoes.js`).

### Meus modelos

- Salva imagem, cores-alvo, correções da borracha, escolhas por parte e medidas.
- Modelos antigos do Criador de logos abrem na tela nova: imagem, cores e correções são aproveitadas;
  a argola (ligada ou não, e a posição) vem junto; base e relevo são ignorados (os dados continuam
  guardados no arquivo).

## Fica a cargo de quem construir

- Estrutura do código: provavelmente `modelos/logo.js` ganha a geometria sem base e `logo-tela.js` é
  enxugada; reaproveitar `mapa-logo.js`, `vetorizar.js`, `previa2d.js`, `previa3d.js`.
- Estilo do balão de parte e das cotas, seguindo o tema do programa (escuro preto, acento azul).
- Testes: partição sem vão/sobreposição, malha fechada, altura por parte, degraus sem AMS com pausas
  certas, abrir modelo antigo, Santos com 4 cores.
- Entrada em NOVIDADES e no `CONTEXTO.md`; versão minor nova.
