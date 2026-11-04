"""Barra de status do Claude Code: modelo, contexto, custo e limites.

Claude Code envia um JSON pelo stdin a cada atualização e exibe o que
este script imprimir. Não usa dependências externas.
"""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")


def barra(pct: float, largura: int = 10) -> str:
    pct = max(0.0, min(100.0, pct))
    cheio = round(pct / 100 * largura)
    return "▓" * cheio + "░" * (largura - cheio)


def formata_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)


def main() -> None:
    try:
        dados = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("statusline: sem dados")
        return

    modelo = (dados.get("model") or {}).get("display_name", "Claude")
    ctx = dados.get("context_window") or {}
    pct = float(ctx.get("used_percentage") or 0)
    tokens_ctx = int(ctx.get("total_input_tokens") or 0) + int(ctx.get("total_output_tokens") or 0)
    tamanho = int(ctx.get("context_window_size") or 0)

    custo = float((dados.get("cost") or {}).get("total_cost_usd") or 0)
    duracao_ms = int((dados.get("cost") or {}).get("total_duration_ms") or 0)
    minutos = duracao_ms // 60000

    partes = [
        f"[{modelo}]",
        f"ctx {barra(pct)} {pct:.0f}% ({formata_tokens(tokens_ctx)}/{formata_tokens(tamanho)})",
        f"US$ {custo:.2f}",
        f"{minutos} min",
    ]

    limites = dados.get("rate_limits") or {}
    cinco_horas = (limites.get("five_hour") or {}).get("used_percentage")
    if cinco_horas is not None:
        partes.append(f"5h {float(cinco_horas):.0f}%")

    print(" | ".join(partes))


if __name__ == "__main__":
    main()
