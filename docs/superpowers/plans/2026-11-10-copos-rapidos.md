# Copos completos e impressão rápida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** exportar os três copos como peça completa, com nomes corretos, peso real estimado pelo fatiador e impressão otimizada próxima de cinco horas.

**Architecture:** preparar assets unidos e pintados fora do aplicativo, preservando o catálogo e os projetos. Corrigir a exportação de metadados/perfil PETG e adicionar somente o item de menu pedido.

**Tech Stack:** Electron/Three.js, Vitest, Python/Manifold/trimesh, Anycubic Slicer Next.

**Spec:** `docs/superpowers/specs/2026-11-10-copos-rapidos-design.md`; conversa aprovada pelo usuário com “comece”.

## Global Constraints

- Repositório atual, branch electron; sem worktree, sem ZIP da fonte, sem apagar arquivos/código/originais.
- Altura 145 mm e encaixe nominal 81,4 mm; preservar assinatura e cores ao vivo.
- Um copo completo, sem partes para montagem nem acessórios soltos.
- Peso não pode ser zero por falta de densidade. Não falsificar estimativa de tempo.
- Dados/capturas/fatiador em pastas temporárias; npm test antes/depois de cada bloco, sem concorrência com cargas pesadas.
- Publicação autorizada; conferir última release e publicar versão superior.

## Review Focus

- Pintura subdividida e assinatura após união: conservar cores, orientação e legibilidade.
- Partes encostadas e pequenas folgas: conferir conexão real, não apenas quantidade de objetos no XML.
- Projetos antigos: preservar escolhas de cor e editor legado.
- Perfis importados: PETG com densidade/diâmetro positivos, nomes corretos, sem nomes internos antigos ou filamentos ociosos.
- Tempo: comparar com mesma máquina/material; não aumentar fluxo acima do perfil de referência para atingir um número.

## Task 1 — diagnóstico e geometria

- [x] Baseline npm: 259 testes passaram.
- [x] Auditar partes, fechamento, contatos e pintura dos três assets; comparar perfil original e exportado.
- [x] Criar teste geométrico que falhe para saída com múltiplos componentes; teste de preservação de pintura/assinatura e medidas.
- [x] Implementar preparação dos copos em `electron/scripts`, com saída separada e relatório; unir partes estruturais e preservar pintura.
- [x] Validar em pasta temporária e regenerar caches; substituir somente assets aprovados pelas comparações.
- [x] Rodar testes geométricos e npm após o bloco.

## Task 2 — exportação, perfil e menu

- [x] Testes vermelhos em `electron/tests/copos-exportar.test.js`: título/nome interno correto; densidade/diâmetro PETG positivos para cada cor; apenas um copo no build e paleta sem slots ociosos.
- [x] Corrigir `copos-exportar.js` e passar nome/material do catálogo pela tela. Preservar recoloração sem cascata.
- [x] Testar e incluir item desativado “Exportar em multipartes — Em breve” no menu, sem ação/listener.
- [x] Verificar antes/depois no fatiador usando dados temporários; medir peso/tempo com o processo escolhido.
- [x] Rodar npm test após o bloco e capturar três modelos, assinatura, exportações e cores ao vivo.

## Task 3 — revisão e publicação

- [x] Revisão independente final; corrigir erros confirmados com teste.
- [x] Conferir última release, escolher versão, testar, compilar e conferir aplicativo empacotado/manifest.
- [x] Commit/push na electron; publicar instalador/blockmap/latest.yml e verificar hashes/última release.
- [x] Atualizar CONTEXTO.md e este ledger com tempos, pesos, decisões e pendências físicas.

## Ledger

- Baseline HEAD 918a8f9 (v0.38.0 publicada), árvore limpa, electron. 259 testes passaram em 104 s.
- Diagnóstico: exportador atual reduz project_settings.config a filament_colour. O perfil original conserva PETG/densidade 1,23, diâmetro 1,75, camada 0,24, duas paredes, 15% de preenchimento e fluxo 8 mm³/s. Exportação sem material/processo explica a hipótese de perfil vazio, peso zero e diferença de tempo; confirmar por importação.
- Medição anterior comparável (Kobra X/PETG, 0,20): Copo 1 9h40m30s; Copo 2 6h18m43s; Copo 3 7h35m04s. Foto do usuário com perfil importado: Copo 2 13h49, peso 0 g. Não comparar essas configurações como se fossem iguais.
- Geometria: Copo 1 seis partes Manifold válidas; Copo 2 um mesh Manifold válido; Copo 3 corpo válido e seis faixas/base com vértices duplicados a tratar. Auditoria e ensaios de união temporários em `%TEMP%/copos-rapidos-codex`.
- Ruling: executar diretamente no repositório e não pedir novamente autorização de implementação/publicação — pedido “comece” e regras anteriores já autorizam esse escopo. Plano e spec registram escolhas técnicas; a meta será aferida, não prometida.
- Ruling: retirar a capa “Drapeado branco com encaixe” do Copo 1, pois é acessório de montagem sobre um corpo já fechado; manter base, faixas estruturais, corpo e borda. A folga de 0,15 mm da boca é fechada por ponte interna entre raios 41,5 e 42,05 mm, sem invadir o encaixe de raio 40,7. Essa interpretação foi comunicada ao Pedro durante a execução; o pedido “somente o copo” autoriza retirar acessórios do arquivo, preservando os originais.
- Ruling: ajustar o início da borda do Copo 3 para Z=140,63989 (antes 139,57831), mantendo altura 145 mm e boca. Evita cortar a pintura de faces longas do corpo. Transporte afim de pintura limitado a 0,4 mm (uma largura de extrusão); observado até 0,393 mm em pequena parte das faces do corpo. Logo/assinatura do fundo usa pintura uniforme e não sofre esse transporte. Conferir visualmente a pintura e registrar a limitação; não afirmar precisão física não medida.
- Vermelho/verde: união estrutural rejeita peças desconectadas, aceita ponte interna e fecha folgas numéricas; código aceita arrays readonly do Manifold. Pintura remapeia folhas/cores e acompanha rotação dos vértices; limite de transporte testado. Arquivo resultante é um objeto/mesh/parte, sem components.
- Perfil próprio gerado de presets oficiais locais Anycubic Kobra X 0.4 + processo + PETG, sem dados de conta: camada 0,28, primeira camada 0,24, duas paredes, 15% de preenchimento, fluxo PETG 8 mm³/s, densidade 1,23 e diâmetro 1,75. Testes de exportação e menu passaram (8 testes JS); 11 testes Python novos passaram. STL passa a usar a malha nativa unida, sem transformar subdivisões de pintura em triângulos estruturais.
- Primeiro ensaio comparável de processo, Copo 2 ainda com geometria antiga: 5h25m18s em 0,28, contra 6h18m43s em 0,20; primeira camada ainda 0,20 nesse ensaio. Meta aproximada, não tempo real medido numa impressão.
- Copo 1 gerado em `%TEMP%/copos-rapidos-codex/completos-v1`: uma componente estrutural, 1.573.284 faces, 83.594,8973 mm³, altura 145 mm. Copos 2/3 em preparação; não substituir os assets antes de concluir os relatórios. Fatiamento direto do perfil incorporado do Copo 1 em execução, sem presets externos.
- Task 1/2 concluídas: os três assets/caches copiados após validação. Contagens STL estruturais: 1.573.284 / 1.751.074 / 390.754. Todos com altura 145 mm, um objeto/mesh/parte no 3MF, perfil PETG com duas cores, assinatura integrada. Caches preservam seletores Principal/Detalhes. Miniaturas regeneradas a partir das vistas reais.
- 290 testes npm passaram após dividir o teste antigo de 29 fontes em um caso por fonte, mantendo as 87 gerações/checagens originais; falha anterior era timeout agregado de 60 s (69,4 s). Os 22 testes Python passaram. Revisão independente de runtime, perfil, STL, união e pintura, seguida de revisão dos últimos ajustes, sem erro confirmado.
- Captura `app-039b.png`: seis exportações reais, cores ao vivo nos três, bases/textos/underscores conferidos, menu Em breve desativado, zero IDs repetidos. Primeira captura usava espera fixa de 900 ms e falhou na comparação de cor sob carga; repetição aguardando mudança do frame passou. Geometria Float32 do cache do Copo 2 é byte a byte igual à da v0.38, além da nova cor branca na descrição. Captura do app empacotado confirmou Versão 0.39.0, Copo 3, cores ao vivo e menu desativado.
- Exportações efetivas em `exportados-039b` comparadas aos arquivos fatiados: hashes dos meshes e JSON do perfil iguais, STL com contagens estruturais e altura corretas. Relatórios `validacao-exportacoes.json`, `validacao-pacotes.json`, `validacao-fatiamento-final.json`.
- Fatiamento direto dos três 3MF com somente perfil incorporado, saída 0: Copo 1 4h48m23s / 115,08 g; Copo 2 5h25m05s / 126,03 g; Copo 3 6h15m40s / 151,41 g. Cada um tem 518 camadas e altura máxima 145 mm. Pesos incluem o total calculado pelo fatiador (modelo/purga). A meta aproximada de cinco horas não foi atingida pelo Copo 3; registrar como limite/otimização pendente, sem declarar que todos imprimem em cinco horas. Processo conserva fluxo 8 mm³/s, duas paredes e 15% de preenchimento.

- Conferência adicional pré-publicação detectou aumento local da cavidade na tentativa de cortar toda a borda do Copo 3. Corrigido antes de publicar: recorte somente externo, lábio interno conservado até raio 41,26 mm. Teste vermelho/verde com volume calculado por fórmula independente; união final sem componentes soltos. Seções internas em cinco alturas diferem menos de 0,015 mm da referência na amostragem dos triângulos. Nova malha: 394.796 faces, 261.960,4709 mm³, erro de pintura máximo 0,39288 mm em 1.115 faces. Subdivisões uniformes colapsadas sem deformar cores.
- Fatiamento do Copo 3 corrigido concluído: 6h17m53s, 152,31 g (57,51 + 94,80), 518 camadas, 145 mm. Substitui a medição anterior de 6h15m40s/151,41 g. Relatórios validacao-encaixe-borda3.json e validacao-fatiamento-copo3-corrigido.json na pasta temporária. Revisão independente dos dois ajustes sem erro confirmado.

- Verificação final após os ajustes: 24 testes Python passaram; 290 testes npm / 33 arquivos passaram em 148,13 s. Rodada concorrente anterior falhou somente no benchmark antigo do vetorizador (10,1 s versus 8 s), sem alteração no código/teste do vetor; repetição completa isolada passou. Novo dist inclui o asset v2 do Copo 3.

- Dist final: saída 0; 247.967.884 bytes, SHA-256 3f6d3ff34cdf476875488e40296ab8b5149a884459878537b1078a82617009b0; manifest SHA-512/tamanho e blockmap conferidos. Última release reconferida v0.38.0, origin/electron sincronizada.

- Publicação concluída: v0.39.0 no commit 5c1e2329580f63b09b237129cf998976661742f5, push electron confirmado. releases/latest: sem draft/prerelease, três assets uploaded, tamanho e SHA-256 dos três iguais aos locais. CONTEXTO registra conclusão e pendências físicas/tempo do Copo 3; nenhuma release pendente.
