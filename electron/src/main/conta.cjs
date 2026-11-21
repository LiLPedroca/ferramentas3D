// Conta do usuário (Firebase Authentication pela API REST): entrar, criar conta, esqueci a senha,
// entrar com Google (pelo navegador) e manter a sessão entre aberturas do programa.
// A sessão fica em conta.json na pasta de dados, com o token de renovação cifrado pelo Windows.
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { createHash, randomBytes } = require("node:crypto");
const { ErroValidacao } = require("../core/validacao.cjs");

const ERROS = {
  EMAIL_EXISTS: "Já existe uma conta com este e-mail. Use Entrar.",
  EMAIL_NOT_FOUND: "E-mail ou senha incorretos.",
  INVALID_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_LOGIN_CREDENTIALS: "E-mail ou senha incorretos.",
  INVALID_EMAIL: "E-mail inválido.",
  MISSING_PASSWORD: "Digite a senha.",
  USER_DISABLED: "Esta conta foi desativada.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Muitas tentativas. Espere alguns minutos e tente de novo.",
  WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
  OPERATION_NOT_ALLOWED: "Este tipo de login não está ativado.",
  TOKEN_EXPIRED: "Sua sessão expirou. Entre de novo.",
  USER_NOT_FOUND: "Sua sessão expirou. Entre de novo.",
  INVALID_REFRESH_TOKEN: "Sua sessão expirou. Entre de novo.",
};

function mensagemDe(codigo) {
  const chave = String(codigo ?? "").split(/[ :]/)[0];
  return ERROS[chave] ?? "Não foi possível entrar agora. Confira a internet e tente de novo.";
}

class ErroSessao extends ErroValidacao {}

// opcoes: { pasta, apiKey, googleClientId, googleClientSecret, cifrar, decifrar, fetch, abrirNavegador }
function criarConta(opcoes) {
  const { pasta, apiKey } = opcoes;
  const fetch = opcoes.fetch ?? globalThis.fetch;
  const arquivo = path.join(pasta, "conta.json");
  let sessao = null; // { uid, email, refresh, idToken, expira }
  let carregada = false;

  async function postar(url, corpo, { form = false } = {}) {
    let resposta;
    try {
      resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
        body: form ? new URLSearchParams(corpo).toString() : JSON.stringify(corpo),
      });
    } catch {
      throw new ErroValidacao("Sem conexão com a internet.");
    }
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const codigo = json?.error?.message ?? json?.error;
      const Erro = /TOKEN|REFRESH|USER_NOT_FOUND|USER_DISABLED/.test(String(codigo)) ? ErroSessao : ErroValidacao;
      throw new Erro(mensagemDe(codigo));
    }
    return json;
  }

  const identidade = (acao) => `https://identitytoolkit.googleapis.com/v1/accounts:${acao}?key=${apiKey}`;

  async function gravar() {
    if (!sessao) {
      await fs.rm(arquivo, { force: true });
      return;
    }
    await fs.mkdir(pasta, { recursive: true });
    const conteudo = { versao: 1, uid: sessao.uid, email: sessao.email, refresh: opcoes.cifrar(sessao.refresh) };
    await fs.writeFile(`${arquivo}.tmp`, JSON.stringify(conteudo, null, 2), "utf8");
    await fs.rename(`${arquivo}.tmp`, arquivo);
  }

  async function carregar() {
    if (carregada) return;
    carregada = true;
    try {
      const d = JSON.parse(await fs.readFile(arquivo, "utf8"));
      if (d?.versao === 1 && d.uid && d.refresh) sessao = { uid: d.uid, email: d.email ?? "", refresh: opcoes.decifrar(d.refresh), idToken: "", expira: 0 };
    } catch {
      sessao = null; // sem sessão (ou arquivo de outro PC que o Windows não decifra)
    }
  }

  async function iniciar(r) {
    sessao = {
      uid: r.localId,
      email: r.email ?? "",
      refresh: r.refreshToken,
      idToken: r.idToken,
      expira: Date.now() + (Number(r.expiresIn) || 3600) * 1000,
    };
    await gravar();
    return { uid: sessao.uid, email: sessao.email };
  }

  function validarEntrada(email, senha) {
    const e = String(email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErroValidacao("Digite um e-mail válido.");
    const s = String(senha ?? "");
    if (!s) throw new ErroValidacao("Digite a senha.");
    return { email: e, password: s, returnSecureToken: true };
  }

  // Login com Google: abre o navegador e recebe a resposta num endereço local (127.0.0.1).
  async function codigoDoGoogle() {
    const verificador = randomBytes(32).toString("base64url");
    const desafio = createHash("sha256").update(verificador).digest("base64url");
    const estado = randomBytes(16).toString("hex");
    const servidor = http.createServer();
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    const redirect = `http://127.0.0.1:${servidor.address().port}`;
    const parametros = new URLSearchParams({
      client_id: opcoes.googleClientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      code_challenge: desafio,
      code_challenge_method: "S256",
      state: estado,
      prompt: "select_account",
    });
    try {
      const codigo = await new Promise((ok, falha) => {
        const tempo = setTimeout(() => falha(new ErroValidacao("O login com Google demorou demais. Tente de novo.")), 5 * 60 * 1000);
        servidor.on("request", (req, res) => {
          const u = new URL(req.url, redirect);
          if (u.pathname !== "/") {
            res.writeHead(404).end();
            return;
          }
          const certo = u.searchParams.get("state") === estado && u.searchParams.get("code");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            `<!doctype html><meta charset="utf-8"><title>Programa Ferramentas 3D</title><body style="font-family:sans-serif;text-align:center;padding:60px">` +
              (certo ? "<h2>Pronto! Pode voltar para o programa.</h2>" : "<h2>O login não foi concluído.</h2>") +
              "</body>",
          );
          clearTimeout(tempo);
          if (certo) ok(u.searchParams.get("code"));
          else falha(new ErroValidacao("O login com Google foi cancelado."));
        });
        opcoes.abrirNavegador(`https://accounts.google.com/o/oauth2/v2/auth?${parametros}`);
      });
      return { codigo, verificador, redirect };
    } finally {
      servidor.close();
    }
  }

  return {
    googleDisponivel: () => Boolean(opcoes.googleClientId),

    async estado() {
      await carregar();
      return sessao ? { uid: sessao.uid, email: sessao.email } : null;
    },

    async entrar(email, senha) {
      return iniciar(await postar(identidade("signInWithPassword"), validarEntrada(email, senha)));
    },

    async criar(email, senha) {
      if (String(senha ?? "").length < 6) throw new ErroValidacao("A senha precisa ter pelo menos 6 caracteres.");
      return iniciar(await postar(identidade("signUp"), validarEntrada(email, senha)));
    },

    async esqueciSenha(email) {
      const e = String(email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErroValidacao("Digite o seu e-mail para receber o link.");
      try {
        await postar(identidade("sendOobCode"), { requestType: "PASSWORD_RESET", email: e });
      } catch (erro) {
        if (erro.message === ERROS.EMAIL_NOT_FOUND) return true; // não revela se o e-mail tem conta
        throw erro;
      }
      return true;
    },

    async entrarComGoogle() {
      if (!opcoes.googleClientId) throw new ErroValidacao("O login com Google não está disponível.");
      const { codigo, verificador, redirect } = await codigoDoGoogle();
      const tokens = await postar(
        "https://oauth2.googleapis.com/token",
        {
          code: codigo,
          client_id: opcoes.googleClientId,
          client_secret: opcoes.googleClientSecret,
          redirect_uri: redirect,
          grant_type: "authorization_code",
          code_verifier: verificador,
        },
        { form: true },
      );
      if (!tokens.id_token) throw new ErroValidacao("O Google não confirmou o login. Tente de novo.");
      const r = await postar(identidade("signInWithIdp"), {
        postBody: new URLSearchParams({ id_token: tokens.id_token, providerId: "google.com" }).toString(),
        requestUri: "http://localhost",
        returnSecureToken: true,
        returnIdpCredential: true,
      });
      return iniciar(r);
    },

    async sair() {
      await carregar();
      sessao = null;
      await gravar();
    },

    // Token válido para a nuvem (renova quando falta menos de 5 minutos).
    async token() {
      await carregar();
      if (!sessao) throw new ErroSessao("Entre na sua conta para sincronizar.");
      if (sessao.idToken && Date.now() < sessao.expira - 5 * 60 * 1000) return sessao.idToken;
      const r = await postar(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, { grant_type: "refresh_token", refresh_token: sessao.refresh }, { form: true });
      sessao.idToken = r.id_token;
      sessao.expira = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      if (r.refresh_token && r.refresh_token !== sessao.refresh) {
        sessao.refresh = r.refresh_token;
        await gravar();
      }
      return sessao.idToken;
    },
  };
}

module.exports = { ErroSessao, criarConta, mensagemDe };
