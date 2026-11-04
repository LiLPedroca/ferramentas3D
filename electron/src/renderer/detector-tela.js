// Tela do Detector de IA: analisa os metadados das imagens escolhidas.
import { detectarIA, RESUMOS } from "../core/detector-ia.js";
import { el, ligarZonaArquivos, ROTULO_TAMANHO } from "./util-tela.js";

const $ = (id) => document.getElementById(id);
const LIMITE = 100 * 1024 * 1024;

const urls = []; // miniaturas criadas (liberadas ao limpar)

async function analisar(lista) {
  for (const arquivo of lista.slice(0, 30)) {
    const cartao = el("div", "ia-cartao");
    const miniatura = el("div", "ia-miniatura");
    const corpo = el("div", "ia-corpo");
    cartao.append(miniatura, corpo);
    $("ia-resultados").prepend(cartao);

    corpo.append(el("strong", "ia-nome", arquivo.name), el("span", "cliente-sub", ROTULO_TAMANHO(arquivo.size)));
    try {
      if (arquivo.size > LIMITE) throw new Error("Arquivo maior que 100 MB.");
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const r = detectarIA(bytes);

      const url = URL.createObjectURL(arquivo);
      urls.push(url);
      const img = el("img");
      img.src = url;
      img.alt = "";
      miniatura.append(img);

      const resumo = RESUMOS[r.nivel];
      const veredito = el("div", `ia-veredito ${r.nivel}`);
      veredito.append(el("strong", "", resumo.titulo), el("span", "", resumo.texto));
      corpo.append(veredito);

      if (r.evidencias.length) {
        const lista = el("ul", "ia-evidencias");
        for (const e of r.evidencias) {
          const li = el("li", e.forca);
          li.append(el("strong", "", e.rotulo), el("span", "", e.detalhe));
          lista.append(li);
        }
        corpo.append(lista);
      }
      if (r.metadados === 0 && r.nivel === "nenhum") {
        corpo.append(el("p", "ajuda", "A imagem não tem metadados: não há o que conferir."));
      }
    } catch (erro) {
      corpo.append(el("p", "erro", erro.message));
    }
  }
  $("ia-limpar").hidden = false;
}

export function iniciarDetector() {
  ligarZonaArquivos($("ia-zona"), $("ia-entrada"), analisar);
  $("ia-limpar").addEventListener("click", () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    $("ia-resultados").replaceChildren();
    $("ia-limpar").hidden = true;
  });
}
