const logEl = document.getElementById("log");
const apiKeyInput = document.getElementById("apiKeyInput");
const botInput = document.getElementById("botInput");
const btnSaveConfig = document.getElementById("btnSaveConfig");
const btnCloseAll = document.getElementById("btnCloseAll");

let savedConfig = { apiKey: "", botShortName: "" };

function log(msg, obj) {
  const line = obj ? `${msg} ${JSON.stringify(obj, null, 2)}` : msg;
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${line}\n` + logEl.textContent;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
  return tab;
}

async function sendToBackground(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

async function loadConfig() {
  const { apiKey, botShortName } = await chrome.storage.sync.get(["apiKey", "botShortName"]);
  if (apiKey) apiKeyInput.value = apiKey;
  if (botShortName) botInput.value = botShortName;
  savedConfig = { apiKey: apiKeyInput.value.trim(), botShortName: botInput.value.trim() };
  updateSaveButtonState();
}

function updateSaveButtonState() {
  const current = { apiKey: apiKeyInput.value.trim(), botShortName: botInput.value.trim() };
  const hasChanges = current.apiKey !== savedConfig.apiKey || current.botShortName !== savedConfig.botShortName;

  btnSaveConfig.disabled = !hasChanges;
  btnSaveConfig.classList.toggle("pending", hasChanges);
}

async function copyToClipboard(text, successMsg) {
  if (!text) {
    log("ERRO:", { message: "Nada para copiar." });
    return;
  }

  await navigator.clipboard.writeText(text);
  log(successMsg);
}

btnSaveConfig.addEventListener("click", async () => {
  try {
    const apiKey = apiKeyInput.value.trim();
    const botShortName = botInput.value.trim();

    if (!apiKey) throw new Error("API Key vazia.");
    if (!botShortName) throw new Error("Bot short name vazio (ex: scarathuhmg).");

    await chrome.storage.sync.set({ apiKey, botShortName });
    savedConfig = { apiKey, botShortName };
    updateSaveButtonState();
    log("Config salva:", { botShortName });
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

apiKeyInput.addEventListener("input", updateSaveButtonState);
botInput.addEventListener("input", updateSaveButtonState);

document.getElementById("btnCopyApiKey").addEventListener("click", async () => {
  try {
    await copyToClipboard(apiKeyInput.value.trim(), "API Key copiada para área de transferência.");
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

document.getElementById("btnCopyBot").addEventListener("click", async () => {
  try {
    await copyToClipboard(botInput.value.trim(), "Bot copiado para área de transferência.");
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

document.getElementById("btnCreateOne").addEventListener("click", async () => {
  try {
    log("CLICK: CREATE 1");
    const tab = await getActiveTab();
    const res = await sendToBackground("CREATE_TICKETS", { tabId: tab.id, qty: 1, batchSize: 1, delayMs: 0 });
    log("RESPONSE:", res);
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

document.getElementById("btnCreateMany").addEventListener("click", async () => {
  const btnCreateMany = document.getElementById("btnCreateMany");
  const originalText = btnCreateMany.textContent;
  try {
    btnCreateMany.disabled = true;
    btnCreateMany.classList.add("loading");
    btnCreateMany.innerHTML = '<span class="spinner"></span>Criando...';

    const tab = await getActiveTab();
    const qty = Number(document.getElementById("qty").value || 1);
    const batchSize = Number(document.getElementById("batchSize").value || 10);
    const delayMs = Number(document.getElementById("delayMs").value || 400);

    log("CLICK: CREATE MANY", { qty, batchSize, delayMs });

    const res = await sendToBackground("CREATE_TICKETS", { tabId: tab.id, qty, batchSize, delayMs });
    log("RESPONSE:", res);
  } catch (e) {
    log("ERRO:", { message: e.message });
  } finally {
    btnCreateMany.disabled = false;
    btnCreateMany.classList.remove("loading");
    btnCreateMany.textContent = originalText;
  }
});

document.getElementById("btnProbe").addEventListener("click", async () => {
  try {
    log("CLICK: PROBE_CONTEXT");
    const tab = await getActiveTab();
    const res = await sendToBackground("PROBE_CONTEXT", { tabId: tab.id });
    log("RESPONSE:", res);
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

document.getElementById("btnCloseAll").addEventListener("click", async () => {
  const originalText = btnCloseAll.textContent;
  try {
    const confirmed = confirm("⚠️ ATENÇÃO: Isso vai fechar TODOS os tickets abertos. Deseja continuar?");
    if (!confirmed) {
      log("Operação cancelada pelo usuário.");
      return;
    }

    btnCloseAll.disabled = true;
    btnCloseAll.classList.add("loading");
    btnCloseAll.innerHTML = '<span class="spinner"></span>Fechando...';

    log("CLICK: CLOSE_ALL_TICKETS");
    const tab = await getActiveTab();
    const res = await sendToBackground("CLOSE_ALL_TICKETS", { tabId: tab.id });
    if (res?.agentIdentity || res?.closedBy) {
      log("AGENTE ATUAL:", { agentIdentity: res.agentIdentity, closedBy: res.closedBy });
    }
    log("RESPONSE:", res);

    await chrome.tabs.reload(tab.id);
    log("Página recarregada após fechamento de tickets.");
  } catch (e) {
    log("ERRO:", { message: e.message });
  } finally {
    btnCloseAll.disabled = false;
    btnCloseAll.classList.remove("loading");
    btnCloseAll.textContent = originalText;
  }
});

loadConfig();
