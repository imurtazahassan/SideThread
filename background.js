// SideThread background: talks to the AI provider chosen in settings.

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-panel") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "toggle_panel" }).catch(() => {});
        }
      });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "ask") {
    ask(msg)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // async response
  }
});

async function ask({ messages, system }) {
  const cfg = await chrome.storage.local.get({ provider: "openai", apiKey: "", model: "", baseUrl: "" });

  if (!cfg.model) throw new Error("No model set. Click the SideThread icon and fill in the settings.");
  if (/\s/.test(cfg.model)) throw new Error("The model name contains a space. Open settings and paste it exactly.");

  if (cfg.provider === "anthropic") {
    if (!cfg.apiKey) throw new Error("No API key set. Open SideThread settings.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1024, system, messages })
    });
    const data = await readJson(res, "Anthropic");
    return (data.content || []).map((b) => b.text || "").join("");
  }

  if (cfg.provider === "gemini") {
    if (!cfg.apiKey) throw new Error("No API key set. Open SideThread settings.");
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(cfg.model) +
      ":generateContent?key=" +
      encodeURIComponent(cfg.apiKey);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }))
      })
    });
    const data = await readJson(res, "Gemini");
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || "").join("") || "(empty reply)";
  }

  // OpenAI-compatible: OpenAI, OpenRouter, Groq, DeepSeek, Ollama, LM Studio, etc.
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers = { "content-type": "application/json" };
  if (cfg.apiKey) headers.authorization = "Bearer " + cfg.apiKey;
  const res = await fetch(base + "/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: system }, ...messages]
    })
  });
  let host = base;
  try { host = new URL(base).host; } catch (_) {}
  const data = await readJson(res, host);
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "(empty reply)";
}

async function readJson(res, who) {
  const raw = await res.text();
  if (!res.ok) {
    let hint = "";
    if (res.status === 401 || res.status === 403) hint = " Key rejected by " + who + ". Check the provider, key and base URL in settings.";
    else if (res.status === 404) hint = " Model or URL not found. Check the model name and base URL.";
    else if (res.status === 429) hint = " Rate limit reached (common on free tiers). Wait a minute or pick another model.";
    throw new Error("Error " + res.status + "." + hint + "\n\n" + raw.slice(0, 220));
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Bad response from " + who + ".");
  }
}
