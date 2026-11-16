# Relevo por cor, cores no fatiador e material na exportação

Aprovado pelo Pedro em 16/11/2026. Implementar só depois do "comece".

## 1. Relevo: cada cor sobe só quando é aumentada
Hoje, com AMS ("cor só no topo"), a cor da base (a de maior área, ex.: preto) sobe por baixo de cada parte
até `altura da parte − 0,6`. Se o branco ganha +1,6 mm, o preto sobe junto e a lateral do relevo sai preta.

Novo: embaixo de uma parte de outra cor, a base vai só até `min(altura da parte, altura das partes) − 0,6`.
A cor da parte ocupa daí até o topo. O preto só sobe se o relevo do próprio preto (ou a altura daquela
parte preta no balão) aumentar. Vale igual para altura mudada no balão. Sem AMS não muda.
Código: `modelos/relevo.js`, ramo "com AMS" de `gerarRelevo`.

## 2. Cores certas no Anycubic Slicer Next
O Anycubic só lê `filament_colour` quando o 3MF traz um `Metadata/project_settings.config` **completo**
(estilo Bambu, ~600 chaves). Testado pelo Pedro com `dev/teste-cores/Santos - teste de cores.3mf`:
cores certas e impressora Kobra X mantida.
Gerar esse arquivo em todo 3MF do programa a partir de um modelo completo embutido (sem dados pessoais),
trocando `filament_colour`, `filament_settings_id`, `filament_type` e a quantidade de filamentos.

## 3. Material na pergunta "Como você vai imprimir?"
Abaixo de "Com AMS / Sem AMS": **Material: PLA | PETG**.
- Um material para todas as cores. Lembra a última escolha; padrão PLA, nos Copos PETG.
- O 3MF usa o perfil Anycubic do material para a Kobra X 0.4.
- Peso estimado usa a densidade do material (PLA 1,24; PETG 1,27 g/cm³).

## 4. Calculadora: "Valor da peça"
3º quadradinho do resultado, em azul, depois de "Custo por peça" e "Lucro por peça":
**Valor da peça** = (custo do lote − mão de obra) ÷ quantidade = filamento + energia + impressora, por peça.
Exemplo do Pedro: custo R$ 60,45, mão de obra R$ 15,00 → R$ 45,45.

## 5. Calculadora: conjunto (kit)
Botão **"+ Adicionar peça ao conjunto"** em "Dados do lote". Cada peça: nome, peso, tempo, quantidade
(pode vir de Meus produtos) e mostra o seu valor sem mão de obra. Tempos são somados (impressões
separadas; quem imprimir junto põe o tempo total numa peça e 0 nas outras). Mão de obra e lucro entram
uma vez, sobre o conjunto. Resultado: **Preço do conjunto**. Com 1 peça, a calculadora fica como hoje.

## 6. Produtos: exportar e importar (levar de um PC para outro)
Na tela Produtos: **"Exportar produtos"** (um arquivo com todos os produtos e todas as informações,
foto inclusa) e **"Importar produtos"**, que **junta e nunca apaga**: produto novo entra; o mesmo produto
(mesmo id) fica com a versão de `atualizadoEm` mais recente; produtos só do PC de destino ficam como estão.
No fim: "N novos, M atualizados". Validar tudo no processo principal (`core/produto.cjs`), igual ao
cadastro. Só produtos por enquanto (clientes, orçamentos etc. ficam de fora).
