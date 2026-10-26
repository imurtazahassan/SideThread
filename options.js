const $ = (id) => document.getElementById(id);

const PRESETS = {
  gemini: {
    label: "Google Gemini", tag: "Free", free: true, provider: "gemini", baseUrl: "", model: "gemini-2.5-flash",
    needsKey: true, showBase: false,
    hint: 'Free key: <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>. Model example: gemini-2.5-flash or gemini-1.5-flash.'
  },
  groq: {
    label: "Groq", tag: "Free tier", free: true, provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "",
    needsKey: true, showBase: false,
    hint: 'Free key: <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>. Copy a chat model name from Groq\'s model list.'
  },
  openrouter: {
    label: "OpenRouter", tag: "Free models", free: true, provider: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "",
    needsKey: true, showBase: false,
    hint: 'Key: <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>. Pick a model ending in <b>:free</b> at <a href="https://openrouter.ai/models" target="_blank">openrouter.ai/models</a> and paste its name exactly (no spaces).'
  },
  ollama: {
    label: "Ollama", tag: "Local, free", free: true, provider: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.2",
    needsKey: false, showBase: true,
    hint: "Install Ollama from ollama.com, then run <b>ollama pull llama3.2</b>. No key needed. Keep Ollama running."
  },
  claude: {
    label: "Claude", tag: "Paid API", free: false, provider: "anthropic", baseUrl: "", model: "claude-3-5-sonnet-latest",
    needsKey: true, showBase: false,
    hint: 'Needs a paid API key from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>. Model example: claude-3-5-sonnet-latest.'
  },
  custom: {
    label: "Custom", tag: "Any OpenAI-style API", free: false, provider: "openai", baseUrl: "", model: "",
    needsKey: false, showBase: true,
    hint: "Any service that follows the OpenAI chat format. Enter its base URL, key and model."
  }
};

let state = { preset: "gemini", keys: {}, models: {}, baseUrls: {}, theme: "midnight" };

function inferPreset(o) {
  if (o.provider === "gemini") return "gemini";
  if (o.provider === "anthropic") return "claude";
  const u = o.baseUrl || "";
  if (u.includes("groq")) return "groq";
  if (u.includes("openrouter")) return "openrouter";
  if (u.includes("11434")) return "ollama";
  return "custom";
}

function applyThemeUI() {
  stApplyTheme(document.documentElement, state.theme);
  document.querySelectorAll(".theme").forEach((b) => b.classList.toggle("on", b.dataset.k === state.theme));
}

function readForm() {
  const p = state.preset;
  state.keys[p] = $("apiKey").value.replace(/\s+/g, "");
  state.models[p] = $("model").value.trim();
  if (PRESETS[p].showBase) state.baseUrls[p] = $("baseUrl").value.trim();
}

function fillForm() {
  const p = PRESETS[state.preset];
  $("apiKey").value = state.keys[state.preset] || "";
  $("model").value = state.models[state.preset] != null && state.models[state.preset] !== "" ? state.models[state.preset] : p.model;
  $("baseUrl").value = state.baseUrls[state.preset] != null && state.baseUrls[state.preset] !== "" ? state.baseUrls[state.preset] : p.baseUrl;
  $("baseWrap").style.display = p.showBase ? "block" : "none";
  $("apiKey").placeholder = p.needsKey ? "Paste your key here" : "Not needed (leave empty)";
  $("hint").innerHTML = p.hint;
  $("status").textContent = "";
  document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("on", b.dataset.k === state.preset));
}

function buildUI() {
  const pr = $("presets");
  pr.innerHTML = "";
  Object.entries(PRESETS).forEach(([k, p]) => {
    const b = document.createElement("button");
    b.className = "preset";
    b.dataset.k = k;
    b.innerHTML = "<b>" + p.label + '</b><span class="' + (p.free ? "tag-free" : "") + '">' + p.tag + "</span>";
    b.onclick = () => { readForm(); state.preset = k; fillForm(); };
    pr.appendChild(b);
  });

  const th = $("themes");
  th.innerHTML = "";
  Object.entries(ST_THEMES).forEach(([k, t]) => {
    const b = document.createElement("button");
    b.className = "theme";
    b.dataset.k = k;
    b.innerHTML = '<i style="background:linear-gradient(135deg,' + t.accent + "," + t.accent2 + ')"></i>' + t.name;
    b.onclick = () => {
      state.theme = k;
      applyThemeUI();
      chrome.storage.local.set({ theme: k });
    };
    th.appendChild(b);
  });
}

async function save() {
  readForm();
  const p = state.preset, def = PRESETS[p];
  const key = state.keys[p] || "";
  const model = state.models[p] || "";
  let baseUrl = def.showBase ? (state.baseUrls[p] || "") : def.baseUrl;

  if (def.needsKey && !key) return fail("Please paste your API key.");
  if (!model) return fail("Please enter a model name.");
  if (/\s/.test(model)) return fail("The model name can't contain spaces. Paste it exactly as shown by the provider.");
  if (def.provider === "openai" && baseUrl && !/^https?:\/\//.test(baseUrl)) return fail("Base URL must start with http:// or https://");

  await chrome.storage.local.set({
    preset: p, keys: state.keys, models: state.models, baseUrls: state.baseUrls, theme: state.theme,
    provider: def.provider, apiKey: key, model, baseUrl
  });
  return true;
}

function fail(msg) {
  const s = $("status");
  s.className = "bad";
  s.textContent = msg;
  return false;
}

function ok(msg) {
  const s = $("status");
  s.className = "ok";
  s.textContent = msg;
}

$("save").addEventListener("click", async () => {
  if (await save()) { ok("Saved"); setTimeout(() => ($("status").textContent = ""), 2000); }
});

$("test").addEventListener("click", async () => {
  if (!(await save())) return;
  const s = $("status");
  s.className = "";
  s.textContent = "Testing...";
  try {
    const r = await chrome.runtime.sendMessage({
      type: "ask",
      system: "Reply with only the word OK.",
      messages: [{ role: "user", content: "ping" }]
    });
    if (!r || !r.ok) throw new Error((r && r.error) || "No response");
    ok("Connected. The AI replied: " + String(r.text).trim().slice(0, 40));
  } catch (e) {
    fail(String((e && e.message) || e));
  }
});

$("eye").addEventListener("click", () => {
  const i = $("apiKey");
  const show = i.type === "password";
  i.type = show ? "text" : "password";
  $("eye").textContent = show ? "Hide" : "Show";
});

(async () => {
  const o = await chrome.storage.local.get({
    preset: "", keys: {}, models: {}, baseUrls: {}, theme: "midnight",
    provider: "openai", apiKey: "", model: "", baseUrl: ""
  });
  state.theme = ST_THEMES[o.theme] ? o.theme : "midnight";
  state.keys = o.keys || {};
  state.models = o.models || {};
  state.baseUrls = o.baseUrls || {};
  if (o.preset && PRESETS[o.preset]) {
    state.preset = o.preset;
  } else {
    // migrate settings saved by SideThread v1
    state.preset = o.apiKey || o.model ? inferPreset(o) : "gemini";
    if (o.apiKey) state.keys[state.preset] = o.apiKey;
    if (o.model) state.models[state.preset] = o.model;
    if (o.baseUrl) state.baseUrls[state.preset] = o.baseUrl;
  }
  buildUI();
  applyThemeUI();
  fillForm();
})();
