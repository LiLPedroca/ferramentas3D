// Pequenas utilidades das telas.

// 1536 -> "1,5 KB"
export function ROTULO_TAMANHO(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = n / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unidades[i]}`;
}

export function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Liga uma área de "arraste ou clique" a um <input type="file">.
export function ligarZonaArquivos(zona, entrada, aoEscolher) {
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      entrada.click();
    }
  });
  entrada.addEventListener("change", () => {
    const arquivos = [...entrada.files];
    entrada.value = "";
    if (arquivos.length) aoEscolher(arquivos);
  });
  zona.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    zona.classList.add("sobre");
  });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (ev) => {
    ev.preventDefault();
    zona.classList.remove("sobre");
    const arquivos = [...ev.dataTransfer.files];
    if (arquivos.length) aoEscolher(arquivos);
  });
}
