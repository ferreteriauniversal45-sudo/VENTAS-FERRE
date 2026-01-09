/* ================= CONFIG ================= */
const BASE_RAW = "https://raw.githubusercontent.com/ferreteriauniversal45-sudo/ferreteria-inventario-app/main/";
const URLS = {
  logo: BASE_RAW + "logo.png",
  invP: BASE_RAW + "inventario.json",
  invA: BASE_RAW + "inventarioanexo.json",
  precios: BASE_RAW + "precios.json",
  preciosadmin: BASE_RAW + "preciosadmin.json",
  version: BASE_RAW + "inventario_version.json"
};

const PINS = {
  OPERADOR: "CONTROL2025",
  VENDEDOR: "VENTAS2026",
  ADMIN: "ADMIN2024",
  BODEGUERO: "1234"
};

const EMPRESA_RTN = "0301-1964-008634";

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

/* ================= HELPERS ================= */
const el = (id) => document.getElementById(id);

function moneyL(value){
  const n = Number(value || 0);
  return "L. " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal(id){ el(id).classList.add("show"); }
function closeModal(id){ el(id).classList.remove("show"); }

function nowStr(){
  return new Date().toLocaleString("es-HN");
}

function getRole(){
  return localStorage.getItem("role") || "";
}

function isBodeguero(){
  return getRole() === "BODEGUERO";
}

function isOperadorLike(){
  const r = getRole();
  return r === "OPERADOR" || r === "BODEGUERO";
}

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return await res.json();
}

/* ================= STATE ================= */
let selectedRole = null;

let nombreVendedor = localStorage.getItem("nombreVendedor") || "";

let clientes = JSON.parse(localStorage.getItem("clientes") || "[]");
let cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");

let catalogo = [];
let catalogoMap = new Map();
let catalogoCargado = false;

let cotizacionActual = null;
let pendingAction = null;

let selectedProductCode = null;

let lastFile = { blob:null, url:null, filename:"cotizacion.pdf", mime:"application/pdf", title:"", text:"" };
let logoDataUrlCache = null;

let inventarioVersion = localStorage.getItem("inventarioVersion") || "0";
let inventarioAdmin = [];

/* ================= ELEMENTS ================= */
const loginScreen = el("login");
const appScreen = el("app");

const pinBox = el("pinBox");
const pinInput = el("pin");
const pinError = el("pinError");
const roleText = el("roleText");

const vendedorHome = el("vendedorHome");
const operadorHome = el("operadorHome");
const contenido = el("contenido");

const headerTitle = el("headerTitle");

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

  if (pinInput.value === PINS[selectedRole]) {
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

function startApp(){
  loginScreen.classList.add("hidden");
  loginScreen.style.display = "none";

  appScreen.classList.remove("hidden");
  appScreen.style.display = "block";

  const role = localStorage.getItem("role");

  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.add("hidden");

  if (role === "VENDEDOR") {
    headerTitle.textContent = "Cotizaciones";
    vendedorHome.classList.remove("hidden");
  } else if (role === "OPERADOR" || role === "BODEGUERO") {
    headerTitle.textContent = (role === "BODEGUERO") ? "Bodeguero" : "Operador";
    operadorHome.classList.remove("hidden");
  } else if (role === "ADMIN") {
    headerTitle.textContent = "Inventario Admin";
    abrirInventarioAdmin();
  } else {
    contenido.classList.remove("hidden");
    contenido.innerHTML = `
      <div class="card">
        <strong>⚠️ Rol no implementado</strong>
        <div style="color:#6B7280; margin-top:6px;">
          Actualmente este módulo está listo para <b>VENDEDOR</b>, <b>OPERADOR</b>, <b>BODEGUERO</b> y <b>ADMIN</b>.
        </div>
      </div>
    `;
  }
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
      catalogoCargado = false;
      inventarioAdmin = [];
    }
  } catch (err) {
    console.warn("No se pudo cargar versión:", err);
  }
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
async function ensureCatalogoCargado(){
  if (catalogoCargado) return;

  await checkVersionAndReload();

  const [invP, invA, preciosadmin] = await Promise.all([
    fetchJson(URLS.invP),
    fetchJson(URLS.invA),
    fetchJson(URLS.preciosadmin)
  ]);

  catalogo = [];
  catalogoMap = new Map();
  inventarioAdmin = [];

  for (const codigo in invP) {
    const p = invP[codigo];
    const a = invA[codigo] || { cantidad: 0 };
    const data = preciosadmin[codigo] || {};

    const stockP = Number(p.cantidad || 0);
    const stockA = Number(a.cantidad || 0);

    const obj = {
      codigo,
      producto: p.producto || "",
      departamento: p.departamento || "",
      stockP,
      stockA,
      stockTotal: stockP + stockA,
      precios: {
        precio: data.precio,
        precioA: data.precioA,
        precioB: data.precioB,
        precioC: data.precioC,
        mayoreo: data.mayoreo,
        precioVendedor: data.precioVendedor || 0
      },
      admin: {
        costo: Number(data.costo || 0),
        limite: Number(data.limite || 0)
      }
    };

    catalogo.push(obj);
    catalogoMap.set(codigo, obj);

    inventarioAdmin.push({
      ...obj,
      stockP,
      stockA
    });
  }

  catalogo.sort((x,y) => (x.producto||"").localeCompare(y.producto||"", "es"));
  inventarioAdmin.sort((x,y) => (x.producto||"").localeCompare(y.producto||"", "es"));
  catalogoCargado = true;
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
        <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
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

  if (role === "VENDEDOR") vendedorHome.classList.remove("hidden");
  else if (role === "OPERADOR" || role === "BODEGUERO") operadorHome.classList.remove("hidden");
  else if (role === "ADMIN") abrirInventarioAdmin();
  else vendedorHome.classList.remove("hidden");
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

function renderCotizacion(){
  const cliente = getClienteSeleccionado();

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>🧾 Cotización</strong>
      <div class="item-meta">#${cotizacionActual.id} • ${escapeHtml(cotizacionActual.fecha)}</div>
      <div style="margin-top:8px;">
        <span class="badge">SOLO COTIZACIÓN • SIN VALIDEZ FISCAL</span>
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

    <button type="button" onclick="guardarCotizacion()">💾 Guardar cotización</button>
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
    const prod = catalogoMap.get(it.codigo);
    const unit = getUnitPrice(prod, it);
    total += Number(it.qty || 0) * unit;
  }
  return total;
}

function renderItems(){
  const wrap = el("cotItemsWrap");
  if (!wrap) return;

  if (!cotizacionActual.items.length) {
    wrap.innerHTML = `<div class="card"><strong>No hay productos agregados.</strong></div>`;
    return;
  }

  wrap.innerHTML = cotizacionActual.items.map(it => {
    const prod = catalogoMap.get(it.codigo);
    const unit = getUnitPrice(prod, it);
    const sub = Number(it.qty || 0) * unit;

    const options = PRICE_TYPES.map(t => {
      const sel = it.priceType === t ? "selected" : "";
      return `<option value="${t}" ${sel}>${PRICE_LABELS[t]}</option>`;
    }).join("");

    const manualInput = it.priceType === "precioVendedor"
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
              Código: ${escapeHtml(it.codigo)} • Stock: ${prod?.stockTotal ?? "?"}<br>
              Tipo: <b>${PRICE_LABELS[it.priceType]}</b> • P.Unit: <b>${moneyL(unit)}</b>
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
  renderItems();
}

function decQty(id){
  const it = findItemById(id);
  if (!it) return;
  it.qty = Math.max(1, Number(it.qty || 1) - 1);
  renderItems();
}

function setQty(id, val){
  const it = findItemById(id);
  if (!it) return;
  it.qty = Math.max(1, Number(val || 1));
  renderItems();
}

function setPriceType(id, type){
  const it = findItemById(id);
  if (!it) return;
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
  cotizacionActual.items = cotizacionActual.items.filter(x => String(x.id) !== String(id));
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

function abrirModalNuevoClienteDesdeCot(){
  cerrarModalClientes();

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

  cotizacionActual.clienteId = nuevo.id;

  cerrarModalNuevoCliente();
  renderCotizacion();
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

function renderProductosModal(){
  const q = (el("buscarProductoModal").value || "").toLowerCase().trim();
  const cont = el("listaProductosModal");

  if (!q) {
    cont.innerHTML = `<div class="list-item"><div class="list-title">Escribe para buscar productos…</div><div class="list-sub">Ej: “clavo”, “01-0002”</div></div>`;
    return;
  }

  const encontrados = catalogo.filter(p =>
    (p.codigo || "").toLowerCase().includes(q) ||
    (p.producto || "").toLowerCase().includes(q)
  ).slice(0, 30);

  cont.innerHTML = encontrados.length ? encontrados.map(p => `
    <div class="list-item" onclick="abrirModalAgregarProducto('${p.codigo}')">
      <div class="list-title">${escapeHtml(p.producto)}</div>
      <div class="list-sub">Código: ${escapeHtml(p.codigo)} • Stock: ${p.stockTotal}</div>
    </div>
  `).join("") : `<div class="list-item"><div class="list-title">No hay resultados</div></div>`;
}

const buscarProductoModal = el("buscarProductoModal");
if (buscarProductoModal) buscarProductoModal.addEventListener("input", renderProductosModal);

function abrirModalAgregarProducto(codigo){
  const prod = catalogoMap.get(codigo);
  if (!prod) return;

  cerrarModalProductos();

  selectedProductCode = codigo;

  el("apTitulo").textContent = prod.producto;
  el("apSub").textContent = `Código: ${prod.codigo} • Stock: ${prod.stockTotal}`;

  const preciosHtml = PRICE_TYPES
    .filter(t => t !== "precioVendedor")
    .map(t => {
      const v = prod.precios?.[t];
      const val = (v === undefined || v === null) ? "N/D" : moneyL(v);
      return `<div class="k">${PRICE_LABELS[t]}</div><div class="v">${val}</div>`;
    }).join("");

  el("apListaPrecios").innerHTML = preciosHtml + `
    <div class="k">${PRICE_LABELS.precioVendedor}</div><div class="v">Manual</div>
  `;

  el("apCantidad").value = 1;

  el("apTipoPrecio").innerHTML = PRICE_TYPES.map(t => {
    if (t === "precioVendedor") {
      return `<option value="${t}">${PRICE_LABELS[t]} (manual)</option>`;
    }
    const v = prod.precios?.[t];
    const val = (v === undefined || v === null) ? "N/D" : moneyL(v);
    return `<option value="${t}">${PRICE_LABELS[t]} • ${val}</option>`;
  }).join("");

  el("apTipoPrecio").value = "precio";
  el("apPrecioManualWrap").classList.add("hidden");
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
    if (type === "precioVendedor") {
      el("apPrecioManualWrap").classList.remove("hidden");
      setTimeout(() => el("apPrecioManual").focus(), 50);
    } else {
      el("apPrecioManualWrap").classList.add("hidden");
    }
  });
}

function confirmarAgregarProducto(){
  const prod = catalogoMap.get(selectedProductCode);
  if (!prod) return;

  const qty = Math.max(1, Number(el("apCantidad").value || 1));
  const priceType = el("apTipoPrecio").value;
  let customPrice = 0;

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
  const newItem = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    codigo,
    qty: Number(qty || 1),
    priceType,
    customPrice: Number(customPrice || 0)
  };

  const key = itemKey(newItem);
  const exist = cotizacionActual.items.find(it => itemKey(it) === key);

  if (exist) {
    exist.qty += newItem.qty;
  } else {
    cotizacionActual.items.push(newItem);
  }
}

/* ================= GUARDAR COTIZACIÓN ================= */
function buildCotizacionSnapshot(){
  const cliente = getClienteSeleccionado();

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
      empresa: cliente.empresa || "",
      telefono: cliente.telefono || "",
      rtn: cliente.rtn || "",
      ubicacion: cliente.ubicacion || ""
    } : null,
    items,
    total,
    disclaimer: "ESTE DOCUMENTO ES SOLO UNA COTIZACIÓN Y NO TIENE VALIDEZ FISCAL"
  };
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
  cotizaciones.unshift(snap);
  localStorage.setItem("cotizaciones", JSON.stringify(cotizaciones));
  alert("✅ Cotización guardada localmente.");
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
function abrirHistorialCotizaciones(){
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
          ${c.cliente?.nombre ? `Cliente: ${escapeHtml(c.cliente.nombre)}` : "Sin cliente"}
        </div>
        <button type="button" class="secondary" onclick="generarPdfDesdeGuardada(${c.id})">📄 Generar PDF</button>
      </div>
    `).join("")}
  `;
}

function generarPdfDesdeGuardada(id){
  const c = cotizaciones.find(x => x.id === id);
  if (!c) return;
  crearPdfCotizacion(c);
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

let facturasEntradas = JSON.parse(localStorage.getItem("facturasEntradas") || "[]");
let facturasSalidas = JSON.parse(localStorage.getItem("facturasSalidas") || "[]");
let transferencias = JSON.parse(localStorage.getItem("transferencias") || "[]");
let conteos = JSON.parse(localStorage.getItem("conteos") || "[]");

let movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");

/* ================= OPERADOR: INVENTARIO ================= */
async function abrirInventarioOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📦 Inventario</strong>
      <div class="muted">Busca por código o nombre. ${isBodeguero() ? "Muestra solo Anexo." : "Muestra Principal / Anexo / Total."}</div>
    </div>

    <input id="opBuscarInv" placeholder="🔍 Buscar por código o nombre" />
    <div class="inventario-list" id="opListaInv"></div>
  `;

  await ensureCatalogoCargado();

  const input = el("opBuscarInv");
  if (input) input.addEventListener("input", renderInventarioOperador);

  renderInventarioOperador();
}

function renderInventarioOperador(){
  const input = el("opBuscarInv");
  const q = (input ? (input.value || "") : "").toLowerCase().trim();

  const cont = el("opListaInv");
  if (!cont) return;

  const filtrados = catalogo
    .filter(p =>
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.producto || "").toLowerCase().includes(q)
    )
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

  entradaFactura = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    proveedor: "",
    facturaNo: "",
    items: []
  };

  agregarFilaEntrada();
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
    const prod = catalogoMap.get(codigo);
    entradaFactura.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0
    });
  });

  if (!entradaFactura.items.length) agregarFilaEntrada();
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
    <button type="button" class="secondary" onclick="agregarFilaEntrada(); renderFilasEntrada(); actualizarPreviewEntrada();">➕ Agregar producto</button>

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
        <button type="button" onclick="guardarFacturaEntradas()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar factura"}</button>
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
  if (!entradaFactura.items.length) agregarFilaEntrada();
  renderFilasEntrada();
  actualizarPreviewEntrada();
}

function renderFilasEntrada(){
  const wrap = el("opItemsWrap");
  if (!wrap) return;

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
  if (formatted && catalogoMap.has(formatted)) {
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
  const prod = catalogoMap.get(codigo);
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

  const prod = catalogoMap.get(formatted);
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
      (p.codigo || "").toLowerCase().includes(q)
    )
    .slice(0, 40);

  cont.innerHTML = encontrados.length ? encontrados.map(p => `
    <div class="list-item" onclick="seleccionarProductoOperador('${p.codigo}')">
      <div class="list-title">${escapeHtml(p.producto)}</div>
      <div class="list-sub">Código: ${escapeHtml(p.codigo)} • ${isBodeguero() ? `A:${Number(p.stockA ?? 0)}` : `P:${Number(p.stockP ?? 0)} • A:${Number(p.stockA ?? 0)}`}</div>
    </div>
  `).join("") : `<div class="list-item"><div class="list-title">No hay resultados</div></div>`;
}

const buscarProductoOperador = el("buscarProductoOperador");
if (buscarProductoOperador) buscarProductoOperador.addEventListener("input", renderProductosOperadorModal);

function seleccionarProductoOperador(codigo){
  if (!operadorFilaActivaId) return;

  const codigoFmt = String(codigo || "").trim();
  const prod = catalogoMap.get(codigoFmt);
  const nombre = prod ? (prod.producto || "") : "";

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

    it.codigo = codigoFmt;
    it.producto = nombre;

    const codeInput = el("opCCodigo_" + it.id);
    const prodInput = el("opCProd_" + it.id);
    if (codeInput) codeInput.value = it.codigo;
    if (prodInput) prodInput.value = it.producto;

    const sug = el("opCSug_" + it.id);
    if (sug) sug.innerHTML = "";

    cerrarModalProductosOperador();
    actualizarPreviewConteo();
    return;
  }

  // default fallback
  cerrarModalProductosOperador();
}

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
}

/* ===== Guardar ===== */
function guardarFacturaEntradas(){
  const f = entradaFactura;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
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
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  facturasEntradas.unshift(snap);
  localStorage.setItem("facturasEntradas", JSON.stringify(facturasEntradas));

  registrarMovimiento("ENTRADA", snap);

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

  salidaFactura = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    facturaNo: "",
    items: []
  };

  agregarFilaSalida();
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
    const prod = catalogoMap.get(codigo);
    salidaFactura.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0
    });
  });

  if (!salidaFactura.items.length) agregarFilaSalida();
  renderSalidasOperador();
}

function renderSalidasOperador(){
  const f = salidaFactura;
  const isEdit = operadorEdit && operadorEdit.tipo === "SALIDA";

  contenido.innerHTML = `
    <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>

    <div class="card">
      <strong>📤 Salidas</strong>
      <div class="muted">${isEdit ? "Editando factura guardada. Puedes cambiar cantidades o eliminar productos." : "Registra salidas con múltiples productos."}</div>
    </div>

    <div class="card-lite">
      <div class="op-grid">
        <div class="col">
          <label class="label">Fecha</label>
          <input type="date" id="opSFecha" value="${escapeHtml(f.fechaISO)}" onchange="onSalidaFechaChange(this.value)" />
        </div>
        <div class="col">
          <label class="label">Factura / Referencia</label>
          <input id="opSFactura" placeholder="Ej: 000123" value="${escapeHtml(f.facturaNo)}" oninput="onSalidaFacturaChange(this.value)" />
        </div>
      </div>
    </div>

    <div class="card-lite">
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <strong>Productos</strong>
        <button type="button" class="secondary small" onclick="agregarFilaSalida()">➕ Línea</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="opItemsWrapSalida"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="opFacturaPreviewSalida"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="guardarFacturaSalidas()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar factura"}</button>
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

function renderFilasSalida(){
  const wrap = el("opItemsWrapSalida");
  if (!wrap) return;

  wrap.innerHTML = salidaFactura.items.map((it) => {
    const qtyVal = (it.cantidad === "" || it.cantidad === null || it.cantidad === undefined)
      ? ""
      : Number(it.cantidad || 0);

    return `
      <div class="op-row-wrap">
        <div class="op-row">
          <input
            id="opSCodigo_${it.id}"
            placeholder="Código"
            value="${escapeHtml(it.codigo)}"
            oninput="onCodigoSalidaInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn secondary" onclick="abrirModalProductosOperador('${it.id}', 'SALIDA')" title="Buscar">🔎</button>

          <input
            id="opSProd_${it.id}"
            placeholder="Producto"
            value="${escapeHtml(it.producto)}"
            disabled
          />

          <input
            id="opSQty_${it.id}"
            type="number"
            min="1"
            value="${qtyVal}"
            oninput="onCantidadSalidaInput('${it.id}', this.value)"
          />

          <button type="button" class="op-icon-btn op-del" onclick="borrarFilaSalida('${it.id}')" title="Eliminar">✖</button>
        </div>

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
  if (!salidaFactura.items.length) agregarFilaSalida();
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

  const prod = catalogoMap.get(formatted);
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
    actualizarPreviewSalida();
    return;
  }

  it.cantidad = Math.max(1, Number(value || 1));
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
    <span class="chip" onclick="seleccionarSugerenciaSalida('${id}', '${escapeHtml(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaSalida(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  const it = salidaFactura.items.find(x => x.id === filaId);
  if (!it) return;

  const prod = catalogoMap.get(codigoFmt);
  it.codigo = codigoFmt;
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
  if (!box || !salidaFactura) return;

  const f = salidaFactura;
  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || (catalogoMap.get(x.codigo)?.producto || ""),
      cantidad: Number(x.cantidad || 0)
    }));

  box.innerHTML = `
    <div class="factura-head">
      <div>
        <div class="t">Factura de Salida</div>
        <div class="factura-meta">Fecha: ${escapeHtml(f.fechaISO || "")}</div>
      </div>
      <div style="text-align:right">
        <div class="t">#${escapeHtml(String(f.facturaNo || ""))}</div>
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
}

function guardarFacturaSalidas(){
  const f = salidaFactura;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && Number(x.cantidad || 0) > 0)
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

  if (!String(f.facturaNo || "").trim()) {
    alert("Ingresa el número de factura o referencia.");
    return;
  }
  if (!itemsOk.length) {
    alert("Agrega al menos un producto (código y cantidad).");
    return;
  }

  const snap = {
    id: f.id,
    fecha: f.fechaISO,
    facturaNo: f.facturaNo,
    items: itemsOk,
    totalLineas: itemsOk.length,
    totalUnidades: itemsOk.reduce((acc, x) => acc + x.cantidad, 0),
    creadoEn: nowStr(),
    creadoAtISO: new Date().toISOString(),
    creadoAtEpoch: Date.now()
  };

  // ✅ EDITAR
  if (operadorEdit && operadorEdit.tipo === "SALIDA") {
    actualizarMovimientoExistente(operadorEdit.movId, "SALIDA", snap);
    alert("✅ Cambios guardados.");
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  facturasSalidas.unshift(snap);
  localStorage.setItem("facturasSalidas", JSON.stringify(facturasSalidas));

  registrarMovimiento("SALIDA", snap);

  alert("✅ Factura guardada localmente.");
  abrirSalidasOperador();
}

/* ================= OPERADOR: TRANSFERENCIAS ================= */
async function abrirTransferenciasOperador(){
  vendedorHome.classList.add("hidden");
  operadorHome.classList.add("hidden");
  contenido.classList.remove("hidden");

  await ensureCatalogoCargado();

  operadorEdit = null;

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
    const prod = catalogoMap.get(codigo);
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

  const prod = catalogoMap.get(formatted);
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
    <span class="chip" onclick="seleccionarSugerenciaTransferencia('${id}', '${escapeHtml(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaTransferencia(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  const it = transferenciaDoc.items.find(x => x.id === filaId);
  if (!it) return;

  const prod = catalogoMap.get(codigoFmt);
  it.codigo = codigoFmt;
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
      producto: x.producto || (catalogoMap.get(x.codigo)?.producto || ""),
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
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  transferencias.unshift(snap);
  localStorage.setItem("transferencias", JSON.stringify(transferencias));

  registrarMovimiento("TRASLADO", snap);

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

  conteoDoc = {
    id: Date.now(),
    fechaISO: new Date().toISOString().slice(0,10),
    referencia: "",
    items: []
  };

  agregarFilaConteo();
  renderConteosOperador();
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
    const prod = catalogoMap.get(codigo);
    conteoDoc.items.push({
      id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      codigo,
      producto: x.producto || (prod ? (prod.producto || "") : ""),
      cantidad: Number(x.cantidad || 0) || 0
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
        <button type="button" class="secondary small" onclick="agregarFilaConteo()">➕ Línea</button>
      </div>

      <div class="op-table" style="margin-top:10px;">
        <div id="opItemsWrapConteo"></div>
      </div>
    </div>

    <div class="factura-fija">
      <div class="factura-card" id="opFacturaPreviewConteo"></div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" onclick="guardarConteo()">${isEdit ? "💾 Guardar cambios" : "💾 Guardar conteo"}</button>
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

  const formatted = formatCodigoAutoGuion(value);
  it.codigo = formatted;

  const input = el("opCCodigo_" + id);
  if (input && input.value !== formatted) input.value = formatted;

  const prod = catalogoMap.get(formatted);
  it.producto = prod ? (prod.producto || "") : "";

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
    <span class="chip" onclick="seleccionarSugerenciaConteo('${id}', '${escapeHtml(p.codigo)}')">
      ${escapeHtml(p.codigo)} • ${escapeHtml(p.producto)}
    </span>
  `).join("");
}

function seleccionarSugerenciaConteo(filaId, codigo){
  const codigoFmt = String(codigo || "").trim();
  const it = conteoDoc.items.find(x => x.id === filaId);
  if (!it) return;

  const prod = catalogoMap.get(codigoFmt);
  it.codigo = codigoFmt;
  it.producto = prod ? (prod.producto || "") : "";

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
      const prod = catalogoMap.get(x.codigo);
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
}

function guardarConteo(){
  const f = conteoDoc;

  const itemsOk = f.items
    .filter(x => (x.codigo || "").trim() && String(x.cantidad).trim() !== "" )
    .map(x => ({
      codigo: x.codigo,
      producto: x.producto || "",
      cantidad: Number(x.cantidad || 0)
    }));

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
    operadorEdit = null;
    abrirMovimientosOperador();
    return;
  }

  // ✅ NUEVO
  conteos.unshift(snap);
  localStorage.setItem("conteos", JSON.stringify(conteos));

  registrarMovimiento("CONTEO", snap);

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
    return `${fac} • ${d.totalLineas || 0} líneas`;
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

function eliminarMovimientoOperador(movId){
  movimientos = JSON.parse(localStorage.getItem("movimientos") || "[]");
  const mov = movimientos.find(m => String(m.id) === String(movId));
  if (!mov) return;

  const label = movTipoLabel(mov.tipo);
  if (!confirm(`¿Eliminar ${label} del ${mov.fecha}?`)) return;

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

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <strong>${escapeHtml(movTipoLabel(m.tipo))}</strong>
            <div class="muted">${escapeHtml(m.fecha)} • ${escapeHtml(m.resumen || "")}</div>
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



function exportarMovimientosExcelYVaciar(){
  const movs = JSON.parse(localStorage.getItem("movimientos") || "[]");
  if (!movs.length) {
    alert("No hay movimientos para exportar.");
    return;
  }
  if (typeof XLSX === "undefined" || !XLSX.utils) {
    alert("No se encontró SheetJS (XLSX). Revisa el script en index.html.");
    return;
  }

  const rowsByTipo = {
    ENTRADA: [],
    SALIDA: [],
    TRASLADO: [],
    CONTEO: []
  };

  const getCreadoCols = (m) => {
    const iso = m.creadoAtISO || "";
    if (!iso) return { CreadoEn: m.creadoEn || "", CreadoFecha: "", CreadoHora: "" };
    const d = new Date(iso);
    const creadoFecha = d.toISOString().slice(0,10);
    const creadoHora = d.toISOString().slice(11,19);
    return { CreadoEn: m.creadoEn || "", CreadoFecha: creadoFecha, CreadoHora: creadoHora };
  };

  movs.forEach(m => {
    const tipo = m.tipo || "";
    const data = m.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const creado = getCreadoCols(m);

    const base = {
      MovimientoID: m.id || "",
      Tipo: tipo,
      Fecha: data.fecha || m.fecha || "",
      Factura: data.facturaNo || "",
      Proveedor: data.proveedor || "",
      Direccion: data.direccion || "",
      Referencia: data.referencia || "",
      ...creado
    };

    if (items.length) {
      items.forEach((it, idx) => {
        rowsByTipo[tipo]?.push({
          ...base,
          Linea: idx + 1,
          Codigo: it.codigo || "",
          Producto: it.producto || "",
          Cantidad: Number(it.cantidad || 0)
        });
      });
    } else {
      rowsByTipo[tipo]?.push({
        ...base,
        Linea: "",
        Codigo: "",
        Producto: "",
        Cantidad: ""
      });
    }
  });

  const wb = XLSX.utils.book_new();

  const addSheet = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  if (rowsByTipo.ENTRADA.length) addSheet("Entradas", rowsByTipo.ENTRADA);
  if (rowsByTipo.SALIDA.length) addSheet("Salidas", rowsByTipo.SALIDA);
  if (rowsByTipo.TRASLADO.length) addSheet("Transferencias", rowsByTipo.TRASLADO);
  if (rowsByTipo.CONTEO.length) addSheet("Conteos", rowsByTipo.CONTEO);

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
    "Libro Excel con entradas, salidas, transferencias y conteos.",
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


