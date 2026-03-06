// content.js - agentIdentity via LocalStorage + ticketIds via DOM

const LOG_SCOPE = "[DeskTicketHelper][content]";

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

function getAgentIdentity() {
  const rawValue = localStorage.getItem("apc_user_id");
  const agentIdentity = rawValue && rawValue.includes("@") ? rawValue : null;

  if (!agentIdentity) {
    logWarn("Agent identity not found in localStorage", {
      hasRawValue: Boolean(rawValue),
      rawPreview: rawValue ? String(rawValue).slice(0, 100) : null,
      href: window.location.href,
    });
  } else {
    logDebug("Resolved agent identity from localStorage", { agentIdentity });
  }

  return agentIdentity;
}

function resolveTicketRoot() {
  const ticketElement = document.querySelector('[data-testid*="ticket"]');
  const asideFromTicket = ticketElement?.closest("aside");

  if (asideFromTicket) {
    return { root: asideFromTicket, strategy: "ticket-testid->aside" };
  }

  const genericAside = document.querySelector("aside");
  if (genericAside) {
    return { root: genericAside, strategy: "generic-aside" };
  }

  return { root: document, strategy: "document" };
}

function extractTicketIdsFromDom() {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
  const { root, strategy } = resolveTicketRoot();
  const ids = new Set();
  const sources = [];

  const nodes = root.querySelectorAll("a, button, [data-testid], [data-ticket-id], [data-id], [id], [role]");
  for (const element of nodes) {
    const candidates = [
      element.getAttribute("data-ticket-id"),
      element.getAttribute("data-id"),
      element.getAttribute("href"),
      element.getAttribute("id"),
      element.getAttribute("data-testid"),
      element.getAttribute("aria-controls"),
      element.getAttribute("aria-describedby"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const matches = String(candidate).match(uuidRegex);
      if (!matches) continue;

      for (const match of matches) {
        if (ids.has(match)) continue;

        ids.add(match);
        if (sources.length < 10) {
          sources.push({ id: match, from: String(candidate).slice(0, 200) });
        }
      }
    }
  }

  const debug = {
    strategy,
    scanned: nodes.length,
    sampleSources: sources,
  };

  if (ids.size === 0) {
    logWarn("No ticket ids found in DOM scan", {
      strategy,
      scanned: nodes.length,
      href: window.location.href,
    });
  } else {
    logInfo("Extracted ticket ids from DOM", {
      strategy,
      scanned: nodes.length,
      ticketCount: ids.size,
      sampleSources: sources,
    });
  }

  return { ticketIds: Array.from(ids), debug };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    logDebug("Received message", {
      type: msg?.type,
      senderId: sender?.id || null,
      href: window.location.href,
    });

    if (msg?.type === "GET_DESK_DATA") {
      const agentIdentity = getAgentIdentity();
      const { ticketIds, debug } = extractTicketIdsFromDom();

      const response = {
        ok: true,
        agentIdentity,
        tickets: ticketIds.map((id) => ({
          id,
          customerIdentity: null,
          ownerIdentity: null,
        })),
        ticketIds,
        debug,
      };

      logInfo("Responding with desk data", {
        agentIdentity,
        ticketCount: ticketIds.length,
        debug,
      });
      sendResponse(response);
      return true;
    }

    if (msg?.type === "GET_AGENT") {
      const agentIdentity = getAgentIdentity();
      const response = {
        ok: !!agentIdentity,
        agentIdentity,
      };

      if (!response.ok) {
        logWarn("Unable to answer GET_AGENT because agent identity is missing", {
          href: window.location.href,
        });
      } else {
        logInfo("Responding with agent identity", { agentIdentity });
      }

      sendResponse(response);
      return true;
    }

    logDebug("Ignoring unsupported message type", { type: msg?.type });
  } catch (error) {
    logError("Content script message handler failed", {
      type: msg?.type,
      error: serializeError(error),
    });
    sendResponse({ ok: false, error: error?.message || String(error) });
    return true;
  }

  return false;
});

logInfo("Content script loaded", { href: window.location.href });
