// Worker do Conversor SVG: vetoriza fora da tela principal.
import { vetorizar } from "./vetorizar.js";

self.onmessage = (evento) => {
  const { id, imagem, opcoes } = evento.data;
  try {
    self.postMessage({ id, ...vetorizar(imagem, opcoes) });
  } catch (erro) {
    self.postMessage({ id, erro: erro?.message ?? String(erro) });
  }
};
