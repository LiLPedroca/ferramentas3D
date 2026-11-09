# AGENTS.md: guia para o Codex (Programa Ferramentas 3D)

Este arquivo é o ponto de partida para qualquer agente (Codex, Claude Code etc.) que for mexer no
programa. O histórico completo de decisões, versão por versão, está em `CONTEXTO.md`. Leia os dois
antes de mudar qualquer coisa.

Escrito em 09/11/2026, na versão **v0.35.0** (commit `e50fb5c` da branch `electron`).

---

## 1. O que é

Suíte de ferramentas para quem vende impressão 3D, feita para o **Pedro** (Windows 10/11, impressora
**Anycubic Kobra X 0.4** com **Anycubic Slicer Next**). Programa desktop em **Electron**, interface
toda em **português do Brasil**.

- Repositório: https://github.com/LiLPedroca/ferramentas3D
- **Branch ativa: `electron`** (pasta `electron/`). É dela que saem as releases.
- Branch `main` + arquivos Python na raiz (`app/`, `main.py`, `tests/` da raiz, `installer/`): versão
  antiga em PySide6 (v0.2.0). **Não mexer.** Serve só de referência das regras de cálculo.
- O Pedro atualiza pelo próprio programa (electron-updater lê as releases do GitHub).

## 2. Regras do Pedro (obrigatórias)

1. **Fale com o Pedro em português do Brasil.** Textos da interface também em pt-BR.
2. **Nunca mostrar na interface algo que ainda não existe** (nada de "Em breve", botões mortos ou
   grupos vazios).
3. **Interface limpa e mínima.** Sem textos longos. Ele já reclamou de tela poluída no Visualizador.
4. **Nunca apagar dados do usuário. Nunca apagar arquivos sem perguntar** (isso inclui código que
   parece morto, ver seção 8).
5. **Não guardar dados pessoais nem chaves de API no código.**
6. **Cada mudança no programa vira uma release nova** (seção 5). Mudança só de documentação não
   precisa de release.
7. `dev/statusline.py` **não** entra no repositório.
8. Commitar só os arquivos que você mudou. Não fazer `reset`, `stash` nem reescrever histórico da
   `electron`.
9. **Paquímetro do Visualizador:** mostra só Ø dentro e Ø fora. Não adicionar outras informações
   sem o Pedro pedir.
10. Marcas d'água de IA: o Detector mostra e avisa, mas **não fazer nada para esconder ou apagar
    marcas de IA nos pixels** (combinado com o Pedro).

## 3. Como rodar, testar e empacotar

Tudo dentro de `electron/` (Node 20+; no PC do Pedro está o Node 26):

```bash
npm install            # .npmrc usa legacy-peer-deps; o vite precisa ficar nas devDependencies
npm test               # vitest: 216 testes, ~6 s, todos passando na v0.35.0
npm start              # gera o bundle da tela (esbuild) e abre o Electron
npm run build:renderer # só o bundle: build/renderer (copia manifold.wasm, fontes, assets)
npm run dist           # instalador NSIS em release/ProgramaFerramentas3D-Setup-<versão>.exe
```

- `build/`, `release/` e `node_modules/` não vão para o git.
- Testes que usam DOM rodam com happy-dom (`// @vitest-environment happy-dom` no arquivo).
- Testes de geometria carregam o Manifold direto do pacote (`carregarManifold()`, sem a tela).

### Modo de captura (testar telas sem clicar)

O `main.cjs` tem um modo de teste por variáveis de ambiente. Ele abre a janela, roda um roteiro e
salva um PNG:

| Variável | Para quê |
|---|---|
| `FERRAMENTAS_CAPTURA=<arq.png>` | liga o modo; grava o PNG e `<arq.png>.txt` com o `document.title` |
| `FERRAMENTAS_DADOS=<pasta>` | **pasta de dados temporária: use sempre, para não tocar nos dados reais** |
| `FERRAMENTAS_ABA=<id>` | abre a tela (ids em `TELAS`, `renderer/shell.js`) |
| `FERRAMENTAS_JS=<roteiro.js>` | roda o roteiro na tela (pode ser uma Promise); deixe o resultado em `document.title` |
| `FERRAMENTAS_TEMA`, `FERRAMENTAS_LARGURA`, `FERRAMENTAS_ALTURA` | tema e tamanho da janela |
| `FERRAMENTAS_STL`, `FERRAMENTAS_SALVAR_DESTINO`, `FERRAMENTAS_PDF_DESTINO`, `FERRAMENTAS_BACKUP_ARQUIVO` | evitam janelas de escolha de arquivo |

Se o roteiro falha, o `.txt` sai com "ERRO NA CAPTURA". `window.__visualizadorTeste` dá acesso ao
estado do Visualizador nos roteiros.

### Fatiar por linha de comando (conferir 3MF de verdade)

```
"C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe" --slice 0 --outputdir <pasta>
  --load-settings "<machine.json>;<process.json>" --load-filaments "<fil.json>;<fil.json>" <arquivo.3mf>
```

Perfis em `%APPDATA%\AnycubicSlicerNext\system\Anycubic\` (`machine\Anycubic Kobra X 0.4 nozzle.json`,
`process\0.20mm Standard @Anycubic Kobra X 0.4*.json`, `filament\Anycubic PLA @Anycubic Kobra X 0.4 nozzle.json`).
Sai `plate_1.gcode`: procure `M600` (pausas sem AMS) e `T0`/`T1` (trocas com AMS).

## 4. Arquitetura

```
electron/
├── src/main/      processo principal (CommonJS)
│   ├── main.cjs           janela, CSP, atualização, canais IPC, PDF (htmlParaPdf), modo de captura
│   ├── preload.cjs        expõe window.atualizacao/arquivos/stl/modelos/fatiador/backup/dados
│   ├── armazenamento.cjs  gravação atômica (.tmp → renomeia) + cópia .bak
│   ├── servico-colecao.cjs  cadastro genérico listar/salvar/excluir
│   └── produtos, clientes, orcamentos, projetos, filamentos, favoritos, configuracoes, backup,
│       printables, fatiador (.cjs): um serviço por cadastro/recurso
├── src/core/      regras sem interface, testadas (as .cjs servem ao main e aos testes)
│   ├── calculadora.js + racional.js   dinheiro em racionais BigInt, arredonda só na exibição
│   ├── validacao.cjs                  ErroValidacao, texto, ID, dataValida
│   ├── ferramentas.js                 catálogo da home: GRUPOS e FERRAMENTAS
│   └── produto, cliente, orcamento(+pdf), projeto, filamento, etiquetas, backup, configuracoes,
│       metadados, detector-ia, printables, stl, formatos, inicio
├── src/renderer/  tela (ES modules, empacotados pelo esbuild)
│   ├── index.html (uma <main class="tela"> por ferramenta), styles.css, app.js (liga tudo)
│   ├── shell.js           navegação (TELAS), menu, tema, avisos, confirmar(), atualização
│   ├── <ferramenta>-tela.js / produtos.js / clientes.js / orcamentos.js / viewer3d.js / paquimetro.js
│   ├── modelos-ui.js      peças comuns dos modelos: paleta, janela de fontes, "Como você vai
│   │                      imprimir?" (AMS/sem AMS), Salvar em Meus modelos
│   ├── vetorizar.js       vetorizador próprio (imagem → SVG), roda no svg-worker.js
│   └── modelos/           geometria 3D
│       ├── manifold.js    motor Manifold (WASM): comEscopo/guardar, malhaDoSolido, argola, largura
│       ├── chaveiro.js, logo.js, palavras.js, caneca.js, emblema.js, encaixes.js
│       ├── exportar.js    STL binário, 3MF com uma parte por cor + model_settings + pausas
│       ├── ler3mf.js      leitor de 3MF (Bambu/Orca/Anycubic, pintura subdividida)
│       ├── medidas.js, calibracao.js, corte (renderer/corte.js)   Visualizador e Paquímetro
│       └── previa2d.js, previa3d.js, geometria.js, fontes.js (29 fontes OFL), estimativa.js
├── scripts/       build-renderer.mjs (esbuild), gerar-icone.cjs
├── recursos/      ícone (svg/ico/png) usado pelo electron-builder
└── tests/         vitest, um arquivo por módulo
```

### Ferramentas (catálogo em `src/core/ferramentas.js`)

| Grupo | Ferramenta (id da tela) | Arquivos principais |
|---|---|---|
| Gestão financeira | Calculadora 3D (`calculadora`) | `core/calculadora.js`, `calculadora-tela.js` |
| | Orçamentos com PDF (`orcamentos`) | `core/orcamento*.cjs`, `orcamentos.js` |
| | Produtos, Clientes | `core/produto.cjs`, `core/cliente.cjs`, `produtos.js`, `clientes.js` |
| | Estoque de filamentos (`filamentos`) | `core/filamento.cjs`, `filamentos-tela.js` |
| | Etiquetas em PDF (`etiquetas`) | `core/etiquetas.cjs`, `etiquetas-tela.js` |
| Ferramentas | Visualizar 3D + Paquímetro + Corte (`visualizador`) | `viewer3d.js`, `paquimetro.js`, `corte.js`, `modelos/ler3mf.js`, `modelos/medidas.js` |
| | Conversor SVG (`svg`) | `vetorizar.js`, `svg-worker.js`, `svg-tela.js` |
| | Encaixes e tolerâncias (`encaixes`) | `modelos/encaixes.js`, `encaixes-tela.js` |
| | Caçador de STL (`stl`) | `core/stl.cjs`, `core/printables.cjs`, `stl-tela.js` |
| | Detector de IA e metadados (`detector`) | `core/detector-ia.js`, `core/metadados.js`, `detector-tela.js` |
| | Backup e armazenamento (`backup`) | `core/backup.cjs`, `main/backup.cjs`, `backup-tela.js` |
| Modelos personalizados | Chaveiro de nome (`chaveiro`) | `modelos/chaveiro.js`, `chaveiro-tela.js` |
| | Chaveiro de logo (`logo`) | `modelos/logo.js`, `logo-tela.js` |
| | Palavras decorativas (`palavras`) | `modelos/palavras.js`, `palavras-tela.js` |
| | Caneca de chopp (`caneca`) | `modelos/caneca.js`, `modelos/emblema.js`, `caneca-tela.js` |
| | Meus modelos (`projetos`) | `core/projeto.cjs`, `projetos-tela.js` |

Também há Configurações (`configuracoes-tela.js`) e "Meu fatiador" (`fatiador-ui.js`, `main/fatiador.cjs`).

### Como adicionar uma ferramenta
1. `<main class="tela oculta pagina" id="tela-x">` no `index.html`.
2. Registrar `x` em `TELAS` (`renderer/shell.js`) e no catálogo (`core/ferramentas.js`, com `grupo` e `tela`).
3. Ícone em `renderer/icones.js`; `iniciarX()` no `app.js`.
4. Incluir o id na lista do teste `tests/inicio.test.js`.
5. Cadastro novo: modelo `core/x.cjs` + serviço `main/x.cjs` + entrada em `cadastros` no `main.cjs` +
   `cadastro("x")` no preload + coleção no backup (`core/backup.cjs`).

### Dados do usuário
- Ficam em `%APPDATA%\Programa Ferramentas 3D\dados\*.json` (ou na pasta escolhida em Configurações).
- **Só o processo principal grava.** Ele valida tudo de novo (os modelos em `core/*.cjs`).
- Itens inválidos no arquivo são mantidos, mas não aparecem. Se nada puder ser lido, não sobrescreve.
- O backup cria uma cópia "antes-de-restaurar" e mantém 10 cópias diárias.

### Segurança (não afrouxar)
- `contextIsolation: true`, sem `nodeIntegration`. A tela só fala com o main pelo preload.
- CSP no `index.html`: `script-src 'self' 'wasm-unsafe-eval'` (o WASM do Manifold precisa disso).
- O `.wasm` chega à tela pelo canal `modelos:wasm`, porque o `file://` não baixa WASM.
- PDFs (orçamento, etiquetas) são gerados numa janela invisível **sem JavaScript**, com HTML todo
  escapado.
- Links externos: só `https://`, abertos no navegador.
- Miniaturas do Printables: só de `media.printables.com`, viram data URL no main.

## 5. Como publicar uma versão

1. **Antes de tudo:** `git fetch` e `gh release list --repo LiLPedroca/ferramentas3D --limit 3`.
   Outras sessões publicam em paralelo. Em 09/11/2026 duas linhas de trabalho divergiram e tiveram
   que ser juntadas; a próxima versão precisa ser **maior que a última release**.
2. Subir a versão em `electron/package.json` (SemVer: correção = patch, recurso = minor).
3. `npm test`, `npm run dist`.
4. Commit na `electron`, push.
5. Release com os 3 arquivos:
   ```
   gh release create vX.Y.Z electron/release/ProgramaFerramentas3D-Setup-X.Y.Z.exe \
     electron/release/ProgramaFerramentas3D-Setup-X.Y.Z.exe.blockmap electron/release/latest.yml \
     --repo LiLPedroca/ferramentas3D --target electron --title "vX.Y.Z - <resumo>" --notes "<notas em pt-BR>"
   ```
   O GitHub às vezes devolve 500/502: tente de novo e confira com `gh release view` (3 arquivos,
   sem rascunho).
6. Se você não tiver acesso ao `gh` ou ao Windows para gerar o instalador: deixe a versão subida e
   commitada, e escreva no `CONTEXTO.md` que a release está pendente.
7. Atualizar o `CONTEXTO.md` com uma seção curta do que mudou.

## 6. Armadilhas conhecidas

- **Acentos:** os arquivos são UTF-8 sem BOM. O **PowerShell 5.1** (`Get-Content`/`Set-Content`)
  lê e grava em ANSI e já corrompeu o `CONTEXTO.md` e o `package.json`. Um BOM no `package.json`
  quebra o `npm run dist`. Edite com ferramentas de edição de texto, nunca por PowerShell.
- Caminho do usuário tem espaço e acento (`C:\Users\Pedro Henrique`): sempre teste caminhos assim.
- **Manifold:** todo objeto do WASM precisa ser liberado. Use `comEscopo(M, (guardar) => …)` e
  passe cada objeto criado por `guardar(...)`. `malhaDoSolido` recusa peça inválida ou sem volume.
- Malhas exportadas precisam ser fechadas e orientadas (há testes para isso em todos os modelos).
- **3MF:** cada parte leva o filamento em `Metadata/model_settings.config`. As pausas sem AMS vão
  em `Metadata/custom_gcode_per_layer.xml` (type 1 → o fatiador insere o `machine_pause_gcode`,
  M600 na Kobra X). O Anycubic prende a pausa à camada MAIS PRÓXIMA; `camadaDaTroca` calcula a
  altura exata da primeira camada da cor nova. Não "arredonde" isso.
- `capturePage` travava com a janela encoberta: o modo de captura liga
  `disable-renderer-backgrounding` e afins. Não remover.
- Importar módulos de `src/renderer` direto no Node dá o aviso `MODULE_TYPELESS_PACKAGE_JSON`.
  É inofensivo; não ponha `"type": "module"` no package.json (o main é CommonJS).
- API do Printables é a GraphQL interna do site (não documentada). Se quebrar, a tela já oferece
  abrir no navegador.

## 7. O que já foi conferido e o que não foi

- **Conferido:** testes automáticos; cada tela no modo de captura e no programa empacotado;
  pausas sem AMS fatiando pela linha de comando (chaveiro: M600 na camada 13 / 2,6 mm;
  caneca: 5 M600 em 14,2/28,2/42,2/106,2/120,2 mm).
- **Não conferido:**
  - Nada dos modelos foi impresso de verdade.
  - A Kobra X pausar e retomar no M600.
  - Abrir pela JANELA do Anycubic Slicer Next (não pela linha de comando) também lê as pausas.
  - Ler o QR das etiquetas com celular.

## 8. Lista de trabalho para o Codex ("corrigir e arrumar")

Em ordem de prioridade. Rode `npm test` antes e depois de cada item; confira a tela no modo de
captura; uma release por bloco de mudanças visíveis.

1. **Revisão de bugs.** Ler cada tela e procurar erros reais: estados que não atualizam,
   botões habilitados sem peça pronta, mensagens de erro em inglês ou genéricas, vazamento de
   objetos do Manifold (falta de `guardar`), listeners duplicados ao reabrir telas, ids de HTML
   repetidos. Corrigir com teste quando der.
2. **Duplicação nas telas de modelos.** `chaveiro-tela.js`, `logo-tela.js`, `palavras-tela.js`,
   `caneca-tela.js` e `encaixes-tela.js` repetem a mesma lógica:
   - prévia 2D/3D, zoom e "Ajustar à tela";
   - salvar STL/3MF, abrir no fatiador (com a pergunta de AMS) e "Calcular custo";
   - `arquivoDeTexto`/imagem em data URL.

   Extrair para `modelos-ui.js` (ou um módulo novo), sem mudar o comportamento.
3. **`CONTEXTO.md` desatualizado** em partes:
   - "Estrutura" mostra só 3 pastas.
   - "Pendências" diz que falta o ícone, que já existe desde a v0.20.0, e sugere Orçamentos, que já existe.
   - "Ideias para próximas ferramentas" lista coisas prontas.

   Reorganizar sem perder o histórico.
4. **`.gitignore`** tem um comentário com acento corrompido ("reposit�rio"). Corrigir o texto.
5. **Estimativa de peso** usa sempre PLA (1,24 g/cm³). A caneca recomenda PETG (≈ 1,27). Dá
   para usar o material do rolo escolhido no Estoque de filamentos, se houver.
6. **`index.html` (≈ 1900 linhas) e `styles.css` (≈ 3900 linhas)** estão grandes. Organizar por
   seções comentadas ou separar o CSS por tela (o esbuild junta). Só se não mudar nada visível.
7. **Código sem uso na tela, mas testado**: `acharFurosEPinos`, `medirParedes` e `arestaReta`
   em `modelos/medidas.js` (saíram da interface na v0.33).
   **Não apague:** pergunte ao Pedro antes.
8. **Extras do Visualizador ainda não feitos** (só se o Pedro pedir):
   - áreas que vão precisar de suporte (> 45°);
   - foto do produto com fundo neutro, mandada para Produtos;
   - comparar duas versões, com cores onde mudou;
   - prévia em camadas;
   - abrir direto do Caçador de STL.

Ao terminar, deixe no `CONTEXTO.md` uma seção "Trabalho do Codex (data)" com o que mudou, as
versões publicadas e o que ficou pendente, para o Claude Code continuar de onde parou.
