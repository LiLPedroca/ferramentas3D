// Divisão de um recebimento entre as formas de pagamento (ex.: Pix R$ 70 + Dinheiro R$ 30).
// Aparece só quando há duas ou mais formas marcadas. Escolher ou dividir não registra pagamento:
// o pagamento só é gravado quando a janela é confirmada.
import { centavosDeTexto } from "../core/produto.cjs";
import { el } from "./util-tela.js";

const ROTULOS = { debito: "Débito", credito: "Crédito", pix: "Pix", dinheiro: "Dinheiro" };

function reais(c) {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}R$ ${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(a % 100n).toString().padStart(2, "0")}`;
}

function centavos(texto) {
  try {
    const c = centavosDeTexto(texto, "Valor");
    return c === "" ? null : BigInt(c);
  } catch {
    return null;
  }
}

// alvo: elemento vazio; formas(): formas marcadas; valor(): BigInt do recebimento de agora (ou null).
export function criarDivisao(alvo, { formas, valor, aoMudar = () => {} }) {
  const valores = new Map(); // forma -> texto digitado (mantido ao marcar/desmarcar)
  const resumo = el("p", "divisao-resumo");
  const linhas = el("div", "divisao-linhas");
  alvo.replaceChildren(el("span", "rotulo-campo", "Quanto foi em cada forma"), linhas, resumo);

  const soma = () => formas().reduce((s, f) => s + (centavos(valores.get(f) ?? "") ?? 0n), 0n);

  function mostrarResumo() {
    const total = valor();
    const distribuido = soma();
    if (total === null) {
      resumo.textContent = `Distribuído: ${reais(distribuido)}. Informe o valor recebido.`;
      resumo.className = "divisao-resumo";
      return;
    }
    const falta = total - distribuido;
    resumo.textContent =
      `Recebimento: ${reais(total)} · Distribuído: ${reais(distribuido)} · ` +
      (falta === 0n ? "Tudo distribuído" : falta > 0n ? `Falta distribuir: ${reais(falta)}` : `Passou: ${reais(-falta)}`);
    resumo.className = `divisao-resumo ${falta === 0n ? "ok" : "falta"}`;
  }

  function atualizar() {
    const fs = formas();
    alvo.hidden = fs.length < 2;
    linhas.replaceChildren(
      ...fs.map((f) => {
        const input = el("input");
        input.inputMode = "decimal";
        input.autocomplete = "off";
        input.placeholder = "0,00";
        input.value = valores.get(f) ?? "";
        input.dataset.forma = f;
        input.setAttribute("aria-label", `Valor em ${ROTULOS[f]}`);
        input.addEventListener("input", () => {
          valores.set(f, input.value);
          mostrarResumo();
          aoMudar();
        });
        const entrada = el("div", "entrada");
        entrada.append(input, el("em", "", "R$"));
        const campo = el("label", "campo");
        campo.append(el("span", "", ROTULOS[f]), entrada);
        return campo;
      }),
    );
    mostrarResumo();
  }

  return {
    atualizar,
    limpar() {
      valores.clear();
      atualizar();
    },
    // Com uma forma só não há divisão. Com duas ou mais: cada uma > 0 e soma igual ao recebimento.
    valida() {
      const fs = formas();
      if (fs.length < 2) return true;
      const total = valor();
      if (total === null || total <= 0n) return false;
      if (fs.some((f) => (centavos(valores.get(f) ?? "") ?? 0n) <= 0n)) return false;
      return soma() === total;
    },
    ler() {
      const fs = formas();
      return fs.length < 2 ? undefined : fs.map((f) => ({ forma: f, valor: valores.get(f) ?? "" }));
    },
  };
}
