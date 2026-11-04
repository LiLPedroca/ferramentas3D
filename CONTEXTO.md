# Contexto do projeto: Programa Ferramentas 3D (calculadora de custo 3D)

## Objetivo
Programa desktop para Windows 10 e 11 que calcula custo e preço de peças impressas em 3D.
Desenvolvido por Pedro em vibe coding, do zero. Não reaproveitar código de outros projetos sem conferir.

## Idioma
- Conversa com o usuário: português do Brasil.
- Interface do app: português do Brasil.
- Nomes de código, funções, variáveis e testes: português ou inglês técnico, com consistência dentro do módulo. O núcleo atual usa português (`calcular`, `Entrada`, `Resultado`).

## Stack
- Python 3.11 ou superior.
- PySide6 para a interface (ainda não criada).
- pytest para testes.
- PyInstaller para gerar o `.exe` (ainda não configurado).
- Frações (`fractions.Fraction`) para toda a aritmética de dinheiro. Arredondar para centavos só na exibição, com `to_reais`, usando meio para cima.

## Estrutura atual
```
Programa-ferrantas3D/
├── app/
│   ├── __init__.py
│   └── core/
│       ├── __init__.py
│       └── calculadora.py     (regras de negócio, pronto e testado)
├── tests/
│   └── test_calculadora.py    (12 testes, passando)
├── requirements.txt           (vazio por enquanto)
├── requirements-dev.txt       (pytest)
└── CONTEXTO.md                (este arquivo)
```

## Regras de negócio (já implementadas em `app/core/calculadora.py`)
- Filamento = peso (g) / 1000 × preço por kg.
- Energia = potência (W) / 1000 × horas × tarifa por kWh.
- Impressora = horas × custo por hora.
- Custo do lote = filamento + energia + impressora + mão de obra.
- Preço do lote = custo do lote × (1 + lucro% / 100). O lucro é sobre o custo, não é margem sobre a venda.
- Valores unitários = total ÷ quantidade de peças.
- Lucro unitário = preço unitário − custo unitário.
- Projeção: peças para pagar a impressora = teto(valor da impressora ÷ lucro por peça). Só calcula com lucro positivo. Sem lucro, retorna None.
- Validação: valores negativos e quantidade menor que 1 geram `EntradaInvalida`.

## Como rodar (PowerShell, na pasta do projeto)
```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest
```

## Decisões em aberto
1. Lucro padrão: campo preenchível ou valor inicial fixo?
2. Histórico de cálculos: salvar em JSON simples na pasta do programa, ou não salvar nada por enquanto?
3. Tela: campos de entrada, botão de calcular e painel de resultado. Definir layout depois da primeira versão funcional.

## Referência externa
Existe um pacote de código gerado anteriormente pelo Codex (`calculadora-codigo-0.19.1`). Ele é um recorte de um app web maior e depende de muitos arquivos externos. Use-o só como referência das regras de negócio, não como base de código.

## Convenções
- Não apagar arquivos sem pedir permissão ao usuário.
- Testar cada regra de cálculo antes de montar a interface.
- Não guardar dados pessoais nem chaves de API no código.
- Testar caminhos com espaços e acentos (ex.: "Pedro Henrique").
- O app não deve exigir privilégios de administrador.

## Próximos passos
1. Criar a interface PySide6 em `app/ui/`, ligando os campos ao `calcular`.
2. Adicionar `PySide6` em `requirements.txt`.
3. Testar a interface manualmente no Windows, com escala de DPI de 100%, 125% e 150%.
4. Configurar o PyInstaller e gerar o `.exe` de teste.
