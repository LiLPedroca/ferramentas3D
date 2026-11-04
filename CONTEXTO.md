# Contexto do projeto: Programa Ferramentas 3D

## Objetivo
SuÃ­te de ferramentas para impressÃ£o 3D, para Windows 10 e 11. A calculadora de custo Ã© a primeira ferramenta, nÃ£o o projeto inteiro. Desenvolvido por Pedro em vibe coding.

## Idioma
- Conversa com o usuÃ¡rio: portuguÃªs do Brasil.
- Interface do app: portuguÃªs do Brasil.
- CÃ³digo, funÃ§Ãµes e variÃ¡veis: portuguÃªs ou inglÃªs tÃ©cnico, com consistÃªncia dentro de cada mÃ³dulo.

## Estado atual (novembro/2026)
- **VersÃ£o ativa: Electron** (pasta `electron/`, branch `electron`). VersÃ£o publicada: **v0.15.0**.
- **VersÃ£o antiga: Python/PySide6** (raiz do repositÃ³rio, branch `main`, v0.2.0). Mantida sÃ³ como referÃªncia das regras de cÃ¡lculo. NÃ£o recebe mais atualizaÃ§Ãµes.
- RepositÃ³rio: https://github.com/LiLPedroca/ferramentas3D

## Stack (Electron)
- Electron 45 com `contextIsolation`, sem `nodeIntegration`.
- Interface em HTML/CSS/JavaScript, empacotada pelo esbuild (`scripts/build-renderer.mjs`).
- Three.js para o visualizador de STL.
- CÃ¡lculo de dinheiro com nÃºmeros racionais exatos em `BigInt` (`electron/src/core/racional.js`). Arredondamento sÃ³ na exibiÃ§Ã£o, meio para cima.
- Instalador: electron-builder, NSIS, instalaÃ§Ã£o por usuÃ¡rio (sem administrador). Nome do arquivo: `ProgramaFerramentas3D-Setup-<versÃ£o>.exe`.
- AtualizaÃ§Ã£o automÃ¡tica: electron-updater, lendo as releases do GitHub (`latest.yml`). Verifica ao abrir e pelo botÃ£o de setas ao lado do tema (v0.5.2). Se jÃ¡ estiver na mais recente, mostra uma mensagem no meio da tela. O processo principal guarda o estado (parada, baixando, pronta) para nÃ£o perguntar nem baixar duas vezes.
- Testes: vitest (`npm test` dentro de `electron/`).

## Estrutura (electron/)
```
electron/
â”œâ”€â”€ src/core/        calculadora.js, racional.js (regras, sem interface)
â”œâ”€â”€ src/main/        main.cjs (janela, atualizaÃ§Ã£o, modo de captura para testes)
â”œâ”€â”€ src/renderer/    index.html, styles.css, app.js (tela), viewer3d.js (Three.js)
â”œâ”€â”€ scripts/         build-renderer.mjs
â””â”€â”€ tests/           calculadora.test.js (paridade com o Python)
```

## Regras de negÃ³cio da calculadora
- Filamento = peso (g) / 1000 Ã— preÃ§o por kg.
- Energia = potÃªncia (W) / 1000 Ã— horas Ã— tarifa por kWh.
- Impressora = horas Ã— custo por hora.
- Custo do lote = filamento + energia + impressora + mÃ£o de obra.
- PreÃ§o do lote = custo do lote Ã— (1 + lucro% / 100). O lucro Ã© sobre o custo, nÃ£o sobre a venda.
- Valores unitÃ¡rios = total Ã· quantidade de peÃ§as.
- PeÃ§as para pagar a impressora = teto(valor da impressora Ã· lucro por peÃ§a). Sem lucro positivo, nÃ£o calcula.
- ValidaÃ§Ã£o: valores negativos e quantidade menor que 1 sÃ£o recusados.

## Como publicar uma versÃ£o (regra combinada com o Pedro)
Toda alteraÃ§Ã£o vira uma release nova, sem pedir confirmaÃ§Ã£o a cada vez:
1. Subir a versÃ£o em `electron/package.json`.
2. Rodar `npm test` e depois `npm run dist` dentro de `electron/`.
3. Commitar, criar a tag `vX.Y.Z` e publicar com `gh release create vX.Y.Z <Setup.exe> <.blockmap> <latest.yml> --target electron`.
4. O Pedro atualiza pelo prÃ³prio programa.

`dev/statusline.py` nÃ£o faz parte do repositÃ³rio, e nÃ£o deve ser enviado.

## ReferÃªncia externa: Criae3D Utilities
- Pacote do Codex em `C:\Users\Pedro Henrique\Downloads\Criae3D-Utilities-Fonte-Completo-0.19.1.zip` (versÃ£o 0.19.1, MIT).
- Aplicativo Electron maior, com calculadora, catÃ¡logo, orÃ§amentos, finanÃ§as, cofre de chaves, busca de STL e conta.
- Usar como referÃªncia das funcionalidades e da home. NÃ£o copiar cÃ³digo sem revisar.
- A home da versÃ£o Codex tem saudaÃ§Ã£o, cards de resumo, busca, filtros e 17 ferramentas (5 disponÃ­veis).

## Home e navegaÃ§Ã£o (v0.6.0, visual inspirado no Criae3D)
- CabeÃ§alho flutuante: â˜° (menu lateral), â€¹ voltar (fora da home), tÃ­tulo da tela, interruptor de tema e "Verificar atualizaÃ§Ãµes".
- Home: "Bem-vindo, <primeiro nome>!", busca (Ctrl+K) e cards grandes com foto por grupo (`electron/src/renderer/assets/grupo-*.jpg`, recortados do `categories.png` do Codex).
- Cada grupo abre uma pÃ¡gina com capa e as ferramentas dele. Voltar de uma ferramenta leva ao grupo; do grupo, Ã  home.
- **Regra: nÃ£o mostrar nada que ainda nÃ£o existe** (sem "Em breve"). Grupo sem ferramenta pronta nÃ£o aparece. As descriÃ§Ãµes dos grupos devem citar sÃ³ o que existe.
- CatÃ¡logo em `electron/src/core/ferramentas.js` (`GRUPOS` e `FERRAMENTAS`, cada ferramenta com `grupo` e `tela`). Para adicionar uma ferramenta: criar a `<main class="tela oculta" id="tela-x">`, registrar em `TELAS` no `renderer/shell.js` e incluir no catÃ¡logo.
- MÃ³dulos da tela: `shell.js` (navegaÃ§Ã£o, menu, tema, avisos, atualizaÃ§Ã£o, nome), `inicio-tela.js`, `calculadora-tela.js`, `configuracoes-tela.js`, `produtos.js`, `viewer3d.js`; `app.js` sÃ³ liga tudo.
- Nome do usuÃ¡rio: perguntado na primeira abertura (dÃ¡ para pular), editÃ¡vel em ConfiguraÃ§Ãµes. Gravado em `configuracoes.json` (serviÃ§o `src/main/configuracoes.cjs`, modelo `src/core/configuracoes.cjs`; campos desconhecidos sÃ£o preservados).

## Plano em andamento: interface Criae3D com o nosso design (autorizado pelo Pedro em 04/11/2026)
O Pedro autorizou fazer tudo, publicar cada etapa e usar todo o limite de uso. ReferÃªncia visual e de funcionalidades: pacote do Codex (`Criae3D-Utilities-Fonte-Completo-0.19.1.zip`, em Downloads). Arquivos Ãºteis dentro dele: `ui/studio-next.js` (home e grupos), `ui/assets/studio/categories.png` (3 fotos lado a lado, 1774 Ã— 887), `ui/assets/fonts/*.ttf` (fontes OFL). NÃ£o copiar cÃ³digo sem revisar; reescrever no nosso padrÃ£o.

Home: cabeÃ§alho com â˜° (menu lateral), tÃ­tulo da tela, "Meu fatiador", interruptor de tema e "Verificar atualizaÃ§Ãµes"; "Bem-vindo, <nome>!" (nome perguntado uma vez); 3 cards grandes com foto: **GestÃ£o financeira**, **Ferramentas**, **Modelos personalizados**. Cada card abre a pÃ¡gina do grupo com as ferramentas dele. Regra mantida: grupo sem ferramenta pronta nÃ£o aparece.

Etapas (marcar [x] ao publicar):
- [x] 1. Novo visual: home com fotos, pÃ¡ginas de grupo, menu lateral, saudaÃ§Ã£o com nome, ConfiguraÃ§Ãµes (nome e pasta de dados; dados da empresa entram na etapa 3). (v0.6.0)
- [x] 2. Clientes (o histÃ³rico de pedidos entra com OrÃ§amentos). (v0.7.0)
- [x] 3. OrÃ§amentos com PDF (usa Produtos e Clientes), dados da empresa e padrÃµes em ConfiguraÃ§Ãµes, histÃ³rico no cliente. (v0.8.0)
- [x] 4. Backup e armazenamento + Removedor de metadados. (v0.9.0)
- [x] 5. Detector de IA (indÃ­cios locais: C2PA, XMP, EXIF, PNG) + Conversor SVG. (v0.10.0)
- [x] 6. CaÃ§ador de STL (busca em vÃ¡rios sites + favoritos locais). (v0.11.0)
- [x] 7. Meu fatiador + Chaveiro de nome (texto 3D com base e argola, exporta 3MF/STL). (v0.12.0)
- [x] 8. Chaveiro de logo + Palavras decorativas. (v0.13.0)

**Plano concluÃ­do em 2026-11-04 02:15.** Todas as etapas publicadas (v0.6.0 a v0.13.0).

Ãšltimo progresso: 2026-11-04 02:15 (etapa 8 publicada; plano concluÃ­do).

Etapa 8: `renderer/modelos/logo.js` (SVG do vetorizador â†’ SVGLoader â†’ uma parte por cor sobre disco ou retÃ¢ngulo com argola; contornos simplificados), `renderer/modelos/palavras.js` (atÃ© 3 linhas; "placa" = base + relevo, "letreiro" = letras grossas + barra), telas `logo-tela.js` e `palavras-tela.js`. ExportaÃ§Ã£o: `malhaIndexada` tambÃ©m corrige junÃ§Ãµes em T (vÃ©rtice no meio de aresta, comum quando um furo encosta na borda), garantindo malha fechada no 3MF e no STL. Testes com happy-dom (`// @vitest-environment happy-dom`) para o que usa DOMParser (logo, com um SVG real em `tests/dados/logo-teste.svg`).

Etapa 7 (modelos 3D): `renderer/modelos/geometria.js` (letras pelo opentype.js letra a letra, sem o motor de composiÃ§Ã£o que falha em algumas fontes; sÃ³lido/furo pela regra "nonzero" das fontes: furo Ã© o contorno no sentido oposto, peÃ§as sobrepostas se somam; base em meia-lua com furo da argola), `modelos/exportar.js` (STL binÃ¡rio e 3MF com uma parte por cor; vÃ©rtices unidos sÃ³ pela posiÃ§Ã£o para a malha sair fechada), `modelos/chaveiro.js`, `modelos/previa3d.js` (prÃ©via Z para cima), `modelos/fontes.js` (12 fontes OFL/Apache em `renderer/assets/fontes`, lidas pelo canal `fontes:ler`). Testes garantem malhas fechadas em todas as fontes. Meu fatiador: `src/main/fatiador.cjs` (detecta Bambu, Orca, Prusa, Creality Print, Cura, Anycubic, Elegoo em Program Files e LOCALAPPDATA\Programs; abre com o arquivo), escolha salva em `configuracoes.fatiador`; `renderer/fatiador-ui.js`. Na mÃ¡quina do Pedro foi detectado o Anycubic Slicer Next. "Abrir no fatiador" grava o 3MF em %TEMP%\ProgramaFerramentas3D.

Etapa 6: `src/core/stl.cjs` (sites e URLs de busca, sÃ³ links https, reconhecimento do site pelo domÃ­nio exato, tÃ­tulo sugerido pelo endereÃ§o, favoritos sem link repetido), serviÃ§o `src/main/favoritos.cjs` (arquivo `favoritos-stl.json`, canais `favoritos:*`), tela `renderer/stl-tela.js`. DecisÃ£o: nÃ£o ler APIs dos sites (o Codex usava credencial obtida em tempo de execuÃ§Ã£o do Thingiverse); as buscas abrem no navegador. Favoritos entram no backup.

Etapa 5: `src/core/detector-ia.js` (DigitalSourceType IPTC, geradores citados, parÃ¢metros SD/ComfyUI em PNG, C2PA; sempre avisa que ausÃªncia de indÃ­cio nÃ£o prova nada), tela `renderer/detector-tela.js`. Conversor SVG: `renderer/vetorizar.js` (vetorizador prÃ³prio desde a v0.16.0, ver abaixo; modos cores/silhueta, remoÃ§Ã£o de fundo por cor da borda), roda no worker `renderer/svg-worker.js` (segundo bundle do build) com reserva na prÃ³pria tela; tela `renderer/svg-tela.js`. O modo de captura grava `document.title` em `<captura>.png.txt` (roteiros de teste deixam resultados ali).

Etapa 4: metadados em `src/core/metadados.js` (lÃª e limpa JPEG/PNG/WebP direto nos bytes, sem recodificar; `analisarImagem` tambÃ©m devolve textos XMP/PNG para o Detector de IA), tela `renderer/metadados-tela.js`. Backup: `src/core/backup.cjs` (formato e leitura segura) e `src/main/backup.cjs` (exportar, restaurar com cÃ³pia "antes-de-restaurar", cÃ³pia diÃ¡ria ao abrir, mantÃ©m 10 diÃ¡rias), tela `renderer/backup-tela.js`. Salvar cÃ³pias de arquivos: canal `arquivos:salvar-copias` (pergunta a pasta, nunca sobrescreve). Testes: `FERRAMENTAS_SALVAR_DESTINO` e `FERRAMENTAS_BACKUP_ARQUIVO` evitam as janelas de escolha.

OrÃ§amentos (etapa 3): modelo `src/core/orcamento.cjs` (nÃºmero sequencial, cliente copiado no momento do orÃ§amento, itens com custo opcional, totais em centavos BigInt, lucro sÃ³ quando todos os itens tÃªm custo), HTML do PDF em `src/core/orcamento-pdf.cjs` (tudo escapado), serviÃ§o `src/main/orcamentos.cjs` (resolve o cliente pelo id). PDF: `orcamentos:pdf` no `main.cjs` gera numa janela invisÃ­vel sem JavaScript (`printToPDF`), pergunta onde salvar e abre o arquivo. Nos testes, `FERRAMENTAS_PDF_DESTINO` salva direto numa pasta. Telas: `renderer/orcamentos.js` (lista e editor `tela-orcamento`).

Base comum criada na etapa 2 (usar nas prÃ³ximas):
- `src/core/validacao.cjs`: `ErroValidacao` (mensagem amigÃ¡vel), `texto`, `textoLongo`, `ID`, `dataValida`.
- `src/main/servico-colecao.cjs`: serviÃ§o genÃ©rico de cadastro (listar/salvar/excluir) + `responder`. Para um cadastro novo: criar o modelo em `src/core/<x>.cjs`, o serviÃ§o em `src/main/<x>.cjs` e incluir em `cadastros` no `registrarDados` do `main.cjs` (gera os canais `<x>:listar/salvar/excluir`); no preload, `cadastro("<x>")`.
- `confirmar({ titulo, texto, botao })` em `renderer/shell.js` para confirmaÃ§Ãµes (devolve true/false).
- `src/core/formatos.js`: telefone, CPF/CNPJ, link do WhatsApp, iniciais.
- Links externos: sÃ³ `https://`, abertos no navegador (`window.open`).

## Chaveiro de nome refeito (v0.14.0, 04/11/2026)
O Pedro mandou um vÃ­deo do Chaveiro de nome do Codex e pediu igual. Feito:
- Motor Manifold (`manifold-3d` 3.5.4, Apache 2.0) em `renderer/modelos/manifold.js`: uniÃ£o real (regra nonzero das fontes), contorno, pontes entre ilhas (`unirIlhas`), ponto/normal na borda (`pontoNoLaco`, `maisPertoNoLaco`). Na tela, o `.wasm` vem do processo principal (canal `modelos:wasm`, arquivo copiado pelo build para `build/renderer/assets/manifold.wasm`), porque o file:// nÃ£o baixa WASM. A CSP do `index.html` tem `'wasm-unsafe-eval'` (sem isso o WebAssembly Ã© bloqueado). Nos testes (Node), o pacote acha o `.wasm` sozinho. Roda na prÃ³pria tela (30 a 100 ms por peÃ§a; sem worker).
- `modelos/chaveiro.js`: `gerarChaveiro(M, fonte, opcoes)`. Base contorno/cÃ¡psula/retangular, argola em qualquer ponto da borda (`argola` = posiÃ§Ã£o 0 a 1; null = meio do lado esquerdo), recusa argola sobre o texto ou mal ligada, **largura total** exata (mÃ©todo da secante; borda, espessuras e argola ficam em mm). Devolve malhas fechadas + laÃ§os 2D para a prÃ©via.
- Tela `chaveiro-tela.js` como a do Codex: abas Texto/Base/Argola/Cores, escolha de fonte em janela com busca e categorias, largura em mm ou cm, paletas de 11 cores + cor personalizada, estilos de base, "Estrutura e modelos prontos" (Delicado/ClÃ¡ssico/Robusto), prÃ©via 2D com a argola arrastÃ¡vel (refaz ao soltar; se a posiÃ§Ã£o nÃ£o servir, volta e explica), 3D, desfazer/refazer (Ctrl+Z/Ctrl+Y), zoom e "Ajustar Ã  tela", "Filamentos na exportaÃ§Ã£o" (slot de cada parte). NÃ£o mostramos "Salvar modelo"/"Beta" (regra: nada que nÃ£o existe).
- 29 fontes (as 17 novas vieram do pacote do Codex, OFL/Apache, licenÃ§as junto), em categorias em `modelos/fontes.js`; `familiaCss(id)` carrega a fonte para mostrar na tela.
- 3MF (`exportar.js`) agora leva `Metadata/model_settings.config` com o filamento (extruder) de cada parte, para Anycubic Slicer Next/Orca/Bambu abrirem cada parte no filamento certo. Vale tambÃ©m para Logo e Palavras (slots 1, 2, 3â€¦ na ordem). NÃ£o leva `project_settings` (para nÃ£o mexer nos perfis do usuÃ¡rio).
- Testes (`tests/chaveiro.test.js`): largura exata nos 3 estilos, argola ao longo da borda, base de contorno com um sÃ³ contorno externo, **todas as 29 fontes Ã— 3 estilos com malhas fechadas e orientadas**, 3MF com model_settings.

## Chaveiro de logo refeito (v0.15.0, 04/11/2026)
- Partes comuns em `modelos/manifold.js`: `prenderArgola` (argola na borda, recusas com explicaÃ§Ã£o), `resolverLargura` (largura total pela secante), `motorDaTela` (carrega o WASM pela tela). PrÃ©via 2D comum em `modelos/previa2d.js` (camadas coloridas + argola arrastÃ¡vel; usada pelo nome e pelo logo). Os resultados trazem `camadas`, `perimetro`, `argola` e `caixa` para ela.
- `modelos/logo.js`: `coresDoSvg(svg)` (SVG do vetorizador â†’ contornos por cor; junta tons quase iguais do serrilhado, `juntarCoresParecidas`) e `gerarLogo(M, svgOuCores, opcoes)`: cores sem sobreposiÃ§Ã£o (cada cor menos as anteriores), borda alisada (abre/fecha 0,15 mm), fragmentos < 0,4 mmÂ² saem, base contorno (com pontes)/cÃ­rculo/retangular, argola em cima por padrÃ£o e arrastÃ¡vel, largura total exata (20 a 150 mm).
- Tela `logo-tela.js` no mesmo padrÃ£o do chaveiro de nome (abas Logo/Base/Argola, paleta da base, Estrutura, 2D/3D, zoom). No 3MF a base vai no filamento 1 e cada cor no seguinte.
- Modo de captura: agora grava "ERRO NA CAPTURA" no `.txt` se o roteiro falhar e continua desenhando com a janela encoberta/tela bloqueada (sem isso o `capturePage` ficava parado para sempre).

## Conversor SVG com vetorizador prÃ³prio (v0.16.0, 04/11/2026)
O Pedro pediu "fidelidade mÃ¡xima" (o imagetracer distorcia no zoom e Ã s vezes trocava a cor). `renderer/vetorizar.js` foi reescrito sem biblioteca (imagetracerjs removido):
- Paleta: cores exatas quando a imagem tem atÃ© N cores; senÃ£o k-mÃ©dias++ sobre caixas de 5 bits, sÃ³ com pixels fora das bordas.
- Cobertura: cada pixel de borda Ã© dividido entre o PAR de cores que melhor explica a mistura (o cinza entre preto e branco Ã© preto+branco, mesmo com azul mais perto) â†’ borda com precisÃ£o de fraÃ§Ã£o de pixel.
- Camadas empilhadas (maiores embaixo; fundo removido fica por baixo, sem desenhar): cada camada cobre tambÃ©m as cores de cima â†’ nada de frestas. O Chaveiro de logo entende isso (cada cor = ela menos as SEGUINTES).
- Contorno por marching squares na cobertura 0,5; cantos detectados (>50Â°) e reconstruÃ­dos no cruzamento das retas vizinhas; curvas de BÃ©zier por ajuste de Schneider (tolerÃ¢ncia: alto 0,2 px, mÃ©dio 0,4, baixo 0,8); retas saem como "L"; alÃ§as longas demais sÃ£o cortadas (evita "fios").
- Medido com formas de serrilhado exato: cÃ­rculo erro mÃ¡x. 0,15 px (antes 0,71), cantos 0,05â€“0,13 px (antes 0,3â€“0,6), pixel art sai exata. Arquivo menor (logo de teste: 15,6 KB contra 43,3 KB). Fotos com ruÃ­do ainda geram SVG grande (use "Suavizar").
- Testes de fidelidade em `tests/vetorizar.test.js`.

PrÃ³ximo possÃ­vel: conferir com o Pedro no Anycubic se os filamentos jÃ¡ vÃªm certos.

Para testar telas: o modo de captura (`FERRAMENTAS_*`, ver "Testes e modo de captura") com roteiros JS. Node em `C:\Program Files\nodejs` (adicionar ao PATH), git em `C:\Program Files\Git\cmd\git.exe`, gh em `C:\Program Files\GitHub CLI\gh.exe` (jÃ¡ logado).

## Ideias para prÃ³ximas ferramentas (nÃ£o aparecem no app)
OrÃ§amentos, Clientes e histÃ³rico, Descontos e taxas, Etiquetas, Estoque de filamentos, Comparador de custos, Encaixes e tolerÃ¢ncias, Medidas e escala, Ficha de impressÃ£o, Falhas de impressÃ£o, Biblioteca de projetos, Conversor SVG, Preparador de fotos, Organizador de arquivos, Backup e restauraÃ§Ã£o.
- LÃ³gica testada em `electron/src/core/inicio.js`. Ãcones em `electron/src/renderer/icones.js`.

## Produtos (pronto na v0.5.0)
- Tela com busca, filtro por categoria, cadastro, ediÃ§Ã£o, exclusÃ£o (com confirmaÃ§Ã£o) e foto (reduzida para atÃ© 640 px em JPEG).
- BotÃ£o "Salvar como produto" na calculadora: abre o cadastro com preÃ§o por peÃ§a, peso por peÃ§a e o custo (com lucro e data).
- Campos: nome, categoria, preÃ§o (centavos em texto), peso (g), altura/largura/comprimento (mm), observaÃ§Ãµes, foto, custo.
- Dados em `%APPDATA%\Programa Ferramentas 3D\dados\produtos.json`, gravados sÃ³ pelo processo principal (`src/main/armazenamento.cjs`): troca atÃ´mica (.tmp â†’ renomeia) e cÃ³pia `.bak`. Se nada puder ser lido, nÃ£o sobrescreve.
- A tela fala com o processo principal por `window.dados.produtos` (preload). O processo principal valida tudo de novo (`src/core/produto.cjs`, em CommonJS para servir aos dois lados).
- Itens invÃ¡lidos no arquivo sÃ£o mantidos, mas nÃ£o aparecem na lista.

## Testes e modo de captura
- `vite` precisa estar nas devDependencies: o `.npmrc` usa `legacy-peer-deps` e nÃ£o instala dependÃªncias "peer" sozinho. Sem ele, o vitest nÃ£o roda.
- Modo de captura (sÃ³ para testes): `FERRAMENTAS_CAPTURA=<png>`, com `FERRAMENTAS_ABA`, `FERRAMENTAS_TEMA`, `FERRAMENTAS_STL`, `FERRAMENTAS_ALTURA`, `FERRAMENTAS_JS` (roteiro executado na tela) e `FERRAMENTAS_DADOS` (pasta de dados temporÃ¡ria, para nÃ£o tocar nos dados reais). O tema da captura nÃ£o Ã© salvo.

## PendÃªncias
- PrÃ³xima ferramenta sugerida: OrÃ§amentos (usa os Produtos) ou Clientes.
- Ãcone do aplicativo (hoje Ã© o padrÃ£o do Electron).
- NÃ£o hÃ¡ assinatura digital no instalador, entÃ£o o Windows pode mostrar aviso de editor desconhecido.
- Auto-update validado ponta a ponta: 0.3.0 â†’ 0.3.1.
- Programa Python antigo continua instalado em algumas mÃ¡quinas e precisa ser removido manualmente depois da migraÃ§Ã£o.

## ConvenÃ§Ãµes
- NÃ£o apagar arquivos sem pedir permissÃ£o ao usuÃ¡rio.
- Testar cada regra de cÃ¡lculo antes de mexer na interface.
- NÃ£o guardar dados pessoais nem chaves de API no cÃ³digo.
- Testar caminhos com espaÃ§os e acentos (ex.: "Pedro Henrique").
- O app nÃ£o deve exigir privilÃ©gios de administrador.
