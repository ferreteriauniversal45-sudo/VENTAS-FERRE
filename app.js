/* =========================================================
   Ferretería Universal - App VENDEDOR (Clientes + Cotizaciones)
   - Clientes locales (permanentes)
   - Cotizaciones locales
   - Selección de cliente por modal (buscar / crear)
   - Agregar producto por modal (cantidad + tipo de precio + ver precios)
   - Tipos de precio mezclados por producto + PRECIO VENDEDOR
   - PDF tipo ticket (80mm) + marca de agua + compartir/descargar
   ========================================================= */

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
  "precioVendedor" // NUEVO: precio manual por el vendedor
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
  // Forzamos coma para miles (1,234.56)
  return "L. " + n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function trunc(s, max = 42) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function nowStr() {
  return new Date().toLocaleString("es-HN");
}

function makeId() {
  return Date.now() + Math.floor(Math.random() * 1000000);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return await res.json();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nonEmpty(s) {
  return (s || "").toString().trim().length > 0;
}

/* ================= STATE ================= */
let selectedRole = null;

// Persistentes (NO borrar al logout)
let nombreVendedor = localStorage.getItem("nombreVendedor") || "";
let clientes = JSON.parse(localStorage.getItem("clientes") || "[]");
let cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");

// Catálogo remoto
let catalogo = [];               // [{codigo, producto, departamento, stockTotal, precios:{...}}]
let catalogoMap = new Map();     // codigo -> obj
let catalogoCargado = false;

// Cotización actual
let cotizacionActual = null;     // {id, fecha, clienteId, defaultPriceType, items:[{id,codigo,qty,priceType,customPrice}]}

// Modal producto (estado)
let productoModal = null;        // {codigo, ...}

// PDF generado (para compartir/descargar)
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
const modalClientes = document.getElementById("modalClientes");
const modalNuevoCliente = document.getElementById("modalNuevoCliente");
const modalProducto = document.getElementById("modalProducto");

// Inputs / containers de modales
const buscarClienteInput = document.getElementById("buscarClienteInput");
const listaClientesModal = document.getElementById("listaClientesModal");

// Nuevo cliente
const ncNombre = document.getElementById("ncNombre");
const ncEmpresa = document.getElementById("ncEmpresa");
const ncTelefono = document.getElementById("ncTelefono");
const ncRTN = document.getElementById("ncRTN");
const ncUbicacion = document.getElementById("ncUbicacion");

// Modal producto
const mpNombre = document.getElementById("mpNombre");
const mpMeta = document.getElementById("mpMeta");
const mpListaPrecios = document.getElementById("mpListaPrecios");
const mpCantidad = document.getElementById("mpCantidad");
const mpTipoPrecio = document.getElementById("mpTipoPrecio");
const mpPrecioManualWrap = document.getElementById("mpPrecioManualWrap");
const mpPrecioValor = document.getElementById("mpPrecioValor");
const mpTotalLinea = document.getElementById("mpTotalLinea");

/* ================= INIT ================= */
if (localStorage.getItem("role")) {
  startApp();
}

pinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validatePin();
});

buscarClienteInput?.addEventListener("input", () => {
  renderListaClientesModal();
});

// Producto modal: recalcular total en vivo
mpCantidad?.addEventListener("input", () => actualizarProductoModalTotal());
mpTipoPrecio?.addEventListener("change", () => {
  togglePrecioManual();
  actualizarProductoModalTotal();
});
mpPrecioValor?.addEventListener("input", () => actualizarProductoModalTotal());

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

function startApp() {
  // Ocultar login fuerte (evita overlays)
  loginScreen.classList.add("hidden");
  loginScreen.style.display = "none";

  // Mostrar app
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
        <div class="note">Por ahora este módulo está hecho para <b>VENDEDOR</b>.</div>
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

  // Reanudar acción pendiente (si existe)
  const pending = localStorage.getItem("accionPendiente");
  if (pending) {
    localStorage.removeItem("accionPendiente");
    const obj = JSON.parse(pending);

    if (obj.type === "cot_guardar") guardarCotizacion(true);
    if (obj.type === "cot_pdf") generarPdfCotizacion(true);
  }
}

function ensureNombreVendedor(pendingObj) {
  if (nonEmpty(nombreVendedor)) return true;
  localStorage.setItem("accionPendiente", JSON.stringify(pendingObj));
  abrirModalVendedor();
  return false;
}

/* ================= NAV ================= */
function volverHome() {
  contenido.classList.add("hidden");
  vendedorHome.classList.remove("hidden");
}

/* ================= CLIENTES (pantalla de administración) ================= */
function abrirClientes() {
  vendedorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  const rows = clientes.length
    ? clientes.map(c => `
        <div class="card">
          <strong>${escapeHtml(c.nombre || "Cliente sin nombre")}</strong>
          <div class="note">
            ${c.empresa ? `🏢 ${escapeHtml(c.empresa)}<br>` : ""}
            ${c.telefono ? `📞 ${escapeHtml(c.telefono)}<br>` : ""}
            ${c.rtn ? `🧾 RTN: ${escapeHtml(c.rtn)}<br>` : ""}
            ${c.ubicacion ? `📍 ${escapeHtml(c.ubicacion)}` : ""}
          </div>
        </div>
      `).join("")
    : `<div class="card"><strong>No hay clientes aún.</strong></div>`;

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>👤 Clientes</strong>
      <div class="note">Se guardan localmente en este teléfono (no se borran al cerrar sesión).</div>
    </div>

    <input id="cNombre" placeholder="Nombre del cliente (opcional)">
    <input id="cEmpresa" placeholder="Empresa (opcional)">
    <input id="cTelefono" placeholder="Teléfono (opcional)">
    <input id="cRTN" placeholder="RTN (opcional)">
    <input id="cUbicacion" placeholder="Ubicación (opcional)">

    <button type="button" onclick="guardarClientePantalla()">Guardar Cliente</button>
    <hr>

    ${rows}
  `;
}

function guardarClientePantalla() {
  const nombre = document.getElementById("cNombre").value || "";
  const empresa = document.getElementById("cEmpresa").value || "";
  const telefono = document.getElementById("cTelefono").value || "";
  const rtn = document.getElementById("cRTN").value || "";
  const ubicacion = document.getElementById("cUbicacion").value || "";

  clientes.push({
    id: makeId(),
    nombre,
    empresa,
    telefono,
    rtn,
    ubicacion
  });

  localStorage.setItem("clientes", JSON.stringify(clientes));
  abrirClientes();
}

/* ================= MODAL CLIENTES (selección en cotización) ================= */
function abrirModalClientes() {
  buscarClienteInput.value = "";
  renderListaClientesModal();
  modalClientes.classList.add("show");
  setTimeout(() => buscarClienteInput.focus(), 50);
}

function cerrarModalClientes() {
  modalClientes.classList.remove("show");
}

function renderListaClientesModal() {
  if (!listaClientesModal) return;

  const q = (buscarClienteInput.value || "").toLowerCase().trim();

  const filtrados = clientes.filter(c => {
    const nombre = (c.nombre || "").toLowerCase();
    const empresa = (c.empresa || "").toLowerCase();
    return nombre.includes(q) || empresa.includes(q);
  });

  if (!filtrados.length) {
    listaClientesModal.innerHTML = `
      <div class="card">
        <strong>No hay coincidencias</strong>
        <div class="note">Puedes crear un cliente nuevo.</div>
      </div>
    `;
    return;
  }

  listaClientesModal.innerHTML = filtrados
    .slice(0, 60)
    .map(c => `
      <div class="card" onclick="seleccionarClienteCotizacion(${c.id})">
        <strong>${escapeHtml(c.nombre || "Cliente sin nombre")}</strong>
        <div class="note">
          ${c.empresa ? `🏢 ${escapeHtml(c.empresa)}<br>` : ""}
          ${c.telefono ? `📞 ${escapeHtml(c.telefono)}` : ""}
        </div>
        <span class="badge">Seleccionar</span>
      </div>
    `)
    .join("");
}

function seleccionarClienteCotizacion(id) {
  if (!cotizacionActual) return;

  cotizacionActual.clienteId = id;
  cerrarModalClientes();
  actualizarClienteSeleccionadoUI();
}

/* ================= MODAL NUEVO CLIENTE (desde cotización) ================= */
function abrirModalNuevoCliente() {
  // Limpia campos
  ncNombre.value = "";
  ncEmpresa.value = "";
  ncTelefono.value = "";
  ncRTN.value = "";
  ncUbicacion.value = "";

  // Cambiar modal
  modalClientes.classList.remove("show");
  modalNuevoCliente.classList.add("show");

  setTimeout(() => ncNombre.focus(), 50);
}

function cerrarModalNuevoCliente(volverAClientes) {
  modalNuevoCliente.classList.remove("show");
  if (volverAClientes) {
    // Volver al modal de clientes para seguir buscando/seleccionando
    modalClientes.classList.add("show");
    renderListaClientesModal();
    setTimeout(() => buscarClienteInput.focus(), 50);
  }
}

function guardarClienteDesdeModal() {
  const nuevo = {
    id: makeId(),
    nombre: ncNombre.value || "",
    empresa: ncEmpresa.value || "",
    telefono: ncTelefono.value || "",
    rtn: ncRTN.value || "",
    ubicacion: ncUbicacion.value || "",
  };

  clientes.push(nuevo);
  localStorage.setItem("clientes", JSON.stringify(clientes));

  // Seleccionar automáticamente en la cotización
  if (cotizacionActual) {
    cotizacionActual.clienteId = nuevo.id;
  }

  // Cerrar modales y actualizar UI
  modalNuevoCliente.classList.remove("show");
  modalClientes.classList.remove("show");
  actualizarClienteSeleccionadoUI();
}

/* ================= LOGO -> DataURL (para PDF) ================= */
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

/* ================= COTIZACIONES ================= */
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
        id: makeId(),
        fecha: nowStr(),
        clienteId: "",
        defaultPriceType: "precio",
        items: [] // {id,codigo,qty,priceType,customPrice}
      };
      renderCotizacionUI();
    })
    .catch(err => {
      console.error(err);
      contenido.innerHTML = `
        <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
        <div class="card">
          <strong>❌ No se pudo cargar el catálogo.</strong>
          <div class="note">Revisa tu internet. (Los datos vienen desde GitHub)</div>
        </div>
      `;
    });
}

function renderCotizacionUI() {
  if (!cotizacionActual) return;

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🧾 Nueva Cotización</strong>
      <div class="note">
        Fecha: <b>${escapeHtml(cotizacionActual.fecha)}</b><br>
        Vendedor: <b>${escapeHtml(nombreVendedor || "No configurado")}</b>
        <button type="button" class="inline secondary" onclick="abrirModalVendedor()" style="margin-left:8px;">Editar</button>
      </div>
      <span class="badge">SOLO COTIZACIÓN • SIN VALIDEZ</span>
    </div>

    <div class="card">
      <strong>👤 Cliente</strong>
      <div id="cotClienteInfo" class="note"></div>
      <button type="button" class="secondary" onclick="abrirModalClientes()">Seleccionar / Buscar cliente</button>
    </div>

    <div class="card">
      <strong>💲 Precio por defecto al agregar</strong>
      <div class="note">Cada producto puede usar un tipo diferente (mezclados).</div>
      <select id="cotDefaultPrice"></select>
    </div>

    <input id="cotBuscar" placeholder="🔍 Buscar producto por código o nombre" />
    <div id="cotResultados"></div>

    <hr>

    <div class="card">
      <strong>📦 Productos agregados</strong>
      <div class="note">Puedes cambiar cantidad, tipo de precio o quitar.</div>
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

  // Cargar opciones precio por defecto
  const sel = document.getElementById("cotDefaultPrice");
  sel.innerHTML = PRICE_TYPES.map(t => `<option value="${t}">${PRICE_LABELS[t]}</option>`).join("");
  sel.value = cotizacionActual.defaultPriceType;

  sel.addEventListener("change", (e) => {
    cotizacionActual.defaultPriceType = e.target.value;
    renderCotResultados(); // para que muestre etiqueta/valor
  });

  // Buscar productos
  const buscador = document.getElementById("cotBuscar");
  buscador.addEventListener("input", () => renderCotResultados());

  actualizarClienteSeleccionadoUI();
  renderCotResultados();
  renderCotItems();
}

function actualizarClienteSeleccionadoUI() {
  const el = document.getElementById("cotClienteInfo");
  if (!el || !cotizacionActual) return;

  if (!cotizacionActual.clienteId) {
    el.innerHTML = `Sin cliente seleccionado.`;
    return;
  }

  const c = clientes.find(x => String(x.id) === String(cotizacionActual.clienteId));
  if (!c) {
    el.innerHTML = `Cliente no encontrado.`;
    return;
  }

  const parts = [];
  parts.push(`<b>${escapeHtml(c.nombre || "Cliente sin nombre")}</b>`);
  if (c.empresa) parts.push(`🏢 ${escapeHtml(c.empresa)}`);
  if (c.telefono) parts.push(`📞 ${escapeHtml(c.telefono)}`);
  if (c.rtn) parts.push(`🧾 RTN: ${escapeHtml(c.rtn)}`);
  if (c.ubicacion) parts.push(`📍 ${escapeHtml(c.ubicacion)}`);

  el.innerHTML = parts.join("<br>");
}

function getUnitPrice(prod, item) {
  if (!prod) return 0;

  if (item.priceType === "precioVendedor") {
    return Number(item.customPrice || 0);
  }

  const val = prod.precios?.[item.priceType];
  if (val !== undefined && val !== null) return Number(val || 0);

  // fallback a precio público
  const base = prod.precios?.precio;
  return Number(base || 0);
}

function renderCotResultados() {
  const cont = document.getElementById("cotResultados");
  const input = document.getElementById("cotBuscar");
  if (!cont || !input) return;

  const q = (input.value || "").toLowerCase().trim();
  if (!q) {
    cont.innerHTML = `<div class="card"><strong>Escribe para buscar productos…</strong></div>`;
    return;
  }

  const encontrados = catalogo.filter(p =>
    (p.codigo || "").toLowerCase().includes(q) ||
    (p.producto || "").toLowerCase().includes(q)
  ).slice(0, 25);

  if (!encontrados.length) {
    cont.innerHTML = `<div class="card"><strong>No se encontraron productos.</strong></div>`;
    return;
  }

  const dummyItem = { priceType: cotizacionActual.defaultPriceType, customPrice: 0 };

  cont.innerHTML = encontrados.map(p => {
    const precio = (dummyItem.priceType === "precioVendedor")
      ? 0
      : getUnitPrice(p, dummyItem);

    const etiqueta = PRICE_LABELS[dummyItem.priceType];
    const precioTxt = dummyItem.priceType === "precioVendedor" ? "Manual" : moneyL(precio);

    return `
      <div class="card">
        <strong>${escapeHtml(trunc(p.producto, 60))}</strong>
        <div class="note">Código: <b>${escapeHtml(p.codigo)}</b> • Stock: <b>${p.stockTotal}</b></div>
        <span class="badge">${escapeHtml(etiqueta)} • ${escapeHtml(precioTxt)}</span>
        <div style="height:8px"></div>
        <button type="button" class="inline" onclick="abrirModalProducto('${escapeHtml(p.codigo)}')">➕ Seleccionar</button>
      </div>
    `;
  }).join("");
}

/* ================= MODAL PRODUCTO (cantidad + tipo + precios) ================= */
function abrirModalProducto(codigo) {
  const prod = catalogoMap.get(codigo);
  if (!prod) return;

  productoModal = prod;

  mpNombre.textContent = prod.producto || "Producto";
  mpMeta.innerHTML = `Código: <b>${escapeHtml(prod.codigo)}</b> • Stock total: <b>${prod.stockTotal}</b>`;

  // Render tabla de precios
  const rows = PRICE_TYPES.map(t => {
    const label = PRICE_LABELS[t];
    const val = (t === "precioVendedor") ? "Manual" : moneyL(Number(prod.precios?.[t] || 0));
    return `<div class="price-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(val)}</b></div>`;
  }).join("");
  mpListaPrecios.innerHTML = rows;

  // Select de tipo precio
  mpTipoPrecio.innerHTML = PRICE_TYPES.map(t => {
    const val = (t === "precioVendedor") ? "Manual" : moneyL(Number(prod.precios?.[t] || 0));
    return `<option value="${t}">${escapeHtml(PRICE_LABELS[t])} • ${escapeHtml(val)}</option>`;
  }).join("");

  mpCantidad.value = 1;
  mpTipoPrecio.value = cotizacionActual?.defaultPriceType || "precio";

  // Precio manual default
  mpPrecioValor.value = "";

  togglePrecioManual();
  actualizarProductoModalTotal();

  modalProducto.classList.add("show");
}

function cerrarModalProducto() {
  modalProducto.classList.remove("show");
  productoModal = null;
}

function togglePrecioManual() {
  if (!mpPrecioManualWrap) return;
  const t = mpTipoPrecio.value;
  if (t === "precioVendedor") {
    mpPrecioManualWrap.classList.remove("hidden");
  } else {
    mpPrecioManualWrap.classList.add("hidden");
  }
}

function actualizarProductoModalTotal() {
  if (!productoModal) return;

  const qty = Math.max(1, Number(mpCantidad.value || 1));
  const t = mpTipoPrecio.value;

  let unit = 0;
  if (t === "precioVendedor") {
    unit = Number(mpPrecioValor.value || 0);
  } else {
    unit = Number(productoModal.precios?.[t] || 0);
  }

  const totalLinea = qty * unit;
  mpTotalLinea.textContent = moneyL(totalLinea);
}

function confirmarAgregarProducto() {
  if (!cotizacionActual || !productoModal) return;

  const qty = Math.max(1, Number(mpCantidad.value || 1));
  const priceType = mpTipoPrecio.value;
  let customPrice = 0;

  if (priceType === "precioVendedor") {
    customPrice = Number(mpPrecioValor.value || 0);
    if (customPrice <= 0) {
      const ok = confirm("El PRECIO VENDEDOR está en 0. ¿Deseas agregar así?");
      if (!ok) return;
    }
  }

  cotAgregarLinea(productoModal.codigo, qty, priceType, customPrice);

  cerrarModalProducto();
  renderCotItems();
}

/* ================= ITEMS (permiten precios mezclados) ================= */
function cotAgregarLinea(codigo, qty, priceType, customPrice) {
  // Si ya existe MISMO producto y MISMO tipo (y mismo custom si aplica), sumamos cantidad
  const match = cotizacionActual.items.find(it => {
    if (it.codigo !== codigo) return false;
    if (it.priceType !== priceType) return false;
    if (priceType === "precioVendedor") {
      return Number(it.customPrice || 0) === Number(customPrice || 0);
    }
    return true;
  });

  if (match) {
    match.qty += qty;
  } else {
    cotizacionActual.items.push({
      id: makeId(),
      codigo,
      qty,
      priceType,
      customPrice: priceType === "precioVendedor" ? Number(customPrice || 0) : 0
    });
  }
}

function cotFindItem(itemId) {
  return cotizacionActual.items.find(x => String(x.id) === String(itemId));
}

function cotInc(itemId) {
  const it = cotFindItem(itemId);
  if (!it) return;
  it.qty += 1;
  renderCotItems();
}

function cotDec(itemId) {
  const it = cotFindItem(itemId);
  if (!it) return;
  it.qty = Math.max(1, it.qty - 1);
  renderCotItems();
}

function cotSetQty(itemId, val) {
  const it = cotFindItem(itemId);
  if (!it) return;
  it.qty = Math.max(1, Number(val || 1));
  renderCotItems();
}

function cotSetPriceType(itemId, newType) {
  const it = cotFindItem(itemId);
  if (!it) return;

  it.priceType = newType;

  if (newType === "precioVendedor") {
    // poner precio manual por defecto: el precio público del producto (si existe)
    const prod = catalogoMap.get(it.codigo);
    const fallback = Number(prod?.precios?.precio || 0);
    it.customPrice = Number(it.customPrice || fallback || 0);
  } else {
    it.customPrice = 0;
  }

  renderCotItems();
}

function cotSetCustomPrice(itemId, val) {
  const it = cotFindItem(itemId);
  if (!it) return;
  it.customPrice = Number(val || 0);
  renderCotItems();
}

function cotQuitar(itemId) {
  cotizacionActual.items = cotizacionActual.items.filter(x => String(x.id) !== String(itemId));
  renderCotItems();
}

function renderCotItems() {
  const cont = document.getElementById("cotItems");
  const totalEl = document.getElementById("cotTotal");
  if (!cont || !totalEl || !cotizacionActual) return;

  if (!cotizacionActual.items.length) {
    cont.innerHTML = `<div class="card"><strong>No hay productos agregados.</strong></div>`;
    totalEl.textContent = moneyL(0);
    return;
  }

  let total = 0;

  cont.innerHTML = cotizacionActual.items.map(it => {
    const prod = catalogoMap.get(it.codigo);
    const unit = getUnitPrice(prod, it);
    const qty = Number(it.qty || 0);
    const sub = qty * unit;
    total += sub;

    const priceOptions = PRICE_TYPES.map(t => {
      const sel = (it.priceType === t) ? "selected" : "";
      return `<option value="${t}" ${sel}>${escapeHtml(PRICE_LABELS[t])}</option>`;
    }).join("");

    const customInput = it.priceType === "precioVendedor"
      ? `<input class="qty" type="number" step="0.01" min="0" value="${Number(it.customPrice || 0)}"
           onchange="cotSetCustomPrice(${it.id}, this.value)" />`
      : "";

    return `
      <div class="item-row">
        <div class="top">
          <div>
            <div class="name">${escapeHtml(trunc(prod?.producto || it.codigo, 60))}</div>
            <div class="meta">
              Código: ${escapeHtml(it.codigo)} • Stock: ${prod ? prod.stockTotal : "?"}
            </div>
          </div>
          <div style="font-weight:900;">${moneyL(sub)}</div>
        </div>

        <div class="controls">
          <button type="button" class="inline secondary" onclick="cotDec(${it.id})">-</button>
          <input class="qty" type="number" min="1" value="${qty}" onchange="cotSetQty(${it.id}, this.value)" />
          <button type="button" class="inline secondary" onclick="cotInc(${it.id})">+</button>

          <select class="inline" onchange="cotSetPriceType(${it.id}, this.value)">
            ${priceOptions}
          </select>

          ${customInput}

          <button type="button" class="inline danger" onclick="cotQuitar(${it.id})">✖</button>
        </div>

        <div class="meta">
          Tipo: <b>${escapeHtml(PRICE_LABELS[it.priceType])}</b> • P.Unit: <b>${moneyL(unit)}</b>
        </div>
      </div>
    `;
  }).join("");

  totalEl.textContent = moneyL(total);
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
    disclaimer: "ESTE DOCUMENTO ES SOLO UNA COTIZACIÓN Y NO TIENE NINGUNA VALIDEZ / VALIDEZ FISCAL"
  };
}

/* ================= GUARDAR COTIZACIÓN ================= */
function guardarCotizacion(skipNameCheck = false) {
  if (!skipNameCheck) {
    if (!ensureNombreVendedor({ type: "cot_guardar" })) return;
  }

  if (!cotizacionActual?.items?.length) {
    alert("Agrega al menos un producto a la cotización.");
    return;
  }

  // Validar precio vendedor (si aplica)
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

  if (!cotizacionActual?.items?.length) {
    alert("Agrega productos primero.");
    return;
  }

  const snap = buildCotizacionSnapshot();
  crearPdfCotizacion(snap, () => renderCotizacionUI());
}

function estimateHeightMM(cot) {
  // Ticket 80mm: base aproximada
  let h = 110; // encabezado + cliente
  h += cot.cliente ? 14 : 8;

  cot.items.forEach(it => {
    const nameLen = (it.producto || "").length;
    const lines = Math.max(1, Math.ceil(nameLen / 28));
    h += 10 + (lines * 4.2) + 6; // bloque item
  });

  h += 30; // total + disclaimer
  return Math.max(170, Math.ceil(h));
}

async function crearPdfCotizacion(cot, backFn) {
  const { jsPDF, GState } = window.jspdf || {};
  if (!jsPDF) {
    alert("No se encontró jsPDF. Revisa la conexión o el script en index.html.");
    return;
  }

  const height = estimateHeightMM(cot);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, height]
  });

  const left = 4;
  const right = 76;
  let y = 6;

  // Logo
  try {
    const logoDataUrl = await getLogoDataUrl();
    doc.addImage(logoDataUrl, "PNG", 17, y, 46, 18);
  } catch (e) {
    // si falla, seguimos sin logo
  }

  y += 24;

  // Encabezado
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
  y += 7;
  try { if (GState) doc.setGState(new GState({ opacity: 0.12 })); } catch {}
  doc.setTextColor(156, 163, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SOLO COTIZACIÓN", 40, y + 18, { align: "center", angle: 45 });
  try { if (GState) doc.setGState(new GState({ opacity: 1 })); } catch {}

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
    const lines = doc.splitTextToSize(line, 72);
    doc.text(lines, left, y);
    y += lines.length * 4.2;
  });

  y += 1;
  doc.line(left, y, right, y);

  // Detalle
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DETALLE", left, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  cot.items.forEach((it) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${it.cantidad} x ${it.codigo}`, left, y);
    y += 4.2;

    doc.setFont("helvetica", "normal");
    const nameLines = doc.splitTextToSize(it.producto || "", 72);
    doc.text(nameLines, left, y);
    y += nameLines.length * 4.2;

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

  // Generar blob y mostrar
  const blob = doc.output("blob");
  setLastFile(blob, `cotizacion-${cot.id}.pdf`, "application/pdf",
    "Cotización - Ferretería Universal",
    "Documento solo para cotización, sin validez");

  mostrarPdfEnPantalla(backFn);
}

function setLastFile(blob, filename, mime, title, text) {
  if (lastFile.url) URL.revokeObjectURL(lastFile.url);

  lastFile.blob = blob;
  lastFile.url = URL.createObjectURL(blob);
  lastFile.filename = filename;
  lastFile.mime = mime;
  lastFile.title = title || "";
  lastFile.text = text || "";
}

function mostrarPdfEnPantalla(backFn) {
  // Guardamos callback en window para usarlo desde HTML inline
  window.__backFromPdf = typeof backFn === "function" ? backFn : volverHome;

  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="window.__backFromPdf()">⬅ Volver</button>

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
        <strong>🧾 #${c.id} • ${escapeHtml(moneyL(c.total))}</strong>
        <div class="note">
          ${escapeHtml(c.fecha)}<br>
          ${c.cliente?.nombre ? `Cliente: <b>${escapeHtml(c.cliente.nombre)}</b>` : "Sin cliente"}
        </div>
        <span class="badge">Generar PDF</span>
      </div>
    `).join("")}
  `;
}

function verCotizacionGuardada(id) {
  const c = cotizaciones.find(x => x.id === id);
  if (!c) return;

  // Generar PDF de una cotización guardada (sin depender del catálogo)
  crearPdfCotizacion(c, () => abrirHistorialCotizaciones());
}
