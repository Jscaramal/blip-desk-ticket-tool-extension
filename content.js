// content.js — agentIdentity via LocalStorage + ticketIds via DOM

function getAgentIdentity() {
  const a = localStorage.getItem("apc_user_id");
  return a && a.includes("@") ? a : null;
}

function extractTicketIdsFromDom() {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;

  // Tenta focar no painel da lista (esquerda) pra não pegar UUID aleatório do app todo
  const root =
    document.querySelector('[data-testid*="ticket"]')?.closest("aside") ||
    document.querySelector("aside") ||
    document;

  const ids = new Set();
  const sources = [];

  const nodes = root.querySelectorAll("a, button, [data-testid], [data-ticket-id], [data-id], [id], [role]");
  for (const el of nodes) {
    const candidates = [
      el.getAttribute("data-ticket-id"),
      el.getAttribute("data-id"),
      el.getAttribute("href"),
      el.getAttribute("id"),
      el.getAttribute("data-testid"),
      el.getAttribute("aria-controls"),
      el.getAttribute("aria-describedby"),
    ].filter(Boolean);

    for (const c of candidates) {
      const matches = String(c).match(uuidRegex);
      if (matches) {
        for (const m of matches) {
          if (!ids.has(m)) {
            ids.add(m);
            if (sources.length < 10) sources.push({ id: m, from: c });
          }
        }
      }
    }
  }

  return { ticketIds: Array.from(ids), debug: { scanned: nodes.length, sampleSources: sources } };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_DESK_DATA") {
    const agentIdentity = getAgentIdentity();

    const { ticketIds, debug } = extractTicketIdsFromDom();

    sendResponse({
      ok: true,
      agentIdentity,
      tickets: ticketIds.map(id => ({
        id,
        customerIdentity: null,
        ownerIdentity: null
      })),
      ticketIds,
      debug
    });

    return true;
  }

  if (msg?.type === "GET_AGENT") {
    const agentIdentity = getAgentIdentity();
    sendResponse({
      ok: !!agentIdentity,
      agentIdentity
    });
    return true;
  }
});


