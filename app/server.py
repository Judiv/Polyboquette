"""
PolyBoquette - Backend Flask
==============================
Lance avec : python server.py
En production : gunicorn server:app --bind 0.0.0.0:8000

Architecture :
- Données persistées dans PostgreSQL si DATABASE_URL est défini (Render)
- Fallback sur data/db.json en local (développement)
- Sessions via cookie signé Flask
- Routes REST : /api/...
- Le frontend (index.html + assets) est servi directement par Flask
"""

import os
import copy
import json
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, abort
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(BASE_DIR, "data")
DB_PATH    = os.path.join(DATA_DIR, "db.json")
STATIC_DIR = BASE_DIR          # index.html est à la racine de PolyBoquette/

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Clé secrète – remplace par une vraie valeur en prod (variable d'env)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True

PALETTE = ['#22c55e', '#ef4444', '#3b82f6', '#d946ef', '#f97316', '#eab308', '#06b6d4']

# ──────────────────────────────────────────────────────────────────────────────
# PERSISTANCE : PostgreSQL (prod) ou JSON (local)
# ──────────────────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")  # mis à dispo automatiquement par Render
USE_PG = PSYCOPG2_AVAILABLE and bool(DATABASE_URL)

DEFAULT_DB = {
    "version": 7,
    "users": {},
    "markets": [],
    "categories": [],
    "proposals": [],
    "admin_grants_log": [],
    "admin_login_log": [],
    "name_change_requests": [],
    "admin_audit_log": [],
    "password_reset_requests": []
}

# ──────────────────────────────────────────────────────────────────────────────
# RATE LIMITING (brute-force protection sur /api/auth/login)
# ──────────────────────────────────────────────────────────────────────────────
_login_attempts: dict = defaultdict(list)  # ip -> [timestamps]
LOGIN_MAX_ATTEMPTS = 5   # tentatives max
LOGIN_WINDOW_SEC   = 60  # par fenêtre de 60 secondes


def _check_rate_limit(ip: str) -> bool:
    """Retourne True si l'IP est limitée (trop de tentatives)."""
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW_SEC]
    _login_attempts[ip] = attempts
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        return True
    _login_attempts[ip].append(now)
    return False


def _get_client_ip():
    """Récupère l'adresse IP réelle du client, en prenant en compte les proxys."""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip.strip()
    return request.remote_addr or "127.0.0.1"



def _get_pg_conn():
    """Retourne une connexion PostgreSQL."""
    return psycopg2.connect(DATABASE_URL)


def _ensure_pg_table(conn):
    """Crée la table si elle n'existe pas encore."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS polyboquette_db (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data TEXT NOT NULL
            )
        """)
    conn.commit()


def _migrate(db):
    """Applique les migrations sur une DB chargée."""
    if "categories" not in db:
        db["categories"] = []
    if "proposals" not in db:
        db["proposals"] = []
    if "admin_grants_log" not in db:
        db["admin_grants_log"] = []
    if "name_change_requests" not in db:
        db["name_change_requests"] = []
    if "admin_login_log" not in db:
        db["admin_login_log"] = []
    if "admin_audit_log" not in db:
        db["admin_audit_log"] = []
    if "password_reset_requests" not in db:
        db["password_reset_requests"] = []
    # Migration : supprimer le compte admin hardcodé avec password en clair
    admin_hardcoded = db["users"].get("admin")
    if admin_hardcoded and admin_hardcoded.get("password") == "admin123":
        del db["users"]["admin"]
        print("[MIGRATION] Compte admin hardcodé supprimé. Définissez ADMIN_PASSWORD pour créer un compte admin.")
    for u in db["users"].values():
        if "transactions" not in u:
            u["transactions"] = []
        if "pinnedMarkets" not in u:
            u["pinnedMarkets"] = []
        # Migration mots de passe en clair → hash werkzeug
        pwd = u.get("password", "")
        if pwd and not pwd.startswith(("pbkdf2:", "scrypt:", "argon2:")):
            u["password"] = generate_password_hash(pwd)
        # Champ session_token pour la révocation
        if "session_token" not in u:
            u["session_token"] = None
        # Champ email
        if "email" not in u:
            u["email"] = ""
        # Initialiser superAdmin à False pour tous les non-admins
        if u.get("role") != "admin" and "superAdmin" not in u:
            u["superAdmin"] = False
    for m in db.get("markets", []):
        if "comments" not in m:
            m["comments"] = []
        if "pauseAt" not in m:
            m["pauseAt"] = None
        if "categoryId" not in m:
            m["categoryId"] = None
        if "order" not in m:
            m["order"] = 0
    # Migration superAdmin : si aucun admin n'a le flag, le promouvoir automatiquement.
    # Fonctionne indépendamment de ADMIN_PASSWORD — s'applique dès le premier load_db().
    admin_users = [u for u in db["users"].values() if u.get("role") == "admin"]
    if admin_users and not any(u.get("superAdmin") for u in admin_users):
        admin_users[0]["superAdmin"] = True
        print(f"[MIGRATION] Flag superAdmin attribué à '{admin_users[0].get('name', '?')}'.")
    return db


def _ensure_admin(db):
    """
    Crée (ou met à jour) le compte admin depuis les variables d'environnement.
    ADMIN_USERNAME  (défaut: "admin")
    ADMIN_PASSWORD  (OBLIGATOIRE — aucun compte créé si absent)
    ADMIN_NAME      (défaut: "ADMIN")
    """
    raw_pwd = os.environ.get("ADMIN_PASSWORD", "").strip()
    if not raw_pwd:
        return  # Pas de variable définie → pas de compte auto-créé
    username = os.environ.get("ADMIN_USERNAME", "admin").strip()
    display  = os.environ.get("ADMIN_NAME",     "ADMIN").strip()
    # Chercher un compte admin existant
    existing = next((u for u in db["users"].values() if u.get("role") == "admin"), None)
    if existing:
        # Mettre à jour le mot de passe si ADMIN_PASSWORD a changé
        if not check_password_hash(existing["password"], raw_pwd):
            existing["password"] = generate_password_hash(raw_pwd)
            print("[ADMIN] Mot de passe admin mis à jour.")
        # S'assurer que le flag superAdmin est présent (migration des comptes créés avant ce flag)
        if not existing.get("superAdmin"):
            existing["superAdmin"] = True
            print("[ADMIN] Flag superAdmin ajouté au compte admin existant.")
        return
    # Créer le compte admin
    admin_id = "a" + secrets.token_hex(8)
    db["users"][admin_id] = {
        "id": admin_id,
        "username": username,
        "password": generate_password_hash(raw_pwd),
        "name": display,
        "role": "admin",
        "superAdmin": True,   # seul ce compte peut kicker et gérer les rôles
        "status": "active",
        "points": 1000,
        "buque": "", "nums": "", "proms": "",
        "transactions": [],
        "pinnedMarkets": [],
        "session_token": None
    }
    print(f"[ADMIN] Compte super-admin '{username}' créé.")


def load_db():
    if USE_PG:
        try:
            conn = _get_pg_conn()
            _ensure_pg_table(conn)
            with conn.cursor() as cur:
                cur.execute("SELECT data FROM polyboquette_db WHERE id = 1")
                row = cur.fetchone()
            conn.close()
            if row:
                db = _migrate(json.loads(row[0]))
                _ensure_admin(db)
                save_db(db)
                return db
            # Première utilisation : initialiser avec DEFAULT_DB
            db = copy.deepcopy(DEFAULT_DB)
            _ensure_admin(db)
            save_db(db)
            return db
        except Exception as e:
            print(f"[PG] Erreur load_db: {e}")
            return copy.deepcopy(DEFAULT_DB)
    else:
        # Mode local : fichier JSON
        os.makedirs(DATA_DIR, exist_ok=True)
        if not os.path.exists(DB_PATH):
            db = copy.deepcopy(DEFAULT_DB)
            save_db(db)
            return db
        with open(DB_PATH, "r", encoding="utf-8") as f:
            db = json.load(f)
        db = _migrate(db)
        _ensure_admin(db)
        save_db(db)
        return db


def save_db(db):
    if USE_PG:
        try:
            conn = _get_pg_conn()
            _ensure_pg_table(conn)
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO polyboquette_db (id, data)
                    VALUES (1, %s)
                    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
                """, (json.dumps(db, ensure_ascii=False),))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[PG] Erreur save_db: {e}")
    else:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)


def _log_admin_action(db, action_type, details, market_id=None, market_title=None):
    """Journalise une action administrative dans la DB."""
    admin_id = session.get("user_id", "system")
    admin_name = "Système"
    if admin_id in db.get("users", {}):
        admin_name = db["users"][admin_id]["name"]
    
    entry = {
        "time": datetime.now(timezone.utc).isoformat(),
        "adminId": admin_id,
        "adminName": admin_name,
        "type": action_type,
        "details": details,
        "marketId": market_id,
        "marketTitle": market_title
    }
    
    if "admin_audit_log" not in db:
        db["admin_audit_log"] = []
    db["admin_audit_log"].insert(0, entry)
    db["admin_audit_log"] = db["admin_audit_log"][:2000]


# ──────────────────────────────────────────────────────────────────────────────
# DECORATEURS AUTH
# ──────────────────────────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Non authentifié"}), 401
        # Vérification du session_token (permet la révocation via kick)
        db = load_db()
        user = db["users"].get(session["user_id"])
        if not user:
            session.clear()
            return jsonify({"error": "Non authentifié"}), 401
        stored_token = user.get("session_token")
        if stored_token and session.get("token") != stored_token:
            session.clear()
            return jsonify({"error": "Session expirée — veuillez vous reconnecter"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Non authentifié"}), 401
        db = load_db()
        user = db["users"].get(session["user_id"])
        if not user or user.get("role") != "admin":
            return jsonify({"error": "Accès refusé"}), 403
        # Vérification du session_token
        stored_token = user.get("session_token")
        if stored_token and session.get("token") != stored_token:
            session.clear()
            return jsonify({"error": "Session expirée — veuillez vous reconnecter"}), 401
        return f(*args, **kwargs)
    return decorated


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS METIER
# ──────────────────────────────────────────────────────────────────────────────
def compute_probs(market, exclude_bet=None):
    """Calcule les probabilités proportionnelles aux vraies mises (hors liquidité initiale)."""
    # Utilise les shares UNIQUEMENT issus des mises réelles
    total = sum(o["shares"] for o in market["options"])
    if exclude_bet:
        total -= exclude_bet["amount"]
    if total <= 0:
        # Aucune mise : égalité parfaite
        n = len(market["options"])
        return {o["id"]: round(100 / n) for o in market["options"]}
    result = {}
    for o in market["options"]:
        adj = o["shares"]
        if exclude_bet and o["id"] == exclude_bet["optId"]:
            adj = max(0, adj - exclude_bet["amount"])
        result[o["id"]] = round((adj / total) * 100)
    return result


def safe_user(user):
    """Retourne un dict user sans le mot de passe."""
    u = dict(user)
    u.pop("password", None)
    return u


def add_tx(user, desc, amount):
    if "transactions" not in user:
        user["transactions"] = []
    user["transactions"].insert(0, {
        "time": datetime.now(timezone.utc).isoformat(),
        "desc": desc,
        "amount": amount
    })
    # Garder seulement les 50 dernières
    user["transactions"] = user["transactions"][:50]


def is_market_open(market):
    if market.get("status") != "open":
        return False
    pause_at = market.get("pauseAt")
    if pause_at:
        now = datetime.now(timezone.utc).isoformat()
        # Handle JS ISO string format mapping
        if pause_at.endswith('Z'):
            pause_at = pause_at[:-1] + '+00:00'
        if now >= pause_at:
            return False
    return True


# ──────────────────────────────────────────────────────────────────────────────
# ROUTES – FRONTEND (SPA)
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/css/<path:filename>")
def css(filename):
    return send_from_directory(os.path.join(BASE_DIR, "css"), filename)

@app.route("/js/<path:filename>")
def js(filename):
    return send_from_directory(os.path.join(BASE_DIR, "js"), filename)

@app.route("/<path:filename>")
def root_static(filename):
    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.svg', '.gif', '.ico')):
        return send_from_directory(BASE_DIR, filename)
    abort(404)


# ──────────────────────────────────────────────────────────────────────────────
# AUTH
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        return jsonify({"user": None})
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": safe_user(user)})


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    # Rate limiting anti brute-force
    ip = _get_client_ip()
    if _check_rate_limit(ip):
        return jsonify({"error": "Trop de tentatives. Réessayez dans une minute."}), 429

    data = request.get_json()
    db = load_db()
    user = next(
        (u for u in db["users"].values() if u["username"] == data.get("username")),
        None
    )
    # check_password_hash est résistant aux timing attacks
    if not user or not check_password_hash(user.get("password", ""), data.get("password", "")):
        return jsonify({"error": "Identifiants incorrects"}), 401
    if user["status"] == "pending":
        return jsonify({"error": "Compte en attente de validation admin"}), 403
    if user["status"] == "rejected":
        return jsonify({"error": "Compte rejeté par l'admin"}), 403
    # Générer un session token unique et le stocker en DB
    token = secrets.token_hex(32)
    user["session_token"] = token
    # Journaliser les connexions du super-admin
    if user.get("superAdmin"):
        ip      = _get_client_ip()
        ua      = request.headers.get("User-Agent", "inconnu")[:200]
        db["admin_login_log"].insert(0, {
            "time":      datetime.now(timezone.utc).isoformat(),
            "userId":    user["id"],
            "userName":  user["name"],
            "ip":        ip,
            "userAgent": ua
        })
        db["admin_login_log"] = db["admin_login_log"][:100]  # garder 100 entrées max
    save_db(db)
    session["user_id"] = user["id"]
    session["token"]   = token
    return jsonify({"user": safe_user(user)})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip()
    if not username or not password or not name:
        return jsonify({"error": "Nom, identifiant et mot de passe requis"}), 400
    if len(password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400
    db = load_db()
    if any(u["username"] == username for u in db["users"].values()):
        return jsonify({"error": "Cet identifiant est déjà pris"}), 409
    
    if email and any(u.get("email") == email for u in db["users"].values()):
        return jsonify({"error": "Cette adresse e-mail est déjà utilisée"}), 409

    new_id = "u" + secrets.token_hex(6)
    db["users"][new_id] = {
        "id": new_id, "username": username,
        "password": generate_password_hash(password),
        "name": name, "email": email, "role": "user", "status": "pending", "points": 100,
        "buque": data.get("buque", ""),
        "nums":  data.get("nums",  ""),
        "proms": data.get("proms", ""),
        "transactions": [],
        "session_token": None
    }
    save_db(db)
    return jsonify({"ok": True}), 201


@app.route("/api/auth/change-password", methods=["POST"])
@login_required
def auth_change_password():
    data = request.get_json()
    old_pass = data.get("oldPassword", "").strip()
    new_pass = data.get("newPassword", "").strip()
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    if not check_password_hash(user["password"], old_pass):
        return jsonify({"error": "Ancien mot de passe incorrect"}), 400
    if len(new_pass) < 6:
        return jsonify({"error": "Le nouveau mot de passe est trop court (6 caractères min.)"}), 400
    user["password"] = generate_password_hash(new_pass)
    # Renouveler le session token (révoque les autres appareils)
    new_token = secrets.token_hex(32)
    user["session_token"] = new_token
    session["token"] = new_token
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/auth/change-email", methods=["POST"])
@login_required
def auth_change_email():
    data = request.get_json()
    password = data.get("password", "").strip()
    new_email = data.get("newEmail", "").strip()
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    if not check_password_hash(user["password"], password):
        return jsonify({"error": "Mot de passe incorrect"}), 400
    if new_email and any(u.get("email") == new_email and u["id"] != user["id"] for u in db["users"].values()):
        return jsonify({"error": "Cette adresse e-mail est déjà utilisée par un autre compte"}), 409
    
    user["email"] = new_email
    save_db(db)
    return jsonify({"ok": True, "user": safe_user(user)})


@app.route("/api/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    data = request.get_json()
    username = data.get("username", "").strip()
    if not username:
        return jsonify({"error": "Nom d'utilisateur requis"}), 400
    
    db = load_db()
    user = next((u for u in db["users"].values() if u["username"] == username), None)
    if user:
        req_id = "pr" + secrets.token_hex(6)
        if "password_reset_requests" not in db:
            db["password_reset_requests"] = []
        
        existing = next((r for r in db["password_reset_requests"] if r["userId"] == user["id"]), None)
        if not existing:
            db["password_reset_requests"].append({
                "id": req_id,
                "userId": user["id"],
                "userName": user["name"],
                "username": user["username"],
                "time": datetime.now(timezone.utc).isoformat()
            })
            save_db(db)
            
    return jsonify({"ok": True})


@app.route("/api/admin/password-resets", methods=["GET"])
@admin_required
def get_password_resets():
    db = load_db()
    return jsonify(db.get("password_reset_requests", []))


@app.route("/api/admin/password-resets/<req_id>/approve", methods=["POST"])
@admin_required
def approve_password_reset(req_id):
    data = request.get_json()
    new_password = data.get("newPassword", "").strip()
    if len(new_password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400
        
    db = load_db()
    reqs = db.get("password_reset_requests", [])
    req = next((r for r in reqs if r["id"] == req_id), None)
    if not req:
        return jsonify({"error": "Requête introuvable"}), 404
        
    user = db["users"].get(req["userId"])
    if user:
        user["password"] = generate_password_hash(new_password)
        user["session_token"] = secrets.token_hex(32)
        
    db["password_reset_requests"] = [r for r in reqs if r["id"] != req_id]
    save_db(db)
    
    return jsonify({"ok": True})


# ──────────────────────────────────────────────────────────────────────────────
# CLASSEMENT & BONUS QUOTIDIEN
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/leaderboard")
def get_leaderboard():
    db = load_db()
    active = [u for u in db["users"].values() if u.get("status") == "active"]
    # Le classement ne concerne que les points non investis
    def free_points(u):
        return max(0, int(u.get("points", 0)))
    ranked = sorted(active, key=lambda u: free_points(u), reverse=True)[:20]
    return jsonify([{"id": u["id"], "name": u["name"], "points": free_points(u)} for u in ranked])


@app.route("/api/auth/daily-claim", methods=["POST"])
@login_required
def daily_claim():
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if user.get("lastClaim") == today:
        return jsonify({"error": "Bonus déjà récupéré aujourd'hui"}), 400
    user["lastClaim"] = today
    user["points"] += 5
    add_tx(user, "Bonus quotidien", 5)
    save_db(db)
    return jsonify({"ok": True, "user": safe_user(user)})


# ──────────────────────────────────────────────────────────────────────────────
# MARCHÉS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/markets")
@login_required
def get_markets():
    db = load_db()
    return jsonify(db["markets"])


@app.route("/api/categories")
@login_required
def get_categories():
    db = load_db()
    return jsonify(db.get("categories", []))


@app.route("/api/markets/<market_id>")
@login_required
def get_market(market_id):
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Introuvable"}), 404
    return jsonify(m)


@app.route("/api/markets/<market_id>/bet", methods=["POST"])
@login_required
def place_bet(market_id):
    data = request.get_json()
    opt_id = data.get("optId")
    amount = data.get("amount", 0)
    db = load_db()

    user = db["users"].get(session["user_id"])
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Marché introuvable"}), 404
    if not is_market_open(m):
        return jsonify({"error": "Ce marché n'accepte plus de transactions (fermé ou en pause)"}), 400
    if not isinstance(amount, int) or amount <= 0:
        return jsonify({"error": "Montant invalide"}), 400
    if user["points"] < amount:
        return jsonify({"error": "Solde insuffisant"}), 400
    opt = next((o for o in m["options"] if o["id"] == opt_id), None)
    if not opt:
        return jsonify({"error": "Option invalide"}), 400

    user["points"] -= amount
    m["volume"] += amount
    opt["shares"] += amount

    probs = compute_probs(m)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Agrégation : fusionner avec une position existante (même user, même option)
    existing = next((b for b in m["bets"] if b["userId"] == user["id"] and b["optId"] == opt_id), None)
    if existing:
        old_amount = existing["amount"]
        new_total = old_amount + amount
        # Moyenne pondérée du prix d'achat
        existing["buyProb"] = round((existing["buyProb"] * old_amount + probs[opt_id] * amount) / new_total)
        existing["amount"] = new_total
        existing["time"] = now_iso
    else:
        bet = {
            "id": "b" + secrets.token_hex(8),
            "userId": user["id"],
            "optId": opt_id,
            "amount": amount,
            "buyProb": probs[opt_id],
            "time": now_iso
        }
        m["bets"].append(bet)

    hist = {"time": now_iso, **probs}
    m["history"].append(hist)

    m.setdefault("actionLog", []).append({
        "time": now_iso,
        "userId": user["id"],
        "userName": user["name"],
        "type": "bet",
        "amount": amount,
        "optId": opt_id,
        "optLabel": opt["label"]
    })

    add_tx(user, f"Mise dans '{m['title']}' ({opt['label']})", -amount)

    save_db(db)
    return jsonify({"user": safe_user(user), "market": m})


@app.route("/api/markets/<market_id>/cashout/<bet_id>", methods=["POST"])
@login_required
def cashout_bet(market_id, bet_id):
    data = request.get_json() or {}
    db = load_db()
    user = db["users"].get(session["user_id"])
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m or not is_market_open(m):
        return jsonify({"error": "Revente impossible (marché fermé ou en pause)"}), 400
    bet_idx = next((i for i, b in enumerate(m["bets"]) if b["id"] == bet_id), None)
    if bet_idx is None:
        return jsonify({"error": "Pari introuvable"}), 404
    bet = m["bets"][bet_idx]
    if bet["userId"] != user["id"]:
        return jsonify({"error": "Pas votre pari"}), 403

    # Revente partielle : montant optionnel, défaut = tout
    requested = data.get("amount", bet["amount"])
    if not isinstance(requested, int) or requested <= 0:
        requested = bet["amount"]
    partial_amount = min(requested, bet["amount"])

    # Calcul du remboursement proportionnel
    partial_bet_proxy = {"amount": partial_amount, "optId": bet["optId"]}
    adj_probs = compute_probs(m, exclude_bet=partial_bet_proxy)
    current_prob = adj_probs.get(bet["optId"], 1)
    raw_value = partial_amount * (current_prob / (bet["buyProb"] or 1))
    refund = max(1, int(raw_value * 0.97))

    user["points"] += refund
    m["volume"] = max(0, m["volume"] - partial_amount)
    opt = next(o for o in m["options"] if o["id"] == bet["optId"])
    opt["shares"] = max(0, opt["shares"] - partial_amount)

    now_iso = datetime.now(timezone.utc).isoformat()
    new_probs = compute_probs(m)
    m["history"].append({"time": now_iso, **new_probs})

    original_bet_amount = bet["amount"]
    if partial_amount >= original_bet_amount:
        m["bets"].pop(bet_idx)
    else:
        bet["amount"] -= partial_amount

    m.setdefault("actionLog", []).append({
        "time": now_iso,
        "userId": user["id"],
        "userName": user["name"],
        "type": "cashout",
        "amount": partial_amount,
        "cashoutVal": refund,
        "optId": bet["optId"],
        "optLabel": opt["label"]
    })

    add_tx(user, f"Revente {('(partielle) ' if partial_amount < original_bet_amount else '')}'{m['title']}' ({opt['label']})", refund)

    save_db(db)
    return jsonify({"user": safe_user(user), "market": m, "refund": refund})


@app.route("/api/markets/<market_id>/comments", methods=["POST"])
@login_required
def post_comment(market_id):
    data = request.get_json()
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Commentaire vide"}), 400
        
    db = load_db()
    user = db["users"].get(session["user_id"])
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Marché introuvable"}), 404
        
    if "comments" not in m:
        m["comments"] = []
        
    comment = {
        "id": "c" + secrets.token_hex(6),
        "userId": user["id"],
        "userName": user["name"],
        "text": text,
        "time": datetime.now(timezone.utc).isoformat()
    }
    m["comments"].append(comment)
    save_db(db)
    return jsonify({"ok": True, "comment": comment})


# ──────────────────────────────────────────────────────────────────────────────
# PROPOSITIONS DE PARIS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/proposals", methods=["GET"])
@login_required
def get_proposals():
    db = load_db()
    user = db["users"].get(session["user_id"])
    if user["role"] == "admin":
        # L'admin voit tout
        return jsonify(db["proposals"])
    else:
        # Un user voit seulement ses propres propositions
        my = [p for p in db["proposals"] if p["authorId"] == user["id"]]
        return jsonify(my)


@app.route("/api/proposals", methods=["POST"])
@login_required
def submit_proposal():
    data = request.get_json()
    title   = (data.get("title") or "").strip()
    choices = data.get("choices", [])
    image   = (data.get("image") or "").strip()
    db = load_db()
    user = db["users"].get(session["user_id"])

    if not title:
        return jsonify({"error": "Le titre est requis"}), 400
    if len(choices) < 2:
        return jsonify({"error": "Au moins 2 choix requis"}), 400

    proposal = {
        "id": "p" + secrets.token_hex(6),
        "authorId":   user["id"],
        "authorName": user["name"],
        "title":      title,
        "choices":    [c.strip() for c in choices if c.strip()],
        "image":      image,
        "status":     "pending",   # pending | approved | rejected
        "adminNote":  "",
        "createdAt":  datetime.now(timezone.utc).isoformat()
    }
    db["proposals"].append(proposal)
    save_db(db)
    return jsonify(proposal), 201


@app.route("/api/proposals/<proposal_id>/approve", methods=["POST"])
@admin_required
def approve_proposal(proposal_id):
    db = load_db()
    p = next((p for p in db["proposals"] if p["id"] == proposal_id), None)
    if not p:
        return jsonify({"error": "Proposition introuvable"}), 404

    # Créer le marché depuis la proposition
    choices = p["choices"]
    options = [
        {"id": f"o{i+1}", "label": c, "shares": 0, "color": PALETTE[i % len(PALETTE)]}
        for i, c in enumerate(choices)
    ]
    init_probs = {o["id"]: round(100 / len(options)) for o in options}
    new_market = {
        "id": "m" + secrets.token_hex(6),
        "title": p["title"],
        "image": p["image"] or "https://images.unsplash.com/photo-1550565118-3a14e8d0386f?auto=format&fit=crop&w=150&q=80",
        "volume": 0,
        "status": "open",
        "resolvedWinner": None,
        "bets": [],
        "options": options,
        "history": [{"time": "Début", **init_probs}],
        "proposedBy": p["authorId"]
    }
    db["markets"].append(new_market)
    p["status"] = "approved"
    _log_admin_action(db, "approve_proposal", f"Approbation de la proposition '{p['title']}'", market_id=new_market["id"], market_title=p["title"])
    save_db(db)
    return jsonify({"ok": True, "market": new_market})


@app.route("/api/proposals/<proposal_id>/reject", methods=["POST"])
@admin_required
def reject_proposal(proposal_id):
    data = request.get_json() or {}
    db = load_db()
    p = next((p for p in db["proposals"] if p["id"] == proposal_id), None)
    if not p:
        return jsonify({"error": "Proposition introuvable"}), 404
    p["status"] = "rejected"
    p["adminNote"] = data.get("note", "").strip()
    note_suffix = f" (motif : {p['adminNote']})" if p["adminNote"] else ""
    _log_admin_action(db, "reject_proposal", f"Rejet de la proposition '{p['title']}'{note_suffix}")
    save_db(db)
    return jsonify({"ok": True})


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN – UTILISATEURS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/users")
@admin_required
def admin_get_users():
    db = load_db()
    return jsonify([safe_user(u) for u in db["users"].values()])


@app.route("/api/admin/users/<user_id>/approve", methods=["POST"])
@admin_required
def admin_approve_user(user_id):
    db = load_db()
    if user_id not in db["users"]:
        return jsonify({"error": "Introuvable"}), 404
    db["users"][user_id]["status"] = "active"
    _log_admin_action(db, "approve_user", f"Approbation de l'inscription de {db['users'][user_id]['name']} (@{db['users'][user_id]['username']})")
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/reject", methods=["POST"])
@admin_required
def admin_reject_user(user_id):
    db = load_db()
    if user_id not in db["users"]:
        return jsonify({"error": "Introuvable"}), 404
    db["users"][user_id]["status"] = "rejected"
    _log_admin_action(db, "reject_user", f"Rejet de l'inscription de {db['users'][user_id]['name']} (@{db['users'][user_id]['username']})")
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/toggle-role", methods=["POST"])
@admin_required
def admin_toggle_role(user_id):
    db = load_db()
    me = db["users"].get(session["user_id"])
    target = db["users"].get(user_id)
    if not target:
        return jsonify({"error": "Introuvable"}), 404
    # Seul le super-admin peut modifier les rôles
    if not me or not me.get("superAdmin"):
        return jsonify({"error": "Réservé au super-admin"}), 403
    # On ne peut pas modifier son propre rôle
    if user_id == session["user_id"]:
        return jsonify({"error": "Impossible de modifier son propre rôle"}), 400
    # Empêcher de rétrograder le seul admin restant
    nb_admins = sum(1 for u in db["users"].values() if u.get("role") == "admin")
    if target.get("role") == "admin" and nb_admins <= 1:
        return jsonify({"error": "Impossible de rétrograder le seul administrateur restant"}), 400
    target["role"] = "admin" if target.get("role") != "admin" else "user"
    role_str = "ADMIN" if target["role"] == "admin" else "UTILISATEUR"
    _log_admin_action(db, "toggle_role", f"Changement du rôle de {target['name']} (@{target['username']}) en {role_str}")
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/grant", methods=["POST"])
@admin_required
def admin_grant_points(user_id):
    data = request.get_json()
    amount = data.get("amount", 0)
    db = load_db()
    if user_id not in db["users"]:
        return jsonify({"error": "Introuvable"}), 404
    if not isinstance(amount, int) or amount == 0:
        return jsonify({"error": "Montant invalide (ne peut pas être zéro)"}), 400
    admin_user = db["users"].get(session["user_id"])
    user = db["users"][user_id]
    user["points"] = max(0, user["points"] + amount)
    desc = f"Crédit admin : +{amount} pts" if amount > 0 else f"Débit admin : {amount} pts"
    add_tx(user, desc, amount)
    # Journaliser dans admin_grants_log
    db["admin_grants_log"].insert(0, {
        "time": datetime.now(timezone.utc).isoformat(),
        "adminId": admin_user["id"],
        "adminName": admin_user["name"],
        "targetId": user["id"],
        "targetName": user["name"],
        "amount": amount
    })
    db["admin_grants_log"] = db["admin_grants_log"][:200]
    action_desc = f"Attribution de {amount} pts à {user['name']} (@{user['username']})"
    _log_admin_action(db, "grant", action_desc)
    save_db(db)
    return jsonify({"ok": True, "points": user["points"]})


@app.route("/api/admin/users/<user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    db = load_db()
    target = db["users"].get(user_id)
    if not target:
        return jsonify({"error": "Introuvable"}), 404
    if target.get("role") == "admin":
        return jsonify({"error": "Impossible de supprimer un compte administrateur"}), 400
    _log_admin_action(db, "delete_user", f"Suppression définitive du compte de {target['name']} (@{target['username']})")
    del db["users"][user_id]
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/users/<user_id>/kick", methods=["POST"])
@admin_required
def admin_kick_user(user_id):
    """Déconnecte un utilisateur de tous ses appareils — réservé au super-admin."""
    db = load_db()
    me = db["users"].get(session["user_id"])
    if not me or not me.get("superAdmin"):
        return jsonify({"error": "Réservé au super-admin"}), 403
    target = db["users"].get(user_id)
    if not target:
        return jsonify({"error": "Introuvable"}), 404
    # Générer un nouveau token aléatoire : toutes les sessions existantes
    # ont l'ancien token → elles seront immédiatement rejetées.
    # (mettre None ne fonctionne pas car 'if stored_token' serait False)
    target["session_token"] = secrets.token_hex(32)
    _log_admin_action(db, "kick_user", f"Déconnexion forcée de {target['name']} (@{target['username']})")
    save_db(db)
    return jsonify({"ok": True, "message": f"'{target['name']}' déconnecté(e) de tous les appareils."})


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN – MARCHÉS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/markets/<market_id>/rename", methods=["POST"])
@admin_required
def admin_rename_market(market_id):
    data = request.get_json()
    new_title = (data.get("title") or "").strip()
    if not new_title:
        return jsonify({"error": "Le titre ne peut pas être vide"}), 400
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Introuvable"}), 404
    old_title = m["title"]
    m["title"] = new_title
    _log_admin_action(db, "rename_market", f"Renommé le marché '{old_title}' en '{new_title}'", market_id=market_id, market_title=new_title)
    save_db(db)
    return jsonify({"ok": True, "title": new_title})


@app.route("/api/admin/markets", methods=["POST"])
@admin_required
def admin_create_market():
    data = request.get_json()
    title   = (data.get("title") or "").strip()
    choices = data.get("choices", [])
    image   = (data.get("image") or "").strip()
    category_id = data.get("categoryId")
    db = load_db()

    if not title or len(choices) < 2:
        return jsonify({"error": "Titre et 2+ choix requis"}), 400

    options = [
        {"id": f"o{i+1}", "label": c.strip(), "shares": 0, "color": PALETTE[i % len(PALETTE)]}
        for i, c in enumerate(choices)
    ]
    n = len(options)
    init_prob = round(100 / n)
    init_probs = {o["id"]: init_prob for o in options}
    new_market = {
        "id": "m" + secrets.token_hex(6),
        "title": title,
        "image": image or "https://images.unsplash.com/photo-1550565118-3a14e8d0386f?auto=format&fit=crop&w=150&q=80",
        "volume": 0, "status": "open", "resolvedWinner": None,
        "bets": [], "options": options,
        "categoryId": category_id,
        "order": 999,
        "history": [{"time": "Début", **init_probs}]
    }
    db["markets"].append(new_market)
    _log_admin_action(db, "create_market", f"Création du marché '{title}'", market_id=new_market["id"], market_title=title)
    save_db(db)
    return jsonify(new_market), 201


@app.route("/api/admin/markets/<market_id>/toggle-pause", methods=["POST"])
@admin_required
def admin_toggle_pause(market_id):
    data = request.get_json() or {}
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Introuvable"}), 404
        
    if m["status"] == "open":
        pause_at = data.get("pauseAt")
        if pause_at == "now":
            m["status"] = "paused"
            m["pauseAt"] = None
        else:
            m["pauseAt"] = pause_at # ISO string future date
    else:
        m["status"] = "open"
        m["pauseAt"] = None
        
    action_str = "Mise en pause" if m["status"] == "paused" else ("Planification d'une pause" if m["pauseAt"] else "Réactivation")
    _log_admin_action(db, "toggle_pause", f"{action_str} du marché '{m['title']}'", market_id=market_id, market_title=m["title"])
    save_db(db)
    return jsonify({"status": m["status"], "pauseAt": m.get("pauseAt")})


@app.route("/api/admin/markets/<market_id>/resolve", methods=["POST"])
@admin_required
def admin_resolve_market(market_id):
    data = request.get_json()
    winner_id = data.get("winnerId")
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Introuvable"}), 404

    m["status"] = "resolved"
    m["resolvedWinner"] = winner_id

    # Pool réel = somme des VRAIES mises (hors liquidité initiale fictive)
    real_total_pool = sum(b["amount"] for b in m["bets"])

    if winner_id == "cancelled":
        res_str = "annulé"
        for b in m["bets"]:
            if b["userId"] in db["users"]:
                db["users"][b["userId"]]["points"] += b["amount"]
                add_tx(db["users"][b["userId"]], f"Remboursement annulation '{m['title']}'", b["amount"])
    else:
        winning_opt = next((o for o in m["options"] if o["id"] == winner_id), None)
        if winning_opt:
            res_str = f"résolu (option '{winning_opt['label']}')"
            real_winning_pool = sum(b["amount"] for b in m["bets"] if b["optId"] == winner_id)

            if real_winning_pool == 0:
                # Personne n'a misé sur le gagnant → remboursement intégral de tous
                for b in m["bets"]:
                    if b["userId"] in db["users"]:
                        db["users"][b["userId"]]["points"] += b["amount"]
                        add_tx(db["users"][b["userId"]], f"Remboursement (aucun gagnant) '{m['title']}'", b["amount"])
            else:
                # Pari Mutuel pur sur les vraies mises :
                # Chaque gagnant reçoit sa part proportionnelle du VRAI pool total
                for b in m["bets"]:
                    if b["userId"] in db["users"]:
                        if b["optId"] == winner_id:
                            share_pct = b["amount"] / real_winning_pool
                            payout = max(0, int(share_pct * real_total_pool))
                            db["users"][b["userId"]]["points"] += payout
                            add_tx(db["users"][b["userId"]], f"Gain '{m['title']}'", payout)
                        else:
                            add_tx(db["users"][b["userId"]], f"Pari perdu '{m['title']}'", 0)
        else:
            res_str = f"résolu (option {winner_id})"

    _log_admin_action(db, "resolve_market", f"Clôture du marché : {res_str}", market_id=market_id, market_title=m["title"])
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/markets/<market_id>", methods=["DELETE"])
@admin_required
def admin_delete_market(market_id):
    db = load_db()
    idx = next((i for i, m in enumerate(db["markets"]) if m["id"] == market_id), None)
    if idx is None:
        return jsonify({"error": "Introuvable"}), 404
    if db["markets"][idx]["status"] not in ["resolved", "cancelled"]:
        return jsonify({"error": "Seuls les marchés clôturés peuvent être supprimés"}), 400
    m = db["markets"][idx]
    _log_admin_action(db, "delete_market", f"Suppression définitive du marché '{m['title']}'", market_id=market_id, market_title=m["title"])
    db["markets"].pop(idx)
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/users/<user_id>/transactions")
@login_required
def get_user_transactions(user_id):
    db = load_db()
    me = db["users"].get(session["user_id"])
    # Un user ne peut voir que son propre historique ; les admins voient tout
    if me["id"] != user_id and me.get("role") != "admin":
        return jsonify({"error": "Accès refusé"}), 403
    target = db["users"].get(user_id)
    if not target:
        return jsonify({"error": "Utilisateur introuvable"}), 404
    return jsonify(target.get("transactions", []))


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN - CATÉGORIES & REORDERING
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/categories", methods=["GET", "POST"])
@admin_required
def admin_categories():
    db = load_db()
    if request.method == "GET":
        return jsonify(db.get("categories", []))
        
    # POST
    data = request.get_json()
    action = data.get("action")
    if action == "create":
        name = data.get("name", "").strip()
        if not name:
            return jsonify({"error": "Nom requis"}), 400
        new_cat = {
            "id": "cat_" + secrets.token_hex(4),
            "name": name,
            "order": len(db.get("categories", []))
        }
        if "categories" not in db:
            db["categories"] = []
        db["categories"].append(new_cat)
        _log_admin_action(db, "create_category", f"Création de la catégorie '{name}'")
        save_db(db)
        return jsonify({"ok": True, "category": new_cat})
    elif action == "delete":
        cat_id = data.get("id")
        cat_name = "Inconnue"
        cat_obj = next((c for c in db.get("categories", []) if c["id"] == cat_id), None)
        if cat_obj:
            cat_name = cat_obj["name"]
        db["categories"] = [c for c in db.get("categories", []) if c["id"] != cat_id]
        # Reset market categories that were in this category
        for m in db["markets"]:
            if m.get("categoryId") == cat_id:
                m["categoryId"] = None
        _log_admin_action(db, "delete_category", f"Suppression de la catégorie '{cat_name}'")
        save_db(db)
        return jsonify({"ok": True})
    return jsonify({"error": "Action inconnue"}), 400


@app.route("/api/admin/markets/reorder", methods=["POST"])
@admin_required
def admin_reorder_markets():
    data = request.get_json()
    categories = data.get("categories", []) # list of {id, order}
    markets = data.get("markets", []) # list of {id, categoryId, order}
    
    db = load_db()
    if "categories" not in db:
        db["categories"] = []
        
    # Update categories order
    for c_data in categories:
        c = next((c for c in db["categories"] if c["id"] == c_data["id"]), None)
        if c:
            c["order"] = c_data["order"]
            
    # Update markets category and order
    for m_data in markets:
        m = next((m for m in db["markets"] if m["id"] == m_data["id"]), None)
        if m:
            m["categoryId"] = m_data.get("categoryId")
            m["order"] = m_data.get("order", 0)
            
    _log_admin_action(db, "reorder", "Réorganisation des catégories et des marchés")
    save_db(db)
    return jsonify({"ok": True})


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN – JOURNAL DES CRÉDITS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/grants-log")
@admin_required
def admin_grants_log():
    """Journal des crédits, accessible à tous les admins."""
    db = load_db()
    return jsonify(db.get("admin_grants_log", []))


@app.route("/api/admin/login-log")
@admin_required
def admin_login_log():
    """Journal des connexions du super-admin — réservé au super-admin."""
    db = load_db()
    me = db["users"].get(session["user_id"])
    if not me or not me.get("superAdmin"):
        return jsonify({"error": "Réservé au super-admin"}), 403
    return jsonify(db.get("admin_login_log", []))


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN – JOURNAL D'ACTIVITÉ GLOBAL
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/activity-log")
@admin_required
def admin_activity_log():
    """
    Agrège tous les actionLog des marchés, admin_grants_log et admin_audit_log.
    """
    db = load_db()
    logs = []

    # Collecte des actions de marché (mises & retraits)
    for m in db.get("markets", []):
        for entry in m.get("actionLog", []):
            logs.append({
                "marketId":    m["id"],
                "marketTitle": m["title"],
                "type":        entry.get("type", "bet"),
                "time":        entry.get("time", ""),
                "userId":      entry.get("userId", ""),
                "userName":    entry.get("userName", ""),
                "amount":      entry.get("amount", 0),
                "cashoutVal":  entry.get("cashoutVal"),
                "optId":       entry.get("optId"),
                "optLabel":    entry.get("optLabel", ""),
            })

    # Collecte des crédits/débits admin
    for g in db.get("admin_grants_log", []):
        logs.append({
            "marketId":    None,
            "marketTitle": None,
            "type":        "grant",
            "time":        g.get("time", ""),
            "userId":      g.get("targetId", ""),
            "userName":    g.get("targetName", ""),
            "adminId":     g.get("adminId", ""),
            "adminName":   g.get("adminName", ""),
            "amount":      g.get("amount", 0),
        })

    # Collecte des actions d'administration globales
    for a in db.get("admin_audit_log", []):
        logs.append({
            "marketId":    a.get("marketId"),
            "marketTitle": a.get("marketTitle"),
            "type":        a.get("type", "admin_action"),
            "time":        a.get("time", ""),
            "userId":      None,
            "userName":    None,
            "adminId":     a.get("adminId", ""),
            "adminName":   a.get("adminName", ""),
            "details":     a.get("details", ""),
            "amount":      None,
        })

    # Tri décroissant par timestamp (ISO string → tri lexicographique correct)
    logs.sort(key=lambda x: x.get("time", ""), reverse=True)

    return jsonify(logs)


# ──────────────────────────────────────────────────────────────────────────────
# DEMANDES DE CHANGEMENT DE PSEUDONYME
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/profile/request-name-change", methods=["POST"])
@login_required
def request_name_change():
    data = request.get_json()
    new_name = (data.get("newName") or "").strip()
    if not new_name or len(new_name) < 2:
        return jsonify({"error": "Le pseudonyme doit faire au moins 2 caractères"}), 400
    db = load_db()
    user = db["users"].get(session["user_id"])
    # Vérifier qu'il n'y a pas déjà une demande en attente
    pending = next((r for r in db["name_change_requests"]
                    if r["userId"] == user["id"] and r["status"] == "pending"), None)
    if pending:
        return jsonify({"error": "Vous avez déjà une demande en attente"}), 400
    req = {
        "id": "nc" + secrets.token_hex(6),
        "userId": user["id"],
        "oldName": user["name"],
        "newName": new_name,
        "status": "pending",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    db["name_change_requests"].insert(0, req)
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/name-changes")
@admin_required
def admin_get_name_changes():
    db = load_db()
    return jsonify([r for r in db["name_change_requests"] if r["status"] == "pending"])


@app.route("/api/admin/name-change/<req_id>/approve", methods=["POST"])
@admin_required
def admin_approve_name_change(req_id):
    db = load_db()
    req = next((r for r in db["name_change_requests"] if r["id"] == req_id), None)
    if not req:
        return jsonify({"error": "Demande introuvable"}), 404
    user = db["users"].get(req["userId"])
    if user:
        user["name"] = req["newName"]
        add_tx(user, f"Pseudonyme changé en '{req['newName']}'", 0)
    req["status"] = "approved"
    _log_admin_action(db, "approve_name", f"Approbation du changement de pseudo de {req['oldName']} en '{req['newName']}'")
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/admin/name-change/<req_id>/reject", methods=["POST"])
@admin_required
def admin_reject_name_change(req_id):
    db = load_db()
    req = next((r for r in db["name_change_requests"] if r["id"] == req_id), None)
    if not req:
        return jsonify({"error": "Demande introuvable"}), 404
    req["status"] = "rejected"
    _log_admin_action(db, "reject_name", f"Rejet du changement de pseudo de {req['oldName']} en '{req['newName']}'")
    save_db(db)
    return jsonify({"ok": True})


@app.route("/api/users/pin-market", methods=["POST"])
@login_required
def toggle_pin_market():
    data = request.get_json()
    market_id = data.get("marketId")
    if not market_id:
        return jsonify({"error": "marketId requis"}), 400
    
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user:
        return jsonify({"error": "Utilisateur non trouvé"}), 404
    
    if "pinnedMarkets" not in user:
        user["pinnedMarkets"] = []
        
    if market_id in user["pinnedMarkets"]:
        user["pinnedMarkets"].remove(market_id)
        pinned = False
    else:
        user["pinnedMarkets"].append(market_id)
        pinned = True
        
    save_db(db)
    return jsonify({"user": safe_user(user), "pinned": pinned})


# ──────────────────────────────────────────────────────────────────────────────
# ENTRYPOINT
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    print(f"[OK] PolyBoquette demarre sur http://localhost:{port}")
    print(f"   DB : {DB_PATH}")
    app.run(host="0.0.0.0", port=port, debug=debug)
