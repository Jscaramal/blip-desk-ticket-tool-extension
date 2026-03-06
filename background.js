// background.js (MV3 service worker)

const COMMANDS_BASE_URLS = {
  hmg: "https://hmg-http.msging.net/commands",
  prod: "https://http.msging.net/commands",
};
const LOG_SCOPE = "[DeskTicketHelper][background]";

function logDebug(message, details) {
  console.debug(LOG_SCOPE, message, details ?? "");
}

function logInfo(message, details) {
  console.info(LOG_SCOPE, message, details ?? "");
}

function logWarn(message, details) {
  console.warn(LOG_SCOPE, message, details ?? "");
}

function logError(message, details) {
  console.error(LOG_SCOPE, message, details ?? "");
}

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

function summarizeResource(resource) {
  if (resource == null) return null;
  if (Array.isArray(resource)) return { type: "array", length: resource.length };
  if (typeof resource !== "object") return resource;

  const summary = {};
  const interestingKeys = [
    "id",
    "status",
    "closed",
    "closedBy",
    "customerIdentity",
    "agentIdentity",
    "team",
    "identity",
    "name",
  ];

  for (const key of interestingKeys) {
    if (resource[key] != null) {
      summary[key] = resource[key];
    }
  }

  summary.keys = Object.keys(resource).slice(0, 12);
  return summary;
}

function summarizeRequest(options) {
  const request = {
    method: options?.method,
    headers: { ...(options?.headers || {}) },
  };

  if (request.headers.Authorization) {
    request.headers.Authorization = "[redacted]";
  }

  if (options?.body) {
    try {
      const parsed = JSON.parse(options.body);
      request.body = {
        id: parsed.id,
        to: parsed.to,
        method: parsed.method,
        uri: parsed.uri,
        type: parsed.type,
        resource: summarizeResource(parsed.resource),
      };
    } catch {
      request.body = String(options.body).slice(0, 300);
    }
  }

  return request;
}

function summarizePayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "string") return { textPreview: payload.slice(0, 200) };
  if (Array.isArray(payload)) return { type: "array", length: payload.length };
  if (typeof payload !== "object") return payload;

  const summary = {
    keys: Object.keys(payload).slice(0, 12),
  };

  if (payload.id) summary.id = payload.id;
  if (payload.status) summary.status = payload.status;
  if (payload.resource?.items && Array.isArray(payload.resource.items)) {
    summary.resourceItems = payload.resource.items.length;
  }
  if (payload.resource) {
    summary.resource = summarizeResource(payload.resource);
  }

  return summary;
}

function summarizeTicket(ticket) {
  if (!ticket) return null;

  return {
    id: ticket.id,
    closed: ticket.closed,
    status: ticket.status,
    agentIdentity: ticket.agentIdentity,
    normalizedAgentIdentity: normalizeIdentityForCompare(ticket.agentIdentity),
    customerIdentity: ticket.customerIdentity,
  };
}

function summarizeAgentDistribution(tickets, limit = 10) {
  const counts = new Map();

  for (const ticket of tickets) {
    const key = normalizeIdentityForCompare(ticket?.agentIdentity) || "(empty)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([agentIdentity, count]) => ({ agentIdentity, count }));
}

function resolveEnvironmentFromUrl(tabUrl) {
  if (!tabUrl) {
    return "hmg";
  }

  try {
    const hostname = new URL(tabUrl).hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
      return "hmg";
    }

    if (hostname.includes("hmg")) {
      return "hmg";
    }

    return "prod";
  } catch {
    return "hmg";
  }
}

function resolveCommandsContext(tabUrl) {
  const environment = resolveEnvironmentFromUrl(tabUrl);
  return {
    environment,
    commandsBaseUrl: COMMANDS_BASE_URLS[environment],
    tabUrl: tabUrl || null,
  };
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadConfigOrThrow(traceId) {
  const { apiKey, botShortName } = await chrome.storage.sync.get(["apiKey", "botShortName"]);

  if (!apiKey) {
    logWarn("Missing API key in extension storage", { traceId });
    throw new Error("API key nao configurada. Salve no popup.");
  }

  if (!botShortName) {
    logWarn("Missing bot short name in extension storage", { traceId });
    throw new Error("Bot short name nao configurado. Salve no popup (ex: scarathuhmg).");
  }

  const config = { apiKey: apiKey.trim(), botShortName: botShortName.trim() };
  logInfo("Loaded extension config", {
    traceId,
    botShortName: config.botShortName,
    hasApiKey: Boolean(config.apiKey),
  });

  return config;
}

function makeHeaders(apiKey) {
  return {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };
}

function parseJsonIfPossible(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function doFetchOrThrow(url, options, meta = {}) {
  const startedAt = Date.now();
  logInfo("Starting HTTP request", {
    ...meta,
    url,
    request: summarizeRequest(options),
  });

  try {
    const response = await fetch(url, options);
    const text = await response.text();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logError("HTTP request failed", {
        ...meta,
        url,
        status: response.status,
        durationMs,
        responsePreview: text.slice(0, 300),
      });
      throw new Error(`HTTP ${response.status} - ${text.slice(0, 300)}`);
    }

    const parsed = parseJsonIfPossible(text);
    logInfo("HTTP request succeeded", {
      ...meta,
      url,
      status: response.status,
      durationMs,
      response: summarizePayload(parsed),
    });

    return parsed;
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("HTTP "))) {
      logError("Unexpected fetch error", {
        ...meta,
        url,
        durationMs: Date.now() - startedAt,
        error: serializeError(error),
      });
    }
    throw error;
  }
}

async function runInBatches(total, batchSize, delayMs, fn, meta = {}) {
  const settledAll = [];

  if (total === 0) {
    logWarn("runInBatches called with zero items", meta);
    return settledAll;
  }

  for (let index = 0; index < total; index += batchSize) {
    const size = Math.min(batchSize, total - index);
    const batchNumber = Math.floor(index / batchSize) + 1;

    logInfo("Starting batch", {
      ...meta,
      batchNumber,
      batchSize: size,
      startIndex: index,
      total,
      delayMs,
    });

    const batch = Array.from({ length: size }, (_, offset) => fn(index + offset));
    const settled = await Promise.allSettled(batch);
    settledAll.push(...settled);

    logInfo("Finished batch", {
      ...meta,
      batchNumber,
      summary: summarizeSettled(settled),
    });

    if (index + batchSize < total) {
      await sleep(delayMs);
    }
  }

  return settledAll;
}

function summarizeSettled(settled) {
  const summary = { ok: 0, fail: 0, errors: [] };

  for (const item of settled) {
    if (item.status === "fulfilled") {
      summary.ok += 1;
      continue;
    }

    summary.fail += 1;
    summary.errors.push(String(item.reason?.message || item.reason).slice(0, 300));
  }

  return summary;
}

function getRandomName() {
  const firstNames = [
    "Joao",
    "Maria",
    "Ana",
    "Pedro",
    "Jose",
    "Carlos",
    "Luiz",
    "Lucas",
    "Rafael",
    "Felipe",
    "Gabriel",
    "Bruno",
    "Andre",
    "Fernando",
    "Marcos",
    "Paulo",
    "Rodrigo",
    "Thiago",
    "Mateus",
    "Diego",
    "Juliana",
    "Beatriz",
    "Fernanda",
    "Camila",
    "Amanda",
    "Larissa",
    "Patricia",
    "Carla",
    "Renata",
    "Mariana",
  ];

  const lastNames = [
    "Silva",
    "Santos",
    "Oliveira",
    "Souza",
    "Rodrigues",
    "Ferreira",
    "Alves",
    "Pereira",
    "Lima",
    "Gomes",
    "Costa",
    "Ribeiro",
    "Martins",
    "Carvalho",
    "Rocha",
    "Almeida",
    "Nascimento",
    "Araujo",
    "Melo",
    "Barbosa",
    "Cardoso",
    "Dias",
    "Monteiro",
    "Mendes",
    "Castro",
    "Campos",
    "Freitas",
    "Moreira",
    "Pinto",
    "Cavalcanti",
  ];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

  return `${firstName} ${lastName}`;
}

function buildCreateContactCommand(commandsBaseUrl, apiKey, contactIdentity) {
  return {
    url: commandsBaseUrl,
    options: {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        to: "postmaster@crm.msging.net",
        method: "set",
        uri: "/contacts",
        type: "application/vnd.lime.contact+json",
        resource: {
          identity: contactIdentity,
          name: getRandomName(),
          gender: "male",
          group: "friends",
          extras: { plan: "Gold", code: "1111" },
        },
      }),
    },
  };
}

function buildCreateTicketCommand(commandsBaseUrl, apiKey, customerIdentity) {
  return {
    url: commandsBaseUrl,
    options: {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        to: "postmaster@desk.msging.net",
        method: "set",
        uri: "/tickets",
        type: "application/vnd.iris.ticket+json",
        resource: { customerIdentity, team: "Default" },
      }),
    },
  };
}

function buildGetTicketsCommand(commandsBaseUrl, apiKey) {
  return {
    url: commandsBaseUrl,
    options: {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        to: "postmaster@desk.msging.net",
        method: "get",
        uri: "/tickets?$take=100",
      }),
    },
  };
}

function buildCloseTicketCommand(commandsBaseUrl, apiKey, ticketId, closedBy) {
  return {
    url: commandsBaseUrl,
    options: {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        to: "postmaster@desk.msging.net",
        method: "set",
        uri: "/tickets/change-status",
        type: "application/vnd.iris.ticket+json",
        resource: {
          id: ticketId,
          status: "ClosedAttendant",
          closedBy,
        },
      }),
    },
  };
}

function normalizeClosedBy(agentIdentity) {
  if (!agentIdentity) return agentIdentity;
  if (agentIdentity.includes("%40") && agentIdentity.endsWith("@blip.ai")) return agentIdentity;
  return `${encodeURIComponent(agentIdentity)}@blip.ai`;
}

function normalizeIdentityForCompare(identity) {
  if (!identity) return "";

  let normalized;
  try {
    normalized = decodeURIComponent(identity).toLowerCase();
  } catch {
    normalized = String(identity).toLowerCase();
  }

  normalized = normalized.trim();
  normalized = normalized.replace(/@blip\.ai@blip\.ai$/, "@blip.ai");

  return normalized;
}

function isTicketFromCurrentAgent(ticket, agentIdentity) {
  const current = normalizeIdentityForCompare(agentIdentity);
  const fromTicket = normalizeIdentityForCompare(ticket?.agentIdentity);
  return Boolean(current) && Boolean(fromTicket) && current === fromTicket;
}

async function closeTicketWithFallback(commandsBaseUrl, apiKey, ticketId, closedBy, meta = {}) {
  try {
    logDebug("Closing ticket with closedBy", { ...meta, ticketId, closedBy });
    const withClosedBy = buildCloseTicketCommand(commandsBaseUrl, apiKey, ticketId, closedBy);
    await doFetchOrThrow(withClosedBy.url, withClosedBy.options, {
      ...meta,
      operation: "closeTicket",
      ticketId,
      mode: "withClosedBy",
    });
    return { ticketId, mode: "withClosedBy" };
  } catch (error) {
    logWarn("Closing ticket with closedBy failed, retrying without closedBy", {
      ...meta,
      ticketId,
      closedBy,
      error: serializeError(error),
    });

    const withoutClosedBy = buildCloseTicketCommand(commandsBaseUrl, apiKey, ticketId, undefined);
    const body = JSON.parse(withoutClosedBy.options.body);
    delete body.resource.closedBy;
    withoutClosedBy.options.body = JSON.stringify(body);

    await doFetchOrThrow(withoutClosedBy.url, withoutClosedBy.options, {
      ...meta,
      operation: "closeTicket",
      ticketId,
      mode: "withoutClosedBy",
    });

    logWarn("Ticket closed without closedBy", { ...meta, ticketId });
    return {
      ticketId,
      mode: "withoutClosedBy",
      warning: String(error?.message || error).slice(0, 300),
    };
  }
}

async function getAgentFromTab(tabId, traceId) {
  logInfo("Requesting agent identity from tab", { traceId, tabId });
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_AGENT" });
  logInfo("Received agent identity response", { traceId, tabId, response });

  if (!response?.ok) {
    throw new Error("GET_AGENT falhou. Recarregue a pagina do Desk (F5) e atualize a extensao.");
  }

  return response.agentIdentity;
}

async function getDeskDataFromTab(tabId, traceId) {
  logInfo("Requesting desk data from tab", { traceId, tabId });
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_DESK_DATA" });
  logInfo("Received desk data response", {
    traceId,
    tabId,
    ticketCount: response?.ticketIds?.length || 0,
    debug: response?.debug,
  });

  if (!response?.ok) {
    throw new Error("GET_DESK_DATA falhou. Recarregue a pagina do Desk (F5).");
  }

  return response;
}

async function getCommandsContextFromTab(tabId, traceId) {
  const tab = await chrome.tabs.get(tabId);
  const context = resolveCommandsContext(tab?.url);

  logInfo("Resolved commands endpoint for tab", {
    traceId,
    tabId,
    tabUrl: tab?.url || null,
    environment: context.environment,
    commandsBaseUrl: context.commandsBaseUrl,
  });

  return context;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const traceId = crypto.randomUUID().slice(0, 8);

  (async () => {
    try {
      logInfo("Received runtime message", {
        traceId,
        type: msg?.type,
        payload: msg?.payload || null,
        senderTabId: sender?.tab?.id || null,
      });

      if (msg?.type === "PROBE_CONTEXT") {
        const { tabId } = msg.payload || {};
        const agentIdentity = await getAgentFromTab(tabId, traceId);
        const desk = await getDeskDataFromTab(tabId, traceId);

        const probeResponse = {
          ok: true,
          action: "PROBE_CONTEXT",
          agentIdentity,
          ticketCount: desk?.ticketIds?.length || 0,
          debug: desk?.debug || null,
        };

        logInfo("Probe context completed", { traceId, response: probeResponse });
        sendResponse(probeResponse);
        return;
      }

      if (msg?.type === "CREATE_TICKETS") {
        const { qty = 0, batchSize = 1, delayMs = 0 } = msg.payload || {};
        const { apiKey, botShortName } = await loadConfigOrThrow(traceId);
        const { environment, commandsBaseUrl, tabUrl } = await getCommandsContextFromTab(msg.payload?.tabId, traceId);

        logInfo("Starting ticket creation flow", {
          traceId,
          qty,
          batchSize,
          delayMs,
          botShortName,
          environment,
          commandsBaseUrl,
          tabUrl,
        });

        const settled = await runInBatches(
          qty,
          batchSize,
          delayMs,
          async () => {
            const customerIdentity = `${crypto.randomUUID()}.${botShortName}@0mn.io`;

            const createContact = buildCreateContactCommand(commandsBaseUrl, apiKey, customerIdentity);
            await doFetchOrThrow(createContact.url, createContact.options, {
              traceId,
              operation: "createContact",
              customerIdentity,
              environment,
            });

            const createTicket = buildCreateTicketCommand(commandsBaseUrl, apiKey, customerIdentity);
            await doFetchOrThrow(createTicket.url, createTicket.options, {
              traceId,
              operation: "createTicket",
              customerIdentity,
              environment,
            });

            return { customerIdentity };
          },
          { traceId, operation: "createTickets" }
        );

        const createResponse = {
          ok: true,
          action: "CREATE_TICKETS",
          created: qty,
          environment,
          commandsBaseUrl,
          details: summarizeSettled(settled),
        };

        logInfo("Ticket creation flow completed", { traceId, response: createResponse });
        sendResponse(createResponse);
        return;
      }

      if (msg?.type === "CLOSE_ALL_TICKETS") {
        const { apiKey } = await loadConfigOrThrow(traceId);
        const { tabId } = msg.payload || {};
        const { environment, commandsBaseUrl, tabUrl } = await getCommandsContextFromTab(tabId, traceId);

        const agentIdentity = await getAgentFromTab(tabId, traceId);
        const closedBy = normalizeClosedBy(agentIdentity);

        logInfo("Starting close tickets flow", {
          traceId,
          tabId,
          tabUrl,
          agentIdentity,
          normalizedAgentIdentity: normalizeIdentityForCompare(agentIdentity),
          closedBy,
          environment,
          commandsBaseUrl,
        });

        const getTickets = buildGetTicketsCommand(commandsBaseUrl, apiKey);
        const ticketsResponse = await doFetchOrThrow(getTickets.url, getTickets.options, {
          traceId,
          operation: "getTickets",
          environment,
        });

        if (!ticketsResponse?.resource?.items) {
          logError("Unexpected ticket listing response", {
            traceId,
            response: summarizePayload(ticketsResponse),
          });
          throw new Error("Resposta invalida ao buscar tickets.");
        }

        const tickets = ticketsResponse.resource.items;
        const openTickets = tickets.filter((ticket) => !ticket.closed);
        const agentTickets = openTickets.filter((ticket) => isTicketFromCurrentAgent(ticket, agentIdentity));

        logInfo("Calculated ticket groups for closing", {
          traceId,
          ticketsFound: tickets.length,
          openTicketsFound: openTickets.length,
          ticketsToClose: agentTickets.length,
          currentAgent: agentIdentity,
          normalizedCurrentAgent: normalizeIdentityForCompare(agentIdentity),
          openTicketAgents: summarizeAgentDistribution(openTickets),
          openTicketSample: openTickets.slice(0, 5).map(summarizeTicket),
          agentTicketSample: agentTickets.slice(0, 5).map(summarizeTicket),
        });

        if (agentTickets.length === 0) {
          const emptyResponse = {
            ok: true,
            action: "CLOSE_ALL_TICKETS",
            message: "Nenhum ticket aberto vinculado ao agente atual.",
            agentIdentity,
            closedBy,
            environment,
            commandsBaseUrl,
            ticketsFound: tickets.length,
            openTicketsFound: openTickets.length,
            ticketsToClose: 0,
            openTicketsAgentSample: openTickets.slice(0, 5).map((ticket) => ({
              id: ticket.id,
              agentIdentity: ticket.agentIdentity,
              normalizedAgentIdentity: normalizeIdentityForCompare(ticket.agentIdentity),
            })),
            details: { ok: 0, fail: 0, errors: [] },
          };

          logWarn("No open tickets matched the current agent", {
            traceId,
            currentAgent: agentIdentity,
            normalizedCurrentAgent: normalizeIdentityForCompare(agentIdentity),
            openTicketAgents: summarizeAgentDistribution(openTickets),
          });

          sendResponse(emptyResponse);
          return;
        }

        const settled = await runInBatches(
          agentTickets.length,
          10,
          300,
          async (index) => {
            const ticket = agentTickets[index];
            return closeTicketWithFallback(commandsBaseUrl, apiKey, ticket.id, closedBy, {
              traceId,
              agentIdentity,
              normalizedAgentIdentity: normalizeIdentityForCompare(agentIdentity),
              environment,
            });
          },
          { traceId, operation: "closeTickets", environment, commandsBaseUrl }
        );

        const fallbackCount = settled.filter(
          (item) => item.status === "fulfilled" && item.value?.mode === "withoutClosedBy"
        ).length;

        const closeResponse = {
          ok: true,
          action: "CLOSE_ALL_TICKETS",
          agentIdentity,
          closedBy,
          environment,
          commandsBaseUrl,
          ticketsFound: tickets.length,
          openTicketsFound: openTickets.length,
          ticketsToClose: agentTickets.length,
          fallbackWithoutClosedBy: fallbackCount,
          details: summarizeSettled(settled),
        };

        logInfo("Close tickets flow completed", { traceId, response: closeResponse });
        sendResponse(closeResponse);
        return;
      }

      logWarn("Unknown runtime message type", { traceId, type: msg?.type });
      sendResponse({ ok: false, error: "Tipo de mensagem desconhecido." });
    } catch (error) {
      logError("Runtime message handler failed", {
        traceId,
        type: msg?.type,
        error: serializeError(error),
      });
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();

  return true;
});
