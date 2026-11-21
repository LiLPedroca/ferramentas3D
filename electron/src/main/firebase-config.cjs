// Projeto do Firebase usado pela conta e pela sincronização.
// A apiKey do Firebase não é secreta: só identifica o projeto. Quem protege os dados são as
// regras do Firestore (cada conta só lê e grava em usuarios/<seu uid>). Combinado com o Pedro
// em 21/11/2026 (exceção à regra "sem chaves no código").
"use strict";

function google() {
  try {
    const { googleClientId = "", googleClientSecret = "" } = require("./google-oauth.local.cjs");
    return { googleClientId, googleClientSecret };
  } catch {
    return { googleClientId: "", googleClientSecret: "" };
  }
}

module.exports = {
  apiKey: "AIzaSyBqhLEoWLwwTTW5XsNNGrtg5ZYEt4NIXLQ",
  projectId: "ferramenta3d-af2c6",
  // Login com Google: o cliente OAuth fica em google-oauth.local.cjs, fora do git (o repositório é
  // público). Sem esse arquivo, o botão "Entrar com Google" não aparece.
  ...google(),
};
