# Contexto do projeto: Programa Ferramentas 3D

## Objetivo
Suíte de ferramentas para impressão 3D, para Windows 10 e 11. A calculadora de custo é a primeira ferramenta, não o projeto inteiro. Desenvolvido por Pedro em vibe coding.

## Idioma
- Conversa com o usuário: português do Brasil.
- Interface do app: português do Brasil.
- Código, funções e variáveis: português ou inglês técnico, com consistência dentro de cada módulo.

## Estado atual (novembro/2026)
- **Versão ativa: Electron** (pasta `electron/`, branch `electron`). Versão publicada: **v0.25.0**.
- **Versão antiga: Python/PySide6** (raiz do repositório, branch `main`, v0.2.0). Mantida só como referência das regras de cálculo. Não recebe mais atualizações.
- Repositório: https://github.com/LiLPedroca/ferramentas3D

## Stack (Electron)
- Electron 45 com `contextIsolation`, sem `nodeIntegration`.
- Interface em HTML/CSS/JavaScript, empacotada pelo esbuild (`scripts/build-renderer.mjs`).
- Three.js para o visualizador de STL.
- Cálculo de dinheiro com números racionais exatos em `BigInt` (`electron/src/core/racional.js`). Arredondamento só na exibição, meio para cima.
- Instalador: electron-builder, NSIS, instalação por usuário (sem administrador). Nome do arquivo: `ProgramaFerramentas3D-Setup-<versão>.exe`.
- Atualização automática: electron-updater, lendo as releases do GitHub (`latest.yml`). Verifica ao abrir e pelo botão de setas ao lado do tema (v0.5.2). Se já estiver na mais recente, mostra uma mensagem no meio da tela. O processo principal guarda o estado (parada, baixando, pronta) para não perguntar nem baixar duas vezes.
- Testes: vitest (`npm test` dentro de `electron/`).

## Estrutura (electron/)
```
electron/
├── src/core/        calculadora.js, racional.js (regras, sem interface)
├── src/main/        main.cjs (janela, atualização, modo de captura para testes)
├── src/renderer/    index.html, styles.css, app.js (tela), viewer3d.js (Three.js)
├── scripts/         build-renderer.mjs
└── tests/           calculadora.test.js (paridade com o Python)
```

## Regras de negócio da calculadora
- Filamento = peso (g) / 1000 × preço por kg.
- Energia = potência (W) / 1000 × horas × tarifa por kWh.
- Impressora = horas × custo por hora.
- Custo do lote = filamento + energia + impressora + mão de obra.
- Preço do lote = custo do lote × (1 + lucro% / 100). O lucro é sobre o custo, não sobre a venda.
- Valores unitários = total ÷ quantidade de peças.
- Peças para pagar a impressora = teto(valor da impressora ÷ lucro por peça). Sem lucro positivo, não calcula.
- Validação: valores negativos e quantidade menor que 1 são recusados.

## Como publicar uma versão (regra combinada com o Pedro)
Toda alteração vira uma release nova, sem pedir confirmação a cada vez:
1. Subir a versão em `electron/package.json`.
2. Rodar `npm test` e depois `npm run dist` dentro de `electron/`.
3. Commitar, criar a tag `vX.Y.Z` e publicar com `gh release create vX.Y.Z <Setup.exe> <.blockmap> <latest.yml> --target electron`.
4. O Pedro atualiza pelo próprio programa.

`dev/statusline.py` não faz parte do repositório, e não deve ser enviado.

## Referência externa: Criae3D Utilities
- Pacote do Codex em `C:\Users\Pedro Henrique\Downloads\Criae3D-Utilities-Fonte-Completo-0.19.1.zip` (versão 0.19.1, MIT).
- Aplicativo Electron maior, com calculadora, catálogo, orçamentos, finanças, cofre de chaves, busca de STL e conta.
- Usar como referência das funcionalidades e da home. Não copiar código sem revisar.
- A home da versão Codex tem saudação, cards de resumo, busca, filtros e 17 ferramentas (5 disponíveis).

## Home e navegação (v0.6.0, visual inspirado no Criae3D)
- Cabeçalho flutuante: ☰ (menu lateral), ‹ voltar (fora da home), título da tela, interruptor de tema e "Verificar atualizações".
- Home: "Bem-vindo, <primeiro nome>!", busca (Ctrl+K) e cards grandes com foto por grupo (`electron/src/renderer/assets/grupo-*.jpg`, recortados do `categories.png` do Codex).
- Cada grupo abre uma página com capa e as ferramentas dele. Voltar de uma ferramenta leva ao grupo; do grupo, à home.
- **Regra: não mostrar nada que ainda não existe** (sem "Em breve"). Grupo sem ferramenta pronta não aparece. As descrições dos grupos devem citar só o que existe.
- Catálogo em `electron/src/core/ferramentas.js` (`GRUPOS` e `FERRAMENTAS`, cada ferramenta com `grupo` e `tela`). Para adicionar uma ferramenta: criar a `<main class="tela oculta" id="tela-x">`, registrar em `TELAS` no `renderer/shell.js` e incluir no catálogo.
- Módulos da tela: `shell.js` (navegação, menu, tema, avisos, atualização, nome), `inicio-tela.js`, `calculadora-tela.js`, `configuracoes-tela.js`, `produtos.js`, `viewer3d.js`; `app.js` só liga tudo.
- Nome do usuário: perguntado na primeira abertura (dá para pular), editável em Configurações. Gravado em `configuracoes.json` (serviço `src/main/configuracoes.cjs`, modelo `src/core/configuracoes.cjs`; campos desconhecidos são preservados).

## Plano em andamento: interface Criae3D com o nosso design (autorizado pelo Pedro em 04/11/2026)
O Pedro autorizou fazer tudo, publicar cada etapa e usar todo o limite de uso. Referência visual e de funcionalidades: pacote do Codex (`Criae3D-Utilities-Fonte-Completo-0.19.1.zip`, em Downloads). Arquivos úteis dentro dele: `ui/studio-next.js` (home e grupos), `ui/assets/studio/categories.png` (3 fotos lado a lado, 1774 × 887), `ui/assets/fonts/*.ttf` (fontes OFL). Não copiar código sem revisar; reescrever no nosso padrão.

Home: cabeçalho com ☰ (menu lateral), título da tela, "Meu fatiador", interruptor de tema e "Verificar atualizações"; "Bem-vindo, <nome>!" (nome perguntado uma vez); 3 cards grandes com foto: **Gestão financeira**, **Ferramentas**, **Modelos personalizados**. Cada card abre a página do grupo com as ferramentas dele. Regra mantida: grupo sem ferramenta pronta não aparece.

Etapas (marcar [x] ao publicar):
- [x] 1. Novo visual: home com fotos, páginas de grupo, menu lateral, saudação com nome, Configurações (nome e pasta de dados; dados da empresa entram na etapa 3). (v0.6.0)
- [x] 2. Clientes (o histórico de pedidos entra com Orçamentos). (v0.7.0)
- [x] 3. Orçamentos com PDF (usa Produtos e Clientes), dados da empresa e padrões em Configurações, histórico no cliente. (v0.8.0)
- [x] 4. Backup e armazenamento + Removedor de metadados. (v0.9.0)
- [x] 5. Detector de IA (indícios locais: C2PA, XMP, EXIF, PNG) + Conversor SVG. (v0.10.0)
- [x] 6. Caçador de STL (busca em vários sites + favoritos locais). (v0.11.0)
- [x] 7. Meu fatiador + Chaveiro de nome (texto 3D com base e argola, exporta 3MF/STL). (v0.12.0)
- [x] 8. Chaveiro de logo + Palavras decorativas. (v0.13.0)

**Plano concluído em 2026-11-04 02:15.** Todas as etapas publicadas (v0.6.0 a v0.13.0).

Último progresso: 2026-11-04 02:15 (etapa 8 publicada; plano concluído).

Etapa 8: `renderer/modelos/logo.js` (SVG do vetorizador → SVGLoader → uma parte por cor sobre disco ou retângulo com argola; contornos simplificados), `renderer/modelos/palavras.js` (até 3 linhas; "placa" = base + relevo, "letreiro" = letras grossas + barra), telas `logo-tela.js` e `palavras-tela.js`. Exportação: `malhaIndexada` também corrige junções em T (vértice no meio de aresta, comum quando um furo encosta na borda), garantindo malha fechada no 3MF e no STL. Testes com happy-dom (`// @vitest-environment happy-dom`) para o que usa DOMParser (logo, com um SVG real em `tests/dados/logo-teste.svg`).

Etapa 7 (modelos 3D): `renderer/modelos/geometria.js` (letras pelo opentype.js letra a letra, sem o motor de composição que falha em algumas fontes; sólido/furo pela regra "nonzero" das fontes: furo é o contorno no sentido oposto, peças sobrepostas se somam; base em meia-lua com furo da argola), `modelos/exportar.js` (STL binário e 3MF com uma parte por cor; vértices unidos só pela posição para a malha sair fechada), `modelos/chaveiro.js`, `modelos/previa3d.js` (prévia Z para cima), `modelos/fontes.js` (12 fontes OFL/Apache em `renderer/assets/fontes`, lidas pelo canal `fontes:ler`). Testes garantem malhas fechadas em todas as fontes. Meu fatiador: `src/main/fatiador.cjs` (detecta Bambu, Orca, Prusa, Creality Print, Cura, Anycubic, Elegoo em Program Files e LOCALAPPDATA\Programs; abre com o arquivo), escolha salva em `configuracoes.fatiador`; `renderer/fatiador-ui.js`. Na máquina do Pedro foi detectado o Anycubic Slicer Next. "Abrir no fatiador" grava o 3MF em %TEMP%\ProgramaFerramentas3D.

Etapa 6: `src/core/stl.cjs` (sites e URLs de busca, só links https, reconhecimento do site pelo domínio exato, título sugerido pelo endereço, favoritos sem link repetido), serviço `src/main/favoritos.cjs` (arquivo `favoritos-stl.json`, canais `favoritos:*`), tela `renderer/stl-tela.js`. Decisão: não ler APIs dos sites (o Codex usava credencial obtida em tempo de execução do Thingiverse); as buscas abrem no navegador. Favoritos entram no backup.

Etapa 5: `src/core/detector-ia.js` (DigitalSourceType IPTC, geradores citados, parâmetros SD/ComfyUI em PNG, C2PA; sempre avisa que ausência de indício não prova nada), tela `renderer/detector-tela.js`. Conversor SVG: `renderer/vetorizar.js` (vetorizador próprio desde a v0.16.0, ver abaixo; modos cores/silhueta, remoção de fundo por cor da borda), roda no worker `renderer/svg-worker.js` (segundo bundle do build) com reserva na própria tela; tela `renderer/svg-tela.js`. O modo de captura grava `document.title` em `<captura>.png.txt` (roteiros de teste deixam resultados ali).

Etapa 4: metadados em `src/core/metadados.js` (lê e limpa JPEG/PNG/WebP direto nos bytes, sem recodificar; `analisarImagem` também devolve textos XMP/PNG para o Detector de IA), tela `renderer/metadados-tela.js`. Backup: `src/core/backup.cjs` (formato e leitura segura) e `src/main/backup.cjs` (exportar, restaurar com cópia "antes-de-restaurar", cópia diária ao abrir, mantém 10 diárias), tela `renderer/backup-tela.js`. Salvar cópias de arquivos: canal `arquivos:salvar-copias` (pergunta a pasta, nunca sobrescreve). Testes: `FERRAMENTAS_SALVAR_DESTINO` e `FERRAMENTAS_BACKUP_ARQUIVO` evitam as janelas de escolha.

Orçamentos (etapa 3): modelo `src/core/orcamento.cjs` (número sequencial, cliente copiado no momento do orçamento, itens com custo opcional, totais em centavos BigInt, lucro só quando todos os itens têm custo), HTML do PDF em `src/core/orcamento-pdf.cjs` (tudo escapado), serviço `src/main/orcamentos.cjs` (resolve o cliente pelo id). PDF: `orcamentos:pdf` no `main.cjs` gera numa janela invisível sem JavaScript (`printToPDF`), pergunta onde salvar e abre o arquivo. Nos testes, `FERRAMENTAS_PDF_DESTINO` salva direto numa pasta. Telas: `renderer/orcamentos.js` (lista e editor `tela-orcamento`).

Base comum criada na etapa 2 (usar nas próximas):
- `src/core/validacao.cjs`: `ErroValidacao` (mensagem amigável), `texto`, `textoLongo`, `ID`, `dataValida`.
- `src/main/servico-colecao.cjs`: serviço genérico de cadastro (listar/salvar/excluir) + `responder`. Para um cadastro novo: criar o modelo em `src/core/<x>.cjs`, o serviço em `src/main/<x>.cjs` e incluir em `cadastros` no `registrarDados` do `main.cjs` (gera os canais `<x>:listar/salvar/excluir`); no preload, `cadastro("<x>")`.
- `confirmar({ titulo, texto, botao })` em `renderer/shell.js` para confirmações (devolve true/false).
- `src/core/formatos.js`: telefone, CPF/CNPJ, link do WhatsApp, iniciais.
- Links externos: só `https://`, abertos no navegador (`window.open`).

## Chaveiro de nome refeito (v0.14.0, 04/11/2026)
O Pedro mandou um vídeo do Chaveiro de nome do Codex e pediu igual. Feito:
- Motor Manifold (`manifold-3d` 3.5.4, Apache 2.0) em `renderer/modelos/manifold.js`: união real (regra nonzero das fontes), contorno, pontes entre ilhas (`unirIlhas`), ponto/normal na borda (`pontoNoLaco`, `maisPertoNoLaco`). Na tela, o `.wasm` vem do processo principal (canal `modelos:wasm`, arquivo copiado pelo build para `build/renderer/assets/manifold.wasm`), porque o file:// não baixa WASM. A CSP do `index.html` tem `'wasm-unsafe-eval'` (sem isso o WebAssembly é bloqueado). Nos testes (Node), o pacote acha o `.wasm` sozinho. Roda na própria tela (30 a 100 ms por peça; sem worker).
- `modelos/chaveiro.js`: `gerarChaveiro(M, fonte, opcoes)`. Base contorno/cápsula/retangular, argola em qualquer ponto da borda (`argola` = posição 0 a 1; null = meio do lado esquerdo), recusa argola sobre o texto ou mal ligada, **largura total** exata (método da secante; borda, espessuras e argola ficam em mm). Devolve malhas fechadas + laços 2D para a prévia.
- Tela `chaveiro-tela.js` como a do Codex: abas Texto/Base/Argola/Cores, escolha de fonte em janela com busca e categorias, largura em mm ou cm, paletas de 11 cores + cor personalizada, estilos de base, "Estrutura e modelos prontos" (Delicado/Clássico/Robusto), prévia 2D com a argola arrastável (refaz ao soltar; se a posição não servir, volta e explica), 3D, desfazer/refazer (Ctrl+Z/Ctrl+Y), zoom e "Ajustar à tela", "Filamentos na exportação" (slot de cada parte). Não mostramos "Salvar modelo"/"Beta" (regra: nada que não existe).
- 29 fontes (as 17 novas vieram do pacote do Codex, OFL/Apache, licenças junto), em categorias em `modelos/fontes.js`; `familiaCss(id)` carrega a fonte para mostrar na tela.
- 3MF (`exportar.js`) agora leva `Metadata/model_settings.config` com o filamento (extruder) de cada parte, para Anycubic Slicer Next/Orca/Bambu abrirem cada parte no filamento certo. Vale também para Logo e Palavras (slots 1, 2, 3… na ordem). Não leva `project_settings` (para não mexer nos perfis do usuário).
- Testes (`tests/chaveiro.test.js`): largura exata nos 3 estilos, argola ao longo da borda, base de contorno com um só contorno externo, **todas as 29 fontes × 3 estilos com malhas fechadas e orientadas**, 3MF com model_settings.

## Chaveiro de logo refeito (v0.15.0, 04/11/2026)
- Partes comuns em `modelos/manifold.js`: `prenderArgola` (argola na borda, recusas com explicação), `resolverLargura` (largura total pela secante), `motorDaTela` (carrega o WASM pela tela). Prévia 2D comum em `modelos/previa2d.js` (camadas coloridas + argola arrastável; usada pelo nome e pelo logo). Os resultados trazem `camadas`, `perimetro`, `argola` e `caixa` para ela.
- `modelos/logo.js`: `coresDoSvg(svg)` (SVG do vetorizador → contornos por cor; junta tons quase iguais do serrilhado, `juntarCoresParecidas`) e `gerarLogo(M, svgOuCores, opcoes)`: cores sem sobreposição (cada cor menos as anteriores), borda alisada (abre/fecha 0,15 mm), fragmentos < 0,4 mm² saem, base contorno (com pontes)/círculo/retangular, argola em cima por padrão e arrastável, largura total exata (20 a 150 mm).
- Tela `logo-tela.js` no mesmo padrão do chaveiro de nome (abas Logo/Base/Argola, paleta da base, Estrutura, 2D/3D, zoom). No 3MF a base vai no filamento 1 e cada cor no seguinte.
- Modo de captura: agora grava "ERRO NA CAPTURA" no `.txt` se o roteiro falhar e continua desenhando com a janela encoberta/tela bloqueada (sem isso o `capturePage` ficava parado para sempre).

## Conversor SVG com vetorizador próprio (v0.16.0, 04/11/2026)
O Pedro pediu "fidelidade máxima" (o imagetracer distorcia no zoom e às vezes trocava a cor). `renderer/vetorizar.js` foi reescrito sem biblioteca (imagetracerjs removido):
- Paleta: cores exatas quando a imagem tem até N cores; senão k-médias++ sobre caixas de 5 bits, só com pixels fora das bordas.
- Cobertura: cada pixel de borda é dividido entre o PAR de cores que melhor explica a mistura (o cinza entre preto e branco é preto+branco, mesmo com azul mais perto) → borda com precisão de fração de pixel.
- Camadas empilhadas (maiores embaixo; fundo removido fica por baixo, sem desenhar): cada camada cobre também as cores de cima → nada de frestas. O Chaveiro de logo entende isso (cada cor = ela menos as SEGUINTES).
- Contorno por marching squares na cobertura 0,5; cantos detectados (>50°) e reconstruídos no cruzamento das retas vizinhas; curvas de Bézier por ajuste de Schneider (tolerância: alto 0,2 px, médio 0,4, baixo 0,8); retas saem como "L"; alças longas demais são cortadas (evita "fios").
- Medido com formas de serrilhado exato: círculo erro máx. 0,15 px (antes 0,71), cantos 0,05–0,13 px (antes 0,3–0,6), pixel art sai exata. Arquivo menor (logo de teste: 15,6 KB contra 43,3 KB). Fotos com ruído ainda geram SVG grande (use "Suavizar").
- Testes de fidelidade em `tests/vetorizar.test.js`.

## Palavras decorativas no padrão novo (v0.17.0, 04/11/2026)
- `modelos/palavras.js`: `gerarPalavras(M, fontes, opcoes)` com Manifold. Até 3 linhas, cada uma com fonte e tamanho em % da linha 1; **largura total** exata (`resolverLargura` sobre a altura da linha 100%); espaço entre linhas em mm. "placa": base contorno (com pontes)/retangular/cápsula + texto em relevo. "letreiro": letras com a espessura toda + barra embaixo da última linha; `unirIlhas` liga letras soltas, acentos e linhas (as pontes ficam na cor das letras), a barra é separada das letras (sem sobreposição).
- Tela `palavras-tela.js` no padrão dos chaveiros (abas Texto/Estilo/Cores, janela de fontes por linha, paletas, Estrutura, 2D/3D, zoom). Base no filamento 1, texto/letras no 2.
- Peças de tela comuns em `renderer/modelos-ui.js`: `PALETA`, `criarPaleta`, `marcarPaleta`, `escolherFonte` (janela de fontes, devolve uma Promise com o id), `mostrarFonte`; `iniciarModelosUi()` no `app.js`. A prévia 2D (`previa2d.js`) aceita modelo sem argola.
- **Cuidado com o PowerShell 5.1**: `Get-Content`/`Set-Content` leem/gravam em ANSI e corrompem acentos (aconteceu no CONTEXTO.md e no package.json na v0.16.0; corrigido). Editar arquivos só com as ferramentas de edição, nunca por PowerShell.

## Logo sem moldura (v0.18.0, 04/11/2026)
Pedido do Pedro: no Chaveiro de logo, nada de moldura; a peça segue exatamente o contorno do logo, com a argola posicionável. Agora a borda padrão é 0 (limite 0 a 8; "Borda em volta" na Estrutura para quem quiser margem). No estilo Contorno, a base usa só os contornos externos do logo: vazados de dentro (ex.: texto branco removido como fundo) ficam preenchidos e aparecem na cor da base; partes soltas ganham pontes. Círculo e Retangular continuam como opção.

## Impressão sem AMS no Chaveiro de nome (v0.19.0, 04/11/2026)
Ao "Salvar 3MF" ou "Abrir no fatiador", a janela "Como você vai imprimir?" (`perguntarImpressao` em `modelos-ui.js`) pergunta: com AMS/ACE (cada parte no filamento escolhido) ou sem AMS (troca manual). Sem AMS: as duas partes vão no filamento 1 e o 3MF leva `Metadata/custom_gcode_per_layer.xml` (formato Orca/Bambu, `type="1"` = pausa; `pausasXml` em `exportar.js`). Por enquanto só no Chaveiro de nome (o Pedro pediu assim; logo com várias cores no relevo não dá por camada).
- O fatiador coloca ali o `machine_pause_gcode` do perfil. A impressora do Pedro é a **Anycubic Kobra X 0.4** (perfil em `%APPDATA%\AnycubicSlicerNext\system\Anycubic\machine`), que usa **M600**.
- O Anycubic prende a pausa à camada MAIS PRÓXIMA do valor; por isso a janela pergunta a altura de camada (padrão 0,20) e a primeira camada (0,2), e `camadaDaTroca(base, camada, primeira)` em `chaveiro.js` calcula o print_z exato da primeira camada só de texto (o fatiador corta cada camada no meio dela).
- **Fatiar por linha de comando funciona** (para testar sem abrir o programa): `AnycubicSlicerNext.exe --slice 0 --outputdir <pasta> --load-settings "<machine.json>;<process.json>" --load-filaments "<filament.json>[;<filament.json>]" <arquivo.3mf>` → `plate_1.gcode`. Conferido: sem AMS → um M600 antes da camada 13 (2,6 mm) com 0,20; 2,48 com 0,12; 2,6 com 0,16; com AMS → troca T1 na camada de 2,6 mm (os filamentos do model_settings são respeitados).

## Plano autorizado em 04/11/2026 ("faça, está autorizado a tudo")
Etapas (marcar [x] ao publicar): 
- [x] Sem AMS também nas Palavras (modo placa; letreiro não, as cores dividem as camadas) + ícone do programa (`recursos/icone.svg` → `npx electron scripts/gerar-icone.cjs` gera `recursos/icone.ico` e `icone.png`; `buildResources: recursos`, ícone no exe, instalador e janela). (v0.20.0)
- [x] Custo direto do modelo: `modelos/estimativa.js` (volume do Manifold × 1,24 g/cm³ do PLA, peça maciça; `malhaDoSolido` devolve `volume`); peso "≈ X g" na linha de medidas dos 3 modelos; botão "Calcular custo" → `preencherDoModelo` (calculadora-tela) abre a calculadora com o peso, a explicação e o nome, que vai para o "Salvar como produto". Tempo de impressão fica com o usuário (o fatiador sabe). (v0.21.0)
- [x] Salvar modelos → ferramenta **Meus modelos** (grupo Modelos personalizados). Cadastro interno "projetos" (o nome "modelos" já era usado pelos canais de arquivo): `core/projeto.cjs` (tipo chaveiro/logo/palavras, nome, opcoes da tela em JSON até 20 mil caracteres, miniatura PNG, no logo a imagem reduzida em data URL), `main/projetos.cjs`, canais `projetos:*`, entra no backup ("modelos salvos"). Telas: botão "Salvar modelo" (janela com nome; se veio de Meus modelos, "Salvar alterações" ou "Salvar como novo"), `salvarEmMeusModelos`/`registrarAbridor` em `modelos-ui.js`, `miniatura()` em `previa2d.js`, tela `projetos-tela.js` (busca, Abrir, Excluir com confirmação). (v0.22.0)
- [x] **Estoque de filamentos** (grupo Gestão financeira): `core/filamento.cjs` (material, marca, cor + amostra, peso do rolo, restante, preço/kg em centavos; `descontar`, `acabando` = < 15% ou < 100 g, `valorRestanteCentavos`), `main/filamentos.cjs` (+ canal `filamentos:descontar`), entra no backup ("rolos de filamento"). Tela `filamentos-tela.js`: cartões com amostra, barra do restante, aviso "Acabando", resumo (kg e R$ em estoque), "Usar" (desconta gramas; negativo devolve). Calculadora: "Rolo do estoque" preenche o preço/kg e "Descontar X g do rolo" (com confirmação). (v0.23.0)
- [x] **Etiquetas** (grupo Gestão financeira): `core/etiquetas.cjs` (tamanhos A4 3×8 70×37, A4 2×5 99×57, térmicas 50×30, 60×40, 100×150; etiquetas de produtos com empresa, nome, preço, peso e medidas; de pedidos com número, cliente, telefone, cidade e remetente; QR do WhatsApp da empresa com mensagem, via `qrcode-generator` 1.4.4 MIT; HTML todo escapado). Canal `etiquetas:pdf`: a tela manda só ids e cópias, o processo principal lê os dados gravados e gera o PDF com `htmlParaPdf` (janela sem JavaScript). Tela `etiquetas-tela.js` com lista marcável, cópias, prévia "Como fica" e resumo de folhas. (v0.24.0)
- [x] **Encaixes e tolerâncias** (grupo Ferramentas): `modelos/encaixes.js` — `calcularEncaixe` (folga diametral: justo 0,10, deslizante 0,20, folgado 0,40 mm; + material PETG/ABS/ASA 0,05, TPU 0,10; × bico/0,4 acima de 0,4; ou a "folga calibrada" do usuário) e `gerarPecaTeste` (placa com N furos de folgas crescentes, valor gravado 0,6 mm acima de cada furo com a fonte Fredoka, + pino da medida exata; Manifold). Tela `encaixes-tela.js` com resultado (folga, furo, pino), prévia 2D/3D e exportação 3MF/STL/fatiador (filamento 1). (v0.25.0)

**Plano de 04/11/2026 concluído (v0.20.0 a v0.25.0).**

## Detector de IA e metadados numa tela só (v0.26.0, 05/11/2026, branch `detector-metadados-unificado`)
- O antigo "Removedor de metadados" entrou no Detector de IA: tela `detector` ("Detector de IA e metadados"), `renderer/detector-tela.js`; `metadados-tela.js` e a tela `tela-metadados` saíram.
- Cada cartão mostra o veredito, os indícios com **onde** foram achados (ex.: "XMP", "EXIF · Programa", `Texto PNG "parameters"`, "C2PA") e o **trecho** encontrado, a lista de metadados e "Salvar cópia sem metadados" (ou todas de uma vez). A cópia é conferida de novo pelo detector antes de salvar.
- `analisarImagem` devolve também `fontes` ([{ onde, texto }]) e `c2pa` (bytes). `lerC2pa` (detector-ia.js) lê do CBOR o `claim_generator`/`claim_generator_info.name`, as ações `c2pa.*` e as organizações dos certificados (OID 2.5.4.10). Sem validar a assinatura: a tela manda para contentcredentials.org/verify.
- WebP: agora só ficam os blocos da imagem (VP8, VP8L, VP8X, ALPH, ANIM, ANMF, ICCP). Antes o bloco `C2PA` e blocos desconhecidos passavam pela limpeza.
- A tela avisa que marcas d'água invisíveis nos pixels continuam na cópia. Combinado com o Pedro: não fazer nada para esconder ou apagar marcas de IA nos pixels.

**Pendente (pedido do Pedro):** teste pela TELA do Anycubic Slicer Next, com fotos para ele: gerar o Chaveiro de nome, "Abrir no fatiador" escolhendo "Sem AMS", fatiar no programa aberto normalmente e conferir na pré-visualização a pausa na camada 13 (2,6 mm); também o arquivo "Com AMS" (troca para o filamento 2). Falta confirmar se a abertura pela janela (não pela linha de comando) também lê o `custom_gcode_per_layer.xml`. Precisa do Computer use ligado no app do Claude (Configurações → Este computador → Computer use); em 04/11/2026 estava desligado.

Próximo possível: conferir com o Pedro no Anycubic se os filamentos já vêm certos. Outras ideias sugeridas ao Pedro: ícone do programa, Estoque de filamentos, Etiquetas, Encaixes e tolerâncias.

Para testar telas: o modo de captura (`FERRAMENTAS_*`, ver "Testes e modo de captura") com roteiros JS. Node em `C:\Program Files\nodejs` (adicionar ao PATH), git em `C:\Program Files\Git\cmd\git.exe`, gh em `C:\Program Files\GitHub CLI\gh.exe` (já logado).

## Ideias para próximas ferramentas (não aparecem no app)
Orçamentos, Clientes e histórico, Descontos e taxas, Etiquetas, Estoque de filamentos, Comparador de custos, Encaixes e tolerâncias, Medidas e escala, Ficha de impressão, Falhas de impressão, Biblioteca de projetos, Conversor SVG, Preparador de fotos, Organizador de arquivos, Backup e restauração.
- Lógica testada em `electron/src/core/inicio.js`. Ícones em `electron/src/renderer/icones.js`.

## Produtos (pronto na v0.5.0)
- Tela com busca, filtro por categoria, cadastro, edição, exclusão (com confirmação) e foto (reduzida para até 640 px em JPEG).
- Botão "Salvar como produto" na calculadora: abre o cadastro com preço por peça, peso por peça e o custo (com lucro e data).
- Campos: nome, categoria, preço (centavos em texto), peso (g), altura/largura/comprimento (mm), observações, foto, custo.
- Dados em `%APPDATA%\Programa Ferramentas 3D\dados\produtos.json`, gravados só pelo processo principal (`src/main/armazenamento.cjs`): troca atômica (.tmp → renomeia) e cópia `.bak`. Se nada puder ser lido, não sobrescreve.
- A tela fala com o processo principal por `window.dados.produtos` (preload). O processo principal valida tudo de novo (`src/core/produto.cjs`, em CommonJS para servir aos dois lados).
- Itens inválidos no arquivo são mantidos, mas não aparecem na lista.

## Testes e modo de captura
- `vite` precisa estar nas devDependencies: o `.npmrc` usa `legacy-peer-deps` e não instala dependências "peer" sozinho. Sem ele, o vitest não roda.
- Modo de captura (só para testes): `FERRAMENTAS_CAPTURA=<png>`, com `FERRAMENTAS_ABA`, `FERRAMENTAS_TEMA`, `FERRAMENTAS_STL`, `FERRAMENTAS_ALTURA`, `FERRAMENTAS_JS` (roteiro executado na tela) e `FERRAMENTAS_DADOS` (pasta de dados temporária, para não tocar nos dados reais). O tema da captura não é salvo.

## Pendências
- Próxima ferramenta sugerida: Orçamentos (usa os Produtos) ou Clientes.
- Ícone do aplicativo (hoje é o padrão do Electron).
- Não há assinatura digital no instalador, então o Windows pode mostrar aviso de editor desconhecido.
- Auto-update validado ponta a ponta: 0.3.0 → 0.3.1.
- Programa Python antigo continua instalado em algumas máquinas e precisa ser removido manualmente depois da migração.

## Convenções
- Não apagar arquivos sem pedir permissão ao usuário.
- Testar cada regra de cálculo antes de mexer na interface.
- Não guardar dados pessoais nem chaves de API no código.
- Testar caminhos com espaços e acentos (ex.: "Pedro Henrique").
- O app não deve exigir privilégios de administrador.
