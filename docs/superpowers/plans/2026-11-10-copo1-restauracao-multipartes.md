# Copo 1 completo e multipartes — plano

> **For agentic workers:** Use superpowers:executing-plans ou subagent-driven-development para executar este plano por tarefa.

**Goal:** Restaurar o Copo 1 completo e exportar sua referência multiparte assinada, com diagnóstico da pintura da logo.
**Architecture:** Pipeline offline mantém meshes/cores; aplicativo usa arquivo completo ou projeto nativo de três placas conforme opção explícita. Somente o Copo 1 tem multipartes.
**Tech Stack:** Electron, JavaScript, Python, Manifold, 3MF, Anycubic Slicer Next.
**Spec:** docs/superpowers/specs/2026-11-10-copo1-restauracao-multipartes-design.md

## Restrições
- Repositório direto na branch electron; não usar ZIP/worktree nem apagar originais/código legado.
- Preservar decoração branca, altura145/boca nominal81,4 e cavidade; assinatura integrada na base.
- Novo multipartes conserva três placas/peças e seus encaixes, cores ao vivo e perfil PETG com gramas.
- Somente Copo 1: botão multipartes habilita quando pronto e desabilita durante carga/exportação; demais Em breve.
- FERRAMENTAS_DADOS temporário em capturas; não tocar processo/dados reais do usuário.

## Tarefas
- [x] Baseline npm e diagnóstico de referência/estrutura; testes de regressão antes da mudança.
- [x] Restaurar drapeado branco completo, validar união/cores/assinatura/cavidade, gerar cache/miniatura.
- [x] Assinar base do multipartes em cópia, integrar exportação seletiva e testar cores/placas/erros.
- [x] Investigar branco na logo na primeira camada do Gcode; corrigir somente causa confirmada e testar.
- [x] Testes completos, capturas/exportações reais e validação dos arquivos no fatiador.
- [x] Conferir última release, versão/build/manifest, revisão e publicação com três assets/digests.
- [x] Registrar conclusão e pendências no CONTEXTO.md.

## Ledger
- HEAD e2ce114 v0.39.0, árvore limpa antes desta tarefa. Original multipartes SHA256 e77d36a5fe69e14e5d83108e2f1ddeeeb4f21391b7a50c8672c6bedb237107fb, 23.246.111 bytes. Três placas: base7, argola11, tubo9. Base contém seis partes incluindo texto PERSONALIZE AQUI; preservar decoração e texto nativos.
- Baseline npm lançado antes das mudanças. Computador sob carga extrema: testes antigos de fontes/escopo/vetor excederam tempos sem mudança nesses códigos; registrar resultado e repetir isolado, sem enfraquecer asserções.
- Restauração do completo delegada apenas ao script preparar_copos_completos.py/teste respectivo e arquivos temporários. Diagnóstico da logo delegado em leitura a partir do Gcode existente. Pai cuida do novo multipartes e integração, revisão/validação/publicação comuns.

- 11/11: regressões JS observadas em vermelho (5falhas/11); após exportador nativo multipartes, IPC restrito ao Copo1, menu seletivo e perfil no_brim: 11/11 verdes. Mock de prévia corrigido para expor colorir. npm completo292/293, única falha vetorizador por desempenho9,25s>8s sob concorrência; repetir isolado sem alterar limite.
- Diagnóstico Gcode confirmou117,467mm de caminhos brancos dentro da logo, todos do brim na primeira camada. Controle sem brim:0mm; camadas2/3 já limpas. Perfil dos copos desativa brim automático, pois limitar ao exterior também cria bordas nas ilhas internas das letras.
- Última release conferida via gh:0.39.0; novo recurso multiparte preparado como0.40.0.

- Revisão independente final de JS/IPC/scripts: sem erro confirmado. Multipartes:27/27Python, base fechada51056tri,3placas e demais geometrias/índices/transforms preservados.
- Ruling: união do completo retriangula23facetas microscópicas do rebaixo, área total0,00776037mm²/máx0,00287974mm², deslocamento≤0,2mm limitado ao rebaixo; aceitar como limitação numérica após conferência da superfície restante e captura/fatia, conforme revisão independente. Custo: não há identidade geométrica estrita nessas facetas, conferir impressão física da marca. Não alterar encaixe nem profundidade para corrigir artefato menor que o bico.
- 11/11 (Claude Code): validação do completo restaurado aprovada com limite 0,005 mm na base (erro real 0,0045 mm em 1 vértice da borda do rebaixo); assets integrados; npm 293/293, Python 27/27; captura 0.40.0 ok; fatiado: completo 8h02m55s/185,69 g, multipartes 5h12m55s/118,18 g; release v0.40.0.
