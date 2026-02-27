// background.js (MV3 service worker) — HMG
// - CREATE_TICKETS: create CRM contact -> create ticket -> create attendance message
// - PROBE_CONTEXT: reads agentIdentity + ticketCount (from content.js GET_DESK_DATA)

const COMMANDS_BASE_URL = "https://hmg-http.msging.net/commands";

async function sleep(ms) {
  if (!ms) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function loadConfigOrThrow() {
  const { apiKey, botShortName } = await chrome.storage.sync.get(["apiKey", "botShortName"]);
  if (!apiKey) throw new Error("API key não configurada. Salve no popup.");
  if (!botShortName) throw new Error("Bot short name não configurado. Salve no popup (ex: scarathuhmg).");
  return { apiKey: apiKey.trim(), botShortName: botShortName.trim() };
}

function makeHeaders(apiKey) {
  return {
    Authorization: apiKey, // cole exatamente como sua key exige (ex: "Key ...")
    "Content-Type": "application/json",
  };
}

async function doFetchOrThrow(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runInBatches(total, batchSize, delayMs, fn) {
  const settledAll = [];
  for (let i = 0; i < total; i += batchSize) {
    const size = Math.min(batchSize, total - i);
    const batch = Array.from({ length: size }, (_, idx) => fn(i + idx));
    const settled = await Promise.allSettled(batch);
    settledAll.push(...settled);
    if (i + batchSize < total) await sleep(delayMs);
  }
  return settledAll;
}

function summarizeSettled(settled) {
  const summary = { ok: 0, fail: 0, errors: [] };
  for (const s of settled) {
    if (s.status === "fulfilled") summary.ok += 1;
    else summary.fail += 1, summary.errors.push(String(s.reason?.message || s.reason).slice(0, 300));
  }
  return summary;
}

// ---------------- Random name generator ----------------

function getRandomName() {
  const firstNames = [
    "João", "Maria", "Ana", "Pedro", "José", "Carlos", "Luiz", "Lucas", "Rafael", "Felipe",
    "Gabriel", "Bruno", "André", "Fernando", "Marcos", "Paulo", "Rodrigo", "Thiago", "Mateus", "Diego",
    "Juliana", "Beatriz", "Fernanda", "Camila", "Amanda", "Larissa", "Patrícia", "Carla", "Renata", "Mariana"
  ];
  
  const lastNames = [
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
    "Costa", "Ribeiro", "Martins", "Carvalho", "Rocha", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa",
    "Cardoso", "Dias", "Monteiro", "Mendes", "Castro", "Campos", "Freitas", "Moreira", "Pinto", "Cavalcanti"
  ];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${firstName} ${lastName}`;
}

// ---------------- Commands builders ----------------

function buildCreateContactCommand(apiKey, contactIdentity) {
  return {
    url: COMMANDS_BASE_URL,
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

function buildCreateTicketCommand(apiKey, customerIdentity) {
  return {
    url: COMMANDS_BASE_URL,
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

// function buildCreateAttendanceCommand(apiKey, customerIdentity) {
//   return {
//     url: COMMANDS_BASE_URL,
//     options: {
//       method: "POST",
//       headers: makeHeaders(apiKey),
//       body: JSON.stringify({
//         id: crypto.randomUUID(),
//         to: "postmaster@desk.msging.net",
//         method: "set",
//         uri: `/tickets/${customerIdentity}`,
//         type: "text/plain",
//         resource: "I need a human!",
//       }),
//     },
//   };
// }

// ---------------- Content script helpers ----------------

async function getAgentFromTab(tabId) {
  const res = await chrome.tabs.sendMessage(tabId, { type: "GET_AGENT" });
  if (!res?.ok) throw new Error("GET_AGENT falhou. Recarregue a página do Desk (F5) e atualize a extensão.");
  return res.agentIdentity;
}

async function getDeskDataFromTab(tabId) {
  const res = await chrome.tabs.sendMessage(tabId, { type: "GET_DESK_DATA" });
  if (!res?.ok) throw new Error("GET_DESK_DATA falhou. Recarregue a página do Desk (F5).");
  return res; // { ok, agentIdentity, ticketIds, debug }
}

// ---------------- Message router ----------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "PROBE_CONTEXT") {
        const { tabId } = msg.payload;

        const agentIdentity = await getAgentFromTab(tabId);
        const desk = await getDeskDataFromTab(tabId);

        sendResponse({
          ok: true,
          action: "PROBE_CONTEXT",
          agentIdentity,
          ticketCount: desk?.ticketIds?.length || 0,
          debug: desk?.debug || null,
        });
        return;
      }

      if (msg?.type === "CREATE_TICKETS") {
        const { qty, batchSize, delayMs } = msg.payload;

        const { apiKey, botShortName } = await loadConfigOrThrow();
        const ownerIdentity = `${botShortName}@msging.net`;

        const settled = await runInBatches(qty, batchSize, delayMs, async () => {
          const customerIdentity = `${crypto.randomUUID()}.${botShortName}@0mn.io`;

          // 1) CRM contact
          {
            const { url, options } = buildCreateContactCommand(apiKey, customerIdentity);
            await doFetchOrThrow(url, options);
          }

          // 2) Desk ticket
          {
            const { url, options } = buildCreateTicketCommand(apiKey, customerIdentity);
            await doFetchOrThrow(url, options);
          }

          // // 3) Attendance message
          // {
          //   const { url, options } = buildCreateAttendanceCommand(apiKey, customerIdentity);
          //   await doFetchOrThrow(url, options);
          // }

          return { customerIdentity };
        });

        sendResponse({
          ok: true,
          action: "CREATE_TICKETS",
          created: qty,
          details: summarizeSettled(settled),
        });
        return;
      }

      sendResponse({ ok: false, error: "Tipo de mensagem desconhecido." });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // async
});
