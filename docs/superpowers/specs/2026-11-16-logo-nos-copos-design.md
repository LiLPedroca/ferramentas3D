# Logo do 2D para 3D nos Copos personalizados

Aprovado pelo Pedro em 16/11/2026. Implementar só depois do "comece".

## Por quê
O Pedro personaliza copos com uma logo impressa reta, que ele aquece na mesa e molda na curva do copo.
Hoje ele faz a logo à parte. Quer criar no 2D para 3D (que é melhor que o emblema antigo), ver no copo
como fica e imprimir tudo num só 3MF.

## Como funciona
1. **Copos personalizados** ganha, no painel da esquerda abaixo de Personalização, o item
   **"Logo personalizada"** (ícone de imagem, borda azul só enquanto não houver logo). Ele abre como os
   outros itens: sem logo, o botão **"Adicionar logo"**; com logo, miniatura + Editar/Clonar/Remover.
   "Adicionar logo" abre o 2D para 3D numa **janela grande por cima da página do copo** (≈90% da tela,
   copo escurecido atrás; não troca de página), sem a seção Chaveiro e com **"Cancelar"** e
   **"Usar no copo"** no lugar de Exportar.
2. De volta ao copo, a logo aparece **dobrada na curva do tubo** (raio medido do próprio copo naquela
   altura), centralizada na frente. Arrastar na prévia move para cima/baixo e em volta, **sempre dentro
   do tubo** (nunca sobre a borda de cima nem a base). Logo mais alta que o tubo: aviso.
3. Com logo: **"Editar logo"** (volta ao 2D para 3D como estava), **"Clonar logo"** e **"Remover logo"**.
4. **Clonar:** cada clique cria uma cópia. A primeira vai para o lado oposto (180°); as próximas se
   espaçam em volta sem encostar. Cada cópia se arrasta sozinha; clicando nela aparece "Remover esta".
   Todas usam a mesma arte. **Na tela fica escrito, junto do "Editar logo": "Ao editar, as cópias mudam
   juntas."**
5. **3MF, STL e fatiador:** cada logo sai **reta**, deitada na mesa ao lado do copo, no mesmo arquivo.
   Cada cor da logo usa um filamento; cor igual a uma do copo usa o mesmo filamento. Com AMS, "cor só no
   topo" (igual ao 2D para 3D). Se não couber na mesa (260 × 260), aviso.
6. **Salvar modelo** guarda o copo, a logo (opções do 2D para 3D) e a posição de cada cópia.

## Fora do escopo
- Logo curvada no arquivo (o Pedro molda com calor; imprime reta).
- Logo fora do tubo.
- Arte diferente por cópia.

## Para quem for construir
- Tela do copo: `renderer/copos-tela.js`; exportação nativa em `modelos/copos-exportar.js`
  (`colorir3mf` reescreve o 3MF original): as logos entram como objetos novos nesse 3MF.
- A curva da prévia é só visual: mapear x da logo para o ângulo `x / r` em volta do eixo do copo.
- Medir o tubo (altura e raio) a partir da malha da parte do corpo do copo.

## Ajustes aprovados depois da v0.57.0 (aguardando "comece")
- **"Usar de Meus modelos"** ao lado de "Adicionar logo": lista as logos salvas do 2D para 3D (miniatura + nome);
  a escolhida abre na janela grande para ajustar e "Usar no copo". O copo guarda uma cópia (o modelo salvo não
  muda); sem chaveiro no copo.
- **Posição livre na altura:** a logo sobe e desce pelo copo inteiro (da base à borda), não só no tubo. Passou do
  tubo: só um aviso ("A logo está passando do tubo"). Em volta continua girando.
