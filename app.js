/* =========================================================
   MAPA DE RECONEXIÓN PERSONAL™ — Motor de la aplicación
   ========================================================= */
(function () {
  "use strict";

  var CONTENT = JSON.parse(document.getElementById("content-data").textContent);

  var TABS = [
    { id: "portada", icon: "🏡", label: "Portada", color: "var(--purple)", colorDark: "var(--purple-d)" },
    { id: "instrucciones", icon: "🧭", label: "Instrucciones", color: "var(--purple)", colorDark: "var(--purple-d)" },
    { id: "codigoA", icon: "🌀", label: "Fase 1 - Sobrecarga", color: "var(--purple)", colorDark: "var(--purple-d)" },
    { id: "codigoB", icon: "💗", label: "Fase 2 - Esencia", color: "var(--pink)", colorDark: "var(--pink-d)" },
    { id: "codigoC", icon: "🌿", label: "Fase 3 - Fortaleza", color: "var(--turquoise)", colorDark: "var(--turquoise-d)" },
    { id: "codigoD", icon: "☀️", label: "Fase 4 - Camino de Vida", color: "var(--yellow)", colorDark: "var(--yellow-d)" },
    { id: "fase5", icon: "✨", label: "Fase 5 · Alineación Total", color: "var(--purple)", colorDark: "var(--purple-d)" },
    { id: "fase6", icon: "🕊️", label: "Fase 6 · Reencuentro Sagrado", color: "var(--turquoise)", colorDark: "var(--turquoise-d)" },
    { id: "cierre", icon: "🎁", label: "Cierre & Descarga", color: "var(--yellow)", colorDark: "var(--yellow-d)" }
  ];

  var state = { name: "", day: null, month: null, year: null, codes: null, activeTab: 0, token: null };

  /* ---------------------------------------------------------
     0. CONTROL DE ACCESO — enlace de un solo uso
     Cada link debe incluir ?token=ALGO-UNICO. El servidor (api/check-token
     y api/redeem-token, respaldados por Upstash Redis en Vercel) es la
     única fuente de verdad: un token solo puede "canjearse" una vez.
     --------------------------------------------------------- */
  function getTokenFromURL() {
    try {
      var params = new URLSearchParams(window.location.search);
      var t = (params.get("token") || "").trim();
      return t;
    } catch (e) {
      return "";
    }
  }

  function showGate(title, message) {
    document.getElementById("gateTitle").textContent = title;
    document.getElementById("gateMessage").textContent = message;
    document.getElementById("gateScreen").classList.remove("hidden");
    document.getElementById("formScreen").classList.add("hidden");
  }

  function unlockForm() {
    document.getElementById("gateScreen").classList.add("hidden");
    document.getElementById("formScreen").classList.remove("hidden");
  }

  function initAccessGate() {
    var token = getTokenFromURL();

    if (!token) {
      showGate(
        "Este enlace no es válido",
        "Este Mapa de Reconexión Personal™ necesita un enlace personal para poder abrirse. Si crees que esto es un error, contacta a Tere Becerra Huerta para que te comparta tu acceso."
      );
      return;
    }

    state.token = token;

    fetch("/api/check-token?token=" + encodeURIComponent(token), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.valid) {
          unlockForm();
        } else if (data && data.reason === "used") {
          showGate(
            "Este enlace ya fue utilizado",
            "Este Mapa de Reconexión Personal™ ya fue generado anteriormente con este enlace. Cada acceso es válido para un solo uso.\n\nSi necesitas ayuda, contacta a soporte@terebecerrahuerta.net o escríbenos al +(52) 871-111-4224."
          );
        } else {
          showGate(
            "Este enlace no es válido",
            "No pudimos validar tu acceso. Contacta a Tere Becerra Huerta para confirmar tu enlace."
          );
        }
      })
      .catch(function () {
        showGate(
          "No pudimos verificar tu enlace",
          "Revisa tu conexión a internet e intenta de nuevo. Si el problema continúa, contacta a Tere Becerra Huerta."
        );
      });
  }

  function redeemToken() {
    return fetch("/api/redeem-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token })
    })
      .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
      .then(function (res) {
        return !!(res.data && res.data.ok);
      })
      .catch(function () { return false; });
  }

  /* ---------------------------------------------------------
     1. NUMEROLOGÍA
     --------------------------------------------------------- */
  function sumDigits(n) {
    return String(Math.abs(n)).split("").reduce(function (a, d) { return a + parseInt(d, 10); }, 0);
  }

  function reducir(n) {
    n = Math.abs(n);
    while (n > 9 && n !== 11 && n !== 22) {
      n = sumDigits(n);
    }
    return n;
  }

  function computeCodes(day, month, year) {
    var A = reducir(month);
    var B = reducir(day);
    var C = reducir(sumDigits(year));
    // Código D: se suman los dígitos de día + mes + año de forma abierta,
    // SIN reducir cada componente antes. Solo se reduce (respetando 11/22) el total final.
    var rawTotal = sumDigits(day) + sumDigits(month) + sumDigits(year);
    var D = reducir(rawTotal);
    return { A: A, B: B, C: C, D: D };
  }

  function parseDate(str) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
    if (!m) return null;
    var day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    if (month < 1 || month > 12) return null;
    var daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return null;
    if (year < 1900 || year > new Date().getFullYear()) return null;
    return { day: day, month: month, year: year };
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  // Detecta iOS (iPhone/iPad/iPod). iPadOS desde la versión 13 identifica su
  // user agent como si fuera un Mac de escritorio, así que esa forma de
  // detección se complementa comprobando si además soporta eventos táctiles
  // (algo que un Mac real no tiene) — sin esto, un iPad quedaría sin
  // detectar y seguiría mostrando el mismo problema que en iPhone.
  function isIOS() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  /* ---------------------------------------------------------
     2. FORMULARIO — máscara + validación
     --------------------------------------------------------- */
  var dateInput = document.getElementById("birthDate");
  dateInput.addEventListener("input", function () {
    var v = dateInput.value.replace(/[^\d]/g, "").slice(0, 8);
    var out = v;
    if (v.length > 4) out = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
    else if (v.length > 2) out = v.slice(0, 2) + "/" + v.slice(2);
    dateInput.value = out;
  });

  document.getElementById("mapForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var nameInput = document.getElementById("fullName");
    var name = nameInput.value.trim();
    var dateStr = dateInput.value.trim();
    var errName = document.getElementById("errName");
    var errDate = document.getElementById("errDate");
    var valid = true;

    if (name.length < 3) {
      nameInput.classList.add("error");
      errName.classList.add("show");
      valid = false;
    } else {
      nameInput.classList.remove("error");
      errName.classList.remove("show");
    }

    var parsed = parseDate(dateStr);
    if (!parsed) {
      dateInput.classList.add("error");
      errDate.classList.add("show");
      valid = false;
    } else {
      dateInput.classList.remove("error");
      errDate.classList.remove("show");
    }

    if (!valid) return;

    var submitBtn = document.querySelector("#mapForm .btn-generate");
    submitBtn.disabled = true;
    var originalBtnText = submitBtn.textContent;
    submitBtn.textContent = "Verificando tu acceso…";

    redeemToken().then(function (success) {
      if (!success) {
        showGate(
          "Este enlace ya fue utilizado",
          "Este Mapa de Reconexión Personal™ ya fue generado anteriormente con este enlace. Cada acceso es válido para un solo uso. Si necesitas ayuda, contacta a Tere Becerra Huerta."
        );
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        return;
      }

      state.name = name;
      state.day = parsed.day;
      state.month = parsed.month;
      state.year = parsed.year;
      state.codes = computeCodes(parsed.day, parsed.month, parsed.year);

      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      launchApp();
    });
  });

  initAccessGate();

  /* ---------------------------------------------------------
     3. NORMALIZADOR DE CONTENIDO -> BLOQUES
     --------------------------------------------------------- */
  function isDivider(text) {
    return /^[\s─\-–—]+$/.test(text) && /[─\-–—]/.test(text);
  }

  function isStep(text) {
    // "PASO N · ..." (Fase 6) o "CIERRE · ..." (el único "paso" de la pestaña
    // de Cierre — build_content.py renombra ahí el antiguo "PASO 3" para que
    // no aparezca un número de paso fuera de contexto).
    return /^PASO\s+\d+/i.test(text.trim()) || /^CIERRE\s*·/i.test(text.trim());
  }

  // El párrafo de "revelación clave" de cada código es siempre el que
  // aparece justo antes de PASO 4 (el paso de acción: "TU PRIMER PASO",
  // "VUELVE A TU VERDADERO CAMINO", etc.) — separado de él por el divisor
  // "─ ─ ─". Es la respuesta que la clienta más necesita ver, así que se
  // resalta con el color de la fase en vez de aparecer como texto plano.
  // Se detecta por POSICIÓN dentro del array original de items (no por
  // palabras clave), porque el texto varía según el código/número pero la
  // posición estructural es siempre la misma — verificado en las 42
  // combinaciones de código × número del contenido actual.
  function findRevelationIndex(items) {
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      if (t.type === "p" && /^PASO\s+4/i.test((t.text || "").trim())) {
        // i-1 debería ser el divisor "─ ─ ─"; el párrafo de revelación es i-2.
        if (i >= 2 && items[i - 1].type === "p" && isDivider(items[i - 1].text) && items[i - 2].type === "p") {
          return i - 2;
        }
      }
    }
    return -1;
  }

  function isHeading(text) {
    if (text.indexOf("\n") !== -1) return false;
    if (text.length > 72) return false;
    if (/[.!?…]\s*$/.test(text.trim()) && text.length > 40) return false;
    return true;
  }

  function parseCardText(raw) {
    var lines = raw.split("\n");
    var title = (lines.shift() || "").trim();
    var groups = [];
    var currentGroup = null;

    function pushGroup(type) {
      currentGroup = { type: type, lines: [] };
      groups.push(currentGroup);
    }

    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { currentGroup = null; return; }
      var type = "plain";
      if (t.charAt(0) === "☐" || t.charAt(0) === "□") { type = "checkbox"; t = t.slice(1).trim(); }
      else if (t.charAt(0) === "•") { type = "bullet"; t = t.slice(1).trim(); }
      if (!currentGroup || currentGroup.type !== type) pushGroup(type);
      currentGroup.lines.push(t);
    });

    return { title: title, groups: groups };
  }

  function normalizeItems(items) {
    var blocks = [];
    var revelationIdx = findRevelationIndex(items);
    items.forEach(function (item, idx) {
      if (item.type === "signature") {
        blocks.push({ kind: "signature", lines: item.lines });
        return;
      }
      if (item.type === "declaration") {
        blocks.push({ kind: "declaration", text: item.text });
        return;
      }
      if (item.type === "table") {
        var rows = item.rows;
        if (rows.length === 1) {
          blocks.push({ kind: "card", card: parseCardText(rows[0][0]) });
        } else {
          var cards = [];
          rows.forEach(function (r) { r.forEach(function (cellText) { cards.push(parseCardText(cellText)); }); });
          blocks.push({ kind: "cardgrid", cards: cards });
        }
        return;
      }
      var text = item.text;
      if (idx === revelationIdx) { blocks.push({ kind: "callout", text: text }); return; }
      if (isDivider(text)) { blocks.push({ kind: "divider" }); return; }
      if (isStep(text)) { blocks.push({ kind: "step", text: text }); return; }
      if (isHeading(text)) { blocks.push({ kind: "heading", text: text }); return; }
      if (/^(coloca una mano|antes de leer)/i.test(text.trim()) === false && /respira profundo/i.test(text)) {
        blocks.push({ kind: "callout", text: text });
        return;
      }
      blocks.push({ kind: "paragraph", text: text });
    });
    return blocks;
  }

  /* ---------------------------------------------------------
     4. RENDER HTML DE BLOQUES
     --------------------------------------------------------- */
  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderCard(container, card) {
    var c = el("div", "card");
    if (card.title) c.appendChild(el("div", "card-title", escapeHtml(card.title)));
    card.groups.forEach(function (g) {
      if (g.type === "plain") {
        c.appendChild(el("p", "card-line plain", escapeHtml(g.lines.join(" "))));
      } else {
        g.lines.forEach(function (line) {
          c.appendChild(el("div", "card-line " + g.type, escapeHtml(line)));
        });
      }
    });
    container.appendChild(c);
  }

  function renderBlocks(container, blocks) {
    blocks.forEach(function (b) {
      switch (b.kind) {
        case "divider":
          container.appendChild(el("div", "block-divider", "✦ ✦ ✦"));
          break;
        case "heading":
          container.appendChild(el("div", "block-heading", "<span>" + escapeHtml(b.text) + "</span>"));
          break;
        case "step":
          var stepWrap = el("div", "block-step");
          // Los pasos numerados ("PASO 1", "PASO 2"...) muestran su número.
          // El paso de cierre ("CIERRE · ...") no tiene un número real dentro
          // de esa pestaña (es el único que aparece ahí), así que en vez de un
          // número fuera de contexto usamos un símbolo de cierre/logro (✓).
          var stepMatch = /PASO\s+(\d+)/i.exec(b.text);
          var num = stepMatch ? stepMatch[1] : "✓";
          var badge = el("div", "step-badge", num);
          if (!stepMatch) badge.classList.add("step-badge-closing");
          var label = el("div", "step-text", escapeHtml(b.text.replace(/^(PASO\s+\d+|CIERRE)\s*·?\s*/i, "")));
          stepWrap.appendChild(badge);
          stepWrap.appendChild(label);
          container.appendChild(stepWrap);
          break;
        case "callout":
          container.appendChild(el("div", "block-callout", escapeHtml(b.text)));
          break;
        case "paragraph":
          container.appendChild(el("p", "block-p", escapeHtml(b.text)));
          break;
        case "declaration":
          var declCard = el("div", "declaration-card");
          declCard.appendChild(el("div", "declaration-text", escapeHtml(b.text)));
          container.appendChild(declCard);
          break;
        case "card":
          renderCard(container, b.card);
          break;
        case "cardgrid":
          var grid = el("div", "card-grid");
          b.cards.forEach(function (card) { renderCard(grid, card); });
          container.appendChild(grid);
          break;
        case "signature":
          var sig = el("div", "signature-block");
          sig.appendChild(el("div", "sig-name", escapeHtml(b.lines[0] || "")));
          sig.appendChild(el("div", "sig-title", escapeHtml((b.lines.slice(1) || []).join(" · "))));
          container.appendChild(sig);
          break;
      }
    });
  }

  /* ---------------------------------------------------------
     5. CONSTRUCCIÓN DE PANELES
     --------------------------------------------------------- */
  function gradientFor(hex) {
    return "linear-gradient(135deg, " + hexToRgba(hex, 0.22) + ", " + hexToRgba(hex, 0.06) + ")";
  }
  function hexToRgba(hex, a) {
    var c = hex.replace("#", "");
    var r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  // Los 4 colores de tema tal como están definidos en :root (style.css).
  // panelHero() a veces recibe "var(--purple)" y a veces un hex real
  // (META.codeColors), así que esta tabla permite resolver cualquiera de
  // los dos casos a un hex utilizable por hexToRgba().
  var THEME_HEX = {
    "var(--purple)": "#8B85CA",
    "var(--pink)": "#E7BBD7",
    "var(--turquoise)": "#AFE2E3",
    "var(--yellow)": "#F3EFA1"
  };
  function resolveHex(color) {
    return THEME_HEX[color] || color;
  }

  // Fondo del bloque de revelación clave (.block-callout): un tinte muy
  // suave del color de la fase actual. Se calcula aquí como rgba() fijo,
  // en vez de con la función CSS color-mix(), porque html2canvas@1.4.1
  // (usado para generar el PDF) no reconoce color-mix() y lanza
  // "Attempting to parse an unsupported color function" al capturar la
  // página — eso rompía la descarga del PDF por completo. rgba() con un
  // valor numérico ya resuelto es 100% compatible con html2canvas, y
  // visualmente da el mismo resultado.
  function calloutBgFor(color) {
    return hexToRgba(resolveHex(color), 0.16);
  }

  var META = CONTENT.meta;

  function panelHero(container, opts) {
    var hero = el("div", "panel-hero");
    hero.style.setProperty("--panel-gradient", opts.gradient);
    hero.style.setProperty("--panel-color", opts.color);
    hero.style.setProperty("--panel-color-dark", opts.colorDark);
    hero.style.setProperty("--panel-callout-bg", calloutBgFor(opts.color));
    if (opts.phase) hero.appendChild(el("div", "phase-label", escapeHtml(opts.phase)));
    if (opts.eyebrow) hero.appendChild(el("div", "eyebrow", escapeHtml(opts.eyebrow)));
    hero.appendChild(el("h2", "", escapeHtml(opts.title)));
    if (opts.number !== undefined) hero.appendChild(el("div", "panel-number", opts.number));
    if (opts.tagline) hero.appendChild(el("div", "panel-tagline", escapeHtml(opts.tagline)));
    container.appendChild(hero);
    container.style.setProperty("--panel-color", opts.color);
    container.style.setProperty("--panel-color-dark", opts.colorDark);
    container.style.setProperty("--panel-callout-bg", calloutBgFor(opts.color));
  }

  function buildPortada(container) {
    panelHero(container, {
      eyebrow: "Código Maestro de Vida™",
      title: "Mapa de Reconexión Personal™",
      tagline: "Tu viaje de regreso a casa",
      color: "var(--purple)", colorDark: "var(--purple-d)",
      gradient: "linear-gradient(135deg, rgba(139,133,202,0.20), rgba(231,187,215,0.16), rgba(175,226,227,0.16), rgba(243,239,161,0.18))"
    });

    var meta = el("div", "portada-meta");
    meta.innerHTML = "Elaborado especialmente para <strong>" + escapeHtml(state.name) + "</strong><br>Fecha de nacimiento: " + pad2(state.day) + "/" + pad2(state.month) + "/" + state.year;
    container.appendChild(meta);

    var grid = el("div", "portada-codes");
    ["A", "B", "C", "D"].forEach(function (k) {
      var chip = el("div", "code-chip " + k.toLowerCase());
      chip.innerHTML =
        '<div class="code-letter">Código ' + k + "</div>" +
        '<div class="code-value">' + state.codes[k] + "</div>" +
        '<div class="code-name">' + META.codeNames[k] + "</div>";
      grid.appendChild(chip);
    });
    container.appendChild(grid);

    renderBlocks(container, normalizeItems(CONTENT.portada));
  }

  function buildInstrucciones(container) {
    panelHero(container, {
      eyebrow: "Antes de comenzar",
      title: "Instrucciones",
      tagline: "Cómo leer y habitar tu Mapa de Reconexión Personal™",
      color: "var(--purple)", colorDark: "var(--purple-d)",
      gradient: gradientFor(META.codeColors.A)
    });
    renderBlocks(container, normalizeItems(CONTENT.instrucciones));
  }

  var CODE_PHASE_NUMBER = { A: 1, B: 2, C: 3, D: 4 };

  function buildCodigo(container, code) {
    var num = String(state.codes[code]);
    var items = CONTENT.codigos[code][num];
    var color = META.codeColors[code];
    var colorDark = META.codeColorsDark[code];
    panelHero(container, {
      phase: "Fase " + CODE_PHASE_NUMBER[code],
      eyebrow: META.codeFullTitles[code],
      title: "Tu número es " + num,
      color: color, colorDark: colorDark,
      gradient: gradientFor(color)
    });
    if (items) {
      renderBlocks(container, normalizeItems(items));
    } else {
      container.appendChild(el("p", "block-p", "Contenido no disponible para este número todavía."));
    }
  }

  function buildFase5(container) {
    panelHero(container, {
      eyebrow: "Fase 5",
      title: "La Alineación Total™",
      tagline: "Tu alineación interior · El regreso a ti misma",
      color: "var(--purple)", colorDark: "var(--purple-d)",
      gradient: gradientFor(META.codeColors.A)
    });
    renderBlocks(container, normalizeItems(CONTENT.fase5));
  }

  function buildFase6(container) {
    panelHero(container, {
      eyebrow: "Fase 6",
      title: "El Reencuentro Sagrado™",
      tagline: "Tu Protocolo Diario de 15 Minutos · La Activación Final",
      color: "var(--turquoise)", colorDark: "var(--turquoise-d)",
      gradient: gradientFor(META.codeColors.C)
    });
    renderBlocks(container, normalizeItems(CONTENT.fase6));
  }

  function buildCierre(container) {
    panelHero(container, {
      eyebrow: "Para ti, " + state.name.split(" ")[0],
      title: "Cierre & Descarga",
      tagline: "Este no es un final. Es un comienzo.",
      color: "var(--yellow)", colorDark: "var(--yellow-d)",
      gradient: gradientFor(META.codeColors.D)
    });
    renderBlocks(container, normalizeItems(CONTENT.cierre));

    var box = el("div", "download-box");
    box.innerHTML = "<p>Lleva contigo tu Mapa completo, listo para imprimir y releer cuantas veces tu corazón lo necesite.</p>";
    var btn = el("button", "btn-download", "⬇️ Descargar Mi Mapa Personalizado (PDF)");
    btn.id = "downloadBtn";
    btn.addEventListener("click", handleDownload);
    box.appendChild(btn);
    var shareNote = el("p", "download-share-note",
      "¿Vas a compartirlo por WhatsApp? Ábrelo primero desde la carpeta de Descargas de tu teléfono y compártelo desde ahí, para asegurarte de que la otra persona pueda abrirlo sin problema.");
    box.appendChild(shareNote);
    container.appendChild(box);

    container.appendChild(el("div", "footer-note", "Con profundo amor · Tere Becerra Huerta · Creadora del Código Maestro de Vida™"));
  }

  var BUILDERS = {
    portada: buildPortada,
    instrucciones: buildInstrucciones,
    codigoA: function (c) { buildCodigo(c, "A"); },
    codigoB: function (c) { buildCodigo(c, "B"); },
    codigoC: function (c) { buildCodigo(c, "C"); },
    codigoD: function (c) { buildCodigo(c, "D"); },
    fase5: buildFase5,
    fase6: buildFase6,
    cierre: buildCierre
  };

  /* ---------------------------------------------------------
     6. NAVEGACIÓN DE PESTAÑAS
     --------------------------------------------------------- */
  function launchApp() {
    document.getElementById("formScreen").classList.add("hidden");
    var appScreen = document.getElementById("appScreen");
    appScreen.classList.remove("hidden");
    document.getElementById("headerClientName").textContent = state.name;

    var nav = document.getElementById("tabNav");
    var panelsWrap = document.getElementById("tabPanels");
    var progressTrack = document.getElementById("progressTrack");
    nav.innerHTML = "";
    panelsWrap.innerHTML = "";
    if (progressTrack) {
      progressTrack.innerHTML = "";
      TABS.forEach(function () { progressTrack.appendChild(el("div", "progress-seg")); });
    }

    TABS.forEach(function (tab, idx) {
      var btn = el("button", "tab-btn", '<span class="tab-icon">' + tab.icon + "</span><span>" + tab.label + "</span>");
      btn.style.setProperty("--tab-color", tab.color);
      btn.addEventListener("click", function () { goToTab(idx); });
      nav.appendChild(btn);

      var panel = el("div", "tab-panel");
      panel.id = "panel-" + tab.id;
      var contentWrap = el("div", "");
      BUILDERS[tab.id](contentWrap);

      var navActions = el("div", "panel-nav-actions");
      var prevBtn = el("button", "nav-arrow", "← Anterior");
      prevBtn.addEventListener("click", function () { goToTab(Math.max(0, idx - 1)); });
      if (idx === 0) prevBtn.disabled = true;
      navActions.appendChild(prevBtn);
      // La última pestaña (Cierre) no necesita "Siguiente": ya no hay a dónde avanzar.
      if (idx !== TABS.length - 1) {
        var nextBtn = el("button", "nav-arrow", "Siguiente →");
        nextBtn.addEventListener("click", function () { goToTab(Math.min(TABS.length - 1, idx + 1)); });
        navActions.appendChild(nextBtn);
      }
      contentWrap.appendChild(navActions);

      panel.appendChild(contentWrap);
      panelsWrap.appendChild(panel);
    });

    goToTab(0);
  }

  function goToTab(idx) {
    state.activeTab = idx;
    var navButtons = document.querySelectorAll(".tab-btn");
    var panels = document.querySelectorAll(".tab-panel");
    navButtons.forEach(function (b, i) { b.classList.toggle("active", i === idx); });
    panels.forEach(function (p, i) { p.classList.toggle("active", i === idx); });
    if (navButtons[idx] && navButtons[idx].scrollIntoView) {
      navButtons[idx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateProgress(idx);
  }

  function updateProgress(idx) {
    var track = document.getElementById("progressTrack");
    if (!track) return;
    var segs = track.querySelectorAll(".progress-seg");
    segs.forEach(function (seg, i) {
      var isFilled = i <= idx;
      seg.classList.toggle("filled", isFilled);
      seg.classList.toggle("current", i === idx);
      seg.style.background = isFilled
        ? "linear-gradient(90deg, " + TABS[i].colorDark + ", " + TABS[i].color + ")"
        : "";
    });
  }

  /* ---------------------------------------------------------
     7. GENERACIÓN DE PDF
     El PDF se genera capturando el mismo diseño visual que ya ve la
     clienta (héroes con degradados de color, tarjetas, insignias de
     paso, firma) en vez de texto plano — por eso reutilizamos las
     funciones BUILDERS existentes en un contenedor invisible, y luego
     tomamos una "foto" de alta resolución que se recorta en páginas
     tamaño Carta con jsPDF.
     --------------------------------------------------------- */
  function buildExportRoot() {
    var root = el("div", "pdf-export-root");
    root.style.position = "fixed";
    root.style.left = "-10000px";
    root.style.top = "0";
    root.style.width = "820px";
    root.style.background = "#FAFAF8";
    document.body.appendChild(root);

    var sectionBuilders = [
      buildPortada,
      buildInstrucciones,
      function (c) { buildCodigo(c, "A"); },
      function (c) { buildCodigo(c, "B"); },
      function (c) { buildCodigo(c, "C"); },
      function (c) { buildCodigo(c, "D"); },
      buildFase5,
      buildFase6,
      buildCierre
    ];

    var sections = [];

    sectionBuilders.forEach(function (fn) {
      var wrap = el("div", "pdf-section");
      // position:relative es imprescindible aquí: convierte a `wrap` en el
      // offsetParent de sus descendientes. Sin esto, offsetFrom(elx, wrap)
      // no encuentra a `wrap` en la cadena de offsetParent de un elemento
      // profundamente anidado (porque un <div> normal, position:static, no
      // es un offsetParent válido) — el bucle sigue subiendo hasta saltarse
      // `wrap` por completo y termina sumando también la altura de TODAS
      // las secciones anteriores ya insertadas en `root`. Eso producía
      // coordenadas de línea completamente erróneas (miles de píxeles de
      // más), lo que hacía que la protección "no cortar a mitad de línea"
      // pareciera aplicarse pero en realidad estuviera comparando contra
      // posiciones que no correspondían a esta sección — y el corte real
      // terminaba cayendo, sin protección efectiva, a mitad de una línea.
      wrap.style.position = "relative";
      fn(wrap);
      // El botón de descarga no tiene sentido dentro del propio PDF.
      var dl = wrap.querySelector(".download-box");
      if (dl && dl.parentNode) dl.parentNode.removeChild(dl);
      root.appendChild(wrap);
      sections.push(wrap);
    });

    return { root: root, sections: sections };
  }

  function cleanupExportRoot(root) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  // PDF_SCALE controla la resolución de captura de cada página (más alto =
  // más nítido, pero también un archivo más pesado). Se bajó de 2 a 1.5 (y
  // la calidad JPEG de 0.93 a 0.80, ver toDataURL más abajo) porque el
  // documento completo pesaba entre 10 y 16 MB — un archivo de ese tamaño,
  // generado como blob en el navegador, tiene una probabilidad real de
  // fallar al compartirse desde Android: el gestor de descargas de Android
  // no siempre logra "materializar" un blob grande como archivo real en el
  // teléfono, y apps como WhatsApp terminan compartiendo la referencia al
  // blob en memoria en vez del archivo — un link que solo funciona en el
  // navegador donde se generó y da 404 para cualquier otra persona. Con
  // estos valores el documento pesa routinely bajo 5 MB, con el texto
  // igual de nítido y legible (probado con OCR), reduciendo mucho ese
  // riesgo. Ambos números deben cambiarse juntos si se ajustan de nuevo.
  var PDF_SCALE = 1.5; // debe coincidir con el "scale" pasado a html2canvas más abajo

  // Elementos que NUNCA deben quedar cortados a la mitad entre dos páginas
  // (párrafos, tarjetas, encabezados, firma, la tarjeta de la declaración, etc.).
  var PDF_UNBREAKABLE_SELECTOR = [
    ".block-p", ".block-heading", ".block-step", ".block-callout",
    ".card", ".card-grid", ".signature-block", ".declaration-card",
    ".panel-hero", ".portada-codes", ".footer-note", ".block-divider"
  ].join(", ");

  // Distancia vertical real de un elemento respecto a `root`, sumando
  // offsetTop a través de toda la cadena de offsetParent. A propósito NO
  // usamos getBoundingClientRect(): ese método mide contra el viewport
  // visible, y root es un contenedor gigante fuera de pantalla
  // (position:fixed; left:-10000px) que puede medir miles de píxeles de
  // alto — en documentos así, getBoundingClientRect() puede devolver
  // valores inconsistentes con el canvas real que captura html2canvas,
  // lo que dejaba pasar cortes a la mitad de un párrafo o tarjeta.
  // offsetTop, en cambio, es una medida de layout del documento, estable
  // sin importar el alto total ni si el elemento está fuera de pantalla.
  function offsetFrom(elx, root) {
    var y = 0;
    var node = elx;
    while (node && node !== root) {
      y += node.offsetTop || 0;
      node = node.offsetParent;
    }
    return y;
  }

  // Recolecta, MIENTRAS el contenedor de exportación todavía está en el DOM,
  // el rango vertical (en px de documento, no de canvas) que ocupa cada
  // elemento "no partible". Esto se usa después para que el corte de cada
  // página del PDF nunca caiga dentro de uno de estos rangos.
  function collectBreakRects(root) {
    var rects = [];
    root.querySelectorAll(PDF_UNBREAKABLE_SELECTOR).forEach(function (elx) {
      var top = offsetFrom(elx, root);
      var bottom = top + elx.offsetHeight;
      rects.push({ top: top, bottom: bottom });
    });
    return rects;
  }

  // Selectores de elementos que pueden contener texto largo en varias
  // líneas (párrafos, líneas de tarjeta, declaraciones, callouts). Se usan
  // para calcular puntos de corte "entre líneas" cuando el bloque completo
  // no cabe en una sola página — ver collectLineBreaks más abajo.
  var PDF_TEXT_SELECTOR = [
    ".block-p", ".block-callout", ".declaration-text",
    ".card-line", ".card-title", ".step-text"
  ].join(", ");

  // Recolecta el rango vertical (top/bottom) de cada línea VISUAL de texto
  // dentro de los elementos de PDF_TEXT_SELECTOR, usando
  // Range.getClientRects() (que reporta un rectángulo por cada línea en la
  // que el navegador partió el texto al hacer word-wrap). Esta es la red de
  // seguridad definitiva contra cortar una línea a la mitad: a diferencia
  // de los rangos de bloque completo (breakRects, que cubren un párrafo o
  // tarjeta entera), estos rangos cubren cada renglón individual — incluso
  // dentro de bloques que sí caben enteros en una página, como una tarjeta
  // con una lista larga de ítems, donde el corte puede caer "entre" dos
  // ítems sin que ningún bloque grande lo detecte.
  function collectLineBreaks(root) {
    var lines = [];
    root.querySelectorAll(PDF_TEXT_SELECTOR).forEach(function (elx) {
      var elOffset = offsetFrom(elx, root);
      var elRectTop = elx.getBoundingClientRect().top;
      var range = document.createRange();
      // Recorremos los nodos de texto directos del elemento (no de
      // sub-elementos) para no duplicar medidas de hijos ya cubiertos por
      // su propio selector.
      Array.prototype.forEach.call(elx.childNodes, function (node) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
        range.selectNodeContents(node);
        var clientRects = range.getClientRects();
        Array.prototype.forEach.call(clientRects, function (r) {
          // r.top/r.bottom son relativos al viewport; los convertimos a la
          // misma escala "offset de documento" que usa offsetFrom, usando
          // el propio elemento como referencia (su top en viewport vs su
          // offsetTop en documento).
          var topInDoc = elOffset + (r.top - elRectTop);
          var bottomInDoc = elOffset + (r.bottom - elRectTop);
          lines.push({ top: topInDoc, bottom: bottomInDoc });
        });
      });
    });
    lines.sort(function (a, b) { return a.top - b.top; });
    return lines;
  }

  // Margen de seguridad para todas las comparaciones de "¿este corte cae
  // dentro de esta línea/bloque?". Los cálculos de corte pasan por varias
  // conversiones encadenadas (px de documento -> px de canvas -> pt de
  // PDF, con escalas fraccionarias como 1.9296... y Math.round() en el
  // camino), y el error acumulado de redondeo puede superar una fracción
  // de píxel en casos específicos — suficiente para que una línea que
  // "por muy poco" no se detectaba como afectada terminara cortada
  // visualmente de todos modos. Este margen amplía cada rango protegido
  // varios píxeles hacia afuera (mucho más que el margen anterior de solo
  // 0.5px) para absorber ese error con un colchón real, sin afectar
  // notablemente el aprovechamiento del espacio de página.
  var SAFE_CUT_MARGIN = 6;

  // Si el punto y cae DENTRO del rango de alguna línea de texto conocida
  // (top < y < bottom, expandido por SAFE_CUT_MARGIN para absorber
  // errores de redondeo), devuelve el top de esa línea — el único lugar
  // seguro para cortar sin partirla a la mitad. Si y no cae dentro de
  // ninguna línea (por ejemplo, está en el espacio en blanco entre dos
  // párrafos, o ya coincide con un límite de línea), devuelve null: no
  // hace falta ajustar nada.
  function pushOutOfLine(y, lineBreaks) {
    for (var i = 0; i < lineBreaks.length; i++) {
      var lb = lineBreaks[i];
      if (y > lb.top - SAFE_CUT_MARGIN && y < lb.bottom + SAFE_CUT_MARGIN) {
        return lb.top - SAFE_CUT_MARGIN;
      }
    }
    return null;
  }

  // Busca la línea de texto cuyo TOP esté más cerca de y, por ARRIBA y
  // dentro de una ventana razonable — se usa solo para el caso de bloques
  // más altos que una página completa, donde hay que elegir un punto de
  // corte "a mitad" del bloque y se prefiere el límite de línea más
  // cercano al espacio máximo disponible.
  function nearestLineTop(y, lineBreaks, searchWindow) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < lineBreaks.length; i++) {
      var top = lineBreaks[i].top;
      if (top <= y + SAFE_CUT_MARGIN && (y - top) < searchWindow) {
        var dist = y - top;
        if (dist < bestDist) { bestDist = dist; best = top; }
      }
    }
    return best === null ? null : (best - SAFE_CUT_MARGIN);
  }

  // Dado un corte deseado (en px de documento), devuelve { y, forceNewPage }:
  // - y: la posición final del corte.
  // - forceNewPage: true si el motivo del corte fue "empujar un bloque
  //   completo para que empiece limpio en una página nueva". Es una señal
  //   importante: si el corte solo se ajustó unos píxeles hacia arriba
  //   dentro del flujo normal, el espacio restante de la página actual se
  //   puede seguir usando. Pero cuando se empuja un bloque entero (p.ej.
  //   una tarjeta) a que empiece en una página nueva, ese espacio restante
  //   NO debe rellenarse con el inicio del bloque — hay que saltar de
  //   página de verdad. Sin esta señal, el bloque empujado terminaba
  //   dibujándose en el hueco que quedaba al final de la página anterior,
  //   y el siguiente corte (calculado de nuevo a "una página completa de
  //   distancia") caía a mitad del bloque en vez de al final — este era el
  //   bug real detrás del corte de líneas por la mitad.
  //
  // 1) Si el corte deseado cae dentro de un bloque "no partible" (rects)
  //    que SÍ cabe entero en una página, se empuja el bloque a que empiece
  //    limpio en una página nueva (forceNewPage=true).
  // 2) Si cae dentro de un bloque no partible que NUNCA cabe entero (más
  //    alto que una página), se recalcula un corte dentro de ese bloque
  //    aprovechando el máximo espacio posible, alineado a una línea.
  // 3) SIEMPRE, como paso final, se verifica si el resultado cae DENTRO de
  //    una línea de texto real y, si es así, se empuja al inicio de esa
  //    línea (sin forzar salto de página: es solo un ajuste fino).
  function findSafeCut(desiredYDom, rects, lineBreaks, pageHeightDom) {
    var y = desiredYDom;
    var forceNewPage = false;
    var changed = true;
    var guard = 0;
    while (changed && guard < 25) {
      changed = false;
      guard++;
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (y > r.top - SAFE_CUT_MARGIN && y < r.bottom + SAFE_CUT_MARGIN) {
          var blockHeight = r.bottom - r.top;
          if (blockHeight <= pageHeightDom) {
            // Cabe entero: lo empujamos a que empiece en página nueva.
            y = r.top - SAFE_CUT_MARGIN;
            forceNewPage = true;
            changed = true;
          } else {
            // No cabe entero en ninguna página: el corte más útil es al
            // final de la primera página completa contada DESDE el inicio
            // del bloque (para aprovechar el máximo espacio posible), justo
            // en el límite de línea más cercano a ese punto.
            var maxY = r.top + pageHeightDom;
            var lt = lineBreaks ? nearestLineTop(maxY, lineBreaks, pageHeightDom) : null;
            y = (lt !== null && lt > r.top) ? lt : r.top;
            changed = false;
            break;
          }
        }
      }
    }
    // Paso final universal: si el punto resultante cae dentro de una línea
    // de texto real, lo empujamos al inicio de esa línea. Esto es un ajuste
    // fino, no un "bloque completo movido" — no fuerza salto de página.
    if (lineBreaks && lineBreaks.length) {
      var pushed = pushOutOfLine(y, lineBreaks);
      if (pushed !== null) y = pushed;
    }
    return { y: y, forceNewPage: forceNewPage };
  }

  // Safari en iOS limita el área de un <canvas> a un valor mucho más bajo
  // que Chrome/Firefox/desktop (históricamente ~16.7M px, algo más en
  // versiones recientes, pero siempre muy por debajo de los 268M+ que
  // permite Chrome). Un solo canvas con las 9 secciones completas del Mapa
  // supera ese límite con facilidad, y html2canvas no lanza error: Safari
  // simplemente entrega un canvas vacío/transparente, y el PDF sale en
  // blanco. La solución es capturar CADA SECCIÓN por separado (canvas
  // pequeño, muy por debajo del límite) y position ir añadiendo sus
  // "rebanadas" al PDF como páginas, en vez de un canvas único gigante.
  var SAFE_CANVAS_AREA = 15000000; // margen prudente bajo el límite más estricto conocido en iOS

  function renderSectionToPdf(pdf, pdfState, canvas, breakRects, lineBreaks, sectionScale) {
    var margin = pdfState.margin;
    var contentW = pdfState.contentW;
    var pageHeightPx = pdfState.pageHeightPx;
    var pxPerPt = pdfState.pxPerPt;
    var pageHeightDom = pageHeightPx / sectionScale;

    var renderedY = 0;
    var guard = 0;
    while (renderedY < canvas.height && guard < 500) {
      guard++;

      // Si la página actual ya está llena, abrimos una nueva antes de medir
      // cuánto cabe — así nunca calculamos una rebanada de alto 0 o negativo.
      if (pdfState.usedHeightPx >= pageHeightPx) {
        pdf.addPage();
        pdfState.usedHeightPx = 0;
        pdfState.usedHeightPt = 0;
        pdfState.pageStarted = false;
      }

      var remainingOnPage = pageHeightPx - pdfState.usedHeightPx;
      var desiredEnd = Math.min(renderedY + remainingOnPage, canvas.height);
      var safeEnd = desiredEnd;
      var forceNewPageAfter = false;
      if (desiredEnd < canvas.height) {
        var desiredEndDom = desiredEnd / sectionScale;
        var cut = findSafeCut(desiredEndDom, breakRects, lineBreaks, pageHeightDom);
        safeEnd = Math.round(cut.y * sectionScale);
        if (safeEnd <= renderedY) {
          safeEnd = desiredEnd;
        } else {
          // Solo forzamos el salto de página si el corte se movió (es
          // decir, si realmente hubo un bloque empujado) — si el corte no
          // se movió, forceNewPage siempre viene en false de todos modos.
          forceNewPageAfter = cut.forceNewPage;
        }
      }
      var sliceHeightPx = safeEnd - renderedY;

      // Rebanada inválida o vacía: no hay nada seguro que dibujar en lo que
      // resta de esta página, así que la cerramos y probamos en la siguiente.
      if (sliceHeightPx <= 0) {
        pdf.addPage();
        pdfState.usedHeightPx = 0;
        pdfState.usedHeightPt = 0;
        pdfState.pageStarted = false;
        continue;
      }

      var sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      var ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#FAFAF8";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, renderedY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      var imgData = sliceCanvas.toDataURL("image/jpeg", 0.80);
      var sliceHeightPt = sliceHeightPx / pxPerPt;

      pdf.addImage(imgData, "JPEG", margin, margin + pdfState.usedHeightPt, contentW, sliceHeightPt);
      pdfState.pageStarted = true;
      pdfState.usedHeightPt += sliceHeightPt;
      pdfState.usedHeightPx += sliceHeightPx;

      renderedY = safeEnd;

      // AUDITORÍA: verificamos que el corte real aplicado no haya quedado,
      // después de todas las conversiones y redondeos, dentro de una línea
      // de texto conocida. Si esto ocurre pese a toda la lógica de
      // findSafeCut, es la señal más directa posible de la causa raíz.
      if (window.__PDF_AUDIT__ && lineBreaks && lineBreaks.length) {
        var safeEndDomCheck = safeEnd / sectionScale;
        for (var ai = 0; ai < lineBreaks.length; ai++) {
          var alb = lineBreaks[ai];
          if (safeEndDomCheck > alb.top + 0.5 && safeEndDomCheck < alb.bottom - 0.5) {
            console.log("[AUDIT_FAIL] safeEnd cae DENTRO de una linea! safeEndDom=" + safeEndDomCheck.toFixed(2) + " line.top=" + alb.top + " line.bottom=" + alb.bottom + " sectionScale=" + sectionScale + " canvas.height=" + canvas.height + " pageHeightDom=" + pageHeightDom.toFixed(2));
          }
        }
      }

      // Si el corte que acabamos de dibujar fue causado por "empujar un
      // bloque completo a que empiece limpio", el hueco que queda al final
      // de esta página NO debe rellenarse con el inicio de ese bloque —
      // forzamos un salto de página real aquí mismo. Sin esto, el bloque
      // empujado terminaba dibujándose en ese hueco de todos modos (porque
      // la página técnicamente no estaba "llena" según usedHeightPx), y el
      // siguiente corte —calculado de nuevo a una página completa de
      // distancia— caía a mitad del bloque en vez de al final de la
      // página: este era el bug real detrás del corte de líneas por la
      // mitad que se seguía viendo pese a que el corte en sí se calculaba
      // en la posición correcta.
      if (forceNewPageAfter && renderedY < canvas.height) {
        pdf.addPage();
        pdfState.usedHeightPx = 0;
        pdfState.usedHeightPt = 0;
        pdfState.pageStarted = false;
      }
    }
  }

  function captureSection(sectionEl) {
    var rect = sectionEl.getBoundingClientRect();
    var area = rect.width * rect.height * PDF_SCALE * PDF_SCALE;
    var scale = PDF_SCALE;
    if (area > SAFE_CANVAS_AREA) {
      // Sección excepcionalmente larga: reducimos la escala solo para ESTA
      // sección, lo suficiente para caber bajo el límite de Safari, sin
      // afectar la nitidez del resto del documento. Como la escala real
      // puede terminar siendo distinta de PDF_SCALE, se la devolvemos junto
      // al canvas — renderSectionToPdf la necesita para convertir
      // correctamente entre "px de documento" (donde viven breakRects y
      // lineBreaks) y "px de canvas" (donde se hacen los cortes reales).
      // Usar PDF_SCALE fijo aquí era el bug: los puntos de corte se
      // calculaban bien, pero se traducían mal al canvas real de esta
      // sección, cayendo a mitad de una línea de texto en vez de en su
      // límite exacto.
      scale = Math.max(1, Math.sqrt(SAFE_CANVAS_AREA / (rect.width * rect.height)));
    }
    return window.html2canvas(sectionEl, {
      scale: scale,
      backgroundColor: "#FAFAF8",
      useCORS: true,
      windowWidth: sectionEl.scrollWidth
    }).then(function (canvas) {
      return { canvas: canvas, scale: scale };
    });
  }

  function generatePdf(iosTabName) {
    var built = buildExportRoot();
    var root = built.root, sections = built.sections;
    var jsPDF = window.jspdf.jsPDF;

    // Antes de medir cualquier posición de texto, esperamos a que las
    // fuentes web (Playfair Display, Poppins — cargadas con
    // font-display:swap en index.html) hayan terminado de aplicarse.
    // Con "swap", el navegador dibuja el texto de inmediato con una fuente
    // de respaldo y lo reemplaza por la fuente real en cuanto termina de
    // descargarla — ese reemplazo puede cambiar el ancho de cada letra y
    // por lo tanto en qué línea envuelve cada palabra. Un setTimeout fijo
    // (usado antes) asume que ese reemplazo siempre ya ocurrió, pero en una
    // conexión más lenta o la primera carga de fuente en el dispositivo de
    // la clienta, el temporizador podía cumplirse ANTES de que la fuente
    // definitiva estuviera lista: se medían las posiciones de línea con la
    // fuente de respaldo, y para cuando html2canvas capturaba el canvas
    // (con la fuente ya cambiada), el texto real ya no coincidía con esas
    // posiciones — cortando líneas que en el momento de medir no existían
    // en esa forma. document.fonts.ready es la señal correcta y specific
    // del navegador para "las fuentes ya están listas", sin depender de
    // adivinar cuánto tiempo hace falta esperar.
    var fontsReady = (document.fonts && document.fonts.ready)
      ? document.fonts.ready
      : new Promise(function (resolve) { resolve(); });

    return fontsReady
      .catch(function () {}) // si fonts.ready llega a rechazar, seguimos igual
      .then(function () {
        // Un pequeño margen adicional tras fonts.ready para el reflow del
        // layout que el navegador aplica justo después del cambio de
        // fuente (no es una apuesta a ciegas: fonts.ready ya garantiza que
        // la fuente está lista, esto solo cubre el frame de repintado).
        return new Promise(function (resolve) { setTimeout(resolve, 80); });
      })
      .then(function () {
        // Se recolectan los rangos "no partibles" y los puntos de corte
        // entre líneas de TODAS las secciones ANTES de capturar/limpiar,
        // mientras el contenedor sigue en el DOM y sus medidas son válidas.
        var sectionBreakRects = sections.map(function (s) { return collectBreakRects(s); });
        var sectionLineBreaks = sections.map(function (s) { return collectLineBreaks(s); });

        var pdf = new jsPDF({ unit: "pt", format: "letter" });
        // jsPDF crea la página 1 automáticamente al construirse. Usamos esa
        // misma página como el inicio del documento (por eso pageStarted
        // arranca en false y NUNCA llamamos addPage() antes de la primera
        // imagen real) — así se evita generar una página en blanco extra al
        // principio, y el "addImage con alto 0" que rompía la promesa en
        // algunos casos límite.
        var pageW = 612, pageH = 792; // Carta, en puntos
        var margin = 34;
        var pdfState = {
          margin: margin,
          contentW: pageW - margin * 2,
          pageHeightPx: 0, // se recalcula por sección, según su propia escala/pxPerPt
          pxPerPt: 0,
          usedHeightPt: 0,
          usedHeightPx: 0,
          pageStarted: false
        };

        // Procesamos las secciones EN SECUENCIA (no en paralelo): cada
        // captura libera su canvas antes de crear el siguiente, lo que
        // mantiene bajo el uso total de memoria de canvas — el segundo
        // límite de Safari ("total canvas memory"), además del límite de
        // área individual.
        var chain = Promise.resolve();
        sections.forEach(function (sectionEl, i) {
          chain = chain.then(function () {
            return captureSection(sectionEl).then(function (captured) {
              var canvas = captured.canvas;
              var sectionScale = captured.scale;
              var pxPerPt = canvas.width / pdfState.contentW;
              pdfState.pxPerPt = pxPerPt;
              pdfState.pageHeightPx = Math.max(1, Math.floor((pageH - margin * 2) * pxPerPt));

              // Cada sección nueva del Mapa empieza en su propia página —
              // pero solo abrimos una si ya hay contenido dibujado antes
              // (si pageStarted es false todavía estamos en la página 1
              // recién creada por jsPDF, y ya está vacía y lista para usar).
              if (pdfState.pageStarted) {
                pdf.addPage();
                pdfState.usedHeightPx = 0;
                pdfState.usedHeightPt = 0;
                pdfState.pageStarted = false;
              }

              renderSectionToPdf(pdf, pdfState, canvas, sectionBreakRects[i], sectionLineBreaks[i], sectionScale);
            });
          });
        });

        return chain.then(function () { return pdf; });
      })
      .then(function (pdf) {
        cleanupExportRoot(root);
        var safeName = state.name.trim().replace(/\s+/g, "_").replace(/[\\/:*?"<>|]/g, "");
        var dateStr = pad2(state.day) + "_" + pad2(state.month) + "_" + state.year;
        var filename = "Mapa_" + safeName + "_" + dateStr + ".pdf";

        // En iOS, pdf.save() de jsPDF no descarga un archivo real de forma
        // confiable: Safari no soporta bien el atributo download en enlaces
        // de blob, así que en su lugar suele abrir el PDF en una pestaña
        // nueva mostrando la URL "blob:..." en la barra de direcciones —
        // sin que quede guardado como archivo en el teléfono. Si la
        // clienta comparte desde ahí (por ejemplo por WhatsApp), lo que se
        // comparte es esa misma URL de blob, que solo existe en su propio
        // Safari — cualquier otra persona que la reciba ve un error 404,
        // porque no es un archivo real, es una referencia temporal en
        // memoria. La solución es no pelear contra ese comportamiento:
        // handleDownload ya abrió una pestaña (en blanco) de forma
        // sincrónica dentro del clic, usando un NOMBRE de destino fijo en
        // vez de "_blank" — eso permite reabrirla por nombre aquí mismo,
        // ya con el PDF listo, y esta forma de navegar sí actualiza el
        // contenido de forma confiable (a diferencia de guardar la
        // referencia de la ventana y asignarle .location.href más tarde,
        // que en varias pruebas verificadas se queda en blanco sin ningún
        // error visible).
        if (iosTabName) {
          var blobUrl = URL.createObjectURL(pdf.output("blob"));
          window.open(blobUrl, iosTabName);
          setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 60000);
          alert(
            "Tu Mapa se abrió en una pestaña nueva.\n\n" +
            "Para guardarlo y poder compartirlo por WhatsApp sin problema:\n" +
            "1. Toca el ícono de Compartir (el cuadrado con la flecha hacia arriba)\n" +
            "2. Elige \"Guardar en Archivos\"\n" +
            "3. Desde ahí ya puedes compartirlo con quien quieras"
          );
        } else {
          pdf.save(filename);
        }
      })
      .catch(function (err) {
        cleanupExportRoot(root);
        throw err;
      });
  }

  /* ---------------------------------------------------------
     6.5 GARANTÍA DE LIBRERÍAS EXTERNAS (jsPDF / html2canvas)
     Ambas se cargan desde un CDN externo en <head> (index.html). Si esa
     carga falla o queda incompleta por CUALQUIER motivo — bloqueador de
     anuncios/rastreo, red restrictiva, script cacheado a medias, o la
     usuaria haciendo click antes de que termine de cargar — el error real
     era "Cannot read properties of undefined (reading 'jsPDF')", que el
     catch general disfrazaba como "Ocurrió un problema generando el
     documento" sin ninguna pista útil. En vez de asumir que las librerías
     ya están disponibles, las verificamos y, si faltan, intentamos
     cargarlas de nuevo (con una fuente alterna de respaldo) antes de
     generar el PDF.
     --------------------------------------------------------- */
  var LIB_SOURCES = {
    html2canvas: [
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
    ],
    jspdf: [
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
    ]
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("No se pudo cargar " + src)); };
      document.head.appendChild(s);
    });
  }

  function loadFromSources(sources) {
    var i = 0;
    function attempt() {
      if (i >= sources.length) return Promise.reject(new Error("Ninguna fuente disponible"));
      var src = sources[i++];
      return loadScript(src).catch(attempt);
    }
    return attempt();
  }

  function ensurePdfLibraries() {
    var needsHtml2canvas = typeof window.html2canvas === "undefined";
    var needsJsPdf = !(window.jspdf && window.jspdf.jsPDF);

    if (!needsHtml2canvas && !needsJsPdf) return Promise.resolve();

    var tasks = [];
    if (needsHtml2canvas) tasks.push(loadFromSources(LIB_SOURCES.html2canvas));
    if (needsJsPdf) tasks.push(loadFromSources(LIB_SOURCES.jspdf));

    return Promise.all(tasks).then(function () {
      if (typeof window.html2canvas === "undefined" || !(window.jspdf && window.jspdf.jsPDF)) {
        throw new Error("Las herramientas para generar el PDF no cargaron correctamente. Revisa tu conexión a internet e intenta de nuevo.");
      }
    });
  }

  function handleDownload() {
    var btn = document.getElementById("downloadBtn");
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = "Generando tu documento…";

    // En iOS hay que abrir la pestaña AQUÍ, de forma sincrónica dentro del
    // propio manejador del clic — es la única forma en que Safari (y la
    // mayoría de navegadores) no la trata como un popup no solicitado y la
    // bloquea. Si esperáramos a que generatePdf() termine (una operación
    // asíncrona) para recién ahí llamar a window.open, ya no cuenta como
    // "iniciado directamente por el usuario" y la ventana no se abre en
    // absoluto — silenciosamente, sin ningún error visible.
    //
    // Para la navegación posterior (una vez que el PDF ya está listo) NO
    // usamos la referencia guardada con tab.location.href = url: esa forma
    // de navegar una ventana ya abierta no es confiable — en varios casos
    // documentados y verificados aquí mismo, la ventana se queda en blanco
    // sin ningún error. La técnica que sí funciona de forma consistente es
    // volver a llamar a window.open() con ese MISMO nombre de destino
    // ("_pdf_tab" en vez de "_blank"): el navegador reconoce que ya existe
    // una ventana con ese nombre y la reutiliza/navega en vez de abrir una
    // nueva — y a diferencia de asignar location.href, esta sí actualiza
    // el contenido de forma confiable incluso después de una espera async.
    var IOS_TAB_NAME = "_pdf_tab";
    var isIOSDevice = isIOS();
    if (isIOSDevice) window.open("", IOS_TAB_NAME);

    ensurePdfLibraries()
      .then(function () { return generatePdf(isIOSDevice ? IOS_TAB_NAME : null); })
      .catch(function (err) {
        console.error("[Mapa PDF] Error generando documento:", err);
        // Si hubo un error, cerramos la pestaña provisional (reabriéndola
        // por nombre nos da la misma referencia) para no dejarla colgada
        // en blanco.
        if (isIOSDevice) {
          var tabToClose = window.open("", IOS_TAB_NAME);
          if (tabToClose) tabToClose.close();
        }
        var detail = (err && err.message) || "";
        var friendly = detail && /conexión|internet|cargaron/i.test(detail)
          ? detail
          : "Ocurrió un problema generando el documento. Revisa tu conexión a internet e intenta de nuevo.";
        alert(friendly);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = originalText;
      });
  }
})();
