import "./config.js";
import { getConfig, Repository } from "./src/repository.js";
import { Application } from "./src/application.js";
const $ = (s) => document.querySelector(s);
let repo,
  application,
  recoveryMode =
    /[?&]recovery=1/.test(location.search) ||
    /type=(invite|recovery)/.test(location.hash),
  authPending = false;
function message(text) {
  $("#auth-message").textContent = text;
}
function locked(text = "") {
  application?.stop();
  application = null;
  $("#application").hidden = true;
  $("#application").classList.remove("is-visible");
  $("#auth-screen").classList.add("active");
  if (text) message(text);
}
async function enter() {
  if (authPending || application || recoveryMode) return;
  authPending = true;
  let next;
  try {
    next = new Application(repo, locked);
    await next.start();
    if (next.stopped) return;
    application = next;
    $("#application").hidden = false;
    $("#application").classList.remove("auth-locked");
    $("#application").classList.add("is-visible");
    $("#auth-screen").classList.remove("active");
    message("");
  } catch (e) {
    next?.stop();
    locked(e.message);
  } finally {
    authPending = false;
  }
}
function recovery() {
  recoveryMode = true;
  locked();
  $("#auth-title").textContent = "Defina sua senha";
  $("#auth-description").textContent =
    "Escolha uma senha para concluir seu acesso autorizado.";
  $("#auth-email").closest("label").hidden = true;
  $("#auth-email").required = false;
  $("#auth-password").autocomplete = "new-password";
  $("#auth-password").minLength = 8;
  $("#auth-submit").textContent = "Salvar nova senha";
  $("#forgot-password").hidden = true;
}
async function boot() {
  try {
    const config = getConfig();
    if (!config.key) {
      message(
        "Configure a chave pública do Supabase desta instalação para habilitar o acesso. Nenhum dado será salvo como demonstração.",
      );
      $("#auth-submit").disabled = true;
      $("#forgot-password").disabled = true;
      return;
    }
    repo = new Repository(config);
    repo.client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recovery();
      else if (!session) locked();
      else
        setTimeout(() => {
          if (recoveryMode) recovery();
          else void enter();
        }, 0);
    });
    const { data, error } = await repo.client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      if (recoveryMode) recovery();
      else await enter();
    }
    $("#auth-form").onsubmit = async (e) => {
      e.preventDefault();
      $("#auth-submit").disabled = true;
      message("Verificando acesso…");
      try {
        if (recoveryMode) {
          const { error } = await repo.client.auth.updateUser({
            password: $("#auth-password").value,
          });
          if (error) throw error;
          recoveryMode = false;
          history.replaceState(null, "", location.pathname);
          $("#auth-email").closest("label").hidden = false;
          $("#auth-email").required = true;
          $("#auth-title").textContent = "Bem-vindo de volta";
          $("#auth-submit").textContent = "Entrar no Partiva";
          $("#forgot-password").hidden = false;
          await enter();
        } else {
          const { error } = await repo.client.auth.signInWithPassword({
            email: $("#auth-email").value.trim(),
            password: $("#auth-password").value,
          });
          if (error) throw error;
          await enter();
        }
        $("#auth-password").value = "";
      } catch (error) {
        message(error.message);
      } finally {
        $("#auth-submit").disabled = false;
      }
    };
    $("#forgot-password").onclick = async () => {
      if (!$("#auth-email").reportValidity()) return;
      $("#forgot-password").disabled = true;
      try {
        const { error } = await repo.client.auth.resetPasswordForEmail(
          $("#auth-email").value.trim(),
          { redirectTo: `${location.origin}/?recovery=1` },
        );
        if (error) throw error;
        message(
          "Se houver um acesso correspondente, você receberá instruções por e-mail.",
        );
      } catch (error) {
        message(error.message);
      } finally {
        $("#forgot-password").disabled = false;
      }
    };
    $("#sign-out").onclick = async () => {
      try {
        if (application?.uploading)
          throw new Error("Aguarde os envios terminarem.");
        if (application?.editor?.dirty) await application.savePiece();
        if (
          (application?.companyDirty || application?.memberDirty) &&
          !confirm("Sair sem salvar o preenchimento da empresa?")
        )
          return;
        const { error } = await repo.client.auth.signOut({ scope: "local" });
        if (error) throw error;
        locked();
      } catch (e) {
        application?.notify(e.message, true);
      }
    };
  } catch (e) {
    locked(e.message);
    $("#auth-submit").disabled = true;
  }
}
void boot();
