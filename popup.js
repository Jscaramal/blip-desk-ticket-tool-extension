const LOG_SCOPE = "[DeskTicketHelper][popup]";
const logEl = document.getElementById("log");
const apiKeyInput = document.getElementById("apiKeyInput");
const botInput = document.getElementById("botInput");
const btnSaveConfig = document.getElementById("btnSaveConfig");
const btnCloseAll = document.getElementById("btnCloseAll");
const btnCopyLogs = document.getElementById("btnCopyLogs");
const btnClearLogs = document.getElementById("btnClearLogs");

let savedConfig = { apiKey: "", botShortName: "" };
let logEntries = [];

function serializeError(error) {
  if (!error) {
    return { message: "Unknown error" };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function stringifyDetails(details) {
  if (details == null) return "";

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function createLogEntry(level, message, details) {
  return {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    details: details ?? null,
  };
}

function renderLogEntries() {
  const lines = logEntries
    .slice()
    .reverse()
    .map((entry) => {
      const formattedDetails = stringifyDetails(entry.details);
      return formattedDetails
        ? `${entry.timestamp} [${entry.level}] ${entry.message} ${formattedDetails}`
        : `${entry.timestamp} [${entry.level}] ${entry.message}`;
    });

  logEl.textContent = lines.join("\n");
}

function writeLog(level, message, details) {
  logEntries.push(createLogEntry(level, message, details));
  renderLogEntries();

  const consoleMethod = console[level] || console.log;
  consoleMethod(LOG_SCOPE, message, details ?? "");
}

function logDebug(message, details) {
  writeLog("debug", message, details);
}

function logInfo(message, details) {
  writeLog("info", message, details);
}

function logWarn(message, details) {
  writeLog("warn", message, details);
}

function logError(message, details) {
  writeLog("error", message, details);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Nenhuma aba ativa encontrada.");
  }

  logDebug("Resolved active tab", {
    id: tab.id,
    url: tab.url,
    title: tab.title,
  });
  return tab;
}

async function sendToBackground(type, payload = {}) {
  logInfo("Sending message to background", { type, payload });
  const response = await chrome.runtime.sendMessage({ type, payload });
  logInfo("Received background response", { type, response });
  return response;
}

async function loadConfig() {
  const { apiKey, botShortName } = await chrome.storage.sync.get(["apiKey", "botShortName"]);
  if (apiKey) apiKeyInput.value = apiKey;
  if (botShortName) botInput.value = botShortName;

  savedConfig = {
    apiKey: apiKeyInput.value.trim(),
    botShortName: botInput.value.trim(),
  };

  updateSaveButtonState();
  logInfo("Loaded popup config", {
    hasApiKey: Boolean(savedConfig.apiKey),
    botShortName: savedConfig.botShortName || null,
  });
}

function updateSaveButtonState() {
  const current = {
    apiKey: apiKeyInput.value.trim(),
    botShortName: botInput.value.trim(),
  };
  const hasChanges = current.apiKey !== savedConfig.apiKey || current.botShortName !== savedConfig.botShortName;

  btnSaveConfig.disabled = !hasChanges;
  btnSaveConfig.classList.toggle("pending", hasChanges);
  logDebug("Updated save button state", { hasChanges });
}

async function copyToClipboard(text, successMessage) {
  if (!text) {
    throw new Error("Nada para copiar.");
  }

  await navigator.clipboard.writeText(text);
  logInfo(successMessage);
}

function buildStructuredLogExport() {
  return {
    exportedAt: new Date().toISOString(),
    source: "DeskTicketHelper popup",
    entryCount: logEntries.length,
    entries: logEntries,
  };
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
    logInfo("Config saved", { botShortName, hasApiKey: true });
  } catch (error) {
    logError("Failed to save config", { error: serializeError(error) });
  }
});

apiKeyInput.addEventListener("input", updateSaveButtonState);
botInput.addEventListener("input", updateSaveButtonState);

document.getElementById("btnCopyApiKey").addEventListener("click", async () => {
  try {
    await copyToClipboard(apiKeyInput.value.trim(), "API Key copiada para a area de transferencia.");
  } catch (error) {
    logError("Failed to copy API key", { error: serializeError(error) });
  }
});

document.getElementById("btnCopyBot").addEventListener("click", async () => {
  try {
    await copyToClipboard(botInput.value.trim(), "Bot copiado para a area de transferencia.");
  } catch (error) {
    logError("Failed to copy bot", { error: serializeError(error) });
  }
});

document.getElementById("btnCreateOne").addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    const response = await sendToBackground("CREATE_TICKETS", {
      tabId: tab.id,
      qty: 1,
      batchSize: 1,
      delayMs: 0,
    });
    logInfo("Create one ticket completed", response);
  } catch (error) {
    logError("Create one ticket failed", { error: serializeError(error) });
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

    logInfo("Starting bulk ticket creation", { qty, batchSize, delayMs, tabId: tab.id });
    const response = await sendToBackground("CREATE_TICKETS", { tabId: tab.id, qty, batchSize, delayMs });

    if (!response?.ok || response?.details?.fail > 0) {
      logWarn("Bulk ticket creation finished with warnings", response);
    } else {
      logInfo("Bulk ticket creation completed", response);
    }
  } catch (error) {
    logError("Bulk ticket creation failed", { error: serializeError(error) });
  } finally {
    btnCreateMany.disabled = false;
    btnCreateMany.classList.remove("loading");
    btnCreateMany.textContent = originalText;
  }
});

document.getElementById("btnProbe").addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    const response = await sendToBackground("PROBE_CONTEXT", { tabId: tab.id });

    if (!response?.ok) {
      logWarn("Probe context returned an error", response);
    } else {
      logInfo("Probe context completed", response);
    }
  } catch (error) {
    logError("Probe context failed", { error: serializeError(error) });
  }
});

btnCloseAll.addEventListener("click", async () => {
  const originalText = btnCloseAll.textContent;

  try {
    const confirmed = confirm("ATENCAO: Isso vai fechar TODOS os tickets abertos. Deseja continuar?");
    if (!confirmed) {
      logWarn("Close tickets operation cancelled by user");
      return;
    }

    btnCloseAll.disabled = true;
    btnCloseAll.classList.add("loading");
    btnCloseAll.innerHTML = '<span class="spinner"></span>Fechando...';

    const tab = await getActiveTab();
    logInfo("Starting close all tickets", { tabId: tab.id, url: tab.url });

    const response = await sendToBackground("CLOSE_ALL_TICKETS", { tabId: tab.id });
    if (response?.agentIdentity || response?.closedBy) {
      logInfo("Current agent context", {
        agentIdentity: response.agentIdentity,
        closedBy: response.closedBy,
      });
    }

    if (!response?.ok || response?.details?.fail > 0 || response?.fallbackWithoutClosedBy > 0) {
      logWarn("Close all tickets finished with warnings", response);
    } else {
      logInfo("Close all tickets completed", response);
    }

    await chrome.tabs.reload(tab.id);
    logInfo("Tab reloaded after close all tickets", { tabId: tab.id });
  } catch (error) {
    logError("Close all tickets failed", { error: serializeError(error) });
  } finally {
    btnCloseAll.disabled = false;
    btnCloseAll.classList.remove("loading");
    btnCloseAll.textContent = originalText;
  }
});

btnCopyLogs.addEventListener("click", async () => {
  try {
    const exportedLogs = buildStructuredLogExport();
    await navigator.clipboard.writeText(JSON.stringify(exportedLogs, null, 2));
    logInfo("Structured logs copied to clipboard", {
      entryCount: exportedLogs.entryCount,
    });
  } catch (error) {
    logError("Failed to copy structured logs", { error: serializeError(error) });
  }
});

btnClearLogs.addEventListener("click", () => {
  logEntries = [];
  renderLogEntries();
  console.info(LOG_SCOPE, "Popup logs cleared");
});

loadConfig().catch((error) => {
  logError("Failed to initialize popup", { error: serializeError(error) });
});
