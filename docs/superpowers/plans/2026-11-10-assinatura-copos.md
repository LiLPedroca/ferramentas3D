# Assinatura integrada nos copos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar aos três copos a foto aprovada: logo Criae3D central, `www.criae3d.com.br` no arco superior e `Instagram: _criae3d_` no arco inferior, legível da esquerda para a direita.

**Architecture:** Retriangular a face externa inferior da base, incorporando a marca em rebaixo discreto de 0,2 mm com faces pintadas do próprio objeto, sem objetos/componentes de logo ou texto. O rebaixo conserva a assinatura na geometria do STL, que não armazena cores. No Copo 1, fundir a primeira camada de base (hoje um componente de apenas 0,2 mm) ao acabamento de base adjacente, evitando uma lâmina de assinatura selecionável separadamente. Preservar os demais componentes e sua pintura nativa; regenerar os pacotes de prévia a partir dos 3MF já dimensionados, sem redimensionar novamente o Copo 3.

**Tech Stack:** Python, NumPy, Shapely/CDT, fontTools/matplotlib, Manifold para a fusão local da base, pipeline Node/Three.js existente, Electron, Vitest.

**Spec:** Foto aprovada no chat, `exec-5a3f9585-2ecb-415a-a421-845d08b457ac.png`, e instrução “comece” de 10/11/2026. Base branca e marca preta por padrão, usando as duas cores personalizáveis do copo. A exigência é impedir selecionar a marca como peça separada com Del; não é possível impedir edição deliberada de uma malha/pintura.

## Global Constraints

- Trabalhar no repositório original, branch electron; não usar o ZIP da fonte nem worktree.
- Não apagar arquivos, código ou dados; não sobrescrever os modelos originais do usuário.
- Manter 145 mm de altura e boca nominal 81,4 mm, além de todas as superfícies do encaixe existentes.
- Manter os dois `_` do nome `_criae3d_`, texto inferior ereto e sem espelhamento na vista externa de baixo.
- Preservar cores ao vivo, projetos salvos e exportação com pintura nativa.
- `npm test` antes/depois de cada bloco; testes pesados, processamento geométrico e compactação executados separadamente.
- Capturas com FERRAMENTAS_DADOS temporário. Publicar conforme AGENTS.md e atualizar CONTEXTO.md.

## Review Focus

- Contornos internos de letras/logo preservados e tamanho adequado ao bico de 0,4 mm.
- Bordas do novo fundo coincidem com a lateral, sem junções abertas nem faces invertidas.
- Transformações do arquivo 3MF preservadas; sem dupla escala no Copo 3.
- Nenhum novo objeto/parte dedicado à assinatura; base do Copo 1 não permanece uma lâmina removível de 0,2 mm.
- Pintura mantém duas cores e aparece no Anycubic; conferir propagação na primeira camada e exportação STL, que não armazena cores.

## Task 1 — geometria e composição da assinatura

**Files:** criar `electron/scripts/assinatura_copos.py`, teste correspondente em `electron/scripts/tests/test_assinatura_copos.py`; copiar logo oficial para asset próprio de construção, sem alterar o original.

- [x] Testes inicialmente vermelhos: limites da assinatura, textos exatos, underscores e orientação inferior, cap fechado/volume preservado em sólido simples.
- [x] Gerar contornos do SVG oficial e texto em arco com a fonte Rubik já incluída no programa.
- [x] Triangular regiões de fundo/marca, preservar vértices de contorno e orientar o fundo para fora (-Z).
- [x] Conferir uma prévia geométrica determinística da assinatura real.

## Task 2 — integração dos três modelos

**Files:** criar `electron/scripts/assinar-copos.py`; ampliar `electron/scripts/preparar-copos.mjs` com modo de entrada já normalizada e saída temporária.

- [x] Gerar os modelos em pasta temporária, a partir dos assets da v0.37.1, sem tocar nos originais externos.
- [x] Fundir somente as duas partes inferiores necessárias do Copo 1, mantendo a base fechada e a pintura superior.
- [x] Aplicar a assinatura no próprio mesh de base de cada modelo; conferir referências do build, componentes, pintura e ausência de partes de texto/logo.
- [x] Conferir contorno, orientação, fechamento, volume e medidas antes/depois; comparar superfícies acima da base.
- [x] Gerar pacotes de prévia sem repetir a adaptação de medidas e só então copiar os assets validados ao repositório.

## Task 3 — aplicativo, fatiador e publicação

- [x] Rodar npm test após alterações; capturar fundo dos três copos e cores ao vivo com dados temporários.
- [x] Exportar pelo aplicativo e conferir no Anycubic Slicer Next que a marca não é peça selecionável; inspecionar a pintura/camadas.
- [x] Revisão independente final de todo o bloco; corrigir achados confirmados.
- [ ] Consultar última release, escolher versão superior, testar, compilar, conferir pacote/manifest e publicar os três arquivos.
- [ ] Atualizar CONTEXTO.md com resultados, versão publicada e pendências; desativar a retomada agendada se o trabalho terminar antes das 9h.

## Ledger

- Baseline: 255 testes passaram (`--maxWorkers=1 --testTimeout=15000`).
- Ruling: marca com rebaixo de 0,2 mm, além da pintura — STL não armazena cor; somente faces coplanares perderiam a assinatura ao exportar. Não muda o envelope externo, altura ou encaixe, mas usa um rebaixo de uma camada de 0,2 mm no fundo, em vez de marca inteiramente coplanar.
- Retomada única às 9h em São Paulo criada: `retomar-copos-s-9h`; requer computador/app abertos e limites disponíveis.
- Diagnóstico: os fundos dos três meshes são discos preenchidos, sem vazios. Copo 1: base atual 0..0,2 mm (7.322 faces), a fundir ao acabamento adjacente. Copo 2: mesh único 1.711.770 faces nativas. Copo 3: base de aproximadamente 2,028 mm, 768 faces. Área útil permite marca dentro de raio de 36 mm em todos.
- Task 1: quatro testes Python passaram e npm test continuou com 255 passando, sem compactação/processamento pesado simultâneos. Módulo gera SVG vetorial, textos em arco, dois underscores e rebaixo fechado conectado; volume removido igual à área da marca × 0,2 mm. Próximo: integração nativa e fusão local do Copo 1.
- Task 2 parcial: Copos 1 e 3 gerados em `%TEMP%/copos-assinatura-codex/copo1-teste` e `copo3-teste`. Ambos fechados, orientados, bounds preservados e redução de volume de 130,2789978 mm³ (= área da marca × 0,2). A base fundida do Copo 1 vai até 1,5 mm; componente 2 retirado do conjunto/config, mantendo resource original sem referência.
- Ruling: selecionar somente faces no plano inferior com tolerância 1e-10 mm — a borda original do Copo 1 tem microchanfros em Z=1,43e-7 e 6,87e-7; a tolerância anterior 1e-6 removia essas faces laterais e abria nove arestas. Um quinto teste reproduziu a falha antes da correção e passou depois. Faces colineares da fonte são preservadas; remover faces por área antes da união abria sua topologia. Manifold recebe malhas nativas, e checagem de posições coincidentes usa dez casas decimais.
- Task 2 retomada às 9h: os três 3MF finais estão em `%TEMP%/copos-assinatura-codex/assinados-v2`. Fonte dos textos reforçada em 0,15 mm por lado para legibilidade do bico 0,4. Volume removido final comum: 149,4814029087 mm³; base de todos fechada/orientada e bounds preservados. Relatório completo `assinatura.json` nessa pasta. Caches em geração para `%TEMP%/copos-assinatura-codex/pacotes-assinados-v2`, com `--normalizados --paletas .../paletas.json`.
- Ruling: Copo 2 tem 108 faces inferiores com orientação oposta, sobrepostas às demais, mas a malha original bruta é fechada. Não soldar globalmente uma malha já fechada. Cortar cada triângulo conservando o sentido e chaves topológicas por face/aresta/vértice, sem soldar folhas distintas por coordenadas. Revisor independente confirmou causa das falhas; teste de dobra coplanar foi vermelho e passou após correção. Dez testes Python passaram. A prova leve de tampa em cap2.py terminou com zero arestas inesperadas.
- Aplicativo: capturas reais dos três fundos, cores alteradas/restauradas no evento input, seis exportações completas e zero IDs repetidos. Assets copiados somente após comparação; alturas 145 mm e bounds preservados. Botão Ver base e iluminação inferior acrescentados; Ajustar restaura vista normal.
- Fatiador: controles isolaram travamento C0000005 ao conservar placa e indicadores de projeto Bambu sem perfis. Produtor próprio + retirada da placa do arquivo exportado resolve; recursos ordenados/podados ao conjunto construído. Autoria, pintura, transformações e extruders preservados. Teste vermelho/verde. Os três 3MF importados/regravados com saída 0, mantendo partes 6/1/7, triângulos e marca preta na base; não há objeto de logo. Inspeção dos caminhos pretos na camada 0,4 mm do Copo 1 confirmou site, logo e Instagram, incluindo underscores. Não equivale a teste físico.
- Revisão independente final sem novos erros confirmados; 259 testes npm e 11 Python passaram. Proteção contra assinar novamente assets prontos. Build 0.38.0 terminou com saída 0; pacote/captura da aplicação empacotada e SHA-512 do manifest conferidos. SHA-256 EXE: 9ddf90537dfcf1978acf83bbfc31ca7e754143a2de82b5e5bc58aab918d6ba80. Publicação ainda pendente neste ponto do ledger.
