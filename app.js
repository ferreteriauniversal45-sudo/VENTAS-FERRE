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
  ADMIN: "ADMIN2024"
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
  // ✅ coma para miles + punto decimal: 1,250.00
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

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return await res.json();
}

/* ================= STATE ================= */
let selectedRole = null;

let nombreVendedor = localStorage.getItem("nombreVendedor") || "";

let clientes = JSON.parse(localStorage.getItem("clientes") || "[]");          // ✅ NO se borran
let cotizaciones = JSON.parse(localStorage.getItem("cotizaciones") || "[]");  // ✅ NO se borran

let catalogo = [];               // [{codigo, producto, departamento, stockTotal, precios:{...}}]
let catalogoMap = new Map();     // codigo -> obj
let catalogoCargado = false;

let cotizacionActual = null;     // {id, fecha, clienteId, items:[]}
let pendingAction = null;

let selectedProductCode = null;

// PDF file last
let lastFile = { blob:null, url:null, filename:"cotizacion.pdf", mime:"application/pdf", title:"", text:"" };
let logoDataUrlCache = null;

let inventarioVersion = localStorage.getItem("inventarioVersion") || "0";  // ✅ Versión almacenada
let inventarioAdmin = [];  // ✅ Datos para ADMIN: [{codigo, producto, stockP, stockA, precios, admin}]

/* ================= ELEMENTS ================= */
const loginScreen = el("login");
const appScreen = el("app");

const pinBox = el("pinBox");
const pinInput = el("pin");
const pinError = el("pinError");
const roleText = el("roleText");

const vendedorHome = el("vendedorHome");
const contenido = el("contenido");

const headerTitle = el("headerTitle");

/* ================= INIT ================= */
async function initApp() {
  // ✅ Cargar versión al inicio
  await checkVersionAndReload();
  if (localStorage.getItem("role")) startApp();
}
initApp();  // ✅ Llamar al inicio
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

pinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validatePin();
});

function startApp(){
  // ocultar login de forma fuerte
  loginScreen.classList.add("hidden");
  loginScreen.style.display = "none";

  appScreen.classList.remove("hidden");
  appScreen.style.display = "block";

  const role = localStorage.getItem("role");

  vendedorHome.classList.add("hidden");
  contenido.classList.add("hidden");

  if (role === "VENDEDOR") {
    headerTitle.textContent = "Cotizaciones";
    vendedorHome.classList.remove("hidden");
  } else if (role === "ADMIN") {
    headerTitle.textContent = "Inventario Admin";
    abrirInventarioAdmin();
  } else {
    contenido.classList.remove("hidden");
    contenido.innerHTML = `
      <div class="card">
        <strong>⚠️ Rol no implementado</strong>
        <div style="color:#6B7280; margin-top:6px;">
          Actualmente este módulo está listo para <b>VENDEDOR</b> y <b>ADMIN</b>.
        </div>
      </div>
    `;
  }
}

function logout(){
  // ✅ NO borrar clientes/cotizaciones/nombreVendedor
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
      // ✅ Forzar recarga del catálogo si cambió la versión
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

  // reanudar acción pendiente
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

  await checkVersionAndReload();  // ✅ Asegurar versión actual

  const [invP, invA, preciosadmin] = await Promise.all([
    fetchJson(URLS.invP),
    fetchJson(URLS.invA),
    fetchJson(URLS.preciosadmin)
  ]);

  catalogo = [];
  catalogoMap = new Map();
  inventarioAdmin = [];  // ✅ Reset para ADMIN

  for (const codigo in invP) {
    const p = invP[codigo];
    const a = invA[codigo] || { cantidad: 0 };
    const data = preciosadmin[codigo] || {};

    const obj = {
      codigo,
      producto: p.producto || "",
      departamento: p.departamento || "",
      stockTotal: Number(p.cantidad || 0) + Number(a.cantidad || 0),
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
        limite: Number(data.limite || 1)
      }
    };

    catalogo.push(obj);
    catalogoMap.set(codigo, obj);

    // ✅ Para ADMIN: separar stock principal y anexo
    inventarioAdmin.push({
      ...obj,
      stockP: Number(p.cantidad || 0),
      stockA: Number(a.cantidad || 0)
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

      <button type="button" onclick="exportarPreciosAExcel()">📊 Exportar Precios a Excel</button>

      <div class="inventario-list" id="listaInventarioAdmin">
        <!-- La lista se poblará después -->
      </div>
    `;

    // ✅ Ahora que el HTML está asignado, pobla la lista
    el("listaInventarioAdmin").innerHTML = renderListaInventarioAdmin();

    // ✅ Evento para búsqueda en tiempo real
    el("buscarAdmin").addEventListener("input", () => {
      el("listaInventarioAdmin").innerHTML = renderListaInventarioAdmin();
    });
  } catch (err) {
    console.error("Error cargando inventario ADMIN:", err);
    contenido.innerHTML = `
      <button type="button" class="secondary" onclick="volverHome()">⬅ Volver</button>
      <div class="card">
        <button type="button" onclick="exportarPreciosAExcel()">📊 Exportar Precios a Excel</button>
        <button type="button" onclick="exportarPreciosAJson()">📄 Exportar Precios a JSON (para GitHub)</button>
        <strong>❌ Error al cargar inventario.</strong>
        <div class="muted">Detalles: ${err.message}</div>
      </div>
    `;
  }
}
function renderListaInventarioAdmin() {
  const q = (el("buscarAdmin").value || "").toLowerCase().trim();
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

  // ✅ Remover stock completamente, solo precios y admin
  el("dpPrecios").innerHTML = `
    <div class="k">Precio Público</div><div class="v"><input type="number" id="dpPrecio" step="0.01" min="0" value="${prod.precios.precio || 0}" class="edit-input" /></div>
    <div class="k">Precio A</div><div class="v"><input type="number" id="dpPrecioA" step="0.01" min="0" value="${prod.precios.precioA || 0}" class="edit-input" /></div>
    <div class="k">Precio B</div><div class="v"><input type="number" id="dpPrecioB" step="0.01" min="0" value="${prod.precios.precioB || 0}" class="edit-input" /></div>
    <div class="k">Precio C</div><div class="v"><input type="number" id="dpPrecioC" step="0.01" min="0" value="${prod.precios.precioC || 0}" class="edit-input" /></div>
    <div class="k">Mayoreo</div><div class="v"><input type="number" id="dpMayoreo" step="0.01" min="0" value="${prod.precios.mayoreo || 0}" class="edit-input" /></div>
    <div class="k">Precio Vendedor</div><div class="v"><input type="number" id="dpPrecioVendedor" step="0.01" min="0" value="${prod.precios.precioVendedor || 0}" class="edit-input" /></div>
  `;

  el("dpAdmin").innerHTML = `
    <div class="k">Costo</div><div class="v"><input type="number" id="dpCosto" step="0.01" min="0" value="${prod.admin.costo || 0}" class="edit-input" /></div>
    <div class="k">Límite</div><div class="v"><input type="number" id="dpLimite" step="0.01" min="0" value="${prod.admin.limite || 0}" class="edit-input" /></div>
  `;

  // ✅ Botón de guardar
  el("modalDetallesProducto").querySelector(".btn-row").innerHTML = `
    <button type="button" onclick="guardarCambiosProducto('${codigo}')">💾 Guardar Cambios</button>
    <button type="button" class="secondary" onclick="cerrarModalDetallesProducto()">Cerrar</button>
  `;

  openModal("modalDetallesProducto");
}

function guardarCambiosProducto(codigo) {
  const prod = inventarioAdmin.find(p => p.codigo === codigo);
  if (!prod) return;

  // ✅ Solo guardar precios, costo y límite
  prod.precios.precio = Math.max(0, Number(el("dpPrecio").value || 0));
  prod.precios.precioA = Math.max(0, Number(el("dpPrecioA").value || 0));
  prod.precios.precioB = Math.max(0, Number(el("dpPrecioB").value || 0));
  prod.precios.precioC = Math.max(0, Number(el("dpPrecioC").value || 0));
  prod.precios.mayoreo = Math.max(0, Number(el("dpMayoreo").value || 0));
  prod.precios.precioVendedor = Math.max(0, Number(el("dpPrecioVendedor").value || 0));

  prod.admin.costo = Math.max(0, Number(el("dpCosto").value || 0));
  prod.admin.limite = Math.max(0, Number(el("dpLimite").value || 0));

  alert("✅ Cambios guardados localmente. Recuerda exportar para actualizar en GitHub.");
  cerrarModalDetallesProducto();
  // ✅ Recargar lista
  el("listaInventarioAdmin").innerHTML = renderListaInventarioAdmin();
}

function cerrarModalDetallesProducto() {
  closeModal("modalDetallesProducto");
}

function modificarPrecio(codigo, tipo, valor) {
  const prod = inventarioAdmin.find(p => p.codigo === codigo);
  if (!prod) return;
  prod.precios[tipo] = Number(valor || 0);
  // ✅ Opcional: Guardar cambios localmente si quieres persistencia temporal
}

function exportarPreciosAJson() {
  // ✅ Crear un objeto que coincida con preciosadmin.json
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

  // ✅ Reutilizar la función de compartir/descargar
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
    Costo: prod.admin.costo,
    Limite: prod.admin.limite
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Precios");
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  setLastFile(blob, `precios-${Date.now()}.xlsx`, "Precios - Ferretería Universal", "Archivo Excel de precios");
  compartirArchivo();  // ✅ Reutiliza la función de compartir
}

/* ================= CLIENTES (pantalla normal) ================= */
function abrirClientes() {
  vendedorHome.classList.add("hidden");
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
  contenido.classList.add("hidden");
  vendedorHome.classList.remove("hidden");
}

/* ================= COTIZACIONES UI ================= */
function abrirCotizacion(){
  vendedorHome.classList.add("hidden");
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
        items: [] // {id, codigo, qty, priceType, customPrice}
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

  // fallback
  return Number(prod.precios?.precio || 0);
}

function itemKey(item){
  const p = item.priceType || "precio";
  const manual = (p === "precioVendedor") ? Number(item.customPrice || 0).toFixed(2) : "";
  return `${item.codigo}__${p}__${manual}`;
}

function normalizeItems(){
  // combina SOLO si es exactamente el mismo producto + mismo tipo precio + mismo precio manual
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

  normalizeItems(); // mantiene regla de líneas separadas por precio
  renderCotizacion();
}

function setItemCustomPrice(id, val){
  const it = findItemById(id);
  if (!it) return;
  it.customPrice = Number(val || 0);

  normalizeItems(); // si mismo manual price, combina
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

el("buscarClienteModal")?.addEventListener("input", renderClientesModal);

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

  // ✅ seleccionar automáticamente en cotización
  cotizacionActual.clienteId = nuevo.id;

  cerrarModalNuevoCliente();
  renderCotizacion();
}

/* ================= MODAL PRODUCTOS + MODAL AGREGAR PRODUCTO ================= */
function abrirModalProductos(){
  // mostrar modal de búsqueda
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

el("buscarProductoModal")?.addEventListener("input", renderProductosModal);

function abrirModalAgregarProducto(codigo){
  const prod = catalogoMap.get(codigo);
  if (!prod) return;

  // cerramos modal de búsqueda y abrimos modal de agregar
  cerrarModalProductos();

  selectedProductCode = codigo;

  el("apTitulo").textContent = prod.producto;
  el("apSub").textContent = `Código: ${prod.codigo} • Stock: ${prod.stockTotal}`;

  // lista de precios (mostrar todos)
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

  // llenar select tipo precio con label + valor
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
    return Number(prod.admin.limite || 0)
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
el("apTipoPrecio")?.addEventListener("change", () => {
  const type = el("apTipoPrecio").value;
  if (type === "precioVendedor") {
    el("apPrecioManualWrap").classList.remove("hidden");
    setTimeout(() => el("apPrecioManual").focus(), 50);
  } else {
    el("apPrecioManualWrap").classList.add("hidden");
  }
});

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
      // ✅ Reemplaza el alert con el modal bonito
      mostrarModalErrorPrecio(minimo);
      return;
    }
  }

  addItem(prod.codigo, qty, priceType, customPrice);

  cerrarModalAgregarProducto();
  renderCotizacion();
}

function addItem(codigo, qty, priceType, customPrice){
  // ✅ regla: mismo producto con distinto precio => líneas separadas
  // aquí solo combinamos si es mismo codigo + mismo priceType + mismo precio manual (si aplica)
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

function setLastFile(blob, filename, title, text){
  if (lastFile.url) URL.revokeObjectURL(lastFile.url);
  lastFile.blob = blob;
  lastFile.url = URL.createObjectURL(blob);
  lastFile.filename = filename;
  lastFile.mime = "application/pdf";
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

  // ✅ Ticket 80mm, páginas 80x297mm con saltos
  const PAGE_W = 80;
  const PAGE_H = 297;
  const marginL = 4;
  const marginR = PAGE_W - 4;
  const lineH = 4.2;
  const bottomReserve = 24; // espacio para total + texto legal

  const doc = new jsPDF({ unit: "mm", format: [PAGE_W, PAGE_H] });

  const logoDataUrl = await getLogoDataUrl().catch(() => null);

  let y = 6;
  let page = 1;

  function watermark(){
    // Marca de agua en cada página
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

  // Cliente en líneas separadas (factura real)
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

  // Detalle
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

    // Estimar espacio por item:
    // 1 línea qty/cod + nameLines + 1 línea tipo + 1 línea precios + separador
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

  // Total SIEMPRE visible (con salto si hace falta)
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
    const base64data = reader.result.split(",")[1]; // quitamos data:application/pdf;base64,
    window.Android.guardarPdfBase64(base64data, filename);
  };
  reader.readAsDataURL(blob);
}


function mostrarPdfPreview(){
  contenido.classList.remove("hidden");
  vendedorHome.classList.add("hidden");

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

  // APK Android (forma correcta)
  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    enviarPdfAAndroidParaCompartir(lastFile.blob, lastFile.filename);
    return;
  }

  // Web normal
  window.open(lastFile.url, "_blank");
}



function descargarArchivo() {
  if (!lastFile || !lastFile.blob) {
    alert("No hay archivo para descargar");
    return;
  }

  // Android
  if (window.Android && typeof window.Android.guardarPdfBase64 === "function") {
    enviarPdfAAndroidParaCompartir(lastFile.blob, lastFile.filename);
    return;
  }

  // Web
  const a = document.createElement("a");
  a.href = lastFile.url;
  a.download = lastFile.filename;
  a.click();
}


/* ================= HISTORIAL ================= */
function abrirHistorialCotizaciones(){
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
  // elimina espacios, guiones, paréntesis
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

  // Honduras: 504
  const url = `https://wa.me/504${num}`;
  window.open(url, "_blank");
}       
