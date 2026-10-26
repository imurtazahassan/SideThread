// SideThread v2 content script: select text in any AI answer -> ask about it in a side panel.
(() => {
  if (window.__sidethread2) return;
  window.__sidethread2 = true;

  const QUICK = [
    ["Explain simply", "Explain this in simple words."],
    ["Give an example", "Give me a clear, short example of this."],
    ["Why?", "Why is this the case?"],
    ["Summarize", "Summarize this in two lines."]
  ];

  const ICON = {
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-.5-.3-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r=".6"/><circle cx="10" cy="7.5" r=".6"/><circle cx="14.5" cy="7.5" r=".6"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    jump: '<path d="M7 17L17 7M9 7h8v8"/>'
  };
  const svg = (name, size = 16) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

  // ---------- state ----------
  let threads = [];
  let active = -1;
  let panelOpen = false;
  let busy = false;
  let theme = "midnight";
  let side = "right";
  let width = 420;
  let curKey = "";
  let lastPath = location.pathname;
  const ranges = new Map(); // thread id -> Range
  const keyFor = () => "threads:" + location.origin + location.pathname;

  // ---------- page-level highlight style ----------
  const pageStyle = document.createElement("style");
  document.documentElement.appendChild(pageStyle);

  // ---------- shadow DOM host ----------
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;";
  host.dataset.side = side;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
  <style>
    * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
    button { font: inherit; cursor: pointer; }

    .ask { position: fixed; display: none; align-items: center; gap: 7px; padding: 8px 15px 8px 11px;
      border: 0; border-radius: 999px; color: var(--on); font-size: 13px; font-weight: 600;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      box-shadow: 0 10px 30px rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.16);
      animation: pop .16s ease; }
    .ask:hover { filter: brightness(1.08); }
    @keyframes pop { from { opacity: 0; transform: translateY(5px) scale(.95); } }

    #tab { position: fixed; top: 44%; right: 0; width: 40px; height: 48px; display: flex; align-items: center;
      justify-content: center; color: var(--accent); background: var(--card);
      border: 1px solid var(--border); border-right: 0; border-radius: 14px 0 0 14px;
      box-shadow: 0 8px 26px rgba(0,0,0,.35); transition: width .15s, background .15s; }
    #tab:hover { width: 46px; background: var(--card2); }
    :host([data-side=left]) #tab { right: auto; left: 0; border: 1px solid var(--border); border-left: 0; border-radius: 0 14px 14px 0; }
    #badge { position: absolute; top: -6px; left: -4px; min-width: 18px; height: 18px; padding: 0 5px; display: none;
      align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; border-radius: 9px;
      color: var(--on); background: linear-gradient(135deg, var(--accent), var(--accent2)); }
    :host([data-side=left]) #badge { left: auto; right: -4px; }
    #tab.hide { display: none; }

    #panel { position: fixed; top: 0; bottom: 0; right: 0; width: 420px; max-width: 100vw; display: flex; flex-direction: column;
      color: var(--text); background: var(--panel); font-size: 14px; line-height: 1.55;
      backdrop-filter: blur(24px) saturate(140%); -webkit-backdrop-filter: blur(24px) saturate(140%);
      border-left: 1px solid var(--border); box-shadow: -20px 0 70px rgba(0,0,0,.45);
      transform: translateX(105%); visibility: hidden;
      transition: transform .3s cubic-bezier(.2,.8,.2,1), visibility 0s .3s; }
    :host([data-side=left]) #panel { right: auto; left: 0; border-left: 0; border-right: 1px solid var(--border);
      box-shadow: 20px 0 70px rgba(0,0,0,.45); transform: translateX(-105%); }
    #panel.open, :host([data-side=left]) #panel.open { transform: none; visibility: visible;
      transition: transform .3s cubic-bezier(.2,.8,.2,1), visibility 0s; }

    #grip { position: absolute; top: 0; bottom: 0; left: -4px; width: 9px; cursor: ew-resize; z-index: 2; }
    #grip:hover::after, #grip.drag::after { content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; background: var(--accent); opacity: .7; }
    :host([data-side=left]) #grip { left: auto; right: -4px; }
    :host([data-side=left]) #grip:hover::after, :host([data-side=left]) #grip.drag::after { left: auto; right: 4px; }

    header { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px 16px; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; letter-spacing: .2px; }
    .logo { width: 26px; height: 26px; border-radius: 9px; display: grid; place-items: center; color: var(--on);
      background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 4px 14px rgba(0,0,0,.35); }
    .hbtns { display: flex; gap: 2px; }
    .ib { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 10px;
      background: transparent; color: var(--muted); transition: background .12s, color .12s; }
    .ib:hover { background: var(--card2); color: var(--text); }

    #themes { display: none; gap: 10px; padding: 4px 16px 12px; flex-wrap: wrap; }
    #themes.show { display: flex; }
    .sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent; outline: 1px solid var(--border);
      cursor: pointer; transition: transform .12s; }
    .sw:hover { transform: scale(1.12); }
    .sw.on { border-color: var(--text); }

    #chips { display: flex; gap: 6px; padding: 2px 16px 10px; overflow-x: auto; scrollbar-width: none; }
    #chips:empty { display: none; }
    .chip { flex: none; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--muted);
      background: var(--card); border: 1px solid var(--border); transition: all .12s; }
    .chip:hover { color: var(--text); }
    .chip.on { color: var(--on); border-color: transparent; background: linear-gradient(135deg, var(--accent), var(--accent2)); }

    #body { flex: 1; overflow-y: auto; padding: 4px 16px 14px; scrollbar-width: thin; scrollbar-color: var(--card2) transparent; }
    .quote { position: relative; padding: 10px 12px 10px 14px; border-radius: 12px; font-size: 12.5px; color: var(--muted);
      background: var(--card); border: 1px solid var(--border); }
    .quote::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 3px;
      background: linear-gradient(var(--accent), var(--accent2)); }
    .qhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;
      font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--accent); }
    .jump { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent; color: var(--accent);
      font-size: 11px; font-weight: 600; padding: 0; }
    .qtext { max-height: 96px; overflow: auto; white-space: pre-wrap; color: var(--text); opacity: .85; }

    .msg { position: relative; margin-top: 12px; padding: 10px 13px; border-radius: 14px; word-wrap: break-word; animation: pop .18s ease; }
    .msg.user { margin-left: 36px; color: var(--on); border-bottom-right-radius: 5px;
      background: linear-gradient(135deg, var(--accent), var(--accent2)); }
    .msg.ai { margin-right: 8px; background: var(--card); border: 1px solid var(--border); border-bottom-left-radius: 5px; }
    .msg.err { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); color: #fca5a5; white-space: pre-wrap; font-size: 12.5px; }
    .msg p { margin: 0 0 6px; } .msg p:last-child { margin-bottom: 0; }
    .msg ul, .msg ol { margin: 4px 0 8px 18px; padding: 0; }
    .msg li { margin: 2px 0; }
    .msg h4 { margin: 8px 0 4px; font-size: 14px; }
    .msg .sp { height: 6px; }
    .msg pre { margin: 8px 0; padding: 10px 12px; border-radius: 10px; overflow: auto; font-size: 12.5px;
      background: rgba(127,127,127,.14); border: 1px solid var(--border); }
    .msg code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; padding: 1px 5px; border-radius: 5px; background: rgba(127,127,127,.18); }
    .msg pre code { padding: 0; background: none; }
    .cp { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; display: none; place-items: center;
      border: 0; border-radius: 8px; background: var(--card2); color: var(--muted); }
    .msg.ai:hover .cp { display: grid; } .cp:hover { color: var(--text); }
    .dots { display: inline-flex; gap: 4px; padding: 4px 0; }
    .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: bl 1s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }
    @keyframes bl { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1.1); } }

    .empty { margin: 44px 8px 0; text-align: center; color: var(--muted); }
    .empty .big { width: 54px; height: 54px; margin: 0 auto 14px; border-radius: 18px; display: grid; place-items: center;
      color: var(--on); background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 10px 30px rgba(0,0,0,.4); }
    .empty b { color: var(--text); display: block; font-size: 15px; margin-bottom: 6px; }
    .empty ol { text-align: left; display: inline-block; margin: 12px 0 0; padding-left: 18px; font-size: 13px; }

    #quick { display: flex; gap: 6px; padding: 0 16px 8px; overflow-x: auto; scrollbar-width: none; }
    #quick.off { display: none; }
    .q { flex: none; padding: 5px 11px; border-radius: 999px; font-size: 12px; color: var(--text);
      background: var(--card); border: 1px solid var(--border); transition: all .12s; }
    .q:hover { border-color: var(--accent); color: var(--accent); }

    footer { display: flex; align-items: flex-end; gap: 8px; padding: 6px 14px 8px; }
    textarea { flex: 1; resize: none; min-height: 44px; max-height: 140px; padding: 11px 13px; border-radius: 14px;
      border: 1px solid var(--border); background: var(--card); color: var(--text); font-size: 14px; line-height: 1.4; outline: none; }
    textarea::placeholder { color: var(--muted); }
    textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
    #send { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 0; border-radius: 14px;
      color: var(--on); background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 6px 18px rgba(0,0,0,.35); }
    #send:disabled { opacity: .45; cursor: default; }
    .hint { display: flex; justify-content: space-between; align-items: center; padding: 0 16px 12px; font-size: 11px; color: var(--muted); }
    #del { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--muted); font-size: 11px; padding: 0; }
    #del:hover { color: #f87171; }

    #toast { position: fixed; bottom: 28px; left: 50%; transform: translate(-50%, 20px); opacity: 0; pointer-events: none;
      padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--text);
      background: var(--card2); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,.4);
      transition: all .22s; }
    #toast.show { opacity: 1; transform: translate(-50%, 0); }
  </style>

  <button class="ask" id="ask">${svg("spark")}<span>Ask on the side</span></button>
  <button id="tab" title="Open SideThread (Alt+S)">${svg("chat", 18)}<span id="badge"></span></button>

  <aside id="panel">
    <div id="grip"></div>
    <header>
      <div class="brand"><span class="logo">${svg("chat", 15)}</span>SideThread</div>
      <div class="hbtns">
        <button class="ib" id="bTheme" title="Theme">${svg("palette")}</button>
        <button class="ib" id="bSide" title="Move to the other side">${svg("swap")}</button>
        <button class="ib" id="bExport" title="Export notes (.md)">${svg("download")}</button>
        <button class="ib" id="bClose" title="Close (Esc)">${svg("close")}</button>
      </div>
    </header>
    <div id="themes"></div>
    <div id="chips"></div>
    <div id="body"></div>
    <div id="quick"></div>
    <footer>
      <textarea id="input" rows="1" placeholder="Ask about the selected text..."></textarea>
      <button id="send" title="Send">${svg("send", 18)}</button>
    </footer>
    <div class="hint"><span>Enter to send · Shift+Enter new line · Alt+S toggle</span><button id="del">${svg("trash", 13)}Delete</button></div>
  </aside>
  <div id="toast"></div>`;

  const $ = (id) => root.getElementById(id);
  const askBtn = $("ask"), tab = $("tab"), badge = $("badge"), panel = $("panel"), grip = $("grip"),
        themesBox = $("themes"), chips = $("chips"), body = $("body"), quick = $("quick"),
        input = $("input"), sendBtn = $("send"), toastEl = $("toast");

  // ---------- helpers ----------
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function inline(t) {
    return t
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">$1</a>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  }
  function md(src) {
    const blocks = [];
    const s = esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _l, c) => {
      blocks.push(c.replace(/\n$/, ""));
      return "\u0000" + (blocks.length - 1) + "\u0000";
    });
    let out = "", list = null, m;
    const closeList = () => { if (list) { out += "</" + list + ">"; list = null; } };
    for (const line of s.split("\n")) {
      if (/^\u0000\d+\u0000$/.test(line)) { closeList(); out += line; continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
        if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; }
        out += "<li>" + inline(m[1]) + "</li>"; continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
        if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; }
        out += "<li>" + inline(m[1]) + "</li>"; continue;
      }
      closeList();
      if ((m = line.match(/^#{1,6}\s+(.*)/))) { out += "<h4>" + inline(m[1]) + "</h4>"; continue; }
      if (line.trim() === "") { out += '<div class="sp"></div>'; continue; }
      out += "<p>" + inline(line) + "</p>";
    }
    closeList();
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => "<pre><code>" + blocks[i] + "</code></pre>");
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  // ---------- theme / layout ----------
  function applyTheme(key) {
    theme = ST_THEMES[key] ? key : "midnight";
    const t = stApplyTheme(host, theme);
    pageStyle.textContent = "::highlight(sidethread){background:" + t.hl + ";}";
    themesBox.querySelectorAll(".sw").forEach((b) => b.classList.toggle("on", b.dataset.k === theme));
  }
  function buildThemes() {
    themesBox.innerHTML = "";
    Object.entries(ST_THEMES).forEach(([k, t]) => {
      const b = document.createElement("button");
      b.className = "sw";
      b.dataset.k = k;
      b.title = t.name;
      b.style.background = "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")";
      b.onclick = () => {
        applyTheme(k);
        chrome.storage.local.set({ theme: k }).catch(() => {});
        toast(t.name);
      };
      themesBox.appendChild(b);
    });
  }
  function applyLayout() {
    host.dataset.side = side;
    panel.style.width = width + "px";
    tab.classList.toggle("hide", panelOpen);
  }

  // ---------- storage ----------
  const persist = () => chrome.storage.local.set({ [curKey]: threads }).catch(() => {});

  async function loadThreads() {
    curKey = keyFor();
    let r = {};
    try { r = await chrome.storage.local.get(curKey); } catch (_) {}
    if (curKey !== keyFor()) return;
    threads = r[curKey] || [];
    active = threads.length - 1;
    ranges.clear();
    paintHighlights();
    render();
  }
  function paintHighlights() {
    try {
      const rs = [...ranges.values()];
      if (rs.length) CSS.highlights.set("sidethread", new Highlight(...rs));
      else CSS.highlights.delete("sidethread");
    } catch (_) {}
  }

  buildThemes();
  applyTheme(theme);
  applyLayout();
  try {
    chrome.storage.local.get({ theme: "midnight", side: "right", panelWidth: 420 }).then((s) => {
      side = s.side === "left" ? "left" : "right";
      width = Math.min(760, Math.max(320, Number(s.panelWidth) || 420));
      applyTheme(s.theme);
      applyLayout();
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch.theme && ch.theme.newValue) applyTheme(ch.theme.newValue);
    });
  } catch (_) {}
  loadThreads();
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; loadThreads(); }
  }, 1000);

  // ---------- selection -> floating button ----------
  let pending = null;

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length < 3 || !sel.rangeCount) { askBtn.style.display = "none"; return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      pending = { text: text.slice(0, 2000), range: range.cloneRange(), context: getContext(range, text) };
      askBtn.style.display = "inline-flex";
      const w = askBtn.offsetWidth || 150;
      askBtn.style.left = Math.min(window.innerWidth - w - 10, Math.max(8, rect.right - w / 2)) + "px";
      askBtn.style.top = Math.min(window.innerHeight - 48, rect.bottom + 10) + "px";
    }, 10);
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.composedPath().includes(host)) askBtn.style.display = "none";
  });

  askBtn.addEventListener("mousedown", (e) => e.preventDefault());
  askBtn.addEventListener("click", () => {
    if (!pending) return;
    const id = Date.now();
    threads.push({ id, quote: pending.text, context: pending.context, messages: [], t: id });
    active = threads.length - 1;
    ranges.set(id, pending.range);
    paintHighlights();
    askBtn.style.display = "none";
    pending = null;
    openPanel();
    persist();
    render();
    input.focus();
  });

  function getContext(range, text) {
    let el = range.commonAncestorContainer;
    if (el.nodeType !== 1) el = el.parentElement;
    while (el && el !== document.body && (el.innerText || "").length < Math.max(400, text.length + 200)) el = el.parentElement;
    return ((el && el.innerText) || "").slice(0, 3000);
  }

  // ---------- panel open/close ----------
  function openPanel() { panelOpen = true; panel.classList.add("open"); applyLayout(); }
  function closePanel() { panelOpen = false; panel.classList.remove("open"); themesBox.classList.remove("show"); applyLayout(); }
  const togglePanel = () => (panelOpen ? closePanel() : (openPanel(), input.focus()));

  tab.addEventListener("click", togglePanel);
  $("bClose").addEventListener("click", closePanel);
  $("bTheme").addEventListener("click", () => themesBox.classList.toggle("show"));
  $("bSide").addEventListener("click", () => {
    side = side === "right" ? "left" : "right";
    chrome.storage.local.set({ side }).catch(() => {});
    applyLayout();
  });
  $("bExport").addEventListener("click", exportMd);

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyS") { e.preventDefault(); togglePanel(); }
    else if (e.key === "Escape" && panelOpen) closePanel();
  });

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "toggle_panel") togglePanel();
    });
  }

  // ---------- resize ----------
  grip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    grip.classList.add("drag");
    const move = (ev) => {
      const w = side === "right" ? window.innerWidth - ev.clientX : ev.clientX;
      width = Math.min(760, Math.max(320, w));
      panel.style.width = width + "px";
    };
    const up = () => {
      grip.classList.remove("drag");
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", up, true);
      chrome.storage.local.set({ panelWidth: width }).catch(() => {});
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mouseup", up, true);
  });

  // ---------- render ----------
  function render() {
    chips.innerHTML = "";
    threads.forEach((t, i) => {
      const c = document.createElement("button");
      c.className = "chip" + (i === active ? " on" : "");
      c.textContent = "Q" + (i + 1);
      c.title = t.quote.slice(0, 90);
      c.onclick = () => { active = i; render(); };
      chips.appendChild(c);
    });
    badge.textContent = threads.length;
    badge.style.display = threads.length ? "flex" : "none";

    body.innerHTML = "";
    const t = threads[active];
    $("del").style.visibility = t ? "visible" : "hidden";
    quick.classList.toggle("off", !t);

    if (!t) {
      body.innerHTML =
        '<div class="empty"><div class="big">' + svg("spark", 24) + '</div><b>Ask without losing your place</b>' +
        'Every question gets its own space here, so the main chat never moves.' +
        '<br><ol><li>Select any text in an AI answer</li><li>Press <b>Ask on the side</b></li><li>Type your question</li></ol></div>';
      return;
    }

    const q = document.createElement("div");
    q.className = "quote";
    q.innerHTML = '<div class="qhead"><span>Selected text</span><button class="jump">' + svg("jump", 12) + "Jump to it</button></div>" +
      '<div class="qtext">' + esc(t.quote) + "</div>";
    q.querySelector(".jump").onclick = () => {
      const r = ranges.get(t.id);
      if (!r) { toast("Highlight lost after page reload"); return; }
      try {
        const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (_) {}
    };
    body.appendChild(q);
    t.messages.forEach((m) => addMsg(m.role === "user" ? "user" : "ai", m.content));
    body.scrollTop = body.scrollHeight;
  }

  function addMsg(kind, text) {
    const d = document.createElement("div");
    d.className = "msg " + kind;
    if (kind === "ai") {
      d.innerHTML = md(text);
      const cp = document.createElement("button");
      cp.className = "cp";
      cp.title = "Copy";
      cp.innerHTML = svg("copy", 14);
      cp.onclick = () => { navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => {}); };
      d.appendChild(cp);
    } else if (kind === "user") {
      d.textContent = text;
    } else {
      d.textContent = text;
    }
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }

  quick.innerHTML = "";
  QUICK.forEach(([label, prompt]) => {
    const b = document.createElement("button");
    b.className = "q";
    b.textContent = label;
    b.onclick = () => send(prompt);
    quick.appendChild(b);
  });

  $("del").addEventListener("click", () => {
    if (active < 0) return;
    ranges.delete(threads[active].id);
    threads.splice(active, 1);
    active = threads.length - 1;
    paintHighlights();
    persist();
    render();
    toast("Question deleted");
  });

  // ---------- export ----------
  function exportMd() {
    if (!threads.length) { toast("Nothing to export yet"); return; }
    let out = "# SideThread notes - " + document.title + "\n\n";
    threads.forEach((t, i) => {
      out += "## Q" + (i + 1) + "\n\n> " + t.quote.replace(/\n/g, "\n> ") + "\n\n";
      t.messages.forEach((m) => { out += (m.role === "user" ? "**You:** " : "**AI:** ") + m.content + "\n\n"; });
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "text/markdown" }));
    a.download = "sidethread-notes.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Exported");
  }

  // ---------- sending ----------
  async function send(preset) {
    const t = threads[active];
    const text = (typeof preset === "string" ? preset : input.value).trim();
    if (!t || !text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "auto";
    t.messages.push({ role: "user", content: text });
    addMsg("user", text);
    const wait = addMsg("ai", "");
    wait.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    persist();

    const system =
      "You are a side-thread helper. The user is reading an AI's answer and highlighted a passage to ask a follow-up about it. " +
      "Answer only their question, clearly and concisely, in the language they write in.\n\n" +
      "HIGHLIGHTED PASSAGE:\n" + t.quote + "\n\nSURROUNDING TEXT (for context):\n" + t.context;

    try {
      const r = await chrome.runtime.sendMessage({ type: "ask", system, messages: t.messages });
      if (!r || !r.ok) throw new Error((r && r.error) || "No response");
      t.messages.push({ role: "assistant", content: r.text });
      wait.innerHTML = md(r.text);
      const cp = document.createElement("button");
      cp.className = "cp";
      cp.title = "Copy";
      cp.innerHTML = svg("copy", 14);
      cp.onclick = () => { navigator.clipboard.writeText(r.text).then(() => toast("Copied")).catch(() => {}); };
      wait.appendChild(cp);
      persist();
    } catch (e) {
      t.messages.pop();
      wait.className = "msg err";
      wait.textContent = String((e && e.message) || e);
      persist();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      body.scrollTop = body.scrollHeight;
    }
  }

  sendBtn.addEventListener("click", () => send());
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(140, input.scrollHeight) + "px";
  });
  // keep keystrokes inside the panel so the AI site's own shortcuts don't fire
  ["keydown", "keyup", "keypress"].forEach((ev) => input.addEventListener(ev, (e) => e.stopPropagation()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    else if (e.key === "Escape") closePanel();
    else if (e.altKey && e.code === "KeyS") { e.preventDefault(); closePanel(); }
  });
})();
