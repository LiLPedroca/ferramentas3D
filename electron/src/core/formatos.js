// Formatação para exibir dados guardados só com dígitos.

// "11987654321" -> "(11) 98765-4321"; "551133334444" -> "+55 (11) 3333-4444".
export function formatarTelefone(digitos) {
  let d = String(digitos ?? "").replace(/\D/g, "");
  if (!d) return "";
  let prefixo = "";
  if (d.length > 11 && d.startsWith("55")) {
    prefixo = "+55 ";
    d = d.slice(2);
  }
  if (d.length === 11) return `${prefixo}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${prefixo}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${prefixo}${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${prefixo}${d.slice(0, 4)}-${d.slice(4)}`;
  return prefixo + d;
}

export function formatarDocumento(digitos) {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

// Link do WhatsApp para um telefone brasileiro (adiciona 55 quando falta). Sem DDD: null.
export function linkWhatsApp(digitos) {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `https://wa.me/${d}`;
  return null;
}

// "Maria Souza Lima" -> "ML"; "ana" -> "A".
export function iniciais(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
