/* ═══════════════════════════════════════════════════════
   UNAB — app.js
   PDFs carpeta static > PRIMER AÑO
   Ruta base: static/materiales/<MATERIA>/<archivo.pdf>
═══════════════════════════════════════════════════════ */
'use strict';

const API = 'http://localhost:5000';

/* ── Carrera ─────────────────────────────────────────── */
const CARRERA_DEF = {
  id:          "tec-prog",
  nombre:      "Tecnicatura Universitaria en Programación",
  tipo:        "tec",
  tipoLabel:   "Tecnicatura"
};

/* ══════════════════════════════════════════
   UTILIDADES GLOBALES
══════════════════════════════════════════ */
function toast(msg, tipo = "ok") {
  const wrap = document.getElementById("toast-wrap");
  const el   = document.createElement("div");
  el.className = `toast-item t-${tipo}`;
  el.innerHTML = `<i class="bi bi-${tipo === 'ok' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>${msg}`;
  wrap.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 3000);
}

let _authModal = null;
let _planModal = null;
const authModal = () => {
  if (!_authModal) _authModal = new bootstrap.Modal(document.getElementById("modal-auth"));
  return _authModal;
};
const planModal = () => {
  if (!_planModal) _planModal = new bootstrap.Modal(document.getElementById("modal-plan"));
  return _planModal;
};

/* ══════════════════════════════════════════
   CLASE: Auth  (localStorage + backend)
══════════════════════════════════════════ */
class Auth {
  static UK = "unab_users";
  static CK = "unab_cur";
  static TK = "unab_token";
  static DEF = [
    { id:1, name:"Admin UNAB",  email:"admin@unab.edu.ar",      password:"Admin1234",     role:"admin",      carrera:null },
    { id:2, name:"Juan Pérez",  email:"estudiante@unab.edu.ar", password:"Estudiante123", role:"estudiante", carrera:"Tec. Programación" }
  ];

  static _users()   { try { return JSON.parse(localStorage.getItem(Auth.UK)) || Auth.DEF; } catch { return Auth.DEF; } }
  static _save(u)   { try { localStorage.setItem(Auth.UK, JSON.stringify(u)); } catch {} }
  static getCur()   { try { return JSON.parse(localStorage.getItem(Auth.CK)); } catch { return null; } }
  static getToken() { return localStorage.getItem(Auth.TK); }
  static getAll()   { return Auth._users(); }

  static async login(email, pass) {
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email, password: pass })
      });
      if (r.ok) {
        const d = await r.json();
        localStorage.setItem(Auth.CK, JSON.stringify(d.user));
        localStorage.setItem(Auth.TK, d.token);
        return d.user;
      }
    } catch {}
    const u = Auth._users().find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === pass);
    if (u) { localStorage.setItem(Auth.CK, JSON.stringify(u)); }
    return u || null;
  }

  static async register(name, email, pass, carrera) {
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name, email, password: pass, carrera })
      });
      const d = await r.json();
      if (!r.ok) return { error: d.error || "Error al registrarse" };
      localStorage.setItem(Auth.CK, JSON.stringify(d.user));
      localStorage.setItem(Auth.TK, d.token);
      return { user: d.user };
    } catch {}
    const users = Auth._users();
    if (users.find(x => x.email.toLowerCase() === email.toLowerCase())) return { error:"Ese email ya está registrado" };
    if (pass.length < 8) return { error:"La contraseña debe tener al menos 8 caracteres" };
    const u = { id: Date.now(), name, email, password: pass, role:"estudiante", carrera };
    users.push(u); Auth._save(users);
    localStorage.setItem(Auth.CK, JSON.stringify(u));
    return { user: u };
  }

  static logout() {
    localStorage.removeItem(Auth.CK);
    localStorage.removeItem(Auth.TK);
  }

  static setRole(id, role) {
    const users = Auth._users();
    const u = users.find(x => x.id === id);
    if (u) { u.role = role; Auth._save(users); }
  }
}

/* ══════════════════════════════════════════
   CLASE: GestorMaterias
══════════════════════════════════════════ */
class GestorMaterias {
  constructor() { this.materias = []; }

  async cargar() {
    try {
      const r = await fetch(`${API}/api/materias`);
      if (!r.ok) throw new Error("backend no disponible");
      const lista = await r.json();
      this.materias = lista.map(d => new Materia(d));
    } catch {
      this.materias = MATERIAS_FALLBACK.map(d => new Materia(d));
    }
    return this.materias;
  }

  porAnio() {
    const mapa = {};
    for (const m of this.materias) {
      if (!mapa[m.anio]) mapa[m.anio] = {};
      if (!mapa[m.anio][m.cuatrimestre]) mapa[m.anio][m.cuatrimestre] = [];
      mapa[m.anio][m.cuatrimestre].push(m);
    }
    return mapa;
  }

  buscarPorId(id) {
    return this.materias.find(m => m.id === id) || null;
  }
}

/* ══════════════════════════════════════════
   CLASE: Materia
══════════════════════════════════════════ */
class Materia {
  constructor(d) {
    this.id           = d.id;
    this.nombre       = d.nombre;
    this.anio         = d.anio          || "";
    this.cuatrimestre = d.cuatrimestre  || "";
    this.correlativas = d.correlativas  || [];
    this.aprobada     = d.aprobada      || [];
    this.archivo_pdf  = d.archivo_pdf   || null;
    this.materiales   = d.materiales    || [];
  }

  get tieneArchivos() {
    return !!(this.archivo_pdf || this.materiales.length);
  }

  rutaPdf() {
    return this.archivo_pdf ? `static/programas/${this.archivo_pdf}` : null;
  }

  // Los materiales van dentro de subcarpetas por materia
  // Ruta: static/materiales/<carpeta>/<archivo>
  rutaMaterial(entry) {
    // entry puede ser string "archivo.pdf" o objeto { carpeta, archivo }
    if (typeof entry === "string") return `static/materiales/${entry}`;
    return `static/materiales/${entry.carpeta}/${entry.archivo}`;
  }

  labelMaterial(entry) {
    const nombre = typeof entry === "string" ? entry : entry.archivo;
    return nombre.replace(/_/g," ").replace(/\.pdf$/i,"").trim();
  }
}


// ── Helper: construye la ruta del material ───────────────────────
// Si la carpeta es la misma que el nombre del archivo, pasás solo el archivo.
// Ruta final en tu proyecto: static/materiales/<carpeta>/<archivo>
const mat = (carpeta, archivo) => ({ carpeta, archivo });

/* ══════════════════════════════════════════════════════════════
   MATERIAS CON PDFs
   Carpetas:
     ALGORITMOS Y ESTRUCTURA DE DATOS
     CIENCIA, TECNOLOGIA E INNOVACIÓN   ← nueva versión (26/5)
     DESARROLLO DE SOFTWARE
     ESTRUCTURA DE DATOS
     INGLES
     INGLES COMUNICACIONAL
     MATEMATICA GENERAL
     ORGANIZACION DE COMPUTADORAS       ← nuevo PDF (26/5)
     PROBABILIDAD Y ESTADISTICA
     PROGRAMACIÓN AVANZADA
══════════════════════════════════════════════════════════════ */
const MATERIAS_FALLBACK = [

  /* ══ 1° AÑO — Primer Cuatrimestre ══════════════════════════ */

  /* 269 — Ciencia, Tecnología e Innovación
     Carpeta: CIENCIA, TECNOLOGIA E INNOVACIÓN
     PDFs (26/5/2026):
       Ciencia, política y cientificismo - Paulina Aguirre TP
       CTI - Jawtuschenko
       CTI - Thomas
       cti_digital
       Mensaje-Mensaje ambiental a los pueblos - JD Perón 1972
       Rothbard explica la respuesta apropiada al cambio climático  */
  {
    id: 269,
    nombre: "Ciencia, Tecnología e Innovación",
    anio: "1° Año", cuatrimestre: "Primer Cuatrimestre",
    materiales: [
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "Ciencia, política y cientificismo -Trabajo practico 2025.pdf"),
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "CTI - Jawtuschenko.pdf"),
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "CTI - Thomas.pdf"),
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "cti_digital.pdf"),
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "Mensaje-Mensaje ambiental a los pueblos - JD Perón 1972.pdf"),
      mat("CIENCIA, TECNOLOGIA E INNOVACIÓN", "Rothbard explica la respuesta apropiada al cambio climático.pdf"),
    ]
  },

  /* 2 — Matemática General
     Carpeta: MATEMATICA GENERAL
     PDFs: Matemática general Teoria | Practica_1_SumatoriasyProductorias
           Practica_Matrices y determinantes | TP_Vectores y NúmerosComplejos */
  {
    id: 2,
    nombre: "Matemática General",
    anio: "1° Año", cuatrimestre: "Primer Cuatrimestre",
    materiales: [
      mat("MATEMATICA GENERAL", "Matemática general Teoria.pdf"),
      mat("MATEMATICA GENERAL", "Practica_1_SumatoriasyProductorias.pdf"),
      mat("MATEMATICA GENERAL", "Practica_Matrices y determinantes.pdf"),
      mat("MATEMATICA GENERAL", "Trabajo Practico_Vectores y NúmerosComplejos.pdf"),
    ]
  },

  /* 184 — Algoritmos y Estructura de Datos
     Carpeta: ALGORITMOS Y ESTRUCTURA DE DATOS
     PDFs: Algoritmos y estructuras de datos en Python Apunte | Apunte Teórico */
  {
    id: 184,
    nombre: "Algoritmos y Estructura de Datos",
    anio: "1° Año", cuatrimestre: "Primer Cuatrimestre",
    materiales: [
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "Algoritmos y estructuras de datos en Python.pdf"),
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "AyED-Clase04-U02-Funciones.pdf"),
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "AyED-Clase05-U02- IF MENU  20_04_2025-1.pdf"),
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "AyED-Clase8-U03-Recursion.pdf"),
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "Clase11-Archivos.pdf"),
      mat("ALGORITMOS Y ESTRUCTURA DE DATOS", "Parcial 1  2025.pdf"),
    ]
  },

  /* ══ 1° AÑO — Segundo Cuatrimestre ═════════════════════════ */

  /* 270 — Organización de Computadoras
     Carpeta: ORGANIZACION DE COMPUTADORAS
     PDF (26/5): Organización de una Computadora  */
  {
    id: 270,
    nombre: "Organización de Computadoras",
    anio: "1° Año", cuatrimestre: "Segundo Cuatrimestre",
    materiales: [
      mat("ORGANIZACION DE COMPUTADORAS", "Conceptos de lenguajes de Bajo Nivel.pdf"),
      mat("ORGANIZACION DE COMPUTADORAS", "Organización de una Computadora.pdf"),
    ]
  },

  /* 177 — Álgebra  (sin carpeta propia aún) */
  {
    id: 177,
    nombre: "Álgebra",
    anio: "1° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Matemática General"],
    materiales: []
  },

  /* 271 — Estructura de Datos
     Carpeta: ESTRUCTURA DE DATOS
     PDFs: Algoritmos y estructuras de datos en Python
           Martin Fowler - UML Gota a Gota (2000, Addison Wesley Longman) */
  {
    id: 271,
    nombre: "Estructura de Datos",
    anio: "1° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Algoritmos y Estructura de Datos"],
    materiales: [
      mat("ESTRUCTURA DE DATOS", "Algoritmos y estructuras de datos en Python.pdf"),
      mat("ESTRUCTURA DE DATOS", "Martin Fowler - UML Gota a Gota (2000, Addison Wesley Longman).pdf"),
    ]
  },

  /* 5 — Inglés
     Carpeta: INGLES
     PDFs: AFIJOS apuntes | Estrategias de Lectura INGLÉS TÉCNICO I
           Estrategias léxicas (parte 1) | Estrategias léxicas (parte 2)
           Pronombres Apunte */
  {
    id: 5,
    nombre: "Inglés",
    anio: "1° Año", cuatrimestre: "Segundo Cuatrimestre",
    materiales: [
      mat("INGLES", "AFIJOS apuntes.pdf"),
      mat("INGLES", "Estrategias de Lectura INGLÉS TÉCNICO I.pdf"),
      mat("INGLES", "Estrategias léxicas (parte 1).pdf"),
      mat("INGLES", "Estrategias léxicas (parte 2).pdf"),
      mat("INGLES", "Pronombres Apunte.pdf"),
      mat("INGLES", "Simulacro de parcial 2025.pdf"),
    ]
  },

  /* ══ 2° AÑO — Primer Cuatrimestre ══════════════════════════ */

  /* 189 — Programación Avanzada
     Carpeta: PROGRAMACIÓN AVANZADA
     PDFs: 2024-UNAB-LCD-PA-Clase-N04 | 2024-UNAB-LCD-PA-Clase-N05
           2026-UNAB-LCD-PA-Clase-N01 | 2026-UNAB-LCD-PA-Clase-N02
           2026-UNAB-LCD-PA-Clase-N03 | guia_uml_unab_diagrama_clases */
  {
    id: 189,
    nombre: "Programación Avanzada",
    anio: "2° Año", cuatrimestre: "Primer Cuatrimestre",
    correlativas: ["Algoritmos y Estructura de Datos"],
    materiales: [
      mat("PROGRAMACIÓN AVANZADA", "clase10_patrones_singleton_factory_repository.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "guia_uml_unab_diagrama_clases.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "UNAB-LCD-PA-Clase-N01.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "UNAB-LCD-PA-Clase-N02.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "UNAB-LCD-PA-Clase-N03.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "UNAB-LCD-PA-Clase-N04.pdf"),
      mat("PROGRAMACIÓN AVANZADA", "UNAB-LCD-PA-Clase-N05.pdf"),
    ]
  },

  /* 180 — Probabilidad y Estadística
     Carpeta: PROBABILIDAD Y ESTADISTICA
     PDF: Probabilidad y Estadistica para Ingenieria y Ciencias */
  {
    id: 180,
    nombre: "Probabilidad y Estadística",
    anio: "2° Año", cuatrimestre: "Primer Cuatrimestre",
    correlativas: ["Álgebra"], aprobada: ["Matemática General"],
    materiales: [
      mat("PROBABILIDAD Y ESTADISTICA", "Probabilidad y Estadistica para Ingenieria y Ciencias.pdf"),
    ]
  },

  /* 273 — Desarrollo de Software
     Carpeta: DESARROLLO DE SOFTWARE
     PDFs: Guía para el anilisis de negocios | Ingenieria de Software-Somerville
           Ingenieria del Software. Un Enfoque Practico
           Id-Analisis y Diseno de Sistemas_Kendall-8va
           Patrones De Diseño - Libro Gamma helm johnson vlissides */
  {
    id: 273,
    nombre: "Desarrollo de Software",
    anio: "2° Año", cuatrimestre: "Primer Cuatrimestre",
    correlativas: ["Algoritmos y Estructura de Datos"],
    materiales: [
      mat("DESARROLLO DE SOFTWARE", "Clase_IV_Fundamentos_Programacion_2026.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Clase_V_Paradigmas_Diseno_2026.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Clase_VI_Pruebas_Software_2026.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Clase_VII_Gestion_Proyectos_2026.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Ingenieria de Software-Somerville.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Ingenieria del Software. Un Enfoque Practico.pdf"),
      mat("DESARROLLO DE SOFTWARE", "Patrones De Diseño - Libro Gamma helm johnson vlissides.pdf"),
    ]
  },

  /* 274 — Inglés Comunicacional
     Carpeta: INGLES COMUNICACIONAL
     PDF: 1_English_for_Information_Technology_Elementa  */
  {
    id: 274,
    nombre: "Inglés Comunicacional",
    anio: "2° Año", cuatrimestre: "Primer Cuatrimestre",
    aprobada: ["Inglés"],
    materiales: [
      mat("INGLES COMUNICACIONAL", "1_English_for_Information_Technology_Elementa.pdf"),
    ]
  },

  /* ══ 2° AÑO — Segundo Cuatrimestre ═════════════════════════ */

  /* 186 — Gestión de Datos  (sin carpeta aún) */
  {
    id: 186,
    nombre: "Gestión de Datos",
    anio: "2° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Estructura de Datos"], aprobada: ["Algoritmos y Estructura de Datos"],
    materiales: []
  },

  /* 183 — Inferencia Estadística y Reconocimiento de Patrones */
  {
    id: 183,
    nombre: "Inferencia Estadística y Reconocimiento de Patrones",
    anio: "2° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Estructura de Datos","Probabilidad y Estadística"],
    aprobada: ["Algoritmos y Estructura de Datos"],
    materiales: []
  },

  {
    id: 188,
    nombre: "Visualización de la Información",
    anio: "2° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Estructura de Datos","Programación Avanzada"],
    aprobada: ["Algoritmos y Estructura de Datos"],
    materiales: []
  },

  /* ══ 3° AÑO — Primer Cuatrimestre ══════════════════════════ */

  /* 275 — Sistemas Operativos */
  {
    id: 275,
    nombre: "Sistemas Operativos",
    anio: "3° Año", cuatrimestre: "Primer Cuatrimestre",
    correlativas: ["Gestión de Datos"],
    materiales: []
  },

  /* 276 — Redes de Computadoras */
  {
    id: 276,
    nombre: "Redes de Computadoras",
    anio: "3° Año", cuatrimestre: "Primer Cuatrimestre",
    materiales: []
  },

  /* 277 — Conceptos y Paradigmas de Lenguajes de Programación */
  {
    id: 277,
    nombre: "Conceptos y Paradigmas de Lenguajes de Programación",
    anio: "3° Año", cuatrimestre: "Primer Cuatrimestre",
    aprobada: ["Estructura de Datos","Programación Avanzada"],
    materiales: []
  },

  /* ══ 3° AÑO — Segundo Cuatrimestre ═════════════════════════ */

  /* 278 — Programación Concurrente */
  {
    id: 278,
    nombre: "Programación Concurrente",
    anio: "3° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Sistemas Operativos","Redes de Computadoras"],
    aprobada: ["Programación Avanzada"],
    materiales: []
  },

  /* 191 — Inteligencia Artificial */
  {
    id: 191,
    nombre: "Inteligencia Artificial",
    anio: "3° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Inferencia Estadística y Reconocimiento de Patrones"],
    materiales: []
  },
  {
    id: 279,
    nombre: "Metodologías Ágiles para el Desarrollo de Software",
    anio: "3° Año", cuatrimestre: "Segundo Cuatrimestre",
    correlativas: ["Programación Avanzada","Gestión de Datos"],
    aprobada: ["Desarrollo de Software"],
    materiales: []
  },
  {
    id: 280,
    nombre: "Prácticas Profesionales Supervisadas (PPS)",
    anio: "3° Año", cuatrimestre: "Segundo Cuatrimestre",
    materiales: []
  }
];

/* ══════════════════════════════════════════
   GESTOR GLOBAL
══════════════════════════════════════════ */
const gestor = new GestorMaterias();

/* ══════════════════════════════════════════
   NAVBAR AUTH
══════════════════════════════════════════ */
function renderNav() {
  const u         = Auth.getCur();
  const wrap      = document.getElementById("nav-auth");
  const adminItem = document.getElementById("nav-admin-item");
  const adminSec  = document.getElementById("sec-admin");

  if (!u) {
    wrap.innerHTML = `
      <button class="btn btn-outline-light btn-sm fw-bold" onclick="showAuth('login')">Iniciar sesión</button>
      <button class="btn btn-light btn-sm fw-bold" onclick="showAuth('register')">Registrarse</button>`;
    adminItem.classList.add("d-none");
    adminSec.style.display = "none";
  } else {
    wrap.innerHTML = `
      <div class="nav-user-chip" onclick="showAuth('profile')">
        <i class="bi bi-person-circle"></i>
        <span class="user-name">${u.name.split(" ")[0]}</span>
        <span class="role-badge ${u.role}">${u.role}</span>
      </div>
      <button class="btn btn-outline-light btn-sm" title="Cerrar sesión" onclick="doLogout()">
        <i class="bi bi-box-arrow-right"></i>
      </button>`;
    if (u.role === "admin") {
      adminItem.classList.remove("d-none");
      adminSec.style.display = "";
      renderAdmin();
    }
  }
}

function doLogout() { Auth.logout(); renderNav(); toast("Sesión cerrada"); }

/* ══════════════════════════════════════════
   ADMIN PANEL
══════════════════════════════════════════ */
function renderAdmin() {
  document.getElementById("admin-tbody").innerHTML = Auth.getAll().map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td>${u.carrera || "—"}</td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td>
        <select class="form-select form-select-sm" style="width:130px;"
                onchange="changeRole(${u.id},this.value)">
          <option value="estudiante" ${u.role==="estudiante"?"selected":""}>estudiante</option>
          <option value="admin"      ${u.role==="admin"?"selected":""}>admin</option>
        </select>
      </td>
    </tr>`).join("");
}
function changeRole(id, role) { Auth.setRole(id, role); renderAdmin(); toast("Rol actualizado"); }

/* ══════════════════════════════════════════
   AUTH MODAL
══════════════════════════════════════════ */
function showAuth(mode) {
  const title = document.getElementById("auth-title");
  const body  = document.getElementById("auth-body");
  const carr  = [CARRERA_DEF].map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");

  if (mode === "login") {
    title.textContent = "Iniciar sesión";
    body.innerHTML = `
      <div class="msg-error" id="ae"></div>
      <div class="mb-3"><label class="form-label">Email</label>
        <input type="email" class="form-control" id="a-em" placeholder="tu@email.com"/></div>
      <div class="mb-3"><label class="form-label">Contraseña</label>
        <input type="password" class="form-control" id="a-pw" placeholder="••••••••"
               onkeydown="if(event.key==='Enter')doLogin()"/></div>
      <button class="btn-primary-full mb-3" onclick="doLogin()">Entrar</button>
      <div class="text-center d-flex justify-content-center gap-3">
        <span class="auth-link" onclick="showAuth('register')">Registrarse</span>
        <span class="text-muted">·</span>
        <span class="auth-link" onclick="showAuth('forgot')">Olvidé mi contraseña</span>
      </div>
      <div class="mt-3 p-2 rounded bg-light" style="font-size:.76rem;color:var(--gray);">
        <i class="bi bi-info-circle me-1"></i>
        <b>Demo:</b> admin@unab.edu.ar / Admin1234 &nbsp;|&nbsp; estudiante@unab.edu.ar / Estudiante123
      </div>`;

  } else if (mode === "register") {
    title.textContent = "Crear cuenta";
    body.innerHTML = `
      <div class="msg-error" id="ae"></div>
      <div class="mb-3"><label class="form-label">Nombre completo</label>
        <input type="text" class="form-control" id="a-nm" placeholder="Tu nombre"/></div>
      <div class="mb-3"><label class="form-label">Email</label>
        <input type="email" class="form-control" id="a-em" placeholder="tu@email.com"/></div>
      <div class="mb-3"><label class="form-label">Contraseña <small class="text-muted">(mín. 8 caracteres)</small></label>
        <input type="password" class="form-control" id="a-pw" placeholder="••••••••"/></div>
      <div class="mb-3"><label class="form-label">Carrera</label>
        <select class="form-select" id="a-ca">
          <option value="">Seleccioná tu carrera</option>${carr}
        </select></div>
      <button class="btn-primary-full mb-3" onclick="doRegister()">Registrarse</button>
      <div class="text-center">
        <span class="auth-link" onclick="showAuth('login')">¿Ya tenés cuenta? Iniciá sesión</span>
      </div>`;

  } else if (mode === "forgot") {
    title.textContent = "Recuperar contraseña";
    body.innerHTML = `
      <div class="msg-error" id="ae"></div>
      <div class="msg-ok" id="ao"></div>
      <p class="text-muted small mb-3">Ingresá tu email y te enviaremos las instrucciones.</p>
      <div class="mb-3"><label class="form-label">Email</label>
        <input type="email" class="form-control" id="a-em" placeholder="tu@email.com"/></div>
      <button class="btn-primary-full mb-3" onclick="doForgot()">Enviar instrucciones</button>
      <div class="text-center">
        <span class="auth-link" onclick="showAuth('login')">Volver al inicio de sesión</span>
      </div>`;

  } else if (mode === "profile") {
    const u = Auth.getCur();
    title.textContent = "Mi perfil";
    body.innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-4">
        <div style="width:50px;height:50px;border-radius:50%;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--blue);">
          <i class="bi bi-person-fill"></i>
        </div>
        <div>
          <div class="fw-bold">${u.name}</div>
          <div class="text-muted small">${u.email}</div>
          <span class="role-badge ${u.role} mt-1 d-inline-block">${u.role}</span>
        </div>
      </div>
      ${u.carrera ? `<p class="text-muted small mb-3"><i class="bi bi-mortarboard me-1"></i>${u.carrera}</p>` : ""}
      <button class="btn-primary-full" onclick="doLogout();authModal().hide()">
        <i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión
      </button>`;
  }
  authModal().show();
}

function errAuth(msg) {
  const el = document.getElementById("ae");
  if (el) { el.textContent = msg; el.classList.add("show"); }
}

async function doLogin() {
  const email = document.getElementById("a-em")?.value?.trim();
  const pass  = document.getElementById("a-pw")?.value;
  document.getElementById("ae")?.classList.remove("show");
  const u = await Auth.login(email, pass);
  if (!u) { errAuth("Email o contraseña incorrectos"); return; }
  authModal().hide();
  renderNav();
  toast("¡Bienvenido/a, " + u.name.split(" ")[0] + "!");
}

async function doRegister() {
  const name  = document.getElementById("a-nm")?.value?.trim();
  const email = document.getElementById("a-em")?.value?.trim();
  const pass  = document.getElementById("a-pw")?.value;
  const carr  = document.getElementById("a-ca")?.value;
  document.getElementById("ae")?.classList.remove("show");
  if (!name || !email || !pass) { errAuth("Completá todos los campos"); return; }
  const res = await Auth.register(name, email, pass, carr);
  if (res.error) { errAuth(res.error); return; }
  authModal().hide();
  renderNav();
  toast("¡Cuenta creada! Bienvenido/a 🎉");
}

function doForgot() {
  const ok = document.getElementById("ao");
  document.getElementById("ae")?.classList.remove("show");
  if (ok) { ok.textContent = "Si el email existe, recibirás las instrucciones para restablecer tu contraseña."; ok.classList.add("show"); }
}

/* ══════════════════════════════════════════
   CARRERAS — Grid y Dropdown
══════════════════════════════════════════ */
function buildCarreras() {
  const grid = document.getElementById("grid-carreras");
  const dd   = document.getElementById("dropdown-carreras");
  const carreras = [CARRERA_DEF];

  grid.innerHTML = carreras.map(c => `
    <div class="col-sm-6 col-lg-4">
      <div class="carrera-card" onclick="abrirPlan('${c.id}')">
        <div class="card-body">
          <div class="card-title">${c.nombre}</div>
          <button class="btn-ver-plan">
            <i class="bi bi-list-ul me-1"></i>Ver Plan de Estudios
          </button>
        </div>
      </div>
    </div>`).join("");

  dd.innerHTML = carreras.map(c => `
    <li>
      <a class="dropdown-item" href="#" onclick="abrirPlan('${c.id}');return false;">
        ${c.nombre}
      </a>
    </li>`).join("");
}

/* ══════════════════════════════════════════
   MODAL — PLAN DE ESTUDIOS
══════════════════════════════════════════ */
function abrirPlan(cid) {
  const c = CARRERA_DEF;
  document.getElementById("plan-nombre").textContent = c.nombre;
  const badge = document.getElementById("plan-badge");
  badge.textContent = "";
  badge.className   = "me-2";

  const porAnio = gestor.porAnio();
  let html = "";

  const aniosOrden = Object.keys(porAnio).sort((a, b) => {
    const n = s => parseInt(s.replace(/\D/g, "")) || 99;
    return n(a) - n(b);
  });

  aniosOrden.forEach(anio => {
    const cuatris    = porAnio[anio];
    const cuatriKeys = Object.keys(cuatris).sort((a, b) => {
      const o = { "Primer Cuatrimestre":1, "Segundo Cuatrimestre":2, "Anual":3 };
      return (o[a]||9) - (o[b]||9);
    });

    html += `<div class="year-block">
      <div class="year-title"><i class="bi bi-calendar3-week"></i>${anio}</div>
      <div class="cuatri-cols">`;

    cuatriKeys.forEach(q => {
      const isAnual = q.toLowerCase().includes("anual");
      const ms      = cuatris[q];
      html += `<div class="cuatri-block${isAnual ? " anual" : ""}">
        <div class="cuatri-label"><i class="bi bi-calendar2"></i>${q}</div>`;
      ms.forEach(m => {
        html += `<div class="mat-row" onclick="abrirMateria(${m.id})">
          <span class="mat-dot"></span>
          <span class="mat-name">${m.nombre}</span>
          <span class="mat-code-pill">#${m.id}</span>
          ${m.tieneArchivos ? `<span class="mat-apunte"><i class="bi bi-folder2-open"></i>Archivos</span>` : ""}
        </div>`;
      });
      html += `</div>`;
    });

    html += `</div></div>`;
  });

  document.getElementById("plan-body").innerHTML = html;
  planModal().show();
}

/* ══════════════════════════════════════════
   MODAL — DETALLE MATERIA
══════════════════════════════════════════ */
function abrirMateria(mid) {
  const m = gestor.buscarPorId(mid);
  if (!m) return;

  document.getElementById("m-code").textContent  = `Código: ${m.id}`;
  document.getElementById("m-nombre").textContent = m.nombre;
  document.getElementById("m-meta").textContent   =
    `${m.anio}${m.cuatrimestre ? " · " + m.cuatrimestre : ""}`;

  let html = "";

  if (m.correlativas.length) {
    html += `<div class="sec-label"><i class="bi bi-link-45deg"></i>Correlativas para cursar</div>
      <div class="mb-3">${m.correlativas.map(x =>
        `<span class="corr-chip"><i class="bi bi-arrow-right-circle"></i>${x}</span>`
      ).join("")}</div>`;
  }

  if (m.aprobada.length) {
    html += `<div class="sec-label"><i class="bi bi-check-circle"></i>Aprobadas para poder cursar</div>
      <div class="mb-3">${m.aprobada.map(x =>
        `<span class="apro-chip"><i class="bi bi-check2"></i>${x}</span>`
      ).join("")}</div>`;
  }

  // Programa oficial
  if (m.archivo_pdf) {
    const ruta = m.rutaPdf();
    html += `<div class="sec-label"><i class="bi bi-file-earmark-pdf"></i>Programa oficial</div>
      <div class="file-item mb-3">
        <div class="file-item-name">
          <i class="bi bi-file-earmark-pdf-fill text-danger"></i>${m.archivo_pdf}
        </div>
        <div class="d-flex gap-2">
          <a href="${ruta}" target="_blank" class="btn-file-outline"><i class="bi bi-eye"></i> Ver</a>
          <a href="${ruta}" download class="btn-file"><i class="bi bi-download"></i> Bajar</a>
        </div>
      </div>`;
  }

  // Materiales de estudio
  if (m.materiales.length) {
    html += `<div class="sec-label"><i class="bi bi-folder2-open"></i>Materiales de estudio (${m.materiales.length})</div>`;
    m.materiales.forEach(entry => {
      const ruta  = m.rutaMaterial(entry);
      const label = m.labelMaterial(entry);
      // Icono según tipo
      const esTP   = label.toLowerCase().includes("practica") || label.toLowerCase().includes("tp") || label.toLowerCase().includes("ejercicio");
      const icono  = esTP ? "bi-file-earmark-check-fill" : "bi-file-earmark-text-fill";
      const color  = esTP ? "#059669" : "#7c3aed";
      html += `<div class="file-item">
        <div class="file-item-name">
          <i class="bi ${icono}" style="color:${color};"></i>${label}
        </div>
        <div class="d-flex gap-2">
          <a href="${ruta}" target="_blank" class="btn-file-outline"><i class="bi bi-eye"></i> Ver</a>
          <a href="${ruta}" download class="btn-file"><i class="bi bi-download"></i> Bajar</a>
        </div>
      </div>`;
    });
  }

  if (!m.archivo_pdf && !m.materiales.length) {
    html += `<div class="empty-state">
      <i class="bi bi-folder-x"></i>
      <p>Todavía no hay materiales cargados para esta materia.</p>
    </div>`;
  }

  document.getElementById("m-body").innerHTML = html;

  const pm = bootstrap.Modal.getInstance(document.getElementById("modal-plan"));
  if (pm) {
    pm.hide();
    setTimeout(() => new bootstrap.Modal(document.getElementById("modal-materia")).show(), 250);
  } else {
    new bootstrap.Modal(document.getElementById("modal-materia")).show();
  }
}

/* ══════════════════════════════════════════
   BIBLIOTECA
   Muestra todos los PDFs de todas las materias
══════════════════════════════════════════ */
const Bib = (() => {
  const CATS = ["Todos","Apunte","Práctica","Libro"];
  let cat = "Todos";

  // Clasifica cada archivo en una categoría visual
  function clasificar(nombre) {
    const n = nombre.toLowerCase();
    if (n.includes("practica") || n.includes("práctica") || n.includes("tp_") || n.includes("ejercicio")) return "Práctica";
    if (n.includes("apunte") || n.includes("teoria") || n.includes("teórico") || n.includes("resumen")) return "Apunte";
    return "Libro";
  }

  function iconoCat(cat) {
    return { "Apunte":"📝", "Práctica":"🧮", "Libro":"📚" }[cat] || "📄";
  }

  function getAll() {
    const items = [];
    gestor.materias.forEach(m => {
      // Programa oficial
      if (m.archivo_pdf) {
        items.push({
          uid: `prog-${m.id}`,
          cat: "Apunte",
          icono: "📄",
          titulo: m.archivo_pdf.replace(/\.pdf$/i,""),
          materia: m.nombre,
          mid: m.id,
          desc: `Programa oficial de ${m.nombre}.`,
          ruta: m.rutaPdf()
        });
      }
      // Materiales por subcarpeta
      m.materiales.forEach((entry, i) => {
        const label = m.labelMaterial(entry);
        const c     = clasificar(label);
        items.push({
          uid: `mat-${m.id}-${i}`,
          cat: c,
          icono: iconoCat(c),
          titulo: label,
          materia: m.nombre,
          mid: m.id,
          desc: `${c} de ${m.nombre}.`,
          ruta: m.rutaMaterial(entry)
        });
      });
    });
    return items;
  }

  function filtered() {
    return cat === "Todos" ? getAll() : getAll().filter(r => r.cat === cat);
  }

  function render(items) {
    const grid = document.getElementById("grid-recursos");
    if (!items.length) {
      grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-search"></i><p>No se encontraron recursos.</p></div></div>`;
      return;
    }
    grid.innerHTML = items.map(r => `
      <div class="col-sm-6 col-lg-4">
        <div class="recurso-card">
          <div class="recurso-head">
            <span class="recurso-icon">${r.icono}</span>
            <div>
              <div class="recurso-cat">${r.cat}</div>
              <div class="recurso-code">#${r.mid}</div>
              <div class="recurso-title">${r.titulo}</div>
            </div>
          </div>
          <div class="recurso-materia"><i class="bi bi-book me-1"></i>${r.materia}</div>
          <div class="recurso-desc">${r.desc}</div>
          <div class="recurso-footer">
            <a href="${r.ruta}" target="_blank" class="btn-apunte"><i class="bi bi-eye"></i> Ver</a>
            <a href="${r.ruta}" download class="btn-apunte"><i class="bi bi-download"></i> Bajar</a>
          </div>
        </div>
      </div>`).join("");
  }

  function buildCats() {
    document.getElementById("bib-cats").innerHTML = CATS.map(c =>
      `<span class="cat-btn${c === cat ? " active" : ""}" onclick="Bib.setCat('${c}')">${c}</span>`
    ).join("");
  }

  return {
    init()    { buildCats(); render(filtered()); },
    setCat(c) { cat = c; buildCats(); render(filtered()); },
    buscar()  {
      document.getElementById("live-results").style.display = "none";
      const q = document.getElementById("bib-input").value.trim().toLowerCase();
      if (!q) { render(filtered()); return; }
      render(getAll().filter(r =>
        r.titulo.toLowerCase().includes(q) ||
        r.materia.toLowerCase().includes(q) ||
        String(r.mid).includes(q) ||
        r.cat.toLowerCase().includes(q)
      ));
    },
    live() {
      const q    = document.getElementById("bib-input").value.trim().toLowerCase();
      const wrap = document.getElementById("live-results");
      if (q.length < 2) { wrap.style.display = "none"; return; }
      const res = getAll().filter(r =>
        r.titulo.toLowerCase().includes(q) ||
        r.materia.toLowerCase().includes(q) ||
        String(r.mid).includes(q)
      ).slice(0, 7);
      wrap.innerHTML = res.length
        ? res.map(r => `
            <div class="live-item" onclick="Bib.pick('${r.uid}')">
              <span class="live-code">#${r.mid}</span>
              <div>
                <div class="live-name">${r.titulo}</div>
                <div class="live-sub">${r.cat} · ${r.materia}</div>
              </div>
            </div>`).join("")
        : `<div class="no-live">Sin resultados para "${q}"</div>`;
      wrap.style.display = "block";
    },
    pick(uid) {
      document.getElementById("live-results").style.display = "none";
      document.getElementById("bib-input").value = "";
      const r = getAll().find(x => x.uid === uid);
      if (r) render([r]);
    }
  };
})();

document.addEventListener("click", e => {
  if (!e.target.closest(".bib-search-box"))
    document.getElementById("live-results").style.display = "none";
});

/* ══════════════════════════════════════════
   INICIALIZACIÓN
══════════════════════════════════════════ */
(async () => {
  await gestor.cargar();
  buildCarreras();
  Bib.init();
  renderNav();
})();
