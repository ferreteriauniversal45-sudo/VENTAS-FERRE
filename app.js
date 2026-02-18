/* ================= CONFIG ================= */
const BASE_RAW = "https://raw.githubusercontent.com/ferreteriauniversal45-sudo/ferreteria-inventario-app/main/";
const URLS = {
  logo: BASE_RAW + "logo.png",
  invP: BASE_RAW + "inventario.json",
  invA: BASE_RAW + "inventarioanexo.json",
  invT: BASE_RAW + "inventariotienda.json",
  preciosadmin: BASE_RAW + "preciosadmin.json",
  catalogoProductos: BASE_RAW + "Catalogo.json",
  motoristas: BASE_RAW + "motoristas.json",
  placas: BASE_RAW + "placas.json",
  version: BASE_RAW + "inventario_version.json"
};

const PINS = {
  OPERADOR: "CONTROL2025",
  VENDEDOR: "VENTAS2026",
  VENDEDOR_JULIO: "VENTASJULIO2026",
  VENDEDOR_LEONARDI: "VENTASLEO2026",
  ADMIN: "ADMIN2024",
  BODEGUERO: "1234",
  VISUALIZADOR: "VISUAL2026",
  RECEPCION: "ferreu2026"
};

const EMPRESA_RTN = "0301-1964-008634";



/* ================= RECEPCION: STATE ================= */
let recepcionCatalogoLocal = null;     // { [alias]: { alias, producto, codigo, createdAtISO } }
let recepcionIngresos = null;          // array de ingresos guardados
let recepcionDraftIngreso = null;      // borrador actual
let recepcionIngresoDoc = null;        // ingreso en edición / captura
let recepcionEditId = null;            // id del ingreso editado (si aplica)
let recepcionLoaded = false;

const PRICE_TYPES = ["precio","precioA","precioB","precioC","mayoreo","precioVendedor"];
const PRICE_LABELS = {
  precio: "Precio Público",
  precioA: "Precio A",
  precioB: "Precio B",
  precioC: "Precio C",
  mayoreo: "Mayoreo",
  precioVendedor: "PRECIO VENDEDOR"
};

const PRICE_CODE_LETTER = {
  precio: "P",
  precioA: "A",
  precioB: "B",
  precioC: "C",
  mayoreo: "M",
  precioVendedor: "V"
};

/* ================= COTIZACIONES: CÓDIGOS VINCULADOS =================
   Reglas solicitadas:
   - 09-0039 ↔ 02-0203
   - 02-0036 ↔ 02-0348

   Si agregas/modificas la cantidad de uno, el otro se agrega/ajusta
   automáticamente para quedar con la misma cantidad.
*/
const LINKED_CODE_MAP = {
  "09-0039": "02-0203",
  "02-0036": "02-0348",
  "02-0348": "02-0036"
};

let __linkedSyncLock = false;

function normCode(code){
  return String(code ?? "").trim();
}

function getLinkedCode(code){
  const c = normCode(code);
  return LINKED_CODE_MAP[c] || null;
}

function findFirstItemByCodigo(code){
  const c = normCode(code);
  return cotizacionActual?.items?.find(it => normCode(it.codigo) === c) || null;
}

function findMatchingItem(codigo, priceType, customPrice){
  const c = normCode(codigo);
  const p = String(priceType || "precio");
  const cp = Number(customPrice || 0);
  return cotizacionActual?.items?.find(it =>
    normCode(it.codigo) === c &&
    String(it.priceType || "precio") === p &&
    Number(it.customPrice || 0) === cp
  ) || null;
}

function upsertItemSetQty(codigo, qty, priceType, customPrice){
  const q = Math.max(1, Number(qty || 1));

  let it = findMatchingItem(codigo, priceType, customPrice);
  if (it) {
    it.qty = q;
    return it;
  }

  it = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo: normCode(codigo),
    qty: q,
    priceType: String(priceType || "precio"),
    customPrice: Number(customPrice || 0)
  };

  cotizacionActual.items.push(it);
  return it;
}

function syncLinkedPairForItem(it){
  if (!it || __linkedSyncLock) return;

  const pair = getLinkedCode(it.codigo);
  if (!pair) return;

  __linkedSyncLock = true;
  try {
    const refQty = Math.max(1, Number(it.qty || 1));

    // Preferimos sincronizar con la misma configuración de precio si existe.
    const refType = String(it.priceType || "precio");
    const refCP = Number(it.customPrice || 0);

    let target = findMatchingItem(pair, refType, refCP);
    if (!target) target = findFirstItemByCodigo(pair);

    if (target) {
      target.qty = refQty;
    } else {
      upsertItemSetQty(pair, refQty, refType, refCP);
    }
  } finally {
    __linkedSyncLock = false;
  }
}

/* ================= HELPERS ================= */
const el = (id) => document.getElementById(id);

function moneyL(value){
  const n = Number(value || 0);
  return "L. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Normaliza valores numéricos (evita NaN y precios negativos)
function num0(value){
  const n = Number(value);
  return (typeof n === "number" && isFinite(n)) ? n : 0;
}

function price0(value){
  const n = num0(value);
  return n < 0 ? 0 : n;
}


function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escSq(s){
  // Escapa para usar dentro de comillas simples en onclick="fn('...')"
  return String(s ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}


function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}


function openModal(id){
  const m = el(id);
  if (!m) return;

  // Elevar z-index para que este modal quede arriba del que ya esté abierto
  try {
    const open = Array.from(document.querySelectorAll('.modal.show'));
    let top = 0;
    for (const om of open) {
      const z = parseInt(window.getComputedStyle(om).zIndex || '0', 10);
      if (!Number.isNaN(z)) top = Math.max(top, z);
    }

    const base = parseInt(window.getComputedStyle(m).zIndex || '0', 10) || 1000;
    const target = Math.max(base, top + 10);
    m.style.zIndex = String(target);
  } catch {
    // si algo falla, igual abrimos el modal
  }

  m.classList.add('show');
}

function closeModal(id){
  const m = el(id);
  if (!m) return;
  m.classList.remove('show');
}




/* ================= PHONE BACK (botón Atrás del teléfono) ================= */
let __phoneBackEnabled = false;
let __allowNativeBackOnce = false;
let __lastHomeBack = 0;
let __toastTimer = null;

function showToast(msg, ms = 1400){
  if (!msg) return;
  let t = el('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  if (__toastTimer) clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    try { t.classList.remove('show'); } catch {}
  }, ms);
}

function closeTopmostModal(){
  const open = Array.from(document.querySelectorAll('.modal.show'));
  if (!open.length) return false;

  let top = open[0];
  let topZ = -Infinity;
  for (const m of open) {
    const z = parseInt(window.getComputedStyle(m).zIndex || '0', 10);
    if (!Number.isNaN(z) && z >= topZ) {
      topZ = z;
      top = m;
    }
  }
  top.classList.remove('show');
  return true;
}

function clickVisibleBackButton(){
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const b of buttons) {
    if (!b || b.disabled) continue;
    if (b.offsetParent === null) continue; // no visible
    const txt = (b.textContent || '').trim().toLowerCase();
    if (!txt) continue;

    const isBack =
      txt.includes('volver') &&
      (txt.includes('⬅') || txt.includes('atrás') || txt.includes('atras') || txt.startsWith('volver'));

    if (isBack) {
      try { b.click(); } catch {}
      return true;
    }
  }
  return false;
}

function handlePhoneBackAction(){
  // 1) Si hay un modal abierto, cerrarlo primero
  if (closeTopmostModal()) return true;

  // 2) Si hay un botón "Volver" visible, usarlo
  if (clickVisibleBackButton()) return true;

  // 3) Si estamos en pantalla secundaria sin botón volver, regresar a HOME
  try {
    if (typeof contenido !== 'undefined' && contenido && !contenido.classList.contains('hidden')) {
      if (typeof volverHome === 'function') {
        volverHome();
        return true;
      }
    }
  } catch {}

  return false; // ya estamos en “root”
}

function onPhoneBackPopstate(){
  if (!__phoneBackEnabled) return;

  // cuando permitimos salida nativa (doble atrás)
  if (__allowNativeBackOnce) {
    __allowNativeBackOnce = false;
    return;
  }

  const handled = handlePhoneBackAction();

  if (handled) {
    try { history.pushState({ __appTrap: true, t: Date.now() }, '', location.href); } catch {}
    return;
  }

  // Ya está en inicio/root: NUNCA salir de la app desde el botón Atrás del teléfono.
  // Solo “trampeamos” el historial y (opcional) avisamos sin spamear.
  const now = Date.now();
  if (now - __lastHomeBack > 1800) {
    __lastHomeBack = now;
    // En HOME no hacemos nada (no salimos de la app).
  }
  try { history.pushState({ __appTrap: true, t: Date.now() }, '', location.href); } catch {}
}

function enablePhoneBackBehavior(){
  if (__phoneBackEnabled) return;
  __phoneBackEnabled = true;

  try {
    // Estado base + estado trampa. Así el botón Atrás no te saca de la app.
    history.replaceState({ __appBase: true }, '', location.href);
    history.pushState({ __appTrap: true, t: Date.now() }, '', location.href);
  } catch {}

  window.addEventListener('popstate', onPhoneBackPopstate);
}
/* ================= THEME (claro/oscuro) ================= */
const THEME_KEY = "theme"; // "light" | "dark"

function getSystemTheme(){
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (e) {
    return "light";
  }
}

function applyTheme(theme, persist = true){
  const t = (theme === "dark" || theme === "light") ? theme : getSystemTheme();
  document.documentElement.setAttribute("data-theme", t);
  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  }
  updateThemeUI();
}

function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme") || getSystemTheme();
  applyTheme(current === "dark" ? "light" : "dark");
}

function initTheme(){
  const saved = (localStorage.getItem(THEME_KEY) || "").trim().toLowerCase();
  if (saved) {
    applyTheme(saved, true);
  } else {
    applyTheme(getSystemTheme(), false);
  }

  // si el usuario no eligió manualmente, seguir el sistema
  if (!saved) {
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", () => {
        const stillEmpty = !(localStorage.getItem(THEME_KEY) || "").trim();
        if (stillEmpty) applyTheme(getSystemTheme(), false);
      });
    } catch {}
  }
}

function setThemeFromSwitch(isDark){
  applyTheme(isDark ? "dark" : "light");
}

function updateThemeUI(){
  const t = document.documentElement.getAttribute("data-theme") || "light";
  const btn = el("themeToggleBtn");
  const hint = el("themeHint");
  const sw = el("themeSwitch");

  if (sw) sw.checked = (t === "dark");
  if (btn) btn.textContent = (t === "dark") ? "☀️ Claro" : "🌙 Oscuro";
  if (hint) hint.textContent = (t === "dark") ? "Oscuro" : "Claro";
}

function formatDateShort(ts){
  const n = Number(ts || 0);
  if (!n) return "—";
  try { return new Date(n).toLocaleDateString("es-HN"); } catch { return "—"; }
}

function updateSettingsInfo(){
  let role = "";
  try { role = String(localStorage.getItem("role") || ""); } catch {}
  let v = "";
  try { v = String(localStorage.getItem("inventarioVersion") || "0"); } catch {}

  const invUrls = [URLS.version, URLS.invP, URLS.invA, URLS.invT, URLS.preciosadmin, URLS.catalogoProductos];
  const lastSync = Math.max(0, ...invUrls.map(u => __getLastSyncTsForUrl(u)));

  const online = (typeof navigator !== "undefined" && "onLine" in navigator)
    ? (navigator.onLine ? "En línea" : "Offline")
    : "—";

  const bRole = el("badgeRole");
  const bConn = el("badgeConn");
  const bSync = el("badgeSync");

  if (bRole) bRole.textContent = `Rol: ${role || "—"}`;
  if (bConn) bConn.textContent = `Conexión: ${online}`;
  if (bSync) bSync.textContent = `Sync: ${formatDateShort(lastSync)}`;

  const invInfo = el("invCacheInfo");
  if (invInfo) {
    invInfo.textContent = lastSync ? `Últ. sync: ${formatDateTime(lastSync)}` : "Sin caché: conéctate una vez.";
  }

  const info = el("settingsInfo");
  if (info) {
    info.textContent = `Inventario v${v} · Rol: ${role || "—"} · Conexión: ${online} · Últ. sync: ${formatDateTime(lastSync)}`;
  }
}

function openSettings(){
  updateThemeUI();
  updateSettingsInfo();
  openModal("modalSettings");
}

initTheme();

/* ================= CALCULATOR (modales) ================= */
let __calcTargetInputId = null;
let __calcExpr = "";
let __calcLast = null;

function openCalcForInput(inputId){
  __calcTargetInputId = String(inputId || "");
  __calcLast = null;

  // Prefill: si el input tiene un número, úsalo como inicio.
  try {
    const v = String(el(__calcTargetInputId)?.value ?? "").trim();
    __calcExpr = v ? v : "";
  } catch {
    __calcExpr = "";
  }

  calcRender();
  openModal("modalCalc");
}

function calcSanitize(expr){
  // Permitimos solo números, operadores básicos y paréntesis.
  return String(expr || "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[^0-9+\-*/().\s]/g, "")
    .trim();
}

function calcTryEval(expr){
  const safe = calcSanitize(expr);
  if (!safe) return null;
  try {
    // eslint-disable-next-line no-new-func
    const out = Function("'use strict'; return (" + safe + ")")();
    if (typeof out !== "number" || !Number.isFinite(out)) return null;
    return out;
  } catch {
    return null;
  }
}

function calcRender(){
  const disp = el("calcDisplay");
  if (disp) disp.value = __calcExpr || "";

  const resEl = el("calcResult");
  if (!resEl) return;

  const r = (__calcLast !== null) ? __calcLast : calcTryEval(__calcExpr);
  if (r === null) {
    resEl.textContent = "";
  } else {
    resEl.textContent = `= ${r}`;
  }
}

function calcKey(k){
  const key = String(k || "");
  if (!key) return;
  __calcExpr = (__calcExpr || "") + key;
  __calcLast = null;
  calcRender();
}

function calcClear(){
  __calcExpr = "";
  __calcLast = null;
  calcRender();
}

function calcBackspace(){
  __calcExpr = String(__calcExpr || "").slice(0, -1);
  __calcLast = null;
  calcRender();
}

function calcEquals(){
  const r = calcTryEval(__calcExpr);
  if (r === null) {
    showToast("Expresión inválida");
    return;
  }
  __calcLast = r;
  // Reemplaza la expresión por el resultado para seguir calculando.
  __calcExpr = String(r);
  calcRender();
}

function calcFormatForTarget(inputEl, num){
  if (!inputEl || typeof num !== "number" || !Number.isFinite(num)) return String(num ?? "");

  const id = String(inputEl.id || "");
  const step = String(inputEl.getAttribute("step") || "").trim();
  const minAttr = inputEl.getAttribute("min");
  const min = (minAttr === null || minAttr === undefined || minAttr === "") ? null : Number(minAttr);

  // Precio: 2 decimales
  if (/precio/i.test(id) || step === "0.01") {
    let v = num;
    if (min !== null && Number.isFinite(min)) v = Math.max(min, v);
    return v.toFixed(2);
  }

  // Cantidad: entero (redondeo)
  if (/qty|cantidad/i.test(id)) {
    let v = Math.round(num);
    if (min !== null && Number.isFinite(min)) v = Math.max(min, v);
    return String(v);
  }

  // Default
  let v = num;
  if (min !== null && Number.isFinite(min)) v = Math.max(min, v);
  return String(v);
}

function calcUse(){
  const target = el(__calcTargetInputId);
  if (!target) {
    closeModal("modalCalc");
    return;
  }

  const r = (__calcLast !== null) ? __calcLast : calcTryEval(__calcExpr);
  if (r === null) {
    showToast("Primero calcula un resultado");
    return;
  }

  target.value = calcFormatForTarget(target, r);
  try { target.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
  try { target.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
  closeModal("modalCalc");
  setTimeout(() => { try { target.focus(); } catch {} }, 50);
}

/* ================= BACKUP (export/import) ================= */
const BACKUP_PREFIX_DRAFT = "opDraft_";
const BACKUP_KEYS = [
  "nombreVendedor",
  "clientes",
  "cotizaciones",
  "inventarioVersion",
  "preciosModificadosAdmin",
  "venHomeSummaryMode",
  "opHomeSummaryMode",
  "invVendStockFiltro",
  "movimientosUsuario",
  "movimientos",
  "facturasEntradas",
  "facturasSalidas",
  "transferencias",
  "conteos",
  THEME_KEY
];

function getBackupSnapshot(){
  const storage = {};
  const allow = new Set(BACKUP_KEYS);

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (allow.has(k) || k.startsWith(BACKUP_PREFIX_DRAFT)) {
        storage[k] = String(localStorage.getItem(k) ?? "");
      }
    }
  } catch {}

  return {
    meta: {
      app: "Ferretería Universal",
      createdAt: new Date().toISOString(),
      inventarioVersion: String(localStorage.getItem("inventarioVersion") || "0")
    },
    storage
  };
}

function downloadTextFile(filename, text, mime = "application/json"){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup(){
  try {
    const snap = getBackupSnapshot();
    const stamp = new Date();
    const y = stamp.getFullYear();
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mm = String(stamp.getMinutes()).padStart(2, "0");
    const ss = String(stamp.getSeconds()).padStart(2, "0");
    const fn = `respaldo-ferreteria-${y}${m}${d}-${hh}${mm}${ss}.json`;
    downloadTextFile(fn, JSON.stringify(snap, null, 2));
    uiAlert?.("✅ Respaldo exportado.", { title: "Respaldo", icon: "✅" });
  } catch (e) {
    uiAlert?.("❌ No se pudo exportar el respaldo.", { title: "Respaldo", icon: "❌" });
  }
}

function triggerBackupImport(){
  const inp = el("backupFile");
  if (inp) inp.click();
}

async function importBackupFromFile(file){
  if (!file) return;

  let text = "";
  try {
    text = await file.text();
  } catch {
    uiAlert?.("❌ No se pudo leer el archivo.", { title: "Respaldo", icon: "❌" });
    return;
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    uiAlert?.("❌ El archivo no es un JSON válido.", { title: "Respaldo", icon: "❌" });
    return;
  }

  const storage = data?.storage;
  if (!storage || typeof storage !== "object") {
    uiAlert?.("❌ El archivo no tiene el formato esperado.", { title: "Respaldo", icon: "❌" });
    return;
  }

  const ok = await uiConfirm(
    "⚠️ Esto reemplazará los datos locales de este dispositivo con el respaldo. ¿Continuar?",
    { title: "Importar respaldo", icon: "⚠️", okText: "Sí, importar", cancelText: "Cancelar" }
  );
  if (!ok) return;

  try {
    // limpiar solo claves conocidas
    const allow = new Set(BACKUP_KEYS);
    allow.forEach(k => { try { localStorage.removeItem(k); } catch {} });

    // borrar drafts existentes
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BACKUP_PREFIX_DRAFT)) toRemove.push(k);
    }
    toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });

    // restaurar desde respaldo
    for (const k of Object.keys(storage)) {
      if (allow.has(k) || k.startsWith(BACKUP_PREFIX_DRAFT)) {
        localStorage.setItem(k, String(storage[k] ?? ""));
      }
    }

    updateThemeUI();

    await uiAlert("✅ Respaldo importado. La app se recargará.", { title: "Respaldo", icon: "✅" });
    location.reload();
  } catch (e) {
    uiAlert?.("❌ No se pudo importar el respaldo.", { title: "Respaldo", icon: "❌" });
  }
}

async function clearLocalData(){
  const ok = await uiConfirm(
    "⚠️ Esto borrará clientes, cotizaciones y movimientos guardados en este teléfono. ¿Continuar?",
    { title: "Limpiar datos", icon: "🗑️", okText: "Borrar", cancelText: "Cancelar" }
  );
  if (!ok) return;

  try {
    for (const k of BACKUP_KEYS) {
      if (k === THEME_KEY) continue; // conservar tema
      localStorage.removeItem(k);
    }
    // borrar drafts
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BACKUP_PREFIX_DRAFT)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));

    await uiAlert("✅ Datos locales borrados. La app se recargará.", { title: "Limpiar datos", icon: "✅" });
    location.reload();
  } catch {
    uiAlert?.("❌ No se pudo borrar.", { title: "Limpiar datos", icon: "❌" });
  }
}



/* ================= UI MODALS (alert/confirm bonitos) ================= */
let __uiAlertResolver = null;
let __uiConfirmResolver = null;

function uiGuessIcon(message, fallback){
  const s = String(message ?? "").trim();
  if (!s) return fallback || "ℹ️";
  const first = s[0];
  const icons = ["✅","❌","⚠️","🗑️","ℹ️","📌","📦","📄","🧾"];
  return icons.includes(first) ? first : (fallback || "ℹ️");
}

function uiAlert(message, opts = {}){
  const title = opts.title || "Mensaje";
  const icon = opts.icon || uiGuessIcon(message, "ℹ️");

  // fallback si no existen elementos
  if (!el("modalUiAlert") || !el("uiAlertText")) {
    try { window.__nativeAlert ? window.__nativeAlert(message) : console.log(message); } catch {}
    return Promise.resolve();
  }

  el("uiAlertTitle").textContent = title;
  el("uiAlertIcon").textContent = icon;
  el("uiAlertText").textContent = String(message ?? "");

  openModal("modalUiAlert");

  return new Promise(resolve => {
    __uiAlertResolver = resolve;
  });
}

function uiAlertClose(){
  closeModal("modalUiAlert");
  if (__uiAlertResolver) {
    const r = __uiAlertResolver;
    __uiAlertResolver = null;
    r();
  }
}

function uiConfirm(message, opts = {}){
  const title = opts.title || "Confirmar";
  const icon = opts.icon || uiGuessIcon(message, "⚠️");
  const okText = opts.okText || "Aceptar";
  const cancelText = opts.cancelText || "Cancelar";

  if (!el("modalUiConfirm") || !el("uiConfirmText")) {
    // fallback
    const res = window.__nativeConfirm ? window.__nativeConfirm(message) : true;
    return Promise.resolve(!!res);
  }

  el("uiConfirmTitle").textContent = title;
  el("uiConfirmIcon").textContent = icon;
  el("uiConfirmText").textContent = String(message ?? "");
  el("uiConfirmOkBtn").textContent = okText;

  // set cancel text
  const cancelBtn = el("modalUiConfirm").querySelector("button.secondary");
  if (cancelBtn) cancelBtn.textContent = cancelText;

  openModal("modalUiConfirm");

  return new Promise(resolve => {
    __uiConfirmResolver = resolve;
  });
}

function uiConfirmOk(){
  closeModal("modalUiConfirm");
  if (__uiConfirmResolver) {
    const r = __uiConfirmResolver;
    __uiConfirmResolver = null;
    r(true);
  }
}

function uiConfirmCancel(){
  closeModal("modalUiConfirm");
  if (__uiConfirmResolver) {
    const r = __uiConfirmResolver;
    __uiConfirmResolver = null;
    r(false);
  }


}

/* ================= MODAL: DESPACHAR SALIDA (pendientes de salida) ================= */
let __dsResolver = null;

function dsAbrir({ motoristas = [], placas = [], defaultId = "", defaultNombre = "", defaultPlaca = "" } = {}){
  // cachea listas si vienen precargadas
  if (Array.isArray(motoristas) && motoristas.length) __motoristasRepoCache = motoristas;
  if (Array.isArray(placas) && placas.length) __placasRepoCache = placas;

  const idEl = el("dsMotoristaId");
  const nomEl = el("dsMotoristaNombre");
  const disp = el("dsMotoristaNombreDisplay");
  const placa = el("dsPlaca");

  if (idEl) idEl.value = defaultId || "";
  if (nomEl) nomEl.value = defaultNombre || "";
  if (disp) disp.value = defaultNombre || "";
  if (placa) placa.value = defaultPlaca || "";

  openModal("modalDespachoSalida");

  return new Promise(resolve => {
    __dsResolver = resolve;
  });
}

function dsCerrar(ok){
  const idEl = el("dsMotoristaId");
  const nomEl = el("dsMotoristaNombre");
  const disp = el("dsMotoristaNombreDisplay");
  const placa = el("dsPlaca");

  if (!ok) {
    closeModal("modalDespachoSalida");
    if (__dsResolver) {
      const r = __dsResolver;
      __dsResolver = null;
      r(null);
    }
    return;
  }

  const id = idEl ? String(idEl.value || "").trim() : "";
  const nombre = String((nomEl?.value || disp?.value || "")).trim();
  if (!nombre) {
    uiAlert("Debes seleccionar un motorista para despachar.");
    return;
  }

  const placaVal = placa ? String(placa.value || "").trim().toUpperCase() : "";

  closeModal("modalDespachoSalida");
  if (__dsResolver) {
    const r = __dsResolver;
    __dsResolver = null;
    r({ motoristaId: id || nombre, motoristaNombre: nombre, placa: placaVal });
  }
}


/* ================= PICKERS: Motoristas / Placas (desde GitHub) ================= */
let __motoristasRepoCache = null;
let __placasRepoCache = null;

let __pickMotoristaAll = [];
let __pickPlacaAll = [];
let __pickMotoristaResolver = null;
let __pickPlacaResolver = null;

function __normalizeStringList(data){
  // Acepta: ["A","B"] o {items:[...]} o {"A":true,...} o texto (líneas)
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    return data.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.motoristas)) return data.motoristas;
    if (Array.isArray(data.placas)) return data.placas;
    // si es mapa, usamos llaves
    return Object.keys(data || {});
  }
  return [];
}

function __normalizeMotoristas(data){
  const arr = __normalizeStringList(data);
  // si ya vienen objetos {id,nombre}
  if (arr.length && typeof arr[0] === "object" && arr[0] !== null) {
    return arr
      .map(x => ({
        id: String(x.id ?? x.nombre ?? "").trim(),
        nombre: String(x.nombre ?? x.id ?? "").trim()
      }))
      .filter(x => x.nombre);
  }
  return arr
    .map(x => String(x || "").trim())
    .filter(Boolean)
    .map(n => ({ id: n, nombre: n }));
}

function __normalizePlacas(data){
  const arr = __normalizeStringList(data);
  if (arr.length && typeof arr[0] === "object" && arr[0] !== null) {
    // por si vienen como {placa:"HAA1234"} o {id:"HAA1234"}
    return arr
      .map(x => String(x.placa ?? x.id ?? x.value ?? "").trim().toUpperCase())
      .filter(Boolean);
  }
  return arr.map(x => String(x || "").trim().toUpperCase()).filter(Boolean);
}

async function loadMotoristasRepo(force=false){
  if (__motoristasRepoCache && !force) return __motoristasRepoCache;
  try{
    const data = await fetchJson(URLS.motoristas);
    __motoristasRepoCache = __normalizeMotoristas(data);
  }catch(e){
    console.warn("No se pudo cargar motoristas del repo:", e);
    // fallback: lo que exista en localStorage (legacy)
    try{
      __motoristasRepoCache = (getMotoristasOp() || []).map(m => ({ id: String(m.id ?? m.nombre ?? ""), nombre: String(m.nombre ?? "") })).filter(m => m.nombre);
    }catch(_){
      __motoristasRepoCache = [];
    }
  }
  return __motoristasRepoCache;
}

async function loadPlacasRepo(force=false){
  if (__placasRepoCache && !force) return __placasRepoCache;
  try{
    const data = await fetchJson(URLS.placas);
    __placasRepoCache = __normalizePlacas(data);
  }catch(e){
    console.warn("No se pudo cargar placas del repo:", e);
    __placasRepoCache = [];
  }
  return __placasRepoCache;
}

function pickMotoristaRender(list){
  const wrap = el("pickMotoristaList");
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="picker-empty">No hay motoristas en <b>motoristas.json</b> o no se pudo cargar.</div>`;
    return;
  }
  wrap.innerHTML = list.map(m => `
    <button type="button" class="list-item" onclick="pickMotoristaElegir('${escapeHtml(m.id)}','${escapeHtml(m.nombre)}')">
      <div class="list-title">${escapeHtml(m.nombre)}</div>
    </button>
  `).join("");
}

function pickPlacaRender(list){
  const wrap = el("pickPlacaList");
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="picker-empty">No hay placas en <b>placas.json</b> o no se pudo cargar.</div>`;
    return;
  }
  wrap.innerHTML = list.map(p => `
    <button type="button" class="list-item" onclick="pickPlacaElegir('${escapeHtml(p)}')">
      <div class="list-title">${escapeHtml(p)}</div>
    </button>
  `).join("");
}

async function pickMotoristaAbrir(){
  const list = await loadMotoristasRepo();
  __pickMotoristaAll = Array.isArray(list) ? list.slice() : [];
  const inp = el("pickMotoristaSearch");
  if (inp) inp.value = "";
  pickMotoristaRender(__pickMotoristaAll);
  openModal("modalPickMotorista");
  return new Promise(resolve => {
    __pickMotoristaResolver = resolve;
  });
}

function pickMotoristaFiltrar(){
  const q = String(el("pickMotoristaSearch")?.value || "").trim().toLowerCase();
  const list = !q ? __pickMotoristaAll : __pickMotoristaAll.filter(m => String(m.nombre || "").toLowerCase().includes(q));
  pickMotoristaRender(list);
}

function pickMotoristaElegir(id, nombre){
  closeModal("modalPickMotorista");
  if (__pickMotoristaResolver) {
    const r = __pickMotoristaResolver;
    __pickMotoristaResolver = null;
    r({ id: String(id || "").trim(), nombre: String(nombre || "").trim() });
  }
}

function pickMotoristaCerrar(){
  closeModal("modalPickMotorista");
  if (__pickMotoristaResolver) {
    const r = __pickMotoristaResolver;
    __pickMotoristaResolver = null;
    r(null);
  }
}

async function pickPlacaAbrir(){
  const list = await loadPlacasRepo();
  __pickPlacaAll = Array.isArray(list) ? list.slice() : [];
  const inp = el("pickPlacaSearch");
  if (inp) inp.value = "";
  pickPlacaRender(__pickPlacaAll);
  openModal("modalPickPlaca");
  return new Promise(resolve => {
    __pickPlacaResolver = resolve;
  });
}

function pickPlacaFiltrar(){
  const q = String(el("pickPlacaSearch")?.value || "").trim().toUpperCase();
  const list = !q ? __pickPlacaAll : __pickPlacaAll.filter(p => String(p || "").includes(q));
  pickPlacaRender(list);
}

function pickPlacaElegir(placa){
  closeModal("modalPickPlaca");
  if (__pickPlacaResolver) {
    const r = __pickPlacaResolver;
    __pickPlacaResolver = null;
    r(String(placa || "").trim().toUpperCase());
  }
}

function pickPlacaCerrar(){
  closeModal("modalPickPlaca");
  if (__pickPlacaResolver) {
    const r = __pickPlacaResolver;
    __pickPlacaResolver = null;
    r(null);
  }
}

/* ===== Hooks para Operador / Despacho ===== */
async function opSeleccionarMotorista(){
  if (!salidaFactura) return;
  const m = await pickMotoristaAbrir();
  if (!m) return;

  salidaFactura.motoristaId = m.id || m.nombre || "";
  salidaFactura.motoristaNombre = m.nombre || "";
  if (el("opSMotoristaId")) el("opSMotoristaId").value = salidaFactura.motoristaId;
  if (el("opSMotoristaNombre")) el("opSMotoristaNombre").value = salidaFactura.motoristaNombre;

  actualizarPreviewSalida();

  // Después de elegir motorista, abrir selección de placa
  await opSeleccionarPlaca();
}

async function opSeleccionarPlaca(){
  if (!salidaFactura) return;
  const placa = await pickPlacaAbrir();
  if (!placa) return;

  salidaFactura.placa = placa;
  if (el("opSPlaca")) el("opSPlaca").value = placa;
  actualizarPreviewSalida();
}

function opLimpiarMotorista(){
  if (!salidaFactura) return;
  salidaFactura.motoristaId = "";
  salidaFactura.motoristaNombre = "";
  if (el("opSMotoristaId")) el("opSMotoristaId").value = "";
  if (el("opSMotoristaNombre")) el("opSMotoristaNombre").value = "";
  actualizarPreviewSalida();
}

async function dsSeleccionarMotorista(){
  const m = await pickMotoristaAbrir();
  if (!m) return;

  if (el("dsMotoristaId")) el("dsMotoristaId").value = m.id || m.nombre || "";
  if (el("dsMotoristaNombre")) el("dsMotoristaNombre").value = m.nombre || "";
  if (el("dsMotoristaNombreDisplay")) el("dsMotoristaNombreDisplay").value = m.nombre || "";

  // Después de elegir motorista, abrir selección de placa
  await dsSeleccionarPlaca();
}

async function dsSeleccionarPlaca(){
  const placa = await pickPlacaAbrir();
  if (!placa) return;
  const inp = el("dsPlaca");
  if (inp) inp.value = placa;
}

function dsLimpiarMotorista(){
  if (el("dsMotoristaId")) el("dsMotoristaId").value = "";
  if (el("dsMotoristaNombre")) el("dsMotoristaNombre").value = "";
  if (el("dsMotoristaNombreDisplay")) el("dsMotoristaNombreDisplay").value = "";
}

// Reemplazar alert nativo (evita "https://... dice")
(function(){
  if (!window.__nativeAlert) window.__nativeAlert = window.alert.bind(window);
  if (!window.__nativeConfirm) window.__nativeConfirm = window.confirm.bind(window);

  window.alert = function(message){
    try {
      uiAlert(String(message ?? ""));
    } catch (e) {
      try { window.__nativeAlert(message); } catch {}
    }
  };
})();
function nowStr(){
  return new Date().toLocaleString("es-HN");
}

function getRole(){
  return localStorage.getItem("role") || "";
}


/* ================= MOVIMIENTOS: Usuario (Excel) + Bodega ================= */
const MOV_USER_KEY = "movimientosUsuario";
let __movUserResolver = null;

function getMovimientosUsuario(){
  return String(localStorage.getItem(MOV_USER_KEY) || "").trim();
}

function pedirMovimientosUsuario(){
  const existing = getMovimientosUsuario();
  if (existing) return Promise.resolve(existing);

  // Si no existe el modal (por cualquier razón), fallback a prompt nativo.
  if (!el("modalMovUsuario") || !el("movUsuarioInput")) {
    const v = (window.prompt("Nombre de usuario para exportar movimientos (se guarda en este teléfono):", "") || "").trim();
    if (v) localStorage.setItem(MOV_USER_KEY, v);
    return Promise.resolve(v);
  }

  el("movUsuarioInput").value = "";
  openModal("modalMovUsuario");
  setTimeout(() => el("movUsuarioInput")?.focus(), 50);

  return new Promise(resolve => {
    __movUserResolver = resolve;
  });
}

function guardarMovimientosUsuario(){
  const v = String(el("movUsuarioInput")?.value || "").trim();
  if (!v) {
    uiAlert("⚠️ Escribe un nombre de usuario.", { title: "Usuario", icon: "⚠️" });
    return;
  }

  localStorage.setItem(MOV_USER_KEY, v);
  closeModal("modalMovUsuario");

  if (__movUserResolver) {
    const r = __movUserResolver;
    __movUserResolver = null;
    r(v);
  }
}

function cancelarMovimientosUsuario(){
  closeModal("modalMovUsuario");
  if (__movUserResolver) {
    const r = __movUserResolver;
    __movUserResolver = null;
    r("");
  }
}

function getBodegaByRole(role){
  return String(role || "").toUpperCase() === "BODEGUERO" ? "ANEXO" : "PRINCIPAL";
}

function getBodegaActual(){
  return getBodegaByRole(getRole());
}


function isOperador(){
  return getRole() === "OPERADOR";
}

function isBodeguero(){
  return getRole() === "BODEGUERO";
}

function isOperadorLike(){
  const r = getRole();
  return r === "OPERADOR" || r === "BODEGUERO";
}


function isVisualizador(){
  return getRole() === "VISUALIZADOR";
}

function isVendedorRole(role = getRole()){
  return role === "VENDEDOR" || role === "VENDEDOR_JULIO" || role === "VENDEDOR_LEONARDI";
}

function getAllowedPriceTypes(role = getRole()){
  // Por defecto: todo
  let types = [...PRICE_TYPES];

  // Restricciones por rol
  if (role === "VENDEDOR_JULIO") {
    // Julio: no puede usar PRECIO VENDEDOR
    types = types.filter(t => t !== "precioVendedor");
  }

  if (role === "VENDEDOR_LEONARDI") {
    // Leonardi: no puede usar PRECIO VENDEDOR ni MAYOREO
    types = types.filter(t => t !== "precioVendedor" && t !== "mayoreo");
  }

  return types;
}

function sanitizeCotizacionPriceTypesForRole(){
  if (!cotizacionActual || !Array.isArray(cotizacionActual.items)) return;

  const role = getRole();
  if (!isVendedorRole(role) && role !== "ADMIN") return; // solo aplica a cotizaciones

  const allowed = getAllowedPriceTypes(role);
  if (!allowed.length) return;

  let changed = false;
  const fallbackType = allowed.includes("precio") ? "precio" : allowed[0];

  for (const it of cotizacionActual.items) {
    if (!allowed.includes(it.priceType)) {
      it.priceType = fallbackType;
      it.customPrice = 0;
      changed = true;
    }
    if (it.priceType !== "precioVendedor" && Number(it.customPrice || 0) !== 0) {
      it.customPrice = 0;
      changed = true;
    }
  }

  if (changed) {
    try { normalizeItems(); } catch {}
  }
}

// ✅ Buscar producto por código (case-insensitive)
function getProdByCodigo(codigo){
  const key = String(codigo || "").trim();
  if (!key) return null;

  return (
    catalogoMap.get(key) ||
    catalogoMap.get(key.toLowerCase()) ||
    catalogoMap.get(key.toUpperCase()) ||
    null
  );
}

// ✅ Normalizar código de barras (ALIAS)
function normalizeAlias(v){
  return String(v || "").trim().replace(/\s+/g, "");
}

// ================= NUEVO: Utilidades para inventarios (estructura por cantidad) =================
async function fetchJsonFirstOk(urls, opts = {}) {
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr = null;
  for (const u of list) {
    try { return await fetchJson(u, opts); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("No se pudo cargar JSON (todas las URLs fallaron)");
}

/**
 * Construye un índice maestro por código usando:
 * - cat: catálogo (nombre/departamento/categoría/alias, etc.)
 * - invP/invA/invT: inventarios (solo {cantidad})
 * - preciosadmin/preciosLocal: capas de precios
 *
 * Nota: con la nueva estructura de inventarios, la metadata del producto se resuelve SOLO desde catálogo.
 */
function buildMasterIndex({ catalogoProductos, invP, invA, invT, preciosadmin, preciosLocal }) {
  const codes = new Set([
    ...Object.keys(invP || {}),
    ...Object.keys(invA || {}),
    ...Object.keys(invT || {}),
    ...Object.keys(preciosadmin || {}),
    ...Object.keys(catalogoProductos || {})
  ]);

  const list = [];
  const map = new Map();
  const aliasMap = new Map();

  for (const codigo of codes) {
    const p = invP?.[codigo] || {};
    const a = invA?.[codigo] || {};
    const t = invT?.[codigo] || {};

    const cat = (catalogoProductos && catalogoProductos[codigo]) ? catalogoProductos[codigo] : null;

    const alias = normalizeAlias(cat?.ALIAS ?? cat?.alias ?? "");
    const catProducto   = String(cat?.PRODUCTO ?? cat?.producto ?? "").trim();
    const catDepto      = String(cat?.DEPARTAMENTO ?? cat?.departamento ?? "").trim();
    const catCategoria  = String(cat?.CATEGORIA ?? cat?.categoria ?? "").trim();

    const data  = preciosadmin?.[codigo] || {};
    const local = preciosLocal?.[codigo] || {};
    const merged = { ...data, ...local }; // local sobreescribe GitHub

    const stockP = Number(p.cantidad || 0);
    const stockA = Number(a.cantidad || 0);
    const stockT = Number(t.cantidad || 0);

    const obj = {
      codigo,
      // 👇 Con inventarios "solo cantidad", estos campos deben venir del catálogo
      producto: catProducto || "",
      departamento: catDepto || "",
      categoria: catCategoria || "",
      alias: alias || "",
      stockP,
      stockA,
      stockT,
      stockTotal: stockP + stockA + stockT,
      precios: {
        precio: price0(merged.precio),
        precioA: price0(merged.precioA),
        precioB: price0(merged.precioB),
        precioC: price0(merged.precioC),
        mayoreo: price0(merged.mayoreo),
        precioVendedor: price0(merged.precioVendedor)
      },
      admin: {
        costo: Number(merged.costo ?? 0),
        limite: Number(merged.limite ?? 0)
      }
    };

    list.push(obj);
    map.set(codigo, obj);
    map.set(String(codigo).toLowerCase(), obj);
    map.set(String(codigo).toUpperCase(), obj);

    if (alias) {
      aliasMap.set(alias, obj);
      aliasMap.set(String(alias).toLowerCase(), obj);
      aliasMap.set(String(alias).toUpperCase(), obj);
    }
  }

  list.sort((x,y) => (x.producto||"").localeCompare(y.producto||"", "es"));
  return { list, map, aliasMap };
}
// ================= FIN NUEVO: Utilidades para inventarios =================


// ✅ Buscar producto por ALIAS (código de barras)
function getProdByAlias(alias){
  const key = normalizeAlias(alias);
  if (!key) return null;

  return (
    catalogoAliasMap.get(key) ||
    catalogoAliasMap.get(key.toLowerCase()) ||
    catalogoAliasMap.get(key.toUpperCase()) ||
    null
  );
}

// ✅ Stock disponible (Principal + Anexo + Tienda)
function stockDisponibleTotal(prod){
  if (!prod) return 0;
  return Number(prod.stockP || 0) + Number(prod.stockA || 0) + Number(prod.stockT || 0);
}

/* ================= CACHE (offline) =================
   - Guarda respuestas JSON en IndexedDB (fallback a localStorage)
   - Si no hay conexión, usa la última copia guardada
*/
const __CACHE_DB_NAME = "fu_json_cache_v1";
const __CACHE_STORE = "json";
let __cacheDbPromise = null;
let __cacheOfflineToastShown = false;

function __b64(s){
  try { return btoa(String(s || "")); } catch { return String(s || ""); }
}
function __cacheKey(prefix, url){
  return `${prefix}:${__b64(url)}`;
}

async function __openCacheDb(){
  if (__cacheDbPromise) return __cacheDbPromise;
  __cacheDbPromise = new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(__CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(__CACHE_STORE)) {
          db.createObjectStore(__CACHE_STORE, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return __cacheDbPromise;
}

async function __cacheGet(url){
  const u = String(url || "");
  if (!u) return null;

  // 1) IndexedDB
  try {
    const db = await __openCacheDb();
    if (db) {
      const tx = db.transaction(__CACHE_STORE, 'readonly');
      const store = tx.objectStore(__CACHE_STORE);
      const req = store.get(u);
      const rec = await new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (rec && rec.data) return rec;
    }
  } catch {}

  // 2) localStorage fallback
  try {
    const raw = localStorage.getItem(__cacheKey('fuCacheJson', u));
    if (!raw) return null;
    const ts = Number(localStorage.getItem(__cacheKey('fuCacheJsonTs', u)) || 0);
    return { url: u, data: JSON.parse(raw), ts };
  } catch {
    return null;
  }
}

async function __cacheSet(url, data){
  const u = String(url || "");
  if (!u) return;
  const ts = Date.now();

  // 1) IndexedDB
  try {
    const db = await __openCacheDb();
    if (db) {
      const tx = db.transaction(__CACHE_STORE, 'readwrite');
      tx.objectStore(__CACHE_STORE).put({ url: u, data, ts });
      // no await de tx.oncomplete para no bloquear UI
    }
  } catch {}

  // 2) localStorage fallback
  try {
    localStorage.setItem(__cacheKey('fuCacheJson', u), JSON.stringify(data));
    localStorage.setItem(__cacheKey('fuCacheJsonTs', u), String(ts));
  } catch {}

  try { localStorage.setItem(__cacheKey('fuCacheLastSync', u), String(ts)); } catch {}
}

async function __cacheDelete(url){
  const u = String(url || "");
  if (!u) return;

  try {
    const db = await __openCacheDb();
    if (db) {
      const tx = db.transaction(__CACHE_STORE, 'readwrite');
      tx.objectStore(__CACHE_STORE).delete(u);
    }
  } catch {}

  try {
    localStorage.removeItem(__cacheKey('fuCacheJson', u));
    localStorage.removeItem(__cacheKey('fuCacheJsonTs', u));
    localStorage.removeItem(__cacheKey('fuCacheLastSync', u));
  } catch {}
}

function __getLastSyncTsForUrl(url){
  try {
    const v = localStorage.getItem(__cacheKey('fuCacheLastSync', String(url||"")));
    return Number(v || 0);
  } catch {
    return 0;
  }
}

function formatDateTime(ts){
  const n = Number(ts || 0);
  if (!n) return "—";
  try { return new Date(n).toLocaleString("es-HN"); } catch { return "—"; }
}

async function fetchJson(url, opts = {}){
  const u = String(url || "");
  const allowCache = (opts.allowCache !== false);
  const timeoutMs = Number(opts.timeoutMs || 20000);

  const fetchWithTimeout = async () => {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs) : null;
    try {
      const res = await fetch(u, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      return res;
    } finally {
      if (t) clearTimeout(t);
    }
  };

  try {
    const res = await fetchWithTimeout();
    if(!res.ok) throw new Error(`HTTP ${res.status} - ${u}`);
    const data = await res.json();
    if (allowCache) { try { await __cacheSet(u, data); } catch {} }
    return data;
  } catch (err) {
    if (allowCache) {
      const cached = await __cacheGet(u);
      if (cached && cached.data) {
        if (!__cacheOfflineToastShown) {
          __cacheOfflineToastShown = true;
          try { showToast("Sin conexión: usando caché guardada"); } catch {}
        }
        return cached.data;
      }
    }
    throw err;
  }
}

// Avisos cortos cuando cambia el estado de conexión (útil en WebView)
(function setupOnlineOfflineToasts(){
  try {
    window.addEventListener('offline', () => {
      try { showToast("Modo offline"); } catch {}
    });
    window.addEventListener('online', () => {
      // permitir que vuelva a mostrar el aviso de "usando caché" si cae la red otra vez
      try { __cacheOfflineToastShown = false; } catch {}
      try { showToast("Conexión restaurada ✅"); } catch {}
    });
  } catch {}
})();

/* ================= STATE ================= */
let selectedRole = null;

let nombreVendedor = localStorage.getItem("nombreVendedor") || "";

let clientes = JSON.parse(localStorage.getItem("clientes") || "[]");
let cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");

let catalogo = [];
let catalogoMap = new Map();
let catalogoAliasMap = new Map();
let catalogoCargado = false;

let cotizacionActual = null;
let cotizacionEditMode = false; // ✅ true cuando editas una cotización guardada

let pendingAction = null;

let selectedProductCode = null;

let lastFile = { blob:null, url:null, filename:"cotizacion.pdf", mime:"application/pdf", title:"", text:"" };
let logoDataUrlCache = null;

let inventarioVersion = localStorage.getItem("inventarioVersion") || "0";
let inventarioAdmin = [];

// ADMIN home: INVENTARIO | COTIZACIONES
let adminHomeMode = "INVENTARIO";

/* ================= ELEMENTS ================= */
const loginScreen = el("login");
const appScreen = el("app");

const pinBox = el("pinBox");
const pinInput = el("pin");
const pinError = el("pinError");
const roleText = el("roleText");

const vendedorHome = el("vendedorHome");
const operadorHome = el("operadorHome");
const operadorHomeUI = el("operadorHomeUI");
const bodegueroHomeUI = el("bodegueroHomeUI");
const contenido = el("contenido");

const headerTitle = el("headerTitle");



/* ================= SAFE AREA (Android navigation bar) ================= */
(function setupSafeAreaBottom(){
  const set = () => {
    const vv = window.visualViewport;
    if (!vv) {
      document.documentElement.style.setProperty("--safe-bottom", "0px");
      return;
    }
    const bottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty("--safe-bottom", Math.round(bottom) + "px");
  };

  set();
  window.addEventListener("resize", set);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", set);
    window.visualViewport.addEventListener("scroll", set);
  }
})();
/* ================= INIT ================= */
async function initApp() {
  await checkVersionAndReload();
  if (localStorage.getItem("role")) startApp();
}
initApp();

/* ================= LOGIN ================= */
function selectRole(role){
  selectedRole = role;
  roleText.textContent = `Rol: ${role}`;
  el("roles").style.display = "none";
  pinError.classList.add("hidden");
  pinBox.classList.remove("hidden");
  pinInput.value = "";
  pinInput.focus();
}

function resetLogin(){
  selectedRole = null;
  pinInput.value = "";
  pinError.classList.add("hidden");
  el("roles").style.display = "block";
  pinBox.classList.add("hidden");
  roleText.textContent = "Selecciona un rol";
}

function validatePin(){
  if (!selectedRole) return;

  const pin = (pinInput.value || "").trim();

  // ✅ Caso especial: desde el botón "VENDEDOR" se permite entrar también como VENDEDOR JULIO / VENDEDOR LEONARDI
  if (selectedRole === "VENDEDOR") {
    let resolvedRole = null;
    if (pin === PINS.VENDEDOR) resolvedRole = "VENDEDOR";
    else if (pin === PINS.VENDEDOR_JULIO) resolvedRole = "VENDEDOR_JULIO";
    else if (pin === PINS.VENDEDOR_LEONARDI) resolvedRole = "VENDEDOR_LEONARDI";

    if (resolvedRole) {
      localStorage.setItem("role", resolvedRole);
      startApp();
      return;
    }

    pinError.classList.remove("hidden");
    return;
  }

  if (pin === PINS[selectedRole]) {
    localStorage.setItem("role", selectedRole);
    startApp();
  } else {
    pinError.classList.remove("hidden");
  }
}

if (pinInput) {
  pinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") validatePin();
  });
}

// ✅ Compatibilidad: asegura que los handlers del HTML puedan llamar estas funciones
// (útil si el archivo se sirve como módulo o en ciertos WebViews).
try {
  window.selectRole = selectRole;
  window.validatePin = validatePin;
  window.resetLogin = resetLogin;
  // HOME Vendedor
  window.venHomeSelect = venHomeSelect;
  window.renderVendedorHomeDashboard = renderVendedorHomeDashboard;
  window.abrirModalNuevoClienteDesdeHome = abrirModalNuevoClienteDesdeHome;
  window.compartirCotizacionGuardada = compartirCotizacionGuardada;
  // Ajustes (inventario offline)
  window.refreshInventoryNow = refreshInventoryNow;
  window.clearInventoryCache = clearInventoryCache;
} catch (e) {}

function startApp(){
  loginScreen.classList.add("hidden");
  loginScreen.style.display = "none";

  appScreen.classList.remove("hidden");
  appScreen.style.display = "block";

  const role = localStorage.getItem("role");

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.add("hidden");

  if (operadorHomeUI) operadorHomeUI.classList.add("hidden");
  if (bodegueroHomeUI) bodegueroHomeUI.classList.add("hidden");

  if (isVendedorRole(role)) {
    headerTitle.textContent = "Cotizaciones";
    vendedorHome.classList.remove("hidden");
    setTimeout(() => {
      try { renderVendedorHomeDashboard(true); } catch {}
    }, 0);
  } else if (role === "OPERADOR" || role === "BODEGUERO") {
    headerTitle.textContent = (role === "BODEGUERO") ? "Bodeguero" : "Operador";
    operadorHome.classList.remove("hidden");

    // ✅ UI distinta por rol (BODEGUERO NO cambia)
    if (role === "BODEGUERO") {
      if (operadorHomeUI) operadorHomeUI.classList.add("hidden");
      if (bodegueroHomeUI) bodegueroHomeUI.classList.remove("hidden");
    } else {
      if (bodegueroHomeUI) bodegueroHomeUI.classList.add("hidden");
      if (operadorHomeUI) operadorHomeUI.classList.remove("hidden");
      // Importante: retrasar para evitar TDZ (hay variables/lets definidas más abajo)
      setTimeout(() => renderOperadorHomeDashboard(), 0);
    }
  } else if (role === "RECEPCION") {
    headerTitle.textContent = "Recepción";
    contenido.classList.remove("hidden");
    setTimeout(() => {
      try { ensureRecepcionStateLoaded(); } catch {}
      try { renderRecepcionHome(); } catch {}
    }, 0);
  } else if (role === "VISUALIZADOR") {
    headerTitle.textContent = "Inventario";
    abrirConsultaInventarioVendedor();
  } else if (role === "ADMIN") {
    headerTitle.textContent = "Inventario Admin";
    adminHomeMode = "INVENTARIO";
    abrirConsultaInventarioVendedor();
  } else {
    contenido.classList.remove("hidden");
    contenido.innerHTML = `
      <div class="card">
        <strong>⚠️ Rol no implementado</strong>
        <div style="color:#6B7280; margin-top:6px;">
          Actualmente este módulo está listo para <b>VENDEDOR</b>, <b>VENDEDOR JULIO</b>, <b>VENDEDOR LEONARDI</b>, <b>OPERADOR</b>, <b>BODEGUERO</b>, <b>VISUALIZADOR</b> y <b>ADMIN</b>.
        </div>
      </div>
    `;
  }

  // ✅ En móvil: capturar botón Atrás del teléfono para que funcione como el "Volver" de la app
  try { enablePhoneBackBehavior(); } catch {}

}

function logout(){
  localStorage.removeItem("role");
  location.reload();
}

/* ================= VERSION CHECK ================= */
async function checkVersionAndReload() {
  try {
    const versionData = await fetchJson(URLS.version);
    const newVersion = versionData.version || "0";

    if (newVersion !== inventarioVersion) {
      inventarioVersion = newVersion;
      localStorage.setItem("inventarioVersion", inventarioVersion);

      // invalidar caches
      catalogoCargado = false;
      inventarioAdmin = [];

      return true;
    }
  } catch (err) {
    console.warn("No se pudo cargar versión:", err);
  }
  return false;
}

/* ================= MODAL VENDEDOR ================= */
function abrirModalVendedor(){
  el("nombreVendedorInput").value = nombreVendedor || "";
  openModal("modalVendedor");
  setTimeout(() => el("nombreVendedorInput").focus(), 50);
}

function cerrarModalVendedor(){
  pendingAction = null;
  closeModal("modalVendedor");
}

function guardarNombreVendedor(){
  const v = (el("nombreVendedorInput").value || "").trim();
  if (!v) return;

  nombreVendedor = v;
  localStorage.setItem("nombreVendedor", nombreVendedor);
  closeModal("modalVendedor");

  if (pendingAction) {
    const action = pendingAction;
    pendingAction = null;

    if (action.type === "pdf") generarPdfCotizacion(true);
    if (action.type === "guardar") guardarCotizacion(true);
  }
}

function ensureNombreVendedor(actionObj){
  if (nombreVendedor && nombreVendedor.trim()) return true;
  pendingAction = actionObj;
  abrirModalVendedor();
  return false;
}

/* ================= CATALOGO ================= */
async function ensureCatalogoCargado(forceRefresh = false){
  if (catalogoCargado && !forceRefresh) return;

  await checkVersionAndReload();

  const [invP, invA, invT, preciosadmin, catalogoProductos] = await Promise.all([
    fetchJson(URLS.invP),
    fetchJson(URLS.invA),
    fetchJson(URLS.invT),
    fetchJson(URLS.preciosadmin),
    fetchJsonFirstOk([URLS.catalogoProductos, BASE_RAW + "catalogo.json", BASE_RAW + "Catalogo.json"]).catch(() => ({}))
  ]);

  // ✅ aplicar cambios locales de ADMIN (si existen)
  const preciosLocal = JSON.parse(localStorage.getItem("preciosModificadosAdmin") || "{}");

  const built = buildMasterIndex({ catalogoProductos, invP, invA, invT, preciosadmin, preciosLocal });

  catalogo = built.list;
  catalogoMap = built.map;
  catalogoAliasMap = built.aliasMap;
  inventarioAdmin = built.list.slice();

  catalogo.sort((x,y) => (x.producto||"").localeCompare(y.producto||"", "es"));
  inventarioAdmin.sort((x,y) => (x.producto||"").localeCompare(y.producto||"", "es"));
  catalogoCargado = true;
}

// === Acciones de Ajustes: sincronizar y limpiar caché ===
function __getInvGroupLastSync(){
  const invUrls = [URLS.version, URLS.invP, URLS.invA, URLS.invT, URLS.preciosadmin, URLS.catalogoProductos];
  return Math.max(0, ...invUrls.map(u => __getLastSyncTsForUrl(u)));
}

async function refreshInventoryNow(){
  const before = __getInvGroupLastSync();
  try { showToast("Actualizando inventario..."); } catch {}

  try {
    await ensureCatalogoCargado(true);
    const after = __getInvGroupLastSync();
    if (after > before) {
      try { showToast("Inventario actualizado ✅"); } catch {}
    } else {
      try { showToast("Sin conexión: se mantuvo la caché"); } catch {}
    }
  } catch (e) {
    console.warn("No se pudo refrescar inventario:", e);
    try { showToast("No se pudo actualizar"); } catch {}
  }

  try { updateSettingsInfo(); } catch {}
}

async function clearInventoryCache(){
  const invUrls = [URLS.version, URLS.invP, URLS.invA, URLS.invT, URLS.preciosadmin, URLS.catalogoProductos];
  for (const u of invUrls) {
    try { await __cacheDelete(u); } catch {}
  }
  try { showToast("Caché limpiada"); } catch {}
  try { updateSettingsInfo(); } catch {}
}

/* ================= INVENTARIO ADMIN ================= */
async function abrirInventarioAdmin() {
  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");

  try {
    await ensureCatalogoCargado();

    if (inventarioAdmin.length === 0) {
      contenido.innerHTML = `
        <button type="button" class="secondary" onclick="volverDesdeCotizacion()">⬅ Volver</button>
        <div class="card">
          <strong>❌ No se pudo cargar el inventario.</strong>
          <div class="muted">Revisa tu conexión a internet o contacta soporte.</div>
        </div>
      `;
      return;
    }

    contenido.innerHTML = `
      <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

      <div class="card">
        <strong>📦 Inventario Administrador</strong>
        <div class="muted">
          Versión actual: ${inventarioVersion}. Se recarga automáticamente si cambia.
        </div>
      </div>

      <div class="version-info">
        <strong>Última actualización:</strong> ${nowStr()}
      </div>

      <input id="buscarAdmin" class="buscar-admin" placeholder="🔍 Buscar por código o nombre" />

      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <button type="button" onclick="guardarCambiosAdmin()">💾 Guardar Cambios</button>
        <button type="button" onclick="exportarPreciosAExcel()">📊 Exportar Precios a Excel</button>
      </div>

      <div class="inventario-list" id="listaInventarioAdmin"></div>
    `;

    const lista = el("listaInventarioAdmin");
    if (lista) lista.innerHTML = renderListaInventarioAdmin();

    const buscar = el("buscarAdmin");
    if (buscar) {
      buscar.addEventListener("input", () => {
        const lista2 = el("listaInventarioAdmin");
        if (lista2) lista2.innerHTML = renderListaInventarioAdmin();
      });
    }
  } catch (err) {
    console.error("Error cargando inventario ADMIN:", err);
    contenido.innerHTML = `
      <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
      <div class="card">
        <button type="button" onclick="exportarPreciosAExcel()">📊 Exportar Precios a Excel</button>
        <button type="button" onclick="exportarPreciosAJson()">📄 Exportar Precios a JSON (para GitHub)</button>
        <strong>❌ Error al cargar inventario.</strong>
        <div class="muted">Detalles: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function guardarCambiosAdmin() {
  const preciosModificados = {};
  inventarioAdmin.forEach(prod => {
    preciosModificados[prod.codigo] = {
      ...prod.precios,
      costo: prod.admin.costo,
      limite: prod.admin.limite
    };
  });
  localStorage.setItem("preciosModificadosAdmin", JSON.stringify(preciosModificados));
  openModal("modalGuardarCambios");
}

function cerrarModalGuardarCambios() {
  closeModal("modalGuardarCambios");
}

function renderListaInventarioAdmin() {
  const busc = el("buscarAdmin");
  const q = (busc ? (busc.value || "") : "").toLowerCase().trim();

  const filtrados = inventarioAdmin.filter(p =>
    (p.codigo || "").toLowerCase().includes(q) ||
    (p.producto || "").toLowerCase().includes(q)
  );

  return filtrados.map(prod => `
    <div class="inventario-item">
      <div>
        <div class="codigo">${escapeHtml(prod.codigo)}</div>
        <div class="producto">${escapeHtml(prod.producto)}</div>
      </div>
      <div class="stock">
        <div class="etiqueta principal" onclick="abrirModalDetallesProducto('${prod.codigo}')">Principal: ${prod.stockP}</div>
        <div class="etiqueta anexo" onclick="abrirModalDetallesProducto('${prod.codigo}')">Anexo: ${prod.stockA}</div>
      </div>
      <div>
        <button type="button" class="inline" onclick="abrirModalDetallesProducto('${prod.codigo}')">Ver Detalles</button>
      </div>
    </div>
  `).join("");
}

function abrirModalDetallesProducto(codigo) {
  const prod = inventarioAdmin.find(p => p.codigo === codigo);
  if (!prod) return;

  el("dpTitulo").textContent = prod.producto;
  el("dpSub").textContent = `Código: ${prod.codigo}`;

  el("dpPrecios").innerHTML = `
    <div class="k">Precio Público</div><input class="v" type="number" step="0.01" value="${prod.precios.precio || 0}" id="dpPrecio">
    <div class="k">Precio A</div><input class="v" type="number" step="0.01" value="${prod.precios.precioA || 0}" id="dpPrecioA">
    <div class="k">Precio B</div><input class="v" type="number" step="0.01" value="${prod.precios.precioB || 0}" id="dpPrecioB">
    <div class="k">Precio C</div><input class="v" type="number" step="0.01" value="${prod.precios.precioC || 0}" id="dpPrecioC">
    <div class="k">Mayoreo</div><input class="v" type="number" step="0.01" value="${prod.precios.mayoreo || 0}" id="dpMayoreo">
    <div class="k">Precio Vendedor</div><input class="v" type="number" step="0.01" value="${prod.precios.precioVendedor || 0}" id="dpPrecioVendedor">
  `;

  el("dpAdmin").innerHTML = `
    <div class="k">Costo</div><input class="v" type="number" step="0.01" value="${prod.admin.costo || 0}" id="dpCosto">
    <div class="k">Límite</div><input class="v" type="number" step="0.01" value="${prod.admin.limite || 0}" id="dpLimite">
  `;

  openModal("modalDetallesProducto");
}

function guardarCambiosEnModal() {
  const codigo = String(el("dpSub").textContent || "").split(": ")[1] || "";
  const prod = inventarioAdmin.find(p => p.codigo === codigo);
  if (!prod) return;

  prod.precios.precio = Number(el("dpPrecio").value || 0);
  prod.precios.precioA = Number(el("dpPrecioA").value || 0);
  prod.precios.precioB = Number(el("dpPrecioB").value || 0);
  prod.precios.precioC = Number(el("dpPrecioC").value || 0);
  prod.precios.mayoreo = Number(el("dpMayoreo").value || 0);
  prod.precios.precioVendedor = Number(el("dpPrecioVendedor").value || 0);

  prod.admin.costo = Number(el("dpCosto").value || 0);
  prod.admin.limite = Number(el("dpLimite").value || 0);

  const preciosModificados = JSON.parse(localStorage.getItem("preciosModificadosAdmin") || "{}");
  preciosModificados[prod.codigo] = { ...prod.precios, costo: prod.admin.costo, limite: prod.admin.limite };
  localStorage.setItem("preciosModificadosAdmin", JSON.stringify(preciosModificados));

  openModal("modalGuardarCambios");
}

function cerrarModalDetallesProducto() {
  closeModal("modalDetallesProducto");
}

function exportarPreciosAJson() {
  const data = {};
  inventarioAdmin.forEach(prod => {
    data[prod.codigo] = {
      precio: prod.precios.precio || 0,
      precioA: prod.precios.precioA || 0,
      precioB: prod.precios.precioB || 0,
      precioC: prod.precios.precioC || 0,
      mayoreo: prod.precios.mayoreo || 0,
      precioVendedor: prod.precios.precioVendedor || 0,
      costo: prod.admin.costo || 0,
      limite: prod.admin.limite || 0
    };
  });

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  setLastFile(blob, `preciosadmin-${Date.now()}.json`, "Precios Admin - Ferretería Universal", "Archivo JSON para actualizar en GitHub");
  compartirArchivo();
}

function exportarPreciosAExcel() {
  const data = inventarioAdmin.map(prod => ({
    Codigo: prod.codigo,
    Producto: prod.producto,
    Precio: prod.precios.precio || 0,
    PrecioA: prod.precios.precioA || 0,
    PrecioB: prod.precios.precioB || 0,
    PrecioC: prod.precios.precioC || 0,
    Mayoreo: prod.precios.mayoreo || 0,
    PrecioVendedor: prod.precios.precioVendedor || 0,
    Costo: prod.admin.costo || 0,
    Limite: prod.admin.limite || 0
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Precios");
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  setLastFile(blob, `precios-${Date.now()}.xlsx`, "Precios - Ferretería Universal", "Archivo Excel de precios");
  compartirArchivo();
}

/* ================= CLIENTES (pantalla normal) ================= */
function abrirClientes() {
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>👤 Clientes</strong>
      <div class="muted">
        Guardados localmente en este teléfono.
      </div>
    </div>

    <input id="cNombre" placeholder="Nombre del cliente (opcional)">
    <input id="cEmpresa" placeholder="Empresa (opcional)">
    <input id="cTelefono" placeholder="Teléfono (opcional)">
    <input id="cRTN" placeholder="RTN (opcional)">
    <input id="cUbicacion" placeholder="Ubicación (opcional)">

    <button type="button" onclick="guardarClientePantalla()">Guardar cliente</button>

    <hr>

    ${
      clientes.length
        ? clientes.map(c => `
          <div class="list-item">
            <div class="list-title">
              ${escapeHtml(c.nombre || "Cliente sin nombre")}
            </div>

            <div class="list-sub">
              ${c.empresa ? "🏢 " + escapeHtml(c.empresa) + "<br>" : ""}
              ${c.telefono ? "📞 " + escapeHtml(c.telefono) : ""}
            </div>

            ${
              c.telefono
                ? `
                  <div style="margin-top:10px; display:flex; gap:14px;">
                    <span
                      style="font-size:22px; cursor:pointer;"
                      title="Llamar"
                      onclick="llamarCliente('${c.telefono}')"
                    >📞</span>

                    <span
                      style="font-size:22px; cursor:pointer;"
                      title="WhatsApp"
                      onclick="whatsappCliente('${c.telefono}')"
                    >💬</span>
                  </div>
                `
                : ""
            }
          </div>
        `).join("")
        : `
          <div class="card">
            <strong>No hay clientes registrados.</strong>
          </div>
        `
    }
  `;
}

function guardarClientePantalla(){
  const nuevo = {
    id: Date.now(),
    nombre: el("cNombre").value || "",
    empresa: el("cEmpresa").value || "",
    telefono: el("cTelefono").value || "",
    rtn: el("cRTN").value || "",
    ubicacion: el("cUbicacion").value || ""
  };

  clientes.push(nuevo);
  localStorage.setItem("clientes", JSON.stringify(clientes));
  abrirClientes();
}

function volverHome(){
  const role = localStorage.getItem("role");

  contenido.classList.add("hidden");
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");

  if (operadorHomeUI) operadorHomeUI.classList.add("hidden");
  if (bodegueroHomeUI) bodegueroHomeUI.classList.add("hidden");

  if (isVendedorRole(role)) {
    headerTitle.textContent = "Cotizaciones";
    vendedorHome.classList.remove("hidden");
    // ✅ HOME VENDEDOR (dashboard)
    setTimeout(() => {
      if (typeof renderVendedorHomeDashboard === "function") renderVendedorHomeDashboard();
    }, 0);
    return;
  }

  if (role === "OPERADOR" || role === "BODEGUERO") {
    headerTitle.textContent = (role === "BODEGUERO") ? "Bodeguero" : "Operador";
    operadorHome.classList.remove("hidden");

    if (role === "BODEGUERO") {
      if (bodegueroHomeUI) bodegueroHomeUI.classList.remove("hidden");
    } else {
      if (operadorHomeUI) operadorHomeUI.classList.remove("hidden");
      setTimeout(() => renderOperadorHomeDashboard(), 0);
    }
    return;
  }

  if (role === "RECEPCION") {
    headerTitle.textContent = "Recepción";
    contenido.classList.remove("hidden");
    setTimeout(() => {
      try { ensureRecepcionStateLoaded(); } catch {}
      try { renderRecepcionHome(); } catch {}
    }, 0);
    return;
  }

  if (role === "VISUALIZADOR") {
    headerTitle.textContent = "Inventario";
    abrirConsultaInventarioVendedor();
    return;
  }

  if (role === "ADMIN") {
    if (adminHomeMode === "COTIZACIONES") abrirAdminCotizacionesHome();
    else abrirConsultaInventarioVendedor();
    return;
  }

  headerTitle.textContent = "Cotizaciones";
  vendedorHome.classList.remove("hidden");
}


/* ================= VENDEDOR: HOME DASHBOARD ================= */

// Modo de resumen en HOME VENDEDOR: "saved" (cotizaciones) o "clientes".
let venHomeSummaryMode = null;

function getVenHomeSummaryMode(){
  if (venHomeSummaryMode === null) {
    const saved = String(localStorage.getItem("venHomeSummaryMode") || "").trim().toLowerCase();
    venHomeSummaryMode = (saved === "clientes") ? "clientes" : "saved";
  }
  return venHomeSummaryMode;
}

// Selecciona qué lista se muestra en el HOME (debajo de los KPIs)
// opts: {scroll?: boolean, silent?: boolean}
function venHomeSelect(mode, opts = {}){
  const m = (String(mode || "").trim().toLowerCase() === "clientes") ? "clientes" : "saved";
  venHomeSummaryMode = m;
  localStorage.setItem("venHomeSummaryMode", m);

  if (!opts.silent) updateVenHomeKpiActive();
  renderVendedorHomeDashboard(true);

  const doScroll = (opts.scroll !== false);
  if (doScroll) {
    const sec = el("venHomeSection");
    if (sec) {
      try { sec.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
    }
  }
}

function updateVenHomeKpiActive(){
  const mode = getVenHomeSummaryMode();
  const bSaved = el("venKpiBtnSaved");
  const bCli = el("venKpiBtnCli");
  if (bSaved) bSaved.classList.toggle("active", mode === "saved");
  if (bCli) bCli.classList.toggle("active", mode === "clientes");

  const title = el("venHomeSectionTitle");
  if (title) title.textContent = (mode === "clientes") ? "👤 Clientes guardados" : "📑 Cotizaciones guardadas";
}

function renderVendedorHomeDashboard(force = false){
  const role = localStorage.getItem("role");
  if (!isVendedorRole(role)) return;

  const kSaved = el("venHomeKpiSaved");
  const kCli = el("venHomeKpiClientes");
  const body = el("venHomeSavedBody");

  // Si el HOME vendedor no está presente, no hacemos nada
  if (!kSaved && !kCli && !body) return;

  // refrescar data local
  try {
    cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");
  } catch { cotizaciones = []; }

  try {
    clientes = JSON.parse(localStorage.getItem("clientes") || "[]");
  } catch { clientes = []; }

  const savedCount = Array.isArray(cotizaciones) ? cotizaciones.length : 0;
  const cliCount = Array.isArray(clientes) ? clientes.length : 0;

  if (kSaved) kSaved.textContent = String(savedCount);
  if (kCli) kCli.textContent = String(cliCount);

  // activar estado visual + título
  updateVenHomeKpiActive();

  const mode = getVenHomeSummaryMode();
  if (body) {
    body.innerHTML = (mode === "clientes")
      ? renderVenHomeClientes(clientes)
      : renderVenHomeSaved(cotizaciones);
  }
}

function renderVenHomeSaved(list){
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) {
    return `
      <div class="muted" style="margin-bottom:10px;">No hay cotizaciones guardadas aún.</div>
      <button type="button" onclick="abrirCotizacion()">🧾 Crear nueva cotización</button>
    `;
  }

  const sorted = [...arr].sort((a,b)=>{
    const ta = Number(a?.updatedAt || a?.creadoAt || a?.id || 0);
    const tb = Number(b?.updatedAt || b?.creadoAt || b?.id || 0);
    return tb - ta;
  });

  const html = sorted.map(c => {
    const id = c?.id ?? "";
    const idSq = escSq(String(id));
    const total = Number(c?.total || 0);
    const fecha = String(c?.fecha || "").trim();
    const cliente = c?.cliente?.nombre ? String(c.cliente.nombre) : "Sin cliente";
    const sub = [fecha, cliente].filter(Boolean).join(" • ");

    return `
      <div class="op-mini">
        <div>
          <div class="t">🧾 #${escapeHtml(String(id))} • ${moneyL(total)}</div>
          <div class="s">${escapeHtml(sub)}</div>
        </div>
        <div class="op-mini-actions">
          <button type="button" class="small secondary" onclick="editarCotizacionGuardada('${idSq}')">✏️</button>
          <button type="button" class="small" onclick="compartirCotizacionGuardada('${idSq}')">📤</button>
        </div>
      </div>
    `;
  }).join("");

  return html;
}

function renderVenHomeClientes(list){
  const arr = Array.isArray(list) ? list : [];

  if (!arr.length) {
    return `<div class="card"><strong>No hay clientes guardados.</strong></div>`;
  }

  const sorted = [...arr].sort((a,b)=>{
    const na = String(a?.nombre || "").toLowerCase();
    const nb = String(b?.nombre || "").toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });

  return sorted.map(c => {
    const nombre = (c?.nombre || "Cliente sin nombre").trim() || "Cliente sin nombre";
    const empresa = (c?.empresa || "").trim();
    const tel = (c?.telefono || "").trim();
    const sub = [empresa ? `🏢 ${empresa}` : "", tel ? `📞 ${tel}` : ""].filter(Boolean).join(" • ");
    const telSq = escSq(tel);

    return `
      <div class="op-mini">
        <div>
          <div class="t">👤 ${escapeHtml(nombre)}</div>
          <div class="s">${escapeHtml(sub || "—")}</div>
        </div>
        <div class="op-mini-actions">
          ${tel ? `
            <button type="button" class="small secondary" onclick="llamarCliente('${telSq}')">📞</button>
            <button type="button" class="small" onclick="whatsappCliente('${telSq}')">💬</button>
          ` : `<span class="muted">Sin tel.</span>`}
        </div>
      </div>
    `;
  }).join("");
}


/* ================= OPERADOR: HOME DASHBOARD ================= */

// Modo de resumen en HOME OPERADOR: "psd" (pendientes de salida) o "pend" (pendientes de productos)
let opHomeSummaryMode = null;

function getOpHomeSummaryMode(){
  if (opHomeSummaryMode === null) {
    const saved = String(localStorage.getItem("opHomeSummaryMode") || "").trim().toLowerCase();
    opHomeSummaryMode = (saved === "pend") ? "pend" : "psd";
  }
  return opHomeSummaryMode;
}

function opHomeSelect(mode){
  opHomeSummaryMode = (String(mode || "").trim().toLowerCase() === "pend") ? "pend" : "psd";
  localStorage.setItem("opHomeSummaryMode", opHomeSummaryMode);
  updateOpHomeKpiActive();
  renderOperadorHomeDashboard(true);
}


function goOperadorHomePSD(){
  // Fuerza el modo del resumen del HOME a "Pendientes de salida"
  opHomeSummaryMode = "psd";
  localStorage.setItem("opHomeSummaryMode", "psd");
  volverHome();
}


function opHomeOpenFull(){
  const mode = getOpHomeSummaryMode();
  if (mode === "pend") abrirPendientesOperador();
  else goOperadorHomePSD();
}

function updateOpHomeKpiActive(){
  const mode = getOpHomeSummaryMode();
  const bPSD = el("opKpiBtnPSD");
  const bPend = el("opKpiBtnPend");
  if (bPSD) bPSD.classList.toggle("active", mode === "psd");
  if (bPend) bPend.classList.toggle("active", mode === "pend");
}

function renderOperadorHomeDashboard(force = false){
  // Solo aplica al rol OPERADOR
  const role = localStorage.getItem("role");
  if (role !== "OPERADOR") return;

  const kPSD = el("opHomeKpiPSD");
  const kPend = el("opHomeKpiPend");
  const tSum = el("opHomeSummaryTitle");
  const wSum = el("opHomeSummaryBody");
  const wMeta = el("opHomeSummaryMeta");

  // Si el HOME operador no está presente, no hacemos nada
  if (!kPSD && !kPend && !tSum && !wSum && !wMeta) return;

  const psd = (typeof getPendientesSalidaDespachoOp === "function" ? getPendientesSalidaDespachoOp() : []) || [];
  const pend = (typeof getPendientesOp === "function" ? getPendientesOp() : []) || [];

  if (kPSD) kPSD.textContent = String(psd.length || 0);
  if (kPend) kPend.textContent = String(pend.length || 0);

  const mode = getOpHomeSummaryMode();
  updateOpHomeKpiActive();

  if (tSum) {
    tSum.textContent = (mode === "pend")
      ? "⏳ Facturas con productos pendientes"
      : "🚚 Pendientes de salida";
  }

  if (wMeta) {
    if (mode === "pend") {
      const n = Number((pend || []).length || 0);
      wMeta.textContent = `Total: ${n} factura(s)`;
    } else {
      const n = Number((psd || []).length || 0);
      const set = new Set();
      let sin = 0;
      (psd || []).forEach(p => {
        const nm = String(p.motoristaNombre || "").trim();
        if (nm) set.add(nm.toUpperCase());
        else sin++;
      });
      const parts = [
        `Total: ${n} factura(s)`,
        `Motoristas: ${set.size}`
      ];
      if (sin) parts.push(`Sin motorista: ${sin}`);
      wMeta.textContent = parts.join(" • ");
    }
  }


  if (wSum) {
    wSum.innerHTML = (mode === "pend")
      ? renderOpHomePend(pend)
      : renderOpHomePSD(psd);
  }
}


function renderOpHomePSD(list){
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) {
    return `<div class="muted">No hay facturas pendientes de despacho.</div>`;
  }

  // Agrupar por motorista (SIN MOTORISTA aparte)
  const groups = {};
  arr.forEach(p => {
    const nombre = String(p.motoristaNombre || "").trim();
    const key = nombre ? nombre.toUpperCase() : "__SIN__";
    if (!groups[key]) groups[key] = { display: nombre || "Sin motorista", items: [] };
    groups[key].items.push(p);
  });

  // Ordenar por nombre (Sin motorista primero)
  const keys = Object.keys(groups).sort((a,b)=>{
    if (a === "__SIN__") return -1;
    if (b === "__SIN__") return 1;
    const ad = String(groups[a]?.display || a);
    const bd = String(groups[b]?.display || b);
    return ad.localeCompare(bd);
  });

  return keys.map((k, idx) => {
    const g = groups[k];
    const open = (k === "__SIN__") ? "open" : "";
    const factBoxId = `opHomePSD_facturas_${idx}`;

    // Totales rápidos para el summary
    const agg = (typeof aggregateOpPSDProductos === "function")
      ? aggregateOpPSDProductos(g.items || [])
      : { totalEnviar: 0, totalPend: 0 };

    const totalEnviar = Number(agg.totalEnviar || 0);
    const totalPend  = Number(agg.totalPend  || 0);

    const sub = `Enviar: ${fmtQty(totalEnviar)}${totalPend > 0 ? ` • Pend.: ${fmtQty(totalPend)}` : ``}`;

    return `
      <details class="op-group" ${open}>
        <summary>
          <span class="op-group-title">
            <span class="op-group-name">${escapeHtml(g.display)}</span>
            <span class="op-group-sub">${sub}</span>
          </span>
          <span class="badge">${g.items.length}</span>
        </summary>

        <div class="op-group-body">
          <div class="btn-row" style="margin:10px 0;">
            <button type="button" class="small" onclick="despacharGrupoPendientesSalidaOperador('${escSq(k)}')">🚚 Despachar todo (${g.items.length})</button>
            <button type="button" class="secondary small"
              data-show-text="📄 Ver facturas (${g.items.length})"
              data-hide-text="📄 Ocultar facturas"
              onclick="toggleOpPSDGroupFacturas('${factBoxId}', this)">📄 Ver facturas (${g.items.length})</button>
          </div>

          ${renderOpPSDResumenProductosGrupo(g.items || [])}

          <div id="${factBoxId}" class="hidden op-inv-grid" style="margin-top:10px;">
            ${g.items.map(p => renderOpHomePSDMini(p)).join("")}
          </div>
        </div>
      </details>
    `;
  }).join("");
}

function renderOpHomePSDMini(p){
  const items = Array.isArray(p.items) ? p.items : [];
  const totalShip = items.reduce((a,x)=> a + Number(x.cantidad || 0), 0);
  const totalPend = items.reduce((a,x)=> a + Number(x.pendiente || 0), 0);

  const facturaNo = String(p.facturaNo || "").trim();
  const fecha = String(p.fecha || "").trim();
  const placa = String(p.placa || "").trim();
  const guard = String(p.creadoEn || "").trim();
  const lines = items.length;

  const title = facturaNo ? `Factura #${escapeHtml(facturaNo)}` : `Factura`;

  return `
    <div class="ticket ticket-invoice">
      <div class="inv-head">
        <div class="inv-main">
          <div class="inv-no">${title}</div>

          <div class="inv-meta">
            ${fecha ? `<span>📅 ${escapeHtml(fecha)}</span>` : ``}
            ${placa ? `<span>🚚 Placa ${escapeHtml(placa)}</span>` : ``}
            <span>📦 ${lines} línea${lines===1 ? "" : "s"}</span>
          </div>

          ${guard ? `<div class="inv-sub">Guardada: ${escapeHtml(guard)}</div>` : ``}
        </div>

        <div class="inv-totals">
          <div class="inv-totals-label">A enviar</div>
          <div class="inv-totals-qty">${fmtQty(totalShip)}</div>
          ${Number(totalPend||0) > 0 ? `<div class="inv-totals-pend">Pend.: ${fmtQty(totalPend)}</div>` : ``}
        </div>
      </div>

      <div class="inv-chips">
        ${p.motoristaNombre
          ? `<span class="chip chip-accent">🚚 ${escapeHtml(p.motoristaNombre)}</span>`
          : `<span class="chip chip-muted">Sin motorista</span>`}
      </div>

      ${renderOpPSDItemsTable(items)}

      <div class="inv-actions btn-row">
        <button type="button" class="secondary small" onclick="abrirSalidasOperadorEditarPendiente('${escSq(p.id)}')">✏️ Editar</button>
        <button type="button" class="danger small" onclick="eliminarSalidaPendienteDespachoUI('${escSq(p.id)}')">🗑️ Eliminar</button>
        <button type="button" class="small" onclick="despacharSalidaPendienteDespachoUI('${escSq(p.id)}')">🚚 Despachar</button>
      </div>
    </div>
  `;
}


function renderOpHomePend(list){
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) {
    return `<div class="muted">No hay facturas con productos pendientes.</div>`;
  }

  const html = arr.map(p => {
    const items = Array.isArray(p.items) ? p.items : [];
    const lineas = Number(p.totalLineas || items.length || 0);
    const unid = Number(p.totalUnidades || 0);
    const fecha = String((p.creadoAtISO || "").slice(0,10) || "");

    const sub = [
      fecha || "",
      `${lineas} líneas`,
      `${unid} unid.`
    ].filter(Boolean).join(" • ");

    const fno = String(p.facturaNo || "");

    return `
      <div class="op-mini">
        <div>
          <div class="t">Factura ${escapeHtml(fno)}</div>
          <div class="s">${escapeHtml(sub)}</div>
        </div>
        <div class="op-mini-actions">
          <button type="button" class="small" onclick="iniciarDespachoPendiente('${escSq(fno)}')">🚚</button>
          <button type="button" class="small secondary" onclick="abrirPendientesOperador()">📋</button>
        </div>
      </div>
    `;
  }).join("");

  return html;
}



/* ================= ADMIN: HOME COTIZACIONES ================= */
function abrirAdminCotizacionesHome(){
  adminHomeMode = "COTIZACIONES";
  headerTitle.textContent = "Cotizaciones";

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="abrirConsultaInventarioVendedor()">⬅ Volver a Inventario</button>

    <div class="card">
      <strong>⚙️ Administrador • Cotizaciones</strong>
      <div class="muted">Módulo igual al vendedor.</div>
    </div>

    <button type="button" onclick="abrirCotizacion()">🧾 Nueva Cotización</button>
    <button type="button" onclick="abrirClientes()">👤 Clientes</button>
    <button type="button" onclick="abrirConsultaInventarioVendedor()">📦 Consulta de inventario</button>
    <button type="button" class="secondary" onclick="abrirHistorialCotizaciones()">📑 Cotizaciones guardadas</button>
  `;
}

/* ================= COTIZACIONES UI ================= */
function abrirCotizacion(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
    <div class="card"><strong>⏳ Cargando productos...</strong></div>
  `;

  ensureCatalogoCargado()
    .then(() => {
      cotizacionEditMode = false;
      cotizacionActual = {
        id: Date.now(),
        fecha: nowStr(),
        clienteId: "",
        items: []
      };
      renderCotizacion();
    })
    .catch((err) => {
      console.error(err);
      contenido.innerHTML = `
        <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
        <div class="card">
          <strong>❌ No se pudo cargar el catálogo.</strong>
          <div class="muted">Revisa internet (los datos vienen desde GitHub).</div>
        </div>
      `;
    });
}

function getClienteSeleccionado(){
  return clientes.find(c => String(c.id) === String(cotizacionActual?.clienteId)) || null;
}

function volverDesdeCotizacion(){
  if (cotizacionEditMode) {
    abrirHistorialCotizaciones();
    return;
  }
  volverHome();
}

function renderCotizacion(){
  // ✅ aplicar restricciones de tipos de precio según rol
  sanitizeCotizacionPriceTypesForRole();
  const cliente = getClienteSeleccionado();

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🧾 Cotización</strong>
      <div class="item-meta">#${cotizacionActual.id} • ${escapeHtml(cotizacionActual.fecha)}</div>
      <div style="margin-top:8px;">
        <span class="badge">SOLO COTIZACIÓN • SIN VALIDEZ FISCAL</span>
        ${cotizacionEditMode ? `<div style="margin-top:8px;"><span class="badge">COTIZACIÓN EDITADA</span></div>` : ""}
      </div>
    </div>

    <div class="card">
      <strong>👤 Cliente</strong>
      <div class="item-meta">
        ${cliente
          ? `${escapeHtml(cliente.nombre || "Cliente sin nombre")}<br>
             ${cliente.empresa ? `🏢 ${escapeHtml(cliente.empresa)}<br>` : ""}
             ${cliente.telefono ? `📞 ${escapeHtml(cliente.telefono)}<br>` : ""}
             ${cliente.rtn ? `🧾 RTN: ${escapeHtml(cliente.rtn)}<br>` : ""}
             ${cliente.ubicacion ? `📍 ${escapeHtml(cliente.ubicacion)}` : ""}`
          : "Sin cliente seleccionado"
        }
      </div>
      <button type="button" class="secondary" onclick="abrirModalClientes()">Seleccionar / Cambiar cliente</button>
    </div>

    <button type="button" onclick="abrirModalProductos()">➕ Agregar producto</button>

    <div id="cotItemsWrap"></div>

    <div class="total-box">
      <span>Total</span>
      <span id="cotTotal">${moneyL(calcularTotal())}</span>
    </div>

    <div style="height:10px"></div>

    <button type="button" onclick="guardarCotizacion()">${cotizacionEditMode ? "💾 Guardar cambios" : "💾 Guardar cotización"}</button>
    <button type="button" class="secondary" onclick="generarPdfCotizacion()">📄 Generar PDF</button>
  `;

  renderItems();
}

function getUnitPrice(prod, item){
  if (!prod) return 0;

  if (item.priceType === "precioVendedor") {
    return Number(item.customPrice || 0);
  }

  const val = prod.precios?.[item.priceType];
  if (val !== undefined && val !== null) return Number(val || 0);

  return Number(prod.precios?.precio || 0);
}

function itemKey(item){
  const p = item.priceType || "precio";
  const manual = (p === "precioVendedor") ? Number(item.customPrice || 0).toFixed(2) : "";
  return `${item.codigo}__${p}__${manual}`;
}

function normalizeItems(){
  const map = new Map();
  const out = [];

  for (const it of cotizacionActual.items) {
    const key = itemKey(it);
    if (!map.has(key)) {
      map.set(key, { ...it });
      out.push(map.get(key));
    } else {
      map.get(key).qty += Number(it.qty || 0);
    }
  }
  cotizacionActual.items = out;
}

function calcularTotal(){
  if (!cotizacionActual) return 0;
  let total = 0;
  for (const it of cotizacionActual.items) {
    const prod = getProdByCodigo(it.codigo);
    const unit = getUnitPrice(prod, it);
    total += Number(it.qty || 0) * unit;
  }
  return total;
}

function renderItems(){
  const wrap = el("cotItemsWrap");
  if (!wrap) return;

  const allowedTypes = getAllowedPriceTypes(getRole());

  if (!cotizacionActual.items.length) {
    wrap.innerHTML = `<div class="card"><strong>No hay productos agregados.</strong></div>`;
    return;
  }

  wrap.innerHTML = cotizacionActual.items.map(it => {
    const prod = getProdByCodigo(it.codigo);
    const unit = getUnitPrice(prod, it);
    const sub = Number(it.qty || 0) * unit;

    const options = allowedTypes.map(t => {
      const sel = it.priceType === t ? "selected" : "";
      return `<option value="${t}" ${sel}>${PRICE_LABELS[t]}</option>`;
    }).join("");

    const manualInput = (it.priceType === "precioVendedor" && allowedTypes.includes("precioVendedor"))
      ? `<input class="qty" type="number" step="0.01" min="0"
           value="${Number(it.customPrice || 0)}"
           onchange="setItemCustomPrice('${it.id}', this.value)" />`
      : "";

    return `
      <div class="item-row">
        <div class="item-top">
          <div>
            <div class="item-name">${escapeHtml(prod?.producto || it.codigo)}</div>
            <div class="item-meta">
              Código: ${escapeHtml(it.codigo)} • Stock disponible: ${prod ? stockDisponibleTotal(prod) : "?"}<br>
              Tipo: <b>${PRICE_LABELS[it.priceType] || it.priceType}</b> • P.Unit: <b>${moneyL(unit)}</b>
            </div>
          </div>
          <div style="font-weight:900">${moneyL(sub)}</div>
        </div>

        <div class="item-controls">
          <button type="button" class="inline secondary" onclick="decQty('${it.id}')">-</button>
          <input class="qty" type="number" min="1" value="${Number(it.qty || 1)}"
                 onchange="setQty('${it.id}', this.value)" />
          <button type="button" class="inline secondary" onclick="incQty('${it.id}')">+</button>

          <select class="inline" onchange="setPriceType('${it.id}', this.value)">
            ${options}
          </select>

          ${manualInput}

          <button type="button" class="inline danger" onclick="removeItem('${it.id}')">✖</button>
        </div>
      </div>
    `;
  }).join("");

  const totalEl = el("cotTotal");
  if (totalEl) totalEl.textContent = moneyL(calcularTotal());
}

function findItemById(id){
  return cotizacionActual.items.find(x => String(x.id) === String(id));
}

function incQty(id){
  const it = findItemById(id);
  if (!it) return;
  it.qty = Number(it.qty || 1) + 1;
  syncLinkedPairForItem(it);
  renderItems();
}

function decQty(id){
  const it = findItemById(id);
  if (!it) return;
  it.qty = Math.max(1, Number(it.qty || 1) - 1);
  syncLinkedPairForItem(it);
  renderItems();
}

function setQty(id, val){
  const it = findItemById(id);
  if (!it) return;
  it.qty = Math.max(1, Number(val || 1));
  syncLinkedPairForItem(it);
  renderItems();
}

function setPriceType(id, type){
  const it = findItemById(id);
  if (!it) return;
  const allowed = getAllowedPriceTypes(getRole());
  if (!allowed.includes(type)) {
    type = allowed.includes("precio") ? "precio" : (allowed[0] || "precio");
  }
  it.priceType = type;
  if (type !== "precioVendedor") {
    it.customPrice = 0;
  } else {
    if (it.customPrice === undefined || it.customPrice === null) it.customPrice = 0;
  }

  normalizeItems();
  renderCotizacion();
}

function setItemCustomPrice(id, val){
  const it = findItemById(id);
  if (!it) return;
  it.customPrice = Number(val || 0);

  normalizeItems();
  renderCotizacion();
}

function removeItem(id){
  const it = findItemById(id);
  if (!it) return;

  const code = normCode(it.codigo);
  const pair = getLinkedCode(code);

  if (pair) {
    cotizacionActual.items = cotizacionActual.items.filter(x => {
      const c = normCode(x.codigo);
      return c !== code && c !== pair;
    });
    showToast(`🗑️ También se eliminó ${pair}.`);
  } else {
    cotizacionActual.items = cotizacionActual.items.filter(x => String(x.id) !== String(id));
  }

  renderCotizacion();
}

/* ================= MODAL CLIENTES (cotización) ================= */
function abrirModalClientes(){
  el("buscarClienteModal").value = "";
  renderClientesModal();
  openModal("modalClientes");
  setTimeout(() => el("buscarClienteModal").focus(), 50);
}

function cerrarModalClientes(){
  closeModal("modalClientes");
}

function renderClientesModal(){
  const q = (el("buscarClienteModal").value || "").toLowerCase().trim();
  const cont = el("listaClientesModal");

  const filtrados = clientes.filter(c => {
    const nombre = (c.nombre || "").toLowerCase();
    const empresa = (c.empresa || "").toLowerCase();
    return nombre.includes(q) || empresa.includes(q);
  });

  cont.innerHTML = filtrados.length ? filtrados.map(c => `
    <div class="list-item" onclick="seleccionarClienteCot('${c.id}')">
      <div class="list-title">${escapeHtml(c.nombre || "Cliente sin nombre")}</div>
      <div class="list-sub">${c.empresa ? "🏢 " + escapeHtml(c.empresa) : ""} ${c.telefono ? " • 📞 " + escapeHtml(c.telefono) : ""}</div>
    </div>
  `).join("") : `<div class="list-item"><div class="list-title">No hay coincidencias</div></div>`;
}

const buscarClienteModal = el("buscarClienteModal");
if (buscarClienteModal) buscarClienteModal.addEventListener("input", renderClientesModal);

function seleccionarClienteCot(id){
  cotizacionActual.clienteId = id;
  cerrarModalClientes();
  renderCotizacion();
}

// Origen del modal de nuevo cliente: "cot" (desde cotización) o "home" (desde HOME del vendedor)
let nuevoClienteModalOrigin = "cot";

function abrirModalNuevoClienteDesdeCot(){
  nuevoClienteModalOrigin = "cot";
  cerrarModalClientes();

  el("ncNombre").value = "";
  el("ncEmpresa").value = "";
  el("ncTelefono").value = "";
  el("ncRTN").value = "";
  el("ncUbicacion").value = "";

  openModal("modalNuevoCliente");
  setTimeout(() => el("ncNombre").focus(), 50);
}

// Desde el HOME del vendedor (barra inferior "Clientes")
function abrirModalNuevoClienteDesdeHome(){
  nuevoClienteModalOrigin = "home";

  el("ncNombre").value = "";
  el("ncEmpresa").value = "";
  el("ncTelefono").value = "";
  el("ncRTN").value = "";
  el("ncUbicacion").value = "";

  openModal("modalNuevoCliente");
  setTimeout(() => el("ncNombre").focus(), 50);
}

function cerrarModalNuevoCliente(){
  closeModal("modalNuevoCliente");
}

function guardarNuevoClienteModal(){
  const nuevo = {
    id: Date.now(),
    nombre: el("ncNombre").value || "",
    empresa: el("ncEmpresa").value || "",
    telefono: el("ncTelefono").value || "",
    rtn: el("ncRTN").value || "",
    ubicacion: el("ncUbicacion").value || ""
  };

  clientes.push(nuevo);
  localStorage.setItem("clientes", JSON.stringify(clientes));

  // Si se abrió desde una cotización, seleccionarlo y volver a la cotización
  if (nuevoClienteModalOrigin === "cot") {
    cotizacionActual.clienteId = nuevo.id;
    cerrarModalNuevoCliente();
    renderCotizacion();
    return;
  }

  // Si se abrió desde el HOME, solo guardamos y refrescamos el HOME
  cerrarModalNuevoCliente();
  try { renderVendedorHomeDashboard(true); } catch {}
}

/* ================= MODAL PRODUCTOS + MODAL AGREGAR PRODUCTO ================= */
function abrirModalProductos(){
  el("buscarProductoModal").value = "";
  renderProductosModal();
  openModal("modalProductos");
  setTimeout(() => el("buscarProductoModal").focus(), 50);
}

function cerrarModalProductos(){
  closeModal("modalProductos");
}


/* ================= MODAL BARCODE (ALIAS) ================= */
let __barcodeHandled = false;
let __barcodeAllowNew = false;
let __barcodeLookupFn = null;
let __barcodeLastAlias = "";
let __barcodePromptQty = false;
let __barcodePendingProd = null;


function _setBarcodeStatus(html, show = true){
  const st = el("barcodeStatus");
  if (!st) return;
  if (!show) {
    st.classList.add("hidden");
    st.innerHTML = "";
    return;
  }
  st.classList.remove("hidden");
  st.innerHTML = html;
}

function _barcodeToggleConfirm(show){
  const wrap = el("barcodeConfirm");
  const qty = el("barcodeQty");
  const input = el("barcodeInput");

  if (wrap) {
    if (show) wrap.classList.remove("hidden");
    else wrap.classList.add("hidden");
  }

  if (input) input.disabled = !!show;

  if (show) {
    if (qty) {
      if (!qty.value) qty.value = 1;
      setTimeout(() => { try { qty.focus(); qty.select?.(); } catch {} }, 50);
    }
  } else {
    if (qty) qty.value = "";
    if (input) {
      input.value = "";
      setTimeout(() => { try { input.focus(); } catch {} }, 50);
    }
  }
}

function abrirModalBarcode(titulo = "Buscar por código de barras", subtitulo = "Escribe o escanea el código de barras (ALIAS).", onFoundOrOpts = null){
  __barcodeHandled = false;

  const t = el("barcodeTitle");
  const s = el("barcodeSub");
  if (t) t.textContent = titulo;
  if (s) s.textContent = subtitulo;

  const input = el("barcodeInput");
  if (input) input.value = "";

  // reset
__barcodeAllowNew = false;
__barcodeLookupFn = null;
__barcodeLastAlias = "";
__barcodePromptQty = false;
__barcodePendingProd = null;
window.__barcodeOnNewAlias = null;
try { _barcodeToggleConfirm(false); } catch {}
try { el("barcodeInput")?.removeAttribute("disabled"); } catch {}

// resolver callback/opciones
let onFound = null;
if (typeof onFoundOrOpts === "function") {
  onFound = onFoundOrOpts;
} else if (onFoundOrOpts && typeof onFoundOrOpts === "object") {
  onFound = (typeof onFoundOrOpts.onFound === "function") ? onFoundOrOpts.onFound : null;
  __barcodeAllowNew = !!onFoundOrOpts.allowNewAlias;
  __barcodeLookupFn = (typeof onFoundOrOpts.lookupFn === "function") ? onFoundOrOpts.lookupFn : null;
  __barcodePromptQty = !!onFoundOrOpts.promptQty;
  window.__barcodeOnNewAlias = (typeof onFoundOrOpts.onNewAlias === "function") ? onFoundOrOpts.onNewAlias : null;
}

// guardar callback
window.__barcodeOnFound = (typeof onFound === "function") ? onFound : null;

  _setBarcodeStatus("", false);
  openModal("modalBarcode");
  setTimeout(() => el("barcodeInput")?.focus(), 50);
}

function cerrarModalBarcode(){
  window.__barcodeOnFound = null;
  window.__barcodeOnNewAlias = null;
  __barcodeAllowNew = false;
  __barcodeLookupFn = null;
  __barcodeLastAlias = "";
  __barcodePromptQty = false;
  __barcodePendingProd = null;
  try { _barcodeToggleConfirm(false); } catch {}
  try { el("barcodeInput")?.removeAttribute("disabled"); } catch {}
  closeModal("modalBarcode");
}

async function abrirBarcodeVendedor(){
  try { await ensureCatalogoCargado(); } catch {}
  abrirModalBarcode(
    "Agregar por código de barras",
    "Escribe o escanea el código de barras (ALIAS). Al encontrarlo, se abre el modal de cantidad/precio.",
    (prod) => {
      try { cerrarModalBarcode(); } catch {}
      try { cerrarModalProductos(); } catch {}
      abrirModalAgregarProducto(prod.codigo);
      setTimeout(() => el("apCantidad")?.focus(), 60);
    }
  );
}

async function abrirBarcodeOperador(){
  // desde el modal de búsqueda del operador (entradas/salidas/traslado/conteo)
  try { await ensureCatalogoCargado(); } catch {}
  abrirModalBarcode(
    "Buscar por barras (Operador)",
    "Escribe o escanea el código de barras (ALIAS). Al encontrarlo, se selecciona el producto automáticamente.",
    (prod) => {
      try { cerrarModalBarcode(); } catch {}
      try { seleccionarProductoOperador(prod.codigo); } catch {}
    }
  );
}

async function abrirBarcodeAddMov(){
  // desde el modal rápido "Agregar producto" (Operador)
  try { await ensureCatalogoCargado(); } catch {}

  const isConteo = String(addMovTipo || "").toUpperCase() === "CONTEO";
  const quick = isConteo && isConteoQuickEnabled();

  // ⚡ CONTEO rápido: escaneo continuo (no pide cantidad, no cierra el modal de barras)
  if (quick) {
    const fixedQty = getConteoQuickQty();
    abrirModalBarcode(
      "Conteo rápido por barras",
      `Escanea el código de barras (ALIAS). Se agregará automáticamente al conteo con cantidad ${fixedQty}. (Esc para salir)`,
      (prod) => {
        try {
          if (!conteoDoc) {
            try { showToast("No hay conteo activo"); } catch {}
          } else {
            const qty = getConteoQuickQty();
            addOrSumMovItem(conteoDoc.items, prod.codigo, prod.producto || "", qty, { setAgregadoTs: true });
            renderFilasConteo();
            actualizarPreviewConteo();
            try { showToast(`Agregado: ${qty} x ${prod.producto || prod.codigo}`); } catch {}
          }
        } catch {}

        // Preparar para el siguiente escaneo
        try { __barcodePendingProd = null; } catch {}
        try { __barcodeHandled = false; } catch {}

        setTimeout(() => {
          try { if (el("barcodeInput")) el("barcodeInput").value = ""; } catch {}
          try { __barcodeLastAlias = ""; } catch {}
          try { _setBarcodeStatus("", false); } catch {}
          try { el("barcodeInput")?.focus(); } catch {}
        }, 180);
      }
    );
    return;
  }

  abrirModalBarcode(
    "Agregar por barras",
    "Escribe o escanea el código de barras (ALIAS). Al encontrarlo, se llenará el producto y podrás ingresar la cantidad.",
    (prod) => {
      try { cerrarModalBarcode(); } catch {}
      const codeEl = el("addMovCodigo");
      const prodEl = el("addMovProducto");
      if (codeEl) codeEl.value = prod.codigo;
      if (prodEl) prodEl.value = prod.producto || "";
      const sug = el("addMovSug");
      if (sug) sug.innerHTML = "";
      setTimeout(() => el("addMovQty")?.focus(), 60);
    }
  );
}

function onBarcodeInput(val){
  if (__barcodeHandled) return;

  const alias = normalizeAlias(val);
  if (!alias) {
    _setBarcodeStatus("", false);
    return;
  }

  __barcodeLastAlias = alias;

  const prod = (__barcodeLookupFn ? __barcodeLookupFn(alias) : getProdByAlias(alias));

  // Mostrar feedback (cuando ya hay varios dígitos)
  if (!prod) {
    if (alias.length >= 6) {
      _setBarcodeStatus(
        `<b>No encontrado</b><div class="muted" style="margin-top:4px;">ALIAS: ${escapeHtml(alias)}</div>`
        + (__barcodeAllowNew ? `<div style="margin-top:8px;"><button type="button" class="secondary small" onclick="barcodeAgregarAlias()">➕ Agregar alias nuevo</button></div>` : ``),
        true
      );
    } else {
      _setBarcodeStatus("", false);
    }
    return;
  }

  _setBarcodeStatus(
    `<b>${escapeHtml(prod.producto || "Producto")}</b>
     <div class="muted" style="margin-top:4px;">Código: <b>${escapeHtml(prod.codigo)}</b>${prod.alias ? ` • Barras: <b>${escapeHtml(prod.alias)}</b>` : ""}</div>`,
    true
  );

  // Si este flujo requiere confirmar cantidad (ej: Recepción)
  if (__barcodePromptQty) {
    __barcodePendingProd = prod;
    __barcodeHandled = true;
    try { el("barcodeQty") && (el("barcodeQty").value = 1); } catch {}
    try { _barcodeToggleConfirm(true); } catch {}
    return;
  }

  __barcodeHandled = true;
  setTimeout(() => {
    try {
      const fn = window.__barcodeOnFound;
      if (typeof fn === "function") fn(prod);
    } catch {}
  }, 120);
}

const barcodeInput = el("barcodeInput");
if (barcodeInput) {
  barcodeInput.addEventListener("input", (e) => onBarcodeInput(e.target.value));

  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      try { cerrarModalBarcode(); } catch (err) {}
      return;
    }

    // ✅ Para lector físico: muchos lectores envían Enter al final
    if (e.key === "Enter") {
      e.preventDefault();
      onBarcodeInput(e.target.value);
    }
  });
}

const barcodeQty = el("barcodeQty");
if (barcodeQty) {
  barcodeQty.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      try { barcodeCancelarCantidad(); } catch {}
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      try { barcodeAceptarCantidad(); } catch {}
      return;
    }
  });
}

function barcodeAceptarCantidad(){
  if (!__barcodePendingProd) return;

  const qtyEl = el("barcodeQty");
  let qty = Number(qtyEl ? qtyEl.value : 0);
  if (!isFinite(qty) || qty <= 0) {
    try { showToast("Ingresa una cantidad válida"); } catch {}
    try { qtyEl?.focus(); } catch {}
    return;
  }

  // Ejecutar callback con (prod, qty)
  try {
    const fn = window.__barcodeOnFound;
    if (typeof fn === "function") fn(__barcodePendingProd, qty);
  } catch {}

  // Preparar para siguiente escaneo
  __barcodePendingProd = null;
  __barcodeHandled = false;

  // dejar visible el status del último producto, pero volver a modo escaneo
  try { _barcodeToggleConfirm(false); } catch {}
  try { el("barcodeInput")?.removeAttribute("disabled"); } catch {}
}

function barcodeCancelarCantidad(){
  __barcodePendingProd = null;
  __barcodeHandled = false;
  try { _barcodeToggleConfirm(false); } catch {}
  try { el("barcodeInput")?.removeAttribute("disabled"); } catch {}
  try { _setBarcodeStatus("", false); } catch {}
}







function barcodeAgregarAlias(){
  const alias = __barcodeLastAlias || normalizeAlias(el("barcodeInput")?.value || "");
  if (!alias) return;

  try { cerrarModalBarcode(); } catch {}

  try {
    const fn = window.__barcodeOnNewAlias;
    if (typeof fn === "function") {
      fn(alias);
      return;
    }
  } catch {}

  // fallback: si existe el modal de recepción
  try { abrirModalRecepNuevoProd(alias); } catch {}
}

function renderProductosModal(){
  const q = (el("buscarProductoModal").value || "").toLowerCase().trim();
  const cont = el("listaProductosModal");

  if (!q) {
    cont.innerHTML = `
      <div class="card">
        <strong>Escribe para buscar productos…</strong>
        <div class="muted">Ej: “clavo”, “01-0002”, “7453078507354”</div>
      </div>
    `;
    return;
  }

  const encontrados = catalogo
    .filter(p =>
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.producto || "").toLowerCase().includes(q) ||
      (String(p.alias || "")).toLowerCase().includes(q)
    )
    .slice(0, 40);

  cont.innerHTML = encontrados.length ? encontrados.map(p => {
    const total = stockDisponibleTotal(p);

    return `
      <div class="ticket clickable" onclick="abrirModalAgregarProducto('${p.codigo}')">
        <div class="ticket-top">
          <div>
            <div class="ticket-title">${escapeHtml(p.producto || "—")}</div>
            <div class="ticket-sub">Código: <b>${escapeHtml(p.codigo)}</b>${p.alias ? ` • Barras: <b>${escapeHtml(p.alias)}</b>` : ""}</div>
          </div>
          <div class="ticket-total">Total: ${total}</div>
        </div>

        <div class="ticket-stocks">
          <span class="pill pill-p">Principal: ${Number(p.stockP || 0)}</span>
          <span class="pill pill-a">Anexo: ${Number(p.stockA || 0)}</span>
          <span class="pill pill-t">Tienda: ${Number(p.stockT || 0)}</span>
        </div>
      </div>
    `;
  }).join("") : `
    <div class="card"><strong>No hay resultados</strong></div>
  `;
}


const buscarProductoModal = el("buscarProductoModal");
if (buscarProductoModal) buscarProductoModal.addEventListener("input", renderProductosModal);

function abrirModalAgregarProducto(codigo){
  const prod = getProdByCodigo(codigo);
  if (!prod) return;

  cerrarModalProductos();

  selectedProductCode = codigo;

  const allowedTypes = getAllowedPriceTypes(getRole());

  el("apTitulo").textContent = prod.producto;
  el("apSub").textContent = `Código: ${prod.codigo} • P:${Number(prod.stockP||0)} A:${Number(prod.stockA||0)} T:${Number(prod.stockT||0)} • Total: ${stockDisponibleTotal(prod)}`;

  const preciosHtml = allowedTypes
    .filter(t => t !== "precioVendedor")
    .map(t => {
      const v = prod.precios?.[t];
      const val = (v === undefined || v === null) ? "N/D" : moneyL(v);
      return `<div class="k">${PRICE_LABELS[t]}</div><div class="v">${val}</div>`;
    }).join("");

  el("apListaPrecios").innerHTML = preciosHtml + (allowedTypes.includes("precioVendedor") ? `
    <div class="k">${PRICE_LABELS.precioVendedor}</div><div class="v">Manual</div>
  ` : "");

  el("apCantidad").value = 1;

  el("apTipoPrecio").innerHTML = allowedTypes.map(t => {
    if (t === "precioVendedor") {
      return `<option value="${t}">${PRICE_LABELS[t]} (manual)</option>`;
    }
    const v = prod.precios?.[t];
    const val = (v === undefined || v === null) ? "N/D" : moneyL(v);
    return `<option value="${t}">${PRICE_LABELS[t]} • ${val}</option>`;
  }).join("");

  const defaultType = allowedTypes.includes("precio") ? "precio" : (allowedTypes[0] || "precio");
  el("apTipoPrecio").value = defaultType;

  if (defaultType === "precioVendedor" && allowedTypes.includes("precioVendedor")) {
    el("apPrecioManualWrap").classList.remove("hidden");
  } else {
    el("apPrecioManualWrap").classList.add("hidden");
  }
  el("apPrecioManual").value = "";

  openModal("modalAgregarProducto");
}

function precioMinimoPermitido(prod) {
  if (!prod || !prod.admin) return 0;
  return Number(prod.admin.limite || 0);
}

function cerrarModalAgregarProducto(){
  closeModal("modalAgregarProducto");
  selectedProductCode = null;
}

function mostrarModalErrorPrecio(minimo){
  el("errorMensaje").textContent = "El precio ingresado es menor al costo permitido.";
  el("errorMinimo").textContent = `Precio mínimo: ${moneyL(minimo)}`;
  openModal("modalErrorPrecio");
}

function cerrarModalErrorPrecio(){
  closeModal("modalErrorPrecio");
}

const apTipoPrecio = el("apTipoPrecio");
if (apTipoPrecio) {
  apTipoPrecio.addEventListener("change", () => {
    const type = el("apTipoPrecio").value;
    const allowed = getAllowedPriceTypes(getRole());
    if (type === "precioVendedor" && allowed.includes("precioVendedor")) {
      el("apPrecioManualWrap").classList.remove("hidden");
      setTimeout(() => el("apPrecioManual").focus(), 50);
    } else {
      el("apPrecioManualWrap").classList.add("hidden");
    }
  });
}

function confirmarAgregarProducto(){
  const prod = getProdByCodigo(selectedProductCode);
  if (!prod) return;

  const qty = Math.max(1, Number(el("apCantidad").value || 1));
  const priceType = el("apTipoPrecio").value;
  let customPrice = 0;

  const allowedTypes = getAllowedPriceTypes(getRole());
  if (!allowedTypes.includes(priceType)) {
    alert("Tipo de precio no permitido para este usuario.");
    return;
  }

  if (priceType === "precioVendedor") {
    customPrice = Number(el("apPrecioManual")?.value || 0);

    if (customPrice <= 0) {
      alert("Ingresa un precio valido.");
      return;
    }

    const minimo = precioMinimoPermitido(prod);

    if (minimo > 0 && customPrice < minimo) {
      mostrarModalErrorPrecio(minimo);
      return;
    }
  }

  addItem(prod.codigo, qty, priceType, customPrice);

  cerrarModalAgregarProducto();
  renderCotizacion();
}

function addItem(codigo, qty, priceType, customPrice){
  if (!cotizacionActual || !Array.isArray(cotizacionActual.items)) return null;

  const c = normCode(codigo);
  const q = Math.max(1, Number(qty || 1));
  const p = String(priceType || "precio");
  const cp = Number(customPrice || 0);

  // Agregar / acumular el producto principal
  let main = findMatchingItem(c, p, cp);
  if (main) {
    main.qty = Math.max(1, Number(main.qty || 1)) + q;
  } else {
    main = {
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo: c,
      qty: q,
      priceType: p,
      customPrice: cp
    };
    cotizacionActual.items.push(main);
  }

  // Si el código está vinculado, asegurar que el par exista y quede con la misma cantidad
  syncLinkedPairForItem(main);

  return main;
}

/* ================= GUARDAR COTIZACIÓN ================= */
function buildCotizacionSnapshot(){
  const cliente = getClienteSeleccionado();

  const items = cotizacionActual.items.map(it => {
    const prod = getProdByCodigo(it.codigo);
    const unit = getUnitPrice(prod, it);
    const qty = Number(it.qty || 0);
    return {
      codigo: it.codigo,
      producto: prod?.producto || "",
      cantidad: qty,
      tipoPrecio: it.priceType,
      tipoPrecioLabel: PRICE_LABELS[it.priceType] || it.priceType,
      precioUnitario: unit,
      subtotal: qty * unit
    };
  });

  const total = items.reduce((acc, x) => acc + Number(x.subtotal || 0), 0);

  return {
    id: cotizacionActual.id,
    fecha: cotizacionActual.fecha,
    vendedor: nombreVendedor || "",
    cliente: cliente ? {
      nombre: cliente.nombre || "",
      empresa: cliente.empresa || "",
      telefono: cliente.telefono || "",
      rtn: cliente.rtn || "",
      ubicacion: cliente.ubicacion || ""
    } : null,
    items,
    total,
    editada: !!cotizacionEditMode,
    editadaEn: cotizacionEditMode ? nowStr() : "",
    disclaimer: "ESTE DOCUMENTO ES SOLO UNA COTIZACIÓN Y NO TIENE VALIDEZ FISCAL"
  };
}


/* ================= COTIZACIONES: UPSERT (evita duplicados) ================= */
function upsertCotizacionSnapshot(snap, opts = {}){
  const silent = !!opts.silent;

  if (!snap || !snap.id) return;

  cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");

  const idx = cotizaciones.findIndex(c => String(c.id) === String(snap.id));

  if (idx >= 0) {
    const prev = cotizaciones[idx] || {};
    const merged = { ...prev, ...snap };

    // mantener editada si ya lo estaba
    merged.editada = !!(prev.editada || snap.editada);

    if (merged.editada) {
      merged.editadaEn = snap.editadaEn || prev.editadaEn || nowStr();
    }

    cotizaciones[idx] = merged;
  } else {
    cotizaciones.unshift(snap);
  }

  localStorage.setItem("cotizaciones", JSON.stringify(cotizaciones));

  if (!silent) {
    uiAlert("✅ Cotización guardada localmente.", { title: "Guardado", icon: "✅" });
  }
}


function guardarCotizacion(skipNameCheck = false){
  if (!skipNameCheck) {
    if (!ensureNombreVendedor({ type: "guardar" })) return;
  }

  if (!cotizacionActual.items.length) {
    alert("Agrega al menos un producto.");
    return;
  }

  const snap = buildCotizacionSnapshot();
  upsertCotizacionSnapshot(snap);
}

/* ================= PDF ================= */
function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function getLogoDataUrl(){
  if (logoDataUrlCache) return logoDataUrlCache;
  const res = await fetch(URLS.logo, { cache: "force-cache" });
  const blob = await res.blob();
  logoDataUrlCache = await blobToDataURL(blob);
  return logoDataUrlCache;
}

function setLastFile(blob, filename, title, text, mime){
  if (lastFile.url) URL.revokeObjectURL(lastFile.url);
  lastFile.blob = blob;
  lastFile.url = URL.createObjectURL(blob);
  lastFile.filename = filename;
  lastFile.mime = (typeof mime === "string" && mime) ? mime : (String(filename||"").toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf");
  lastFile.title = title || "";
  lastFile.text = text || "";
}

function generarPdfCotizacion(skipNameCheck = false){
  if (!skipNameCheck) {
    if (!ensureNombreVendedor({ type: "pdf" })) return;
  }

  if (!cotizacionActual.items.length) {
    alert("Agrega productos primero.");
    return;
  }

  const cot = buildCotizacionSnapshot();
  crearPdfCotizacion(cot);
}

async function crearPdfCotizacion(cot){
  const pkg = window.jspdf || {};
  const jsPDF = pkg.jsPDF;
  const GState = pkg.GState;

  if (!jsPDF) {
    alert("No se encontró jsPDF. Revisa el script en index.html.");
    return;
  }

  const PAGE_W = 80;
  const PAGE_H = 297;
  const marginL = 4;
  const marginR = PAGE_W - 4;
  const lineH = 4.2;
  const bottomReserve = 24;

  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, PAGE_H] });

  const logoDataUrl = await getLogoDataUrl().catch(() => null);

  let y = 6;
  let page = 1;

  function watermark(){
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);

    try {
      if (GState) doc.setGState(new GState({ opacity: 0.12 }));
    } catch {}

    doc.text("SOLO COTIZACIÓN", 40, 140, { align: "center", angle: 45 });

    // ✅ Si fue editada, agregar segunda marca de agua
    if (cot && cot.editada) {
      doc.setFontSize(14);
      doc.text("COTIZACIÓN EDITADA", 40, 160, { align: "center", angle: 45 });
      doc.setFontSize(18);
    }

    try {
      if (GState) doc.setGState(new GState({ opacity: 1 }));
    } catch {}

    doc.setTextColor(31, 41, 55);
  }

  function header(isFirst){
    watermark();

    if (isFirst && logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 30, y, 20, 18);
      y += 22;
    }

    doc.setTextColor(36, 58, 143);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FERRETERÍA UNIVERSAL", 40, y, { align: "center" });
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(`RTN: ${EMPRESA_RTN}`, 40, y, { align: "center" });
    y += 5;

    doc.setTextColor(31, 41, 55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`COTIZACIÓN #${cot.id}${!isFirst ? " (CONT.)" : ""}`, 40, y, { align: "center" });
    y += 5;

    doc.text(`Fecha: ${cot.fecha}`, marginL, y); y += 4.5;
    doc.text(`Vendedor: ${cot.vendedor}`, marginL, y); y += 4.5;

    doc.setDrawColor(229, 231, 235);
    doc.line(marginL, y, marginR, y);
    y += 6;
  }

  function newPage(){
    doc.addPage([PAGE_W, PAGE_H]);
    page += 1;
    y = 6;
    header(false);
  }

  function ensureSpace(mmNeeded){
    if (y + mmNeeded > PAGE_H - bottomReserve) {
      newPage();
    }
  }

  header(true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(36, 58, 143);
  doc.text("DATOS DEL CLIENTE", marginL, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);

  const c = cot.cliente || {};
  const clienteLines = [
    `Nombre: ${c.nombre || "—"}`,
    `Empresa: ${c.empresa || "—"}`,
    `Teléfono: ${c.telefono || "—"}`,
    `RTN: ${c.rtn || "—"}`,
    `Ubicación: ${c.ubicacion || "—"}`
  ];

  ensureSpace(clienteLines.length * lineH + 6);

  clienteLines.forEach(line => {
    doc.text(line, marginL, y);
    y += lineH;
  });

  y += 2;
  doc.setDrawColor(229, 231, 235);
  doc.line(marginL, y, marginR, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(36, 58, 143);
  doc.text("DETALLE", marginL, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(31, 41, 55);

  for (const it of cot.items) {
    const name = it.producto || "";
    const nameLines = doc.splitTextToSize(name, 72);

    const mmNeeded = (1 + nameLines.length + 1 + 1) * lineH + 6;
    ensureSpace(mmNeeded);

    const letraPrecio = PRICE_CODE_LETTER[it.tipoPrecio] || "";
    const codigoConTipo = `${it.codigo}-${letraPrecio}`;

    doc.setFont("Helvetica", "bold");
    doc.text(`${it.cantidad} x ${codigoConTipo}`, marginL, y);
    y += lineH;

    doc.text(`${moneyL(it.subtotal)}`, marginR, y, { align: "right" });
    y += lineH;

    doc.setFont("helvetica", "normal");
    doc.text(nameLines, marginL, y);
    y += nameLines.length * lineH;

    doc.setTextColor(31, 41, 55);
    doc.text(`P.Unit: ${moneyL(it.precioUnitario)}`, marginL, y);
    doc.text(`Subt: ${moneyL(it.subtotal)}`, marginR, y, { align: "right" });
    y += lineH + 2;

    doc.setDrawColor(229, 231, 235);
    doc.line(marginL, y, marginR, y);
    y += 5;
  }

  ensureSpace(18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(36, 58, 143);
  doc.text(`TOTAL: ${moneyL(cot.total)}`, marginR, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const legalLines = doc.splitTextToSize(cot.disclaimer, 72);
  doc.text(legalLines, 40, y, { align: "center" });

  const blob = doc.output("blob");

  // ✅ Guardar automáticamente la cotización al generar el PDF (sin duplicar)
  try {
    upsertCotizacionSnapshot(cot, { silent: true });
  } catch (e) {
    console.warn("No se pudo auto-guardar la cotización:", e);
  }

  setLastFile(blob, `cotizacion-${cot.id}.pdf`, "Cotización - Ferretería Universal", "Cotización (sin validez fiscal)");

  mostrarPdfPreview();
}

async function enviarPdfAAndroidParaCompartir(blob, filename) {
  if (!window.Android || !window.Android.guardarPdfBase64) {
    alert("Compartir no disponible en este dispositivo");
    return;
  }

  const reader = new FileReader();
  reader.onloadend = function () {
    const base64data = reader.result.split(",")[1];
    window.Android.guardarPdfBase64(base64data, filename);
  };
  reader.readAsDataURL(blob);
}


function mostrarArchivoGenerado(titulo = "Archivo generado", detalle = ""){
  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📦 ${escapeHtml(titulo)}</strong>
      <div class="muted">${escapeHtml(detalle || "")}</div>
      <div class="item-meta" style="margin-top:6px;"><b>${escapeHtml(lastFile.filename || "")}</b></div>
    </div>

    <button type="button" onclick="compartirArchivo()">📤 Compartir (WhatsApp, Gmail, etc.)</button>
    <button type="button" class="secondary" onclick="descargarArchivo()">⬇ Descargar en el teléfono</button>
  `;
}

function mostrarPdfPreview(){
  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="renderCotizacion()">⬅ Volver</button>

    <div class="card">
      <strong>📄 PDF generado</strong>
      <div class="muted">
        Si el teléfono no muestra el PDF aquí, usa <b>Compartir</b> o <b>Descargar</b>.
      </div>
    </div>

    <div class="pdf-box">
      <iframe class="pdf-viewer" src="${lastFile.url}"></iframe>
    </div>

    <button type="button" onclick="compartirArchivo()">📤 Compartir (WhatsApp, Gmail, etc.)</button>
    <button type="button" class="secondary" onclick="descargarArchivo()">⬇ Descargar en el teléfono</button>
  `;
}

function compartirArchivo() {
  if (!lastFile || !lastFile.blob) {
    alert("No hay archivo para compartir");
    return;
  }

  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    enviarPdfAAndroidParaCompartir(lastFile.blob, lastFile.filename);
    return;
  }

  window.open(lastFile.url, "_blank");
}

function descargarArchivo() {
  if (!lastFile || !lastFile.blob) {
    alert("No hay archivo para descargar");
    return;
  }

  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    enviarPdfAAndroidParaCompartir(lastFile.blob, lastFile.filename);
    return;
  }

  const a = document.createElement("a");
  a.href = lastFile.url;
  a.download = lastFile.filename;
  a.click();
}

/* ================= HISTORIAL ================= */
// ✅ Ya no usamos la pantalla vieja de "Cotizaciones guardadas".
// Ahora todo se muestra directamente en el HOME del VENDEDOR.
function abrirHistorialCotizaciones(){
  const role = localStorage.getItem("role");
  if (isVendedorRole(role)) {
    // Forzar a HOME y mostrar la vista de guardadas
    localStorage.setItem("venHomeSummaryMode", "saved");
    volverHome();
    // scroll suave al resumen
    setTimeout(() => {
      if (typeof venHomeSelect === "function") venHomeSelect("saved", { scroll: true, silent: true });
    }, 0);
    return;
  }

  // Fallback (por si algún otro rol lo usa)
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  if (!cotizaciones.length) {
    contenido.innerHTML = `
      <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
      <div class="card"><strong>No hay cotizaciones guardadas.</strong></div>
    `;
    return;
  }

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
    <div class="card">
      <strong>📑 Cotizaciones guardadas</strong>
      <div class="muted">Guardadas localmente en este teléfono.</div>
    </div>

    ${cotizaciones.slice(0, 80).map(c => `
      <div class="card">
        <strong>🧾 #${c.id} • ${moneyL(c.total)}</strong>
        <div class="item-meta">
          ${escapeHtml(c.fecha)}<br>
          ${c.cliente?.nombre ? `Cliente: ${escapeHtml(c.cliente.nombre)}` : "Sin cliente"}${c.editada ? "<br><span class=\"badge\">EDITADA</span>" : ""}
        </div>
        <div class="btn-row">
          <button type="button" class="secondary" onclick="editarCotizacionGuardada(${c.id})">✏️ Editar</button>
          <button type="button" onclick="generarPdfDesdeGuardada(${c.id})">📄 Generar PDF</button>
        </div>
      </div>
    `).join("")}
  `;
}


async function editarCotizacionGuardada(id){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="abrirHistorialCotizaciones()">⬅ Volver</button>
    <div class="card"><strong>⏳ Cargando cotización...</strong></div>
  `;

  try {
    await ensureCatalogoCargado();
  } catch (e) {
    console.error(e);
    alert("❌ No se pudo cargar el catálogo. Revisa tu conexión.");
    return;
  }

  cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");
  clientes = JSON.parse(localStorage.getItem("clientes") || "[]");

  const c = cotizaciones.find(x => String(x.id) === String(id));
  if (!c) {
    alert("No se encontró la cotización guardada.");
    return;
  }

  // marcar modo edición (para marca de agua en PDF)
  cotizacionEditMode = true;

  // asegurar cliente en la lista para poder usar el selector normal
  let clienteId = "";
  if (c.cliente) {
    const norm = (s) => String(s || "").trim().toLowerCase();

    let found = null;

    // 1) RTN exacto (si existe)
    if (c.cliente.rtn && norm(c.cliente.rtn)) {
      found = clientes.find(x => norm(x.rtn) === norm(c.cliente.rtn));
    }

    // 2) Teléfono + nombre
    if (!found && c.cliente.telefono && norm(c.cliente.telefono)) {
      found = clientes.find(x =>
        norm(x.telefono) === norm(c.cliente.telefono) &&
        norm(x.nombre) === norm(c.cliente.nombre)
      );
    }

    // 3) Nombre + empresa
    if (!found && c.cliente.nombre) {
      found = clientes.find(x =>
        norm(x.nombre) === norm(c.cliente.nombre) &&
        norm(x.empresa) === norm(c.cliente.empresa)
      );
    }

    if (found) {
      clienteId = found.id;
    } else {
      const nuevo = {
        id: Date.now(),
        nombre: c.cliente.nombre || "",
        empresa: c.cliente.empresa || "",
        telefono: c.cliente.telefono || "",
        rtn: c.cliente.rtn || "",
        ubicacion: c.cliente.ubicacion || ""
      };
      clientes.push(nuevo);
      localStorage.setItem("clientes", JSON.stringify(clientes));
      clienteId = nuevo.id;
    }
  }

  cotizacionActual = {
    id: c.id,
    fecha: c.fecha,
    clienteId,
    items: (c.items || []).map(it => ({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo: it.codigo || "",
      qty: Math.max(1, Number(it.cantidad || 1)),
      priceType: it.tipoPrecio || "precio",
      customPrice: (it.tipoPrecio === "precioVendedor") ? Number(it.precioUnitario || 0) : 0
    }))
  };

  // normalizar por si hay líneas duplicadas
  normalizeItems();

  renderCotizacion();
}


function generarPdfDesdeGuardada(id){
  const c = cotizaciones.find(x => String(x.id) === String(id));
  if (!c) return;
  crearPdfCotizacion(c);
}

// En HOME del vendedor, el botón "Compartir" genera el PDF y, si es Android,
// lanza el compartidor automáticamente.
async function compartirCotizacionGuardada(id){
  try {
    cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");
  } catch { cotizaciones = []; }

  const c = (Array.isArray(cotizaciones) ? cotizaciones : []).find(x => String(x?.id) === String(id));
  if (!c) {
    alert("No se encontró la cotización guardada.");
    return;
  }

  try {
    await crearPdfCotizacion(c);
  } catch (e) {
    console.error(e);
    alert("❌ No se pudo generar el PDF.");
    return;
  }

  // Auto-share solo en Android (en web dejamos la vista previa)
  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    try { compartirArchivo(); } catch {}
  }
}

function limpiarTelefono(num) {
  return String(num || "").replace(/\D/g, "");
}

function llamarCliente(telefono) {
  const num = limpiarTelefono(telefono);
  if (!num) {
    alert("El cliente no tiene teléfono válido");
    return;
  }
  window.location.href = `tel:${num}`;
}

function whatsappCliente(telefono) {
  const num = limpiarTelefono(telefono);
  if (!num) {
    alert("El cliente no tiene teléfono válido");
    return;
  }

  const url = `https://wa.me/504${num}`;
  window.open(url, "_blank");
}

/* ================= OPERADOR: STATE ================= */
let operadorEdit = null; // { tipo: "ENTRADA"|"SALIDA"|"TRASLADO"|"CONTEO", movId: string }

let entradaFactura = null;
let salidaFactura = null;
let transferenciaDoc = null;
let conteoDoc = null;

let operadorFilaActivaId = null;
let operadorFilaActivaTipo = "ENTRADA";

/* ================= OPERADOR: BORRADORES (autosave) ================= */
const OP_DRAFT_PREFIX = "opDraft_";
const OP_DRAFT_MAX_AGE_DAYS = 30;

function opDraftKey(tipo){ return OP_DRAFT_PREFIX + String(tipo || ""); }
function opMakeItemId(){
  return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function saveOperadorDraft(tipo, data){
  try {
    if (!data) return;
    localStorage.setItem(opDraftKey(tipo), JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function loadOperadorDraft(tipo){
  try {
    const raw = localStorage.getItem(opDraftKey(tipo));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.data) return null;

    const ts = Number(obj.ts || 0);
    if (ts && (Date.now() - ts) > (OP_DRAFT_MAX_AGE_DAYS * 86400000)) {
      localStorage.removeItem(opDraftKey(tipo));
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

function clearOperadorDraft(tipo){
  try { localStorage.removeItem(opDraftKey(tipo)); } catch {}
}

function normalizeOperadorDraft(tipo, doc){
  const d = (doc && typeof doc === "object") ? doc : {};
  const out = {
    ...d,
    id: d.id || Date.now(),
    fechaISO: d.fechaISO || new Date().toISOString().slice(0,10),
    items: Array.isArray(d.items) ? d.items : []
  };

  if (tipo === "ENTRADA") {
    out.proveedor = out.proveedor || "";
    out.facturaNo = out.facturaNo || "";
  } else if (tipo === "SALIDA") {
    out.facturaNo = out.facturaNo || "";
  } else if (tipo === "TRASLADO") {
    out.direccion = (out.direccion === "A_P" ? "A_P" : "P_A");
    out.referencia = out.referencia || "";
  } else if (tipo === "CONTEO") {
    out.referencia = out.referencia || "";
  }

  out.items = out.items.map(it => ({
    ...it,
    id: (it && it.id) ? it.id : opMakeItemId(),
    codigo: (it && it.codigo) ? it.codigo : "",
    producto: (it && it.producto) ? it.producto : "",
    cantidad: (it && (it.cantidad !== undefined)) ? it.cantidad : ""
  }));

  return out;
}

function draftTieneContenido(tipo, d){
  if (!d || typeof d !== "object") return false;

  if (Array.isArray(d.items) && d.items.some(x =>
    x && (((x.codigo || "").trim()) || (String(x.cantidad || "").trim()))
  )) return true;

  if (tipo === "ENTRADA") return !!((d.proveedor || "").trim() || (d.facturaNo || "").trim());
  if (tipo === "SALIDA") return !!((d.facturaNo || "").trim());
  if (tipo === "TRASLADO") return !!((d.referencia || "").trim());
  if (tipo === "CONTEO") return !!((d.referencia || "").trim());

  return false;
}

async function maybeRestoreOperadorDraft(tipo, onRestore){
  const pack = loadOperadorDraft(tipo);
  if (!pack || !pack.data) return false;

  const d = pack.data;
  if (!draftTieneContenido(tipo, d)) return false;

  const fecha = (d.fechaISO || "").trim() || "—";
  const ok = await uiConfirm(
    `Tienes un borrador sin guardar (${tipo}) con fecha ${fecha}.

¿Quieres continuar donde lo dejaste?`,
    { title: "Continuar borrador", okText: "Continuar", cancelText: "Empezar nuevo" }
  );

  if (!ok) {
    clearOperadorDraft(tipo);
    return false;
  }

  try { onRestore(normalizeOperadorDraft(tipo, d)); } catch {}
  return true;
}

async function borrarBorradorOperador(tipo){
  const ok = await uiConfirm(
    "¿Borrar el borrador y empezar de cero?",
    { title: "Borrar borrador", okText: "Borrar", cancelText: "Cancelar" }
  );
  if (!ok) return;

  clearOperadorDraft(tipo);
  operadorEdit = null;

  if (tipo === "ENTRADA") {
    entradaFactura = { id: Date.now(), fechaISO: new Date().toISOString().slice(0,10), proveedor: "", facturaNo: "", items: [] };
    renderEntradasOperador();
    return;
  }

  if (tipo === "SALIDA") {
    salidaFactura = { id: Date.now(), fechaISO: new Date().toISOString().slice(0,10), facturaNo: "", items: [] };
    renderSalidasOperador();
    return;
  }

  if (tipo === "TRASLADO") {
    transferenciaDoc = { id: Date.now(), fechaISO: new Date().toISOString().slice(0,10), direccion: "P_A", referencia: "", items: [] };
    agregarFilaTransferencia();
    renderTransferenciasOperador();
    return;
  }

  if (tipo === "CONTEO") {
    conteoDoc = { id: Date.now(), fechaISO: new Date().toISOString().slice(0,10), referencia: "", items: [] };
    renderConteosOperador();
    renderFilasConteo();
    actualizarPreviewConteo();
    return;
  }
}

let facturasEntradas = JSON.parse(localStorage.getItem("facturasEntradas") || "[]");
let facturasSalidas = JSON.parse(localStorage.getItem("facturasSalidas") || "[]");
let transferencias = JSON.parse(localStorage.getItem("transferencias") || "[]");
/* ================= OPERADOR: MOTORISTAS + PENDIENTES ================= */
const LS_MOTORISTAS_OP = "op_motoristas";
const LS_PENDIENTES_SALIDAS = "op_pendientes_salidas";
const LS_PENDIENTES_SALIDA_DESPACHO = "op_pendientes_salida_despacho";

function lsRead(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const val = JSON.parse(raw);
    return (val === null || val === undefined) ? fallback : val;
  }catch(e){
    return fallback;
  }
}
function lsWrite(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

let motoristasOp = lsRead(LS_MOTORISTAS_OP, []);
if (!Array.isArray(motoristasOp)) motoristasOp = [];

let pendientesSalidasOp = lsRead(LS_PENDIENTES_SALIDAS, []);
if (!Array.isArray(pendientesSalidasOp)) pendientesSalidasOp = [];

function getMotoristasOp(){
  motoristasOp = lsRead(LS_MOTORISTAS_OP, []);
  if (!Array.isArray(motoristasOp)) motoristasOp = [];
  return motoristasOp;
}
function saveMotoristasOp(){
  lsWrite(LS_MOTORISTAS_OP, motoristasOp);
}

function getPendientesOp(){
  pendientesSalidasOp = lsRead(LS_PENDIENTES_SALIDAS, []);
  if (!Array.isArray(pendientesSalidasOp)) pendientesSalidasOp = [];
  return pendientesSalidasOp;
}
function savePendientesOp(){
  lsWrite(LS_PENDIENTES_SALIDAS, pendientesSalidasOp);

  // Refrescar widgets del HOME OPERADOR si existen
  try { if (el("opHomeSummaryBody")) renderOperadorHomeDashboard(); } catch(e){}
}



/* ===== OPERADOR: PENDIENTES DE SALIDA (cola de despacho) ===== */
let salidasPendientesDespachoOp = null;

function getPendientesSalidaDespachoOp(){
  if (!Array.isArray(salidasPendientesDespachoOp)) {
    salidasPendientesDespachoOp = lsRead(LS_PENDIENTES_SALIDA_DESPACHO, []);
  }
  if (!Array.isArray(salidasPendientesDespachoOp)) salidasPendientesDespachoOp = [];
  return salidasPendientesDespachoOp;
}

function savePendientesSalidaDespachoOp(){
  lsWrite(LS_PENDIENTES_SALIDA_DESPACHO, getPendientesSalidaDespachoOp());

  // Refrescar widgets del HOME OPERADOR si existen
  try { if (el("opHomeSummaryBody")) renderOperadorHomeDashboard(); } catch(e){}
}

function findSalidaPendienteDespachoById(id){
  const list = getPendientesSalidaDespachoOp();
  return list.find(x => String(x.id) === String(id));
}

function upsertSalidaPendienteDespacho(pend){
  if (!pend) return;
  const list = getPendientesSalidaDespachoOp();
  const idx = list.findIndex(x => String(x.id) === String(pend.id));
  if (idx >= 0) list[idx] = pend;
  else list.unshift(pend);
  savePendientesSalidaDespachoOp();
}

function removeSalidaPendienteDespacho(id){
  const list = getPendientesSalidaDespachoOp();
  salidasPendientesDespachoOp = list.filter(x => String(x.id) !== String(id));
  savePendientesSalidaDespachoOp();
}


function upsertPendienteSalida(facturaNo, itemsPend, meta = {}){
  const fno = String(facturaNo || "").trim();
  if (!fno) return;

  getPendientesOp();

  const totalPend = (itemsPend || []).reduce((acc,x)=> acc + Number(x.cantidad || 0), 0);

  if (!totalPend) {
    // si ya no hay pendientes, eliminar
    pendientesSalidasOp = pendientesSalidasOp.filter(p => String(p.facturaNo || "").trim() !== fno);
    savePendientesOp();
    return;
  }

  const nowISO = new Date().toISOString();
  const idx = pendientesSalidasOp.findIndex(p => String(p.facturaNo || "").trim() === fno);
  const base = idx >= 0 ? pendientesSalidasOp[idx] : {
    id: "PEND_" + fno + "_" + Date.now(),
    facturaNo: fno,
    creadoAtISO: nowISO
  };

  const nuevo = {
    ...base,
    facturaNo: fno,
    actualizadoAtISO: nowISO,
    items: itemsPend.map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    })),
    totalUnidades: totalPend,
    totalLineas: (itemsPend || []).length,
    ...meta
  };

  if (idx >= 0) pendientesSalidasOp[idx] = nuevo;
  else pendientesSalidasOp.unshift(nuevo);

  savePendientesOp();
}

function getMotoristaNombreById(id){
  const list = getMotoristasOp();
  const m = list.find(x => String(x.id) === String(id));
  return m ? (m.nombre || "") : "";
}

/* ================= OPERADOR: MOTORISTAS ================= */
async function abrirMotoristasOperador(){
  if (isBodeguero()) {
    await uiAlert("Esta opción es solo para el rol OPERADOR.");
    return;
  }

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  getMotoristasOp();

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🚚 Motoristas</strong>
      <div class="muted">Agrega o elimina motoristas. Se guarda en este teléfono.</div>
    </div>

    <div class="card-lite">
      <label class="label">Nombre del motorista</label>
      <input id="opMotoristaNombre" placeholder="Ej: Juan Pérez" />
      <button type="button" onclick="agregarMotoristaOperador()">➕ Agregar motorista</button>
    </div>

    <div class="card-lite">
      <strong>Lista</strong>
      <div id="opMotoristasLista" style="margin-top:10px;"></div>
    </div>
  `;

  renderMotoristasOperador();
}

function renderMotoristasOperador(){
  const wrap = el("opMotoristasLista");
  if (!wrap) return;

  const list = getMotoristasOp();

  if (!list.length) {
    wrap.innerHTML = `<div class="muted">No hay motoristas agregados.</div>`;
    return;
  }

  wrap.innerHTML = list.map(m => `
    <div class="list-item" style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
      <div>
        <div class="list-title">${escapeHtml(m.nombre || "")}</div>
        <div class="list-sub">ID: ${escapeHtml(String(m.id))}</div>
      </div>
      <button type="button" class="small danger" onclick="eliminarMotoristaOperador('${m.id}')">Eliminar</button>
    </div>
  `).join("");
}

async function agregarMotoristaOperador(){
  const inp = el("opMotoristaNombre");
  const nombre = String(inp?.value || "").trim();
  if (!nombre) {
    await uiAlert("Escribe el nombre del motorista.");
    return;
  }

  getMotoristasOp();

  const dup = motoristasOp.some(m => String(m.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
  if (dup) {
    await uiAlert("Ese motorista ya existe.");
    return;
  }

  motoristasOp.unshift({ id: Date.now(), nombre });
  saveMotoristasOp();

  if (inp) inp.value = "";
  renderMotoristasOperador();
  await uiAlert("✅ Motorista agregado.");
}

async function eliminarMotoristaOperador(id){
  const ok = await uiConfirm("¿Eliminar este motorista?", { title: "Eliminar motorista", icon: "🗑️", okText: "Eliminar" });
  if (!ok) return;

  getMotoristasOp();
  motoristasOp = motoristasOp.filter(m => String(m.id) !== String(id));
  saveMotoristasOp();

  renderMotoristasOperador();
}

/* ================= OPERADOR: PENDIENTES ================= */

/* ================= OPERADOR: PENDIENTES DE SALIDA (cola de despacho) ================= */
async function abrirPendientesSalidaOperador(){
  // ✅ Ya no existe un módulo separado: todo se muestra en el HOME del OPERADOR.
  if (isBodeguero()) {
    await uiAlert("Esta opción es solo para el rol OPERADOR.");
    return;
  }
  goOperadorHomePSD();
}

function renderPendientesSalidaOperador(){
  const q = String(el("opPSDSearch")?.value || "").trim().toLowerCase();
  let list = (getPendientesSalidaDespachoOp() || []).slice();

  if (q) {
    list = list.filter(p => {
      const hay = [
        p.facturaNo,
        p.motoristaNombre,
        p.placa,
        (p.items || []).map(x => x.codigo).join(" "),
        (p.items || []).map(x => x.producto).join(" ")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (!list.length) {
    return `<div class="muted">No hay facturas pendientes de despacho.</div>`;
  }

  // Agrupar por motorista (SIN MOTORISTA aparte)
  const groups = {};
  list.forEach(p => {
    const nombre = String(p.motoristaNombre || "").trim();
    const key = nombre ? nombre.toUpperCase() : "__SIN__";
    if (!groups[key]) groups[key] = { display: nombre || "Sin motorista", items: [] };
    groups[key].items.push(p);
  });

  const keys = Object.keys(groups).sort((a,b)=>{
    if (a === "__SIN__") return -1;
    if (b === "__SIN__") return 1;
    return a.localeCompare(b);
  });

  return keys.map((k,idx) => {
    const g = groups[k];
    const open = (k === "__SIN__") ? "open" : "";
    const factBoxId = `opPSD_facturas_${idx}`;
    return `
      <details class="op-group" ${open}>
        <summary>
          <span>${escapeHtml(g.display)}</span>
          <span class="badge">${g.items.length}</span>
        </summary>
        <div class="op-group-body">
          <div class="btn-row" style="margin:10px 0;">
            <button type="button" class="small" onclick="despacharGrupoPendientesSalidaOperador('${escSq(k)}')">🚚 Despachar todo (${g.items.length})</button>
            <button type="button" class="secondary small"
              data-show-text="📄 Ver facturas (${g.items.length})"
              data-hide-text="📄 Ocultar facturas"
              onclick="toggleOpPSDGroupFacturas('${factBoxId}', this)">📄 Ver facturas (${g.items.length})</button>
          </div>

          ${renderOpPSDResumenProductosGrupo(g.items)}

          <div id="${factBoxId}" class="hidden">
            ${g.items.map(p => renderPendienteSalidaCard(p)).join("")}
          </div>
        </div>
      </details>
    `;
  }).join("");
}

function fmtQty(n){
  const x = Number(n || 0);
  if (!isFinite(x)) return "0";
  const y = Math.round(x * 100) / 100;
  const isInt = Math.abs(y - Math.round(y)) < 1e-9;
  return isInt ? String(Math.round(y)) : String(y);
}

function renderOpPSDItemsTable(items, opts){
  const arr = Array.isArray(items) ? items : [];
  const rows = arr
    .filter(it => String(it.codigo || "").trim() || String(it.producto || it.nombre || "").trim())
    .map(it => ({
      codigo: String(it.codigo || "").trim() || "—",
      producto: String(it.producto || it.nombre || "").trim() || "—",
      enviar: Number(it.cantidad || 0),
      pend: Number(it.pendiente || 0)
    }));

  if (!rows.length) return `<div class="muted" style="margin-top:10px;">Sin productos para mostrar.</div>`;

  const showPend = (opts && opts.showPend === false)
    ? false
    : rows.some(r => Number(r.pend || 0) > 0);

  const totalEnviar = rows.reduce((a,r)=> a + (isFinite(r.enviar) ? r.enviar : 0), 0);
  const totalPend  = rows.reduce((a,r)=> a + (isFinite(r.pend) ? r.pend : 0), 0);

  return `
    <div class="op-psd-table-wrap" style="margin-top:10px;">
      <table class="op-sum-table op-inv-table">
        <thead>
          <tr>
            <th style="width:140px;">Código</th>
            <th>Producto</th>
            <th style="width:110px; text-align:right;">Cantidad</th>
            ${showPend ? `<th style="width:110px; text-align:right;">Pend.</th>` : ``}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="code">${escapeHtml(r.codigo)}</td>
              <td>${escapeHtml(r.producto)}</td>
              <td class="num">${fmtQty(r.enviar)}</td>
              ${showPend ? `<td class="num">${fmtQty(r.pend)}</td>` : ``}
            </tr>
          `).join("")}

          <tr class="op-sum-total">
            <td colspan="2"><b>TOTAL</b></td>
            <td class="num"><b>${fmtQty(totalEnviar)}</b></td>
            ${showPend ? `<td class="num"><b>${fmtQty(totalPend)}</b></td>` : ``}
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function aggregateOpPSDProductos(facturas){
  const map = {};
  let totalEnviar = 0;
  let totalPend = 0;
  let totalLines = 0;

  // Mantener el orden de las facturas tal como llegan (para el desglose por factura)
  const facturaOrder = [];
  const seenFactura = new Set();

  (facturas || []).forEach(f => {
    const fno = String(f?.facturaNo || "").trim() || "—";
    if (!seenFactura.has(fno)) {
      seenFactura.add(fno);
      facturaOrder.push(fno);
    }

    const its = Array.isArray(f.items) ? f.items : [];
    its.forEach(it => {
      totalLines++;
      const codigo = String(it.codigo || "").trim();
      const producto = String(it.producto || it.nombre || "").trim();
      const key = (codigo || producto || "").toUpperCase() || ("__" + totalLines);

      if (!map[key]) {
        map[key] = { codigo: codigo || "—", producto: producto || "—", enviar: 0, pend: 0, byFactura: {} };
      } else {
        // preferir un código/nombre real si antes no había
        if (map[key].codigo === "—" && codigo) map[key].codigo = codigo;
        if (map[key].producto === "—" && producto) map[key].producto = producto;
      }

      const c = Number(it.cantidad || 0);
      const p = Number(it.pendiente || 0);

      map[key].enviar += isFinite(c) ? c : 0;
      map[key].pend += isFinite(p) ? p : 0;

      // Desglose por factura
      if (!map[key].byFactura[fno]) map[key].byFactura[fno] = { facturaNo: fno, enviar: 0, pend: 0 };
      map[key].byFactura[fno].enviar += isFinite(c) ? c : 0;
      map[key].byFactura[fno].pend += isFinite(p) ? p : 0;

      totalEnviar += isFinite(c) ? c : 0;
      totalPend += isFinite(p) ? p : 0;
    });
  });

  const rows = Object.values(map)
    .filter(r => (Number(r.enviar) || 0) !== 0 || (Number(r.pend) || 0) !== 0)
    .sort((a,b)=>{
      const an = String(a.producto || "");
      const bn = String(b.producto || "");
      const cn = an.localeCompare(bn);
      if (cn !== 0) return cn;
      return String(a.codigo || "").localeCompare(String(b.codigo || ""));
    });

  // Normalizar desglose por factura a un arreglo en orden estable
  rows.forEach(r => {
    const bf = r.byFactura || {};
    r.facturas = facturaOrder
      .filter(fn => bf[fn] && ((Number(bf[fn].enviar)||0) !== 0 || (Number(bf[fn].pend)||0) !== 0))
      .map(fn => bf[fn]);
  });

  return { rows, totalEnviar, totalPend, totalLines, facturaOrder };
}

function renderOpPSDResumenProductosGrupo(facturas){
  const { rows, totalEnviar, totalPend, totalLines } = aggregateOpPSDProductos(facturas || []);
  if (!rows.length) return `<div class="muted">Sin productos para mostrar en este grupo.</div>`;

  const showPend = rows.some(r => Number(r.pend || 0) > 0);

  const colCount = showPend ? 4 : 3;

  const uniqueProductos = rows.length;
  const facturasN = Number((facturas || []).length || 0);

  const mkBreakChip = (b) => {
    const fno = String(b?.facturaNo || "—");
    const enviar = Number(b?.enviar || 0);
    const pend = Number(b?.pend || 0);
    const warn = pend > 0 ? " warn" : "";
    const txt = `${escapeHtml(fno)} • ${fmtQty(enviar)}${pend > 0 ? ` • P ${fmtQty(pend)}` : ``}`;
    return `<span class="op-break-chip${warn}">${txt}</span>`;
  };

  return `
    <div class="card-lite op-psd-sumcard">
      <div class="op-psd-sumhead">
        <div class="op-psd-sumtitle">
          <div class="op-psd-sumicon">📦</div>
          <div>
            <div class="op-psd-sumttl">Productos del motorista</div>
            <div class="op-psd-sumsub">${uniqueProductos} producto(s) • ${facturasN} factura(s) • ${totalLines} línea(s)</div>
          </div>
        </div>

        <div class="op-psd-sumtot">
          <div class="op-psd-sumtotbox">
            <div class="k">A enviar</div>
            <div class="v">${fmtQty(totalEnviar)}</div>
          </div>
          ${showPend ? `
            <div class="op-psd-sumtotbox secondary">
              <div class="k">Pend.</div>
              <div class="v">${fmtQty(totalPend)}</div>
            </div>
          ` : ``}
        </div>
      </div>

      <div class="op-psd-table-wrap">
        <table class="op-sum-table">
          <thead>
            <tr>
              <th class="col-code">Código</th>
              <th>Producto</th>
              <th class="col-qty" style="text-align:right;">Cantidad</th>
              ${showPend ? `<th class="col-pend" style="text-align:right;">Pend.</th>` : ``}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const factCount = Array.isArray(r.facturas) ? r.facturas.length : 0;
              const factTxt = factCount === 1 ? "1 factura" : `${factCount} facturas`;
              const breakHtml = (r.facturas || []).map(mkBreakChip).join("");

              return `
                <tr class="op-sum-row">
                  <td class="code" data-label="Código"><span class="op-code-pill">${escapeHtml(r.codigo)}</span></td>
                  <td data-label="Producto">
                    <div class="op-prod-name">${escapeHtml(r.producto)}</div>
                    <div class="op-prod-sub muted">${factTxt} • Detalle por factura abajo</div>
                  </td>
                  <td class="num" data-label="Cantidad"><span class="op-qty-pill">${fmtQty(r.enviar)}</span></td>
                  ${showPend ? `<td class="num" data-label="Pend.">${Number(r.pend||0) > 0 ? `<span class="op-pend-pill">${fmtQty(r.pend)}</span>` : `<span class="muted">—</span>`}</td>` : ``}
                </tr>
                <tr class="op-sum-detail">
                  <td colspan="${colCount}">
                    <div class="op-break-wrap">
                      <div class="op-break-label">Por factura</div>
                      <div class="op-break-chips">${breakHtml || `<span class="muted">—</span>`}</div>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}

            <tr class="op-sum-total">
              <td colspan="2"><b>TOTAL</b></td>
              <td class="num"><b>${fmtQty(totalEnviar)}</b></td>
              ${showPend ? `<td class="num" data-label="Pend."><b>${fmtQty(totalPend)}</b></td>` : ``}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleOpPSDGroupFacturas(domId, btn){
  const box = el(domId);
  if (!box) return;

  const willShow = box.classList.contains("hidden");
  if (willShow) box.classList.remove("hidden");
  else box.classList.add("hidden");

  if (btn) {
    const showText = btn.getAttribute("data-show-text") || "📄 Ver facturas";
    const hideText = btn.getAttribute("data-hide-text") || "📄 Ocultar facturas";
    btn.textContent = willShow ? hideText : showText;
  }
}

function renderPendienteSalidaCard(p){
  const items = Array.isArray(p.items) ? p.items : [];
  const totalShip = items.reduce((a,x)=> a + Number(x.cantidad || 0), 0);
  const totalPend = items.reduce((a,x)=> a + Number(x.pendiente || 0), 0);

  const facturaNo = String(p.facturaNo || "").trim();
  const fecha = String(p.fecha || "").trim();
  const placa = String(p.placa || "").trim();
  const guard = String(p.creadoEn || "").trim();
  const lines = items.length;

  const title = facturaNo ? `Factura #${escapeHtml(facturaNo)}` : `Factura`;

  return `
    <div class="ticket ticket-invoice">
      <div class="inv-head">
        <div class="inv-main">
          <div class="inv-no">${title}</div>

          <div class="inv-meta">
            ${fecha ? `<span>📅 ${escapeHtml(fecha)}</span>` : ``}
            ${placa ? `<span>🚚 Placa ${escapeHtml(placa)}</span>` : ``}
            <span>📦 ${lines} línea${lines===1 ? "" : "s"}</span>
          </div>

          ${guard ? `<div class="inv-sub">Guardada: ${escapeHtml(guard)}</div>` : ``}
        </div>

        <div class="inv-totals">
          <div class="inv-totals-label">A enviar</div>
          <div class="inv-totals-qty">${fmtQty(totalShip)}</div>
          ${Number(totalPend||0) > 0 ? `<div class="inv-totals-pend">Pend.: ${fmtQty(totalPend)}</div>` : ``}
        </div>
      </div>

      <div class="inv-chips">
        ${p.motoristaNombre
          ? `<span class="chip chip-accent">🚚 ${escapeHtml(p.motoristaNombre)}</span>`
          : `<span class="chip chip-muted">Sin motorista</span>`}
      </div>

      ${renderOpPSDItemsTable(items)}

      <div class="inv-actions btn-row">
        <button type="button" class="secondary small" onclick="abrirSalidasOperadorEditarPendiente('${escSq(p.id)}')">✏️ Editar</button>
        <button type="button" class="danger small" onclick="eliminarSalidaPendienteDespachoUI('${escSq(p.id)}')">🗑️ Eliminar</button>
        <button type="button" class="small" onclick="despacharSalidaPendienteDespachoUI('${escSq(p.id)}')">🚚 Despachar</button>
      </div>
    </div>
  `;
}

async function abrirSalidasOperadorEditarPendiente(pendId){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  const p = findSalidaPendienteDespachoById(pendId);
  if (!p) {
    await uiAlert("No se encontró la factura pendiente.");
    goOperadorHomePSD();
    return;
  }

  operadorEdit = { tipo: "SALIDA_PENDIENTE", pendId: p.id };

  salidaFactura = {
    id: p.id || Date.now(),
    fechaISO: p.fecha || new Date().toISOString().slice(0,10),
    facturaNo: p.facturaNo || "",
    motoristaId: p.motoristaId || "",
    motoristaNombre: p.motoristaNombre || "",
    placa: p.placa || "",
    dispatchMode: false,
    items: (Array.isArray(p.items) ? p.items : []).map(it => ({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo: it.codigo || "",
      producto: it.producto || "",
      cantidad: (it.cantidad === 0 ? 0 : (it.cantidad || "")),
      pendiente: (it.pendiente === 0 ? 0 : (it.pendiente || ""))
    }))
  };

  renderSalidasOperador();
}

async function eliminarSalidaPendienteDespachoUI(pendId){
  const p = findSalidaPendienteDespachoById(pendId);
  if (!p) {
    await uiAlert("No se encontró la factura pendiente.");
    return;
  }

  const ok = await uiConfirm(
    `¿Eliminar la factura ${String(p.facturaNo || "").trim()} de Pendientes de salida?`,
    { title: "Eliminar", icon: "🗑️", okText: "Eliminar" }
  );
  if (!ok) return;

  removeSalidaPendienteDespacho(pendId);

  const w = el("opPSDWrap");
  if (w) w.innerHTML = renderPendientesSalidaOperador();
}

async function despacharSalidaPendienteDespachoUI(pendId){
  const p = findSalidaPendienteDespachoById(pendId);
  if (!p) {
    await uiAlert("No se encontró la factura pendiente.");
    return;
  }

  // Validar que haya algo por despachar
  const items = Array.isArray(p.items) ? p.items : [];
  const itemsShip = items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: String(x.codigo || "").trim(),
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

  if (!itemsShip.length) {
    await uiAlert("Esta factura no tiene cantidades para despachar (cantidad > 0). Usa Editar y coloca cantidades enviadas.");
    return;
  }

  // Pedir motorista (SIEMPRE antes de despachar)
  const motoristas = await loadMotoristasRepo();
  const placas = await loadPlacasRepo();
  const r = await dsAbrir({
    motoristas,
    placas,
    defaultId: p.motoristaId || "",
    defaultNombre: p.motoristaNombre || "",
    defaultPlaca: p.placa || ""
  });
  if (!r) return;

  const itemsPend = items
    .filter(x => (x.codigo || "").trim() && Number(x.pendiente || 0) > 0)
    .map(x => ({
      codigo: String(x.codigo || "").trim(),
      producto: x.producto || "",
      cantidad: Number(x.pendiente || 0)
    }));

  const totalShip = itemsShip.reduce((a,x)=> a + x.cantidad, 0);
  const totalPend = itemsPend.reduce((a,x)=> a + x.cantidad, 0);

  const now = new Date();

  const snap = {
    id: p.id || Date.now(),
    fecha: p.fecha || new Date().toISOString().slice(0,10),
    facturaNo: String(p.facturaNo || "").trim(),
    motoristaId: r.motoristaId || "",
    motoristaNombre: String(r.motoristaNombre || "").trim(),
    placa: String(r.placa || "").trim().toUpperCase(),
    modo: totalPend ? "PARCIAL" : "COMPLETA",
    items: itemsShip,
    pendienteItems: itemsPend,
    pendienteTotalUnidades: totalPend,
    totalLineas: itemsShip.length,
    totalUnidades: totalShip,
    despachadoEn: nowStr(),
    despachadoAtISO: now.toISOString(),
    despachadoAtEpoch: now.getTime(),
    preparadoEn: p.creadoEn || "",
    preparadoAtISO: p.creadoAtISO || "",
    preparadoAtEpoch: p.creadoAtEpoch || 0
  };

  // Si queda pendiente de productos, guardarlo en el panel de pendientes de productos
  upsertPendienteSalida(snap.facturaNo, itemsPend, {
    ultimoMotorista: snap.motoristaNombre,
    ultimaPlaca: snap.placa
  });

  // Registrar movimiento
  facturasSalidas.unshift(snap);
  localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));
  registrarMovimiento("SALIDA", snap);

  // Eliminar de la cola de despacho
  removeSalidaPendienteDespacho(pendId);

  await uiAlert("✅ Despachado. Se guardó en Movimientos.");

  // Mantenerse en la vista actual (no navegar automáticamente)
  try {
    const w = el("opPSDWrap");
    if (w) w.innerHTML = renderPendientesSalidaOperador();
    const homeUI = el("operadorHomeUI");
    if (homeUI && !homeUI.classList.contains("hidden")) {
      renderOperadorHomeDashboard(true);
    }
  } catch(e) {}
}



async function despacharGrupoPendientesSalidaOperador(groupKey){
  const key = String(groupKey || "").trim();
  const listAll = (getPendientesSalidaDespachoOp() || []).slice();

  const groupList = listAll.filter(p => {
    const nombre = String(p.motoristaNombre || "").trim();
    const k = nombre ? nombre.toUpperCase() : "__SIN__";
    return k === key;
  });

  if (!groupList.length) {
    await uiAlert("No hay facturas en este grupo para despachar.");
    return;
  }

  // Pedir motorista (una sola vez)
  const motoristas = await loadMotoristasRepo();

  const defaultId = String(groupList.find(x => String(x.motoristaId || "").trim())?.motoristaId || "");
  const defaultNombre = (key === "__SIN__") ? "" : String(groupList[0].motoristaNombre || "").trim();

  const placasSet = new Set(
    groupList
      .map(x => String(x.placa || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const defaultPlaca = (placasSet.size === 1) ? Array.from(placasSet)[0] : "";

  const placas = await loadPlacasRepo();
  const r = await dsAbrir({
    motoristas,
    placas,
    defaultId,
    defaultNombre,
    defaultPlaca
  });
  if (!r) return;

  // Separar facturas despachables / no despachables
  const dispatchables = [];
  const skipped = [];

  for (const p of groupList) {
    const items = Array.isArray(p.items) ? p.items : [];
    const itemsShip = items
      .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
      .map(x => ({
        codigo: String(x.codigo || "").trim(),
        producto: x.producto || "",
        cantidad: Number(x.cantidad || 0)
      }));

    if (!itemsShip.length) {
      skipped.push(p);
      continue;
    }

    dispatchables.push({ p, itemsShip });
  }

  if (!dispatchables.length) {
    await uiAlert("Ninguna factura del grupo tiene cantidades para despachar (cantidad > 0). Usa Editar y coloca cantidades enviadas.");
    return;
  }

  if (skipped.length) {
    const okSkip = await uiConfirm(
      `Hay ${skipped.length} factura(s) sin cantidades para despachar y serán omitidas.\n\n¿Continuar con las demás?`,
      { title: "Omitir facturas", icon: "⚠️", okText: "Continuar", cancelText: "Cancelar" }
    );
    if (!okSkip) return;
  }

  const ok = await uiConfirm(
    `Vas a despachar ${dispatchables.length} factura(s) con el motorista:\n\n${String(r.motoristaNombre || "").trim()}\n\n¿Confirmar?`,
    { title: "Despachar todo", icon: "🚚", okText: "Despachar", cancelText: "Cancelar" }
  );
  if (!ok) return;

  // Despachar en lote
  for (const { p, itemsShip } of dispatchables) {
    const items = Array.isArray(p.items) ? p.items : [];

    const itemsPend = items
      .filter(x => (x.codigo || "").trim() && Number(x.pendiente || 0) > 0)
      .map(x => ({
        codigo: String(x.codigo || "").trim(),
        producto: x.producto || "",
        cantidad: Number(x.pendiente || 0)
      }));

    const totalShip = itemsShip.reduce((a,x)=> a + Number(x.cantidad || 0), 0);
    const totalPend = itemsPend.reduce((a,x)=> a + Number(x.cantidad || 0), 0);

    const now = new Date();
    const placaUse = String((r.placa || "") || (p.placa || "")).trim().toUpperCase();

    const snap = {
      id: p.id || Date.now(),
      fecha: p.fecha || new Date().toISOString().slice(0,10),
      facturaNo: String(p.facturaNo || "").trim(),
      motoristaId: r.motoristaId || "",
      motoristaNombre: String(r.motoristaNombre || "").trim(),
      placa: placaUse,
      modo: totalPend ? "PARCIAL" : "COMPLETA",
      items: itemsShip,
      pendienteItems: itemsPend,
      pendienteTotalUnidades: totalPend,
      totalLineas: itemsShip.length,
      totalUnidades: totalShip,
      despachadoEn: nowStr(),
      despachadoAtISO: now.toISOString(),
      despachadoAtEpoch: now.getTime(),
      preparadoEn: p.creadoEn || "",
      preparadoAtISO: p.creadoAtISO || "",
      preparadoAtEpoch: p.creadoAtEpoch || 0
    };

    // Si queda pendiente de productos, guardarlo
    upsertPendienteSalida(snap.facturaNo, itemsPend, {
      ultimoMotorista: snap.motoristaNombre,
      ultimaPlaca: snap.placa
    });

    // Registrar movimiento
    facturasSalidas.unshift(snap);
    registrarMovimiento("SALIDA", snap);

    // Eliminar de la cola de despacho
    removeSalidaPendienteDespacho(p.id);
  }

  // Guardar facturasSalidas (una vez)
  localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));

  // Refrescar lista
  const w = el("opPSDWrap");
  if (w) w.innerHTML = renderPendientesSalidaOperador();

  await uiAlert(`✅ Despachadas ${dispatchables.length} factura(s). Ya aparecen en Movimientos.`);
}


async function abrirPendientesOperador(){
  if (isBodeguero()) {
    await uiAlert("Esta opción es solo para el rol OPERADOR.");
    return;
  }

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  getPendientesOp();

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>⏳ Pendientes</strong>
      <div class="muted">Facturas con productos pendientes. Se mantienen aunque exportes/vacíes movimientos.</div>
    </div>

    <input id="opPendBuscar" placeholder="🔍 Buscar por factura, código o producto" oninput="renderPendientesOperador()" />

    <div id="opPendLista"></div>
  `;

  renderPendientesOperador();
}

function renderPendientesOperador(){
  const wrap = el("opPendLista");
  if (!wrap) return;

  const q = String(el("opPendBuscar")?.value || "").toLowerCase().trim();

  const list = getPendientesOp();

  const filtrados = list.filter(p => {
    if (!q) return true;
    const hay = [
      p.facturaNo,
      ...(Array.isArray(p.items) ? p.items.map(x => x.codigo) : []),
      ...(Array.isArray(p.items) ? p.items.map(x => x.producto) : [])
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!filtrados.length) {
    wrap.innerHTML = `<div class="card"><strong>No hay pendientes.</strong><div class="muted">Cuando guardes una salida con campo “Pend.”, aparecerá aquí.</div></div>`;
    return;
  }

  wrap.innerHTML = filtrados.map(p => {
    const items = Array.isArray(p.items) ? p.items : [];
    const itemsHtml = items.slice(0, 6).map(it => `
      <div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--borde);">
        <div>
          <div style="font-weight:900">${escapeHtml(it.codigo || "")}</div>
          <div class="muted" style="margin-top:0">${escapeHtml(it.producto || "")}</div>
        </div>
        <div style="font-weight:900; white-space:nowrap">${Number(it.cantidad || 0)}</div>
      </div>
    `).join("");

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <strong>Factura ${escapeHtml(p.facturaNo || "")}</strong>
            <div class="muted">${escapeHtml((p.creadoAtISO || "").slice(0,10) || "")} • ${Number(p.totalLineas || items.length)} líneas • ⏳ ${Number(p.totalUnidades || 0)} unid.</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" class="small" onclick="iniciarDespachoPendiente('${escSq(p.facturaNo || "")}')">🚚</button>
            <button type="button" class="small danger" onclick="eliminarPendienteFactura('${escSq(p.facturaNo || "")}')">✖</button>
          </div>
        </div>

        <div class="card-lite" style="margin-top:10px;">
          ${itemsHtml || `<div class="muted">Sin items.</div>`}
          ${items.length > 6 ? `<div class="muted" style="margin-top:8px;">+ ${items.length - 6} más…</div>` : ``}
        </div>
      </div>
    `;
  }).join("");
}

async function eliminarPendienteFactura(facturaNo){
  const ok = await uiConfirm("¿Eliminar este pendiente? (No afecta movimientos ya guardados)", { title: "Eliminar pendiente", icon: "🗑️", okText: "Eliminar" });
  if (!ok) return;

  const fno = String(facturaNo || "").trim();
  getPendientesOp();
  pendientesSalidasOp = pendientesSalidasOp.filter(p => String(p.facturaNo || "").trim() !== fno);
  savePendientesOp();

  renderPendientesOperador();
}

async function iniciarDespachoPendiente(facturaNo){
  const fno = String(facturaNo || "").trim();
  if (!fno) return;

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  const p = getPendientesOp().find(x => String(x.facturaNo || "").trim() === fno);
  if (!p) {
    await uiAlert("No se encontró el pendiente.");
    abrirPendientesOperador();
    return;
  }

  operadorEdit = null;

  const hoy = new Date().toISOString().slice(0,10);

  salidaFactura = {
    id: Date.now(),
    fechaISO: hoy,
    facturaNo: fno,
    motoristaId: "",
    // Prefill del último despacho si existe
    motoristaNombre: String(p.ultimoMotorista || "").trim(),
    placa: String(p.ultimaPlaca || "").trim().toUpperCase(),
    dispatchMode: true,
    items: (Array.isArray(p.items) ? p.items : []).map(it => ({
      id: "s_" + Date.now() + "_" + Math.random().toString(16).slice(2),
      codigo: it.codigo,
      producto: it.producto || (getProdByCodigo(it.codigo)?.producto || ""),
      cantidad: "",
      pendiente: Number(it.cantidad || 0),
      pendBase: Number(it.cantidad || 0)
    }))
  };

  renderSalidasOperador();
}


let conteos = JSON.parse(localStorage.getItem("conteos") || "[]");

let movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");

let opInvStockFiltro = localStorage.getItem("opInvStockFiltro") || "TODOS";


/* ================= OPERADOR: INVENTARIO ================= */
async function abrirInventarioOperador(){
  // ✅ Inventario tipo tickets (igual que VISUALIZADOR). Sin precios.
  abrirConsultaInventarioVendedor();
}


function setOpInvStockFiltro(val){
  opInvStockFiltro = String(val || "TODOS").toUpperCase();
  localStorage.setItem("opInvStockFiltro", opInvStockFiltro);
  updateInvFilterButtons();
  renderInventarioOperador();
}

function updateInvFilterButtons(){
  ["TODOS","CON","SIN"].forEach(k => {
    const btn = el("opInvF_" + k);
    if (!btn) return;
    btn.classList.toggle("active", opInvStockFiltro === k);
  });
}

function renderInventarioOperador(){
  const input = el("opBuscarInv");
  const q = (input ? (input.value || "") : "").toLowerCase().trim();

  const cont = el("opListaInv");
  if (!cont) return;

  const filtrados = catalogo
    .filter(p => {
      const match =
        (p.codigo || "").toLowerCase().includes(q) ||
        (p.producto || "").toLowerCase().includes(q);

      if (!match) return false;

      const stockVal = isBodeguero()
        ? Number(p.stockA ?? 0)
        : Number(p.stockTotal ?? 0);

      if (opInvStockFiltro === "CON") return stockVal > 0;
      if (opInvStockFiltro === "SIN") return stockVal <= 0;
      return true;
    })
    .slice(0, 250);

  cont.innerHTML = filtrados.length ? filtrados.map(p => `
    <div class="inventario-item">
      <div>
        <div class="codigo">${escapeHtml(p.codigo)}</div>
        <div class="producto">${escapeHtml(p.producto)}</div>
        <div class="list-sub">
          ${isBodeguero() ? `Anexo: <b>${Number(p.stockA ?? 0)}</b>` : `Principal: <b>${Number(p.stockP ?? 0)}</b> • Anexo: <b>${Number(p.stockA ?? 0)}</b> • Total: <b>${Number(p.stockTotal ?? 0)}</b>`}
        </div>
      </div>
      <div class="stock"></div>
      <div></div>
    </div>
  `).join("") : `<div class="card"><strong>No hay resultados.</strong></div>`;
}



/* ================= OPERADOR: NEGATIVOS ================= */
async function abrirNegativosOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📉 Productos en negativo</strong>
      <div class="muted">${isBodeguero() ? "Muestra solo bodega Anexo." : "Muestra Principal, Anexo y Total."}</div>
    </div>

    <input id="opBuscarNeg" placeholder="🔍 Buscar por código o nombre" />
    <div class="inventario-list" id="opListaNeg"></div>
  `;

  try { await ensureCatalogoCargado(); } catch {}

  el("opBuscarNeg")?.addEventListener("input", renderNegativosOperador);
  renderNegativosOperador();
}

function renderNegativosOperador(){
  const q = (el("opBuscarNeg")?.value || "").toLowerCase().trim();
  const cont = el("opListaNeg");
  if (!cont) return;

  const list = catalogo.filter(p => {
    const match = (p.codigo || "").toLowerCase().includes(q) ||
                  (p.producto || "").toLowerCase().includes(q);
    if (!match) return false;

    if (isBodeguero()) return Number(p.stockA || 0) < 0;
    return Number(p.stockP || 0) < 0 || Number(p.stockA || 0) < 0 || Number(p.stockTotal || 0) < 0;
  });

  if (!list.length) {
    cont.innerHTML = `<div class="card"><strong>No hay productos en negativo.</strong></div>`;
    return;
  }

  cont.innerHTML = list.map(p => {
    const negP = Number(p.stockP || 0) < 0;
    const negA = Number(p.stockA || 0) < 0;
    const negT = Number(p.stockTotal || 0) < 0;

    const line = isBodeguero()
      ? `Anexo: <b style="color:#B91C1C">${Number(p.stockA || 0)}</b>`
      : `Principal: <b style="color:${negP ? "#B91C1C" : "inherit"}">${Number(p.stockP || 0)}</b> •
         Anexo: <b style="color:${negA ? "#B91C1C" : "inherit"}">${Number(p.stockA || 0)}</b> •
         Total: <b style="color:${negT ? "#B91C1C" : "inherit"}">${Number(p.stockTotal || 0)}</b>`;

    return `
      <div class="inventario-item">
        <div>
          <div class="codigo">${escapeHtml(p.codigo)}</div>
          <div class="producto">${escapeHtml(p.producto)}</div>
          <div class="list-sub">${line}</div>
        </div>
        <div class="stock"></div>
        <div></div>
      </div>
    `;
  }).join("");
}

/* ================= OPERADOR: ENTRADAS ================= */
async function abrirEntradasOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  operadorEdit = null;

  if (await maybeRestoreOperadorDraft("ENTRADA", (d) => { entradaFactura = d; })) {
    renderEntradasOperador();
    return;
  }

  entradaFactura = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    proveedor: "",
    facturaNo: "",
    items: []
  };

  renderEntradasOperador();
}

async function abrirEntradasOperadorEditar(movId){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));

  if (!mov || mov.tipo !== "ENTRADA") {
    alert("No se encontró la factura de entrada para editar.");
    abrirMovimientosOperador();
    return;
  }

  const d = mov.data || {};
  operadorEdit = { tipo: "ENTRADA", movId: mov.id };

  entradaFactura = {
    id: d.id || Date.now(),
    fechaISO: d.fecha || d.fechaISO || new Date().toISOString().slice(0,10),
    proveedor: d.proveedor || "",
    facturaNo: d.facturaNo || "",
    items: []
  };

  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach(x => {
    const codigo = String(x.codigo || "").trim();
    const prod = getProdByCodigo(codigo);
    entradaFactura.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0,
      agregadoEn: x.agregadoEn || "",
      agregadoAtISO: x.agregadoAtISO || "",
      agregadoAtEpoch: x.agregadoAtEpoch || ""
    });
  });

  // (sin filas vacías por defecto)
  renderEntradasOperador();
}


function renderEntradasOperador(){
  const f = entradaFactura;
  const isEdit = operadorEdit && operadorEdit.tipo === "ENTRADA";

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📥 Entradas</strong>
      <div class="muted">${isEdit ? "Editando factura guardada. Puedes cambiar cantidades o eliminar productos." : "Crea una factura de entrada con múltiples productos."}</div>
    </div>

    <div class="card">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input id="opFecha" type="date" value="${escapeHtml(f.fechaISO)}" />
        </div>
        <div class="col">
          <label class="label">Proveedor</label>
          <input id="opProveedor" placeholder="Nombre del proveedor" value="${escapeHtml(f.proveedor)}" />
        </div>
        <div class="col">
          <label class="label"># Factura</label>
          <input id="opFacturaNo" placeholder="Número de factura" value="${escapeHtml(f.facturaNo)}" />
        </div>
      </div>
    </div>

    <div class="card">
      <strong>Productos</strong>
      <div class="muted">Código (auto “-”), lupa para buscar, cantidad editable.</div>
    </div>

    <div class="op-table" id="opItemsWrap"></div>

    <div style="height:10px"></div>
    <button type="button" class="secondary" onclick="abrirModalAddMovItem('ENTRADA')">➕ Agregar producto</button>

    <div class="factura-fija">
      <div class="factura-card">
        <div class="factura-head">
          <div>
            <div class="t">Factura de Entrada</div>
            <div class="factura-meta">Ferretería Universal • ID: ${f.id}</div>
          </div>
          <div style="text-align:right;">
            <div class="factura-meta">Fecha: <b>${escapeHtml(f.fechaISO)}</b></div>
            <div class="factura-meta">Factura: <b>${escapeHtml(f.facturaNo || "—")}</b></div>
          </div>
        </div>

        <div class="factura-meta">
          Proveedor: <b>${escapeHtml(f.proveedor || "—")}</b>
        </div>

        <div class="factura-items" id="opFacturaPreview"></div>

        <div class="factura-tot">
          <span>Total líneas: <span id="opTotLineas">0</span></span>
          <span>Total unidades: <span id="opTotUnidades">0</span></span>
        </div>

        <div style="height:10px"></div>
        <div class="btn-row">
          <button type="button" onclick="guardarFacturaEntradas()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar factura"}</button>
          <button type="button" class="secondary" onclick="borrarBorradorOperador('ENTRADA')">🧹 Borrar borrador</button>
        </div>
      </div>
    </div>
  `;

  const opFecha = el("opFecha");
  const opProveedor = el("opProveedor");
  const opFacturaNo = el("opFacturaNo");

  if (opFecha) opFecha.addEventListener("change", (e) => {
    entradaFactura.fechaISO = e.target.value || new Date().toISOString().slice(0,10);
    actualizarPreviewEntrada();
  });

  if (opProveedor) opProveedor.addEventListener("input", (e) => {
    entradaFactura.proveedor = e.target.value || "";
    actualizarPreviewEntrada();
  });

  if (opFacturaNo) opFacturaNo.addEventListener("input", (e) => {
    entradaFactura.facturaNo = e.target.value || "";
    actualizarPreviewEntrada();
  });

  renderFilasEntrada();
  actualizarPreviewEntrada();
}

function agregarFilaEntrada(){
  if (!entradaFactura) return;

  entradaFactura.items.push({
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo: "",
    producto: "",
    cantidad: "" // ✅ en blanco
  });
}

function borrarFilaEntrada(id){
  entradaFactura.items = entradaFactura.items.filter(x => String(x.id) !== String(id));
  // (sin filas vacías por defecto)
  renderFilasEntrada();
  actualizarPreviewEntrada();
}

function renderFilasEntrada(){
  const wrap = el("opItemsWrap");
  if (!wrap) return;

  if (!entradaFactura.items.length) {
    wrap.innerHTML = `<div style="padding:12px; color:#6B7280; font-weight:800;">No hay productos agregados. Usa “Agregar producto”.</div>`;
    return;
  }

  wrap.innerHTML = entradaFactura.items.map((it) => {
    const qtyVal = (it.cantidad === "" || it.cantidad === null || it.cantidad === undefined)
      ? ""
      : Number(it.cantidad || 0);

    return `
      <div class="op-row-wrap">
        <div class="op-row">
          <input
            id="opCodigo_${it.id}"
            placeholder="Código"
            value="${escapeHtml(it.codigo)}"
            oninput="onCodigoEntradaInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn secondary" onclick="abrirModalProductosOperador('${it.id}')" title="Buscar">🔎</button>

          <input
            id="opProd_${it.id}"
            placeholder="Producto"
            value="${escapeHtml(it.producto)}"
            disabled
          />

          <input
            id="opQty_${it.id}"
            type="number"
            min="1"
            placeholder="Cant."
            value="${escapeHtml(qtyVal)}"
            oninput="onCantidadEntradaInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn op-del" onclick="borrarFilaEntrada('${it.id}')" title="Eliminar">✖</button>
        </div>

        <div class="op-sugs" id="opSug_${it.id}"></div>
      </div>
    `;
  }).join("");

  // ✅ refrescar sugerencias para filas existentes
  entradaFactura.items.forEach(it => updateSugerenciasEntrada(it.id));
}

function formatCodigoAutoGuion(v){
  let s = String(v || "").replace(/\s+/g, "");
  if (!s) return "";

  if (s.length >= 3 && s[2] === "-") return s;

  if (s.length >= 3 && /^\d{2}/.test(s)) {
    s = s.slice(0,2) + "-" + s.slice(2);
  }

  return s;
}

function updateSugerenciasEntrada(filaId){
  const it = entradaFactura?.items?.find(x => x.id === filaId);
  const cont = el("opSug_" + filaId);
  if (!it || !cont) return;

  const raw = String(it.codigo || "").toLowerCase().trim();
  const formatted = formatCodigoAutoGuion(raw);

  // Si ya existe exacto, ocultar sugerencias
  if (formatted && getProdByCodigo(formatted)) {
    cont.innerHTML = "";
    return;
  }

  if (!raw || raw.replace('-', '').length < 2) {
    cont.innerHTML = "";
    return;
  }

  const q = formatted.toLowerCase();
  const qNoDash = q.replace('-', '');

  const matches = catalogo
    .filter(p => {
      const code = String(p.codigo || "").toLowerCase();
      const codeNoDash = code.replace('-', '');
      const name = String(p.producto || "").toLowerCase();
      return (
        code.startsWith(q) ||
        code.includes(q) ||
        codeNoDash.startsWith(qNoDash) ||
        name.includes(qNoDash)
      );
    })
    .slice(0, 10);

  cont.innerHTML = matches.length ? matches.map(p => `
    <span class="chip" onclick="seleccionarSugerenciaEntrada('${filaId}','${encodeURIComponent(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join('') : '';
}

function seleccionarSugerenciaEntrada(filaId, codigoEnc){
  const codigo = decodeURIComponent(codigoEnc || "");
  const it = entradaFactura?.items?.find(x => x.id === filaId);
  if (!it) return;

  it.codigo = codigo;
  const prod = getProdByCodigo(codigo);
  it.producto = prod ? (prod.producto || "") : "";

  const codeInput = el("opCodigo_" + filaId);
  const prodInput = el("opProd_" + filaId);
  if (codeInput) codeInput.value = it.codigo;
  if (prodInput) prodInput.value = it.producto;

  const cont = el("opSug_" + filaId);
  if (cont) cont.innerHTML = "";

  actualizarPreviewEntrada();
}

function onCodigoEntradaInput(id, value){
  const it = entradaFactura.items.find(x => x.id === id);
  if (!it) return;

  const formatted = formatCodigoAutoGuion(value);
  it.codigo = formatted;

  const input = el("opCodigo_" + id);
  if (input && input.value !== formatted) input.value = formatted;

  const prod = getProdByCodigo(formatted);
  it.producto = prod ? (prod.producto || "") : "";

  const prodInput = el("opProd_" + id);
  if (prodInput) prodInput.value = it.producto;

  updateSugerenciasEntrada(id);
  actualizarPreviewEntrada();
}

function onCantidadEntradaInput(id, value){
  const it = entradaFactura.items.find(x => x.id === id);
  if (!it) return;

  if (String(value || "").trim() === "") {
    it.cantidad = "";
    actualizarPreviewEntrada();
    return;
  }

  it.cantidad = Math.max(1, Number(value || 1));
  actualizarPreviewEntrada();
}

/* ===== Modal buscar producto (OPERADOR) ===== */
function abrirModalProductosOperador(filaId, tipo = "ENTRADA"){
  operadorFilaActivaId = filaId;
  operadorFilaActivaTipo = String(tipo || "ENTRADA").toUpperCase();

  el("buscarProductoOperador").value = "";
  renderProductosOperadorModal();
  openModal("modalProductosOperador");
  setTimeout(() => el("buscarProductoOperador").focus(), 50);
}

function cerrarModalProductosOperador(){
  closeModal("modalProductosOperador");
  operadorFilaActivaId = null;
}

function renderProductosOperadorModal(){
  const q = (el("buscarProductoOperador").value || "").toLowerCase().trim();
  const cont = el("listaProductosOperador");

  if (!q) {
    cont.innerHTML = `<div class="list-item"><div class="list-title">Escribe para buscar…</div><div class="list-sub">Ej: “clavo”, “cemento”</div></div>`;
    return;
  }

  const encontrados = catalogo
    .filter(p =>
      (p.producto || "").toLowerCase().includes(q) ||
      (p.codigo || "").toLowerCase().includes(q) ||
      (String(p.alias || "")).toLowerCase().includes(q)
    )
    .slice(0, 40);

  cont.innerHTML = encontrados.length ? encontrados.map(p => `
    <div class="list-item" onclick="seleccionarProductoOperador('${p.codigo}')">
      <div class="list-title">${escapeHtml(p.producto)}</div>
      <div class="list-sub">Código: ${escapeHtml(p.codigo)}${p.alias ? ` • Barras: ${escapeHtml(p.alias)}` : ""} • ${isBodeguero() ? `A:${Number(p.stockA ?? 0)}` : `P:${Number(p.stockP ?? 0)} • A:${Number(p.stockA ?? 0)}`}</div>
    </div>
  `).join("") : `<div class="list-item"><div class="list-title">No hay resultados</div></div>`;
}

const buscarProductoOperador = el("buscarProductoOperador");
if (buscarProductoOperador) buscarProductoOperador.addEventListener("input", renderProductosOperadorModal);

function seleccionarProductoOperador(codigo){
  if (!operadorFilaActivaId) return;

  const codigoFmt = String(codigo || "").trim();
  const prod = getProdByCodigo(codigoFmt);
  const nombre = prod ? (prod.producto || "") : "";

  // ✅ Selección desde el modal "Agregar producto"
  if (operadorFilaActivaId === "__ADD__") {
    const codeEl = el("addMovCodigo");
    const prodEl = el("addMovProducto");
    if (codeEl) codeEl.value = codigoFmt;
    if (prodEl) prodEl.value = nombre;

    const sug = el("addMovSug");
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    setTimeout(() => el("addMovQty")?.focus(), 50);
    return;
  }

  if (operadorFilaActivaTipo === "ENTRADA") {
    const it = entradaFactura?.items?.find(x => x.id === operadorFilaActivaId);
    if (!it) return;

    it.codigo = codigoFmt;
    it.producto = nombre;

    const codeInput = el("opCodigo_" + it.id);
    const prodInput = el("opProd_" + it.id);
    if (codeInput) codeInput.value = it.codigo;
    if (prodInput) prodInput.value = it.producto;

    const sug = el("opSug_" + it.id);
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    actualizarPreviewEntrada();
    setTimeout(() => el("opQty_" + it.id)?.focus(), 60);
    return;
  }

  if (operadorFilaActivaTipo === "SALIDA") {
    const it = salidaFactura?.items?.find(x => x.id === operadorFilaActivaId);
    if (!it) return;

    it.codigo = codigoFmt;
    it.producto = nombre;

    const codeInput = el("opSCodigo_" + it.id);
    const prodInput = el("opSProd_" + it.id);
    if (codeInput) codeInput.value = it.codigo;
    if (prodInput) prodInput.value = it.producto;

    const sug = el("opSSug_" + it.id);
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    actualizarPreviewSalida();
    setTimeout(() => el("opSQty_" + it.id)?.focus(), 60);
    return;
  }

  if (operadorFilaActivaTipo === "TRASLADO") {
    const it = transferenciaDoc?.items?.find(x => x.id === operadorFilaActivaId);
    if (!it) return;

    it.codigo = codigoFmt;
    it.producto = nombre;

    const codeInput = el("opTCodigo_" + it.id);
    const prodInput = el("opTProd_" + it.id);
    if (codeInput) codeInput.value = it.codigo;
    if (prodInput) prodInput.value = it.producto;

    const sug = el("opTSug_" + it.id);
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    actualizarPreviewTransferencia();
    return;
  }

  if (operadorFilaActivaTipo === "CONTEO") {
    const it = conteoDoc?.items?.find(x => x.id === operadorFilaActivaId);
    if (!it) return;

    const prevCode = String(it.codigo || "").trim();

    it.codigo = codigoFmt;
    it.producto = nombre;

    // ✅ Sello por línea (fecha/hora) cuando se selecciona un producto en CONTEO
    if (codigoFmt && (prevCode !== String(codigoFmt).trim() || (!it.agregadoAtISO && !it.agregadoAtEpoch && !it.agregadoEn))) {
      ensureItemAgregadoTs(it, true);
    }

    const codeInput = el("opCCodigo_" + it.id);
    const prodInput = el("opCProd_" + it.id);
    if (codeInput) codeInput.value = it.codigo;
    if (prodInput) prodInput.value = it.producto;

    const sug = el("opCSug_" + it.id);
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    actualizarPreviewConteo();
    setTimeout(() => el("opCQty_" + it.id)?.focus(), 60);
    return;
  }

  // default fallback
  cerrarModalProductosOperador();
}



/* ===== Modal: Agregar producto (OPERADOR - ENTRADAS / SALIDAS) ===== */
let addMovTipo = "ENTRADA";

// ✅ Conteo (Operador): modo rápido en modal "Agregar producto"
// - Si está habilitado, al reconocer un producto (por código o por barras) se agrega automáticamente
//   con una cantidad fija (configurable) y se deja listo para el siguiente escaneo.
let __opConteoQuickEnabled = false;
let __opConteoQuickQty = 1;

try {
  __opConteoQuickEnabled = JSON.parse(localStorage.getItem("opConteoQuickEnabled") || "false");
  __opConteoQuickQty = Math.max(1, Number(localStorage.getItem("opConteoQuickQty") || "1") || 1);
} catch {
  __opConteoQuickEnabled = false;
  __opConteoQuickQty = 1;
}

function isConteoQuickEnabled(){
  return !!__opConteoQuickEnabled;
}
function getConteoQuickQty(){
  return Math.max(1, Number(__opConteoQuickQty || 1) || 1);
}

function renderAddMovQuickUi(){
  const wrap = el("addMovQuickWrap");
  const btn = el("addMovQuickToggle");
  const row = el("addMovQuickQtyRow");
  const qty = el("addMovQuickQty");

  const qtyLabel = el("addMovQtyLabel");
  const qtyRow = el("addMovQtyRow");
  const qtyInput = el("addMovQty");

  const isConteo = (String(addMovTipo || "").toUpperCase() === "CONTEO");
  const enabled = isConteo && isConteoQuickEnabled();

  // Solo aplica a CONTEO
  if (!wrap) return;
  wrap.classList.toggle("hidden", !isConteo);

  if (btn) btn.textContent = enabled ? "Habilitada" : "Deshabilitada";
  if (row) row.classList.toggle("hidden", !enabled);

  if (qty) qty.value = String(getConteoQuickQty());

  // UI cantidad manual: ocultar si está en modo rápido
  if (qtyLabel) qtyLabel.classList.toggle("hidden", enabled);
  if (qtyRow) qtyRow.classList.toggle("hidden", enabled);

  // Aun si ocultamos, dejamos un valor “de respaldo” por si presionan Agregar.
  if (qtyInput) {
    if (enabled) {
      qtyInput.value = String(getConteoQuickQty());
    }
  }
}

let __addMovAutoLock = false;

function toggleAddMovQuick(){
  if (String(addMovTipo || "").toUpperCase() !== "CONTEO") return;
  __opConteoQuickEnabled = !__opConteoQuickEnabled;
  try { localStorage.setItem("opConteoQuickEnabled", JSON.stringify(__opConteoQuickEnabled)); } catch {}
  renderAddMovQuickUi();
  setTimeout(() => el("addMovCodigo")?.focus(), 50);
}

function onAddMovQuickQtyInput(v){
  const n = Math.max(1, Number(String(v || "").trim()) || 1);
  __opConteoQuickQty = n;
  try { localStorage.setItem("opConteoQuickQty", String(n)); } catch {}

  // si está visible, sincronizar el input oculto de qty para evitar validación
  try { if (el("addMovQty")) el("addMovQty").value = String(n); } catch {}
}

function abrirModalAddMovItem(tipo){
  addMovTipo = String(tipo || "ENTRADA").toUpperCase();

  const t = el("addMovTitulo");
  const sub = el("addMovSub");

  let label = "Entrada";
  if (addMovTipo === "SALIDA") label = "Salida";
  else if (addMovTipo === "CONTEO") label = "Conteo";

  if (t) t.textContent = `Agregar producto (${label})`;
  if (sub) sub.textContent = "Escribe el código (auto “-”) o usa la lupa para buscar por nombre.";

  if (el("addMovCodigo")) el("addMovCodigo").value = "";
  if (el("addMovProducto")) el("addMovProducto").value = "";
  if (el("addMovQty")) {
    el("addMovQty").value = "";
    el("addMovQty").min = (addMovTipo === "CONTEO") ? "0" : "1";
  }
  if (el("addMovSug")) el("addMovSug").innerHTML = "";

  // UI extra de CONTEO (función rápida)
  try { renderAddMovQuickUi(); } catch {}

  openModal("modalAddMovItem");
  setTimeout(() => el("addMovCodigo")?.focus(), 50);
}

function cerrarModalAddMovItem(){
  closeModal("modalAddMovItem");
}

function abrirBusquedaProductoParaAddMov(){
  // Reutiliza el modal existente de búsqueda por nombre/código
  abrirModalProductosOperador("__ADD__", addMovTipo);
}

function onAddMovCodigoInput(val){
  const formatted = formatCodigoAutoGuion(val);

  const codeEl = el("addMovCodigo");
  const prodEl = el("addMovProducto");

  if (codeEl && codeEl.value !== formatted) codeEl.value = formatted;

  const prod = getProdByCodigo(formatted);
  if (prodEl) prodEl.value = prod ? (prod.producto || "") : "";

  // ⚡ CONTEO: modo rápido => agregar automático al reconocer el producto
  if (
    String(addMovTipo || "").toUpperCase() === "CONTEO" &&
    isConteoQuickEnabled() &&
    !!prod &&
    !!String(formatted || "").trim() &&
    !__addMovAutoLock
  ) {
    __addMovAutoLock = true;

    try {
      if (!conteoDoc) {
        try { showToast("No hay conteo activo"); } catch {}
        return;
      }

      const qty = getConteoQuickQty();
      addOrSumMovItem(conteoDoc.items, formatted, prod.producto || "", qty, { setAgregadoTs: true });
      renderFilasConteo();
      actualizarPreviewConteo();
      try { showToast(`Agregado: ${qty} x ${prod.producto || formatted}`); } catch {}

      // limpiar y dejar listo para el siguiente
      try { if (el("addMovCodigo")) el("addMovCodigo").value = ""; } catch {}
      try { if (el("addMovProducto")) el("addMovProducto").value = ""; } catch {}
      try { if (el("addMovSug")) el("addMovSug").innerHTML = ""; } catch {}

      setTimeout(() => el("addMovCodigo")?.focus(), 50);
    } finally {
      setTimeout(() => { __addMovAutoLock = false; }, 120);
    }

    return;
  }

  updateSugerenciasAddMov();
}

function updateSugerenciasAddMov(){
  const cont = el("addMovSug");
  if (!cont) return;

  const raw = (el("addMovCodigo")?.value || "").toLowerCase().trim();
  const formatted = formatCodigoAutoGuion(raw);

  // Si ya existe exacto, ocultar sugerencias
  if (formatted && getProdByCodigo(formatted)) {
    cont.innerHTML = "";
    return;
  }

  if (!raw || raw.replace('-', '').length < 2) {
    cont.innerHTML = "";
    return;
  }

  const q = formatted.toLowerCase();
  const qNoDash = q.replace('-', '');

  const matches = catalogo
    .filter(p => {
      const code = String(p.codigo || "").toLowerCase();
      const codeNoDash = code.replace('-', '');
      const name = String(p.producto || "").toLowerCase();
      return (
        code.startsWith(q) ||
        code.includes(q) ||
        codeNoDash.startsWith(qNoDash) ||
        name.includes(qNoDash)
      );
    })
    .slice(0, 10);

  cont.innerHTML = matches.length ? matches.map(p => `
    <span class="chip" onclick="seleccionarSugerenciaAddMov('${encodeURIComponent(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join('') : '';
}

function seleccionarSugerenciaAddMov(codigoEnc){
  const codigo = decodeURIComponent(codigoEnc || "");

  const codeEl = el("addMovCodigo");
  const prodEl = el("addMovProducto");

  if (codeEl) codeEl.value = codigo;

  const prod = getProdByCodigo(codigo);
  if (prodEl) prodEl.value = prod ? (prod.producto || "") : "";

  const cont = el("addMovSug");
  if (cont) cont.innerHTML = "";

  setTimeout(() => el("addMovQty")?.focus(), 50);
}

function confirmarAddMovItem(){
  const codigoRaw = el("addMovCodigo")?.value || "";
  const codigo = formatCodigoAutoGuion(codigoRaw);

  const prod = getProdByCodigo(codigo);
  if (!codigo || !prod) {
    alert("Selecciona un producto válido.");
    return;
  }

  let qtyInput = String(el("addMovQty")?.value ?? "").trim();
  let qtyNum = Number(qtyInput);

  // ⚡ Si CONTEO y modo rápido, permitir cantidad vacía (usa la configurada)
  if (String(addMovTipo || "").toUpperCase() === "CONTEO" && isConteoQuickEnabled()) {
    if (qtyInput === "" || Number.isNaN(qtyNum)) {
      qtyNum = getConteoQuickQty();
      qtyInput = String(qtyNum);
    }
  }

  if (qtyInput === "" || Number.isNaN(qtyNum)) {
    alert("Ingresa una cantidad válida.");
    return;
  }

  // ENTRADA / SALIDA => mínimo 1, CONTEO => permite 0
  const qty = (addMovTipo === "CONTEO")
    ? Math.max(0, qtyNum)
    : Math.max(1, qtyNum);

  if (addMovTipo !== "CONTEO" && qty < 1) {
    alert("Ingresa una cantidad válida.");
    return;
  }
  if (addMovTipo === "CONTEO" && qty < 0) {
    alert("Ingresa una cantidad válida.");
    return;
  }

  if (addMovTipo === "ENTRADA") {
    if (!entradaFactura) return;
    addOrSumMovItem(entradaFactura.items, codigo, prod.producto || "", qty);
    renderFilasEntrada();
    actualizarPreviewEntrada();
  } else if (addMovTipo === "SALIDA") {
    if (!salidaFactura) return;
    addOrSumMovItem(salidaFactura.items, codigo, prod.producto || "", qty);
    renderFilasSalida();
    actualizarPreviewSalida();
  } else if (addMovTipo === "CONTEO") {
    if (!conteoDoc) return;
    addOrSumMovItem(conteoDoc.items, codigo, prod.producto || "", qty, { setAgregadoTs: true });
    renderFilasConteo();
    actualizarPreviewConteo();
  }

  // limpiar para seguir agregando rápido
  if (el("addMovCodigo")) el("addMovCodigo").value = "";
  if (el("addMovProducto")) el("addMovProducto").value = "";
  if (el("addMovQty")) el("addMovQty").value = "";
  if (el("addMovSug")) el("addMovSug").innerHTML = "";

  setTimeout(() => el("addMovCodigo")?.focus(), 50);
}

function ensureItemAgregadoTs(it, force = false){
  if (!it) return;

  const hasAny = !!(it.agregadoAtISO || it.agregadoAtEpoch || it.agregadoEn);
  if (hasAny && !force) return;

  const d = new Date();
  it.agregadoAtISO = d.toISOString();
  it.agregadoAtEpoch = d.getTime();
  it.agregadoEn = d.toLocaleString("es-HN");
}

function addOrSumMovItem(arr, codigo, producto, qty, opts){
  const o = opts || {};
  const setTs = !!o.setAgregadoTs;

  const codNorm = String(codigo || "").trim();
  const existing = arr.find(x => String(x.codigo || "").trim() === codNorm);

  if (existing) {
    const prev = Number(existing.cantidad || 0) || 0;
    existing.cantidad = prev + Number(qty || 0);
    existing.producto = producto || existing.producto || "";

    // Si estamos en CONTEO y el ítem venía de antes sin timestamp, lo sellamos.
    if (setTs && !existing.agregadoAtISO && !existing.agregadoAtEpoch && !existing.agregadoEn) {
      ensureItemAgregadoTs(existing, true);
    }
    return;
  }

  const nuevo = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo,
    producto: producto || "",
    cantidad: Number(qty || 0)
  };

  if (setTs) ensureItemAgregadoTs(nuevo, true);

  arr.push(nuevo);
}

// Eventos del modal (input + Enter)
el("addMovCodigo")?.addEventListener("input", (e) => onAddMovCodigoInput(e.target.value));
el("addMovCodigo")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    // ⚡ CONTEO rápido: muchos lectores mandan Enter al final.
    // Re-evaluar y (si corresponde) auto-agregar; si no, comportamiento normal.
    if (String(addMovTipo || "").toUpperCase() === "CONTEO" && isConteoQuickEnabled()) {
      try { onAddMovCodigoInput(e.target.value); } catch {}
      try { el("addMovCodigo")?.focus(); } catch {}
      return;
    }

    el("addMovQty")?.focus();
  }
});
el("addMovQty")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarAddMovItem();
});


/* ===== Vista previa fija ===== */
function actualizarPreviewEntrada(){
  const cont = el("opFacturaPreview");
  if (!cont) return;

  const lines = entradaFactura.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0);

  cont.innerHTML = lines.length ? lines.map(x => `
    <div class="factura-line">
      <div><b>${Number(x.cantidad || 0)}</b> u</div>
      <div>
        <div style="font-weight:900">${escapeHtml(x.codigo)}</div>
        <div class="factura-meta">${escapeHtml(x.producto || "Producto no encontrado")}</div>
      </div>
    </div>
  `).join("") : `<div class="factura-meta">Aún no hay productos en la factura.</div>`;

  const totLineas = lines.length;
  const totUnidades = lines.reduce((acc, x) => acc + Number(x.cantidad || 0), 0);

  const a = el("opTotLineas");
  const b = el("opTotUnidades");
  if (a) a.textContent = String(totLineas);
  if (b) b.textContent = String(totUnidades);


  saveOperadorDraft("ENTRADA", entradaFactura);
}

/* ===== Guardar ===== */
function guardarFacturaEntradas(){
  const f = entradaFactura;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0),
      // ✅ Fecha/hora por línea (cuando se agregó el producto al conteo)
      agregadoEn: x.agregadoEn || "",
      agregadoAtISO: x.agregadoAtISO || "",
      agregadoAtEpoch: x.agregadoAtEpoch || ""
    }));

  if (!String(f.facturaNo || "").trim()) {
    alert("Ingresa el número de factura.");
    return;
  }
  if (!String(f.proveedor || "").trim()) {
    alert("Ingresa el nombre del proveedor.");
    return;
  }
  if (!itemsOk.length) {
    alert("Agrega al menos un producto (código y cantidad).");
    return;
  }

  const snap = {
    id: f.id,
    fecha: f.fechaISO,
    proveedor: f.proveedor,
    facturaNo: f.facturaNo,
    items: itemsOk,
    totalLineas: itemsOk.length,
    totalUnidades: itemsOk.reduce((acc, x) => acc + x.cantidad, 0),
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()};

  // ✅ EDITAR
  if (operadorEdit && operadorEdit.tipo === "ENTRADA") {
    actualizarMovimientoExistente(operadorEdit.movId, "ENTRADA", snap);
    alert("✅ Cambios guardados.");
    clearOperadorDraft("ENTRADA");
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  facturasEntradas.unshift(snap);
  localStorage.setItem("facturasEntradas", JSON.stringify(facturasEntradas));

  registrarMovimiento("ENTRADA", snap);

  clearOperadorDraft("ENTRADA");

  alert("✅ Factura guardada localmente.");
  abrirEntradasOperador();
}




/* ================= OPERADOR: SALIDAS ================= */
async function abrirSalidasOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  operadorEdit = null;

  if (await maybeRestoreOperadorDraft("SALIDA", (d) => { salidaFactura = d; })) {
    renderSalidasOperador();
    return;
  }

  salidaFactura = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    facturaNo: "",
    motoristaId: "",
    motoristaNombre: "",
    placa: "",
    dispatchMode: false,
    items: []
  };

  renderSalidasOperador();
}

async function abrirSalidasOperadorEditar(movId){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));

  if (!mov || mov.tipo !== "SALIDA") {
    alert("No se encontró la factura de salida para editar.");
    abrirMovimientosOperador();
    return;
  }

  const d = mov.data || {};
  operadorEdit = { tipo: "SALIDA", movId: mov.id };

  salidaFactura = {
    id: d.id || Date.now(),
    fechaISO: d.fecha || d.fechaISO || new Date().toISOString().slice(0,10),
    facturaNo: d.facturaNo || "",
    items: []
  };

  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach(x => {
    const codigo = String(x.codigo || "").trim();
    const prod = getProdByCodigo(codigo);
    salidaFactura.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0
    });
  });

  // (sin filas vacías por defecto)
  renderSalidasOperador();
}

function renderSalidasOperador(){
  const f = salidaFactura;
  const isEdit = operadorEdit && (operadorEdit.tipo === "SALIDA" || operadorEdit.tipo === "SALIDA_PENDIENTE");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📤 Salidas</strong>
      ${f.dispatchMode ? `<div class="badge" style="margin-top:6px;">⏳ Despacho de pendiente</div>` : ``}
      <div class="muted">${isEdit ? "Editando factura guardada. Puedes cambiar cantidades o eliminar productos." : (isBodeguero() ? "Registra salidas con múltiples productos. Se guardan directamente en Movimientos." : "Registra salidas con múltiples productos. Se guardan en “Pendientes de salida” hasta que las despaches.")}</div>
    </div>

    <div class="card-lite">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input type="date" id="opSFecha" value="${escapeHtml(f.fechaISO)}" onchange="onSalidaFechaChange(this.value)" />
        </div>
        <div class="col">
          <label class="label">Factura / Referencia</label>
          <input id="opSFactura" placeholder="Ej: 000123" value="${escapeHtml(f.facturaNo)}" oninput="onSalidaFacturaChange(this.value)" ${f.dispatchMode ? "disabled" : ""} />
        </div>

        ${isOperador() ? `<div class="col">
          <label class="label">Motorista</label>
          <div class="picker-row">
            <input id="opSMotoristaNombre" readonly placeholder="Seleccionar motorista" value="${escapeHtml(f.motoristaNombre || "")}" onclick="opSeleccionarMotorista()" />
            <button type="button" class="secondary small" onclick="opSeleccionarMotorista()">Seleccionar</button>
          </div>
          <input type="hidden" id="opSMotoristaId" value="${escapeHtml(f.motoristaId || "")}" />
          <button type="button" class="small danger" style="margin-top:8px;" onclick="opLimpiarMotorista()">Limpiar</button>
        </div>

        <div class="col">
          <label class="label">Placa</label>
          <div class="picker-row">
            <input id="opSPlaca" placeholder="Ej: HAA1234" value="${escapeHtml(f.placa || "")}" oninput="onSalidaPlacaChange(this.value)" />
            <button type="button" class="secondary small" onclick="opSeleccionarPlaca()">Seleccionar</button>
          </div>
        ` : ``}


      </div>
    </div>

    <div class="card-lite">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <strong>Productos</strong>
        <button type="button" class="secondary small" onclick="abrirModalAddMovItem('SALIDA')" ${f.dispatchMode ? "disabled" : ""}>➕ Agregar</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="opItemsWrapSalida"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="opFacturaPreviewSalida"></div>
      <div class="btn-row" style="margin-top:10px;">
        <div class="btn-row">
          <button type="button" onclick="guardarFacturaSalidas()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar factura"}</button>
          <button type="button" class="secondary" onclick="borrarBorradorOperador('SALIDA')">🧹 Borrar borrador</button>
        </div>
        <button type="button" class="secondary" onclick="abrirMovimientosOperador()">📚 Ir a movimientos</button>
      </div>
    </div>
  `;

  renderFilasSalida();
  actualizarPreviewSalida();
}

function onSalidaFechaChange(v){
  if (!salidaFactura) return;
  salidaFactura.fechaISO = v;
  actualizarPreviewSalida();
}

function onSalidaFacturaChange(v){
  if (!salidaFactura) return;
  salidaFactura.facturaNo = v;
  actualizarPreviewSalida();
}

function onSalidaMotoristaChange(id){
  if (!salidaFactura) return;
  salidaFactura.motoristaId = id || "";
  salidaFactura.motoristaNombre = getMotoristaNombreById(id) || "";
  actualizarPreviewSalida();
}

function onSalidaPlacaChange(v){
  if (!salidaFactura) return;
  salidaFactura.placa = String(v || "").toUpperCase();
  actualizarPreviewSalida();
}


function renderFilasSalida(){
  const wrap = el("opItemsWrapSalida");
  if (!wrap) return;

  if (!salidaFactura.items.length) {
    wrap.innerHTML = `<div style="padding:12px; color:#6B7280; font-weight:800;">No hay productos agregados. Usa “Agregar”.</div>`;
    return;
  }

  wrap.innerHTML = salidaFactura.items.map((it) => {
    const qtyVal = (it.cantidad === "" || it.cantidad === null || it.cantidad === undefined)
      ? ""
      : Number(it.cantidad || 0);

    const pendVal = (it.pendiente === "" || it.pendiente === null || it.pendiente === undefined)
      ? ""
      : Number(it.pendiente || 0);

    const pendBase = Number(it.pendBase || 0);
    const isDispatch = !!(salidaFactura && salidaFactura.dispatchMode);

    return `
      <div class="op-row-wrap">
        <div class="op-row salida">
          <input
            id="opSCodigo_${it.id}"
            placeholder="Código"
            value="${escapeHtml(it.codigo)}"
            oninput="onCodigoSalidaInput('${it.id}', this.value)" ${isDispatch ? "disabled" : ""}
          />

          <button type="button" class="op-icon-btn secondary" onclick="abrirModalProductosOperador('${it.id}', 'SALIDA')" title="Buscar" ${isDispatch ? "disabled" : ""}>🔎</button>

          <input
            id="opSProd_${it.id}"
            placeholder="Producto"
            value="${escapeHtml(it.producto)}"
            disabled
          />

          <div class="op-qtypend">
            <input
              id="opSQty_${it.id}"
              type="number"
              min="0"
              value="${qtyVal}"
              placeholder="Cant."
              oninput="onCantidadSalidaInput('${it.id}', this.value)"
            />
${isOperador() ? `
            <input
              id="opSPend_${it.id}"
              type="number"
              min="0"
              value="${pendVal}"
              placeholder="Pend."
              ${isDispatch ? "disabled" : ""}
              oninput="onPendienteSalidaInput('${it.id}', this.value)"
            />
` : ``}
          </div>


          <button type="button" class="op-icon-btn op-del" onclick="borrarFilaSalida('${it.id}')" title="Eliminar">✖</button>
        </div>

        ${isDispatch ? `<div class="op-pend-note muted">Pendiente actual: <strong>${pendBase}</strong> • Quedará: <strong>${Number(pendVal || 0)}</strong></div>` : ``}

        <div id="opSSug_${it.id}" class="op-sugs"></div>
      </div>
    `;
  }).join("");
}

function agregarFilaSalida(){
  if (!salidaFactura) return;

  salidaFactura.items.push({
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo: "",
    producto: "",
    cantidad: "" // ✅ en blanco
  });

  renderFilasSalida();
  actualizarPreviewSalida();
}

function borrarFilaSalida(id){
  salidaFactura.items = salidaFactura.items.filter(x => x.id !== id);
  // (sin filas vacías por defecto)
  renderFilasSalida();
  actualizarPreviewSalida();
}

function onCodigoSalidaInput(id, value){
  const it = salidaFactura.items.find(x => x.id === id);
  if (!it) return;

  const formatted = formatCodigoAutoGuion(value);
  it.codigo = formatted;

  const input = el("opSCodigo_" + id);
  if (input && input.value !== formatted) input.value = formatted;

  const prod = getProdByCodigo(formatted);
  it.producto = prod ? (prod.producto || "") : "";

  const prodInput = el("opSProd_" + id);
  if (prodInput) prodInput.value = it.producto;

  updateSugerenciasSalida(id);
  actualizarPreviewSalida();
}

function onCantidadSalidaInput(id, value){
  const it = salidaFactura.items.find(x => x.id === id);
  if (!it) return;

  if (String(value || "").trim() === "") {
    it.cantidad = "";
    if (salidaFactura && salidaFactura.dispatchMode) {
      // si está en blanco, no se envía nada -> queda todo pendiente
      it.pendiente = Number(it.pendBase || it.pendiente || 0);
      const pi = el("opSPend_" + id);
      if (pi) pi.value = String(it.pendiente);
    }
    actualizarPreviewSalida();
    return;
  }

  let n = Math.max(0, Number(value || 0));

  if (salidaFactura && salidaFactura.dispatchMode) {
    const base = Number(it.pendBase || 0);
    if (n > base) {
      n = base;
      uiAlert("La cantidad enviada no puede ser mayor al pendiente actual.");
      const qi = el("opSQty_" + id);
      if (qi) qi.value = String(n);
    }
    it.cantidad = n;
    it.pendiente = Math.max(0, base - n);

    const pi = el("opSPend_" + id);
    if (pi) pi.value = String(it.pendiente);
  } else {
    it.cantidad = n;
  }

  actualizarPreviewSalida();
}

function onPendienteSalidaInput(id, value){
  const it = salidaFactura.items.find(x => x.id === id);
  if (!it) return;

  if (salidaFactura && salidaFactura.dispatchMode) return; // se calcula automáticamente en modo pendiente

  if (String(value || "").trim() === "") {
    it.pendiente = "";
    actualizarPreviewSalida();
    return;
  }

  it.pendiente = Math.max(0, Number(value || 0));
  actualizarPreviewSalida();
}


function updateSugerenciasSalida(id){
  const it = salidaFactura.items.find(x => x.id === id);
  if (!it) return;

  const q = String(it.codigo || "").toLowerCase().trim();
  const cont = el("opSSug_" + id);

  if (!cont) return;
  if (!q || q.length < 2) {
    cont.innerHTML = "";
    return;
  }

  const encontrados = catalogo
    .filter(p => (p.codigo || "").toLowerCase().includes(q) || (p.producto || "").toLowerCase().includes(q))
    .slice(0, 8);

  if (!encontrados.length) {
    cont.innerHTML = "";
    return;
  }

  cont.innerHTML = encontrados.map(p => `
    <span class="chip" onclick="seleccionarSugerenciaSalida('${id}', '${encodeURIComponent(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaSalida(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  
  const codigoDec = safeDecodeURIComponent(codigoFmt);
const it = salidaFactura.items.find(x => x.id === filaId);
  if (!it) return;

  const prod = getProdByCodigo(codigoDec);
  it.codigo = codigoDec;
  it.producto = prod ? (prod.producto || "") : "";

  const codeInput = el("opSCodigo_" + filaId);
  const prodInput = el("opSProd_" + filaId);
  if (codeInput) codeInput.value = it.codigo;
  if (prodInput) prodInput.value = it.producto;

  const cont = el("opSSug_" + filaId);
  if (cont) cont.innerHTML = "";

  actualizarPreviewSalida();
}

function actualizarPreviewSalida(){
  const box = el("opFacturaPreviewSalida");
  if (!box) return;

  const f = salidaFactura;

  const itemsShip = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

  const itemsPend = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.pendiente || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.pendiente || 0)
    }));

  const totalShip = itemsShip.reduce((acc, x) => acc + x.cantidad, 0);
  const totalPend = itemsPend.reduce((acc, x) => acc + x.cantidad, 0);

  const mot = String(f.motoristaNombre || "").trim() || (f.motoristaId ? getMotoristaNombreById(f.motoristaId) : "");
  const placa = String(f.placa || "").trim();

  box.innerHTML = `
    <div class="factura-head">
      <div>
        <div class="t">Factura: ${escapeHtml(String(f.facturaNo || "").trim() || "—")}</div>
        <div class="factura-meta">Fecha: ${escapeHtml(f.fechaISO || "")}</div>
        ${mot || placa ? `<div class="factura-meta">🚚 ${escapeHtml(mot || "Sin motorista")}${placa ? " • " + escapeHtml(placa) : ""}</div>` : ``}
        ${f.dispatchMode ? `<div class="factura-meta">⏳ Despacho de pendiente</div>` : ``}
      </div>
      <div style="text-align:right;">
        <div class="t">${totalShip} unid.</div>
        ${totalPend ? `<div class="factura-meta">⏳ Pend: ${totalPend}</div>` : `<div class="factura-meta">Sin pendientes</div>`}
      </div>
    </div>

    <div class="factura-items">
      ${itemsShip.length ? itemsShip.map(it => `
        <div class="factura-line">
          <div style="font-weight:900">${Number(it.cantidad || 0)}</div>
          <div>
            <div style="font-weight:900">${escapeHtml(it.codigo || "")}</div>
            <div class="factura-meta">${escapeHtml(it.producto || "")}</div>
          </div>
        </div>
      `).join("") : `<div class="muted">No hay productos enviados.</div>`}
    </div>

    <div class="factura-tot">
      <div>Total enviados</div>
      <div>${totalShip}</div>
    </div>
  `;
}

async function guardarFacturaSalidas(){
  // ✅ BODEGUERO: Salidas directas a Movimientos (sin motoristas / sin pendientes)
  if (isBodeguero()) {
    const f = salidaFactura || {};
    const facturaNo = String(f.facturaNo || "").trim();
    if (!facturaNo) {
      await uiAlert("Ingresa el número de factura o referencia.");
      return;
    }

    const itemsShip = (Array.isArray(f.items) ? f.items : [])
      .filter(x => (String(x.codigo || "").trim()) && Number(x.cantidad || 0) > 0)
      .map(x => ({
        codigo: String(x.codigo || "").trim(),
        producto: String(x.producto || "").trim(),
        cantidad: Number(x.cantidad || 0)
      }));

    if (!itemsShip.length) {
      await uiAlert("Agrega al menos un producto con cantidad (cantidad > 0).");
      return;
    }

    const snap = {
      id: f.id || Date.now(),
      fecha: f.fechaISO || new Date().toISOString().slice(0,10),
      fechaISO: f.fechaISO || new Date().toISOString().slice(0,10),
      facturaNo,
      motoristaId: String(f.motoristaId || "").trim(),
      motoristaNombre: String(f.motoristaNombre || "").trim(),
      placa: String(f.placa || "").trim().toUpperCase(),
      modo: "COMPLETA",
      items: itemsShip,
      creadoEn: nowStr(),
      creadoAtISO: new Date().toISOString(),
      creadoAtEpoch: Date.now()
    };

    // Editar movimiento existente
    if (operadorEdit && operadorEdit.tipo === "SALIDA") {
      actualizarMovimientoExistente(operadorEdit.movId, "SALIDA", snap);
      operadorEdit = null;
      clearOperadorDraft("SALIDA");
      await uiAlert("✅ Salida actualizada.");
      abrirMovimientosOperador();
      return;
    }

    // Registrar movimiento (directo)
    facturasSalidas.unshift(snap);
    localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));
    registrarMovimiento("SALIDA", snap);

    clearOperadorDraft("SALIDA");
    await uiAlert("✅ Salida guardada. Ya aparece en Movimientos.");

    // Mantenerse en Salidas (no navegar automáticamente)
    salidaFactura = {
      id: Date.now(),
      fechaISO: new Date().toISOString().slice(0,10),
      facturaNo: "",
      items: []
    };
    operadorEdit = null;
    renderSalidasOperador();
    return;
  }


  const f = salidaFactura;

  const facturaNo = String(f.facturaNo || "").trim();
  if (!facturaNo) {
    await uiAlert("Ingresa el número de factura o referencia.");
    return;
  }

  const itemsShip = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

  const itemsPend = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.pendiente || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.pendiente || 0)
    }));

  if (!itemsShip.length && !itemsPend.length) {
    await uiAlert("Agrega al menos un producto (código) y coloca cantidad enviada o pendiente.");
    return;
  }

  // En modo despacho pendiente, no permitimos “solo pendientes” sin enviar nada (porque no cambia nada)
  if (f.dispatchMode && !itemsShip.length) {
    await uiAlert("En un despacho pendiente debes enviar al menos un producto (cantidad > 0).");
    return;
  }

  // Validación motorista/placa (opcional, pero recomendado)
  if (!String(f.motoristaId || "").trim() && !String(f.motoristaNombre || "").trim()) {
    const ok = await uiConfirm("No seleccionaste motorista. ¿Deseas guardar de todos modos?", { title: "Motorista", icon: "🚚", okText: "Guardar" });
    if (!ok) return;
  }
  if (!String(f.placa || "").trim()) {
    const ok = await uiConfirm("No ingresaste placa. ¿Deseas guardar de todos modos?", { title: "Placa", icon: "🚛", okText: "Guardar" });
    if (!ok) return;
  }

  // Si es una salida normal (no despacho pendiente) y NO estás editando, validar que la factura sea única
  if (!operadorEdit && !f.dispatchMode) {
    const existsMov = facturasSalidas.some(x => String(x.facturaNo || "").trim() === facturaNo);
    const existsPend = getPendientesSalidaDespachoOp().some(x => String(x.facturaNo || "").trim() === facturaNo);

    if (existsMov) {
      await uiAlert("Ya existe una SALIDA despachada con esta factura/referencia. Revisa Movimientos.");
      return;
    }
    if (existsPend) {
      await uiAlert("Ya existe esta factura en Pendientes de salida. Edita la existente.");
      return;
    }
  }

  const totalShip = itemsShip.reduce((acc, x) => acc + x.cantidad, 0);
  const totalPend = itemsPend.reduce((acc, x) => acc + x.cantidad, 0);

  const snap = {
    id: f.id,
    fecha: f.fechaISO,
    facturaNo,
    motoristaId: f.motoristaId || "",
    motoristaNombre: String(f.motoristaNombre || "").trim() || (f.motoristaId ? getMotoristaNombreById(f.motoristaId) : ""),
    placa: String(f.placa || "").trim().toUpperCase(),
    modo: f.dispatchMode ? "DESPACHO_PENDIENTE" : (totalPend ? "PARCIAL" : "COMPLETA"),
    items: itemsShip,
    pendienteItems: itemsPend,
    pendienteTotalUnidades: totalPend,
    totalLineas: itemsShip.length,
    totalUnidades: totalShip,
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()
  };

  // ✅ EDITAR MOVIMIENTO (ya despachado)
  if (operadorEdit && operadorEdit.tipo === "SALIDA") {
    actualizarMovimientoExistente(operadorEdit.movId, "SALIDA", snap);
    await uiAlert("✅ Cambios guardados.");
    clearOperadorDraft("SALIDA");
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // Items completos (para la cola de despacho)
  const itemsFull = f.items
    .filter(x => (x.codigo || "").trim() && (Number(x.cantidad || 0) > 0 || Number(x.pendiente || 0) > 0))
    .map(x => ({
      codigo: String(x.codigo || "").trim(),
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0) || 0,
      pendiente: Number(x.pendiente || 0) || 0
    }));

  if (!itemsFull.length && !f.dispatchMode) {
    await uiAlert("Agrega al menos un producto con cantidad o pendiente.");
    return;
  }

  // ✅ EDITAR FACTURA EN COLA (Pendientes de salida)
  if (operadorEdit && operadorEdit.tipo === "SALIDA_PENDIENTE") {
    const list = getPendientesSalidaDespachoOp();
    const idx = list.findIndex(x => String(x.id) === String(operadorEdit.pendId));
    if (idx >= 0) {
      const prev = list[idx] || {};
      list[idx] = {
        ...prev,
        id: prev.id || f.id,
        fecha: f.fechaISO,
        facturaNo,
        motoristaId: f.motoristaId || "",
        motoristaNombre: String(f.motoristaNombre || "").trim() || (f.motoristaId ? getMotoristaNombreById(f.motoristaId) : ""),
        placa: String(f.placa || "").trim().toUpperCase(),
        items: itemsFull,
        actualizadoEn: nowStr(),
        actualizadoAtISO: new Date().toISOString(),
        actualizadoAtEpoch: Date.now()
      };
      savePendientesSalidaDespachoOp();
    }

    await uiAlert("✅ Factura actualizada en Pendientes de salida.");
    clearOperadorDraft("SALIDA");
    operadorEdit = null;
    goOperadorHomePSD();
    return;
  }

  // ✅ DESPACHO DE PRODUCTOS PENDIENTES (sí registra movimiento)
  if (f.dispatchMode) {
    // Guardar/actualizar pendientes de productos
    upsertPendienteSalida(facturaNo, itemsPend, {
      ultimoMotorista: snap.motoristaNombre,
      ultimaPlaca: snap.placa
    });

    // Registrar movimiento solo si se enviaron unidades
    if (itemsShip.length) {
      facturasSalidas.unshift(snap);
      localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));
      registrarMovimiento("SALIDA", snap);
    }

    clearOperadorDraft("SALIDA");

    if (totalPend) {
      await uiAlert(`✅ Despacho guardado. Queda pendiente: ${totalPend} unidades.`);
    } else {
      await uiAlert("✅ Despacho guardado. La factura quedó COMPLETA (sin pendientes).");
    }
    abrirPendientesOperador();
    return;
  }

  // ✅ NUEVA FACTURA: se envía a "Pendientes de salida" (NO a movimientos hasta despachar)
  const pendList = getPendientesSalidaDespachoOp();
  const ya = pendList.some(x => String(x.facturaNo || "").trim() === facturaNo);
  if (ya) {
    await uiAlert("Ya existe esta factura en Pendientes de salida. Usa Editar en esa factura.");
    return;
  }

  const pend = {
    id: f.id,
    fecha: f.fechaISO,
    facturaNo,
    motoristaId: f.motoristaId || "",
    motoristaNombre: String(f.motoristaNombre || "").trim() || (f.motoristaId ? getMotoristaNombreById(f.motoristaId) : ""),
    placa: String(f.placa || "").trim().toUpperCase(),
    items: itemsFull,
    totalLineas: itemsFull.length,
    totalUnidades: itemsFull.reduce((acc, x) => acc + Number(x.cantidad || 0), 0),
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now(),
    actualizadoEn: nowStr(),
    actualizadoAtISO: new Date().toISOString(),
    actualizadoAtEpoch: Date.now()
  };

  pendList.unshift(pend);
  savePendientesSalidaDespachoOp();

  clearOperadorDraft("SALIDA");
  await uiAlert("✅ Factura enviada a Pendientes de salida. En el HOME del Operador (Pendientes de salida) puedes DESPACHARLA y así aparecerá en Movimientos.");

  // Volver al HOME (Pendientes de salida)
  salidaFactura = {
    id: Date.now(),
    fechaISO: f.fechaISO || new Date().toISOString().slice(0,10),
    facturaNo: "",
    motoristaId: "",
    motoristaNombre: "",
    placa: "",
    dispatchMode: false,
    items: []
  };
  operadorEdit = null;
  goOperadorHomePSD();
  return;
}
/* ================= OPERADOR: TRANSFERENCIAS ================= */
async function abrirTransferenciasOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  operadorEdit = null;

  if (await maybeRestoreOperadorDraft("TRASLADO", (d) => { transferenciaDoc = d; })) {
    if (!Array.isArray(transferenciaDoc.items) || !transferenciaDoc.items.length) agregarFilaTransferencia();
    renderTransferenciasOperador();
    return;
  }

  transferenciaDoc = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    direccion: "P_A", // P_A o A_P
    referencia: "",
    items: []
  };

  agregarFilaTransferencia();
  renderTransferenciasOperador();
}

async function abrirTransferenciasOperadorEditar(movId){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));

  if (!mov || mov.tipo !== "TRASLADO") {
    alert("No se encontró la transferencia para editar.");
    abrirMovimientosOperador();
    return;
  }

  const d = mov.data || {};
  operadorEdit = { tipo: "TRASLADO", movId: mov.id };

  transferenciaDoc = {
    id: d.id || Date.now(),
    fechaISO: d.fecha || d.fechaISO || new Date().toISOString().slice(0,10),
    direccion: d.direccion || "P_A",
    referencia: d.referencia || "",
    items: []
  };

  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach(x => {
    const codigo = String(x.codigo || "").trim();
    const prod = getProdByCodigo(codigo);
    transferenciaDoc.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0
    });
  });

  if (!transferenciaDoc.items.length) agregarFilaTransferencia();
  renderTransferenciasOperador();
}

function renderTransferenciasOperador(){
  const f = transferenciaDoc;
  const isEdit = operadorEdit && operadorEdit.tipo === "TRASLADO";

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🔄 Transferencias</strong>
      <div class="muted">${isEdit ? "Editando transferencia guardada." : "Transferencias entre Bodega Principal y Anexo."}</div>
    </div>

    <div class="card-lite">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input type="date" id="opTFecha" value="${escapeHtml(f.fechaISO)}" onchange="onTransferFechaChange(this.value)" />
        </div>

        <div class="col">
          <label class="label">Dirección</label>
          <select id="opTDireccion" onchange="onTransferDireccionChange(this.value)">
            <option value="P_A" ${f.direccion === "P_A" ? "selected" : ""}>Principal → Anexo</option>
            <option value="A_P" ${f.direccion === "A_P" ? "selected" : ""}>Anexo → Principal</option>
          </select>
        </div>
      </div>

      <label class="label">Nota / Referencia</label>
      <input id="opTRef" placeholder="Ej: Traslado interno" value="${escapeHtml(f.referencia)}" oninput="onTransferRefChange(this.value)" />
    </div>

    <div class="card-lite">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <strong>Productos</strong>
        <button type="button" class="secondary small" onclick="agregarFilaTransferencia()">➕ Línea</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="opItemsWrapTransfer"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="opFacturaPreviewTransfer"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="guardarTransferencia()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar transferencia"}</button>
        <button type="button" class="secondary" onclick="borrarBorradorOperador('TRASLADO')">🧹 Borrar borrador</button>
        <button type="button" class="secondary" onclick="abrirMovimientosOperador()">📚 Ir a movimientos</button>
      </div>
    </div>
  `;

  renderFilasTransferencia();
  actualizarPreviewTransferencia();
}

function onTransferFechaChange(v){
  if (!transferenciaDoc) return;
  transferenciaDoc.fechaISO = v;
  actualizarPreviewTransferencia();
}

function onTransferDireccionChange(v){
  if (!transferenciaDoc) return;
  transferenciaDoc.direccion = v;
  actualizarPreviewTransferencia();
}

function onTransferRefChange(v){
  if (!transferenciaDoc) return;
  transferenciaDoc.referencia = v;
  actualizarPreviewTransferencia();
}

function renderFilasTransferencia(){
  const wrap = el("opItemsWrapTransfer");
  if (!wrap) return;

  wrap.innerHTML = transferenciaDoc.items.map((it) => {
    const qtyVal = (it.cantidad === "" || it.cantidad === null || it.cantidad === undefined)
      ? ""
      : Number(it.cantidad || 0);

    return `
      <div class="op-row-wrap">
        <div class="op-row">
          <input
            id="opTCodigo_${it.id}"
            placeholder="Código"
            value="${escapeHtml(it.codigo)}"
            oninput="onCodigoTransferInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn secondary" onclick="abrirModalProductosOperador('${it.id}', 'TRASLADO')" title="Buscar">🔎</button>

          <input
            id="opTProd_${it.id}"
            placeholder="Producto"
            value="${escapeHtml(it.producto)}"
            disabled
          />

          <input
            id="opTQty_${it.id}"
            type="number"
            min="1"
            value="${qtyVal}"
            oninput="onCantidadTransferInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn op-del" onclick="borrarFilaTransferencia('${it.id}')" title="Eliminar">✖</button>
        </div>

        <div id="opTSug_${it.id}" class="op-sugs"></div>
      </div>
    `;
  }).join("");
}

function agregarFilaTransferencia(){
  if (!transferenciaDoc) return;

  transferenciaDoc.items.push({
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo: "",
    producto: "",
    cantidad: "" // ✅ en blanco
  });

  renderFilasTransferencia();
  actualizarPreviewTransferencia();
}

function borrarFilaTransferencia(id){
  transferenciaDoc.items = transferenciaDoc.items.filter(x => x.id !== id);
  if (!transferenciaDoc.items.length) agregarFilaTransferencia();
  renderFilasTransferencia();
  actualizarPreviewTransferencia();
}

function onCodigoTransferInput(id, value){
  const it = transferenciaDoc.items.find(x => x.id === id);
  if (!it) return;

  const formatted = formatCodigoAutoGuion(value);
  it.codigo = formatted;

  const input = el("opTCodigo_" + id);
  if (input && input.value !== formatted) input.value = formatted;

  const prod = getProdByCodigo(formatted);
  it.producto = prod ? (prod.producto || "") : "";

  const prodInput = el("opTProd_" + id);
  if (prodInput) prodInput.value = it.producto;

  updateSugerenciasTransferencia(id);
  actualizarPreviewTransferencia();
}

function onCantidadTransferInput(id, value){
  const it = transferenciaDoc.items.find(x => x.id === id);
  if (!it) return;

  if (String(value || "").trim() === "") {
    it.cantidad = "";
    actualizarPreviewTransferencia();
    return;
  }

  it.cantidad = Math.max(1, Number(value || 1));
  actualizarPreviewTransferencia();
}

function updateSugerenciasTransferencia(id){
  const it = transferenciaDoc.items.find(x => x.id === id);
  if (!it) return;

  const q = String(it.codigo || "").toLowerCase().trim();
  const cont = el("opTSug_" + id);

  if (!cont) return;
  if (!q || q.length < 2) {
    cont.innerHTML = "";
    return;
  }

  const encontrados = catalogo
    .filter(p => (p.codigo || "").toLowerCase().includes(q) || (p.producto || "").toLowerCase().includes(q))
    .slice(0, 8);

  if (!encontrados.length) {
    cont.innerHTML = "";
    return;
  }

  cont.innerHTML = encontrados.map(p => `
    <span class="chip" onclick="seleccionarSugerenciaTransferencia('${id}', '${encodeURIComponent(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaTransferencia(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  
  const codigoDec = safeDecodeURIComponent(codigoFmt);
const it = transferenciaDoc.items.find(x => x.id === filaId);
  if (!it) return;

  const prod = getProdByCodigo(codigoDec);
  it.codigo = codigoDec;
  it.producto = prod ? (prod.producto || "") : "";

  const codeInput = el("opTCodigo_" + filaId);
  const prodInput = el("opTProd_" + filaId);
  if (codeInput) codeInput.value = it.codigo;
  if (prodInput) prodInput.value = it.producto;

  const cont = el("opTSug_" + filaId);
  if (cont) cont.innerHTML = "";

  actualizarPreviewTransferencia();
}

function actualizarPreviewTransferencia(){
  const box = el("opFacturaPreviewTransfer");
  if (!box || !transferenciaDoc) return;

  const f = transferenciaDoc;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || (getProdByCodigo(x.codigo)?.producto || ""),
      cantidad: Number(x.cantidad || 0)
    }));

  const dirLabel = f.direccion === "A_P" ? "Anexo → Principal" : "Principal → Anexo";

  box.innerHTML = `
    <div class="factura-head">
      <div>
        <div class="t">Transferencia</div>
        <div class="factura-meta">${escapeHtml(dirLabel)} • ${escapeHtml(f.fechaISO || "")}</div>
        ${f.referencia ? `<div class="factura-meta">${escapeHtml(f.referencia)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div class="t">#${escapeHtml(String(f.id))}</div>
        <div class="factura-meta">${itemsOk.length} líneas</div>
      </div>
    </div>

    <div class="factura-items">
      ${
        itemsOk.length
          ? itemsOk.map(it => `
            <div class="factura-line">
              <div><b>${it.cantidad}</b> x</div>
              <div>
                <div style="font-weight:900">${escapeHtml(it.codigo)}</div>
                <div class="factura-meta">${escapeHtml(it.producto)}</div>
              </div>
            </div>
          `).join("")
          : `<div class="factura-meta">Agrega productos para ver el resumen.</div>`
      }
    </div>

    <div class="factura-tot">
      <span>Total unidades</span>
      <span>${itemsOk.reduce((acc, x) => acc + x.cantidad, 0)}</span>
    </div>
  `;


  saveOperadorDraft("TRASLADO", transferenciaDoc);
}

function guardarTransferencia(){
  const f = transferenciaDoc;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

  if (!itemsOk.length) {
    alert("Agrega al menos un producto (código y cantidad).");
    return;
  }

  const snap = {
    id: f.id,
    fecha: f.fechaISO,
    direccion: f.direccion,
    referencia: f.referencia,
    items: itemsOk,
    totalLineas: itemsOk.length,
    totalUnidades: itemsOk.reduce((acc, x) => acc + x.cantidad, 0),
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()
  };

  // ✅ EDITAR
  if (operadorEdit && operadorEdit.tipo === "TRASLADO") {
    actualizarMovimientoExistente(operadorEdit.movId, "TRASLADO", snap);
    alert("✅ Cambios guardados.");
    clearOperadorDraft("TRASLADO");
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  transferencias.unshift(snap);
  localStorage.setItem("transferencias", JSON.stringify(transferencias));

  registrarMovimiento("TRASLADO", snap);

  clearOperadorDraft("TRASLADO");

  alert("✅ Transferencia guardada localmente.");
  abrirTransferenciasOperador();
}

/* ================= OPERADOR: CONTEOS ================= */
async function abrirConteosOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  operadorEdit = null;

  if (await maybeRestoreOperadorDraft("CONTEO", (d) => { conteoDoc = d; })) {
    renderConteosOperador();
    renderFilasConteo();
    actualizarPreviewConteo();
    return;
  }

  conteoDoc = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    referencia: "",
    items: []
  };

  // Inicia vacío: agregar productos desde el modal
  renderConteosOperador();
  renderFilasConteo();
  actualizarPreviewConteo();
}

async function abrirConteosOperadorEditar(movId){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));

  if (!mov || mov.tipo !== "CONTEO") {
    alert("No se encontró el conteo para editar.");
    abrirMovimientosOperador();
    return;
  }

  const d = mov.data || {};
  operadorEdit = { tipo: "CONTEO", movId: mov.id };

  conteoDoc = {
    id: d.id || Date.now(),
    fechaISO: d.fecha || d.fechaISO || new Date().toISOString().slice(0,10),
    referencia: d.referencia || "",
    items: []
  };

  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach(x => {
    const codigo = String(x.codigo || "").trim();
    const prod = getProdByCodigo(codigo);
    conteoDoc.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0,

      // ✅ Mantener sello por línea al editar (para que siga saliendo por línea en Excel)
      agregadoAtISO: x.agregadoAtISO || "",
      agregadoAtEpoch: x.agregadoAtEpoch || "",
      agregadoEn: x.agregadoEn || ""
    });
  });

  if (!conteoDoc.items.length) agregarFilaConteo();
  renderConteosOperador();
}

function renderConteosOperador(){
  const f = conteoDoc;
  const isEdit = operadorEdit && operadorEdit.tipo === "CONTEO";

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>✅ Conteos</strong>
      <div class="muted">${isEdit ? "Editando conteo guardado." : "Realiza conteo de inventario por productos."}</div>
    </div>

    <div class="card-lite">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input type="date" id="opCFecha" value="${escapeHtml(f.fechaISO)}" onchange="onConteoFechaChange(this.value)" />
        </div>
        <div class="col">
          <label class="label">Referencia</label>
          <input id="opCRef" placeholder="Ej: Conteo enero" value="${escapeHtml(f.referencia)}" oninput="onConteoRefChange(this.value)" />
        </div>
      </div>
    </div>

    <div class="card-lite">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <strong>Productos</strong>
        <button type="button" class="secondary small" onclick="abrirModalAddMovItem('CONTEO')">➕ Agregar producto</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="opItemsWrapConteo"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="opFacturaPreviewConteo"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="guardarConteo()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar conteo"}</button>
        <button type="button" class="secondary" onclick="borrarBorradorOperador('CONTEO')">🧹 Borrar borrador</button>
        <button type="button" class="secondary" onclick="abrirMovimientosOperador()">📚 Ir a movimientos</button>
      </div>
    </div>
  `;

  renderFilasConteo();
  actualizarPreviewConteo();
}

function onConteoFechaChange(v){
  if (!conteoDoc) return;
  conteoDoc.fechaISO = v;
  actualizarPreviewConteo();
}

function onConteoRefChange(v){
  if (!conteoDoc) return;
  conteoDoc.referencia = v;
  actualizarPreviewConteo();
}

function renderFilasConteo(){
  const wrap = el("opItemsWrapConteo");
  if (!wrap) return;

  wrap.innerHTML = conteoDoc.items.map((it) => {
    const qtyVal = (it.cantidad === "" || it.cantidad === null || it.cantidad === undefined)
      ? ""
      : Number(it.cantidad || 0);

    return `
      <div class="op-row-wrap">
        <div class="op-row">
          <input
            id="opCCodigo_${it.id}"
            placeholder="Código"
            value="${escapeHtml(it.codigo)}"
            oninput="onCodigoConteoInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn secondary" onclick="abrirModalProductosOperador('${it.id}', 'CONTEO')" title="Buscar">🔎</button>

          <input
            id="opCProd_${it.id}"
            placeholder="Producto"
            value="${escapeHtml(it.producto)}"
            disabled
          />

          <input
            id="opCQty_${it.id}"
            type="number"
            min="0"
            value="${qtyVal}"
            oninput="onCantidadConteoInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn op-del" onclick="borrarFilaConteo('${it.id}')" title="Eliminar">✖</button>
        </div>

        <div id="opCSug_${it.id}" class="op-sugs"></div>
      </div>
    `;
  }).join("");
}

function agregarFilaConteo(){
  if (!conteoDoc) return;

  conteoDoc.items.push({
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo: "",
    producto: "",
    cantidad: "" // ✅ en blanco
  });

  renderFilasConteo();
  actualizarPreviewConteo();
}

function borrarFilaConteo(id){
  conteoDoc.items = conteoDoc.items.filter(x => x.id !== id);
  if (!conteoDoc.items.length) agregarFilaConteo();
  renderFilasConteo();
  actualizarPreviewConteo();
}

function onCodigoConteoInput(id, value){
  const it = conteoDoc.items.find(x => x.id === id);
  if (!it) return;

  const prevCode = String(it.codigo || "").trim();
  const formatted = formatCodigoAutoGuion(value);
  it.codigo = formatted;

  const input = el("opCCodigo_" + id);
  if (input && input.value !== formatted) input.value = formatted;

  const prod = getProdByCodigo(formatted);
  it.producto = prod ? (prod.producto || "") : "";

  // ✅ Sello por línea (fecha/hora) cuando el código se vuelve válido en CONTEO
  if (prod && formatted && (prevCode !== String(formatted).trim() || (!it.agregadoAtISO && !it.agregadoAtEpoch && !it.agregadoEn))) {
    ensureItemAgregadoTs(it, true);
  }

  const prodInput = el("opCProd_" + id);
  if (prodInput) prodInput.value = it.producto;

  updateSugerenciasConteo(id);
  actualizarPreviewConteo();
}
function onCantidadConteoInput(id, value){
  const it = conteoDoc.items.find(x => x.id === id);
  if (!it) return;

  if (String(value || "").trim() === "") {
    it.cantidad = "";
    actualizarPreviewConteo();
    return;
  }

  it.cantidad = Math.max(0, Number(value || 0));
  actualizarPreviewConteo();
}

function updateSugerenciasConteo(id){
  const it = conteoDoc.items.find(x => x.id === id);
  if (!it) return;

  const q = String(it.codigo || "").toLowerCase().trim();
  const cont = el("opCSug_" + id);

  if (!cont) return;
  if (!q || q.length < 2) {
    cont.innerHTML = "";
    return;
  }

  const encontrados = catalogo
    .filter(p => (p.codigo || "").toLowerCase().includes(q) || (p.producto || "").toLowerCase().includes(q))
    .slice(0, 8);

  if (!encontrados.length) {
    cont.innerHTML = "";
    return;
  }

  cont.innerHTML = encontrados.map(p => `
    <span class="chip" onclick="seleccionarSugerenciaConteo('${id}', '${encodeURIComponent(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaConteo(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  
  const codigoDec = safeDecodeURIComponent(codigoFmt);
const it = conteoDoc.items.find(x => x.id === filaId);
  if (!it) return;

  const prevCode = String(it.codigo || "").trim();

  const prod = getProdByCodigo(codigoDec);
  it.codigo = codigoDec;
  it.producto = prod ? (prod.producto || "") : "";

  // ✅ Sello por línea (fecha/hora) cuando se selecciona una sugerencia en CONTEO
  if (prod && codigoDec && (prevCode !== String(codigoDec).trim() || (!it.agregadoAtISO && !it.agregadoAtEpoch && !it.agregadoEn))) {
    ensureItemAgregadoTs(it, true);
  }

  const codeInput = el("opCCodigo_" + filaId);
  const prodInput = el("opCProd_" + filaId);
  if (codeInput) codeInput.value = it.codigo;
  if (prodInput) prodInput.value = it.producto;

  const cont = el("opCSug_" + filaId);
  if (cont) cont.innerHTML = "";

  actualizarPreviewConteo();
}

function actualizarPreviewConteo(){
  const box = el("opFacturaPreviewConteo");
  if (!box || !conteoDoc) return;

  const f = conteoDoc;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && String(x.cantidad).trim() !== "" )
    .map(x => {
      const prod = getProdByCodigo(x.codigo);
      return {
        codigo: x.codigo,
        producto: x.producto || (prod ? (prod.producto || "") : ""),
        cantidad: Number(x.cantidad || 0),
        stock: prod ? Number(prod.stockTotal || 0) : null
      };
    });

  box.innerHTML = `
    <div class="factura-head">
      <div>
        <div class="t">Conteo</div>
        <div class="factura-meta">Fecha: ${escapeHtml(f.fechaISO || "")}</div>
        ${f.referencia ? `<div class="factura-meta">${escapeHtml(f.referencia)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div class="t">#${escapeHtml(String(f.id))}</div>
        <div class="factura-meta">${itemsOk.length} líneas</div>
      </div>
    </div>

    <div class="factura-items">
      ${
        itemsOk.length
          ? itemsOk.map(it => `
            <div class="factura-line">
              <div><b>${it.cantidad}</b> x</div>
              <div>
                <div style="font-weight:900">${escapeHtml(it.codigo)}</div>
                <div class="factura-meta">${escapeHtml(it.producto)}</div>
                ${it.stock !== null ? `<div class="factura-meta">Stock actual: ${it.stock}</div>` : ""}
              </div>
            </div>
          `).join("")
          : `<div class="factura-meta">Agrega productos para ver el resumen.</div>`
      }
    </div>

    <div class="factura-tot">
      <span>Items</span>
      <span>${itemsOk.length}</span>
    </div>
  `;


  saveOperadorDraft("CONTEO", conteoDoc);
}

function guardarConteo(){
  const f = conteoDoc;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && String(x.cantidad).trim() !== "" )
    .map(x => {
      // ✅ Asegurar sello por línea (si por alguna razón no se estableció al agregar/seleccionar)
      if (!x.agregadoAtISO && !x.agregadoAtEpoch && !x.agregadoEn) {
        try { ensureItemAgregadoTs(x, true); } catch {}
      }

      return {
        codigo: x.codigo,
        producto: x.producto || "",
        cantidad: Number(x.cantidad || 0),

        // ✅ Persistir timestamp por línea para exportación a Excel
        agregadoAtISO: x.agregadoAtISO || "",
        agregadoAtEpoch: x.agregadoAtEpoch || "",
        agregadoEn: x.agregadoEn || ""
      };
    });

  if (!itemsOk.length) {
    alert("Agrega al menos un producto (código y cantidad contada).");
    return;
  }

  const snap = {
    id: f.id,
    fecha: f.fechaISO,
    referencia: f.referencia,
    items: itemsOk,
    totalLineas: itemsOk.length,
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()
  };

  // ✅ EDITAR
  if (operadorEdit && operadorEdit.tipo === "CONTEO") {
    actualizarMovimientoExistente(operadorEdit.movId, "CONTEO", snap);
    alert("✅ Cambios guardados.");
    clearOperadorDraft("CONTEO");
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  conteos.unshift(snap);
  localStorage.setItem("conteos", JSON.stringify(conteos));

  registrarMovimiento("CONTEO", snap);

  clearOperadorDraft("CONTEO");

  alert("✅ Conteo guardado localmente.");
  abrirConteosOperador();
}


/* ================= OPERADOR: MOVIMIENTOS ================= */
function movTipoLabel(tipo){
  switch (tipo) {
    case "ENTRADA": return "📥 Entrada";
    case "SALIDA": return "📤 Salida";
    case "TRASLADO": return "🔄 Transferencia";
    case "CONTEO": return "✅ Conteo";
    default: return tipo || "Movimiento";
  }
}

function storeKeyByMovTipo(tipo){
  switch (tipo) {
    case "ENTRADA": return "facturasEntradas";
    case "SALIDA": return "facturasSalidas";
    case "TRASLADO": return "transferencias";
    case "CONTEO": return "conteos";
    default: return null;
  }
}

function buildResumenMovimiento(tipo, data){
  const d = data || {};
  if (tipo === "ENTRADA") {
    const fac = d.facturaNo ? `Factura ${d.facturaNo}` : "Entrada";
    const prov = d.proveedor ? ` • ${d.proveedor}` : "";
    return `${fac}${prov} • ${d.totalLineas || 0} líneas`;
  }
  if (tipo === "SALIDA") {
    const fac = d.facturaNo ? `Factura ${d.facturaNo}` : "Salida";
    const mot = d.motoristaNombre ? ` • 🚚 ${d.motoristaNombre}` : "";
    const pla = d.placa ? ` • ${d.placa}` : "";
    return `${fac}${mot}${pla} • ${d.totalLineas || 0} líneas`;
  }
  if (tipo === "TRASLADO") {
    const dir = d.direccion === "A_P" ? "Anexo → Principal" : "Principal → Anexo";
    const ref = d.referencia ? ` • ${d.referencia}` : "";
    return `${dir}${ref} • ${d.totalLineas || 0} líneas`;
  }
  if (tipo === "CONTEO") {
    const ref = d.referencia ? d.referencia : "Sin referencia";
    return `${ref} • ${d.totalLineas || 0} líneas`;
  }
  return "";
}

function abrirMovimientosOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📚 Movimientos</strong>
      <div class="muted">Entradas • Salidas • Transferencias • Conteos</div>
    </div>

    <button type="button" onclick="exportarMovimientosExcelYVaciar()">📊 Exportar a Excel y vaciar movimientos</button>

    <div class="card-lite">
      <div class="row">
        <div class="col">
          <label class="label">Buscar</label>
          <input id="opBuscarMov" placeholder="Código, producto, proveedor, factura, referencia..." />
        </div>
        <div class="col">
          <label class="label">Tipo</label>
          <select id="opTipoMov">
            <option value="">Todos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SALIDA">Salidas</option>
            <option value="TRASLADO">Transferencias</option>
            <option value="CONTEO">Conteos</option>
          </select>
        </div>
      </div>
    </div>

    <div id="opMovList"></div>
  `;

  el("opBuscarMov")?.addEventListener("input", () => {
    el("opMovList").innerHTML = renderMovimientosOperador();
  });
  el("opTipoMov")?.addEventListener("change", () => {
    el("opMovList").innerHTML = renderMovimientosOperador();
  });

  el("opMovList").innerHTML = renderMovimientosOperador();
}

function registrarMovimiento(tipo, data){
  const fecha = data?.fecha || data?.fechaISO || new Date().toISOString().slice(0,10);

  const mov = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    tipo,
    fecha,
    rol: getRole(),
    bodega: getBodegaActual(),
    resumen: buildResumenMovimiento(tipo, data),
    data,
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()
  };

  movimientos.unshift(mov);
  localStorage.setItem("movimientos", JSON.stringify(movimientos));
}

function actualizarMovimientoExistente(movId, tipo, data){
  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const idx = movimientos.findIndex(m => String(m.id) === String(movId));

  if (idx < 0) {
    // si no existe, lo registramos como nuevo
    registrarMovimiento(tipo, data);
  } else {
    movimientos[idx].tipo = tipo;
    movimientos[idx].fecha = data?.fecha || data?.fechaISO || movimientos[idx].fecha;
    movimientos[idx].resumen = buildResumenMovimiento(tipo, data);
    movimientos[idx].data = data;
    movimientos[idx].editadoEn = nowStr();
    movimientos[idx].editadoAtISO = new Date().toISOString();
    movimientos[idx].editadoAtEpoch = Date.now();
    localStorage.setItem("movimientos", JSON.stringify(movimientos));
  }

  // actualizar el array específico del tipo (por id de la factura/doc)
  const key = storeKeyByMovTipo(tipo);
  if (!key) return;

  let arr = JSON.parse(localStorage.getItem(key) || "[]");
  const did = String(data?.id || "");
  const i = arr.findIndex(x => String(x.id) === did);

  if (i >= 0) arr[i] = data;
  else arr.unshift(data);

  localStorage.setItem(key, JSON.stringify(arr));

  // refrescar variables en memoria
  if (tipo === "ENTRADA") facturasEntradas = arr;
  if (tipo === "SALIDA") facturasSalidas = arr;
  if (tipo === "TRASLADO") transferencias = arr;
  if (tipo === "CONTEO") conteos = arr;
}

function editarMovimientoOperador(movId){
  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));
  if (!mov) return;

  if (mov.tipo === "ENTRADA") return abrirEntradasOperadorEditar(mov.id);
  if (mov.tipo === "SALIDA") return abrirSalidasOperadorEditar(mov.id);
  if (mov.tipo === "TRASLADO") return abrirTransferenciasOperadorEditar(mov.id);
  if (mov.tipo === "CONTEO") return abrirConteosOperadorEditar(mov.id);

  alert("Este movimiento aún no tiene editor.");
}

async function eliminarMovimientoOperador(movId){
  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));
  if (!mov) return;

  const label = movTipoLabel(mov.tipo);
  const ok = await uiConfirm(`¿Eliminar ${label} del ${mov.fecha}?`, { title: "Eliminar", icon: "🗑️", okText: "Eliminar", cancelText: "Cancelar" });
  if (!ok) return;

  // quitar de movimientos
  movimientos = movimientos.filter(m => String(m.id) !== String(movId));
  localStorage.setItem("movimientos", JSON.stringify(movimientos));

  // quitar del array específico
  const key = storeKeyByMovTipo(mov.tipo);
  if (key) {
    let arr = JSON.parse(localStorage.getItem(key) || "[]");
    const did = String(mov.data?.id || "");
    if (did) arr = arr.filter(x => String(x.id) !== did);
    localStorage.setItem(key, JSON.stringify(arr));

    if (mov.tipo === "ENTRADA") facturasEntradas = arr;
    if (mov.tipo === "SALIDA") facturasSalidas = arr;
    if (mov.tipo === "TRASLADO") transferencias = arr;
    if (mov.tipo === "CONTEO") conteos = arr;
  }

  abrirMovimientosOperador();
}



async function despacharGrupoPendientesSalidaOperador(groupKey){
  const key = String(groupKey || "").trim();
  const listAll = (getPendientesSalidaDespachoOp() || []).slice();

  const groupList = listAll.filter(p => {
    const nombre = String(p.motoristaNombre || "").trim();
    const k = nombre ? nombre.toUpperCase() : "__SIN__";
    return k === key;
  });

  if (!groupList.length) {
    await uiAlert("No hay facturas en este grupo para despachar.");
    return;
  }

  // Pedir motorista (una sola vez)
  const motoristas = await loadMotoristasRepo();

  const defaultId = String(groupList.find(x => String(x.motoristaId || "").trim())?.motoristaId || "");
  const defaultNombre = (key === "__SIN__") ? "" : String(groupList[0].motoristaNombre || "").trim();

  const placasSet = new Set(
    groupList
      .map(x => String(x.placa || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const defaultPlaca = (placasSet.size === 1) ? Array.from(placasSet)[0] : "";

  const placas = await loadPlacasRepo();
  const r = await dsAbrir({
    motoristas,
    placas,
    defaultId,
    defaultNombre,
    defaultPlaca
  });
  if (!r) return;

  // Separar facturas despachables / no despachables
  const dispatchables = [];
  const skipped = [];

  for (const p of groupList) {
    const items = Array.isArray(p.items) ? p.items : [];
    const itemsShip = items
      .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
      .map(x => ({
        codigo: String(x.codigo || "").trim(),
        producto: x.producto || "",
        cantidad: Number(x.cantidad || 0)
      }));

    if (!itemsShip.length) {
      skipped.push(p);
      continue;
    }

    dispatchables.push({ p, itemsShip });
  }

  if (!dispatchables.length) {
    await uiAlert("Ninguna factura del grupo tiene cantidades para despachar (cantidad > 0). Usa Editar y coloca cantidades enviadas.");
    return;
  }

  if (skipped.length) {
    const okSkip = await uiConfirm(
      `Hay ${skipped.length} factura(s) sin cantidades para despachar y serán omitidas.\n\n¿Continuar con las demás?`,
      { title: "Omitir facturas", icon: "⚠️", okText: "Continuar", cancelText: "Cancelar" }
    );
    if (!okSkip) return;
  }

  const ok = await uiConfirm(
    `Vas a despachar ${dispatchables.length} factura(s) con el motorista:\n\n${String(r.motoristaNombre || "").trim()}\n\n¿Confirmar?`,
    { title: "Despachar todo", icon: "🚚", okText: "Despachar", cancelText: "Cancelar" }
  );
  if (!ok) return;

  // Despachar en lote
  for (const { p, itemsShip } of dispatchables) {
    const items = Array.isArray(p.items) ? p.items : [];

    const itemsPend = items
      .filter(x => (x.codigo || "").trim() && Number(x.pendiente || 0) > 0)
      .map(x => ({
        codigo: String(x.codigo || "").trim(),
        producto: x.producto || "",
        cantidad: Number(x.pendiente || 0)
      }));

    const totalShip = itemsShip.reduce((a,x)=> a + Number(x.cantidad || 0), 0);
    const totalPend = itemsPend.reduce((a,x)=> a + Number(x.cantidad || 0), 0);

    const now = new Date();
    const placaUse = String((r.placa || "") || (p.placa || "")).trim().toUpperCase();

    const snap = {
      id: p.id || Date.now(),
      fecha: p.fecha || new Date().toISOString().slice(0,10),
      facturaNo: String(p.facturaNo || "").trim(),
      motoristaId: r.motoristaId || "",
      motoristaNombre: String(r.motoristaNombre || "").trim(),
      placa: placaUse,
      modo: totalPend ? "PARCIAL" : "COMPLETA",
      items: itemsShip,
      pendienteItems: itemsPend,
      pendienteTotalUnidades: totalPend,
      totalLineas: itemsShip.length,
      totalUnidades: totalShip,
      despachadoEn: nowStr(),
      despachadoAtISO: now.toISOString(),
      despachadoAtEpoch: now.getTime(),
      preparadoEn: p.creadoEn || "",
      preparadoAtISO: p.creadoAtISO || "",
      preparadoAtEpoch: p.creadoAtEpoch || 0
    };

    // Si queda pendiente de productos, guardarlo
    upsertPendienteSalida(snap.facturaNo, itemsPend, {
      ultimoMotorista: snap.motoristaNombre,
      ultimaPlaca: snap.placa
    });

    // Registrar movimiento
    facturasSalidas.unshift(snap);
    registrarMovimiento("SALIDA", snap);

    // Eliminar de la cola de despacho
    removeSalidaPendienteDespacho(p.id);
  }

  // Guardar facturasSalidas (una vez)
  localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));

  // Refrescar lista
  const w = el("opPSDWrap");
  if (w) w.innerHTML = renderPendientesSalidaOperador();

  await uiAlert(`✅ Despachadas ${dispatchables.length} factura(s). Ya aparecen en Movimientos.`);
}

function renderMovimientosOperador(){
  const q = (el("opBuscarMov")?.value || "").toLowerCase().trim();
  const tipoSel = (el("opTipoMov")?.value || "").trim();

  const filtrados = movimientos.filter(m => {
    if (tipoSel && m.tipo !== tipoSel) return false;

    const d = m.data || {};
    const items = Array.isArray(d.items) ? d.items : [];

    const hay = [
      m.tipo,
      m.fecha,
      m.resumen,
      d.facturaNo,
      d.proveedor,
      d.referencia,
      d.direccion,
      ...items.map(x => x.codigo),
      ...items.map(x => x.producto)
    ].join(" ").toLowerCase();

    return !q || hay.includes(q);
  });

  if (!filtrados.length) {
    return `<div class="card"><strong>No hay movimientos.</strong><div class="muted">Guarda una entrada, salida, transferencia o conteo.</div></div>`;
  }

  return filtrados.slice(0, 150).map(m => {
    const d = m.data || {};
    const items = Array.isArray(d.items) ? d.items : [];

    const itemsHtml = items.length
      ? items.map(it => `
          <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--borde);">
            <div>
              <div style="font-weight:900">${escapeHtml(it.codigo || "")}</div>
              <div class="muted" style="margin-top:0">${escapeHtml(it.producto || "")}</div>
            </div>
            <div style="font-weight:900; white-space:nowrap">${Number(it.cantidad || 0)}</div>
          </div>
        `).join("")
      : `<div class="muted">Sin productos.</div>`;

    
    const extraMeta = (String(m.tipo || "").toUpperCase() === "SALIDA" && (d.motoristaNombre || d.placa || d.modo || Number(d.pendienteTotalUnidades || 0) > 0))
      ? `<div class="muted" style="margin-top:4px;">🚚 ${escapeHtml(d.motoristaNombre || "Sin motorista")}${d.placa ? " • " + escapeHtml(d.placa) : ""}${d.modo ? " • " + escapeHtml(d.modo) : ""}${Number(d.pendienteTotalUnidades || 0) ? " • ⏳ " + Number(d.pendienteTotalUnidades || 0) : ""}</div>`
      : "";
return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <strong>${escapeHtml(movTipoLabel(m.tipo))}</strong>
            <div class="muted">${escapeHtml(m.fecha)} • ${escapeHtml(m.resumen || "")}</div>
            ${extraMeta}
          </div>

          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" class="small secondary" onclick="editarMovimientoOperador('${m.id}')">✏️</button>
            <button type="button" class="small danger" onclick="eliminarMovimientoOperador('${m.id}')">🗑️</button>
          </div>
        </div>

        <details style="margin-top:10px;">
          <summary class="muted" style="cursor:pointer;">Ver productos (${items.length})</summary>
          <div style="margin-top:8px;">${itemsHtml}</div>
        </details>
      </div>
    `;
  }).join("");
}




async function exportarMovimientosExcelYVaciar(){
  const movs = JSON.parse(localStorage.getItem("movimientos") || "[]");
  if (!movs.length) {
    alert("No hay movimientos para exportar.");
    return;
  }
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    alert("No se encontró SheetJS (XLSX). Revisa el script en index.html.");
    return;
  }

  const usuario = await pedirMovimientosUsuario();
  if (!usuario) {
    alert("Debes ingresar un usuario para exportar.");
    return;
  }

  // Para CONTEOS necesitamos el stock actual (se intenta cargar el catálogo).
  const necesitaCatalogo = movs.some(m => String(m?.tipo || "").toUpperCase() === "CONTEO");
  if (necesitaCatalogo) {
    try {
      await ensureCatalogoCargado();
    } catch (e) {
      console.warn("No se pudo cargar catálogo para exportar CONTEOS:", e);
    }
  }

  const wb = XLSX.utils.book_new();

  const getFechaMov = (m) => {
    const d = (m && m.data) ? m.data : {};
    return d.fecha || d.fechaISO || m.fecha || "";
  };

  const getRealizado = (m) => {
    if (m?.creadoEn) return m.creadoEn;
    if (m?.creadoAtISO) {
      try { return new Date(m.creadoAtISO).toLocaleString("es-HN"); } catch {}
    }
    return "";
  };

  const getUbicacion = (m) => {
    // Preferir lo guardado en el movimiento; si no existe, inferir por rol.
    if (m?.bodega) return m.bodega;
    if (m?.rol) return getBodegaByRole(m.rol);
    return getBodegaActual();
  };

  const getItems = (m) => {
    const items = m?.data?.items;
    return Array.isArray(items) ? items : [];
  };

  const addSheetFromAoa = (name, rows) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  /* ================= HOJA: ENTRADAS ================= */
  const entradasHeader = [
    "MovimientoID",
    "Usuario",
    "Tipo",
    "FechaMovimiento",
    "Proveedor",
    "Factura",
    "BODEGA",
    "CODIGO",
    "PRODUCTO",
    "CANTIDAD",
    "REALIZADO"
  ];

  const entradasRows = [entradasHeader];

  movs
    .filter(m => String(m?.tipo || "").toUpperCase() === "ENTRADA")
    .forEach(m => {
      const d = m.data || {};
      const fechaMov = getFechaMov(m);
      const realizado = getRealizado(m);
      const bodega = getUbicacion(m);
      const items = getItems(m);

      if (!items.length) {
        entradasRows.push([
          m.id || "",
          usuario,
          "ENTRADA",
          fechaMov,
          d.proveedor || "",
          d.facturaNo || "",
          bodega,
          "",
          "",
          "",
          realizado
        ]);
        return;
      }

      items.forEach(it => {
        entradasRows.push([
          m.id || "",
          usuario,
          "ENTRADA",
          fechaMov,
          d.proveedor || "",
          d.facturaNo || "",
          bodega,
          it.codigo || "",
          it.producto || "",
          Number(it.cantidad || 0),
          realizado
        ]);
      });
    });

  addSheetFromAoa("Entradas", entradasRows);

  /* ================= HOJA: SALIDAS ================= */
  const salidasHeader = [
    "MovimientoID",
    "Usuario",
    "Tipo",
    "FechaMovimiento",
    "Factura/Referencia",
    "UBICACION",
    "Motorista",
    "Placa",
    "FechaHoraDespacho",
    "CODIGO",
    "PRODUCTO",
    "CANTIDAD",
    "REALIZADO"
  ];

  const salidasRows = [salidasHeader];

  movs
    .filter(m => String(m?.tipo || "").toUpperCase() === "SALIDA")
    .forEach(m => {
      const d = m.data || {};
      const fechaMov = getFechaMov(m);
      const realizado = getRealizado(m);
      const ubic = getUbicacion(m);
      const items = getItems(m);

      const facRef = d.facturaNo || d.referencia || "";

      if (!items.length) {
        salidasRows.push([
          m.id || "",
          usuario,
          "SALIDA",
          fechaMov,
          facRef,
          ubic,
          d.motoristaNombre || "",
          d.placa || "",
          (d.despachadoEn || realizado),
          "",
          "",
          "",
          realizado
        ]);
        return;
      }

      items.forEach(it => {
        salidasRows.push([
          m.id || "",
          usuario,
          "SALIDA",
          fechaMov,
          facRef,
          ubic,
          d.motoristaNombre || "",
          d.placa || "",
          (d.despachadoEn || realizado),
          it.codigo || "",
          it.producto || "",
          Number(it.cantidad || 0),
          realizado
        ]);
      });
    });

  addSheetFromAoa("Salidas", salidasRows);

  /* ================= HOJA: TRANSFERENCIAS ================= */
  const transferHeader = [
    "MovimientoID",
    "Usuario",
    "Tipo",
    "FechaMovimiento",
    "Detalles",
    "Codigo",
    "Producto",
    "Cantidad",
    "Realizado"
  ];

  const transferRows = [transferHeader];

  const dirDetalle = (dir) => {
    const v = String(dir || "").toUpperCase();
    if (v === "P_A") return "Principal a Anexo";
    if (v === "A_P") return "Anexo a Principal";
    return String(dir || "");
  };

  movs
    .filter(m => String(m?.tipo || "").toUpperCase() === "TRASLADO")
    .forEach(m => {
      const d = m.data || {};
      const fechaMov = getFechaMov(m);
      const realizado = getRealizado(m);
      const detalles = dirDetalle(d.direccion || "");

      const items = getItems(m);

      if (!items.length) {
        transferRows.push([
          m.id || "",
          usuario,
          "TRASLADO",
          fechaMov,
          detalles,
          "",
          "",
          "",
          realizado
        ]);
        return;
      }

      items.forEach(it => {
        transferRows.push([
          m.id || "",
          usuario,
          "TRASLADO",
          fechaMov,
          detalles,
          it.codigo || "",
          it.producto || "",
          Number(it.cantidad || 0),
          realizado
        ]);
      });
    });

  addSheetFromAoa("Transferencias", transferRows);

  /* ================= HOJA: CONTEOS ================= */
  const conteosHeader = [
    "MovimientoID",
    "Usuario",
    "Tipo",
    "FechaMovimiento",
    "Referencia",
    "Ubicacion",
    "Codigo",
    "Producto",
    "Diferencias iniciales",
    "Conteo",
    "Realizado"
  ];

  const conteosRows = [conteosHeader];

  movs
    .filter(m => String(m?.tipo || "").toUpperCase() === "CONTEO")
    .forEach(m => {
      const d = m.data || {};
      const fechaMov = getFechaMov(m);
      const realizado = getRealizado(m);
      const ubic = getUbicacion(m);
      const items = getItems(m);

      const ref = d.referencia || "";

      if (!items.length) {
        conteosRows.push([
          m.id || "",
          usuario,
          "CONTEO",
          fechaMov,
          ref,
          ubic,
          "",
          "",
          "",
          "",
          realizado
        ]);
        return;
      }

      items.forEach(it => {
        const codigo = String(it.codigo || "").trim();

        // Diferencias iniciales = stock actual del producto (según ubicación)
        let stockActual = "";
        try {
          const prod = getProdByCodigo(codigo);
          if (prod) {
            stockActual = (String(ubic || "").toUpperCase() === "ANEXO")
              ? Number(prod.stockA || 0)
              : Number(prod.stockP || 0);
          }
        } catch {}

                // ✅ En CONTEO: "Realizado" por línea = momento en que se agregó el producto
        let realizadoLinea = realizado;
        if (it?.agregadoEn) {
          realizadoLinea = it.agregadoEn;
        } else if (it?.agregadoAtISO) {
          try { realizadoLinea = new Date(it.agregadoAtISO).toLocaleString("es-HN"); } catch {}
        } else if (it?.agregadoAtEpoch) {
          try { realizadoLinea = new Date(Number(it.agregadoAtEpoch)).toLocaleString("es-HN"); } catch {}
        }

        conteosRows.push([
          m.id || "",
          usuario,
          "CONTEO",
          fechaMov,
          ref,
          ubic,
          codigo,
          it.producto || "",
          stockActual,
          Number(it.cantidad || 0),
          realizadoLinea
        ]);
      });
    });

  addSheetFromAoa("Conteos", conteosRows);

  // Exportar archivo
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const stamp = new Date();
  const ymd = stamp.toISOString().slice(0,10);
  const hh = String(stamp.getHours()).padStart(2,"0");
  const mm = String(stamp.getMinutes()).padStart(2,"0");
  const ss = String(stamp.getSeconds()).padStart(2,"0");

  setLastFile(
    blob,
    `movimientos-${ymd}-${hh}${mm}${ss}.xlsx`,
    "Movimientos - Ferretería Universal",
    "Libro Excel con entradas, salidas, transferencias y conteos (estructura nueva).",
    blob.type
  );

  // ✅ Vaciar movimientos después de generar el archivo
  vaciarMovimientosOperador();

  mostrarArchivoGenerado("Excel generado", "Movimientos exportados y vaciados.");
  // ✅ Abrir compartir automáticamente (Android / Web)
  compartirArchivo();
}



function vaciarMovimientosOperador(){
  movimientos = [];
  facturasEntradas = [];
  facturasSalidas = [];
  transferencias = [];
  conteos = [];

  localStorage.setItem("movimientos", "[]");
  localStorage.setItem("facturasEntradas", "[]");
  localStorage.setItem("facturasSalidas", "[]");
  localStorage.setItem("transferencias", "[]");
  localStorage.setItem("conteos", "[]");
}



/* ================= CONSULTA INVENTARIO (VENDEDOR) ================= */
let invVendConsulta = [];
let invVendConsultaCargado = false;

let invVendStockFiltro = localStorage.getItem("invVendStockFiltro") || "TODOS"; // TODOS | CON | SIN
let invVendBodegaFiltro = localStorage.getItem("invVendBodegaFiltro") || "TODAS"; // TODAS | P | A | T
let invVendDept = "";    // ej: "FONTANERIA"
let invVendCat = "";     // ej: "PVC"

let invVendDeptCats = new Map(); // dept -> [cats]
let deptoVendMode = "DEPT";      // DEPT | CAT
let deptoVendDeptActual = "";    // dept seleccionado para ver categorías

function splitDeptCat(depRaw){
  const s = String(depRaw || "").trim();
  if (!s) return { dept:"", cat:"" };

  // "FONTANERIA -PVC" => dept "FONTANERIA", cat "PVC"
  const parts = s.split("-");
  if (parts.length < 2) return { dept: s.trim(), cat:"" };

  const dept = (parts[0] || "").trim();
  const cat = parts.slice(1).join("-").trim();
  return { dept, cat };
}

async function ensureInventarioConsultaVendedorCargado(){
  const changed = await checkVersionAndReload();
  if (changed) invVendConsultaCargado = false;

  if (invVendConsultaCargado) return;

  // Inventarios (solo cantidad) + catálogo (metadata)
  const [invP, invA, invT, catalogoProductos] = await Promise.all([
    fetchJson(URLS.invP),
    fetchJson(URLS.invA),
    fetchJson(URLS.invT),
    fetchJsonFirstOk([URLS.catalogoProductos, BASE_RAW + "catalogo.json", BASE_RAW + "Catalogo.json"]).catch(() => ({}))
  ]);

  const codes = new Set([
    ...Object.keys(invP || {}),
    ...Object.keys(invA || {}),
    ...Object.keys(invT || {}),
    ...Object.keys(catalogoProductos || {})
  ]);

  invVendConsulta = [];
  invVendDeptCats = new Map();

  for (const codigo of codes) {
    const p = invP?.[codigo] || {};
    const a = invA?.[codigo] || {};
    const t = invT?.[codigo] || {};

    const stockP = Number(p.cantidad || 0);
    const stockA = Number(a.cantidad || 0);
    const stockT = Number(t.cantidad || 0);
    const stockTotal = stockP + stockA + stockT;

    const cat = (catalogoProductos && catalogoProductos[codigo]) ? catalogoProductos[codigo] : null;
    // Si el código no existe en catálogo y además no tiene stock, no lo mostramos (evita entradas “fantasma”)
    if (!cat && stockTotal === 0) continue;

    const producto = String(cat?.PRODUCTO ?? cat?.producto ?? "").trim() || (stockTotal ? "SIN CATALOGO" : "");
    const dept = String(cat?.DEPARTAMENTO ?? cat?.departamento ?? "").trim();
    const catName = String(cat?.CATEGORIA ?? cat?.categoria ?? "").trim();

    const depRaw = dept ? (dept + (catName ? " - " + catName : "")) : "";

    const item = {
      codigo,
      producto,
      departamentoRaw: depRaw,
      dept,
      cat: catName,
      stockP,
      stockA,
      stockT
    };

    invVendConsulta.push(item);

    const d = (dept || "").trim();
    if (d) {
      if (!invVendDeptCats.has(d)) invVendDeptCats.set(d, new Set());
      const c = (catName || "").trim();
      if (c) invVendDeptCats.get(d).add(c);
    }
  }

  // convertir sets a arrays ordenadas
  for (const [d, setCats] of invVendDeptCats.entries()) {
    invVendDeptCats.set(d, Array.from(setCats).sort((x,y)=>String(x).localeCompare(String(y), "es")));
  }

  invVendConsulta.sort((x,y) => (x.producto || "").localeCompare(y.producto || "", "es"));
  invVendConsultaCargado = true;
}

function abrirConsultaInventarioVendedor(){
  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "ADMIN";

  if (isAdmin) {
    adminHomeMode = "INVENTARIO";
    headerTitle.textContent = "Inventario Admin";
  } else if (role === "VISUALIZADOR" || role === "OPERADOR" || role === "BODEGUERO") {
    headerTitle.textContent = "Inventario";
  } else {
    headerTitle.textContent = "Consulta de inventario";
  }

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  const titulo = isAdmin ? "📦 Inventario (Admin)" : ((role === "VISUALIZADOR" || role === "OPERADOR" || role === "BODEGUERO") ? "📦 Inventario" : "📦 Consulta de inventario");
  const onlyA = role === "BODEGUERO";
  const sub = onlyA ? "Bodega Anexo" : "Principal • Anexo • Tienda";

  const adminActions = isAdmin ? `
    <div style="display:flex; gap:10px; margin-bottom:10px;">
      <button type="button" onclick="abrirAdminCotizacionesHome()">🧾 Cotizaciones</button>
      <button type="button" class="secondary" onclick="exportarPreciosAExcelAdmin()">📊 Exportar precios</button>
      <button type="button" onclick="openCeramicaCalcScreen()">🧱 Cerámica</button>
    </div>
    <div class="muted" style="margin-top:-4px; margin-bottom:10px;">
      Toca un producto para <b>ver/editar precios</b>.
    </div>
  ` : "";

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>${titulo}</strong>
      <div class="muted">${sub}</div>
    </div>

    ${adminActions}

    <input id="invVendSearch" placeholder="🔍 Buscar por código o nombre" />

    <div class="filter-row">
      <button type="button" class="secondary filter-btn" id="invVendF_TODOS" onclick="setInvVendStockFiltro('TODOS')">Todos</button>
      <button type="button" class="secondary filter-btn" id="invVendF_CON" onclick="setInvVendStockFiltro('CON')">Con stock</button>
      <button type="button" class="secondary filter-btn" id="invVendF_SIN" onclick="setInvVendStockFiltro('SIN')">Sin stock</button>
    </div>


    ${onlyA ? "" : `
    <div class="filter-row" style="margin-top:8px;">
      <button type="button" class="secondary filter-btn" id="invVendB_TODAS" onclick="setInvVendBodegaFiltro('TODAS')">Todas</button>
      <button type="button" class="secondary filter-btn" id="invVendB_P" onclick="setInvVendBodegaFiltro('P')">Principal</button>
      <button type="button" class="secondary filter-btn" id="invVendB_A" onclick="setInvVendBodegaFiltro('A')">Anexo</button>
      <button type="button" class="secondary filter-btn" id="invVendB_T" onclick="setInvVendBodegaFiltro('T')">Tienda</button>
    </div>
    `}

    <button type="button" class="secondary" id="invVendDeptBtn" onclick="abrirModalDeptoVend()">🏷️ Filtrar por departamento (Todos)</button>

    <div class="muted" id="invVendFiltrosInfo" style="margin-top:-2px; margin-bottom:10px;"></div>

    <div id="invVendList"></div>
  `;

  el("invVendSearch")?.addEventListener("input", renderConsultaInventarioVendedor);

  updateInvVendFilterButtons();
  updateInvVendBodegaButtons();
  updateBtnDeptoVend();
  updateInvVendFiltrosInfo();

  el("invVendList").innerHTML = `<div class="card"><strong>⏳ Cargando inventario...</strong></div>`;

  ensureInventarioConsultaVendedorCargado()
    .then(async () => {
      // ✅ en ADMIN precargar precios para abrir el modal rápido
      if (isAdmin) {
        try { await ensureCatalogoCargado(); } catch {}
      }

      updateInvVendFilterButtons();
      updateBtnDeptoVend();
      updateInvVendFiltrosInfo();
      renderConsultaInventarioVendedor();
    })
    .catch(err => {
      console.error(err);
      el("invVendList").innerHTML = `
        <div class="card">
          <strong>❌ No se pudo cargar el inventario.</strong>
          <div class="muted">Asegúrate que exista <b>inventariotienda.json</b> en GitHub.</div>
          <div class="muted">Detalle: ${escapeHtml(err.message || err)}</div>
        </div>
      `;
    });
}

function setInvVendStockFiltro(val){
  invVendStockFiltro = String(val || "TODOS").toUpperCase();
  localStorage.setItem("invVendStockFiltro", invVendStockFiltro);
  updateInvVendFilterButtons();
  updateInvVendFiltrosInfo();
  renderConsultaInventarioVendedor();
}

function updateInvVendFilterButtons(){
  ["TODOS","CON","SIN"].forEach(k => {
    const btn = el("invVendF_" + k);
    if (!btn) return;
    btn.classList.toggle("active", invVendStockFiltro === k);
  });
}

function setInvVendBodegaFiltro(val){
  invVendBodegaFiltro = String(val || "TODAS").toUpperCase();
  if (!["TODAS","P","A","T"].includes(invVendBodegaFiltro)) invVendBodegaFiltro = "TODAS";
  localStorage.setItem("invVendBodegaFiltro", invVendBodegaFiltro);
  updateInvVendBodegaButtons();
  updateInvVendFiltrosInfo();
  renderConsultaInventarioVendedor();
}

function updateInvVendBodegaButtons(){
  ["TODAS","P","A","T"].forEach(k => {
    const btn = el("invVendB_" + k);
    if (!btn) return;
    btn.classList.toggle("active", invVendBodegaFiltro === k);
  });
}

function invVendBodegaLabel(){
  if (invVendBodegaFiltro === "P") return "Principal";
  if (invVendBodegaFiltro === "A") return "Anexo";
  if (invVendBodegaFiltro === "T") return "Tienda";
  return "Total";
}

function invVendTotalPorFiltro(p, role){
  const isBode = role === "BODEGUERO";
  const sp = Number(p.stockP || 0);
  const sa = Number(p.stockA || 0);
  const st = Number(p.stockT || 0);

  if (isBode) return sa;

  if (invVendBodegaFiltro === "P") return sp;
  if (invVendBodegaFiltro === "A") return sa;
  if (invVendBodegaFiltro === "T") return st;
  return sp + sa + st;
}

function updateBtnDeptoVend(){
  const btn = el("invVendDeptBtn");
  if (!btn) return;

  if (!invVendDept) {
    btn.textContent = "🏷️ Filtrar por departamento (Todos)";
    return;
  }

  if (invVendDept && !invVendCat) {
    btn.textContent = `🏷️ ${invVendDept} (todas)`;
    return;
  }

  btn.textContent = `🏷️ ${invVendDept} - ${invVendCat}`;
}

function updateInvVendFiltrosInfo(){
  const info = el("invVendFiltrosInfo");
  if (!info) return;

  const role = localStorage.getItem("role") || "";
  const isBode = role === "BODEGUERO";

  const parts = [];
  parts.push(`Stock: <b>${invVendStockFiltro === "TODOS" ? "Todos" : (invVendStockFiltro === "CON" ? "Con stock" : "Sin stock")}</b>`);

  if (!isBode) {
    parts.push(`Bodega: <b>${escapeHtml(invVendBodegaLabel())}</b>`);
  } else {
    parts.push("Bodega: <b>Anexo</b>");
  }

  if (invVendDept) {
    if (invVendCat) parts.push(`Depto: <b>${escapeHtml(invVendDept)} - ${escapeHtml(invVendCat)}</b>`);
    else parts.push(`Depto: <b>${escapeHtml(invVendDept)}</b>`);
  } else {
    parts.push("Depto: <b>Todos</b>");
  }

  info.innerHTML = parts.join(" • ");
}

function renderConsultaInventarioVendedor(){
  const cont = el("invVendList");
  if (!cont) return;

  const role = localStorage.getItem("role") || "";
  const isAdmin = role === "ADMIN";
  const isBode = role === "BODEGUERO";

  const q = (el("invVendSearch")?.value || "").toLowerCase().trim();

  const filtrados = invVendConsulta
    .filter(p => {
      // buscador
      if (q) {
        const match =
          (p.codigo || "").toLowerCase().includes(q) ||
          (p.producto || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      // filtro stock (total)
      const total = invVendTotalPorFiltro(p, role);

      if (invVendStockFiltro === "CON") return total > 0;
      if (invVendStockFiltro === "SIN") return total <= 0;
      return true;
    })
    .filter(p => {
      // filtro dept/cat
      if (!invVendDept) return true;
      if ((p.dept || "").trim() !== invVendDept) return false;
      if (invVendCat && (p.cat || "").trim() !== invVendCat) return false;
      return true;
    })
    .slice(0, 250);

  if (!filtrados.length) {
    cont.innerHTML = `<div class="card"><strong>No hay resultados.</strong></div>`;
    return;
  }

  cont.innerHTML = filtrados.map(p => {
    const total = invVendTotalPorFiltro(p, role);

    const depTxt = (p.dept || "").trim()
      ? `${escapeHtml(p.dept)}${(p.cat || "").trim() ? " - " + escapeHtml(p.cat) : ""}`
      : "";

    const codeEnc = encodeURIComponent(p.codigo || "");

    let click = "";
    let cls = "ticket";

    if (isAdmin) {
      click = `onclick="abrirModalDetallesProductoDesdeConsulta('${codeEnc}')"`;
      cls = "ticket clickable";
    } else if (isVendedorRole(role)) {
      click = `onclick="abrirModalPreciosProductoVendedor('${codeEnc}')"`;
      cls = "ticket clickable";
    }

    const totalLabel = isBode ? "Anexo" : invVendBodegaLabel();

    const stocksHtml = isBode
      ? `<span class="pill pill-a">Anexo: ${Number(p.stockA || 0)}</span>`
      : `
          <span class="pill pill-p">Principal: ${Number(p.stockP || 0)}</span>
          <span class="pill pill-a">Anexo: ${Number(p.stockA || 0)}</span>
          <span class="pill pill-t">Tienda: ${Number(p.stockT || 0)}</span>
        `;

    return `
      <div class="${cls}" ${click}>
        <div class="ticket-top">
          <div>
            <div class="ticket-title">${escapeHtml(p.producto || "—")}</div>
            <div class="ticket-sub">
              Código: <b>${escapeHtml(p.codigo)}</b>
              ${depTxt ? ` • ${depTxt}` : ""}
            </div>
          </div>
          <div class="ticket-total">${totalLabel}: ${total}</div>
        </div>

        <div class="ticket-stocks">${stocksHtml}</div>
      </div>
    `;
  }).join("");
}


/* ===== Modal precios producto (consulta inventario) ===== */
async function abrirModalPreciosProductoVendedor(codeEnc){
  const codigo = decodeURIComponent(codeEnc || "");
  if (!codigo) return;

  try {
    await ensureCatalogoCargado();
  } catch (err) {
    console.error(err);
  }

  const prod = getProdByCodigo(codigo);
  if (!prod) {
    alert("No se encontró el producto.");
    return;
  }

  el("ppTitulo").textContent = prod.producto || "Producto";
  const dep = (prod.departamento || "").trim();
  el("ppSub").textContent = `Código: ${codigo}${dep ? " • " + dep : ""}`;

  const preciosHtml = PRICE_TYPES.map(t => {
    const label = PRICE_LABELS[t] || t;
    const v = prod.precios?.[t];
    const val = (v === undefined || v === null) ? "N/D" : moneyL(v);
    return `<div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(val)}</div>`;
  }).join("");

  el("ppPrecios").innerHTML = preciosHtml;

  const limite = Number(prod.admin?.limite || 0);
  el("ppLimite").innerHTML = `
    <div class="k">Precio mínimo</div>
    <div class="v">${limite > 0 ? moneyL(limite) : "No definido"}</div>
  `;

  openModal("modalPreciosProducto");
}

function cerrarModalPreciosProducto(){
  closeModal("modalPreciosProducto");
}

/* ===== ADMIN: abrir modal editable desde consulta ===== */
async function abrirModalDetallesProductoDesdeConsulta(codeEnc){
  const codigo = decodeURIComponent(codeEnc || "");
  if (!codigo) return;

  try {
    await ensureCatalogoCargado();
  } catch (err) {
    console.error(err);
  }

  abrirModalDetallesProducto(codigo);
}

/* ===== ADMIN: exportar precios a Excel (y compartir) ===== */
async function exportarPreciosAExcelAdmin(){
  try {
    await ensureCatalogoCargado();
  } catch (err) {
    console.error(err);
  }
  exportarPreciosAExcel();
}

/* ===== Modal filtro Depto/Categoría (VENDEDOR) ===== */
function abrirModalDeptoVend(){
  // Si aún no carga, abrir con "cargando..."
  openModal("modalDeptoVend");

  deptoVendMode = "DEPT";
  deptoVendDeptActual = "";

  el("deptoVendTitulo").textContent = "Filtrar por departamento";
  el("deptoVendBackBtn").style.display = "none";
  el("deptoVendBuscar").value = "";

  el("deptoVendLista").innerHTML = `<div class="list-item"><div class="list-title">⏳ Cargando...</div></div>`;

  ensureInventarioConsultaVendedorCargado()
    .then(() => {
      renderDeptoVendLista();
      setTimeout(() => el("deptoVendBuscar").focus(), 50);
    })
    .catch(err => {
      el("deptoVendLista").innerHTML = `
        <div class="list-item">
          <div class="list-title">❌ Error al cargar</div>
          <div class="list-sub">${escapeHtml(err.message || err)}</div>
        </div>
      `;
    });

  el("deptoVendBuscar").oninput = renderDeptoVendLista;
}

function cerrarModalDeptoVend(){
  closeModal("modalDeptoVend");
}

function limpiarFiltroDeptoVend(){
  invVendDept = "";
  invVendCat = "";
  updateBtnDeptoVend();
  updateInvVendFiltrosInfo();
  cerrarModalDeptoVend();
  renderConsultaInventarioVendedor();
}

function deptoVendVolver(){
  deptoVendMode = "DEPT";
  deptoVendDeptActual = "";
  el("deptoVendTitulo").textContent = "Filtrar por departamento";
  el("deptoVendBackBtn").style.display = "none";
  el("deptoVendBuscar").value = "";
  renderDeptoVendLista();
  el("deptoVendBuscar").focus();
}

function renderDeptoVendLista(){
  const cont = el("deptoVendLista");
  if (!cont) return;

  const q = (el("deptoVendBuscar").value || "").toLowerCase().trim();

  if (deptoVendMode === "DEPT") {
    const depts = Array.from(invVendDeptCats.keys()).sort((a,b) => String(a).localeCompare(String(b), "es"));
    const filtrados = depts.filter(d => !q || String(d).toLowerCase().includes(q));

    cont.innerHTML = filtrados.length ? filtrados.map(d => {
      const cats = invVendDeptCats.get(d) || [];
      const hasCats = cats.length > 0;
      return `
        <div class="list-item" onclick="seleccionarDeptoVend('${encodeURIComponent(d)}')">
          <div class="list-title">${escapeHtml(d)}</div>
          <div class="list-sub">${hasCats ? "Tiene categorías" : "Sin categorías"}</div>
        </div>
      `;
    }).join("") : `
      <div class="list-item"><div class="list-title">No hay coincidencias</div></div>
    `;
    return;
  }

  // CAT
  const cats = invVendDeptCats.get(deptoVendDeptActual) || [];
  const base = ["__TODAS__", ...cats];
  const filtrados = base.filter(c => {
    if (!q) return true;
    if (c === "__TODAS__") return "todas".includes(q);
    return String(c).toLowerCase().includes(q);
  });

  cont.innerHTML = filtrados.length ? filtrados.map(c => {
    if (c === "__TODAS__") {
      return `
        <div class="list-item" onclick="seleccionarCatVend('__TODAS__')">
          <div class="list-title">Todas las categorías</div>
          <div class="list-sub">Filtra solo por ${escapeHtml(deptoVendDeptActual)}</div>
        </div>
      `;
    }

    return `
      <div class="list-item" onclick="seleccionarCatVend('${encodeURIComponent(c)}')">
        <div class="list-title">${escapeHtml(c)}</div>
        <div class="list-sub">${escapeHtml(deptoVendDeptActual)} - ${escapeHtml(c)}</div>
      </div>
    `;
  }).join("") : `
    <div class="list-item"><div class="list-title">No hay coincidencias</div></div>
  `;
}

function seleccionarDeptoVend(deptEnc){
  const dept = decodeURIComponent(deptEnc || "");

  invVendDept = dept;
  invVendCat = "";

  const cats = invVendDeptCats.get(dept) || [];
  if (!cats.length) {
    // ✅ no tiene categorías => cerrar y filtrar por dept
    updateBtnDeptoVend();
    updateInvVendFiltrosInfo();
    cerrarModalDeptoVend();
    renderConsultaInventarioVendedor();
    return;
  }

  // ✅ tiene categorías => mostrar categorías
  deptoVendMode = "CAT";
  deptoVendDeptActual = dept;

  el("deptoVendTitulo").textContent = `Categorías de ${dept}`;
  el("deptoVendBackBtn").style.display = "inline-block";
  el("deptoVendBuscar").value = "";
  renderDeptoVendLista();
  el("deptoVendBuscar").focus();
}

function seleccionarCatVend(catEnc){
  if (catEnc === "__TODAS__") {
    invVendCat = "";
  } else {
    invVendCat = decodeURIComponent(catEnc || "");
  }

  updateBtnDeptoVend();
  updateInvVendFiltrosInfo();
  cerrarModalDeptoVend();
  renderConsultaInventarioVendedor();
}


/* ================= ADMIN: CALCULADORA CERÁMICA ================= */

let ceramicaDocs = JSON.parse(localStorage.getItem("ceramicaDocs") || "[]");
let ceramicaDraft = null;
let cerPickTarget = null;
let cerPickTab = "TODAS";

function __cerId(){
  return String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function __fmtInt(n){
  const x = Number(n || 0);
  return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function __fmt2(n){
  const x = Number(n || 0);
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function __norm(s){
  return String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function __cerCategoria(p){
  const name = __norm(p?.producto || "");
  const dept = __norm(p?.departamento || "");
  const cat  = __norm(p?.categoria || "");
  const blob = `${name} ${dept} ${cat}`;

  if (blob.includes("IVORY")) return "IVORY";
  if (blob.includes("PORCEL")) return "PORCELANATO";
  if (blob.includes("CERAM") || blob.includes("AZULE") || blob.includes("PISO") || blob.includes("BALDOSA")) return "CERAMICA";
  // Si no cae en nada, lo dejamos fuera del selector (para evitar ruido)
  return "";
}


function __parseCajaInfo(p){
  // Intenta detectar piezas por caja / m² por caja desde producto/alias.
  const raw = `${p?.producto || ""} ${p?.alias || ""}`.trim();

  // Unidad sugerida (heurística simple)
  let unidad = "PIEZA";
  if (/(\bCAJA\b|\bCAJAS\b|\bCJA\b|\bBOX\b)/i.test(raw)) unidad = "CAJA";

  // 1) Piezas por caja explícito (ej: "4 PZ", "4 PZS", "4 PIEZAS", "PZ/CAJA 4")
  let ppc = 0;

  let m = raw.match(/(?:PZ\s*\/\s*CAJA|PZS\s*\/\s*CAJA|PZAS\s*\/\s*CAJA)\s*(\d+(?:[\.,]\d+)?)/i);
  if (!m) m = raw.match(/(\d+(?:[\.,]\d+)?)\s*(?:PZAS|PZS|PZ|PIEZAS)\b/i);
  if (m) {
    ppc = Number(String(m[1]).replace(",", ".")) || 0;
  }

  // 2) m² por caja (ej: "1.44M2", "1,44 m²")
  let m2Caja = 0;
  const m2m = raw.match(/(\d+(?:[\.,]\d+)?)\s*(?:M2|M²)\b/i);
  if (m2m) {
    m2Caja = Number(String(m2m[1]).replace(",", ".")) || 0;
  }

  return { unidad, ppc, m2Caja };
}

function __ppcFromM2(m2Caja, areaPieza){
  const m2 = Number(m2Caja) || 0;
  const ap = Number(areaPieza) || 0;
  if (m2 <= 0 || ap <= 0) return 0;

  const ratio = m2 / ap; // piezas por caja aproximado
  if (!isFinite(ratio) || ratio <= 0) return 0;

  // Si cae muy cerca de un entero, redondeamos; si no, usamos ceil por seguridad.
  const near = Math.round(ratio);
  if (near > 0 && Math.abs(ratio - near) / near <= 0.03) return near;
  return Math.ceil(ratio);
}

function __maybeAutoPpc(it){
  if (!it || !it.ppcAuto) return;

  const w = Number(it.anchoCm) || 0;
  const h = Number(it.altoCm) || 0;
  const areaPieza = (w/100) * (h/100);
  const m2Caja = Number(String(it.m2PorCaja || "").replace(",", ".")) || 0;

  if (areaPieza <= 0 || m2Caja <= 0) return;

  const ppc = __ppcFromM2(m2Caja, areaPieza);
  if (ppc > 0) {
    it.piezasPorCaja = String(ppc);
    it.ppcHint = `Pz/Caja estimado desde ${__fmt2(m2Caja)} m²/caja`;

    const inp = el("cerPPC_" + it.id);
    if (inp) inp.value = String(ppc);
    const hint = el("cerPpcHint_" + it.id);
    if (hint) hint.textContent = it.ppcHint;
  }
}

function __getCeramicas(){
  // inventarioAdmin ya está ordenado por producto
  return (Array.isArray(inventarioAdmin) ? inventarioAdmin : [])
    .filter(p => __cerCategoria(p));
}

function __newCerItem(){
  return {
    id: __cerId(),
    modo: "AREA", // AREA | TENGO
    cerCodigo: "",
    cerNombre: "",
    cerAlias: "",
    cerCategoria: "",
    stockTotal: 0,

    anchoCm: 60,
    altoCm: 60,
    desperdicioPct: 10,

    piezasPorCaja: "",
    inventarioUnidad: "PIEZA", // PIEZA | CAJA


    // autodetección (opcional)
    m2PorCaja: "",      // cuando el nombre/alias trae "1.44 m2"
    ppcAuto: false,     // true si el sistema está ajustando Pz/Caja automáticamente
    ppcHint: "",        // texto informativo debajo de Pz/Caja
    areaM2: "",
    tengoCant: ""
  };
}

function __newCerDoc(){
  return {
    id: __cerId(),
    titulo: "",
    creado: Date.now(),
    items: [__newCerItem()]
  };
}

async function openCeramicaCalcScreen(docId){
  // Mantener el "home mode" en inventario para que el botón Home vuelva donde corresponde
  adminHomeMode = "INVENTARIO";

  try { await ensureCatalogoCargado(false); } catch(e){ console.warn(e); }

  if (docId) {
    const d = (Array.isArray(ceramicaDocs) ? ceramicaDocs : []).find(x => String(x?.id) === String(docId));
    if (d) ceramicaDraft = JSON.parse(JSON.stringify(d));
    else ceramicaDraft = __newCerDoc();
  } else {
    ceramicaDraft = __newCerDoc();
  }

  renderCeramicaCalcScreen();
  setTimeout(() => {
    const first = ceramicaDraft?.items?.[0]?.id;
    if (first) {
      const inp = el("cerArea_"+first);
      if (inp) inp.focus();
    }
  }, 60);
}

function cerBack(){
  abrirConsultaInventarioVendedor();
}


function renderCeramicaCalcScreen(){
  headerTitle.textContent = "Cerámica";
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  ceramicaDraft.items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];

  const items = ceramicaDraft.items;

  const listHtml = items.length
    ? items.map((it, idx) => cerListItemHTML(it, idx)).join("")
    : `
      <div class="cer-empty">
        <div class="t">No hay cálculos todavía</div>
        <div class="muted">Crea un cálculo con el botón principal o usando una opción rápida.</div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="button" onclick="cerOpenWizard()">➕ Crear mi primer cálculo</button>
        </div>
      </div>
    `;

  contenido.innerHTML = `
    <div class="cer2">
      <div class="cer2-head">
        <div class="left">
          <button type="button" class="secondary" onclick="cerBack()">⬅ Volver</button>
          <div class="cer2-title">
            <div class="h">🧱 Cálculo de cerámica</div>
            <div class="muted">Flujo por pasos en modales. Menos campos en pantalla, más rapidez.</div>
          </div>
        </div>

        <div class="right">
          <button type="button" class="secondary" onclick="openCeramicaHistory()">🕘 Historial</button>
          <button type="button" class="secondary" onclick="cerOpenMeta()">📄 PDF / Guardar</button>
        </div>
      </div>

      <div class="cer2-grid">
        <div class="card cer2-hero">
          <button type="button" class="success cer-cta" onclick="cerOpenWizard()">➕ Nuevo cálculo</button>

          <div class="cer-tiles">
            <button type="button" class="secondary cer-tile" onclick="cerOpenWizard(null,{preset:'area'})">
              <div class="t">📐 Calcular por m²</div>
              <div class="d">Ingresa el área y obtén piezas/cajas necesarias.</div>
            </button>

            <button type="button" class="secondary cer-tile" onclick="cerOpenWizard(null,{preset:'room'})">
              <div class="t">🏠 Por habitación</div>
              <div class="d">Usa Largo × Ancho para calcular m² rápidamente.</div>
            </button>

            <button type="button" class="secondary cer-tile" onclick="cerOpenWizard(null,{preset:'stock'})">
              <div class="t">📦 Con lo que tengo</div>
              <div class="d">Calcula cuántos m² cubres con tu stock.</div>
            </button>

            <button type="button" class="secondary cer-tile" onclick="cerDuplicateLast()">
              <div class="t">⧉ Duplicar último</div>
              <div class="d">Reusa el cálculo anterior y ajusta lo necesario.</div>
            </button>
          </div>

          <div class="cer-meta-row">
            <div class="chipline">PDF: <b id="cerPdfTitle">${escapeHtml(ceramicaDraft.titulo || "Sin título")}</b></div>
            <button type="button" class="secondary small" onclick="cerOpenMeta()">Editar</button>
          </div>

          <div id="cerSummary" class="cer-kpis"></div>
        </div>

        <div class="card">
          <div class="cer-list-head">
            <div>
              <strong>📋 Mis cálculos</strong>
              <div class="muted" style="margin-top:2px;">Cada tarjeta se edita desde el modal por pasos.</div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="secondary small" onclick="cerOpenWizard()">➕ Agregar</button>
              <button type="button" class="secondary small" onclick="cerClearAllItems()">🗑️ Limpiar</button>
            </div>
          </div>

          <div class="cer-list" id="cerItemsList">
            ${listHtml}
          </div>
        </div>
      </div>

      <div class="cer2-bottom">
        <div class="btn-row">
          <button type="button" class="secondary" onclick="cerSaveDoc()">💾 Guardar</button>
          <button type="button" class="success" onclick="cerExportPdf()">📄 PDF (Compartir)</button>
        </div>
      </div>
    </div>
  `;

  cerRefreshSummary();
}


function cerListItemHTML(it, idx){
  const title = `Cálculo ${idx+1}`;
  const res = cerCompute(it);

  const prodLine = it.cerNombre
    ? `<div class="meta"><span class="cer-badge">${escapeHtml(it.cerCategoria || "CERÁMICA")}</span>
         <span style="margin-left:6px;"><b>${escapeHtml(it.cerNombre)}</b></span>
       </div>`
    : `<div class="meta">Sin cerámica seleccionada</div>`;

  const id = escapeHtml(it.id);

  const sizeTxt = `${__fmtInt(it.anchoCm)}×${__fmtInt(it.altoCm)} cm`;
  const unidad = (it.inventarioUnidad === "CAJA") ? "CAJA" : "PIEZA";
  const ppc = Number(String(it.piezasPorCaja || "").replace(",", ".")) || 0;

  const cfg = `
    <div class="meta">
      Tamaño: <b>${escapeHtml(sizeTxt)}</b> • Desperdicio: <b>${__fmtInt(it.desperdicioPct || 0)}%</b> • Inventario: <b>${escapeHtml(unidad)}</b>
      ${ppc>0 ? ` • Pz/Caja: <b>${__fmtInt(ppc)}</b>` : ""}
      • Modo: <b>${escapeHtml(it.modo === "TENGO" ? "TENGO" : "ÁREA")}</b>
      ${it.cerNombre ? ` • Stock: <b>${__fmtInt(it.stockTotal || 0)}</b>` : ""}
    </div>
  `;

  let big = "";
  let sub = "";
  let hint = "";

  if (!res.ok) {
    big = "⚠️ Completa datos";
    sub = res.msg || "Faltan campos.";
    hint = "";
  } else if (res.modo === "AREA") {
    big = `${__fmtInt(res.piezas)} pzs${(res.ppc>0 ? ` • ${__fmtInt(res.cajas)} cajas` : "")}`;
    sub = `Área con merma: ${__fmt2(res.areaConMerma)} m² (base: ${__fmt2(res.area)} m²)`;
    hint = (res.faltanPiezas > 0)
      ? `🛒 Comprar: ${__fmtInt(res.faltanPiezas)} pzs${(res.ppc>0 ? ` (≈ ${__fmtInt(res.faltanCajas)} cajas)` : "")}`
      : "✅ Tu stock alcanza";
  } else {
    big = `~ ${__fmt2(res.areaConMerma)} m²`;
    sub = `Sin merma: ${__fmt2(res.areaSinMerma)} m² • Unidad: ${escapeHtml(res.unidad)}`;
    hint = `Pieza: ${__fmt2(res.areaPieza)} m²`;
  }

  return `
    <div class="cer-list-item" id="cerRow_${id}">
      <div class="cer-card-min">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          ${prodLine}
          <div class="big" style="margin-top:8px;">${escapeHtml(big)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
          ${hint ? `<div class="muted" style="margin-top:6px; font-weight:900;">${escapeHtml(hint)}</div>` : ""}
        </div>

        <div class="actions">
          <button type="button" class="secondary small" onclick="cerOpenWizard('${id}')">Editar</button>
          <button type="button" class="icon-btn" title="Duplicar" onclick="cerDuplicateItem('${id}')">⧉</button>
          <button type="button" class="icon-btn" title="Eliminar" onclick="cerRemoveItem('${id}')">🗑️</button>
        </div>
      </div>

      <details style="margin-top:10px;">
        <summary class="muted" style="cursor:pointer; font-weight:900;">Detalles</summary>
        <div style="margin-top:8px;">${cfg}</div>
      </details>
    </div>
  `;
}


/* ================= WIZARD (MODAL) ================= */

let cerWizardState = null; // { step, isNew, itemId, item }

function cerOpenWizard(itemId, opts){
  // Compatibilidad: si el primer parámetro es un objeto, es opts
  let _itemId = itemId;
  let _opts = opts || {};
  if (_itemId && typeof _itemId === "object") {
    _opts = _itemId || {};
    _itemId = null;
  }

  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  ceramicaDraft.items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];

  let isNew = true;
  let item;

  if (_itemId) {
    const it = cerFind(_itemId);
    if (!it) return;
    item = JSON.parse(JSON.stringify(it));
    item.id = String(it.id);
    isNew = false;
  } else {
    item = __newCerItem();
    isNew = true;
  }

  cerWizardState = {
    step: 1,
    isNew,
    itemId: String(item.id),
    item,
    openDims: false
  };

  // Presets rápidos (solo para "nuevo")
  if (isNew && _opts && _opts.preset) {
    const p = String(_opts.preset || "");
    if (p === "area") {
      item.modo = "AREA";
      cerWizardState.step = 4;
    } else if (p === "room") {
      item.modo = "AREA";
      cerWizardState.step = 4;
      cerWizardState.openDims = true;
    } else if (p === "stock") {
      item.modo = "TENGO";
      cerWizardState.step = 4;
    }
  }

  cerWizRender();
  openModal("modalCerWizard");
}



function cerOpenWizardPrefill(prefill){
  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  ceramicaDraft.items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];

  const item = JSON.parse(JSON.stringify(prefill || __newCerItem()));
  item.id = __cerId();

  cerWizardState = {
    step: 1,
    isNew: true,
    itemId: String(item.id),
    item
  };

  cerWizRender();
  openModal("modalCerWizard");
}

function cerWizClose(){
  cerWizardState = null;
  closeModal("modalCerWizard");
}

function cerWizError(msg){
  const box = el("cerWizError");
  if (!box) return;
  box.style.display = msg ? "block" : "none";
  box.textContent = msg ? String(msg) : "";
}

function cerWizGo(step){
  if (!cerWizardState) return;
  const s = Math.max(1, Math.min(5, Number(step) || 1));
  cerWizardState.step = s;
  cerWizError("");
  cerWizRender();
}

function cerWizPrev(){
  if (!cerWizardState) return;
  cerWizError("");
  cerWizardState.step = Math.max(1, (cerWizardState.step || 1) - 1);
  cerWizRender();
}

function cerWizNext(){
  if (!cerWizardState) return;
  cerWizError("");

  const ok = cerWizValidateStep(cerWizardState.step);
  if (!ok.ok) {
    cerWizError(ok.msg || "Revisa los datos.");
    return;
  }

  cerWizardState.step = Math.min(5, (cerWizardState.step || 1) + 1);
  cerWizRender();
}

function cerWizValidateStep(step){
  const it = cerWizardState?.item;
  if (!it) return { ok:false, msg:"No hay datos." };

  const w = Number(it.anchoCm) || 0;
  const h = Number(it.altoCm) || 0;
  const areaPieza = (w/100) * (h/100);

  if (Number(step) >= 2) {
    if (!areaPieza || areaPieza <= 0) return { ok:false, msg:"Ingresa el tamaño de la pieza (cm)." };
  }

  const unidad = (it.inventarioUnidad === "CAJA") ? "CAJA" : "PIEZA";
  const ppc = Number(String(it.piezasPorCaja || "").replace(",", ".")) || 0;
  if (Number(step) >= 3) {
    if (unidad === "CAJA" && ppc <= 0) return { ok:false, msg:"Inventario en CAJA: ingresa Pz/Caja o cambia a PIEZA." };
  }

  if (Number(step) >= 4) {
    if (it.modo === "TENGO") {
      const tengo = Number(String(it.tengoCant || "").replace(",", ".")) || 0;
      if (tengo <= 0) return { ok:false, msg:"Ingresa cuánta cerámica tienes." };
    } else {
      const area = Number(String(it.areaM2 || "").replace(",", ".")) || 0;
      if (area <= 0) return { ok:false, msg:"Ingresa el área (m²)." };
    }
  }

  return { ok:true };
}

function cerWizSet(field, value){
  const it = cerWizardState?.item;
  if (!it) return;

  if (field === "modo") {
    it.modo = (value === "TENGO") ? "TENGO" : "AREA";
    cerWizRender();
    return;
  }

  if (field === "inventarioUnidad") {
    it.inventarioUnidad = (value === "CAJA") ? "CAJA" : "PIEZA";
    cerWizRender();
    return;
  }

  if (field === "anchoCm" || field === "altoCm") {
    it[field] = Number(String(value || "").replace(",", ".")) || 0;
    __maybeAutoPpc(it);
    cerWizRefreshLive();
    return;
  }

  if (field === "desperdicioPct") {
    it.desperdicioPct = Math.max(0, Math.min(25, Number(value) || 0));
    cerWizRefreshLive();
    return;
  }

  if (field === "piezasPorCaja") {
    it.piezasPorCaja = String(value || "").trim();
    it.ppcAuto = false;
    it.ppcHint = it.piezasPorCaja ? "Pz/Caja definido manualmente." : "";
    cerWizRefreshLive();
    return;
  }

  if (field === "areaM2") {
    it.areaM2 = String(value || "").trim();
    cerWizRefreshLive();
    return;
  }

  if (field === "tengoCant") {
    it.tengoCant = String(value || "").trim();
    cerWizRefreshLive();
    return;
  }
}

function cerWizPreset(w, h){
  const it = cerWizardState?.item;
  if (!it) return;

  it.anchoCm = Number(w) || 0;
  it.altoCm = Number(h) || 0;
  __maybeAutoPpc(it);
  cerWizRender();
}

function cerWizClearProduct(){
  const it = cerWizardState?.item;
  if (!it) return;

  it.cerCodigo = "";
  it.cerNombre = "";
  it.cerAlias = "";
  it.cerCategoria = "";
  it.stockTotal = 0;
  it.m2PorCaja = "";
  it.ppcAuto = false;
  it.ppcHint = "";

  cerWizRender();
}

function cerWizOpenPick(){
  if (!cerWizardState?.item) return;
  openPickCeramicaWizard();
}

function cerWizCalcAreaFromDims(){
  const l = Number(String(el("cerWizLen")?.value || "").replace(",", ".")) || 0;
  const a = Number(String(el("cerWizWid")?.value || "").replace(",", ".")) || 0;
  if (l <= 0 || a <= 0) {
    cerWizError("Ingresa largo y ancho (m).");
    return;
  }
  const m2 = l * a;
  cerWizError("");
  cerWizardState.item.areaM2 = String(__fmt2(m2));
  const inp = el("cerWizArea");
  if (inp) inp.value = cerWizardState.item.areaM2;
  cerWizRefreshLive();
}

function cerWizRender(){
  const it = cerWizardState?.item;
  if (!it) return;

  const step = Number(cerWizardState.step) || 1;

  const title = cerWizardState.isNew ? "🧱 Nuevo cálculo" : "🧱 Editar cálculo";
  const tEl = el("cerWizTitle");
  if (tEl) tEl.textContent = title;

  const steps = [
    { n:1, t:"Cerámica" },
    { n:2, t:"Tamaño" },
    { n:3, t:"Caja" },
    { n:4, t:"Objetivo" },
    { n:5, t:"Resultado" },
  ];

  const stepper = el("cerWizStepper");
  if (stepper) {
    stepper.innerHTML = steps.map(s =>
      `<button type="button" class="chip ${s.n===step?'active':''}" onclick="cerWizGo(${s.n})">${s.n}. ${escapeHtml(s.t)}</button>`
    ).join("");
  }

  const body = el("cerWizBody");
  if (!body) return;

  // footer buttons
  const prevBtn = el("cerWizPrevBtn");
  const nextBtn = el("cerWizNextBtn");
  const saveBtn = el("cerWizSaveBtn");

  if (prevBtn) prevBtn.disabled = (step <= 1);
  if (nextBtn) nextBtn.style.display = (step >= 5) ? "none" : "inline-block";
  if (saveBtn) saveBtn.style.display = (step >= 5) ? "inline-block" : "none";

  // Render step body
  if (step === 1) {
    const prodCard = it.cerNombre ? `
      <div class="card-lite">
        <div style="font-weight:900;">${escapeHtml(it.cerNombre)}</div>
        <div class="muted" style="margin-top:2px;">
          <span class="cer-badge">${escapeHtml(it.cerCategoria || "CERÁMICA")}</span>
          <span style="margin-left:6px;">Código: <b>${escapeHtml(it.cerCodigo || "-")}</b></span>
          ${it.cerAlias ? `<span style="margin-left:6px;">Alias: <b>${escapeHtml(it.cerAlias)}</b></span>` : ""}
        </div>
        <div class="muted" style="margin-top:6px;">Stock total: <b>${__fmtInt(it.stockTotal || 0)}</b></div>
        ${it.ppcHint ? `<div class="muted" style="margin-top:6px;">${escapeHtml(it.ppcHint)}</div>` : ""}
      </div>
    ` : `
      <div class="card-lite">
        <div style="font-weight:900;">Sin cerámica seleccionada</div>
        <div class="muted" style="margin-top:2px;">Puedes calcular solo por medidas. Si eliges una cerámica, se toma el stock para la recomendación.</div>
      </div>
    `;

    body.innerHTML = `
      ${prodCard}
      <div class="btn-row">
        <button type="button" onclick="cerWizOpenPick()">🏷️ Elegir del inventario</button>
        <button type="button" class="secondary" onclick="cerWizClearProduct()">Quitar</button>
      </div>
      <div class="muted">Tip: si el nombre trae “4 PZ” o “1.44 m²”, se detecta Pz/Caja automáticamente.</div>
    `;
  }

  if (step === 2) {
    const areaPieza = (Number(it.anchoCm)||0)/100 * (Number(it.altoCm)||0)/100;
    body.innerHTML = `
      <div class="card-lite">
        <div style="font-weight:900;">📏 Tamaño de pieza (cm)</div>
        <div class="muted" style="margin-top:2px;">Usa presets o escribe el tamaño.</div>

        <div class="cer-wiz-grid" style="margin-top:10px;">
          <div>
            <label class="label">Ancho (cm)</label>
            <input id="cerWizW" inputmode="decimal" value="${escapeHtml(it.anchoCm)}" oninput="cerWizSet('anchoCm', this.value)" />
          </div>
          <div>
            <label class="label">Alto (cm)</label>
            <input id="cerWizH" inputmode="decimal" value="${escapeHtml(it.altoCm)}" oninput="cerWizSet('altoCm', this.value)" />
          </div>
        </div>

        <div class="cer-chips" style="margin-top:10px;">
          <button type="button" class="chip" onclick="cerWizPreset(30,30)">30×30</button>
          <button type="button" class="chip" onclick="cerWizPreset(45,45)">45×45</button>
          <button type="button" class="chip" onclick="cerWizPreset(60,60)">60×60</button>
          <button type="button" class="chip" onclick="cerWizPreset(20,60)">20×60</button>
        </div>

        <div class="cer-mini-kpi" style="margin-top:10px;">
          <div class="muted">Área por pieza</div>
          <div><b id="cerWizAreaPieza">${__fmt2(areaPieza || 0)}</b> m²</div>
        </div>
      </div>
    `;
  }

  if (step === 3) {
    const unidad = (it.inventarioUnidad === "CAJA") ? "CAJA" : "PIEZA";
    const ppc = Number(String(it.piezasPorCaja || "").replace(",", ".")) || 0;
    const warn = (unidad === "CAJA" && ppc <= 0)
      ? `<div class="cer-wiz-error" style="display:block; margin-top:10px;">Inventario en CAJA: ingresa Pz/Caja para calcular correctamente.</div>`
      : "";

    body.innerHTML = `
      <div class="card-lite">
        <div style="font-weight:900;">📦 Caja / Inventario</div>
        <div class="muted" style="margin-top:2px;">Define en qué unidad está tu stock y cuántas piezas trae cada caja.</div>

        <div class="cer-seg" style="margin-top:10px;">
          <button type="button" class="${unidad==='PIEZA'?'active':''}" onclick="cerWizSet('inventarioUnidad','PIEZA')">Inventario en PIEZA</button>
          <button type="button" class="${unidad==='CAJA'?'active':''}" onclick="cerWizSet('inventarioUnidad','CAJA')">Inventario en CAJA</button>
        </div>

        <label class="label" style="margin-top:10px;">Piezas por caja (Pz/Caja)</label>
        <input id="cerWizPPC" inputmode="numeric" placeholder="Ej: 4" value="${escapeHtml(it.piezasPorCaja)}" oninput="cerWizSet('piezasPorCaja', this.value)" />
        <div class="muted" id="cerWizPpcHint" style="margin-top:4px;">${escapeHtml(it.ppcHint || "")}</div>

        ${warn}
      </div>
    `;
  }

  if (step === 4) {
    const isArea = it.modo !== "TENGO";
    body.innerHTML = `
      <div class="card-lite">
        <div style="font-weight:900;">🎯 ¿Qué quieres calcular?</div>

        <div class="cer-seg" style="margin-top:10px;">
          <button type="button" class="${isArea?'active':''}" onclick="cerWizSet('modo','AREA')">Necesito para m²</button>
          <button type="button" class="${!isArea?'active':''}" onclick="cerWizSet('modo','TENGO')">¿Cuánto cubro con lo que tengo?</button>
        </div>

        ${isArea ? `
          <label class="label" style="margin-top:10px;">Área a cubrir (m²)</label>
          <input id="cerWizArea" inputmode="decimal" placeholder="Ej: 14" value="${escapeHtml(it.areaM2)}" oninput="cerWizSet('areaM2', this.value)" />

          <details style="margin-top:10px;" ${cerWizardState?.openDims ? "open" : ""}>
            <summary class="muted" style="cursor:pointer; font-weight:900;">Calcular m² por medidas (Largo × Ancho)</summary>
            <div class="cer-wiz-grid" style="margin-top:10px;">
              <div>
                <label class="label">Largo (m)</label>
                <input id="cerWizLen" inputmode="decimal" placeholder="Ej: 4.5" />
              </div>
              <div>
                <label class="label">Ancho (m)</label>
                <input id="cerWizWid" inputmode="decimal" placeholder="Ej: 3.2" />
              </div>
            </div>
            <div class="btn-row" style="margin-top:10px;">
              <button type="button" class="secondary" onclick="cerWizCalcAreaFromDims()">Calcular y usar</button>
            </div>
          </details>
        ` : `
          <label class="label" style="margin-top:10px;">Cantidad que tienes (${escapeHtml(it.inventarioUnidad === "CAJA" ? "CAJAS" : "PIEZAS")})</label>
          <input id="cerWizTengo" inputmode="decimal" placeholder="Ej: 20" value="${escapeHtml(it.tengoCant)}" oninput="cerWizSet('tengoCant', this.value)" />
          <div class="muted" style="margin-top:4px;">Unidad: <b>${escapeHtml(it.inventarioUnidad === "CAJA" ? "CAJA" : "PIEZA")}</b></div>
        `}
      </div>
    `;
  }

  if (step === 5) {
    const res = cerCompute(it);

    let resHtml = "";
    if (!res.ok) {
      resHtml = `<b>⚠️ ${escapeHtml(res.msg || "Completa los datos.")}</b>`;
    } else if (res.modo === "AREA") {
      resHtml = `
        <div><b>✅ Necesitas:</b> ${__fmtInt(res.piezas)} piezas${(res.ppc>0?` • ${__fmtInt(res.cajas)} cajas`:"")}</div>
        <div class="muted">Pieza: ${__fmt2(res.areaPieza)} m² • Área con merma: ${__fmt2(res.areaConMerma)} m²</div>
        <div style="margin-top:6px;"><b>🛒 Recomendación:</b> ${res.faltanPiezas>0 ? `Comprar ${__fmtInt(res.faltanPiezas)} piezas${(res.ppc>0?` (~${__fmtInt(res.faltanCajas)} cajas)`:"")}` : "Tu stock alcanza ✅"}</div>
      `;
    } else {
      resHtml = `
        <div><b>✅ Con lo que tienes:</b> cubres ~ <span style="font-size:18px; font-weight:900;">${__fmt2(res.areaConMerma)}</span> m²</div>
        <div class="muted">Sin merma: ${__fmt2(res.areaSinMerma)} m² • Pieza: ${__fmt2(res.areaPieza)} m² • Unidad: ${escapeHtml(res.unidad)}</div>
      `;
    }

    body.innerHTML = `
      <div class="card-lite">
        <div style="font-weight:900;">🧯 Desperdicio</div>
        <input id="cerWizWaste" type="range" min="0" max="25" step="1" value="${escapeHtml(it.desperdicioPct)}" oninput="cerWizSet('desperdicioPct', this.value)" />
        <div class="cer-row" style="justify-content:space-between; margin-top:4px;">
          <div class="muted">0%</div>
          <div><b id="cerWizWasteLbl">${escapeHtml(it.desperdicioPct)}%</b></div>
          <div class="muted">25%</div>
        </div>

        <div class="cer-chips" style="margin-top:8px;">
          <button type="button" class="chip" onclick="cerWizSet('desperdicioPct',5); el('cerWizWaste').value=5; el('cerWizWasteLbl').textContent='5%'; cerWizRefreshLive()">5%</button>
          <button type="button" class="chip" onclick="cerWizSet('desperdicioPct',10); el('cerWizWaste').value=10; el('cerWizWasteLbl').textContent='10%'; cerWizRefreshLive()">10%</button>
          <button type="button" class="chip" onclick="cerWizSet('desperdicioPct',12); el('cerWizWaste').value=12; el('cerWizWasteLbl').textContent='12%'; cerWizRefreshLive()">12%</button>
          <button type="button" class="chip" onclick="cerWizSet('desperdicioPct',15); el('cerWizWaste').value=15; el('cerWizWasteLbl').textContent='15%'; cerWizRefreshLive()">15%</button>
        </div>

        <div class="res" id="cerWizResult" style="margin-top:10px;">${resHtml}</div>
      </div>
      <div class="muted">Guardar agregará este cálculo a la lista principal.</div>
    `;
  }

  // refrescar métricas live si el step las necesita
  cerWizRefreshLive();
}

function cerWizRefreshLive(){
  const it = cerWizardState?.item;
  if (!it) return;

  // step 2: área por pieza
  const areaPieza = (Number(it.anchoCm)||0)/100 * (Number(it.altoCm)||0)/100;
  const ap = el("cerWizAreaPieza");
  if (ap) ap.textContent = __fmt2(areaPieza || 0);

  // step 3: hint
  const hint = el("cerWizPpcHint");
  if (hint) hint.textContent = String(it.ppcHint || "");

  // step 5: waste label + result
  const wl = el("cerWizWasteLbl");
  if (wl) wl.textContent = `${__fmtInt(it.desperdicioPct || 0)}%`;

  const resBox = el("cerWizResult");
  if (resBox) {
    const res = cerCompute(it);
    if (!res.ok) {
      resBox.innerHTML = `<b>⚠️ ${escapeHtml(res.msg || "Completa los datos.")}</b>`;
    } else if (res.modo === "AREA") {
      resBox.innerHTML = `
        <div><b>✅ Necesitas:</b> ${__fmtInt(res.piezas)} piezas${(res.ppc>0?` • ${__fmtInt(res.cajas)} cajas`:"")}</div>
        <div class="muted">Pieza: ${__fmt2(res.areaPieza)} m² • Área con merma: ${__fmt2(res.areaConMerma)} m²</div>
        <div style="margin-top:6px;"><b>🛒 Recomendación:</b> ${res.faltanPiezas>0 ? `Comprar ${__fmtInt(res.faltanPiezas)} piezas${(res.ppc>0?` (~${__fmtInt(res.faltanCajas)} cajas)`:"")}` : "Tu stock alcanza ✅"}</div>
      `;
    } else {
      resBox.innerHTML = `
        <div><b>✅ Con lo que tienes:</b> cubres ~ <span style="font-size:18px; font-weight:900;">${__fmt2(res.areaConMerma)}</span> m²</div>
        <div class="muted">Sin merma: ${__fmt2(res.areaSinMerma)} m² • Pieza: ${__fmt2(res.areaPieza)} m² • Unidad: ${escapeHtml(res.unidad)}</div>
      `;
    }
  }
}

function cerWizSave(){
  if (!cerWizardState) return;
  cerWizError("");

  // Validación completa
  const ok = cerWizValidateStep(5);
  if (!ok.ok) {
    cerWizError(ok.msg || "Revisa los datos.");
    return;
  }

  const it = cerWizardState.item;
  if (!it) return;

  // commit
  if (cerWizardState.isNew) {
    ceramicaDraft.items.push(it);
  } else {
    const target = cerFind(cerWizardState.itemId);
    if (target) Object.assign(target, it);
  }

  cerWizardState = null;
  closeModal("modalCerWizard");
  renderCeramicaCalcScreen();
}
function cerSetTitulo(v){
  if (!ceramicaDraft) return;
  ceramicaDraft.titulo = String(v || "");

  // Refrescar UI (panel y modal)
  const lbl = el("cerPdfTitle");
  if (lbl) lbl.textContent = ceramicaDraft.titulo || "Sin título";

  const inp = el("cerMetaTitulo");
  if (inp && inp.value !== ceramicaDraft.titulo) inp.value = ceramicaDraft.titulo;
}


function cerPresetSize(itemId, w, h){
  const it = cerFind(itemId);
  if (!it) return;
  it.anchoCm = Number(w)||0;
  it.altoCm = Number(h)||0;

  const iw = el("cerW_"+itemId);
  const ih = el("cerH_"+itemId);
  if (iw) iw.value = String(it.anchoCm);
  if (ih) ih.value = String(it.altoCm);

  __maybeAutoPpc(it);
  cerRefreshItem(itemId);
  cerRefreshSummary();
}

function cerFind(id){
  const items = Array.isArray(ceramicaDraft?.items) ? ceramicaDraft.items : [];
  return items.find(x => String(x?.id) === String(id));
}

function cerSet(itemId, field, value){
  const it = cerFind(itemId);
  if (!it) return;

  if (field === "modo") {
    it.modo = (value === "TENGO") ? "TENGO" : "AREA";
    renderCeramicaCalcScreen();
    return;
  }

  if (field === "inventarioUnidad") {
    it.inventarioUnidad = (value === "CAJA") ? "CAJA" : "PIEZA";
    cerRefreshItem(itemId);
    cerRefreshSummary();
    return;
  }

  if (field === "anchoCm" || field === "altoCm") {
    it[field] = Number(String(value||"").replace(",", ".")) || 0;
    __maybeAutoPpc(it);
  } else if (field === "desperdicioPct") {
    it.desperdicioPct = Math.min(25, Math.max(0, Number(value)||0));
    const lbl = el("cerWasteLbl_"+itemId);
    if (lbl) lbl.textContent = `${it.desperdicioPct}%`;
  } else if (field === "piezasPorCaja") {
    it.piezasPorCaja = String(value || "").trim();
    it.ppcAuto = false;
    it.m2PorCaja = "";
    it.ppcHint = "";
    const hint = el("cerPpcHint_"+itemId);
    if (hint) hint.textContent = "";
  } else if (field === "areaM2") {
    it.areaM2 = String(value || "").trim();
  } else if (field === "tengoCant") {
    it.tengoCant = String(value || "").trim();
  } else {
    it[field] = value;
  }

  cerRefreshItem(itemId);
  cerRefreshSummary();
}

function cerAddItem(){
  cerOpenWizard();
}

function cerRemoveItem(itemId){
  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  ceramicaDraft.items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];

  ceramicaDraft.items = ceramicaDraft.items.filter(x => String(x?.id) !== String(itemId));

  // Mantener al menos 1 cálculo
  if (!ceramicaDraft.items.length) ceramicaDraft.items.push(__newCerItem());

  renderCeramicaCalcScreen();
}

function cerDuplicateItem(itemId){
  const it = cerFind(itemId);
  if (!it) return;

  // abrir wizard como "nuevo" con los mismos datos (sin afectar la lista hasta guardar)
  cerOpenWizardPrefill(it);
}

function cerNuevo(){
  ceramicaDraft = __newCerDoc();
  renderCeramicaCalcScreen();
}

function cerOpenMeta(){
  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  const inp = el("cerMetaTitulo");
  if (inp) inp.value = ceramicaDraft.titulo || "";
  openModal("modalCerMeta");
}

function cerResetDoc(){
  const ok = confirm("¿Crear un documento nuevo? Se perderán cambios no guardados.");
  if (!ok) return;
  ceramicaDraft = __newCerDoc();
  try { closeModal("modalCerMeta"); } catch {}
  renderCeramicaCalcScreen();
}

function cerClearAllItems(){
  if (!ceramicaDraft) return;
  const items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];
  if (!items.length) return;
  const ok = confirm("¿Eliminar todos los cálculos de este documento?");
  if (!ok) return;
  ceramicaDraft.items = [];
  renderCeramicaCalcScreen();
}

function cerDuplicateLast(){
  if (!ceramicaDraft) ceramicaDraft = __newCerDoc();
  ceramicaDraft.items = Array.isArray(ceramicaDraft.items) ? ceramicaDraft.items : [];
  if (!ceramicaDraft.items.length) return cerOpenWizard();

  const last = ceramicaDraft.items[ceramicaDraft.items.length - 1];
  const copy = JSON.parse(JSON.stringify(last));
  copy.id = __cerId();

  cerWizardState = {
    step: 5,
    isNew: true,
    itemId: String(copy.id),
    item: copy,
    openDims: false
  };

  cerWizRender();
  openModal("modalCerWizard");
}



function cerCompute(it){
  const w = Number(it.anchoCm)||0;
  const h = Number(it.altoCm)||0;
  const areaPieza = (w/100) * (h/100); // m2
  const desperd = Math.max(0, Number(it.desperdicioPct)||0) / 100;

  const ppc = Number(String(it.piezasPorCaja||"").replace(",", ".")) || 0;
  const stock = Number(it.stockTotal)||0;
  const unidad = it.inventarioUnidad === "CAJA" ? "CAJA" : "PIEZA";

  if (!areaPieza || areaPieza <= 0) {
    return { ok:false, msg:"Ingresa el tamaño de la pieza (cm).", areaPieza:0 };
  }


  if (unidad === "CAJA" && ppc <= 0) {
    return { ok:false, msg:"Si tu inventario está en CAJA, ingresa Piezas por caja (Pz/Caja) o cambia a PIEZA.", areaPieza: areaPieza || 0 };
  }

  if (it.modo === "AREA") {
    const area = Number(String(it.areaM2||"").replace(",", ".")) || 0;
    if (!area || area <= 0) return { ok:false, msg:"Ingresa el área (m²).", areaPieza };

    const areaConMerma = area * (1 + desperd);
    const piezas = Math.ceil(areaConMerma / areaPieza);

    let cajas = 0;
    if (ppc > 0) cajas = Math.ceil(piezas / ppc);

    // stock interpretado según unidad elegida
    let stockPiezas = stock;
    let stockCajas = stock;

    if (unidad === "CAJA") {
      stockCajas = stock;
      stockPiezas = (ppc > 0) ? (stock * ppc) : (stock * 0);
    } else {
      stockPiezas = stock;
      stockCajas = (ppc > 0) ? Math.floor(stock / ppc) : 0;
    }

    const faltanPiezas = Math.max(0, piezas - (stockPiezas || 0));
    const faltanCajas = (ppc > 0) ? Math.max(0, Math.ceil(faltanPiezas / ppc)) : 0;

    return {
      ok:true,
      modo:"AREA",
      areaPieza,
      area,
      areaConMerma,
      piezas,
      cajas,
      ppc,
      unidad,
      stockPiezas,
      stockCajas,
      faltanPiezas,
      faltanCajas
    };
  }

  // modo TENGO
  const tengo = Number(String(it.tengoCant||"").replace(",", ".")) || 0;
  if (!tengo || tengo <= 0) return { ok:false, msg:"Ingresa cuánta cerámica tienes.", areaPieza };

  const piezasDisponibles = (unidad === "CAJA")
    ? ((ppc > 0) ? (tengo * ppc) : 0)
    : tengo;

  const areaSinMerma = piezasDisponibles * areaPieza;
  const areaConMerma = areaSinMerma / (1 + desperd);

  return {
    ok:true,
    modo:"TENGO",
    areaPieza,
    tengo,
    piezasDisponibles,
    areaSinMerma,
    areaConMerma,
    ppc,
    unidad
  };
}

function cerRefreshItem(itemId){
  const it = cerFind(itemId);
  if (!it) return;

  const res = cerCompute(it);

  const box = el("cerRes_"+itemId);
  if (box) {
    if (!res.ok) {
      box.innerHTML = `<b>⚠️ ${escapeHtml(res.msg || "Completa los datos.")}</b>`;
    } else if (res.modo === "AREA") {
      box.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div>
            <div><b>✅ Necesitas:</b> ${__fmtInt(res.piezas)} piezas${(res.ppc>0?` • ${__fmtInt(res.cajas)} cajas`:"")}</div>
            <div class="muted">Pieza: ${__fmt2(res.areaPieza)} m² • Área con merma: ${__fmt2(res.areaConMerma)} m²</div>
          </div>
          <div style="text-align:right;">
            <div><b>Stock:</b> ${__fmtInt(res.stockPiezas||0)} piezas${(res.ppc>0?` • ${__fmtInt(res.stockCajas||0)} cajas`:"")}</div>
            <div class="muted">Unidad inventario: ${escapeHtml(res.unidad)}</div>
          </div>
        </div>
        <hr style="border:none; border-top:1px solid var(--borde); margin:10px 0;">
        <div><b>🛒 Recomendación:</b> ${res.faltanPiezas>0 ? `Comprar ${__fmtInt(res.faltanPiezas)} piezas${(res.ppc>0?` (~${__fmtInt(res.faltanCajas)} cajas)`:"")}` : "Tu stock alcanza ✅"}</div>
      `;
    } else {
      box.innerHTML = `
        <div><b>✅ Con lo que tienes:</b> cubres ~ <span style="font-size:18px; font-weight:900;">${__fmt2(res.areaConMerma)}</span> m²</div>
        <div class="muted">Sin merma: ${__fmt2(res.areaSinMerma)} m² • Pieza: ${__fmt2(res.areaPieza)} m² • Desperdicio: ${__fmtInt(it.desperdicioPct)}%</div>
      `;
    }
  }

  const lbl = el("cerWasteLbl_"+itemId);
  if (lbl) lbl.textContent = `${__fmtInt(it.desperdicioPct)}%`;

  // update picked summary
  const prodBox = el("cerProd_"+itemId);
  if (prodBox) {
    if (it.cerNombre) {
      prodBox.innerHTML = `
        <div class="muted" style="margin-top:2px;">
          <span class="cer-badge">${escapeHtml(it.cerCategoria || "CERÁMICA")}</span>
          <span style="margin-left:6px;"><b>${escapeHtml(it.cerNombre)}</b></span>
          <span style="margin-left:6px;">• Stock: <b>${__fmtInt(it.stockTotal)}</b></span>
        </div>
      `;
    } else {
      prodBox.innerHTML = `<div class="muted" style="margin-top:2px;">Elige una cerámica para usar tu stock (opcional).</div>`;
    }
  }

  const hintEl = el("cerPpcHint_"+itemId);
  if (hintEl) hintEl.textContent = String(it.ppcHint || "");
}

function cerRefreshSummary(){
  const box = el("cerSummary");
  if (!box) return;

  const items = Array.isArray(ceramicaDraft?.items) ? ceramicaDraft.items : [];
  let totalArea = 0;
  let totalPiezas = 0;
  let totalCajas = 0;
  let totalComprarPiezas = 0;
  let totalComprarCajas = 0;

  for (const it of items) {
    const r = cerCompute(it);
    if (r.ok && r.modo === "AREA") {
      totalArea += Number(r.area||0);
      totalPiezas += Number(r.piezas||0);
      totalCajas += Number(r.cajas||0);
      totalComprarPiezas += Number(r.faltanPiezas||0);
      totalComprarCajas += Number(r.faltanCajas||0);
    }
  }

  box.innerHTML = `
    <div class="cer-kpi">
      <div class="k">Área total (m²)</div>
      <div class="v">${__fmt2(totalArea)}</div>
    </div>
    <div class="cer-kpi">
      <div class="k">Necesitas (piezas)</div>
      <div class="v">${__fmtInt(totalPiezas)}</div>
    </div>
    <div class="cer-kpi">
      <div class="k">Recomendación compra</div>
      <div class="v">${totalComprarPiezas>0 ? __fmtInt(totalComprarPiezas) : "0"}</div>
      <div class="muted" style="margin-top:2px;">${(totalComprarCajas>0 ? `≈ ${__fmtInt(totalComprarCajas)} cajas` : "Stock suficiente o sin cajas")}</div>
    </div>
  `;
}

/* --- Modal pick cerámica --- */

function setCerPickTab(tab){
  cerPickTab = String(tab || "TODAS");

  const tabs = ["TODAS","CERAMICA","IVORY","PORCELANATO"];
  for (const t of tabs) {
    const b = el("cerTab_"+t);
    if (b) b.classList.toggle("active", t === cerPickTab);
  }
  renderPickCeramicaList();
}


function openPickCeramica(itemId){
  const id = String(itemId || "");
  if (!id) return;

  cerPickTarget = { type:"DOC", itemId: id };

  // asegurarnos que el catálogo está listo
  if (!catalogoCargado) {
    // no bloqueamos: igual abrimos y mostramos mensaje
  }

  const s = el("pickCeramicaSearch");
  if (s) {
    s.value = "";
    s.oninput = () => renderPickCeramicaList();
    setTimeout(() => s.focus(), 50);
  }

  setCerPickTab("TODAS");
  renderPickCeramicaList();
  openModal("modalPickCeramica");
}

function openPickCeramicaWizard(){
  if (!cerWizardState?.item) return;
  cerPickTarget = { type:"WIZ" };

  const s = el("pickCeramicaSearch");
  if (s) {
    s.value = "";
    s.oninput = () => renderPickCeramicaList();
    setTimeout(() => s.focus(), 50);
  }

  setCerPickTab("TODAS");
  renderPickCeramicaList();
  openModal("modalPickCeramica");
}

function renderPickCeramicaList(){
  const list = el("pickCeramicaList");
  if (!list) return;

  const q = String(el("pickCeramicaSearch")?.value || "").trim();
  const qn = __norm(q);

  const all = __getCeramicas();

  let items = all;

  if (cerPickTab !== "TODAS") {
    items = items.filter(p => __cerCategoria(p) === cerPickTab);
  }

  if (qn) {
    items = items.filter(p => {
      const blob = __norm(`${p.codigo} ${p.alias} ${p.producto}`);
      return blob.includes(qn);
    });
  }

  if (!items.length) {
    list.innerHTML = `<div class="cer-pick-item"><div><div class="name">No hay coincidencias</div><div class="meta">Prueba otro nombre o cambia la categoría.</div></div></div>`;
    return;
  }

  // limitar para rendimiento
  const max = 200;
  const shown = items.slice(0, max);

  list.innerHTML = shown.map(p => {
    const cat = __cerCategoria(p) || "CERÁMICA";
    const name = p.producto || "";
    const code = p.codigo || "";
    const alias = p.alias || "";
    const stock = Number(p.stockTotal || 0);
    return `
      <div class="cer-pick-item" onclick="pickCeramica('${encodeURIComponent(String(code))}')">
        <div>
          <div class="name">${escapeHtml(name)}</div>
          <div class="meta">
            <span class="cer-badge">${escapeHtml(cat)}</span>
            <span style="margin-left:6px;">Código: <b>${escapeHtml(code)}</b></span>
            ${alias ? `<span style="margin-left:6px;">Alias: <b>${escapeHtml(alias)}</b></span>` : ""}
          </div>
        </div>
        <div class="cer-stock">
          <div class="n">${__fmtInt(stock)}</div>
          <div class="t">Stock total</div>
        </div>
      </div>
    `;
  }).join("") + (items.length>max ? `<div class="muted" style="margin-top:8px;">Mostrando ${max} de ${items.length} resultados. Usa el buscador.</div>` : "");
}


function pickCeramica(codeEnc){
  const code = decodeURIComponent(codeEnc || "");
  if (!cerPickTarget) return;

  let it = null;

  if (cerPickTarget.type === "DOC") {
    it = cerFind(cerPickTarget.itemId);
  } else if (cerPickTarget.type === "WIZ") {
    it = cerWizardState?.item || null;
  }

  if (!it) return;

  const p = inventarioAdmin.find(x => String(x?.codigo) === String(code));
  if (!p) return;

  it.cerCodigo = String(p.codigo || "");
  it.cerNombre = String(p.producto || "");
  it.cerAlias = String(p.alias || "");
  it.cerCategoria = __cerCategoria(p) || "CERÁMICA";
  it.stockTotal = Number(p.stockTotal || 0);

  // Autodetección de unidad / Pz/Caja desde nombre/alias (si aplica)
  try {
    const info = __parseCajaInfo(p);

    // Unidad sugerida (si la detectamos)
    if (info?.unidad) it.inventarioUnidad = (info.unidad === "CAJA") ? "CAJA" : "PIEZA";

    // Reset por defecto
    it.ppcHint = "";
    it.ppcAuto = false;
    it.m2PorCaja = "";

    if (info?.ppc > 0) {
      it.piezasPorCaja = String(Math.round(info.ppc));
      it.ppcHint = "Pz/Caja detectado automáticamente desde el nombre/alias.";

    } else if (info?.m2Caja > 0) {
      it.m2PorCaja = String(info.m2Caja);
      it.ppcAuto = true;

      // Si ya está el tamaño, estimamos Pz/Caja con base en m²/caja
      __maybeAutoPpc(it);

      if (!String(it.piezasPorCaja || "").trim()) {
        it.ppcHint = `Detectado ${__fmt2(info.m2Caja)} m²/caja. Completa el tamaño para estimar Pz/Caja.`;
      }
    }
  } catch(e){
    console.warn(e);
  }

  closeModal("modalPickCeramica");

  if (cerPickTarget.type === "WIZ") {
    cerWizRender();
  } else {
    renderCeramicaCalcScreen();
  }
}

/* --- Guardar / Historial --- */

function cerSaveDoc(){
  if (!ceramicaDraft) return;

  // Guardar snapshot limpio
  const snap = JSON.parse(JSON.stringify(ceramicaDraft));
  snap.modificado = Date.now();

  // Validación básica
  if (!Array.isArray(snap.items) || !snap.items.length) {
    alert("Agrega al menos 1 cálculo.");
    return;
  }

  // upsert
  ceramicaDocs = Array.isArray(ceramicaDocs) ? ceramicaDocs : [];
  const idx = ceramicaDocs.findIndex(x => String(x?.id) === String(snap.id));
  if (idx >= 0) ceramicaDocs[idx] = snap;
  else ceramicaDocs.unshift(snap);

  localStorage.setItem("ceramicaDocs", JSON.stringify(ceramicaDocs));
  try { showToast("Guardado ✅"); } catch { alert("Guardado ✅"); }
}

function openCeramicaHistory(){
  try { ceramicaDocs = JSON.parse(localStorage.getItem("ceramicaDocs") || "[]"); } catch { ceramicaDocs = []; }
  const list = el("cerHistoryList");
  if (!list) return;

  const docs = Array.isArray(ceramicaDocs) ? ceramicaDocs : [];

  if (!docs.length) {
    list.innerHTML = `<div class="muted">Aún no has guardado cálculos.</div>`;
  } else {
    list.innerHTML = docs.slice(0, 50).map(d => {
      const t = d.titulo ? escapeHtml(d.titulo) : "(Sin título)";
      const when = new Date(d.modificado || d.creado || Date.now()).toLocaleString("es-ES");
      const n = Array.isArray(d.items) ? d.items.length : 0;
      return `
        <div class="card-lite">
          <div style="font-weight:900;">${t}</div>
          <div class="muted">${escapeHtml(when)} • ${n} cálculo(s)</div>
          <div class="btn-row" style="margin-top:10px;">
            <button type="button" onclick="openCeramicaCalcScreen('${escapeHtml(String(d.id))}'); closeModal('modalCeramicaHistory')">Abrir</button>
            <button type="button" class="secondary" onclick="cerExportPdfFromHistory('${escapeHtml(String(d.id))}')">PDF</button>
            <button type="button" class="danger" onclick="cerDeleteDoc('${escapeHtml(String(d.id))}')">Eliminar</button>
          </div>
        </div>
      `;
    }).join("");
  }

  openModal("modalCeramicaHistory");
}

function cerDeleteDoc(id){
  if (!confirm("¿Eliminar este cálculo guardado?")) return;
  ceramicaDocs = Array.isArray(ceramicaDocs) ? ceramicaDocs : [];
  ceramicaDocs = ceramicaDocs.filter(x => String(x?.id) !== String(id));
  localStorage.setItem("ceramicaDocs", JSON.stringify(ceramicaDocs));
  openCeramicaHistory();
}

async function cerExportPdfFromHistory(id){
  const d = (Array.isArray(ceramicaDocs) ? ceramicaDocs : []).find(x => String(x?.id) === String(id));
  if (!d) return alert("No se encontró el cálculo.");
  try {
    await crearPdfCeramica(d);
    await autoShareLastFile();
  } catch(e){
    console.error(e);
    alert("❌ No se pudo generar el PDF.");
  }
}

/* --- PDF --- */

async function autoShareLastFile(){
  // Android (WebView puente)
  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    try { compartirArchivo(); } catch {}
    return;
  }

  // Web Share API (si soporta archivos)
  try {
    if (navigator.share && lastFile?.blob) {
      const f = new File([lastFile.blob], lastFile.filename || "archivo.pdf", { type: lastFile.mime || "application/pdf" });
      if (!navigator.canShare || navigator.canShare({ files: [f] })) {
        await navigator.share({
          files: [f],
          title: lastFile.title || "Documento",
          text: lastFile.text || ""
        });
        return;
      }
    }
  } catch (e) {
    // si cancela share, seguimos con fallback
  }

  // fallback
  try { window.open(lastFile.url, "_blank"); } catch { try { descargarArchivo(); } catch {} }
}

async function cerExportPdf(){
  if (!ceramicaDraft) return;

  if (!Array.isArray(ceramicaDraft.items) || !ceramicaDraft.items.length) {
    alert("Agrega al menos 1 cálculo.");
    return;
  }

  // Guardar antes de exportar (práctico para reusar)
  try { cerSaveDoc(); } catch {}

  try {
    await crearPdfCeramica(ceramicaDraft);
    await autoShareLastFile(); // ✅ compartir automáticamente
  } catch(e){
    console.error(e);
    alert("❌ No se pudo generar el PDF.");
  }
}


async function crearPdfCeramica(docData){
  const pkg = window.jspdf || {};
  const jsPDF = pkg.jsPDF;
  const GState = pkg.GState;

  if (!jsPDF) {
    alert("No se encontró jsPDF. Revisa el script en index.html.");
    return;
  }

  const PAGE_W = 80;
  const PAGE_H = 297;
  const marginL = 4;
  const marginR = PAGE_W - 4;
  const lineH = 4.2;
  const bottomReserve = 18;

  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, PAGE_H] });

  const logoDataUrl = await getLogoDataUrl().catch(() => null);

  let y = 6;
  let page = 1;

  function setOpacity(a){
    try { if (GState) doc.setGState(new GState({ opacity: a })); } catch {}
  }

  function header(){
    // watermark suave
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    setOpacity(0.10);
    doc.text("CERÁMICA", 40, 150, { align: "center", angle: 45 });
    setOpacity(1);

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 30, y, 20, 18);
      y += 22;
    }

    doc.setTextColor(36, 58, 143);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FERRETERÍA UNIVERSAL", 40, y, { align: "center" });
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(`RTN: ${EMPRESA_RTN}`, 40, y, { align: "center" });
    y += 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("CALCULO DE METROS CUADRADOS DE CERAMICAS", 40, y, { align: "center" });
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const now = new Date();
    doc.text(`Fecha: ${now.toLocaleString("es-ES")}`, marginL, y);
    y += 4.5;

    const titulo = String(docData?.titulo || "").trim();
    if (titulo) {
      const lines = doc.splitTextToSize(`Proyecto/Cliente: ${titulo}`, PAGE_W - marginL*2);
      for (const ln of lines) {
        doc.text(ln, marginL, y);
        y += 4.2;
      }
    }

    doc.setDrawColor(220);
    doc.line(marginL, y, marginR, y);
    y += 4;
  }

  function ensureSpace(extra){
    if (y + extra + bottomReserve > PAGE_H) {
      doc.addPage();
      page += 1;
      y = 10;
      doc.setTextColor(31, 41, 55);
    }
  }

  function rowKeyVal(k, v){
    doc.setFont("helvetica", "bold");
    doc.text(String(k), marginL, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), marginR, y, { align: "right" });
    y += lineH;
  }

  header();

  const items = Array.isArray(docData?.items) ? docData.items : [];
  let totalArea = 0;
  let totalPiezas = 0;
  let totalCajas = 0;
  let totalComprarP = 0;
  let totalComprarC = 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DETALLE", marginL, y);
  y += 4;

  for (let i=0;i<items.length;i++){
    const it = items[i];
    const r = cerCompute(it);

    ensureSpace(40);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`• Cálculo ${i+1}`, marginL, y);
    y += 4.5;

    const name = it.cerNombre ? it.cerNombre : "Cerámica (sin seleccionar)";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const nameLines = doc.splitTextToSize(name, PAGE_W - marginL*2);
    for (const ln of nameLines) { doc.text(ln, marginL, y); y += 4.1; }

    const sizeTxt = `${__fmtInt(it.anchoCm)}×${__fmtInt(it.altoCm)} cm`;
    rowKeyVal("Tamaño", sizeTxt);

    const ppc = Number(String(it.piezasPorCaja||"").replace(",", ".")) || 0;
    rowKeyVal("Merma", `${__fmtInt(it.desperdicioPct)}%`);
    rowKeyVal("Pz/Caja", ppc>0 ? __fmtInt(ppc) : "-");
    rowKeyVal("Unidad", it.inventarioUnidad || "PIEZA");

    if (!r.ok) {
      doc.setFont("helvetica", "bold");
      doc.text("⚠️ Datos incompletos", marginL, y);
      y += 5;
    } else if (r.modo === "AREA") {
      totalArea += Number(r.area||0);
      totalPiezas += Number(r.piezas||0);
      totalCajas += Number(r.cajas||0);
      totalComprarP += Number(r.faltanPiezas||0);
      totalComprarC += Number(r.faltanCajas||0);

      rowKeyVal("Área", `${__fmt2(r.area)} m²`);
      rowKeyVal("Necesitas", `${__fmtInt(r.piezas)} pz`);
      if (r.ppc>0) rowKeyVal("Cajas", `${__fmtInt(r.cajas)} caja(s)`);

      rowKeyVal("Stock pz", __fmtInt(r.stockPiezas||0));
      if (r.ppc>0) rowKeyVal("Stock cajas", __fmtInt(r.stockCajas||0));

      if (r.faltanPiezas>0) {
        doc.setFont("helvetica", "bold");
        doc.text(`Comprar: ${__fmtInt(r.faltanPiezas)} pz${(r.ppc>0?` (~${__fmtInt(r.faltanCajas)} cajas)`:"")}`, marginL, y);
        y += 4.8;
      } else {
        doc.setFont("helvetica", "bold");
        doc.text("Stock suficiente ✅", marginL, y);
        y += 4.8;
      }
    } else {
      rowKeyVal("Tienes", `${__fmtInt(r.tengo)} ${r.unidad}`);
      rowKeyVal("Cubre", `${__fmt2(r.areaConMerma)} m²`);
    }

    doc.setDrawColor(230);
    doc.line(marginL, y, marginR, y);
    y += 4;
  }

  ensureSpace(30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("RESUMEN", marginL, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  rowKeyVal("Área total", `${__fmt2(totalArea)} m²`);
  rowKeyVal("Total piezas", __fmtInt(totalPiezas));
  if (totalCajas>0) rowKeyVal("Total cajas", __fmtInt(totalCajas));
  rowKeyVal("Recomendación", totalComprarP>0 ? `${__fmtInt(totalComprarP)} pz` : "0 pz");
  if (totalComprarC>0) rowKeyVal("≈ cajas", __fmtInt(totalComprarC));

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Nota: El cálculo depende del tamaño y la merma elegida.", marginL, PAGE_H - 10);

  const blob = doc.output("blob");
  const fname = `CALCULO_CERAMICA_${new Date().toISOString().slice(0,10)}.pdf`;
  setLastFile(blob, fname, "Cálculo de cerámica", "Cálculo de metros cuadrados de cerámica.", "application/pdf");
}


/* ================= RECEPCION: INGRESOS + HISTORIAL ================= */

function ensureRecepcionStateLoaded(force = false){
  if (recepcionLoaded && !force) return;

  try { recepcionCatalogoLocal = JSON.parse(localStorage.getItem("recepcionCatalogoLocal") || "{}"); }
  catch { recepcionCatalogoLocal = {}; }

  try { recepcionIngresos = JSON.parse(localStorage.getItem("recepcionIngresos") || "[]"); }
  catch { recepcionIngresos = []; }

  try { recepcionDraftIngreso = JSON.parse(localStorage.getItem("recepcionDraftIngreso") || "null"); }
  catch { recepcionDraftIngreso = null; }

  recepcionLoaded = true;
}

function persistRecepcionIngresos(){
  try { localStorage.setItem("recepcionIngresos", JSON.stringify(recepcionIngresos || [])); } catch {}
}

function persistRecepcionCatalogo(){
  try { localStorage.setItem("recepcionCatalogoLocal", JSON.stringify(recepcionCatalogoLocal || {})); } catch {}
}

function setRecepcionDraft(doc){
  recepcionDraftIngreso = doc || null;
  if (!doc) {
    try { localStorage.removeItem("recepcionDraftIngreso"); } catch {}
  } else {
    try { localStorage.setItem("recepcionDraftIngreso", JSON.stringify(doc)); } catch {}
  }
}

function newRecepcionIngreso(){
  const now = new Date();
  return {
    id: Date.now(),
    fechaISO: now.toISOString().slice(0,10),
    proveedor: "",
    referencia: "",
    notas: "",
    items: [],
    createdAtISO: now.toISOString(),
    updatedAtISO: now.toISOString()
  };
}

function renderRecepcionHome(){
  ensureRecepcionStateLoaded();

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  const hasDraft = !!(recepcionDraftIngreso && Array.isArray(recepcionDraftIngreso.items) && recepcionDraftIngreso.items.length);

  contenido.innerHTML = `
    <div class="card">
      <strong>📥 Recepción</strong>
      <div class="muted">Registrar ingresos de proveedores por ALIAS (código de barras).</div>
    </div>

    ${hasDraft ? `
      <div class="card-lite">
        <strong>📝 Borrador encontrado</strong>
        <div class="muted" style="margin-top:6px;">
          Fecha: <b>${escapeHtml(recepcionDraftIngreso.fechaISO || "")}</b> · Items: <b>${(recepcionDraftIngreso.items||[]).length}</b>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="button" onclick="abrirRecepcionNuevoIngreso(false)">Continuar borrador</button>
          <button type="button" class="secondary" onclick="borrarRecepcionBorrador()">🧹 Borrar borrador</button>
        </div>
      </div>
    ` : ""}

    <div class="card-lite">
      <div class="btn-row">
        <button type="button" onclick="abrirRecepcionNuevoIngreso(true)">📥 Nuevo ingreso</button>
        <button type="button" class="secondary" onclick="abrirRecepcionHistorial()">📚 Historial de ingresos</button>
      </div>
    </div>
  `;
}

function borrarRecepcionBorrador(){
  setRecepcionDraft(null);
  recepcionIngresoDoc = null;
  recepcionEditId = null;
  alert("🧹 Borrador eliminado.");
  renderRecepcionHome();
}

function abrirRecepcionNuevoIngreso(forceNew = true){
  ensureRecepcionStateLoaded();

  recepcionEditId = null;

  if (!forceNew && recepcionDraftIngreso) {
    recepcionIngresoDoc = recepcionDraftIngreso;
  } else {
    recepcionIngresoDoc = newRecepcionIngreso();
    setRecepcionDraft(recepcionIngresoDoc);
  }

  renderRecepcionIngreso();
}

function abrirRecepcionHistorial(){
  ensureRecepcionStateLoaded();

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="renderRecepcionHome()">⬅ Volver</button>

    <div class="card">
      <strong>📚 Historial de ingresos</strong>
      <div class="muted">Abrir, compartir o eliminar ingresos guardados localmente.</div>
    </div>

    <div class="card-lite">
      <label class="label">Buscar</label>
      <input id="recHistQ" placeholder="Proveedor / referencia / producto / código" oninput="renderRecepcionHistorialList()" />
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="abrirRecepcionNuevoIngreso(true)">📥 Nuevo ingreso</button>
        <button type="button" class="secondary" onclick="renderRecepcionHistorialList(true)">⟳ Actualizar</button>
      </div>
    </div>

    <div id="recHistList"></div>
  `;

  renderRecepcionHistorialList();
}

function renderRecepcionHistorialList(force = false){
  ensureRecepcionStateLoaded();

  const list = el("recHistList");
  if (!list) return;

  const q = String(el("recHistQ")?.value || "").toLowerCase().trim();

  const docs = (Array.isArray(recepcionIngresos) ? recepcionIngresos : [])
    .slice()
    .sort((a,b) => (b.updatedAtISO || b.createdAtISO || "").localeCompare(a.updatedAtISO || a.createdAtISO || ""));

  const filtered = !q ? docs : docs.filter(d => {
    const proveedor = String(d.proveedor || "").toLowerCase();
    const ref = String(d.referencia || "").toLowerCase();
    const fecha = String(d.fechaISO || "").toLowerCase();
    const items = Array.isArray(d.items) ? d.items : [];
    const inItems = items.some(it => {
      const p = String(it.producto || "").toLowerCase();
      const c = String(it.codigo || "").toLowerCase();
      const a = String(it.alias || "").toLowerCase();
      return p.includes(q) || c.includes(q) || a.includes(q);
    });
    return proveedor.includes(q) || ref.includes(q) || fecha.includes(q) || inItems;
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="card">
        <strong>No hay ingresos guardados.</strong>
        <div class="muted">Cuando guardes un ingreso, aparecerá aquí.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(d => {
    const items = Array.isArray(d.items) ? d.items : [];
    const totalItems = items.length;
    const totalUnidades = items.reduce((s,it) => s + (Number(it.cantidad || 0) || 0), 0);

    return `
      <div class="card-lite">
        <strong>📄 ${escapeHtml(d.fechaISO || "")}${d.proveedor ? ` • ${escapeHtml(d.proveedor)}` : ""}</strong>
        <div class="muted" style="margin-top:6px;">
          ${d.referencia ? `Ref: <b>${escapeHtml(d.referencia)}</b> • ` : ""}
          Items: <b>${totalItems}</b> • Unidades: <b>${totalUnidades}</b>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="button" onclick="abrirRecepcionIngresoEdit(${JSON.stringify(d.id)})">Abrir</button>
          <button type="button" class="secondary" onclick="recepCompartirPdfById(${JSON.stringify(d.id)})">📄 PDF</button>
          <button type="button" class="secondary" onclick="recepCompartirExcelById(${JSON.stringify(d.id)})">📊 Excel</button>
          <button type="button" class="danger" onclick="eliminarRecepIngreso(${JSON.stringify(d.id)})">🗑️</button>
        </div>
      </div>
    `;
  }).join("");
}

function abrirRecepcionIngresoEdit(id){
  ensureRecepcionStateLoaded();
  const d = (Array.isArray(recepcionIngresos) ? recepcionIngresos : []).find(x => String(x?.id) === String(id));
  if (!d) return alert("No se encontró el ingreso.");
  recepcionIngresoDoc = JSON.parse(JSON.stringify(d));
  recepcionEditId = d.id;
  setRecepcionDraft(recepcionIngresoDoc);
  renderRecepcionIngreso();
}

function eliminarRecepIngreso(id){
  ensureRecepcionStateLoaded();
  if (!confirm("¿Eliminar este ingreso del historial?")) return;
  recepcionIngresos = (Array.isArray(recepcionIngresos) ? recepcionIngresos : []).filter(x => String(x?.id) !== String(id));
  persistRecepcionIngresos();
  renderRecepcionHistorialList(true);
}

function renderRecepcionIngreso(){
  ensureRecepcionStateLoaded();

  const d = recepcionIngresoDoc || newRecepcionIngreso();
  recepcionIngresoDoc = d;

  const isEdit = !!recepcionEditId;

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="${isEdit ? "abrirRecepcionHistorial()" : "renderRecepcionHome()"}">⬅ Volver</button>

    <div class="card">
      <strong>📥 ${isEdit ? "Editar ingreso" : "Recibir productos"}</strong>
      <div class="muted">${isEdit ? "Modifica el ingreso y guarda cambios." : "Escanea por ALIAS para agregar productos."}</div>
    </div>

    <div class="card-lite">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input type="date" id="recFecha" value="${escapeHtml(d.fechaISO || "")}" onchange="onRecFecha(this.value)" />
        </div>
        <div class="col">
          <label class="label">Proveedor</label>
          <input id="recProveedor" placeholder="Opcional" value="${escapeHtml(d.proveedor || "")}" oninput="onRecProveedor(this.value)" />
        </div>
      </div>

      <div class="op-grid" style="margin-top:10px;">
        <div class="col">
          <label class="label">Factura / Referencia</label>
          <input id="recRef" placeholder="Opcional" value="${escapeHtml(d.referencia || "")}" oninput="onRecRef(this.value)" />
        </div>
        <div class="col">
          <label class="label">Acciones</label>
          <div class="btn-row">
            <button type="button" class="secondary" onclick="abrirBarcodeRecepcion()">🏷️ Escanear ALIAS</button>
            <button type="button" class="secondary" onclick="abrirModalRecepNuevoProd('')">➕ Agregar alias</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card-lite">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <strong>Productos recibidos</strong>
        <button type="button" class="secondary small" onclick="abrirBarcodeRecepcion()">🏷️ Barras</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="recItemsWrap"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="recPreview"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="guardarIngresoRecepcion()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar ingreso"}</button>
        <button type="button" class="secondary" onclick="recepCompartirPdfActual()">📄 Compartir PDF</button>
        <button type="button" class="secondary" onclick="recepCompartirExcelActual()">📊 Compartir Excel</button>
        <button type="button" class="secondary" onclick="borrarRecepcionBorrador()">🧹 Borrar borrador</button>
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" class="secondary" onclick="abrirRecepcionHistorial()">📚 Historial</button>
        <button type="button" class="secondary" onclick="abrirRecepcionNuevoIngreso(true)">🧾 Nuevo ingreso</button>
      </div>
    </div>
  `;

  renderFilasRecepcionIngreso();
  actualizarPreviewRecepcionIngreso();
  setRecepcionDraft(recepcionIngresoDoc);
}

function onRecFecha(v){
  if (!recepcionIngresoDoc) return;
  recepcionIngresoDoc.fechaISO = v;
  recepTouchDraft();
}

function onRecProveedor(v){
  if (!recepcionIngresoDoc) return;
  recepcionIngresoDoc.proveedor = v;
  recepTouchDraft();
}

function onRecRef(v){
  if (!recepcionIngresoDoc) return;
  recepcionIngresoDoc.referencia = v;
  recepTouchDraft();
}

function recepTouchDraft(){
  if (!recepcionIngresoDoc) return;
  recepcionIngresoDoc.updatedAtISO = new Date().toISOString();
  setRecepcionDraft(recepcionIngresoDoc);
  actualizarPreviewRecepcionIngreso();
}

function renderFilasRecepcionIngreso(){
  const wrap = el("recItemsWrap");
  if (!wrap) return;

  const items = Array.isArray(recepcionIngresoDoc?.items) ? recepcionIngresoDoc.items : [];
  if (!items.length) {
    wrap.innerHTML = `
      <div class="card" style="margin:0;">
        <strong>Escanea un producto para empezar.</strong>
        <div class="muted">Usa “Escanear ALIAS” para agregar productos.</div>
      </div>
    `;
    return;
  }

  wrap.innerHTML = items.map(it => `
    <div class="op-row-wrap">
      <div class="op-row">
        <div class="op-row-main">
          <div class="op-row-title">${escapeHtml(it.producto || "Producto")}</div>
          <div class="op-row-sub muted">
            ${it.codigo ? `Código: <b>${escapeHtml(it.codigo)}</b>` : `<span class="muted">Sin código</span>`}
            ${it.alias ? ` • ALIAS: <b>${escapeHtml(it.alias)}</b>` : ``}
          </div>
        </div>

        <div class="op-row-actions">
          <input
            class="op-qty"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(String(it.cantidad ?? 0))}"
            oninput="onRecItemQty(${JSON.stringify(it.id)}, this.value)"
          />
          <button type="button" class="danger small" onclick="eliminarRecItem(${JSON.stringify(it.id)})">✖</button>
        </div>
      </div>
    </div>
  `).join("");
}

function onRecItemQty(itemId, v){
  const items = Array.isArray(recepcionIngresoDoc?.items) ? recepcionIngresoDoc.items : [];
  const it = items.find(x => String(x?.id) === String(itemId));
  if (!it) return;
  it.cantidad = Number(v || 0) || 0;
  recepTouchDraft();
}

function eliminarRecItem(itemId){
  if (!recepcionIngresoDoc) return;
  recepcionIngresoDoc.items = (recepcionIngresoDoc.items || []).filter(x => String(x?.id) !== String(itemId));
  recepTouchDraft();
  renderFilasRecepcionIngreso();
}

function actualizarPreviewRecepcionIngreso(){
  const box = el("recPreview");
  if (!box || !recepcionIngresoDoc) return;

  const items = Array.isArray(recepcionIngresoDoc.items) ? recepcionIngresoDoc.items : [];
  const totalItems = items.length;
  const totalUnidades = items.reduce((s,it) => s + (Number(it.cantidad || 0) || 0), 0);

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
      <div>
        <div style="font-weight:900;">Ingreso Recepción</div>
        <div class="muted" style="margin-top:4px;">
          Fecha: <b>${escapeHtml(recepcionIngresoDoc.fechaISO || "")}</b>
          ${recepcionIngresoDoc.proveedor ? ` • Proveedor: <b>${escapeHtml(recepcionIngresoDoc.proveedor)}</b>` : ""}
        </div>
        ${recepcionIngresoDoc.referencia ? `<div class="muted" style="margin-top:4px;">Ref: <b>${escapeHtml(recepcionIngresoDoc.referencia)}</b></div>` : ""}
      </div>
      <div style="text-align:right;">
        <div class="muted">Items</div>
        <div style="font-weight:900; font-size:18px;">${totalItems}</div>
        <div class="muted" style="margin-top:2px;">Unidades: <b>${totalUnidades}</b></div>
      </div>
    </div>

    ${items.length ? `
      <div style="margin-top:10px; border-top:1px dashed var(--borde); padding-top:10px;">
        ${items.slice(0, 8).map(it => `
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(it.producto || "")}
            </div>
            <div style="font-weight:900;">${Number(it.cantidad || 0) || 0}</div>
          </div>
        `).join("")}
        ${items.length > 8 ? `<div class="muted" style="margin-top:6px;">… y ${items.length - 8} más</div>` : ""}
      </div>
    ` : ""}
  `;
}

function getProdByAliasRecepcion(alias){
  // primero buscar en catálogo maestro
  const p = getProdByAlias(alias);
  if (p) return p;

  // luego buscar en catálogo local de recepción
  try {
    ensureRecepcionStateLoaded();
    const loc = recepcionCatalogoLocal ? recepcionCatalogoLocal[alias] : null;
    if (loc) {
      return {
        codigo: loc.codigo || "",
        producto: loc.producto || "",
        alias: loc.alias || alias
      };
    }
  } catch {}
  return null;
}

async function abrirBarcodeRecepcion(){
  if (!recepcionIngresoDoc) abrirRecepcionNuevoIngreso(true);

  try { await ensureCatalogoCargado(); } catch {}

  abrirModalBarcode(
    "Recibir por ALIAS",
    "Escanea el código de barras (ALIAS). Al encontrarlo, se mostrará el producto y podrás ingresar la cantidad.",
    {
      lookupFn: (alias) => getProdByAliasRecepcion(alias),
      allowNewAlias: true,
      onNewAlias: (alias) => abrirModalRecepNuevoProd(alias),
      promptQty: true,
      onFound: (prod, qty) => {
        recepAddProdToIngreso(prod, prod?.alias || null, qty);
        try { showToast(`Agregado: ${String(prod?.producto || "Producto")} • ${Number(qty||0)} u`); } catch {}
      }
    }
  );
}

function recepAddProdToIngreso(prod, alias, qty = 1){
  if (!recepcionIngresoDoc) return;

  let cantidad = Number(qty);
  if (!isFinite(cantidad) || cantidad <= 0) cantidad = 1;

  const codigo = String(prod?.codigo || "").trim();
  const nombre = String(prod?.producto || "").trim();
  const al = String(alias || prod?.alias || "").trim();

  // buscar existente por código o alias
  const items = Array.isArray(recepcionIngresoDoc.items) ? recepcionIngresoDoc.items : [];
  let it = null;

  if (codigo) it = items.find(x => String(x?.codigo || "") === codigo);
  if (!it && al) it = items.find(x => String(x?.alias || "") === al);

  if (it) {
    it.cantidad = (Number(it.cantidad || 0) || 0) + cantidad;
    recepTouchDraft();
    renderFilasRecepcionIngreso();
    return;
  }

  const now = new Date();
  recepcionIngresoDoc.items = items.concat([{
    id: Date.now() + Math.floor(Math.random()*1000),
    codigo,
    alias: al,
    producto: nombre || "Producto",
    cantidad: cantidad,
    agregadoAtISO: now.toISOString(),
    agregadoAtEpoch: Date.now()
  }]);

  recepTouchDraft();
  renderFilasRecepcionIngreso();
}


/* ===== RECEPCION: NUEVO ALIAS ===== */

let __recNewAliasPrefill = "";


function abrirModalRecepNuevoProd(alias = ""){
  ensureRecepcionStateLoaded();
  __recNewAliasPrefill = normalizeAlias(alias || "") || "";

  if (el("recNewAlias")) el("recNewAlias").value = __recNewAliasPrefill;
  if (el("recNewNombre")) el("recNewNombre").value = "";
  if (el("recNewCodigo")) el("recNewCodigo").value = "";
  if (el("recNewError")) el("recNewError").classList.add("hidden");

  openModal("modalRecepNuevoProd");
  setTimeout(() => {
    if (el("recNewNombre")) el("recNewNombre").focus();
  }, 50);
}

function cerrarModalRecepNuevoProd(){
  closeModal("modalRecepNuevoProd");
}

function guardarRecepNuevoProd(){
  ensureRecepcionStateLoaded();

  const alias = normalizeAlias(el("recNewAlias")?.value || "") || "";
  const nombre = String(el("recNewNombre")?.value || "").trim();
  let codigo = String(el("recNewCodigo")?.value || "").trim();

  if (codigo) codigo = formatCodigoAutoGuion(codigo);

  if (!alias || !nombre) {
    if (el("recNewError")) el("recNewError").classList.remove("hidden");
    return;
  }

  if (!recepcionCatalogoLocal) recepcionCatalogoLocal = {};
  recepcionCatalogoLocal[alias] = {
    alias,
    producto: nombre,
    codigo: codigo || "",
    createdAtISO: new Date().toISOString()
  };
  persistRecepcionCatalogo();

  cerrarModalRecepNuevoProd();

  // agregar al ingreso si hay uno abierto
  try { recepAddProdToIngreso({ codigo: codigo || "", producto: nombre, alias }, alias); } catch {}
}

function abrirModalRecepSugCodigo(){
  // Necesitamos el nombre para comparar
  const name = String(el("recNewNombre")?.value || "").trim();
  if (el("recSugQuery")) el("recSugQuery").value = name;
  openModal("modalRecepSugCodigo");
  setTimeout(() => {
    renderRecepSugCodigoList(true);
    el("recSugQuery")?.focus();
  }, 30);
}

function cerrarModalRecepSugCodigo(){
  closeModal("modalRecepSugCodigo");
}

function _normText(s){
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function _simScore(a, b){
  const A = _normText(a);
  const B = _normText(b);
  if (!A || !B) return 0;

  if (A === B) return 1;

  const at = A.split(/\s+/).filter(w => w.length >= 2);
  const bt = B.split(/\s+/).filter(w => w.length >= 2);

  const setA = new Set(at);
  const setB = new Set(bt);

  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;

  const union = new Set([...setA, ...setB]).size || 1;
  let j = inter / union;

  // bonus por substring
  if (B.includes(A) || A.includes(B)) j += 0.35;

  return Math.min(1, j);
}

function _nextCodigo(code){
  const s = String(code || "").trim();
  const m = s.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return "";
  const prefix = m[1];
  const digits = m[2];
  const suffix = m[3] || "";
  const n = (parseInt(digits, 10) + 1);
  if (!isFinite(n)) return "";
  const padded = String(n).padStart(digits.length, "0");
  return prefix + padded + suffix;
}

function renderRecepSugCodigoList(force = false){
  const cont = el("recSugList");
  if (!cont) return;

  const q = String(el("recSugQuery")?.value || "").trim();
  if (!q) {
    cont.innerHTML = `
      <div class="card" style="margin:0;">
        <strong>Escribe el nombre del producto.</strong>
        <div class="muted">Luego selecciona “Usar” o “Siguiente”.</div>
      </div>
    `;
    return;
  }

  // asegurar catálogo maestro (async sin bloquear UI)
  try {
    if (!Array.isArray(catalogo) || !catalogo.length) {
      cont.innerHTML = `
        <div class="card" style="margin:0;">
          <strong>Cargando catálogo...</strong>
          <div class="muted">Espera un momento y se mostrará la lista.</div>
        </div>
      `;
      Promise.resolve(ensureCatalogoCargado()).then(() => { try { renderRecepSugCodigoList(true); } catch {} });
      return;
    }
  } catch {}

  const matches = (Array.isArray(catalogo) ? catalogo : [])
    .map(p => ({
      codigo: String(p.codigo || ""),
      producto: String(p.producto || ""),
      score: _simScore(q, p.producto || "")
    }))
    .filter(x => x.codigo && x.score > 0.05)
    .sort((a,b) => b.score - a.score)
    .slice(0, 20);

  if (!matches.length) {
    cont.innerHTML = `
      <div class="card" style="margin:0;">
        <strong>No se encontraron coincidencias.</strong>
        <div class="muted">Puedes escribir el código manualmente.</div>
      </div>
    `;
    return;
  }

  cont.innerHTML = matches.map(m => {
    const next = _nextCodigo(m.codigo);
    return `
      <div class="list-item" style="font-weight:700;">
        <div><b>${escapeHtml(m.codigo)}</b> — ${escapeHtml(m.producto)}</div>
        <div class="muted" style="margin-top:4px;">Similitud: ${(m.score*100).toFixed(0)}%</div>
        <div class="btn-row" style="margin-top:8px;">
          <button type="button" class="secondary small" onclick="seleccionarRecepCodigo(${JSON.stringify(m.codigo)})">Usar</button>
          ${next ? `<button type="button" class="secondary small" onclick="seleccionarRecepCodigo(${JSON.stringify(next)})">Siguiente</button>` : ``}
        </div>
      </div>
    `;
  }).join("");
}

function seleccionarRecepCodigo(codigo){
  if (el("recNewCodigo")) el("recNewCodigo").value = String(codigo || "");
  cerrarModalRecepSugCodigo();
  setTimeout(() => el("recNewCodigo")?.focus(), 40);
}

/* ===== RECEPCION: GUARDAR + EXPORTAR ===== */

function sanitizeRecepcionDoc(doc){
  const d = JSON.parse(JSON.stringify(doc || {}));
  d.items = (Array.isArray(d.items) ? d.items : []).map(it => ({
    id: it.id || Date.now(),
    codigo: String(it.codigo || ""),
    alias: String(it.alias || ""),
    producto: String(it.producto || ""),
    cantidad: Number(it.cantidad || 0) || 0,
    agregadoAtISO: it.agregadoAtISO || "",
    agregadoAtEpoch: it.agregadoAtEpoch || 0
  }));
  return d;
}

function guardarIngresoRecepcion(silent = false){
  ensureRecepcionStateLoaded();
  if (!recepcionIngresoDoc) return;

  const d = sanitizeRecepcionDoc(recepcionIngresoDoc);

  if (!d.fechaISO) d.fechaISO = new Date().toISOString().slice(0,10);

  const itemsValid = d.items.filter(it => it.producto && (it.cantidad > 0));
  if (!itemsValid.length) {
    if (!silent) alert("Agrega al menos 1 producto con cantidad > 0.");
    return false;
  }

  d.items = itemsValid;
  d.updatedAtISO = new Date().toISOString();
  if (!d.createdAtISO) d.createdAtISO = d.updatedAtISO;

  // guardar / actualizar
  const arr = Array.isArray(recepcionIngresos) ? recepcionIngresos : [];
  const idx = arr.findIndex(x => String(x?.id) === String(recepcionEditId || d.id));

  if (recepcionEditId && idx >= 0) {
    arr[idx] = d;
  } else {
    arr.unshift(d);
    recepcionEditId = d.id;
  }

  recepcionIngresos = arr;
  persistRecepcionIngresos();

  // ✅ Ya está guardado en historial, limpiamos borrador
  recepcionIngresoDoc = d;
  setRecepcionDraft(null);

  if (!silent) alert("✅ Ingreso guardado.");
  return true;
}

async function recepCompartirPdfActual(){
  if (!recepcionIngresoDoc) return;
  const ok = guardarIngresoRecepcion(true);
  if (!ok) return;
  await crearPdfRecepcionIngreso(sanitizeRecepcionDoc(recepcionIngresoDoc));
  await autoShareLastFile();
}

async function recepCompartirExcelActual(){
  if (!recepcionIngresoDoc) return;
  const ok = guardarIngresoRecepcion(true);
  if (!ok) return;
  await crearExcelRecepcionIngreso(sanitizeRecepcionDoc(recepcionIngresoDoc));
  await autoShareLastFile();
}

async function recepCompartirPdfById(id){
  ensureRecepcionStateLoaded();
  const d = (Array.isArray(recepcionIngresos) ? recepcionIngresos : []).find(x => String(x?.id) === String(id));
  if (!d) return alert("No se encontró el ingreso.");
  await crearPdfRecepcionIngreso(sanitizeRecepcionDoc(d));
  await autoShareLastFile();
}

async function recepCompartirExcelById(id){
  ensureRecepcionStateLoaded();
  const d = (Array.isArray(recepcionIngresos) ? recepcionIngresos : []).find(x => String(x?.id) === String(id));
  if (!d) return alert("No se encontró el ingreso.");
  await crearExcelRecepcionIngreso(sanitizeRecepcionDoc(d));
  await autoShareLastFile();
}

async function crearPdfRecepcionIngreso(d){
  const pkg = window.jspdf || {};
  const jsPDF = pkg.jsPDF;

  if (!jsPDF) {
    alert("No se encontró jsPDF. Revisa el script en index.html.");
    return;
  }

  const PAGE_W = 80;
  const PAGE_H = 297;
  const marginL = 4;
  const marginR = PAGE_W - 4;
  const lineH = 4.2;
  const bottomReserve = 18;

  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, PAGE_H] });

  let y = 6;

  function ensureSpace(lines = 1){
    if (y + (lines * lineH) > (PAGE_H - bottomReserve)) {
      doc.addPage();
      y = 6;
    }
  }

  function textLine(txt, size = 10, bold = false){
    ensureSpace(1);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(String(txt || ""), marginL, y);
    y += lineH;
  }

  function textWrap(txt, size = 10, bold = false){
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(txt || ""), marginR - marginL);
    ensureSpace(lines.length);
    doc.text(lines, marginL, y);
    y += lines.length * lineH;
  }

  // Encabezado
  textLine("FERRETERÍA UNIVERSAL", 11, true);
  textLine("INGRESO - RECEPCIÓN", 10, true);
  y += 1;

  textLine(`Fecha: ${d.fechaISO || ""}`, 9, false);
  if (d.proveedor) textWrap(`Proveedor: ${d.proveedor}`, 9, false);
  if (d.referencia) textWrap(`Ref: ${d.referencia}`, 9, false);

  y += 2;
  doc.setDrawColor(150);
  doc.line(marginL, y, marginR, y);
  y += 3;

  // Items
  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach((it, idx) => {
    const qty = Number(it.cantidad || 0) || 0;
    if (qty <= 0) return;

    textWrap(`${qty} x ${it.producto || "Producto"}`, 9, true);

    const meta = [
      it.codigo ? `Cod: ${it.codigo}` : null,
      it.alias ? `ALIAS: ${it.alias}` : null
    ].filter(Boolean).join(" • ");

    if (meta) textWrap(meta, 8, false);

    y += 1;
    doc.setDrawColor(220);
    doc.line(marginL, y, marginR, y);
    y += 2;
  });

  const totalUnidades = items.reduce((s,it) => s + (Number(it.cantidad||0)||0), 0);

  y += 2;
  textLine(`Items: ${items.length}  |  Unidades: ${totalUnidades}`, 9, true);

  const blob = doc.output("blob");
  const safeDate = String(d.fechaISO || "").replace(/[^\d\-]/g, "");
  setLastFile(blob, `ingreso-${safeDate || "recepcion"}-${d.id}.pdf`, "Ingreso Recepción", `Ingreso ${d.fechaISO || ""}`, "application/pdf");
}

async function crearExcelRecepcionIngreso(d){
  if (!window.XLSX) {
    alert("No se encontró XLSX. Revisa el script en index.html.");
    return;
  }

  const rows = [];
  rows.push(["Ingreso - Recepción"]);
  rows.push(["Fecha", d.fechaISO || ""]);
  rows.push(["Proveedor", d.proveedor || ""]);
  rows.push(["Referencia", d.referencia || ""]);
  rows.push([""]);
  rows.push(["Código", "ALIAS", "Producto", "Cantidad"]);

  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach(it => {
    const qty = Number(it.cantidad || 0) || 0;
    if (qty <= 0) return;
    rows.push([it.codigo || "", it.alias || "", it.producto || "", qty]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ingreso");

  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const safeDate = String(d.fechaISO || "").replace(/[^\d\-]/g, "");
  setLastFile(blob, `ingreso-${safeDate || "recepcion"}-${d.id}.xlsx`, "Ingreso Recepción (Excel)", `Ingreso ${d.fechaISO || ""}`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
