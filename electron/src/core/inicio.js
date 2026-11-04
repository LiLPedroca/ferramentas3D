// Lógica da tela inicial, sem dependência de interface (testável).

// Saudação pelo horário local (0–23).
export function saudacao(hora) {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

// Minúsculas e sem acentos, para a busca achar "orcamento" em "Orçamentos".
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// filtro: "todas" | "disponiveis" | "em-breve". Busca: todas as palavras precisam aparecer.
export function filtrarFerramentas(lista, { filtro = "todas", busca = "" } = {}) {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean);
  return lista.filter((f) => {
    if (filtro === "disponiveis" && !f.disponivel) return false;
    if (filtro === "em-breve" && f.disponivel) return false;
    const texto = normalizar(`${f.titulo} ${f.descricao} ${f.categoria}`);
    return palavras.every((p) => texto.includes(p));
  });
}

// "Bem-vindo, Pedro!" usando só o primeiro nome. Sem nome: "Bem-vindo!".
export function boasVindas(nome) {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0];
  return primeiro ? `Bem-vindo, ${primeiro}!` : "Bem-vindo!";
}

// Grupos com pelo menos uma ferramenta pronta, cada um com a sua lista.
export function gruposVisiveis(grupos, ferramentas) {
  return grupos
    .map((g) => ({ ...g, ferramentas: ferramentas.filter((f) => f.grupo === g.id && f.disponivel) }))
    .filter((g) => g.ferramentas.length > 0);
}

export function contarFerramentas(lista) {
  const disponiveis = lista.filter((f) => f.disponivel).length;
  return { total: lista.length, disponiveis, emBreve: lista.length - disponiveis };
}
