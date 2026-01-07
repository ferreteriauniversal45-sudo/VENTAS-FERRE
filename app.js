/* ================= CONFIG ================= */
const BASE_RAW = "https://raw.githubusercontent.com/ferreteriauniversal45-sudo/ferreteria-inventario-app/main/";
const URLS = {
  logo: BASE_RAW + "logo.png",
  invP: BASE_RAW + "inventario.json",
  invA: BASE_RAW + "inventarioanexo.json",
  precios: BASE_RAW + "precios.json",
};

const PINS = {
  OPERADOR: "CONTROL2025",
  VENDEDOR: "VENTAS2026",
  ADMIN: "ADMIN2024"
};

const PRICE_TYPES = [
  "precio",
  "precioA",
  "precioB",
  "precioC",
  "mayoreo",
  "precioVendedor" // NUEVO
];

const PRICE_LABELS = {
  precio: "Precio Público",
  precioA: "Precio A",
  precioB: "Precio B",
  precioC: "Precio C",
  mayoreo: "Mayoreo",
  precioVendedor: "PRECIO VENDEDOR"
};

/* ================= HELPERS ================= */
function moneyL(value) {
  const n = Number(value || 0);
  return `L. ${n.toFixed(2)}`;
}

function trunc(s, max = 42) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function nowStr() {
  return new Date().toLocaleString("es-HN");
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return await res.json();
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= STATE ================= */
let selectedRole = null;

let nombreVendedor = localStorage.getItem("nombreVendedor") || "";

let clientes = JSON.parse(localStorage.getItem("clientes") || "[]");          // NO se borran
let cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");  // NO se borran

let catalogo = [];
let catalogoMap = new Map();
let catalogoCargado = false;

let cotizacionActual = null;

// Archivo generado para compartir/descargar
let lastFile = {
  blob: null,
  url: null,
  filename: "documento.pdf",
  mime: "application/pdf",
  title: "",
  text: ""
};

let logoDataUrlCache = null;

/* ================= ELEMENTS ================= */
const loginScreen = document.getElementById("login");
const appScreen = document.getElementById("app");
const pinBox = document.getElementById("pinBox");
const pinInput = document.getElementById("pin");
const pinError = document.getElementById("pinError");
const roleText = document.getElementById("roleText");

const vendedorHome = document.getElementById("vendedorHome");
const contenido = document.getElementById("contenido");
const headerTitle = document.getElementById("headerTitle");

const modalVendedor = document.getElementById("modalVendedor");

/* ================= INIT ================= */
if (localStorage.getItem("role")) {
  startApp();
}

/* ================= LOGIN ================= */
function selectRole(role) {
  selectedRole = role;
  roleText.textContent = `Rol: ${role}`;
  document.getElementById("roles").style.display = "none";
  pinError.classList.add("hidden");
  pinBox.classList.remove("hidden");
  pinInput.value = "";
  pinInput.focus();
}

function resetLogin() {
  selectedRole = null;
  pinInput.value = "";
  pinError.classList.add("hidden");
  document.getElementById("roles").style.display = "block";
  pinBox.classList.add("hidden");
  roleText.textContent = "Selecciona un rol";
}

function validatePin() {
  if (!selectedRole) return;

  if (pinInput.value === PINS[selectedRole]) {
    localStorage.setItem("role", selectedRole);
    startApp();
  } else {
    pinError.classList.remove("hidden");
  }
}

// Enter para validar PIN
pinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validatePin();
});

function startApp() {
  // Ocultar login fuerte (evita overlay)
  loginScreen.classList.add("hidden");
  loginScreen.style.display = "none";

  appScreen.classList.remove("hidden");
  appScreen.style.display = "block";

  // limpiar vistas
  vendedorHome.classList.add("hidden");
  contenido.classList.add("hidden");

  const role = localStorage.getItem("role");
  if (role === "VENDEDOR") {
    headerTitle.textContent = "Cotizaciones";
    vendedorHome.classList.remove("hidden");
  } else {
    contenido.classList.remove("hidden");
    contenido.innerHTML = `
      <div class="card">
        <strong>⚠️ Rol no implementado</strong>
        <div style="color:#6B7280; margin-top:6px;">
          Por ahora este módulo está hecho para <b>VENDEDOR</b>.
        </div>
      </div>
    `;
  }
}

function logout() {
  // NO borrar clientes/cotizaciones/nombreVendedor
  localStorage.removeItem("role");
  location.reload();
}

/* ================= MODAL VENDEDOR ================= */
function abrirModalVendedor() {
  modalVendedor.classList.add("show");
  const input = document.getElementById("nombreVendedorInput");
  input.value = nombreVendedor || "";
  setTimeout(() => input.focus(), 50);
}

function cerrarModalVendedor() {
  modalVendedor.classList.remove("show");
}

function guardarNombreVendedor() {
  const input = document.getElementById("nombreVendedorInput");
  const val = (input.value || "").trim();
  if (!val) return;

  nombreVendedor = val;
  localStorage.setItem("nombreVendedor", nombreVendedor);
  modalVendedor.classList.remove("show");

  // reanudar acción pendiente si existiera
  const pending = localStorage.getItem("accionPendiente");
  if (pending) {
    localStorage.removeItem("accionPendiente");
    const obj = JSON.parse(pending);

    if (obj.type === "cot_pdf") {
      generarPdfCotizacion(true);
    }
    if (obj.type === "cot_guardar") {
      guardarCotizacion(true);
    }
  }
}

function ensureNombreVendedor(pendingObj) {
  if (nombreVendedor && nombreVendedor.trim()) return true;
  localStorage.setItem("accionPendiente", JSON.stringify(pendingObj));
  abrirModalVendedor();
  return false;
}

/* ================= NAV ================= */
function volverHome() {
  contenido.classList.add("hidden");
  vendedorHome.classList.remove("hidden");
}

/* ================= CLIENTES ================= */
function abrirClientes() {
  vendedorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>👤 Clientes</strong>
      <div style="color:#6B7280; font-size:13px;">
        Se guardan localmente en este teléfono (no se borran al cerrar sesión).
      </div>
    </div>

    <input id="cNombre" placeholder="Nombre del cliente (opcional)">
    <input id="cRTN" placeholder="RTN (opcional)">
    <input id="cUbicacion" placeholder="Ubicación (opcional)">
    <input id="cTelefono" placeholder="Teléfono (opcional)">
    <input id="cEmpresa" placeholder="Empresa (opcional)">

    <button type="button" onclick="guardarCliente()">Guardar Cliente</button>

    <hr>

    ${
      clientes.length
        ? clientes.map(c => `
          <div class="card">
            <strong>${escapeHtml(c.nombre || "Cliente sin nombre")}</strong>
            <div style="color:#6B7280; font-size:12px;">
              ${c.empresa ? `🏢 ${escapeHtml(c.empresa)}<br>` : ""}
              ${c.telefono ? `📞 ${escapeHtml(c.telefono)}<br>` : ""}
              ${c.rtn ? `🧾 RTN: ${escapeHtml(c.rtn)}<br>` : ""}
              ${c.ubicacion ? `📍 ${escapeHtml(c.ubicacion)}` : ""}
            </div>
          </div>
        `).join("")
        : `<div class="card"><strong>No hay clientes aún.</strong></div>`
    }
  `;
}

function guardarCliente() {
  clientes.push({
    id: Date.now(),
    nombre: document.getElementById("cNombre").value || "",
    rtn: document.getElementById("cRTN").value || "",
    ubicacion: document.getElementById("cUbicacion").value || "",
    telefono: document.getElementById("cTelefono").value || "",
    empresa: document.getElementById("cEmpresa").value || "",
  });

  localStorage.setItem("clientes", JSON.stringify(clientes));
  abrirClientes();
}

/* ================= LOGO DATAURL (para PDF) ================= */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function getLogoDataUrl() {
  if (logoDataUrlCache) return logoDataUrlCache;
  const res = await fetch(URLS.logo, { cache: "force-cache" });
  const blob = await res.blob();
  logoDataUrlCache = await blobToDataURL(blob);
  return logoDataUrlCache;
}

/* ================= CATALOGO (INVENTARIO + PRECIOS) ================= */
async function ensureCatalogoCargado() {
  if (catalogoCargado) return;

  const [invP, invA, precios] = await Promise.all([
    fetchJson(URLS.invP),
    fetchJson(URLS.invA),
    fetchJson(URLS.precios)
  ]);

  catalogo = [];
  catalogoMap = new Map();

  for (const codigo in invP) {
    const p = invP[codigo];
    const a = invA[codigo] || { cantidad: 0 };
    const pr = precios[codigo] || {};

    const obj = {
      codigo,
      producto: p.producto || "",
      departamento: p.departamento || "",
      stockTotal: Number(p.cantidad || 0) + Number(a.cantidad || 0),
      precios: pr
    };

    catalogo.push(obj);
    catalogoMap.set(codigo, obj);
  }

  catalogo.sort((x, y) => (x.producto || "").localeCompare(y.producto || "", "es"));
  catalogoCargado = true;
}

/* ================= COTIZACIONES UI ================= */
function abrirCotizacion() {
  vendedorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
    <div class="card"><strong>⏳ Cargando catálogo...</strong></div>
  `;

  ensureCatalogoCargado()
    .then(() => {
      cotizacionActual = {
        id: Date.now(),
        fecha: nowStr(),
        clienteId: "",
        defaultPriceType: "precio",
        items: [] // {codigo, qty, priceType, customPrice}
      };
      renderCotizacionUI();
    })
    .catch(err => {
      console.error(err);
      contenido.innerHTML = `
        <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
        <div class="card">
          <strong>❌ No se pudo cargar el catálogo.</strong>
          <div style="color:#6B7280; margin-top:6px;">
            Revisa tu internet (los datos vienen desde GitHub).
          </div>
        </div>
      `;
    });
}

function renderCotizacionUI() {
  const clienteOptions = clientes.map(c => {
    const label = (c.nombre && c.nombre.trim()) ? c.nombre : "Cliente sin nombre";
    return `<option value="${c.id}">${escapeHtml(label)}</option>`;
  }).join("");

  const defaultPriceOptions = PRICE_TYPES.map(t => {
    return `<option value="${t}">${PRICE_LABELS[t]}</option>`;
  }).join("");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🧾 Nueva Cotización</strong>
      <div style="color:#6B7280; font-size:13px;">
        Vendedor: <b>${escapeHtml(nombreVendedor || "No configurado")}</b> • ${escapeHtml(cotizacionActual.fecha)}
      </div>
      <div style="margin-top:10px;">
        <span class="badge">SOLO COTIZACIÓN • SIN VALIDEZ</span>
      </div>
    </div>

    <div class="quote-top">
      <div>
        <label><b>Cliente</b></label>
        <select id="cotCliente">
          <option value="">(Sin cliente)</option>
          ${clienteOptions}
        </select>
      </div>

      <div>
        <label><b>Precio por defecto al agregar</b></label>
        <select id="cotDefaultPrice">
          ${defaultPriceOptions}
        </select>
      </div>
    </div>

    <input id="cotBuscar" placeholder="🔍 Buscar producto por código o nombre" />
    <div id="cotResultados"></div>

    <hr>

    <div class="card">
      <strong>📦 Productos agregados</strong>
      <div style="color:#6B7280; font-size:13px;">
        Cada producto puede usar un tipo de precio diferente. Usa “PRECIO VENDEDOR” para precio manual.
      </div>
    </div>

    <div id="cotItems"></div>

    <div class="total-box">
      <span>Total</span>
      <span id="cotTotal">${moneyL(0)}</span>
    </div>

    <div style="height:10px"></div>

    <button type="button" onclick="guardarCotizacion()">💾 Guardar Cotización</button>
    <button type="button" class="secondary" onclick="generarPdfCotizacion()">📄 Generar PDF</button>
  `;

  document.getElementById("cotDefaultPrice").value = cotizacionActual.defaultPriceType;

  document.getElementById("cotCliente").addEventListener("change", (e) => {
    cotizacionActual.clienteId = e.target.value || "";
  });

  document.getElementById("cotDefaultPrice").addEventListener("change", (e) => {
    cotizacionActual.defaultPriceType = e.target.value;
    renderCotResultados();
    renderCotItems();
  });

  document.getElementById("cotBuscar").addEventListener("input", () => renderCotResultados());

  renderCotResultados();
  renderCotItems();
}

function getUnitPrice(prod, item) {
  if (!prod) return 0;

  if (item.priceType === "precioVendedor") {
    return Number(item.customPrice || 0);
  }

  const val = prod.precios?.[item.priceType];
  if (val !== undefined && val !== null) return Number(val || 0);

  // fallback
  const base = prod.precios?.precio;
  return Number(base || 0);
}

function renderCotResultados() {
  const q = (document.getElementById("cotBuscar").value || "").toLowerCase().trim();
  const cont = document.getElementById("cotResultados");

  if (!q) {
    cont.innerHTML = `<div class="card"><strong>Escribe para buscar productos…</strong></div>`;
    return;
  }

  const encontrados = catalogo
    .filter(p =>
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.producto || "").toLowerCase().includes(q)
    )
    .slice(0, 20);

  if (!encontrados.length) {
    cont.innerHTML = `<div class="card"><strong>No se encontraron productos.</strong></div>`;
    return;
  }

  cont.innerHTML = encontrados.map(p => {
    // precio mostrado según default
    const dummyItem = { priceType: cotizacionActual.defaultPriceType, customPrice: 0 };
    const precio = getUnitPrice(p, dummyItem);

    return `
      <div class="card">
        <strong>${escapeHtml(trunc(p.producto, 60))}</strong>
        <div style="color:#6B7280; font-size:12px;">
          Código: ${escapeHtml(p.codigo)} • Stock: ${p.stockTotal}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:10px;">
          <span class="badge">${PRICE_LABELS[cotizacionActual.defaultPriceType]} • ${moneyL(precio)}</span>
          <button type="button" class="inline" onclick="cotAgregar('${p.codigo}')">➕ Agregar</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderCotItems() {
  const cont = document.getElementById("cotItems");

  if (!cotizacionActual.items.length) {
    cont.innerHTML = `<div class="card"><strong>No hay productos agregados.</strong></div>`;
    document.getElementById("cotTotal").textContent = moneyL(0);
    return;
  }

  let total = 0;

  cont.innerHTML = cotizacionActual.items.map(it => {
    const prod = catalogoMap.get(it.codigo);
    const precioUnit = getUnitPrice(prod, it);
    const qty = Number(it.qty || 0);
    const sub = qty * precioUnit;
    total += sub;

    const priceOptions = PRICE_TYPES.map(t => {
      const sel = (it.priceType === t) ? "selected" : "";
      return `<option value="${t}" ${sel}>${PRICE_LABELS[t]}</option>`;
    }).join("");

    const extraPriceInput = it.priceType === "precioVendedor"
      ? `<input class="qty" type="number" step="0.01" min="0" value="${Number(it.customPrice || 0)}"
           onchange="cotSetCustomPrice('${it.codigo}', this.value)" placeholder="Precio manual">`
      : "";

    return `
      <div class="item-row">
        <div class="top">
          <div>
            <div class="name">${escapeHtml(trunc(prod?.producto || it.codigo, 60))}</div>
            <div class="meta">Código: ${escapeHtml(it.codigo)} • Stock: ${prod?.stockTotal ?? "?"}</div>
          </div>
          <div style="font-weight:900;">${moneyL(sub)}</div>
        </div>

        <div class="controls">
          <button type="button" class="inline secondary" onclick="cotDec('${it.codigo}')">-</button>
          <input class="qty" type="number" min="1" value="${qty}"
                 onchange="cotSetQty('${it.codigo}', this.value)" />
          <button type="button" class="inline secondary" onclick="cotInc('${it.codigo}')">+</button>

          <select class="inline" onchange="cotSetPriceType('${it.codigo}', this.value)">
            ${priceOptions}
          </select>

          ${extraPriceInput}

          <button type="button" class="inline danger" onclick="cotQuitar('${it.codigo}')">✖ Quitar</button>
        </div>

        <div class="meta">
          Tipo: <b>${PRICE_LABELS[it.priceType]}</b> • P.Unit: <b>${moneyL(precioUnit)}</b>
          ${it.priceType === "precioVendedor" && precioUnit <= 0 ? " • ⚠️ Precio manual en 0" : ""}
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("cotTotal").textContent = moneyL(total);
}

/* ===== acciones items ===== */
function cotAgregar(codigo) {
  const idx = cotizacionActual.items.findIndex(x => x.codigo === codigo);
  if (idx >= 0) {
    cotizacionActual.items[idx].qty += 1;
  } else {
    const pt = cotizacionActual.defaultPriceType || "precio";
    cotizacionActual.items.push({
      codigo,
      qty: 1,
      priceType: pt,
      customPrice: (pt === "precioVendedor") ? 0 : 0
    });
  }
  renderCotItems();
}

function cotInc(codigo) {
  const it = cotizacionActual.items.find(x => x.codigo === codigo);
  if (!it) return;
  it.qty += 1;
  renderCotItems();
}

function cotDec(codigo) {
  const it = cotizacionActual.items.find(x => x.codigo === codigo);
  if (!it) return;
  it.qty = Math.max(1, it.qty - 1);
  renderCotItems();
}

function cotSetQty(codigo, val) {
  const it = cotizacionActual.items.find(x => x.codigo === codigo);
  if (!it) return;
  it.qty = Math.max(1, Number(val || 1));
  renderCotItems();
}

function cotSetPriceType(codigo, priceType) {
  const it = cotizacionActual.items.find(x => x.codigo === codigo);
  if (!it) return;
  it.priceType = priceType;
  // si cambia a precio vendedor, mantener customPrice (si no existe, poner 0)
  if (priceType === "precioVendedor" && (it.customPrice === undefined || it.customPrice === null)) {
    it.customPrice = 0;
  }
  renderCotItems();
}

function cotSetCustomPrice(codigo, val) {
  const it = cotizacionActual.items.find(x => x.codigo === codigo);
  if (!it) return;
  it.customPrice = Number(val || 0);
  renderCotItems();
}

function cotQuitar(codigo) {
  cotizacionActual.items = cotizacionActual.items.filter(x => x.codigo !== codigo);
  renderCotItems();
}

/* ================= SNAPSHOT (guardar / PDF) ================= */
function buildCotizacionSnapshot() {
  const cliente = clientes.find(c => String(c.id) === String(cotizacionActual.clienteId)) || null;

  const items = cotizacionActual.items.map(it => {
    const prod = catalogoMap.get(it.codigo);
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
      rtn: cliente.rtn || "",
      ubicacion: cliente.ubicacion || "",
      telefono: cliente.telefono || "",
      empresa: cliente.empresa || ""
    } : null,
    items,
    total,
    disclaimer: "ESTE DOCUMENTO ES SOLO UNA COTIZACIÓN Y NO TIENE VALIDEZ FISCAL"
  };
}

/* ================= GUARDAR COTIZACIÓN ================= */
function guardarCotizacion(skipNameCheck = false) {
  if (!skipNameCheck) {
    if (!ensureNombreVendedor({ type: "cot_guardar" })) return;
  }

  if (!cotizacionActual.items.length) {
    alert("Agrega al menos un producto a la cotización.");
    return;
  }

  // validar precio vendedor > 0
  const badManual = cotizacionActual.items.some(it => it.priceType === "precioVendedor" && Number(it.customPrice || 0) <= 0);
  if (badManual) {
    const ok = confirm("Hay productos con PRECIO VENDEDOR en 0. ¿Deseas guardar así?");
    if (!ok) return;
  }

  const snap = buildCotizacionSnapshot();
  cotizaciones.unshift(snap);
  localStorage.setItem("cotizaciones", JSON.stringify(cotizaciones));

  alert("✅ Cotización guardada localmente.");
}

/* ================= PDF: Generar + Compartir/Descargar ================= */
function generarPdfCotizacion(skipNameCheck = false) {
  if (!skipNameCheck) {
    if (!ensureNombreVendedor({ type: "cot_pdf" })) return;
  }

  if (!cotizacionActual.items.length) {
    alert("Agrega productos primero.");
    return;
  }

  const snap = buildCotizacionSnapshot();
  crearPdfCotizacion(snap);
}

function estimateHeightMM(cot) {
  // Estimación para ticket 80mm: encabezado+cliente+footer ~ 90
  // Cada item: 12-20mm dependiendo del nombre; hacemos aproximación segura.
  let h = 105;
  h += cot.cliente ? 18 : 8;
  cot.items.forEach(it => {
    const nameLen = (it.producto || "").length;
    const lines = Math.max(1, Math.ceil(nameLen / 28)); // aprox
    h += 10 + (lines * 4.2); // item block
  });
  h += 28; // total + disclaimer
  return Math.max(160, Math.ceil(h));
}

async function crearPdfCotizacion(cot) {
  const { jsPDF, GState } = window.jspdf || {};
  if (!jsPDF) {
    alert("No se encontró jsPDF. Revisa la conexión o el script en index.html.");
    return;
  }

  const height = estimateHeightMM(cot);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, height] // ticket angosto
  });

  const left = 4;
  const right = 76;
  let y = 6;

  // Logo
  try {
    const logoDataUrl = await getLogoDataUrl();
    // ancho 46mm, alto 18mm aprox
    doc.addImage(logoDataUrl, "PNG", 17, y, 46, 18);
  } catch (e) {
    // si falla, seguimos sin logo
  }

  y += 24;

  doc.setTextColor(36, 58, 143);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FERRETERÍA UNIVERSAL", 40, y, { align: "center" });

  y += 6;
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`COTIZACIÓN #${cot.id}`, 40, y, { align: "center" });

  y += 5;
  doc.text(`Fecha: ${cot.fecha}`, left, y);
  y += 4.5;
  doc.text(`Vendedor: ${cot.vendedor}`, left, y);

  y += 4.5;
  doc.setDrawColor(229, 231, 235);
  doc.line(left, y, right, y);

  // Marca de agua
  y += 8;
  try {
    if (GState) doc.setGState(new GState({ opacity: 0.12 }));
  } catch {}
  doc.setTextColor(156, 163, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SOLO COTIZACIÓN", 40, y + 18, { align: "center", angle: 45 });
  try {
    if (GState) doc.setGState(new GState({ opacity: 1 }));
  } catch {}

  // Cliente
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  let clienteLines = [];
  if (cot.cliente) {
    const nombre = cot.cliente.nombre || "SIN NOMBRE";
    clienteLines.push(`Cliente: ${nombre}`);
    if (cot.cliente.empresa) clienteLines.push(`Empresa: ${cot.cliente.empresa}`);
    if (cot.cliente.telefono) clienteLines.push(`Tel: ${cot.cliente.telefono}`);
    if (cot.cliente.rtn) clienteLines.push(`RTN: ${cot.cliente.rtn}`);
  } else {
    clienteLines.push("Cliente: SIN CLIENTE");
  }

  y += 6;
  clienteLines.forEach(line => {
    doc.text(line, left, y);
    y += 4.2;
  });

  y += 1;
  doc.line(left, y, right, y);

  // Items
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DETALLE", left, y);

  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  cot.items.forEach((it, idx) => {
    // 1) Cantidad x Código
    doc.setFont("helvetica", "bold");
    doc.text(`${it.cantidad} x ${it.codigo}`, left, y);
    y += 4.2;

    // 2) Producto (wrap)
    doc.setFont("helvetica", "normal");
    const name = it.producto || "";
    const nameLines = doc.splitTextToSize(name, 72);
    doc.text(nameLines, left, y);
    y += nameLines.length * 4.2;

    // 3) Tipo + unit + subtotal
    doc.setTextColor(107, 114, 128);
    doc.text(`Tipo: ${it.tipoPrecioLabel}`, left, y);
    y += 4.2;

    doc.setTextColor(31, 41, 55);
    doc.text(`P.Unit: ${moneyL(it.precioUnitario)}`, left, y);
    doc.text(`Subt: ${moneyL(it.subtotal)}`, right, y, { align: "right" });
    y += 5;

    doc.setDrawColor(229, 231, 235);
    doc.line(left, y, right, y);
    y += 4;
  });

  // Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(36, 58, 143);
  doc.text(`TOTAL: ${moneyL(cot.total)}`, right, y, { align: "right" });

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const discLines = doc.splitTextToSize(cot.disclaimer, 72);
  doc.text(discLines, 40, y, { align: "center" });

  // Blob PDF
  const blob = doc.output("blob");
  setLastFile(blob, `cotizacion-${cot.id}.pdf`, "application/pdf", "Cotización - Ferretería Universal", "Cotización sin validez fiscal");

  mostrarPdfEnPantalla();
}

function setLastFile(blob, filename, mime, title, text) {
  // limpiar URL anterior
  if (lastFile.url) {
    URL.revokeObjectURL(lastFile.url);
  }
  lastFile.blob = blob;
  lastFile.url = URL.createObjectURL(blob);
  lastFile.filename = filename;
  lastFile.mime = mime;
  lastFile.title = title || "";
  lastFile.text = text || "";
}

function mostrarPdfEnPantalla() {
  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="abrirCotizacion()">⬅ Volver</button>

    <div class="card">
      <strong>📄 PDF generado</strong>
      <div class="note">
        Si tu teléfono no muestra el PDF aquí, usa <b>Compartir</b> o <b>Descargar</b>.
      </div>
    </div>

    <div class="pdf-box">
      <iframe class="pdf-viewer" src="${lastFile.url}"></iframe>
    </div>

    <button type="button" onclick="compartirArchivo()">📤 Compartir (WhatsApp, Gmail, etc.)</button>
    <button type="button" class="secondary" onclick="descargarArchivo()">⬇ Descargar en el teléfono</button>
  `;
}

async function compartirArchivo() {
  if (!lastFile.blob) return;

  try {
    const file = new File([lastFile.blob], lastFile.filename, { type: lastFile.mime });

    if (navigator.share) {
      await navigator.share({
        title: lastFile.title,
        text: lastFile.text,
        files: [file]
      });
    } else {
      alert("Compartir no disponible aquí. Usa Descargar.");
    }
  } catch (e) {
    console.error(e);
    alert("No se pudo compartir. Usa Descargar.");
  }
}

function descargarArchivo() {
  if (!lastFile.url) return;

  const a = document.createElement("a");
  a.href = lastFile.url;
  a.download = lastFile.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ================= HISTORIAL COTIZACIONES ================= */
function abrirHistorialCotizaciones() {
  vendedorHome.classList.add("hidden");
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
      <div class="note">Guardadas localmente en este teléfono.</div>
    </div>

    ${cotizaciones.slice(0, 60).map(c => `
      <div class="card" onclick="verCotizacionGuardada(${c.id})">
        <strong>🧾 #${c.id} • ${moneyL(c.total)}</strong>
        <div style="color:#6B7280; font-size:12px;">
          ${escapeHtml(c.fecha)} • ${c.cliente?.nombre ? `Cliente: ${escapeHtml(c.cliente.nombre)}` : "Sin cliente"}
        </div>
        <div style="margin-top:8px;"><span class="badge">Tocar para generar PDF</span></div>
      </div>
    `).join("")}
  `;
}

function verCotizacionGuardada(id) {
  const c = cotizaciones.find(x => x.id === id);
  if (!c) return;
  crearPdfCotizacion(c);
}
