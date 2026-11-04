# Contexto do projeto: Programa Ferramentas 3D

## Objetivo
Suíte de ferramentas para impressão 3D, para Windows 10 e 11. A calculadora de custo é a primeira ferramenta, não o projeto inteiro. Desenvolvido por Pedro em vibe coding.

## Idioma
- Conversa com o usuário: português do Brasil.
- Interface do app: português do Brasil.
- Código, funções e variáveis: português ou inglês técnico, com consistência dentro de cada módulo.

## Estado atual (novembro/2026)
- **Versão ativa: Electron** (pasta `electron/`, branch `electron`). Versão publicada: **v0.12.0**.
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
- [ ] 8. Chaveiro de logo + Palavras decorativas. (v0.13.0)

Último progresso: 2026-11-04 02:03 (etapa 7 publicada).

Etapa 7 (modelos 3D): `renderer/modelos/geometria.js` (letras pelo opentype.js letra a letra, sem o motor de composição que falha em algumas fontes; sólido/furo pela regra "nonzero" das fontes: furo é o contorno no sentido oposto, peças sobrepostas se somam; base em meia-lua com furo da argola), `modelos/exportar.js` (STL binário e 3MF com uma parte por cor; vértices unidos só pela posição para a malha sair fechada), `modelos/chaveiro.js`, `modelos/previa3d.js` (prévia Z para cima), `modelos/fontes.js` (12 fontes OFL/Apache em `renderer/assets/fontes`, lidas pelo canal `fontes:ler`). Testes garantem malhas fechadas em todas as fontes. Meu fatiador: `src/main/fatiador.cjs` (detecta Bambu, Orca, Prusa, Creality Print, Cura, Anycubic, Elegoo em Program Files e LOCALAPPDATA\Programs; abre com o arquivo), escolha salva em `configuracoes.fatiador`; `renderer/fatiador-ui.js`. Na máquina do Pedro foi detectado o Anycubic Slicer Next. "Abrir no fatiador" grava o 3MF em %TEMP%\ProgramaFerramentas3D.

Etapa 6: `src/core/stl.cjs` (sites e URLs de busca, só links https, reconhecimento do site pelo domínio exato, título sugerido pelo endereço, favoritos sem link repetido), serviço `src/main/favoritos.cjs` (arquivo `favoritos-stl.json`, canais `favoritos:*`), tela `renderer/stl-tela.js`. Decisão: não ler APIs dos sites (o Codex usava credencial obtida em tempo de execução do Thingiverse); as buscas abrem no navegador. Favoritos entram no backup.

Etapa 5: `src/core/detector-ia.js` (DigitalSourceType IPTC, geradores citados, parâmetros SD/ComfyUI em PNG, C2PA; sempre avisa que ausência de indício não prova nada), tela `renderer/detector-tela.js`. Conversor SVG: `renderer/vetorizar.js` (imagetracerjs, licença Unlicense; modos cores/silhueta, remoção de fundo por cor da borda), roda no worker `renderer/svg-worker.js` (segundo bundle do build) com reserva na própria tela; tela `renderer/svg-tela.js`. O modo de captura grava `document.title` em `<captura>.png.txt` (roteiros de teste deixam resultados ali).

Etapa 4: metadados em `src/core/metadados.js` (lê e limpa JPEG/PNG/WebP direto nos bytes, sem recodificar; `analisarImagem` também devolve textos XMP/PNG para o Detector de IA), tela `renderer/metadados-tela.js`. Backup: `src/core/backup.cjs` (formato e leitura segura) e `src/main/backup.cjs` (exportar, restaurar com cópia "antes-de-restaurar", cópia diária ao abrir, mantém 10 diárias), tela `renderer/backup-tela.js`. Salvar cópias de arquivos: canal `arquivos:salvar-copias` (pergunta a pasta, nunca sobrescreve). Testes: `FERRAMENTAS_SALVAR_DESTINO` e `FERRAMENTAS_BACKUP_ARQUIVO` evitam as janelas de escolha.

Orçamentos (etapa 3): modelo `src/core/orcamento.cjs` (número sequencial, cliente copiado no momento do orçamento, itens com custo opcional, totais em centavos BigInt, lucro só quando todos os itens têm custo), HTML do PDF em `src/core/orcamento-pdf.cjs` (tudo escapado), serviço `src/main/orcamentos.cjs` (resolve o cliente pelo id). PDF: `orcamentos:pdf` no `main.cjs` gera numa janela invisível sem JavaScript (`printToPDF`), pergunta onde salvar e abre o arquivo. Nos testes, `FERRAMENTAS_PDF_DESTINO` salva direto numa pasta. Telas: `renderer/orcamentos.js` (lista e editor `tela-orcamento`).

Base comum criada na etapa 2 (usar nas próximas):
- `src/core/validacao.cjs`: `ErroValidacao` (mensagem amigável), `texto`, `textoLongo`, `ID`, `dataValida`.
- `src/main/servico-colecao.cjs`: serviço genérico de cadastro (listar/salvar/excluir) + `responder`. Para um cadastro novo: criar o modelo em `src/core/<x>.cjs`, o serviço em `src/main/<x>.cjs` e incluir em `cadastros` no `registrarDados` do `main.cjs` (gera os canais `<x>:listar/salvar/excluir`); no preload, `cadastro("<x>")`.
- `confirmar({ titulo, texto, botao })` em `renderer/shell.js` para confirmações (devolve true/false).
- `src/core/formatos.js`: telefone, CPF/CNPJ, link do WhatsApp, iniciais.
- Links externos: só `https://`, abertos no navegador (`window.open`).

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
