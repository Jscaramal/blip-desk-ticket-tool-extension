const logEl = document.getElementById("log");

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
  if (apiKey) document.getElementById("apiKeyInput").value = apiKey;
  if (botShortName) document.getElementById("botInput").value = botShortName;
}

document.getElementById("btnSaveConfig").addEventListener("click", async () => {
  try {
    const apiKey = document.getElementById("apiKeyInput").value.trim();
    const botShortName = document.getElementById("botInput").value.trim();

    if (!apiKey) throw new Error("API Key vazia.");
    if (!botShortName) throw new Error("Bot short name vazio (ex: scarathuhmg).");

    await chrome.storage.sync.set({ apiKey, botShortName });
    log("Config salva:", { botShortName });
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
  try {
    const tab = await getActiveTab();
    const qty = Number(document.getElementById("qty").value || 1);
    const batchSize = Number(document.getElementById("batchSize").value || 10);
    const delayMs = Number(document.getElementById("delayMs").value || 400);

    log("CLICK: CREATE MANY", { qty, batchSize, delayMs });

    const res = await sendToBackground("CREATE_TICKETS", { tabId: tab.id, qty, batchSize, delayMs });
    log("RESPONSE:", res);
  } catch (e) {
    log("ERRO:", { message: e.message });
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
  try {
    const confirmed = confirm("⚠️ ATENÇÃO: Isso vai fechar TODOS os tickets abertos. Deseja continuar?");
    if (!confirmed) {
      log("Operação cancelada pelo usuário.");
      return;
    }

    log("CLICK: CLOSE_ALL_TICKETS");
    const tab = await getActiveTab();
    const res = await sendToBackground("CLOSE_ALL_TICKETS", { tabId: tab.id });
    log("RESPONSE:", res);
  } catch (e) {
    log("ERRO:", { message: e.message });
  }
});

loadConfig();
