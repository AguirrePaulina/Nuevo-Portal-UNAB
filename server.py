"""
UNAB — server.py
Flask backend:
  - Sirve materias desde materias.json
  - Sirve PDFs desde static/programas/ y static/materiales/
  - Auth con JWT (login, register, forgot-password, reset-password)
  - Roles: estudiante / admin

Estructura de carpetas necesaria:
  server.py
  materias.json
  static/
    programas/       ← PDFs de programas (algebra.pdf, etc.)
    materiales/      ← Parciales, guías, apuntes

Instalación:
  pip install flask pyjwt

Ejecución:
  python3 server.py   →  http://localhost:5000

Cuentas demo:
  admin@unab.edu.ar       /  Admin1234
  estudiante@unab.edu.ar  /  Estudiante123
"""

import json
import hashlib
import os
import datetime
from flask import Flask, request, jsonify, make_response, send_from_directory  # type: ignore[import]

import jwt  # type: ignore[import]

# ── Configuración ────────────────────────────────────────────────
app        = Flask(__name__, static_folder="static")
JWT_SECRET = "unab_jwt_secret_2026"
RST_SECRET = "unab_reset_secret_2026"
DB_FILE    = os.path.join(os.path.dirname(__file__), "usuarios.json")
MAT_FILE   = os.path.join(os.path.dirname(__file__), "materias.json")

# ── Helpers ──────────────────────────────────────────────────────
def hsh(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()

def db_load() -> dict:
    if os.path.exists(DB_FILE):
        with open(DB_FILE, encoding="utf-8") as f:
            return json.load(f)
    inicial = {"users": [
        {"id":1,"name":"Admin UNAB","email":"admin@unab.edu.ar",
         "password":hsh("Admin1234"),"role":"admin","carrera":None},
        {"id":2,"name":"Juan Pérez","email":"estudiante@unab.edu.ar",
         "password":hsh("Estudiante123"),"role":"estudiante","carrera":"Tec. Programación"},
    ]}
    db_save(inicial)
    return inicial

def db_save(db: dict) -> None:
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

def mat_load() -> list:
    """Lee materias.json y lo devuelve como lista."""
    if not os.path.exists(MAT_FILE):
        return []
    with open(MAT_FILE, encoding="utf-8") as f:
        return json.load(f)

def mk_token(u: dict) -> str:
    return jwt.encode({
        "sub": u["id"], "name": u["name"],
        "email": u["email"], "role": u["role"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }, JWT_SECRET, algorithm="HS256")

def mk_reset(u: dict) -> str:
    return jwt.encode({
        "sub": u["id"], "email": u["email"], "type": "reset",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=30)
    }, RST_SECRET, algorithm="HS256")

def current_user() -> dict | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        return jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None

def pub(u: dict) -> dict:
    return {k: u[k] for k in ("id","name","email","role","carrera")}

# ── CORS ─────────────────────────────────────────────────────────
@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    r.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return r

@app.before_request
def preflight():
    if request.method == "OPTIONS":
        r = make_response(); cors(r); return r, 200

# ── RUTAS: MATERIAS ──────────────────────────────────────────────
@app.get("/api/materias")
def get_materias():
    """Devuelve todas las materias del JSON."""
    return jsonify(mat_load())

@app.get("/api/materias/<int:mid>")
def get_materia(mid: int):
    """Devuelve una materia por ID."""
    m = next((x for x in mat_load() if x["id"] == mid), None)
    if not m:
        return jsonify({"error": "Materia no encontrada"}), 404
    return jsonify(m)

# ── RUTAS: PDFs ──────────────────────────────────────────────────
@app.get("/static/programas/<path:filename>")
def serve_programa(filename):
    """Sirve PDFs de programas oficiales."""
    d = os.path.join(app.root_path, "static", "programas")
    return send_from_directory(d, filename)

@app.get("/static/materiales/<path:filename>")
def serve_material(filename):
    """Sirve materiales de estudio (parciales, guías, apuntes)."""
    d = os.path.join(app.root_path, "static", "materiales")
    return send_from_directory(d, filename)

# ── RUTAS: AUTH ──────────────────────────────────────────────────
@app.get("/")
def health():
    return jsonify({"status": "UNAB API activa", "version": "1.0"})

@app.post("/api/auth/login")
def login():
    d     = request.get_json() or {}
    email = d.get("email", "").strip().lower()
    db    = db_load()
    u     = next((x for x in db["users"] if x["email"].lower() == email), None)
    if not u or u["password"] != hsh(d.get("password", "")):
        return jsonify({"error": "Email o contraseña incorrectos"}), 401
    return jsonify({"token": mk_token(u), "user": pub(u)})

@app.post("/api/auth/register")
def register():
    d       = request.get_json() or {}
    name    = d.get("name", "").strip()
    email   = d.get("email", "").strip().lower()
    pwd     = d.get("password", "")
    carrera = d.get("carrera", "")
    if not name or not email or not pwd:
        return jsonify({"error": "Nombre, email y contraseña son requeridos"}), 400
    if len(pwd) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    db = db_load()
    if any(x["email"].lower() == email for x in db["users"]):
        return jsonify({"error": "Ese email ya está registrado"}), 409
    nid = max(x["id"] for x in db["users"]) + 1
    u   = {"id": nid, "name": name, "email": email,
           "password": hsh(pwd), "role": "estudiante", "carrera": carrera}
    db["users"].append(u); db_save(db)
    return jsonify({"token": mk_token(u), "user": pub(u)}), 201

@app.post("/api/auth/forgot-password")
def forgot():
    d     = request.get_json() or {}
    email = d.get("email", "").strip().lower()
    db    = db_load()
    u     = next((x for x in db["users"] if x["email"].lower() == email), None)
    msg   = "Si el email existe, recibirás instrucciones."
    if u:
        return jsonify({"message": msg, "reset_token": mk_reset(u)})
    return jsonify({"message": msg})

@app.post("/api/auth/reset-password")
def reset_password():
    d   = request.get_json() or {}
    tok = d.get("token", "")
    pwd = d.get("password", "")
    if len(pwd) < 8:
        return jsonify({"error": "Mínimo 8 caracteres"}), 400
    try:
        p = jwt.decode(tok, RST_SECRET, algorithms=["HS256"])
        assert p.get("type") == "reset"
    except Exception:
        return jsonify({"error": "Token inválido o expirado"}), 400
    db = db_load()
    u  = next((x for x in db["users"] if x["id"] == p["sub"]), None)
    if not u:
        return jsonify({"error": "Usuario no encontrado"}), 404
    u["password"] = hsh(pwd); db_save(db)
    return jsonify({"message": "Contraseña actualizada. Ya podés iniciar sesión."})

@app.get("/api/auth/me")
def me():
    u = current_user()
    if not u:
        return jsonify({"error": "No autorizado"}), 401
    return jsonify(u)

# ── RUTAS: ADMIN ─────────────────────────────────────────────────
@app.get("/api/admin/users")
def admin_users():
    u = current_user()
    if not u:               return jsonify({"error": "No autorizado"}), 401
    if u["role"] != "admin": return jsonify({"error": "Solo administradores"}), 403
    return jsonify([pub(x) for x in db_load()["users"]])

@app.put("/api/admin/users/<int:uid>/role")
def admin_role(uid: int):
    u = current_user()
    if not u:               return jsonify({"error": "No autorizado"}), 401
    if u["role"] != "admin": return jsonify({"error": "Solo administradores"}), 403
    d    = request.get_json() or {}
    role = d.get("role")
    if role not in ("admin", "estudiante"):
        return jsonify({"error": "Rol inválido"}), 400
    db     = db_load()
    target = next((x for x in db["users"] if x["id"] == uid), None)
    if not target: return jsonify({"error": "Usuario no encontrado"}), 404
    target["role"] = role; db_save(db)
    return jsonify({"message": f"Rol de {target['name']} actualizado a '{role}'"})

# ── INICIO ───────────────────────────────────────────────────────
if __name__ == "__main__":
    db_load()
    # Crear carpetas de estáticos si no existen
    for d in ["static/programas", "static/materiales"]:
        os.makedirs(os.path.join(os.path.dirname(__file__), d), exist_ok=True)
    print("\n" + "="*54)
    print("  UNAB Backend — http://localhost:5000")
    print("  Materias:   GET /api/materias")
    print("  PDFs:       GET /static/programas/<archivo.pdf>")
    print("  Materiales: GET /static/materiales/<archivo.pdf>")
    print("  Admin:      admin@unab.edu.ar  /  Admin1234")
    print("  Estudiante: estudiante@unab.edu.ar  /  Estudiante123")
    print("="*54 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
