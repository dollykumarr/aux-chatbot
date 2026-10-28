/* =========================================================
   Aux AI - floating chat widget
   Step 1 + Step 2 + Step 3 (mic input, Speak / Copy / Share)
   Add ONE line before </body> on every page:
   <script src="aux-chatbot.js"></script>
   ========================================================= */
(function () {
  if (document.getElementById("aux-root")) return; // never load twice

  // Find chat_api.php next to this script, so it works from any page or folder
  var scriptSrc = document.currentScript ? document.currentScript.src : "";
  var API_URL = scriptSrc.replace(/aux-chatbot\.js.*$/, "chat_api.php");

  // Microphone language modes. The browser can listen in ONE language at a time
  // and cannot auto-detect, so the user picks the mode.
  //   en = English (and Hinglish typed in Roman letters)  -> "en-IN"
  //   hi = Hindi (Devanagari script)                      -> "hi-IN"
  var LANGS = { en: "en-IN", hi: "hi-IN" };
  var micLang = "en";
  try {
    var savedLang = localStorage.getItem("aux-mic-lang"); // remember the last choice
    if (savedLang && LANGS[savedLang]) micLang = savedLang;
  } catch (err) { /* storage can be blocked, ignore */ }

  // Browser support checks (some browsers do not have these features)
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canSpeak = "speechSynthesis" in window;

  // ---------- 1. CSS (injected, so no extra CSS file is needed) ----------
  var css = `
  #aux-root, #aux-root * { box-sizing: border-box; font-family: "Segoe UI", Roboto, Arial, sans-serif; }
  #aux-fab {
    position: fixed; right: 20px; bottom: 20px; z-index: 99999;
    width: 60px; height: 60px; border-radius: 50%; border: 0; cursor: pointer;
    background: #1d4e5f; color: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.28);
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s;
  }
  #aux-fab:hover { transform: scale(1.07); }
  #aux-fab:focus-visible, #aux-send:focus-visible, #aux-close:focus-visible, #aux-input:focus-visible,
  #aux-mic:focus-visible, .aux-act:focus-visible {
    outline: 3px solid #f2b134; outline-offset: 2px;
  }
  #aux-fab svg { width: 28px; height: 28px; }
  #aux-panel {
    position: fixed; right: 20px; bottom: 92px; z-index: 99999;
    width: 360px; max-width: calc(100vw - 24px); height: 520px; max-height: calc(100vh - 120px);
    background: #fff; border-radius: 16px; overflow: hidden;
    box-shadow: 0 12px 40px rgba(0,0,0,.25);
    display: none; flex-direction: column;
  }
  #aux-panel.aux-open { display: flex; animation: aux-pop .2s ease-out; }
  @keyframes aux-pop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    #aux-panel.aux-open { animation: none; } #aux-fab { transition: none; }
    #aux-mic.aux-listening { animation: none; }
  }
  #aux-head {
    background: #1d4e5f; color: #fff; padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  #aux-head strong { display: block; font-size: 16px; }
  #aux-head span { font-size: 12px; opacity: .85; }
  #aux-close { background: transparent; border: 0; color: #fff; font-size: 24px; cursor: pointer; line-height: 1; }
  #aux-msgs { flex: 1; overflow-y: auto; padding: 14px; background: #f4f6f7; display: flex; flex-direction: column; gap: 10px; }
  .aux-msg { max-width: 82%; padding: 10px 13px; border-radius: 14px; font-size: 14.5px; line-height: 1.45; word-wrap: break-word; }
  .aux-text { white-space: pre-wrap; }
  .aux-bot { background: #fff; color: #1b2a30; align-self: flex-start; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .aux-user { background: #1d4e5f; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; white-space: pre-wrap; }

  /* Speak / Copy / Share buttons under each bot reply */
  .aux-actions { display: flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e6ebee; }
  .aux-act {
    border: 1px solid #c9d3d8; background: #f4f6f7; color: #1d4e5f;
    border-radius: 14px; padding: 4px 10px; font-size: 12.5px; cursor: pointer;
  }
  .aux-act:hover { background: #e6eef1; }

  /* Mic language pills */
  #aux-langs { display: flex; gap: 6px; padding: 8px 10px 0; background: #fff; border-top: 1px solid #dfe5e8; }
  #aux-langs + #aux-form { border-top: 0; }
  .aux-lang {
    border: 1px solid #c9d3d8; background: #fff; color: #1d4e5f;
    border-radius: 14px; padding: 4px 10px; font-size: 12.5px; cursor: pointer;
  }
  .aux-lang[aria-pressed="true"] { background: #1d4e5f; color: #fff; border-color: #1d4e5f; }
  .aux-lang:focus-visible { outline: 3px solid #f2b134; outline-offset: 2px; }

  #aux-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #dfe5e8; background: #fff; }
  #aux-input { flex: 1; min-width: 0; border: 1px solid #c9d3d8; border-radius: 20px; padding: 10px 14px; font-size: 14.5px; }
  #aux-send { border: 0; border-radius: 20px; padding: 0 16px; background: #1d4e5f; color: #fff; font-size: 14.5px; cursor: pointer; }

  /* Microphone button */
  #aux-mic {
    border: 1px solid #c9d3d8; background: #fff; color: #1d4e5f;
    width: 40px; height: 40px; border-radius: 50%; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  #aux-mic svg { width: 20px; height: 20px; }
  #aux-mic.aux-listening { background: #d93025; border-color: #d93025; color: #fff; animation: aux-pulse 1.2s infinite; }
  @keyframes aux-pulse { 0% { box-shadow: 0 0 0 0 rgba(217,48,37,.5); } 70% { box-shadow: 0 0 0 10px rgba(217,48,37,0); } 100% { box-shadow: 0 0 0 0 rgba(217,48,37,0); } }

  /* Header buttons (expand + close) */
  #aux-head-btns { display: flex; align-items: center; gap: 4px; }
  #aux-expand {
    background: transparent; border: 0; color: #fff; cursor: pointer;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  }
  #aux-expand svg { width: 20px; height: 20px; }
  #aux-expand:focus-visible, #aux-close:focus-visible { outline: 3px solid #f2b134; outline-offset: 2px; }

  /* Full-screen mode (opened with the expand button) */
  #aux-panel.aux-full {
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100%; max-width: 100%; height: 100%; max-height: 100%;
    border-radius: 0;
  }
  #aux-root.aux-isfull #aux-fab { display: none; }
  /* Keep the conversation in a readable centered column on wide screens */
  #aux-panel.aux-full #aux-msgs { padding: 20px max(16px, calc((100% - 860px) / 2)); }
  #aux-panel.aux-full .aux-msg { max-width: 75%; font-size: 15.5px; }
  #aux-panel.aux-full #aux-langs { padding: 10px max(16px, calc((100% - 860px) / 2)) 0; }
  #aux-panel.aux-full #aux-form { padding: 12px max(16px, calc((100% - 860px) / 2)) calc(12px + env(safe-area-inset-bottom, 0px)); }

  /* Phones: the chat always opens as a full screen */
  @media (max-width: 600px) {
    #aux-panel {
      top: 0; left: 0; right: 0; bottom: 0;
      width: 100%; max-width: 100%; height: 100%; max-height: 100%;
      border-radius: 0;
    }
    @supports (height: 100dvh) { #aux-panel { height: 100dvh; max-height: 100dvh; } }
    #aux-root.aux-isopen #aux-fab { display: none; }
    #aux-expand { display: none; }
    .aux-msg { max-width: 90%; }
    #aux-input { font-size: 16px; } /* stops iPhone from zooming in when typing */
    #aux-form { padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
  }
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- 2. HTML (injected) ----------
  // The mic button is only added when the browser supports speech recognition
  var micButtonHTML = SpeechRec
    ? '<button id="aux-mic" type="button" aria-label="Speak your question" aria-pressed="false">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>' +
      '</button>'
    : "";

  // Icons for the expand / collapse button
  var ICON_EXPAND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  var ICON_COLLAPSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';

  var langRowHTML = SpeechRec
    ? '<div id="aux-langs" role="group" aria-label="Voice language">' +
        '<button type="button" class="aux-lang" data-lang="en" aria-pressed="false">\uD83C\uDF10 English / Hinglish</button>' +
        '<button type="button" class="aux-lang" data-lang="hi" aria-pressed="false">\u0939\u093F\u0902\u0926\u0940</button>' +
      '</div>'
    : "";

  var root = document.createElement("div");
  root.id = "aux-root";
  root.innerHTML =
    '<button id="aux-fab" type="button" aria-label="Open Aux AI assistant" aria-expanded="false">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
    '</button>' +
    '<section id="aux-panel" role="dialog" aria-label="Aux AI assistant">' +
      '<div id="aux-head"><div><strong>Aux AI</strong><span>Ask about the college, admissions or anything else</span></div>' +
      '<div id="aux-head-btns">' +
        '<button id="aux-expand" type="button" aria-label="Expand chat to full screen" aria-pressed="false">' + ICON_EXPAND + '</button>' +
        '<button id="aux-close" type="button" aria-label="Close chat">&times;</button>' +
      '</div></div>' +
      '<div id="aux-msgs" aria-live="polite"></div>' +
      langRowHTML +
      '<form id="aux-form" autocomplete="off">' +
        micButtonHTML +
        '<input id="aux-input" type="text" placeholder="Type or speak your question..." aria-label="Your question">' +
        '<button id="aux-send" type="submit">Send</button>' +
      '</form>' +
    '</section>';
  document.body.appendChild(root);

  var fab = document.getElementById("aux-fab");
  var panel = document.getElementById("aux-panel");
  var msgs = document.getElementById("aux-msgs");
  var form = document.getElementById("aux-form");
  var input = document.getElementById("aux-input");
  var micBtn = document.getElementById("aux-mic"); // null if not supported
  var expandBtn = document.getElementById("aux-expand");

  // Switch between the small popup and the full screen
  function setFull(full) {
    panel.classList.toggle("aux-full", full);
    root.classList.toggle("aux-isfull", full);
    expandBtn.setAttribute("aria-pressed", full ? "true" : "false");
    expandBtn.setAttribute("aria-label", full ? "Back to small window" : "Expand chat to full screen");
    expandBtn.innerHTML = full ? ICON_COLLAPSE : ICON_EXPAND;
    msgs.scrollTop = msgs.scrollHeight;
  }
  expandBtn.addEventListener("click", function () {
    setFull(!panel.classList.contains("aux-full"));
    input.focus();
  });

  // ---------- 3. Open / close ----------
  function setOpen(open) {
    panel.classList.toggle("aux-open", open);
    root.classList.toggle("aux-isopen", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      input.focus();
    } else {
      setFull(false); // always reopen as the small window next time
      // Stop voice input and speech when the chat is closed
      stopMic();
      if (canSpeak) window.speechSynthesis.cancel();
    }
  }
  fab.addEventListener("click", function () { setOpen(!panel.classList.contains("aux-open")); });
  document.getElementById("aux-close").addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // First Escape leaves full screen, second Escape closes the chat
    if (panel.classList.contains("aux-full")) { setFull(false); } else { setOpen(false); }
  });

  // ---------- 4. Helper functions: Speak, Copy, Share ----------

  // Pick the speaking language: Hindi if the text has Devanagari letters, else English
  function detectLang(text) {
    return /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN";
  }

  // Read the text aloud. Clicking again while speaking stops it.
  function speakText(text) {
    if (!canSpeak) return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = detectLang(text);
    window.speechSynthesis.speak(u);
  }

  // Copy text to the clipboard; returns a Promise.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers or non-HTTPS pages
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy") ? resolve() : reject();
      } catch (err) {
        reject(err);
      }
      document.body.removeChild(ta);
    });
  }

  // Open the phone's share sheet. If not supported, copy instead.
  // Returns a Promise that resolves to "shared" or "copied".
  function shareText(text) {
    if (navigator.share) {
      return navigator
        .share({ title: "Ramgarh College Assistant", text: text })
        .then(function () { return "shared"; });
    }
    return copyText(text).then(function () { return "copied"; });
  }

  // Briefly change a button's label (for example "Copied")
  function flashLabel(btn, newLabel) {
    var old = btn.textContent;
    btn.textContent = newLabel;
    setTimeout(function () { btn.textContent = old; }, 1500);
  }

  // Build one small action button
  function makeActionButton(label, ariaLabel, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "aux-act";
    b.textContent = label;
    b.setAttribute("aria-label", ariaLabel);
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- 5. Messages ----------
  // noActions = true skips the Speak / Copy / Share buttons (used for small system notes)
  function addMessage(text, who, noActions) {
    var m = document.createElement("div");
    m.className = "aux-msg " + (who === "user" ? "aux-user" : "aux-bot");

    if (who === "user") {
      m.textContent = text; // textContent (not innerHTML) keeps it safe
    } else {
      var t = document.createElement("div");
      t.className = "aux-text";
      t.textContent = text;
      m.appendChild(t);

      if (!noActions) {
        var bar = document.createElement("div");
        bar.className = "aux-actions";

        if (canSpeak) {
          bar.appendChild(makeActionButton("\uD83D\uDD0A Speak", "Read this reply aloud", function () {
            speakText(text);
          }));
        }

        bar.appendChild(makeActionButton("\uD83D\uDCCB Copy", "Copy this reply", function (e) {
          var btn = e.currentTarget;
          copyText(text).then(
            function () { flashLabel(btn, "Copied \u2713"); },
            function () { flashLabel(btn, "Failed"); }
          );
        }));

        bar.appendChild(makeActionButton("\u2197 Share", "Share this reply", function (e) {
          var btn = e.currentTarget;
          shareText(text).then(
            function (result) { if (result === "copied") flashLabel(btn, "Copied \u2713"); },
            function () { /* user closed the share sheet: do nothing */ }
          );
        }));

        m.appendChild(bar);
      }
    }

    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Sends the question to chat_api.php and returns the reply text
  function getReply(question) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Server error " + res.status);
        return res.json();
      })
      .then(function (data) { return data.reply; })
      .catch(function () {
        return "Sorry, I could not reach the server. Please check that Apache is running and try again.";
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    stopMic();
    var q = input.value.trim();
    if (!q) return;
    addMessage(q, "user");
    input.value = "";
    getReply(q).then(function (answer) { addMessage(answer, "bot"); });
  });

  // ---------- 6. Microphone (speech to text) ----------
  var recognition = null;
  var listening = false;

  function stopMic() {
    if (recognition && listening) recognition.stop();
  }

  function startMic() {
    if (!SpeechRec) return;
    // Stop any reply that is being read aloud, so the mic does not hear it
    if (canSpeak) window.speechSynthesis.cancel();

    recognition = new SpeechRec();
    recognition.lang = LANGS[micLang];
    recognition.interimResults = true; // show words while the user is still speaking
    recognition.continuous = false;

    recognition.onstart = function () {
      listening = true;
      micBtn.classList.add("aux-listening");
      micBtn.setAttribute("aria-pressed", "true");
      input.placeholder = "Listening...";
    };

    recognition.onresult = function (e) {
      var text = "";
      for (var i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      input.value = text;
    };

    recognition.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        addMessage("Microphone permission is blocked. Please allow the microphone in your browser settings and try again.", "bot", true);
      } else if (e.error === "no-speech") {
        addMessage("I did not hear anything. Please tap the mic and try again.", "bot", true);
      }
    };

    recognition.onend = function () {
      listening = false;
      micBtn.classList.remove("aux-listening");
      micBtn.setAttribute("aria-pressed", "false");
      input.placeholder = "Type or speak your question...";
      input.focus(); // the user can check the text and press Send
    };

    recognition.start();
  }

  // Language pills: highlight the chosen mode and remember it
  var langBtns = document.querySelectorAll(".aux-lang");
  function showLang() {
    Array.prototype.forEach.call(langBtns, function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === micLang ? "true" : "false");
    });
  }
  Array.prototype.forEach.call(langBtns, function (b) {
    b.addEventListener("click", function () {
      micLang = b.getAttribute("data-lang");
      try { localStorage.setItem("aux-mic-lang", micLang); } catch (err) { /* ignore */ }
      stopMic(); // the new language applies from the next time the mic starts
      showLang();
    });
  });
  showLang();

  if (micBtn) {
    micBtn.addEventListener("click", function () {
      if (listening) { stopMic(); } else { startMic(); }
    });
  }

  addMessage("Hello! I am Aux AI, the assistant for this website. How can I help you today?", "bot");
})();