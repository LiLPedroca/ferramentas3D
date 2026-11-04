# Contexto do projeto: Programa Ferramentas 3D

## Objetivo
Suíte de ferramentas para impressão 3D, para Windows 10 e 11. A calculadora de custo é a primeira ferramenta, não o projeto inteiro. Desenvolvido por Pedro em vibe coding.

## Idioma
- Conversa com o usuário: português do Brasil.
- Interface do app: português do Brasil.
- Código, funções e variáveis: português ou inglês técnico, com consistência dentro de cada módulo.

## Estado atual (novembro/2026)
- **Versão ativa: Electron** (pasta `electron/`, branch `electron`). Versão publicada: **v0.4.0**.
- **Versão antiga: Python/PySide6** (raiz do repositório, branch `main`, v0.2.0). Mantida só como referência das regras de cálculo. Não recebe mais atualizações.
- Repositório: https://github.com/LiLPedroca/ferramentas3D

## Stack (Electron)
- Electron 45 com `contextIsolation`, sem `nodeIntegration`.
- Interface em HTML/CSS/JavaScript, empacotada pelo esbuild (`scripts/build-renderer.mjs`).
- Three.js para o visualizador de STL.
- Cálculo de dinheiro com números racionais exatos em `BigInt` (`electron/src/core/racional.js`). Arredondamento só na exibição, meio para cima.
- Instalador: electron-builder, NSIS, instalação por usuário (sem administrador). Nome do arquivo: `ProgramaFerramentas3D-Setup-<versão>.exe`.
- Atualização automática: electron-updater, lendo as releases do GitHub (`latest.yml`).
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

## Home (pronta na v0.4.0)
- A home é o ponto de entrada. Calculadora e visualizador abrem pelos cards, e a barra "← Início / ferramenta" no topo volta.
- Saudação pelo horário, resumo (prontas, em desenvolvimento, versão), busca sem acento (Ctrl+K) e filtros (Todas, Disponíveis, Em breve).
- Catálogo em `electron/src/core/ferramentas.js`: para liberar uma ferramenta, marcar `disponivel: true`, dar uma `tela` e registrar a tela em `TELAS` no `app.js`.
- Lógica testada em `electron/src/core/inicio.js`. Ícones em `electron/src/renderer/icones.js`.

## Testes e modo de captura
- `vite` precisa estar nas devDependencies: o `.npmrc` usa `legacy-peer-deps` e não instala dependências "peer" sozinho. Sem ele, o vitest não roda.
- Modo de captura (só para testes): `FERRAMENTAS_CAPTURA=<png>`, com `FERRAMENTAS_ABA`, `FERRAMENTAS_TEMA`, `FERRAMENTAS_STL` e `FERRAMENTAS_ALTURA` opcionais. O tema da captura não é salvo.

## Pendências
- Próxima ferramenta a liberar (sugestão: Produtos ou Orçamentos, que dependem de salvar dados localmente).
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
