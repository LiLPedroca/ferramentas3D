# Contexto do projeto: Programa Ferramentas 3D

## Objetivo
Suíte de ferramentas para impressão 3D, para Windows 10 e 11. A calculadora de custo é a primeira ferramenta, não o projeto inteiro. Desenvolvido por Pedro em vibe coding.

## Idioma
- Conversa com o usuário: português do Brasil.
- Interface do app: português do Brasil.
- Código, funções e variáveis: português ou inglês técnico, com consistência dentro de cada módulo.

## Estado atual (novembro/2026)
- **Versão ativa: Electron** (pasta `electron/`, branch `electron`). Versão publicada: **v0.35.0**.
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

## Estrutura atual (electron/)
```
electron/
├── src/core/          regras e validação dos cadastros, cálculos, formatos, backup e imagens
├── src/main/          janela, IPC, armazenamento, serviços, PDF, fatiador e atualização
├── src/renderer/      telas, navegação, estilos, ícones, assets e integração com os cadastros
│   ├── modelos-ui.js     paletas, fontes, impressão com/sem AMS e Meus modelos
│   ├── modelos-acoes.js  prévias, zoom, exportação, fatiador, custo e imagens salvas
│   └── modelos/          Manifold, geração das peças, leitura/exportação 3MF e medidas
├── scripts/           build-renderer.mjs e geração do ícone
├── recursos/          ícones SVG, PNG e ICO do aplicativo e instalador
└── tests/             regras, persistência, geometria, formatos e comportamento das telas
```
O mapa detalhado e as regras de contribuição estão em `AGENTS.md`. Os arquivos Python da raiz
pertencem à versão antiga e permanecem como referência.

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

## Caçador de STL: resultados do Printables dentro do programa (v0.27.0, 05/11/2026)
- Busca pela API GraphQL que o próprio site do Printables usa (`api.printables.com/graphql/`, `searchPrints2`). **Não é documentada e pode mudar:** se falhar, a tela mostra o erro e um botão para abrir a busca no navegador.
- `core/printables.cjs` (consulta com variáveis, leitura e validação da resposta, miniatura 320×240: pasta `jpg` para .jpg/.jpeg e `png` para o resto) e `main/printables.cjs` (pedidos no processo principal, cache de 5 min, miniaturas só de `media.printables.com` e só as que vieram na busca, devolvidas como data URL por causa da CSP). Canais `stl:printables` e `stl:miniatura`, `window.stl` no preload.
- Os outros sites marcados viram botões "Ver também no navegador". O Thingiverse por dentro (como no Codex) usava `api.thingiverse.com/v2/auth/view`, que em 05/11/2026 devolve 403; o caminho oficial exige uma chave do usuário (thingiverse.com/developers). MakerWorld, Cults3D, MyMiniFactory e Thangs bloqueiam buscas automáticas: ficam no navegador.
- GitHub CLI instalado neste PC em 05/11/2026 e logado como LiLPedroca.

## Plano: Visualizador 3D e Paquímetro inteligente (pedido do Pedro em 05/11/2026: "quero todas")
Cada etapa vira uma release. Marcar [x] ao publicar.
- [x] 1. (v0.28.0) `renderer/viewer3d.js` reescrito + `modelos/ler3mf.js` (leitor próprio: o 3MFLoader do Three não lê a extensão production do Bambu/Orca; testado com Beyblade do Printables, PassaFio e o copo showroom de 7 placas). Pintura `paint_color`: lê também os triângulos subdivididos desde a v0.34.1. Mesas em `MESAS` (Kobra X 260³ lida do perfil do Anycubic Slicer Next), escolha guardada no localStorage. **Base do visualizador:** orientação do arquivo (Z para cima, como no fatiador; antes aparecia deitado), mover na mesa, girar 90° por eixo e livre, "deitar na face" (clica numa face e ela vai para a mesa), sempre apoiado na mesa, centralizar/restaurar; abrir 3MF (cores de basematerials/colorgroup e cores dos filamentos de projetos Bambu/Orca/Anycubic), OBJ e PLY além de STL; cor escolhida para STL; mesa da impressora em tamanho real (Kobra X 260×260×260 e outras) com aviso se não couber; vistas rápidas (frente, topo, lado, 3D) e aramado; escala em % e "veio em polegadas" (×25,4); peso estimado, "Calcular custo" e "Salvar como ficou" (STL/3MF) / abrir no fatiador.
- [x] 2. (v0.29.0) `modelos/medidas.js` (cálculos puros e testados: eixo do furo pelas normais da parede com Jacobi 3×3, corte da malha por plano, laço mais perto do clique, círculo de Kåsa com ±, lados; distância com "bicos" só entre faces opostas; profundidade pela normal da primeira face; `arestasMarcantes` = bordas e dobras > 20°, para o snap não grudar nas diagonais de faces planas) + `renderer/paquimetro.js` (cliques, snap, rótulos amarelos, lista, "Quero que tenha… mm" → escala). Medidas guardadas nas coordenadas da peça (acompanham giro/escala). Conferido: furo Ø 8 de teste = 8,00; PassaFio 51 mm real: tubo Ø 50,6 e furo Ø 46,6. `window.__visualizadorTeste` existe só para os roteiros do modo de captura. **Paquímetro manual:** bicos externos (distância entre faces, reta se paralelas), orelhas internas (diâmetro de furo), haste de profundidade, ressalto; snap em vértices, arestas e centros de furos; medidas totais; mm e polegadas; aviso "parece estar em polegadas"; "quero que esta medida tenha X mm" → escala.
- [x] 3. Parte 2 (v0.31.0): **real × modelo** (`modelos/calibracao.js`; em cada medida "Medi na peça impressa…" → `configuracoes.calibracoes` [{ filamento, tipo furo|pino|externa, modelo, real, data }], resumo por filamento: furos/pinos em mm, externas em %; mostra "deve sair ≈"); **histórico** (`configuracoes.medidasSalvas`, chave = nome|tamanho|triângulos|placa, até 100 arquivos × 60 medidas, coordenadas da peça; volta ao reabrir o arquivo); **ficha de medidas** em PNG (imagem da vista com os rótulos + tabela, salva por `arquivos:salvar-copias`). Ficha em PDF não foi feita. Parte 1 (v0.30.0): `renderer/analise-tela.js` + `acharFurosEPinos` (corta a peça em 7 alturas nos 3 eixos, círculos com rms < 2% e ≥ 8 lados, junta por centro/raio, comprimento pelos vértices da parede; descarta cones/chanfros sem comprimento) e `medirParedes` (amostras pela área, raio para dentro com BVH do three-mesh-bvh 0.9.16 MIT; vermelho < bico, laranja < 2× bico). Lista com destaque na peça, "+ Medida", "Fazer pino que encaixa"/"Fazer furo para este pino" (→ `abrirEncaixeCom` no Encaixes) e folga pino × furo classificada pelos ENCAIXES. Automático até 400 mil triângulos. Falta: real × modelo, histórico de medidas, ficha de medidas. **Paquímetro inteligente:** lista automática de furos e pinos (diâmetro ajustado por círculo com ±, profundidade, posição; passar o mouse acende na peça), espessuras entre faces paralelas, paredes finas demais para o bico; "Fazer pino que encaixa" (liga ao Encaixes); "real × modelo" (digita a medida da peça impressa → contração por filamento, guardada); medir duas peças juntas (folga pino × furo); histórico de medidas salvo nos Meus modelos; ficha de medidas em PDF/imagem.
- Visualizador limpo (v0.32.0, pedido do Pedro: "interface poluída", a análise empurrava a mesa para fora da tela): a área 3D ocupa a altura toda e só o painel lateral rola; painel com abas **Peça / Medidas / Análise**; vistas, giros de 90° e centralizar/restaurar ficam sobre a mesa (canto de baixo); dica em pílula no topo da mesa (só nos modos de ação); área de soltar arquivo no meio da mesa até abrir algo (dá para soltar em qualquer ponto da mesa) e "Abrir arquivo" na barra; lista de furos/pinos compacta (8 + "Mostrar todos"), furos parecidos juntados (`juntarParecidos`: mesmo eixo e centro, diâmetro dentro da faixa → "Ø 20,99–21,58 · cônico"); pontos de parede fina desligados por padrão. Regra: manter a tela mínima, sem textos longos.
- Depois da v0.32.0 (commit sem release): aviso "Solte um arquivo na mesa ou clique aqui" virou faixa pequena no topo da mesa vazia; barra sempre visível com "Abrir arquivo".
- **Paquímetro de passar o mouse (v0.33.0, aprovado pelo Pedro em 05/11/2026)** — ele tinha achado o paquímetro inteligente "muito confuso"; o pedido dele: "passar o mouse e o programa identificar, ex.: a boca de um copo, e dar o diâmetro interno para encaixar um copo de alumínio". Barra: só **Paquímetro** (passar o mouse) e **Distância** (dois cliques, snap e "Centro dos furos" como antes). Saíram os modos Diâmetro/Profundidade, a aba Análise e `analise-tela.js` (`acharFurosEPinos`/`medirParedes` continuam em `medidas.js`, testados, mas sem uso na tela). Ao passar o mouse: etiqueta azul que segue o mouse + anéis azuis na peça; clique fixa (etiqueta amarela, entra na aba Medidas). Ordem do reconhecimento (`identificar` em `paquimetro.js`): 1) redondo (`identificarRedondo` em `medidas.js`), 2) aresta real perto do mouse (`arestaReta` segue as arestas colineares; `arestasMarcantes` agora devolve `vizinhos`), 3) espessura da parede (raio para dentro com BVH numa cópia da geometria; aviso "fina demais/frágil" pelo bico, seletor de bico agora na aba Medidas). `identificarRedondo`: se a face é parede curva (`medirDiametro`) corta perpendicular ao eixo no ponto; se é face plana corta 0,137 mm para dentro e acha a borda redonda a até 9 px do mouse, ou o menor disco em volta do ponto, ou (corte 0,137 mm acima) o furo em volta de um fundo. Laços redondos do corte: furo = laço dentro de um número ímpar de outros. Junta círculos concêntricos → Ø dentro / Ø fora / parede; fundo por raio pelo meio do furo ("passa direto" se não bate), altura pela extensão da parede. `eixoLocal` mudou: conta triângulos pela distância real até o ponto (paredes de copo com triângulos de ponta a ponta) e só os com normal a menos de 60° da face clicada (a tampa não estraga o eixo). Medidas novas `redondo` { centro, eixo, externo, interno, profundidade, passante, altura }, `aresta` e `parede` (validadas em `core/configuracoes.cjs`; as `diametro` antigas viram `redondo` ao abrir). Folga furo × pino aparece na aba Medidas quando há um furo e um pino fixados; botão "Fazer pino"/"Fazer furo" leva ao Encaixes. Conferido no modo de captura com copo de teste (Ø 70/74, 95 de altura): "Ø dentro 70,00 · Ø fora 74,00 · parede 2,00 · fundo 92,0". Não testado com peça muito grande (o cálculo espera o mouse parar 40 ms).
- **v0.33.1 (pedido do Pedro, 05/11/2026):** "aparece muita informação, pra gente é importante somente o interior e exterior sempre, tanto faz o que tá dentro da peça onde a gente não enxerga". O Paquímetro agora só reconhece bordas redondas e mostra **só Ø dentro e Ø fora** (sem parede, fundo, altura, lados). Saíram do passar o mouse a aresta e a espessura da parede (e o BVH); saiu o seletor de bico (a folga furo × pino usa o bico guardado, padrão 0,4). `identificarRedondo`/`arestaReta` continuam em `medidas.js` e testados; medidas antigas do tipo aresta/parede ainda abrem. Regra: não pôr informação além de Ø dentro/fora no paquímetro sem o Pedro pedir.
- **Paquímetro por camada (v0.33.2; a v0.33.1 ficou só como tag, sem release; pedido do Pedro em 05/11/2026):** "seria bom se medisse por camada, conforme a gente vai passando o mouse ele vai medindo, ao invés de ter que selecionar a boca ou a base". `medirCamada(pos, ponto, normal, vertical, { perto })` em `medidas.js` substituiu `identificarRedondo` (e `extensaoDaParede`): corta a peça num plano deitado na altura do mouse (vertical = para cima da mesa convertido para as coordenadas da peça, então funciona com a peça girada). Parede em pé: círculo da camada que passa pelo mouse (até 9 px ou 3% do raio). Face deitada para cima: se a camada logo acima tem um furo em volta → fundo de furo/copo; senão corta 0,137 mm para dentro (boca, ponta de pino); face para baixo corta para cima. Junta concêntricos → Ø dentro/Ø fora. Conferido com copo cônico (Ø fora 60→74): a 20 mm mostrou 58,58/62,94 e a 85 mm 68,48/72,52, iguais ao cálculo. Medida fixa com dentro e fora se chama "Medida N".
- Regras desta fase: tudo em português do Brasil (inclusive textos de resumo/botões do Claude); interface mínima; cada mudança vira release, mas o `gh release create` pede confirmação do Pedro a cada vez (o app bloqueia sem ela). GitHub CLI em `C:\Program Files\GitHub CLI\gh.exe`, git com PATH recarregado de Machine+User. Testes de tela: modo de captura com `FERRAMENTAS_DADOS` apontando para pasta temporária; `window.__visualizadorTeste` dá acesso ao estado do visualizador nos roteiros.
- **Corte / plano de seção (v0.34.0, 05/11/2026; Pedro disse "comece" e o primeiro extra foi este):** botão **Corte** na barra (liga/desliga) abre um painel pequeno no canto de cima da mesa com **Altura / Frente / Lado** e um controle deslizante ("Altura: 42,0 de 60,0 mm", medido desde o começo da peça). `renderer/corte.js` (`criarCorte`, `posicaoDoCorte`, testado em `tests/corte.test.js`): usa `clippingPlanes` do Three; Altura some o que está acima, Frente some o lado Z+ (da câmera de frente), Lado some o X+. O recheio cortado aparece em laranja (#ff8a3d) com um grupo de "tampas" (mesmas geometrias, `MeshBasicMaterial` BackSide, polygonOffset para não piscar com a grade); as tampas copiam a matriz da peça a cada quadro. Ao escolher uma direção a câmera vai para a vista que mostra o corte. O paquímetro e o "deitar na face" ignoram a parte escondida (`visivel(ponto)`). Salvar STL/3MF, volume e peso continuam com a peça inteira.
- **Cores pintadas subdivididas (v0.34.1, 05/11/2026):** o Pedro abriu `COPO_MONSTER_medidas_do_completo_verde_neon.3mf` (Downloads) e as faixas verdes saíram em zigue-zague grosso em vez do X fino do fatiador. Causa: a pintura do Bambu/Orca subdivide triângulos e o leitor só entendia triângulo inteiro. `lerPintura(codigo, vertices)` em `modelos/ler3mf.js` segue o `TriangleSelector` do OrcaSlicer (hex lido de trás para frente, nibble com bit baixo primeiro; 2 bits = lados divididos, 2 bits = lado especial ou filamento, "11" + nibble + 3, nibble 15 → +18; filhos do último para o primeiro; divisão igual a `perform_split`). O copo fica com 2,4 milhões de triângulos na tela (o contador mostra os pedaços). Testes em `tests/ler3mf.test.js`.
- [ ] 4. **Extras:** ~~corte (plano de seção)~~ (feito na v0.34.0), áreas que vão precisar de suporte (> 45°), foto do produto (fundo neutro → cadastro de Produtos), comparar duas versões (cores onde mudou), prévia em camadas com controle deslizante, abrir direto do Caçador de STL.

**Pendente (pedido do Pedro):** teste pela TELA do Anycubic Slicer Next, com fotos para ele: gerar o Chaveiro de nome, "Abrir no fatiador" escolhendo "Sem AMS", fatiar no programa aberto normalmente e conferir na pré-visualização a pausa na camada 13 (2,6 mm); também o arquivo "Com AMS" (troca para o filamento 2). Falta confirmar se a abertura pela janela (não pela linha de comando) também lê o `custom_gcode_per_layer.xml`. Precisa do Computer use ligado no app do Claude (Configurações → Este computador → Computer use); em 04/11/2026 estava desligado.

Próximo possível: conferir com o Pedro no Anycubic se os filamentos já vêm certos. Registro histórico de sugestões já entregues: ícone (v0.20.0), Estoque de filamentos (v0.23.0), Etiquetas (v0.24.0) e Encaixes e tolerâncias (v0.25.0).

Para testar telas: o modo de captura (`FERRAMENTAS_*`, ver "Testes e modo de captura") com roteiros JS. Node em `C:\Program Files\nodejs` (adicionar ao PATH), git em `C:\Program Files\Git\cmd\git.exe`, gh em `C:\Program Files\GitHub CLI\gh.exe` (já logado).

## Caneca de chopp (v0.35.0, 09/11/2026)
Pedido do Pedro: replicar a "caneca de chopp" do Criador 3D do multiferramenta3d.com (vídeo de 09/11/2026), com a **boca interna e a altura do "copo showroom"** dele como padrão de todos os modelos, e opção de mudar à mão.
- Medidas do copo showroom (`Downloads/copo showroom (1).3mf`, peça "tubo com trava e argola"): argola com **boca interna de 81,4 mm** (está no nome da peça) e tubo de **123 mm** de altura (corpo 108 + argola 15). A base drapeada é outra peça. `COPO_SHOWROOM` em `modelos/caneca.js`; a tela mostra "Usar as medidas do copo showroom" quando o usuário muda.
- `modelos/caneca.js`: corpo girado (`revolve` 256) com boca lisa e arredondada (3 mm na cor principal acima da faixa de cima), fundo com canto arredondado, chanfro de 0,5 mm na base; 4 faixas (cima, 1, 2, 3) com texto frente/verso em relevo na cor da faixa (seção plana → `refineToLength(3)` → `warp` no cilindro; frente = −Y, verso = +Y); "escada" (cada faixa de baixo sai X mm a mais); alça em −X com a pega descendo até a mesa (os braços viram pontes, sem suporte); textura de emblemas pequenos (anel + desenho, `simplify(0,05)`, sem textura atrás do emblema por padrão, para colar). Cores só por altura (`regioesDeCor`), então sem AMS = pausas `trocasDeCor` (5 no padrão: camadas 71, 141, 211, 531, 601). A peça é dividida por `trimByPlane` em "cor principal" (filamento 1) e "2ª cor" (filamento 2).
- `modelos/emblema.js`: imagem → escuro vira desenho (limiar, inverter), PNG transparente dá o contorno; `formasDoEmblema` (contorno ou círculo, aro). Emblema sai deitado ao lado (base 1,6 + desenho 0,8). Sem AMS o emblema fica fora do arquivo da caneca e sai em "Salvar só o emblema" (pausa em 1,6 mm).
- `perguntarImpressao` aceita uma lista de trocas. Meus modelos ganhou o tipo `caneca` (guarda a imagem do emblema).
- Conferido fatiando pela linha de comando (Kobra X, 0,20): sem AMS → 5 M600 em 14,2 / 28,2 / 42,2 / 106,2 / 120,2 mm, 615 camadas, ≈ 111 g e 3h44; com AMS → trocas T0/T1 nas mesmas alturas. Não impresso de verdade.

## Ideias ainda não implementadas (não aparecem no app)
Descontos e taxas como ferramenta própria, Comparador de custos, Ficha de impressão, Falhas de impressão, Preparador de fotos e Organizador de arquivos.

Do registro original de ideias, já foram entregues: Orçamentos, Clientes e histórico, Etiquetas,
Estoque de filamentos, Encaixes e tolerâncias, Medidas e escala (Visualizador), Biblioteca de
projetos (Meus modelos), Conversor SVG e Backup e restauração. As decisões e versões estão
preservadas nas seções históricas acima. Os extras do Visualizador dependem de pedido do Pedro.
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
- A versão final do trabalho do Codex foi publicada como v0.36.1; os blocos intermediários foram incorporados nela. Ver o registro abaixo.
- Conferências físicas: imprimir os modelos, pausa/retomada M600 na Kobra X e leitura do QR pelo celular.
- Conferir as pausas e os filamentos abrindo pela janela do Anycubic Slicer Next.
- Registro de pendências antigas já resolvidas: Clientes (v0.7.0), Orçamentos (v0.8.0) e ícone próprio (v0.20.0).
- Não há assinatura digital no instalador, então o Windows pode mostrar aviso de editor desconhecido.
- Auto-update validado ponta a ponta: 0.3.0 → 0.3.1.
- Programa Python antigo continua instalado em algumas máquinas e precisa ser removido manualmente depois da migração.

## Convenções
- Não apagar arquivos sem pedir permissão ao usuário.
- Testar cada regra de cálculo antes de mexer na interface.
- Não guardar dados pessoais nem chaves de API no código.
- Testar caminhos com espaços e acentos (ex.: "Pedro Henrique").
- O app não deve exigir privilégios de administrador.

## Trabalho do Codex (09/11/2026)

### Bloco 1 — revisão de bugs (v0.35.1)
- Base atualizada por `git pull origin electron`, confirmando o commit e6b9041. `npm install` concluído e os 216 testes originais passaram.
- Chaveiro, Logo, Palavras, Caneca e Encaixes bloqueiam exportação/custo/salvamento enquanto a peça está sendo atualizada; entradas numéricas inválidas cancelam pedidos pendentes.
- Corrigida a liberação de formas temporárias do Manifold (círculos, retângulos e transformações) nos modelos e nas argolas/pontes. Testes exercitam a geração real e verificam liberação dos objetos.
- Capturas usam exclusivamente FERRAMENTAS_DADOS em pasta temporária. Nenhum dado pessoal ou arquivo antigo foi apagado.
- Última release consultada pela API pública: v0.35.0. `gh auth status` informa ausência de login; v0.35.1 preparada, publicação pendente.
- Validação do bloco: 224 testes passaram. Uma execução anterior teve timeout de 5 s em `logo.test.js` (largura e fechamento nos três estilos); o teste isolado e a repetição completa passaram. Capturas de todas as telas básicas sem IDs repetidos.
- Instalador v0.35.1 e blockmap gerados; manifest preservado em `electron/release/v0.35.1/latest.yml`. Commit d9d782c enviado para origin/electron.

### Bloco 2 — ações comuns dos modelos (v0.35.2)
- Extraídas para `renderer/modelos-acoes.js` as ações repetidas de prévia 2D/3D, zoom, enquadramento, salvar STL/3MF, enviar ao fatiador, calcular custo e converter imagens em data URL. As regras específicas de AMS/pausas permanecem nas telas. Código movido, sem eliminar funcionalidades.
- 237 testes passaram (`npm test -- --maxWorkers=2`), incluindo testes das ações comuns. As nove combinações geométricas do logo agora são testes separados, com as mesmas verificações, evitando que a soma de nove gerações estoure 5 s em computadores ocupados.
- v0.35.2 preparada; release pendente por falta de login no gh. Capturas novamente com dados temporários.

### Item 3 — documentação atualizada
Estrutura atual, estado publicado, pendências e ideias reorganizados. O histórico de versões e decisões foi preservado; sugestões já entregues estão identificadas como concluídas. Alteração apenas documental, sem nova release.

### Item 4 — comentário do .gitignore
Convertido o .gitignore de Windows-1252 para UTF-8 sem BOM: o acento de "repositório" agora é lido corretamente. Nenhuma regra de exclusão mudou. Testes antes: 237 passaram.

### Item 5 — peso por material (v0.36.0)
- O material do rolo selecionado na Calculadora passa a determinar a densidade usada nos modelos personalizados e no Visualizador. Sem seleção: PLA (1,24 g/cm³), ou PETG (1,27) na Caneca. PLA+/Silk/Outro usam a aproximação de PLA. ABS 1,05, ASA 1,07 e TPU 1,22 são valores típicos, não uma calibração por marca.
- Prévia e envio para a calculadora usam a mesma densidade. Ao voltar ao modelo/Visualizador, o peso é atualizado para a seleção atual. A estimativa continua considerando a peça maciça; o peso fatiado varia com preenchimento e paredes.
- 247 testes passaram. Captura real com dados temporários: caneca padrão PETG 220,9 g; após selecionar rolo ABS na Calculadora e retornar à Caneca, 182,6 g, com o mesmo valor enviado ao cálculo.
- Referências das aproximações adicionais: [ABS Bambu Lab](https://bambulab-us.myshopify.com/products/abs-filament), [TPU Bambu Lab](https://cdn.shopify.com/s/files/1/0584/7236/6216/files/Bambu_TPU_95A_HF_Technical_Data_Sheet.pdf?v=1700101819), [ASA Prusament](https://prusament.com/wp-content/uploads/2022/10/ASA_Prusament_TDS_2022_16_EN.pdf).
- v0.36.0 preparada; publicação pendente por falta de login no gh. O item 4 também teve normalização final das quebras de linha e do comentário "Saídas", preservando todas as regras.

### Item 6 e revisão final (v0.36.1)
- HTML identificado por comentários de tela/diálogo; CSS ganhou um índice das seções existentes. Comparação normalizada confirmou que só comentários/espaços mudaram, sem remover elementos nem alterar regras ou sua ordem.
- Revisão independente encontrou uma recuperação incompleta de entrada numérica: ao sair do campo, o valor anterior era restaurado, mas as ações permaneciam bloqueadas. Agora a restauração regenera a peça e a geração confere todos os campos atuais antes de habilitar ações. Isso também evita exportar quando outro campo continua inválido. Dois testes novos falharam antes da correção e passaram depois.
- Validação final de código: **249 testes passaram** (`npm test -- --maxWorkers=2`), build do renderer concluído. Captura confirmou recuperação após entrada inválida no Chaveiro, Palavras, Caneca e Logo; revisão independente não encontrou outra regressão confirmada.
- Conferidas 19 telas básicas em captura, sem IDs HTML repetidos; nas cinco telas de modelos, conferidas prévias 3D, zoom/enquadramento. STL e 3MF exportados pela interface no Chaveiro, Palavras e Encaixes foram lidos e validados; Chaveiro/Palavras preservam o XML de pausas sem AMS. Os ensaios usaram apenas dados e arquivos temporários.
- `acharFurosEPinos`, `medirParedes` e `arestaReta` foram preservados (item 7). Os extras do Visualizador não foram implementados (item 8 depende de pedido específico). Nenhuma alteração no Python antigo, nas informações do paquímetro ou nas marcas de IA nos pixels.

### Publicações e pendências desta sessão (registro anterior ao login)
- Publicadas pelo Codex: **nenhuma**, pois `gh auth status` informa que este computador não está logado. O push Git funciona; os commits estão sendo enviados normalmente para `origin/electron`.
- Versões preparadas nos blocos: **0.35.1**, **0.35.2**, **0.36.0** e **0.36.1**. A última acumula todos os ajustes. O instalador 0.35.1 foi gerado com blockmap e manifest preservado em `release/v0.35.1/latest.yml`; o pacote final 0.36.1 foi gerado novamente e inclui a correção encontrada na revisão.
- Antes de publicar, autenticar o gh e conferir novamente a última release no GitHub. A última consultada durante este trabalho era **v0.35.0**. Priorizar a versão final que inclui todos os blocos; se outra sessão publicar em paralelo, escolher versão maior.
- Continuam pendentes as conferências físicas e na janela do Anycubic descritas acima. Tamanhos de linha inválidos nas Palavras exigem digitar um valor válido, comportamento anterior preservado. O npm install informou cinco avisos de vulnerabilidade moderada em dependências; não foi aplicada atualização forçada fora do escopo.

### Encerramento da implementação (antes da publicação)
- Instalador final: `electron/release/ProgramaFerramentas3D-Setup-0.36.1.exe`, com `.exe.blockmap` e `latest.yml`. Manifest da versão preservado também em `electron/release/v0.36.1/latest.yml`; SHA-512 do manifest conferido com os bytes do EXE. SHA-256 do EXE final: `678809d8f449e98a0fbf9ca1384789ef8bb8023b27835eb37f3a48bdcdb8cba8`.
- O aplicativo empacotado confirmou `Versão 0.36.1` e passou no roteiro de recuperação de campo inválido nas quatro telas, usando exclusivamente pasta temporária para os dados. A compilação `npm run dist` terminou com sucesso.
- Commits de implementação enviados: d9d782c (bugs/Manifold), 20b21b7 (ações compartilhadas), 01f69e6 (documentação), 5f32ed3 (materiais) e 0ed39a6 (organização/recuperação final). Registro final da documentação em commit posterior. Repositório mantido na branch electron, sem reset, stash ou reescrita de histórico.
- `gh auth status` foi repetido ao final e continua sem login. Releases pendentes; última release pública reconferida: v0.35.0. Para retomar, autenticar e seguir a seção 5 do AGENTS.md, usando a versão final ou uma maior se houver publicação em paralelo.

### Publicação concluída (09/11/2026)
- Após o Pedro concluir o login, `gh auth status` confirmou a conta LiLPedroca. `git fetch` e a lista de releases confirmaram v0.35.0 como última versão anterior.
- **Publicada v0.36.1**, reunindo todos os blocos preparados nesta sessão: https://github.com/LiLPedroca/ferramentas3D/releases/tag/v0.36.1 . Tag vinculada ao commit validado `849ddef94df826746755518392652d6412c47eb5`.
- Publicação conferida com `gh release view` e endpoint `releases/latest`: versão mais recente, sem rascunho e sem pré-release, com exatamente os três arquivos esperados (instalador, blockmap e latest.yml), todos enviados. SHA-256 do EXE no GitHub confere com o pacote local validado: `678809d8f449e98a0fbf9ca1384789ef8bb8023b27835eb37f3a48bdcdb8cba8`.
- A pendência de autenticação/publicação dos registros anteriores está resolvida. Não é necessário publicar separadamente 0.35.1, 0.35.2 e 0.36.0: os ajustes estão acumulados na 0.36.1. Permanecem as conferências físicas e na janela do Anycubic já registradas.

## Trabalho do Codex (10/11/2026) — Copos personalizados

- Após a autorização “comece”, substituída a tela inicial da caneca pelo catálogo **Copo 1, Copo 2 e Copo 3**, com painel compacto, cores individuais, prévia grande, “Capacidade 500ml” e menu Exportar. A capacidade exibida é a identificação solicitada para o copo de alumínio, não um cálculo do volume do revestimento impresso.
- Copo 1: geometria do STL completo preto/branco. O 3MF original `COPO COMPLETO.3mf` tem os mesmos 1.825.246 triângulos e dimensões, somente transladados; foi usado para conservar a separação da pintura preto/branco que o STL não armazena. Copo 2: MONSTER verde neon. Copo 3: primeira placa do choper matiQ3D, conjunto montado, sem os logotipos soltos da outra placa.
- Altura dos três conjuntos: 145 mm. Boca interna nominal: 81,4 mm. O terceiro foi redimensionado em XY pela boca circular e em Z pela altura; a cavidade inferior original desse modelo é diferente da cavidade cônica do Copo 1. **Conferir o apoio e o encaixe físico do alumínio no Copo 3 antes de produzir em quantidade.** Nenhum modelo foi impresso nesta sessão.
- Cada seletor de cor atualiza o material da prévia no evento `input`, sem reconstruir a malha. Salvar/reabrir conserva o número do copo e todas as cores. Custo usa volume da malha e densidade selecionada, com PETG como padrão; é estimativa maciça.
- STL exporta o conjunto completo. O 3MF conserva componentes/pintura nativos, com as novas cores, mantendo somente o conjunto da primeira placa no build. Perfis de impressora, pausas, G-code, miniaturas antigas e relações para arquivos não exportados ficam fora do arquivo gerado; o usuário usa seu perfil no fatiador. Cores distribuídas pelo corpo exigem impressão multicolorida compatível, não pausas simples por altura.
- A ferramenta antiga e seu código foram preservados em `caneca-legado`, acessível ao abrir projetos antigos em Meus modelos. O novo catálogo não oferece edição de texto/emblema da malha importada; Personalização contém o nome do projeto e restauração das cores. A edição antiga de faixas/emblemas continua nos projetos antigos.
- Pacotes em `renderer/assets/copos`; `scripts/preparar-copos.mjs` gera as prévias geométricas e `scripts/empacotar-copos-nativos.mjs` prepara o 3MF montado. Ambos recebem os três caminhos por argumentos, sem caminhos pessoais no código.
- Revisão independente encontrou bloqueio permanente após erro de leitura; corrigido e coberto por teste que falhou antes da correção. Conferidos também atualização do resumo legado e relacionamentos internos do 3MF.
- Capturas usam somente `FERRAMENTAS_DADOS` temporário. Teste real confirmou mudança do canvas ao editar cores, seis exportações (STL/3MF dos três copos) e reabertura dos três projetos com as cores salvas. Conferência dos arquivos compara altura, cores e contagem de triângulos; não equivale a impressão física.
- **Versão 0.37.0 preparada para publicação.** 253 testes passaram na execução com `--maxWorkers=2` e na conferência final com `--maxWorkers=1 --testTimeout=15000`. Uma execução intermediária, simultânea à leitura pesada de 3MF, estourou os 5 s de um teste antigo de Manifold; a repetição completa sem essa concorrência passou. `npm run dist` terminou com sucesso. Aplicativo empacotado confirmou a versão, o catálogo e o tema claro; captura escura e projetos legados também conferidos. Instalador de 244.737.814 bytes; SHA-256 `f308c10bb5d64f69fac0260c0353a309fb7369732becaa70f40955c527f070c0`, blockmap e SHA-512 do `latest.yml` conferidos. Publicação será registrada abaixo após envio e confirmação no GitHub.
- Pendentes por decisão do Pedro: River Plate e fileteado não incluídos. Permanecem os testes físicos de encaixe, impressão e os demais testes físicos das versões anteriores. Nenhum dado real, arquivo original ou código antigo foi apagado.

### Publicação concluída — v0.37.0

- Publicada [v0.37.0](https://github.com/LiLPedroca/ferramentas3D/releases/tag/v0.37.0), vinculada ao commit validado `9627beafdc144e4317444bc029c477ae80b557ea`, enviado para `origin/electron`.
- Endpoint `releases/latest` confirmou versão mais recente, sem rascunho e sem pré-release, com exatamente os três arquivos esperados em estado `uploaded`. O digest SHA-256 do instalador no GitHub confere com o arquivo local: `f308c10bb5d64f69fac0260c0353a309fb7369732becaa70f40955c527f070c0`.
- A publicação da 0.37.0 está concluída. Continuam pendentes apenas as conferências físicas e os modelos adiados descritos acima; a edição de texto/emblema dos novos modelos importados não foi implementada nesta versão.

## Trabalho do Codex (10/11/2026) — padrão preto e branco

- Por pedido do Pedro, os três copos passam a abrir com cores padrão preta/branca, independentemente das cores dos arquivos de referência. As escolhas dos projetos salvos continuam sendo restauradas. O botão “Restaurar preto e branco” usa o mesmo padrão.
- As cores originais das referências permanecem armazenadas separadamente, para que a exportação 3MF possa remapear corretamente a pintura para as cores selecionadas. Nenhum arquivo original ou dado real foi alterado.
- Logo oficial localizada em `Downloads/Criae3D logo oficial.svg`. O contexto dos scripts de Modelagem confirma sua finalidade: assinatura Criae3D no fundo do copo, integrada à base/pintura da primeira camada. O Pedro perguntou pela finalidade; não foi solicitada nova aplicação da logo nesta alteração.
- Versão 0.37.1 preparada: 255 testes passaram com `--maxWorkers=1 --testTimeout=15000`, antes das capturas e novamente após terminar a compilação, sem tarefas pesadas em paralelo. Execuções intermediárias estouraram o tempo de testes antigos de geometria (Encaixes/29 fontes); as verificações foram mantidas e a execução isolada passou. Captura confirmou os três modelos com `#000000`/`#ffffff`, inclusive após restaurar cores; miniaturas regeneradas e aplicativo empacotado conferido. `npm run dist` concluído. Instalador com 244.738.756 bytes, SHA-256 `d7e0802996942067fda39583279b1e15709c49c2a293a9340dd12e411d9c5078`; blockmap e SHA-512 do `latest.yml` conferidos. A publicação será confirmada abaixo após envio.
- **Publicada [v0.37.1](https://github.com/LiLPedroca/ferramentas3D/releases/tag/v0.37.1)**, vinculada ao commit `41832a205c268c622d01d642377fd8f2160144a2` enviado à `electron`. Endpoint `releases/latest` confirmou a versão, sem rascunho/pré-release e com os três arquivos em estado `uploaded`; SHA-256 do instalador no GitHub confere com o arquivo local. Publicação concluída.

## Trabalho do Codex (10/11/2026) — assinatura nos três copos

- Pedro aprovou a foto `exec-5a3f9585-2ecb-415a-a421-845d08b457ac.png` e disse “comece”: logo oficial central no fundo, `www.criae3d.com.br` no arco superior e `Instagram: _criae3d_` no inferior, da esquerda para a direita e com os dois underscores. Tudo no mesh da própria base, sem objeto de logo selecionável separadamente com Del.
- Plano e ledger em `docs/superpowers/plans/2026-11-10-assinatura-copos.md`. Fonte vetorial oficial copiada, sem alterar o original, para `electron/src/renderer/assets/copos/criae3d-logo.svg`; fonte Rubik existente. `electron/scripts/assinatura_copos.py` gera contornos e rebaixo de 0,2 mm com pintura: o rebaixo conserva a assinatura também na geometria STL. Não muda altura/encaixe; a marca não ficará totalmente coplanar como na foto ilustrativa.
- Baseline e após Task 1: 255 testes npm passaram. Quatro testes Python de `electron/scripts/tests/test_assinatura_copos.py` passaram após vermelho inicial: textos/underscores/orientação, área útil, sólido fechado conectado e volume do rebaixo, rejeição de marca fora da base.
- Etapa inicial registrada antes da interrupção: faltavam a fusão da base do Copo 1, aplicação aos modelos e validação. Diagnósticos temporários em `%TEMP%/copos-assinatura-codex`, com base-1/2/3.npz e scripts de diagnóstico, sem dados reais.
- Retomada única criada para hoje às 9h (São Paulo), automação `retomar-copos-s-9h`, caso o limite interrompa o trabalho. Depende do computador/app abertos e limites disponíveis. Desativar ao concluir antes desse horário. Ainda não foi publicada nova release deste bloco.
- Retomado às 9h: três 3MF assinados em `%TEMP%/copos-assinatura-codex/assinados-v2` (relatório `assinatura.json`), caches em `pacotes-assinados-v2`, gerados com `--normalizados` para não repetir a escala do Copo 3. Comparação de altura, bounds, fechamento, orientação e volume concluída antes de copiar os seis assets para o repositório. Copo 2 exigiu preservar dobras coplanares e topologia da malha original, sem soldar globalmente seus vértices. Ver ledger do plano.
- A base de 0,2 mm do Copo 1 foi fundida ao acabamento até 1,5 mm; continua parte estrutural, sem lâmina de marca selecionável. Os conjuntos têm 6, 1 e 7 partes respectivamente; nenhuma parte dedicada à logo/textos. Cada assinatura retira 149,4814029 mm³ da superfície inferior; altura e superfícies de encaixe preservadas. Letras reforçadas em 0,15 mm por lado para melhorar impressão com bico de 0,4 mm. A confirmação física continua pendente.
- Botão compacto “Ver base” permite conferir a assinatura com iluminação inferior e grade oculta; “Ajustar à tela” restaura a vista normal. Capturas reais dos três fundos confirmaram logo oficial, textos eretos e os dois underscores, padrão preto/branco e atualização de cor ao vivo. Nenhum ID HTML duplicado. Dados, capturas e exportações usam somente pastas temporárias.
- Na validação real foi detectado travamento do Anycubic Slicer Next 2.0.0.3 ao importar a placa antiga de projeto sem perfis/miniaturas. Controles isolaram a falha: preservar partes/pintura, declarar produtor próprio e deixar o fatiador criar a placa resolve a importação. Exportador agora também ordena componentes antes do conjunto, recusa referências ausentes/circulares e não exporta recursos de outras placas. Autoria original é preservada. Teste novo falhou antes da correção e passou depois.
- Os **três 3MF exportados pela interface foram importados e regravados pelo Anycubic Slicer Next com saída 0**. Nova leitura dos arquivos do fatiador confirmou as mesmas contagens de partes (6/1/7), triângulos (1.847.952/2.477.767/2.351.555), altura de 145 mm e pintura preta da assinatura no rebaixo. Os três STL também conservaram altura, bounds e faces da marca em Z=0,2 mm. Relatórios temporários: `validacao-roundtrip-final.json`, `validacao-stl-final.json`. A marca não virou parte separada no fatiador.
- Revisão independente de geometria e código concluída sem novos erros confirmados após as correções. **259 testes npm e 11 testes Python passaram**. Script de construção recusa assinar novamente um asset já pronto e documenta dependências Python (não exigidas no aplicativo). Versão **0.38.0** preparada; publicação será registrada abaixo após a validação final e envio.
- `npm run dist` terminou com sucesso. Pacote empacotado confirmou “Versão 0.38.0”, vista da base e cores ao vivo em preto/branco, usando dados temporários. Instalador: 244.900.798 bytes; SHA-256 `9ddf90537dfcf1978acf83bbfc31ca7e754143a2de82b5e5bc58aab918d6ba80`. Blockmap e SHA-512 do `latest.yml` conferidos; manifest preservado em `release/v0.38.0/latest.yml`.

### Publicação concluída — v0.38.0

- **Publicada [v0.38.0](https://github.com/LiLPedroca/ferramentas3D/releases/tag/v0.38.0)** no commit `7c6562e733c1578e967ae7f17b0607a29e34571a`, enviado para `origin/electron`. Última release anterior reconferida: v0.37.1. Endpoint `releases/latest` e tag confirmaram versão mais recente, sem rascunho/pré-release, exatamente três arquivos em estado `uploaded` e SHA-256 do instalador igual ao pacote local validado.
- Fatiamento completo dos **três** arquivos exportados pela interface também terminou com **saída 0**, usando perfis locais Kobra X 0.4/PETG e dados temporários. Cada G-code tem 725 camadas e altura máxima de 145 mm; as ferramentas efetivamente usadas correspondem somente a preto/branco. G-codes com 45.221.779, 41.695.783 e 58.657.349 bytes. Relatório em `%TEMP%/copos-assinatura-codex/validacao-fatiamento-final.json`; caminhos da marca na camada 0,4 mm do Copo 1 conferidos visualmente. Nenhum G-code foi enviado à impressora.
- Bloco concluído e publicado. Automação de retomada `retomar-copos-s-9h` removida do aplicativo após a conclusão, evitando execução duplicada. Plano/ledger atualizado. Nenhum original, código antigo ou dado pessoal foi apagado.
- **Pendentes:** impressão real da assinatura e conferência física do encaixe, especialmente apoio/cavidade do Copo 3; River Plate e fileteado continuam adiados conforme pedido. A validação do fatiador desta etapa foi pela linha de comando; abrir pela janela e os demais ensaios físicos anteriores continuam sem conferência. Não há release pendente deste bloco.

## Trabalho do Codex (10/11/2026) — copos completos e impressão rápida

- Pedido autorizado com “comece” e reforçado com “finalize”: três copos completos sem peças para montar, nomes internos Copo 1/2/3, peso em gramas e impressão próxima de cinco horas. Plano em `docs/superpowers/plans/2026-11-10-copos-rapidos.md`; especificação correspondente em `docs/superpowers/specs/2026-11-10-copos-rapidos-design.md`.
- Três assets preparados como **um objeto, um mesh e uma parte pintada**, sem `components`, preservando altura de 145 mm, boca nominal de 81,4 mm, logo/site/Instagram na base e cores ao vivo. Copo 1: retirada a capa acessória “Drapeado branco com encaixe”, conforme pedido de deixar somente o copo; fechada a folga de montagem de 0,15 mm da argola por ligação dentro da parede, sem mudar a cavidade do alumínio. Nenhum original externo foi apagado ou alterado.
- Copo 2 conserva a malha e pintura nativas, retirando somente vértices sem uso e reorganizando o arquivo. A fonte possui uma componente indexada com todas as faces; o motor de geometria separa onze resíduos de volume inferior a 0,000001 mm³ ao avaliar dobras quase coplanares. Esse ruído de cálculo não foi confundido com acessórios físicos nem usado para modificar a superfície original.
- Copo 3: base/faixas/corpo unidos; sobreposição externa da borda superior ajustada em 1,0616 mm, conservando o lábio interno original por interseção radial até 41,26 mm. A primeira tentativa encurtava também o lábio e foi rejeitada antes da publicação. As seções internas finais em Z=139,6/140/140,5/140,8/144 mm diferem menos de 0,015 mm da referência na amostragem dos triângulos, mantendo altura total e boca. A reparametrização de 1.115 faces de pintura tem deslocamento máximo calculado de 0,39288 mm, limitado a 0,4 mm (abaixo da largura de extrusão de 0,42 mm do perfil). A assinatura inferior não sofreu esse transporte; é pintura uniforme sobre seu próprio rebaixo. Conferir aparência e encaixe físicos antes de produzir em quantidade.
- Exportação usa nomes do projeto nos objetos/títulos internos. O 3MF agora inclui perfil próprio completo Kobra X/PETG, preparado dos presets oficiais locais: densidade 1,23 g/cm³, diâmetro 1,75 mm, fluxo máximo 8 mm³/s, duas paredes, 15% de preenchimento, camada 0,28 e primeira camada 0,24 mm. Há somente dois filamentos, com as cores selecionadas. Não foram aumentados arbitrariamente fluxo ou velocidade para forçar uma estimativa menor.
- STL agora usa os índices da malha estrutural unida, sem transformar subdivisões virtuais de pintura em arestas estruturais. O código anterior de exportação foi preservado. O STL não armazena cores/perfil; usar 3MF para levar o perfil PETG ao fatiador.
- Menu inclui **“Exportar em multipartes — Em breve”**, desativado e sem ação, por pedido expresso do Pedro; essa exceção específica substitui a regra geral do AGENTS.md de não mostrar “Em breve”.
- Baseline: 259 testes npm passaram. Novos casos de exportação, nomes/perfil/STL e menu foram vermelhos antes da implementação e passaram depois; onze testes Python novos passaram. Uma execução completa posterior passou em 260 casos e estourou somente o limite agregado de 60 s do teste antigo de 29 fontes × 3 estilos (69,4 s). As mesmas 87 gerações foram mantidas, separadas por fonte, com uma verificação adicional do tamanho do catálogo; a repetição completa está em andamento neste registro.
- Assets e caches foram gerados e comparados em `%TEMP%/copos-rapidos-codex` antes de copiar ao repositório; referências da v0.38.0 preservadas também nessa pasta. Primeira conferência de impressão: Copo 1 fatiou com saída 0, usando somente o perfil incorporado, em **4h48m23s / 115,08 g totais de filamento**, altura máxima de 145 mm. Copos 2/3, capturas finais e publicação v0.39.0 ainda em validação neste registro; registrar conclusão abaixo quando confirmadas.
- Validação final de código: **290 testes npm e 22 testes Python passaram**. O aumento da contagem npm inclui a separação do antigo teste agregado de fontes; suas 87 gerações/verificações foram mantidas. Revisão independente sem novos erros confirmados, incluindo a correção de STL e o tratamento dos resíduos numéricos do Copo 2.
- Capturas reais confirmaram os três copos, assinatura legível com os dois underscores, preto/branco inicial, mudança de cor ao vivo, menu Em breve desativado e nenhum ID duplicado. Miniaturas atualizadas. As seis exportações efetivas (STL/3MF) foram comparadas: meshes e perfis iguais aos arquivos usados no fatiamento; STL estrutural com 1.573.284 / 1.751.074 / 394.796 faces e altura de 145 mm. Aplicativo empacotado confirmou Versão 0.39.0 e cores ao vivo.
- Fatiamento completo no Anycubic Slicer Next, sem fornecer presets externos, terminou com saída 0 nos três. **Copo 1: 4h48m23s / 115,08 g; Copo 2: 5h25m05s / 126,03 g; Copo 3: 6h15m40s / 151,41 g.** São estimativas totais do fatiador, incluindo filamento de purga, não tempo/peso medidos numa impressão real. Todos têm 518 camadas, altura máxima de 145 mm e duas cores efetivamente usadas. O Copo 3 ficou mais rápido que os 7h35 anteriores, mas **ainda acima da meta aproximada de cinco horas**; otimização adicional continua pendente. Não foi aumentado o fluxo nem reduzido o preenchimento para forçar esse número.

- Conferência adicional antes da publicação: preservado o lábio interno da borda do Copo 3; teste geométrico novo falhou na versão que o encurtava e passou após restaurá-lo. Pintura subdividida de cor uniforme agora é reduzida à mesma cor, sem transporte desnecessário; pintura multicolorida continua limitada a 0,4 mm. Revisão independente destes ajustes sem erro confirmado. Novo cache, fatiamento e instalador substituem os ensaios intermediários descritos acima; conclusão registrada após terminarem.

- Resultado definitivo do Copo 3 após conservar o lábio interno: **6h17m53s / 152,31 g**, 518 camadas e 145 mm no Anycubic. Substitui o ensaio intermediário de 6h15m40s/151,41 g. Relatórios temporários: `validacao-encaixe-borda3.json`, `validacao-fatiamento-copo3-corrigido.json`. Copos 1/2 mantêm 4h48m23s/115,08 g e 5h25m05s/126,03 g.

- Após a correção final da borda: **24 testes Python e 290 testes npm passaram** (suíte npm em 148,13 s, 33 arquivos). A rodada anterior, concorrente à regeneração pesada, passou em 289 casos e excedeu apenas a verificação antiga de desempenho do vetorizador (10,1 s contra 8 s); nenhum limite/asserção desse teste foi alterado. Repetição completa após terminar as tarefas pesadas passou. Novo instalador 0.39.0 em geração com o asset corrigido.

- Aplicativo empacotado final terminou com saída 0; captura `empacotado-039-final.png` conferiu logo/site/Instagram com dois underscores no Copo 3, padrão preto/branco, cores ao vivo e multipartes desativado. Exportações finais desse aplicativo comparadas à fonte fatiada: mesh e perfil idênticos, STL com 394.796 faces e 19.739.884 bytes. Relatório `validacao-exportacao-final3.json`.

- `npm run dist` final terminou com saída 0. Instalador final: **247.967.884 bytes**, SHA-256 `3f6d3ff34cdf476875488e40296ab8b5149a884459878537b1078a82617009b0`; blockmap de 259.395 bytes e SHA-512/tamanho do `latest.yml` conferidos. Manifest preservado em `release/v0.39.0/latest.yml`. Última release reconferida antes de publicar: v0.38.0; branch electron sincronizada, sem alterações remotas concorrentes.

### Publicação concluída — v0.39.0

- **Publicada [v0.39.0](https://github.com/LiLPedroca/ferramentas3D/releases/tag/v0.39.0)** no commit `5c1e2329580f63b09b237129cf998976661742f5`, enviado para `origin/electron`. Endpoint `releases/latest` confirmou a versão, sem rascunho/pré-release, com exatamente os três arquivos em estado `uploaded`. Tamanhos e digests SHA-256 do instalador, blockmap e latest.yml iguais aos arquivos locais validados.
- Resultado final: somente copos completos em uma malha/objeto, assinatura integrada, cores ao vivo, nomes internos corretos, perfil PETG/gramas no 3MF e opção de multipartes desativada “Em breve”, conforme pedido. Usar **3MF** para levar cores e perfil; STL contém somente geometria.
- Estimativas finais Kobra X 0.4/PETG: **Copo 1 4h48m23s / 115,08 g; Copo 2 5h25m05s / 126,03 g; Copo 3 6h17m53s / 152,31 g**. Incluem purga; não são medições físicas. O Copo 3 ainda não atingiu a meta aproximada de cinco horas.
- **Pendentes:** otimização adicional do tempo do Copo 3 sem comprometer paredes/encaixe, impressão física da assinatura, conferência física do encaixe do alumínio (especialmente no Copo 3) e demais testes físicos anteriores. River Plate/fileteado continuam adiados. Nenhum original externo, dado real ou arquivo de código legado foi apagado. Não há release pendente deste bloco.

## Trabalho do Claude Code (11/11/2026) — Copo 1 completo restaurado e multipartes (v0.40.0)

- Retomado o trabalho iniciado pelo Codex em 10–11/11. Plano/ledger em `docs/superpowers/plans/2026-11-10-copo1-restauracao-multipartes.md`; especificação em `docs/superpowers/specs/2026-11-10-copo1-restauracao-multipartes-design.md`.
- **Copo 1 completo:** o “Drapeado branco com encaixe” voltou ao copo (pedido do Pedro), unido ao corpo por união booleana sem ponte nova. `preparar_copos_completos.py` deixou de retirá-lo. Validação: malha fechada e orientada, um corpo (4 resíduos numéricos de volume ~0), altura 145 mm, 1.880.316 faces todas pintadas, drapeado 100% branco. Na base assinada, 23 facetas microscópicas (0,0078 mm² no total) foram retrianguladas; 11 de 92.562 vértices se deslocaram mais de 0,00002 mm, máximo 0,0045 mm. Relatório em `%TEMP%/copo1-restauracao-codex/completo-restaurado/restauracao-verificacao.json`. Cache `1.bin.gz` regenerado do mesmo 3MF; miniatura `1.png` nova.
- **Multipartes (só Copo 1):** novo asset `1-multipartes.3mf`, cópia assinada do projeto nativo com três placas (base, argola, tubo), encaixes e texto editável “PERSONALIZE AQUI” preservados; somente a primeira lâmina da base foi fundida ao acabamento para levar a assinatura. Botão “Exportar em multipartes” habilita no Copo 1 quando carregado e desabilita durante carga/exportação; Copos 2/3 continuam “Em breve”. `colorir3mfMultipartes` aplica as cores escolhidas sem mexer em placas/miniaturas. IPC `copos:multipartes` aceita só o id 1.
- **Branco dentro da logo (relato do Copo 2):** causa confirmada no G-code — 117 mm de caminhos brancos dentro da logo, todos do brim automático na primeira camada; sem brim, 0 mm. Perfil dos copos passou a `brim_type: no_brim` (os três 3MF foram reempacotados só com o perfil novo; geometria dos Copos 2/3 inalterada).
- Testes: 293 npm e 27 Python passaram. Captura real (dados temporários): versão 0.40.0, drapeado visível, cores ao vivo nos três, multipartes habilitado só no Copo 1, nenhum ID duplicado; quatro exportações salvas.
- Fatiamento pela linha de comando (Anycubic Slicer Next, perfil embutido, `--datadir` temporário), saída 0, sem brim:
  - **Copo 1 completo: 8h02m55s / 185,69 g** (101,43 + 84,26), 145 mm. Bem acima das 4h48m/115 g da v0.39.0, que não tinha o drapeado.
  - **Copo 1 multipartes: 5h12m55s / 118,18 g** somando as placas (base 2h43m29s / 57,65 g; argola 24m00s / 8,95 g; tubo 2h05m26s / 51,58 g).
  - Copos 2/3 não foram fatiados de novo nesta etapa.
- **Pendentes:** impressão física do drapeado, da assinatura e dos encaixes do multipartes; conferir se o tempo de 8 h do completo é aceitável (o multipartes é a opção mais rápida); abrir pela janela do fatiador; demais pendências físicas anteriores.

## Trabalho do Claude Code (11/11/2026) — Etiquetas retirado (v0.41.0)

- A pedido do Pedro, a ferramenta **Etiquetas** saiu da interface: catálogo (`core/ferramentas.js`), `TELAS` (`shell.js`), bloco `tela-etiquetas` do `index.html`, inicialização no `app.js` e lista do `tests/inicio.test.js`. Um id antigo (`etiquetas`) cai na tela inicial.
- **Mantidos sem uso, aguardando o Pedro decidir se apaga:** `src/core/etiquetas.cjs`, `src/renderer/etiquetas-tela.js`, `tests/etiquetas.test.js`, canal IPC `etiquetas:pdf` (`main.cjs`), `window.dados.etiquetas` (`preload.cjs`), ícone em `icones.js` e CSS `/* Etiquetas */` em `styles.css`. Nenhum dado do usuário é afetado (etiquetas não tinha cadastro próprio).
- 293 testes npm passaram; captura confirmou versão 0.41.0, nenhuma menção a etiquetas na tela e nenhum ID duplicado.
- Drapeado novo do Copo 1: aguardando o Pedro mandar o que quer e dizer “comece”.

## Trabalho do Claude Code (11/11/2026) — categorias, Meu fatiador, novidades, Palavras retirado (v0.42.0)

- Pedido do Pedro com "comece", copiando o programa antigo "Criae3D Utilities" (prints). Lista completa e especificação do financeiro ficaram na memória do Claude Code; o bloco Calculadora/Orçamentos/Gestão financeira vem na próxima versão.
- **Palavras decorativas** saiu da interface (catálogo, `TELAS`, tela do `index.html`, `app.js`, `tests/inicio.test.js`). Arquivos mantidos (`palavras-tela.js`, `modelos/palavras.js`, testes). Modelos de palavras salvos em Meus modelos continuam guardados; sem a ferramenta, o cartão mostra só "Excluir".
- **Categorias em Produtos:** lista `categorias` nas configurações (única sem diferenciar maiúsculas/acentos, até 100, entra no backup). Botão "Categorias" cria e remove (só categoria sem produtos). No cadastro, a categoria é escolhida numa lista, com "+ Nova categoria…". Categorias digitadas em produtos antigos aparecem na lista.
- **Meu fatiador:** `fatiadores` (até 20) + `fatiador` ativo nas configurações; configuração antiga vira lista com o ativo. Janela no modelo do programa antigo: cartões com ícone do .exe (`app.getFileIcon`, canal `fatiador:icone`), troca do ativo pelo rádio, "Abrir <ativo>", "Localizar automaticamente" e localizar manualmente (nome + "Selecionar executável…"). O botão do topo abre essa janela.
- **Aviso de novidade** (`core/novidades.js`): aparece uma vez ao abrir a tela que mudou, para quem já usava antes da versão da mudança (`primeiraVersao` gravada na primeira abertura; usuários existentes contam como 0.0.0). "Não mostrar novamente" grava `ocultarNovidades`. Primeiro aviso: categorias em Produtos.
- 300 testes npm passaram. Captura com dados temporários conferiu aviso, categorias (sem duplicar), criação pelo cadastro, filtro, janela do fatiador com OrcaSlicer e Anycubic encontrados, sem IDs duplicados.

## Trabalho do Claude Code (11/11/2026) — Calculadora, Orçamentos em etapas e Gestão financeira (v0.43.0)

- Recriação, a partir dos prints e da especificação do Pedro, das telas do programa antigo "Criae3D Utilities" 0.16.0.
- **Configurações** com seções: Dados da calculadora (padrões e "Quanto custou sua impressora?"), Dados do orçamento (empresa com endereço e logo PNG/JPG até 2 MB, condições padrão, formas de pagamento, frete, descrição complementar, campos do PDF, nome do arquivo, próximo número) e Geral (nome, fatiador, pasta de dados). Alterações de orçamento/empresa são parciais (não apagam o que não foi enviado).
- **Calculadora:** padrões vêm das configurações ("Novo cálculo" recarrega), nome da peça, "Adicionar ao orçamento" e "Salvar em Meus produtos". Cada envio guarda a cópia do cálculo (`core/calculo-salvo.cjs`: peso, quantidade, preço do filamento, tempo, consumo, tarifa, uso da impressora, mão de obra, % e custos em centavos).
- **Orçamentos em 4 etapas** (`orcamentos.js` reescrito; a tela `orcamento` separada saiu): Cliente (cadastrado ou manual, nome e telefone obrigatórios para finalizar, número editável e único), Produtos (catálogo com foto, calcular, manual, "Salvar produto"), Condições (desconto/frete, formas, sinal em R$ ou % sobre o total com desconto, entrega, validade, prazo), Finalizar (campos do PDF, nome automático "Orçamento - Cliente - DD-MM-AAAA.pdf" ou manual). Prévia do PDF ao vivo (mesmo HTML do PDF, em shadow DOM com folha construída, sem afrouxar a CSP). Rascunho automático em `rascunho-orcamento.json`. Histórico recolhível embaixo. Novas situações: "finalizado"; "recusado" aparece como "Cancelado".
- **PDF** novo no modelo do antigo (quadros, logo, "Criado em/Válido até", sinal e saldo, "Página X de Y" no rodapé do Electron). CSP do PDF ganhou `img-src data:` só para a logo.
- **Gestão financeira** (`core/financeiro.cjs`, `main/financeiro.cjs`, `financeiro-tela.js`): coleções `vendas` (pagamentos dentro da venda, gravados juntos) e `despesas`, ambas no backup. Painel com período (30/90 dias/tudo), Vendas, Recebido, Despesas, A receber (histórico todo), Lucro (valor − frete − custo; vendas sem custo ficam fora e são contadas, nunca como zero), saldo de caixa, gráfico diário, saldos pendentes, vendas do período, registros recentes, ações rápidas e checklist de 6 etapas. Vendas abrem em abas internas com produtos, custos, "Ver cálculo utilizado", pagamentos, "Registrar pagamento" (bloqueado quando quitada; nada acima do saldo) e produção independente. "Novo registro": venda, recebimento ou despesa. Venda com recebimentos não pode ser excluída.
- **Finalizar orçamento** abre "O cliente já pagou?" (não pagou / sinal ou parcial / integral) e cria ou atualiza a venda ligada; salvar de novo reaproveita a venda e só registra a diferença. "Responder depois" deixa o orçamento na **revisão**: aviso no financeiro e nos orçamentos; cada orçamento antigo sem venda (fora rascunhos e cancelados) é revisado como pendente/parcial/quitado, ligado a uma venda manual de mesmo valor ou marcado "Não virou venda" (cancelado). Nada é presumido como pago.
- **Backup:** restaurar um backup de versão antiga (sem `vendas`/`despesas`) não apaga essas coleções (`ausentes` no `lerBackup`).
- Clicar em "Gestão financeira" (início e menu) abre o painel (`tela` no grupo). Avisos de novidade para Calculadora, Orçamentos e Financeiro.
- Testes: 320 npm passaram (novos: financeiro, serviço financeiro com backup, sinal/numeração, PDF, configurações). Captura com dados temporários conferiu o fluxo completo: padrões da calculadora → item no orçamento → prévia → sinal 30% → finalizar → venda parcial → pagamento acima do saldo recusado → quitação → despesa → caixa; PDF real gerado e conferido; revisão com cancelamento; sem IDs duplicados.
- **Não conferido:** uso com os dados reais do Pedro (orçamentos antigos dele vão aparecer na revisão, como pedido); impressão do PDF em papel; cor de destaque configurável e Liquid Glass ficaram de fora (dúvida em aberto). "Catálogos" continua com o nome "Produtos".

## Trabalho do Claude Code (11/11/2026) — dados de teste (v0.44.0)

- **Cliente Teste e Peça teste** (`core/dados-teste.cjs`, `main/dados-teste.cjs`): ids fixos `cliente-teste` e
  `produto-teste`, marcados com `teste: true` (a marca continua ao editar). Dados claramente falsos.
  Criados uma vez na primeira abertura (`configuracoes.dadosTesteCriados`); se o Pedro excluir, só voltam
  pelo botão "Recriar cliente e produto teste" (Configurações > Geral > Dados de teste).
- **Orçamento de teste** = orçamento do cliente de teste (`teste: true`, decidido no `main/orcamentos.cjs`).
  Numeração própria começando em 1 ("Teste #0001", "Nº T-0001" no PDF); não gasta a numeração real nem o
  `proximoNumero`. Trocar entre cliente real e de teste dá um número novo do outro grupo.
- **PDF**: marca d'água "TESTE" (`.marca-teste`, `position: fixed` para repetir nas páginas) e arquivo
  "TESTE - Orçamento - ...pdf".
- **Financeiro**: venda de teste (`teste: true`) fica fora de indicadores, gráfico, caixa, saldos pendentes,
  registros recentes, revisão e checklist; aparece na tabela de vendas com a etiqueta "Teste".
- **"Limpar testes"**: apaga só orçamentos e vendas com `teste: true` (com os pagamentos), pede confirmação.
- Testes: `tests/dados-teste.test.js`. Conferido no modo de captura (orçamento de teste, PDF real, pagamento,
  painel zerado, limpar).

## Trabalho do Claude Code (11/11/2026) — frete, divisão do pagamento, filamentos retirado (v0.45.0)

- **Orçamentos, etapa Condições**: o Frete fica sempre visível; só o Desconto continua atrás de
  "Aplicar / editar desconto" (`o-desconto-campo`).
- **Linha do item com "Remover"**: a célula `.item-acoes` usava `display: flex`, que tirava a célula da tabela
  e desalinhava a borda. Agora é célula normal com `white-space: nowrap`.
- **Divisão do pagamento** (`renderer/divisao-pagamento.js`, `divisaoDe` em `core/financeiro.cjs`): com duas ou mais
  formas marcadas, aparece um valor por forma, o total distribuído e quanto falta. Confirmar só fica ativo quando a
  soma bate com o valor que entra AGORA (na janela do orçamento: "quanto já pagou no total" menos o já registrado).
  O pagamento guarda `divisao: [{ forma, valorCentavos }]` (mesma ordem de `formas`). Pagamentos antigos com várias
  formas sem divisão continuam válidos; novos exigem a divisão. Vale para "O cliente já pagou?" e "Novo registro".
- **Estoque de filamentos saiu da interface** (catálogo, `TELAS`, `app.js`, HTML da tela e dos diálogos, atalho do
  financeiro). A escolha de rolo na Calculadora fica escondida. Dados (`filamentos.json`), backup e arquivos
  (`filamentos-tela.js`, `core/filamento.cjs`, `main/filamentos.cjs`) continuam. Apagar só se o Pedro pedir.
- Regra nova do Pedro: toda ferramenta nova ou alterada ganha aviso de novidade (`core/novidades.js`).

## Trabalho do Claude Code (11/11/2026) — Minhas Impressões (v0.46.0)

- Ferramenta nova no grupo Ferramentas: **Minhas Impressões** (tela `impressoes`). Biblioteca dos arquivos que o Pedro
  imprime (STL, 3MF, OBJ, PLY), com miniatura, peso, tempo, material, cor, camada, preenchimento, suporte, perfil,
  observações, foto, "vezes impressa" e "última impressão".
- Modelo `core/impressao.cjs`; serviço `main/impressoes.cjs` (coleção `impressoes.json` + arquivos em
  `<dados>/impressoes/<id>.<ext>`, nunca alterados). Arquivo repetido é recusado pelo SHA-256. Excluir tira da lista e
  MOVE o arquivo para `impressoes/excluidos` (não apaga).
- Tela `renderer/impressoes-tela.js` + `renderer/impressoes-arquivo.js` (geometria para a prévia 3D; no 3MF lê a
  miniatura `Metadata/plate_1.png` e, se fatiado, peso/tempo de `slice_info.config`). Sem miniatura, gera uma com a
  prévia 3D escondida (`.im-render-oculto`, WebP).
- Botões: Ver no Visualizador 3D (`abrirArquivoNoVisualizador` em `viewer3d.js`), Abrir no fatiador (IPC
  `impressoes:fatiador`, abre uma CÓPIA na pasta temporária), Calcular custo (`preencherDoModelo` agora aceita
  `tempoMin`), Criar produto, Marquei que imprimi.
- **Backup**: coleção `impressoes` no JSON. Exportar também copia os arquivos para a pasta
  "<nome do backup> (arquivos)" ao lado do .json. Restaurar devolve os arquivos que faltam (da pasta do backup ou de
  `excluidos`), sem sobrescrever. Backup antigo sem `impressoes` não apaga as impressões.
- Aviso de novidade `impressoes-nova` (0.46.0). Testes: `tests/impressoes.test.js`.

## Correção (11/11/2026) — v0.46.1

- A v0.46.0 criou a janela de Minhas Impressões com o id `dialogo-impressao`, que já era o da pergunta
  "Como você vai imprimir?" (`modelos-ui.js`). Como a nova vinha antes no HTML, "Salvar 3MF" e "Abrir no fatiador"
  dos modelos abriam a janela errada. Renomeada para `dialogo-minha-impressao`.
- Teste novo `tests/html-ids.test.js`: falha se o `index.html` tiver id repetido.

## Trabalho do Claude Code (11/11/2026) — Chaveiro de nome: símbolo e vários nomes (v0.47.0)

Pedido de uma cliente: um chaveiro por funcionário, com o nome e o símbolo da empresa (estilo Contorno).

- **Símbolo** (`opcoes.simbolo = { lado, dx, dy, tamanho, relevo }` em `modelos/chaveiro.js`): imagem vetorizada por
  cores com o mesmo vetorizador do Chaveiro de logo (`vetorizar` + `coresDoSvg`). A base contorna nome + símbolo; as
  cores listadas em `relevo` sobem com o texto (na cor do texto), as outras ficam só na base. Posição: um lado
  (esquerda/direita/acima/abaixo) + deslocamento em alturas do nome, arrastável na prévia 2D (moldura laranja,
  `aoSoltarSimbolo` em `previa2d.js`). Tamanho em % da altura do nome. Ao importar, sobem em relevo as cores mais
  próximas da cor do texto do que da base. Meus modelos guarda a imagem do símbolo (`projeto.imagem` agora vale
  também para "chaveiro").
- **Vários nomes** (seção "Vários nomes"): um nome por linha; "mesma largura total" ou "mesma altura de letra"
  (`gerarChaveiroComLarguraDoTexto` + `larguraNaFonte`). Mostra tamanho e peso de cada um e o total.
  `arrumarNaMesa` (prateleiras na mesa 260 × 260 da Kobra X) e `gerar3mfVarios` (um objeto por nome, placas no
  `model_settings.config`, pausas em todas as placas). Origem das placas como no Orca/Anycubic:
  grade com passo de 1,2 × a mesa (`origemDaPlaca`), conferido num 3MF salvo pelo próprio fatiador.
- **Armadilha**: o Anycubic Slicer Next FECHA (segfault) ao abrir um 3MF com `plater_name` preenchido. Deixe vazio.
- **Fatiar pela linha de comando**: para 3MF que não vem do Bambu/Orca, o CLI rearruma as peças sozinho. Use
  `--arrange 0` para conferir as posições. Conferido: 45 nomes → placa 1 com 27 e placa 2 com 18, M600 a 2,6 mm nas
  duas; 5 nomes salvos pela tela → 5 objetos, M600 a 2,6 mm, 9,7 g, 32 min.
- Não conferido: abrir o 3MF de várias placas pela JANELA do fatiador (se ela rearruma ou mantém as posições).

## Trabalho do Claude Code (12/11/2026) — fotos HEIC (v0.48.0)

- O Chromium não abre HEIC. O processo principal decodifica com `heic-decode` (libheif em WASM, dependência nova)
  em `main/heic.cjs`, canal `imagens:heic`, `window.imagens.heicParaRgba` no preload. Devolve RGBA.
- Tela: `renderer/imagem-arquivo.js` (`abrirImagem` → ImageBitmap, `arquivoLegivel` → HEIC vira PNG,
  `jpegDoHeic`). Reconhece HEIC pelos bytes (`ehHeic` em `core/metadados.js`), porque no Windows o arquivo às
  vezes chega sem tipo. AVIF fica de fora (o Chromium já abre).
- Aceitam HEIC: foto de Produtos, foto de Minhas Impressões, Conversor SVG, Chaveiro de logo, símbolo do Chaveiro
  de nome, emblema da Caneca, logo da empresa em Configurações (HEIC até 20 MB, sai PNG) e Detector.
- Detector: lê EXIF/XMP/C2PA do HEIC (itens `Exif`/`mime` via `iinf` + `iloc`). A cópia sem metadados de um HEIC
  sai em JPEG (`limparImagem` recusa HEIC de propósito).
- Novidade "Fotos HEIC do iPhone" em cada uma dessas telas. Teste `tests/heic.test.js` com fotos geradas por
  script (`tests/dados/foto-teste.heic`, câmera e GPS fictícios). Conferido no modo de captura e no programa
  empacotado. Não conferido: foto HEIC real de iPhone (só as geradas pelo libheif).

## Trabalho do Claude Code (12/11/2026) — Início, menu, Produtos, Impressões, Voltar, backup .zip (v0.49.0)

- **Modo escuro preto**: variáveis de `html[data-theme="escuro"]` em cinzas neutros (#0a0a0a/#141414/#1c1c1c,
  borda #2b2b2b); mesa e grade do 3D (`viewer3d.js`, `previa3d.js`) também neutras. Acento azul mantido.
- **Início**: 4 cartões (3 grupos + `DESTAQUES` em `core/ferramentas.js`, hoje só Minhas Impressões, que abre a
  ferramenta direto). Fotos novas feitas pelo GPT a pedido do Pedro (`assets/grupo-*.jpg`, 900 px; originais em
  `dev/fotos-inicio/`, fora do git). Painel do cartão começa a 52% da altura (todos alinhados).
- **Menu**: só abre no ☰ (Pedro não quer menu fixo). Destaques soltos no topo; grupos recolhíveis
  (`menu-secao`), ao abrir o menu fica aberto só o grupo da tela atual. Nomes curtos no menu (`curto` no catálogo).
- **Voltar**: histórico em `shell.js` (`historico`, `lembrarAoVoltar(fn)`). Voltar refaz o caminho; sem histórico
  usa o `pai`. Ir ao Início zera. Minhas Impressões usa `lembrarAoVoltar` para reabrir a janela da impressão ao
  voltar de Criar produto / Calcular custo / Visualizador.
- **Botão Meu fatiador**: mostra o ícone do fatiador ativo (`app.getFileIcon`), atualiza ao mudar a config.
- **Produtos**: título "Seus produtos"; busca, categoria, ordenar (recentes/nome/preço/lucro) e grade/lista
  (preferências em localStorage); cartão com Venda (azul) | Lucro (verde) e Custo; menu ⋯ Editar/Duplicar/Excluir;
  rodapé "Mostrando X de Y". Classes `pv-venda`/`pv-lucro` (existe um `.lucro` global no CSS).
- **Minhas Impressões**: janela só com Nome, Categoria, Peso, Tempo, Material (lista: PLA, PLA Silk, PETG, ABS,
  TPU; valor antigo digitado continua como opção) e Cor (14 cores para tocar, várias: `cores` = ids, `cor` = nomes)
  + foto. Camada, preenchimento, suporte, perfil e observações saíram da tela, mas `montarImpressao` mantém os
  valores guardados quando não vêm. `coresDoTexto` reconhece texto antigo ("preto e branco").
- **Backup em um .zip** (`main/backup-zip.cjs`, fflate em streaming, dependência direta agora): `dados.json` +
  `impressoes/<nome> [<id>].<ext>`. Restaurar: escolher ou arrastar o .zip (preload usa `webUtils.getPathForFile`);
  extrai para uma pasta temporária, apagada depois. `.json` antigo com a pasta "(arquivos)" continua aceito.
  A cópia diária automática NÃO copia os 3MF/STL: eles nunca são reescritos e os excluídos vão para
  `impressoes/excluidos`, de onde `recuperarArquivos` já os traz de volta.
- Conferido: 356 testes; capturas de Início, menu, Produtos (grade/lista, Duplicar), Impressões (material/cores,
  Voltar reabre a janela), backup .zip gerado e restaurado numa pasta de dados vazia, programa empacotado gerando o
  .zip. Não conferido: arrastar o .zip de verdade com o mouse; restaurar em outro computador.

## Correção (12/11/2026) — 3D em computadores sem placa de vídeo utilizável (v0.49.1)

- No PC de um amigo do Pedro a prévia mostrava "THREE.WebGLRenderer: Error creating WebGL context." (em inglês).
- `main.cjs`: `enable-unsafe-swiftshader` sempre ligado, então o Chromium desenha o WebGL por software quando a GPU
  falha. Conferido com `FERRAMENTAS_SEM_GPU=1` (simula sem GPU): renderer "SwiftShader", copo aparece.
- `renderer/modelos/webgl.js`: `criarRenderizador()` (null se falhar) e `mostrarSem3d()` com aviso em pt-BR.
  `previa3d.js` devolve uma prévia que não faz nada (`sem3d: true`) e o resto da tela segue; o Visualizador mostra
  o aviso e recusa abrir arquivos. Teste `tests/sem-3d.test.js` (happy-dom não tem WebGL).
- `FERRAMENTAS_SEM_GPU=sem-3d` tenta desligar o WebGL de vez, mas com o SwiftShader ligado o Chromium continua
  dando WebGL: o aviso só foi conferido pelo teste automático.
- Não conferido no PC do amigo.

## Trabalho do Claude Code (12/11/2026) — Criador de logos (v0.50.0, só no PC do Pedro)

- **A partir daqui não há release automática**: o Pedro instala o `.exe` de `electron/release/` e só depois de
  aprovar a gente faz push + `gh release create`. Commits ficam locais até lá.
- O **Chaveiro de logo virou Criador de logos** (mesma tela `logo`, mesmo tipo `logo` em Meus modelos).
- `renderer/modelos/mapa-logo.js`: a imagem (até 512 px) vira um mapa de pixels com uma das 13 cores prontas
  (`CORES` de `core/impressao.cjs` sem Transparente) ou vazio.
  - `mapaAutomatico`: paleta (`escolherPaleta`), fundo pela cor da borda (`corDoFundo`), opção de tirar também o
    fundo de dentro do logo ou só o ligado à borda, cor pronta mais próxima (distância "redmean") e
    `limparSerrilhado` (pixel com < 3 vizinhos iguais vira a cor mais comum em volta; tira contornos de meio-tom).
  - Edição: `pintarTraco`/`pintarDisco` (borracha = vazio, restaurar = volta ao automático, pincel = cor) e
    `encher` (varinha = vazio, balde = cor) na região ligada da mesma cor.
  - `svgDoMapa`: camadas empilhadas como no vetorizador, cobertura suavizada (1-2-1) antes do marching squares.
- `logo-tela.js` reescrito: modo "Editar" na prévia (ferramentas, tamanho, cores do pincel, desfazer/refazer com
  Ctrl+Z/Ctrl+Y, roda = zoom, botão direito = arrastar). Cores achadas em chips; tocar troca a cor no logo todo.
  Mudar o número de cores ou o fundo refaz o recorte e pergunta antes se houver correções à mão.
- Argola opcional (`comArgola` em `modelos/logo.js`); sem argola a malha da base chama "Base".
- Cor da base também só nas cores prontas. Meus modelos guarda o mapa como PNG (`opcoes.mapaPronto`); modelos
  antigos (sem `mapaPronto`) refazem o recorte automático a partir da imagem guardada.
- Pergunta "Como você vai imprimir?": "Com AMS" (tirado o "ou ACE").
- Conferido: testes (`tests/mapa-logo.test.js`), captura com logo de teste (varinha tirou a sujeira, balde trocou a
  cor, desfazer, sem argola, salvar e reabrir em Meus modelos, 3D). Não conferido: logos reais do Pedro, imprimir.

## Trabalho do Claude Code (12/11/2026) — Criador de logos de cara nova (v0.51.0, só no PC do Pedro)

- Pedro reclamou do v0.50.0: editar num PNG à parte não servia (queria corrigir na peça), bordas com ondas, branco
  sumindo no escudo (fundo branco + "tirar fundo de dentro" ligado) e não gostou da barra de número de cores.
- **Tela nova** (desenho do GPT aprovado pelo Pedro, sem a engrenagem): barra do projeto (nome com lápis para
  renomear, selo "Salvo" / "Alterações não salvas" / "Não salvo", "Salvar projeto", "Exportar 3MF" com seta para
  STL); painel "Personalizar" com abas 1 Logo / 2 Base / 3 Argola; prévia grande com 2D/3D e zoom flutuantes;
  barra de situação (estado, dimensões, peso, número de cores, Calcular custo, Abrir no fatiador).
  "Salvar projeto" grava direto com o nome da barra (sem a janela de nome).
- **Cores-alvo** (`mapa-logo.js`): `mascaraDoFundo` (só o fundo ligado à borda; "Remover áreas internas" agora
  vem DESLIGADO), `coresAutomaticas` (paleta de 10, cada grupo vira a cor pronta mais próxima, tons de borda e
  manchas ínfimas ficam de fora), `mapaPorAlvos` (cada pixel vai para o alvo com a cor ORIGINAL mais perto).
  Chips com "×" (tira; pixels vão para a cor mais parecida) e "+ Cor" (painel com as 13 cores). Tocar no nome do
  chip troca a cor pronta daquela parte.
- **Correção à mão direto na peça**: "Corrigir imagem manualmente" mostra a barra de ferramentas por cima da prévia.
  2D: `previa2d.paraModelo`; 3D: raycast (`previa3d.pontoNaPeca`) + o canto da peça antes de `posicionarNaOrigem`.
  mm → pixel do mapa por `coresDoSvg(...).quadro` e `gerarLogo(...).escalaArte`. Máscara `manual`: o que foi
  corrigido não muda quando cores/limpeza mudam (Restaurar desmarca). No 3D, com a correção ligada, o botão
  esquerdo pinta e o direito gira (`modoPintura`). Prévia 2D ganhou arrastar (botão direito/meio) e zoom no cursor.
- **Qualidade**: borda com fração de pixel pelo meio-tom da imagem original (`campoDaCamada`), sem o desvio para
  fora do método antigo (círculo de teste: erro médio 0,36 px → 0,05 px). Mapa de até 800 px (imagem pequena é
  ampliada com suavização; aviso abaixo de 600 px). Aceita SVG (desenhado direto no tamanho do mapa).
- Velocidade: laços sem alocação, marching squares só nas células de borda, Douglas-Peucker (0,1 px) antes do
  Manifold (`reduzirLaco`) e a largura da arte anterior como chute em `gerarLogo`.
- Meus modelos: `opcoes.versao = 2` com `alvos` (id da cor + cor original), `removerFundo`, `areasInternas`; a imagem
  guardada é a ORIGINAL (no tamanho do mapa) e as correções vão no campo novo `correcoes` (PNG; magenta = apagado
  à mão; `core/projeto.cjs`, limite 1,5 MB). Modelos da v0.50 e antigos reabrem refazendo o automático.
- Início: painel dos cartões preso embaixo com altura mínima fixa; "Explorar" na mesma linha mesmo com título em 2 linhas.
- Conferido: 369 testes; captura com escudo de teste (Branco/Preto/Dourado achados, borracha no 2D, balde no 3D,
  Ctrl+Z/Ctrl+Y, painel + Cor, tema claro, janela estreita). Não conferido: logos reais do Pedro, imprimir.
- **v0.51.1** (Pedro testou o escudo do Santos: prévia vazia com "A ligação da argola ficou fina"): `prenderArgola`
  com posição automática tenta pontos vizinhos da borda (passos de 1,5% do perímetro, até 24 de cada lado) antes de
  desistir (vale também para o Chaveiro de nome). Se não couber em lugar nenhum, a tela mostra a peça sem argola,
  com o aviso, e não deixa exportar. Zoom do 3D mostrava "100000000%" sem peça: corrigido.
- **v0.51.2** (Pedro: "a borracha não remove"): o apagado à mão dentro do logo virava vazio no mapa, mas a base
  Contorno tapa os vãos de dentro (na cor da base). Agora `mascaraDeFuros` (apagado à mão + áreas internas
  removidas, `vazio = 2` em `mascaraDoFundo`) vai no SVG como camada `#ff00ff`, e `gerarLogo` tira esses furos da
  base e das cores do logo.

## Trabalho do Claude Code (14/11/2026) — Estoque de filamentos de volta (v0.52.0, só no PC do Pedro)

- Tela `filamentos` no grupo Ferramentas (catálogo, `TELAS`, `app.js`). Interface mínima pedida pelo Pedro:
  cadastro com Marca (lista: Sunlu, Masterprint, Voolt3D, Bambu Lab, Elegoo, Soleyin, Multfila), Material (PLA,
  PLA Silk, PETG, ABS, TPU), Peso do rolo, Preço do rolo e Cor (botões das 14 cores prontas).
- `core/filamento.cjs` reescrito: `{ marca, material, cor (id), pesoTotalG, restanteG, precoCentavos (do rolo),
  fechados, posicao (1 a 4 ou null) }`. `precoKgCentavos` = preço do rolo ÷ peso do rolo (500 g por R$ 60 =
  R$ 120/kg). `pesar` (balança − carretel), `abrirRoloNovo`, `planejarDesconto` (rolo da impressora com a cor →
  mesma cor e material → mesma cor), `corProntaDoHex`. O formato antigo (cor em texto, preço por kg) não é mais
  aceito; no PC do Pedro não havia `filamentos.json`.
- Serviço (`main/filamentos.cjs`): `descontarVarios` (tudo ou nada; negativo desfaz), `pesar`, `abrirRoloNovo`,
  `posicionar` (quem estava na posição sai). Configurações: `estoque.posicoes` (1 = sem AMS, 4) e
  `estoque.carretelG` por marca (guardado ao pesar).
- Tela: resumo (rolos, kg, R$ em estoque), "Na impressora" com as posições, filtros por material, cartões com barra,
  "Acabando" primeiro, menu ⋯ (Editar, Pesar na balança, Abrir rolo novo, Tenho mais um igual, Tirar um fechado,
  Excluir).
- Minhas Impressões: "Marquei que imprimi" desconta do estoque. 3MF fatiado: gasto de cada cor do
  `slice_info.config` (`filamentosDo3mf`); sem isso, o peso na cor da impressão (uma cor) ou no rolo da posição 1.
  Aviso com botão "Desfazer" (`mostrarAviso(texto, { duracao, acao })`).
- Calculadora: "Rolo do estoque" voltou; escolher preenche o R$/kg do rolo; "Usar o preço de Configurações" volta ao padrão.
- Abrir no fatiador (modelos): `faltaDeFilamento` avisa se alguma cor não tem rolo ou tem menos que a peça precisa
  (só quando há rolos cadastrados).
- Conferido: testes (`filamento.test.js`, `filamentos-3mf.test.js`), captura da tela, desconto multicor com Desfazer,
  Calculadora com R$ 120/kg. Não conferido: desconto a partir de um 3MF real do Anycubic Slicer Next (o formato do
  `slice_info` pode variar) e o aviso do fatiador na tela.

## Trabalho do Claude Code (16/11/2026) — 2D para 3D no lugar do Criador de logos (v0.53.0, só no PC do Pedro)

Desenho: `docs/superpowers/specs/2026-11-16-2d-para-3d-design.md`; plano: `docs/superpowers/plans/2026-11-16-2d-para-3d.md`.

- Mesma tela `logo`, novo nome "2D para 3D". Peça SEM BASE (`modelos/relevo.js`): cada região ligada de uma cor é
  uma parte, lado a lado, todas de z = 0. Altura padrão 3 mm (2 a 10, passo 0,2). Ilha < 1,5 mm² vai para a
  vizinha de maior contato (sem vizinha, some); resíduo numérico < 0,01 mm² some.
- Partição exata: cada camada do vetorizador cresce 0,05 (arte) para dentro das de baixo antes de recortar
  (`secoesPorCor`). Sem isso, a mesma divisa traçada em duas camadas gerava ~3.000 lascas e a peça levava minutos.
- A divisão em partes fica guardada (`particao`, só dados); trocar cor/altura de uma parte só refaz as malhas.
  A tela também guarda a vetorização (`versaoMapa`).
- Balão da parte (clique no 2D ou 3D): cores prontas, altura, "Todas desta cor"; desfazer cobre isso. As escolhas
  ficam guardadas por um ponto (pixel do mapa); a que cai fora de qualquer parte é descartada.
- Qualidade: mapa até 2000 px (imagem pequena ampliada até 4×), Bézier com erro 0,15 px, curvas amostradas a cada
  0,05 mm e simplificadas a 0,005 mm. Meio-tom: pixel que é mistura de duas cores do logo fica com uma delas (não
  vira uma terceira, ex.: cinza entre preto e branco virava dourado); mistura com o fundo encostada nele sai
  (`limparBordaDoFundo`), sem contorno branco.
- 3D: mesa da Kobra X (260 × 260, grade de 10 mm) e cotas X (vermelha) e Y (verde) com rótulos (`criarPrevia`
  com `mesa` e `cotas`; `cotasDaCaixa`).
- Exportar/Abrir no fatiador perguntam "Como você vai imprimir?". Sem AMS: degraus por cor (cor de maior área
  embaixo, faixa 1 = altura das partes, +1 mm por cor), tudo no filamento 1, M600 no começo de cada faixa.
- Argola opcional (desligada); entra na parte que mais toca. Saíram: base, borda, relevo, estilos, pincel, balde e
  as chaves de limpeza do fundo. Modelos antigos (versão 1/2) abrem sem base, com largura e argola deles (versão 3).
- Conferido: 411 testes; Santos (447 px) com 4 cores certas, 30 partes, ~4 s na captura; 3MF fatiado pela linha
  de comando: com AMS T0–T3 sem M600; sem AMS 3 M600 em 3,2/4,2/5,2 mm.
- Não conferido: impressão real; clique no 3D para abrir o balão (só no 2D por roteiro); ordem das cores sem AMS
  não é escolhida na tela (sempre maior área embaixo).

## Trabalho do Claude Code (16/11/2026) — Cores só no topo, abas, filamento pela posição e calculadora (v0.54.0, só no PC do Pedro)

- 2D para 3D com AMS: a cor de maior área é a base e sobe por baixo de todas as partes; as outras cores ficam só
  nas últimas 3 camadas (`TOPO = 0,6` em `modelos/relevo.js`). Santos fatiado: trocas só a partir de Z 2,6 (antes
  46 comandos T, agora 10). Sem AMS continua com degraus + M600.
- Abas "Peça" e "Personalizar" no painel do 2D para 3D. Saíram o link "Corrigir na peça", a barra de ferramentas
  de cima da prévia e o "Concluir". Abrir Personalizar liga a correção; Esc ou "Peça" desliga.
- Filamento de cada cor no 3MF = posição do rolo daquela cor em Estoque > Na impressora (`slotsDaImpressora` em
  `modelos-acoes.js`); cor sem rolo vai para uma posição livre. Motivo: o fatiador mostrava o branco em verde (a
  cor que o filamento 2 tinha no perfil dele). Gravar `filament_colour` no 3MF foi descartado: o Anycubic só lê a
  configuração de projeto de 3MF dele/Bambu e isso arriscaria trocar impressora e processo. Sem posições
  cadastradas, nada muda. Vale para o 2D para 3D, a caneca e os modelos que usam `salvarModeloComo`.
- Calculadora: caixinha "Lucro também sobre a mão de obra" (desligada por padrão, lembra a última escolha no
  navegador da tela). Painel mostra "Lucro (X% sobre R$ Y)" e "Preço do lote". Cálculo guardado leva
  `lucroNaMaoDeObra`; os antigos (sem o campo) eram com lucro sobre tudo.
- Não conferido: a janela do Anycubic abrindo com as cores certas (depende das posições do Estoque baterem com os
  filamentos do perfil do fatiador); impressão real das cores no topo.

## Trabalho do Claude Code (16/11/2026) — Relevo por cor, chaveiro, Trazer de volta (v0.55.0, só no PC do Pedro)

- Relevo por cor: em Cores, cada chip com "Relevo [−] N [+]" e o resultado em mm. `opcoes.relevos` =
  `{ "#hex": camadas }` (0 a 10, 0,2 mm cada); soma na altura das partes daquela cor depois das escolhas.
- Chaveiro: "Nenhum / Argola para chaveiro / Furo para chaveiro" (`opcoes.chaveiro`; `comArgola` antigo vira
  "argola"). "Tamanho do furo" (3 a 8 mm) vale para os dois; a parede da argola = max(2, furo/2). O furo atravessa
  a peça a 2 mm da borda (`furoEm`), procura outro ponto se não couber e pode ser arrastado como a argola; aviso se
  encostar em mais de uma parte.
- Partes pequenas: detalhe de verdade (largura média ≥ 0,15 mm) fica como na imagem, só com aviso "N detalhes
  pequenos para X mm"; lasca fina entre cores (< 0,15 mm) vai para a vizinha; nada vira buraco por não achar
  vizinha. (Pedro: "quero manter original".)
- "Restaurar" virou "Trazer de volta": pinta com `mapaOriginal` (a imagem sem tirar o fundo, nas cores do logo) e
  marca como correção à mão.
- Palmeiras (estrelas que sumiram) não foi testado com o arquivo dele: ele não chegou na pasta `dev/fotos-teste`.
- Cores no fatiador: arquivo de teste `dev/teste-cores/Santos - teste de cores.3mf` (config completa de projeto,
  como os 3MF do Anycubic) esperando o Pedro abrir na janela do Anycubic.

## Trabalho do Claude Code (16/11/2026) — Ajustes do 2D para 3D e PUBLICAÇÃO (v0.56.0)

- Cor que não tem mais nenhum pixel (apagada com a varinha/borracha) some de Cores (`coresNoMapa`); volta se
  "Trazer de volta" ou Desfazer devolverem os pixels.
- Altura das partes a partir de 1 mm (`LIMITES_RELEVO.altura = [1, 10]`).
- Chaveiro em três cartões com desenho (Nenhum / Argola para chaveiro / Furo para chaveiro) e "Tamanho do furo"
  com − e + (0,5 mm).
- Pedro aprovou publicar ("pode publicar a versão para todos"): v0.56.0 publicada no GitHub com todas as
  versões locais desde a v0.50.0 (Criador de logos → 2D para 3D, estoque de filamentos, calculadora).

## Trabalho do Claude Code (16/11/2026) — Logo nos copos, cores no fatiador, calculadora e produtos (v0.57.0, só no PC do Pedro)

Designs em `docs/superpowers/specs/2026-11-16-logo-nos-copos-design.md` e `...-relevo-cores-material-design.md`.
- Relevo com AMS: só a cor aumentada sobe. Embaixo de parte de outra cor, a base vai até
  `min(altura da parte, altura das partes) − 0,6`; a cor ocupa daí até o topo.
- Cores certas no Anycubic: todo 3MF leva `Metadata/project_settings.config` completo (Kobra X 0.4, 0.20mm
  Standard), montado de `assets/fatiador/projeto-kobra-x.json` (base do arquivo que o Pedro testou + perfis
  oficiais PLA/PETG do Anycubic, sem dados pessoais) e marca de formato BambuStudio no 3dmodel.model.
  `filament_colour_info` = as cores (é dela que vinham as bolinhas verdes na lista de filamentos).
- PLA | PETG em "Como você vai imprimir?" (lembra a última escolha; peso estimado usa a densidade).
- Calculadora: "Valor da peça" (custo sem mão de obra, por peça) e "+ Adicionar peça ao conjunto" (soma peso e
  tempo; mão de obra e lucro uma vez; pode puxar de Meus produtos).
- Produtos: Exportar/Importar (`core/produtos-transporte.cjs`): junta e nunca apaga; mesmo id → fica o mais
  recente; mesmo nome com id diferente → pergunta "Atualizar com os importados" / "Manter os dois".
- Copos: "Logo personalizada" abre o 2D para 3D numa janela grande (a `#tela-logo` vai para dentro do diálogo e
  volta; o que estava aberto no 2D para 3D é reaberto). Prévia dobrada no tubo (`modelos/logo-copo.js`, tubo
  medido da malha: Copo 1 ≈ 82–127 mm, 2 ≈ 25–125, 3 ≈ 55–95), arrastar, Clonar (1ª cópia a 180°), Remover.
  No 3MF/STL a logo sai reta à direita do copo (`comLogos` dentro do `colorir3mf`); cor quase igual à do copo usa
  o mesmo filamento. Meus modelos guarda a logo e as posições; ao reabrir, a logo é refeita sem mostrar a janela.
  Multipartes não leva a logo (aviso).
- Conferido: 472 testes; telas no modo de captura; fatiamento pela linha de comando (cores, PLA/PETG, M600 sem
  AMS, copo + 2 logos). Não conferido: abrir na JANELA do Anycubic (cores e bolinhas), arrastar a logo com o mouse
  de verdade.

## Trabalho do Claude Code (16/11/2026) — Logo do copo: Meus modelos e altura livre (v0.58.0, só no PC do Pedro)

- "Usar de Meus modelos" na Logo personalizada: lista as logos salvas do 2D para 3D; a escolhida abre na janela
  para ajustar (sem chaveiro: argola/furo saem) e o copo guarda uma cópia (o modelo salvo não muda).
- Altura livre: a logo sobe e desce pelo copo inteiro (`limitarNoCopo`); fora do tubo só o aviso "A logo está
  passando do tubo". Fora do tubo a curva usa o maior raio das partes (a logo fica por cima da borda/base).

## Trabalho do Claude Code (17/11/2026) — Editar orçamento e atualizar o PDF (v0.59.0, PUBLICADA)

- Pedido urgente do Pedro, com publicação já autorizada. A v0.59.0 leva junto o que estava só no PC dele (v0.57.0 e v0.58.0).
- O orçamento já podia ser aberto pelo histórico. Agora isso fica claro na tela:
  - o título mostra "Editando orçamento #N";
  - os botões passam a ser "Salvar alterações" e "Salvar e atualizar PDF".
- O PDF lembra onde foi salvo (`main/pdfs-orcamentos.cjs`, dados em `pdfs-orcamentos.json`):
  - ao gerar de novo, sobrescreve o mesmo arquivo sem perguntar;
  - se o arquivo sumiu, pergunta o lugar outra vez;
  - se o PDF está aberto e travado em outro programa, pede para fechar.
- Orçamentos de antes desta versão não têm caminho guardado: na primeira vez, o programa pergunta onde salvar.
- Conferido no modo de captura: o desconto foi aplicado e o mesmo arquivo foi atualizado, com 1 orçamento só. 476 testes passando.

## Trabalho do Claude Code (17/11/2026) — Minhas pastas (v0.60.0, PUBLICADA)

- Pedido do Pedro: separar o que o programa salva, que antes ia tudo solto em Documentos, e conseguir abrir as pastas com facilidade. A publicação já estava autorizada.
- `main/pastas-usuario.cjs` cria `Documentos\Programa Ferramentas 3D` com as pastas Orçamentos, Etiquetas, Modelos 3D, Backups e Produtos.
- Cada "Salvar" (backup, modelo, PDF de orçamento, PDF de etiquetas, exportar produtos) já abre na pasta certa. O usuário pode escolher outro lugar.
- Configurações:
  - o botão "Abrir pastas no Explorador" fica no topo e cria todas as pastas;
  - a nova seção "Minhas pastas" tem um "Abrir" para cada pasta e outro para "Dados do programa";
  - o cartão "Seus dados" saiu de Geral, porque virou a última linha de Minhas pastas.
- IPC: `pastas:listar` e `pastas:abrir(tipo)`, com tipo `raiz`, `dados` ou um dos tipos acima. Qualquer outro tipo é recusado.
- Os dados internos (`AppData\...\dados`) não mudaram de lugar. Nenhum arquivo antigo foi movido.
- Testes: `FERRAMENTAS_PASTAS` troca a pasta principal. No modo de captura, `pastas:abrir` não abre o Explorador.

## Trabalho do Claude Code (17/11/2026) — 2D para 3D abre STL e 3MF (v0.61.0, PUBLICADA)

- Pedido do Pedro, com a publicação já autorizada.
- `modelos/vista-de-cima.js` olha a peça de cima com um z-buffer próprio, sem WebGL, e transforma o que vê numa imagem RGBA de até 2000 px, com o fundo transparente:
  - 3MF com 2 cores ou mais: cada pixel recebe a cor do pedaço mais alto. Só contam as cores que aparecem de cima;
  - STL ou 3MF sem cor: cada altura vira uma cor, na ordem preto, branco, vermelho... Alturas a menos de 0,3 mm uma da outra contam como uma só, e alturas com menos de 0,5% dos pixels são ignoradas.
- `logo-tela.js` (`carregarModeloArquivo`): a imagem entra pelo `usarImagem` de sempre.
  - A largura começa com a da peça, dentro do limite de 20 a 250 mm.
  - As cores do arquivo viram as cores das partes (as cores prontas mais próximas).
  - A ficha mostra "STL · L × C mm".
- Conferido no modo de captura: um STL de chaveiro (placa e letras em relevo) saiu em preto e branco, e o 3MF exportado pelo próprio 2D para 3D manteve azul e laranja. Furos aparecem como furos.


## Trabalho do Claude Code (18/11/2026) — Material e estoque de produtos (v0.62.0, só no PC do Pedro)

- **Produtos:** campo **Material** (lista PLA, PLA Silk, PETG, ABS, TPU de `core/impressao.cjs`, um por produto) e filtro "Todos os materiais".
- **Estoque de peças prontas:** "Peças em estoque" (vazio = sem controle) e "Avisar quando sobrar" (mínimo por produto). Cartão mostra "N disponíveis · N reservadas" e o selo "Acabando" (conta só as disponíveis) ou "Faltam N".
- **Regras (Pedro, 18/11):** a venda criada pela pergunta do pagamento **reserva**; Produção **"Entregue"** (nova, em `core/financeiro.cjs`) **tira do estoque**; orçamento cancelado **devolve**; venda excluída libera a reserva. Só contam vendas criadas depois de ligar o controle do produto (`estoqueDesde`).
- **Como funciona:** `core/estoque-produtos.cjs` (`conciliar`) compara o que cada venda pede com o que já foi aplicado (`produto.vinculos[vendaId] = { r, s }`) e lança só a diferença, com linha no `historico` (máx. 300). `main/estoque-produtos.cjs` roda a conciliação depois de cada canal de orçamentos/financeiro que muda dados. Ajuste à mão só vale se o campo foi mexido (`estoqueVisto`).
- **Aviso de falta:** na pergunta do pagamento, se faltar peça: "Sem estoque suficiente… Continuar mesmo assim / Voltar". Estoque pode ficar negativo (= peças a imprimir).
- **Histórico:** janela "Histórico do estoque" (menu ⋯ do cartão ou "Ver histórico" no editor).
- Testes: `tests/estoque-produtos.test.js`. Conferido no modo de captura (lista, editor, histórico, Entregue e cancelamento pelos canais reais).
- **Pendente:** Pedro instalar e testar; publicar só quando ele aprovar.

## Trabalho do Claude Code (18/11/2026) — Calculadora gravação a laser (v0.63.0, só no PC do Pedro)

- **Nova ferramenta** `laser` (Gestão financeira, abaixo da Calculadora 3D): produto (digitado ou escolhido em Meus produtos), quantidade, valor do produto, valor frente e valor frente e verso (opcionais, sempre digitados, não ficam guardados) e botões "Área de gravação" que alternam qual valor entra na conta. Botão do campo vazio fica apagado.
- Conta em `core/laser.cjs` (`calcularLaser`, `itemDoOrcamento`): produto + gravação = valor por peça; × quantidade = total.
- **Duas versões no orçamento:** com os dois valores, o item leva `opcoes` (2: rótulo, descrição, preço) e `opcao` (escolhida) — validado em `core/orcamento.cjs` (`itensNaVersao`, `versoesDo`). Na prévia do PDF aparecem os botões Frente / Frente e verso; no Finalizar, "Finalizar e salvar as duas versões em PDF" (canal `orcamentos:pdf-versoes`) grava "… - Frente.pdf" e "… - Frente e verso.pdf" na pasta Orçamentos. O orçamento grava a versão marcada.
- Produto escolhido dos salvos vai com `produtoId` (reserva estoque, regras da v0.62.0).
- Testes: `tests/laser.test.js`. Conferido no modo de captura (tela, envio ao orçamento com troca na prévia, os dois PDFs).
- **Pendente:** Pedro instalar e testar; publicar só quando ele aprovar.

## Trabalho do Claude Code (18/11/2026) — Chaveiro: vários nomes na prévia (v0.64.0, PUBLICADA junto com 0.62 e 0.63)

- **Chaveiro de nome / Vários nomes:** com nomes na lista, aparece um botão por nome em cima da prévia (`#ch-nomes-previa`). Clicar mostra o chaveiro daquele nome (a peça usa `vendo` no lugar do texto). Arrastar a argola guarda a posição só daquele nome (`argolasLote`, Map nome → t); "Voltar a argola para a esquerda" vale para o nome da prévia. Trocar fonte, estilo ou símbolo devolve as argolas da lista à posição automática (como no nome único).
- O nome único deixou de ser obrigatório: sem ele, a prévia começa no primeiro nome da lista, que também vira a referência de "mesma altura de letra".
- Preparar/3MF do lote usam a argola de cada nome; se ela não couber, volta para a automática e a linha avisa.
- "Salvar modelo" guarda as argolas (`loteArgolas`).
- Conferido no modo de captura arrastando a argola do "Bruno" (ficou à direita, manteve ao trocar de nome, lote preparado com 3 chaveiros).
- Pedro aprovou publicar (18/11): release v0.64.0 leva também a v0.62.0 (material/estoque) e a v0.63.0 (calculadora a laser).

## Trabalho do Claude Code (19/11/2026) — Laser: cor do produto e vários produtos (v0.65.0, só local)

- **Cor do produto:** lista que abre (`#laser-cor`) com as 14 cores de `CORES` (`core/impressao.cjs`) e a amostra da cor à esquerda. Opcional. `calcularLaser` recebe `cor` (id), recusa id fora da lista e põe o nome na descrição: "Copo térmico personalizado (Preto, gravação frente e verso)".
- **Vários produtos:** "+ Adicionar outro produto" guarda o cálculo da tela numa lista no Resumo (nome · cor, quantidade × valor, total, botão × para tirar) e limpa o produto (os valores da gravação ficam). O botão principal vira "Adicionar N produtos ao orçamento" e leva a lista + o produto da tela de uma vez (`adicionarItensDoCalculo` em `orcamentos.js`). "Novo cálculo" limpa tudo, inclusive a lista.
- Novidade `laser-varios-produtos`. Teste da cor em `tests/laser.test.js` (500 testes passando). Conferido no modo de captura: lista com 1 produto + 1 na tela, envio gera 2 itens no orçamento.
- **Pendente:** Pedro instalar `ProgramaFerramentas3D-Setup-0.65.0.exe` e testar; publicar só quando ele aprovar.

## Trabalho do Claude Code (19/11/2026) — Atualização automática a cada 5 minutos (v0.66.0, só local)

- `main.cjs`: `autoDownload = true` e `autoInstallOnAppQuit = true`. Verifica ao abrir e a cada 5 min (`INTERVALO_ATUALIZACAO`), só com estado "parada". Achou versão: baixa sem perguntar. Baixou: manda `atualizacao:pronta` para a tela (uma vez por versão, depois que a tela chama `atualizacao:ouvir`). Saíram as janelas nativas do Windows (`perguntarSeAtualiza`/`perguntarSeReinicia`).
- Tela: diálogo `#dialogo-atualizacao-pronta` ("Nova versão recebida", Mais tarde / Atualizar agora). "Atualizar agora" chama `atualizacao:instalar` → `quitAndInstall(true, true)` (instala sem assistente e reabre). "Mais tarde" fecha; a versão instala ao fechar o programa.
- Botão "Verificar atualizações": versão nova → "Atualização em andamento" (já baixando); versão pronta → mostra o mesmo aviso.
- Novidade `atualizacao-automatica` (tela inicio, ícone novo `atualizar`).
- Conferido: 500 testes; aviso no modo de captura. **Não conferido:** o fluxo de ponta a ponta (precisa de uma release no GitHub maior que a instalada). A 0.65/0.66 instaladas localmente não acham nada enquanto a última release for a 0.64.0.
- **Pendente:** Pedro instalar a 0.66.0; publicar só quando ele aprovar.

## Trabalho do Claude Code (19/11/2026) — Laser: lista de cores com amostras (v0.66.1, só local)

- A lista nativa do Windows (`<select>`) não mostra cor nas opções. Troquei por uma lista própria: botão `#laser-cor-botao` + `#laser-cor-lista` (role listbox, 3 colunas, amostra de cada cor). O `<select id="laser-cor">` ficou escondido só para guardar o valor.
- Teclado: setas abrem e andam, Enter/Espaço escolhe, Esc fecha. Clique fora fecha.
- Amostras com borda mais clara (o Preto sumia no tema escuro). "+ Adicionar outro produto" desabilitado fica apagado.
- Conferido no modo de captura (clique em Preto, setas). 500 testes.
- **Pendente:** Pedro instalar e testar; publicar só quando ele aprovar.
- **19/11/2026:** Pedro aprovou ("sobe no github"). Release **v0.66.1 PUBLICADA** (push da `electron` + 3 arquivos), levando 0.65.0, 0.66.0 e 0.66.1. A partir dela, o aviso "Nova versão recebida" passa a valer para as próximas releases.

## Trabalho do Claude Code (19/11/2026) — Orçamento: aviso de campo faltando (v0.66.2, só local)

- Bug relatado por cliente do Pedro: "Finalizar e gerar PDF" sem telefone (ou nome) voltava para a etapa 1 sem explicar. A mensagem ia para `#erro-orcamento`, que fica na etapa 4 (escondida).
- Agora `mostrarPendencia` põe o aviso na etapa certa (`#o-erro-etapa-1` / `#o-erro-etapa-2`), marca o campo em vermelho (`.entrada.faltando`, `aria-invalid`) e põe o cursor nele. `limparPendenciasResolvidas` (em `aoMudar`) apaga aviso e marca quando o campo é preenchido.
- Telefone continua obrigatório. Conferido no modo de captura; 500 testes.
- **Pendente:** Pedro instalar e testar; publicar só quando ele aprovar.

## Trabalho do Claude Code (19/11/2026) — WhatsApp no orçamento e botão Novidades (v0.67.0, PUBLICADA com a 0.66.2)

- **Enviar pelo WhatsApp (sem API):** `core/whatsapp-orcamento.cjs` (número com 55, mensagem com {cliente} {numero} {total} {validade}, links). Canal `orcamentos:whatsapp`: copia o(s) PDF(s) para a área de transferência com `Set-Clipboard -LiteralPath` (caminhos por variável de ambiente) e abre `whatsapp://send?phone=…&text=…` direto no aplicativo; se o app não abrir, `https://wa.me/…`. Se a cópia falhar, abre a pasta com o PDF selecionado. Único esquema além de https liberado, montado só pelo programa.
- Onde aparece: aviso verde "Orçamento #X pronto. Enviar pelo WhatsApp" depois de finalizar com PDF (`#o-enviar`) e ícone verde em cada linha do histórico que tem PDF (`orcamentos:com-pdf`). Sem telefone válido: botão desligado com "Cadastre o telefone do cliente". `pdf-versoes` agora lembra os dois PDFs (`pdfs-orcamentos.cjs` aceita lista).
- Configurações > Dados do orçamento: "Mensagem do WhatsApp" (`orcamento.mensagemWhatsapp`, vazio = padrão), botões de campo, prévia e "Voltar à mensagem padrão".
- Conferido: Ctrl+V pelo Explorador cola o PDF (teste com `Shell.Application` Paste na pasta). **Não conferido:** colar no WhatsApp (Pedro vai testar).
- **Novidades:** saiu a janela automática ao abrir uma ferramenta (`dialogo-novidade`, `novidadeDaTela`). Agora há o botão "Novidades" à esquerda de Meu fatiador; depois de uma atualização ele pulsa com um ponto vermelho (`.chamando`) até ser clicado. A lista mostra todas as novidades, mais novas primeiro, com selo "Novo" (`listaDeNovidades`, `temNovidade`; config `novidadesVistoAte`). Continuar criando entradas em `NOVIDADES` a cada mudança visível.
- Testes: 507 passando.
