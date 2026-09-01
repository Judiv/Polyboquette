"""
PolyBoquette - Backend Flask (API REST & SSE Temps Réel)
========================================================
Architecture :
- Persistance PostgreSQL (prod) ou data/db.json (local)
- Moteur AMM (Constant Product Market Maker)
- Portefeuille & Positions en temps réel (/api/users/portfolio)
- Suite d'Administration complète (Gestion des membres, modération, freeze, audit, logs)
- Auth Num's + Mot de passe
"""

import os
import io
import csv
import copy
import json
import re
import queue
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, abort, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(BASE_DIR, "data")
DB_PATH    = os.path.join(DATA_DIR, "db.json")

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_SAMESITE"] = "Strict"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("FLASK_ENV") == "production"

@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

PALETTE = ['#22c55e', '#ef4444', '#3b82f6', '#d946ef', '#f97316', '#eab308', '#06b6d4']

# ──────────────────────────────────────────────────────────────────────────────
# PERSISTANCE : PostgreSQL ou JSON local
# ──────────────────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_PG = PSYCOPG2_AVAILABLE and bool(DATABASE_URL)

DEFAULT_DB = {
    "version": 9,
    "users": {},
    "markets": [],
    "categories": [
        {"id": "cat_campus", "name": "Campus & École", "order": 0},
        {"id": "cat_sport", "name": "Sports & Tournois", "order": 1},
        {"id": "cat_asso", "name": "Vie Associative", "order": 2}
    ],
    "proposals": [],
    "admin_grants_log": [],
    "admin_login_log": [],
    "name_change_requests": [],
    "admin_audit_log": [],
    "password_reset_requests": []
}

_db_lock = threading.Lock()

# ──────────────────────────────────────────────────────────────────────────────
# SSE EVENT BROADCASTER
# ──────────────────────────────────────────────────────────────────────────────
_sse_clients = []
_sse_lock = threading.Lock()

def broadcast_sse(event_type, data):
    """Diffuse un message SSE à tous les clients connectés."""
    with _sse_lock:
        msg = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        dead_clients = []
        for q in _sse_clients:
            try:
                q.put_nowait(msg)
            except Exception:
                dead_clients.append(q)
        for d in dead_clients:
            _sse_clients.remove(d)

# ──────────────────────────────────────────────────────────────────────────────
# RATE LIMITING
# ──────────────────────────────────────────────────────────────────────────────
_login_attempts = defaultdict(list)
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SEC   = 60

def _check_rate_limit(ip: str) -> bool:
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW_SEC]
    _login_attempts[ip] = attempts
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        return True
    _login_attempts[ip].append(now)
    return False

def _get_client_ip():
    return request.remote_addr or "127.0.0.1"

# ──────────────────────────────────────────────────────────────────────────────
# DATABASE FUNCTIONS & MIGRATIONS
# ──────────────────────────────────────────────────────────────────────────────
def _get_pg_conn():
    return psycopg2.connect(DATABASE_URL)

def _ensure_pg_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS polyboquette_db (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data TEXT NOT NULL
            )
        """)
    conn.commit()

def _migrate(db):
    if "categories" not in db or len(db["categories"]) == 0:
        db["categories"] = copy.deepcopy(DEFAULT_DB["categories"])
    if "proposals" not in db: db["proposals"] = []
    if "admin_grants_log" not in db: db["admin_grants_log"] = []
    if "name_change_requests" not in db: db["name_change_requests"] = []
    if "admin_login_log" not in db: db["admin_login_log"] = []
    if "admin_audit_log" not in db: db["admin_audit_log"] = []
    if "password_reset_requests" not in db: db["password_reset_requests"] = []

    # Migration users
    for u in db["users"].values():
        if "transactions" not in u: u["transactions"] = []
        if "pinnedMarkets" not in u: u["pinnedMarkets"] = []
        if "session_token" not in u: u["session_token"] = None
        if "email" not in u: u["email"] = ""
        if "firstName" not in u: u["firstName"] = u.get("name", "").split(" ")[0] if " " in u.get("name", "") else u.get("name", "")
        if "lastName" not in u: u["lastName"] = " ".join(u.get("name", "").split(" ")[1:]) if " " in u.get("name", "") else ""
        if u.get("role") != "admin" and "superAdmin" not in u:
            u["superAdmin"] = False

    # Migration markets pour AMM
    for m in db.get("markets", []):
        if "comments" not in m: m["comments"] = []
        if "pauseAt" not in m: m["pauseAt"] = None
        if "categoryId" not in m: m["categoryId"] = None
        if "order" not in m: m["order"] = 0
        if "poolReserves" not in m:
            m["poolReserves"] = {o["id"]: max(50, o.get("shares", 100)) for o in m["options"]}

    return db

def _ensure_admin(db):
    raw_pwd = os.environ.get("ADMIN_PASSWORD", "").strip()
    if not raw_pwd:
        return
    username = os.environ.get("ADMIN_USERNAME", "admin").strip()
    display  = os.environ.get("ADMIN_NAME",     "ADMIN").strip()
    existing = next((u for u in db["users"].values() if u.get("role") == "admin"), None)
    if existing:
        if not check_password_hash(existing["password"], raw_pwd):
            existing["password"] = generate_password_hash(raw_pwd)
        existing["superAdmin"] = True
        return

    admin_id = "a" + secrets.token_hex(8)
    db["users"][admin_id] = {
        "id": admin_id,
        "username": username,
        "nums": "00-00",
        "firstName": "Admin",
        "lastName": "Système",
        "password": generate_password_hash(raw_pwd),
        "name": display,
        "role": "admin",
        "superAdmin": True,
        "status": "active",
        "points": 1000,
        "buque": "", "proms": "",
        "transactions": [],
        "pinnedMarkets": [],
        "session_token": None
    }

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
                return db
            db = copy.deepcopy(DEFAULT_DB)
            _ensure_admin(db)
            save_db(db)
            return db
        except Exception as e:
            print(f"[PG] Erreur load_db: {e}")
            return copy.deepcopy(DEFAULT_DB)
    else:
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
    db.setdefault("admin_audit_log", []).insert(0, entry)
    db["admin_audit_log"] = db["admin_audit_log"][:1000]

# ──────────────────────────────────────────────────────────────────────────────
# AUTH DECORATORS
# ──────────────────────────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Non authentifié"}), 401
        db = load_db()
        user = db["users"].get(session["user_id"])
        if not user or user.get("status") != "active":
            session.clear()
            return jsonify({"error": "Session invalide ou compte inactif"}), 401
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
            return jsonify({"error": "Accès réservé aux administrateurs"}), 403
        stored_token = user.get("session_token")
        if stored_token and session.get("token") != stored_token:
            session.clear()
            return jsonify({"error": "Session expirée"}), 401
        return f(*args, **kwargs)
    return decorated

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS METIER & AMM
# ──────────────────────────────────────────────────────────────────────────────
def safe_user(user):
    u = dict(user)
    u.pop("password", None)
    u.pop("session_token", None)
    return u

def add_tx(user, desc, amount):
    if "transactions" not in user:
        user["transactions"] = []
    user["transactions"].insert(0, {
        "time": datetime.now(timezone.utc).isoformat(),
        "desc": desc,
        "amount": amount
    })
    user["transactions"] = user["transactions"][:100]

def compute_probs(market):
    options = market.options if hasattr(market, 'options') else market.get("options", [])
    if not options: return {}

    reserves = market.get("poolReserves")
    if reserves:
        inverses = {opt["id"]: 1.0 / max(1, reserves.get(opt["id"], 100)) for opt in options}
        sum_inv = sum(inverses.values())
        if sum_inv > 0:
            probs = {}
            for opt in options:
                probs[opt["id"]] = max(1, min(99, round((inverses[opt["id"]] / sum_inv) * 100)))
            return probs

    # Fallback proportionnel
    total = sum(o.get("shares", 0) for o in options)
    if total <= 0:
        n = len(options)
        return {o["id"]: round(100 / n) for o in options}
    return {o["id"]: max(1, min(99, round((o.get("shares", 0) / total) * 100))) for o in options}

def is_market_open(market):
    if market.get("status") != "open":
        return False
    pause_at = market.get("pauseAt")
    if pause_at:
        now = datetime.now(timezone.utc).isoformat()
        if pause_at.endswith('Z'):
            pause_at = pause_at[:-1] + '+00:00'
        if now >= pause_at:
            return False
    return True

# ──────────────────────────────────────────────────────────────────────────────
# ROUTES STATIQUES & FRONTEND
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/manifest.json")
def manifest():
    return send_from_directory(BASE_DIR, "manifest.json", mimetype="application/manifest+json")

@app.route("/css/<path:filename>")
def css(filename):
    return send_from_directory(os.path.join(BASE_DIR, "css"), filename)

@app.route("/js/<path:filename>")
def js(filename):
    return send_from_directory(os.path.join(BASE_DIR, "js"), filename, mimetype="application/javascript")

@app.route("/<path:filename>")
def root_static(filename):
    lower = filename.lower()
    if lower.startswith(('data/', 'data\\', '__pycache__/', '.git/', '.env')):
        abort(404)
    if lower.endswith(('.py', '.json', '.env', '.sh', '.sql', '.log')):
        abort(404)
    if lower.endswith(('.png', '.jpg', '.jpeg', '.svg', '.gif', '.ico')):
        return send_from_directory(BASE_DIR, filename)
    abort(404)

# ──────────────────────────────────────────────────────────────────────────────
# FLUX TEMPS RÉEL (SSE STREAM)
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/stream")
def sse_stream():
    def event_stream():
        client_queue = queue.Queue(maxsize=50)
        with _sse_lock:
            _sse_clients.append(client_queue)
        try:
            yield f"event: connected\ndata: {json.dumps({'status': 'ok'})}\n\n"
            while True:
                try:
                    msg = client_queue.get(timeout=25)
                    yield msg
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            with _sse_lock:
                if client_queue in _sse_clients:
                    _sse_clients.remove(client_queue)

    return Response(event_stream(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    })

# ──────────────────────────────────────────────────────────────────────────────
# AUTH & COMPTE UTILISATEUR
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        return jsonify({"user": None})
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user or user.get("status") != "active":
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": safe_user(user)})

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    ip = _get_client_ip()
    if _check_rate_limit(ip):
        return jsonify({"error": "Trop de tentatives. Réessayez dans une minute."}), 429

    data = request.get_json() or {}
    identifier = (data.get("username") or data.get("nums") or "").strip().lower()
    password   = data.get("password") or ""

    db = load_db()
    # Recherche par Num's, ou username, ou email
    user = next((
        u for u in db["users"].values()
        if (u.get("nums") and u["nums"].strip().lower() == identifier)
        or (u.get("username") and u["username"].strip().lower() == identifier)
        or (u.get("email") and u["email"].strip().lower() == identifier)
    ), None)

    if not user or not check_password_hash(user.get("password", ""), password):
        return jsonify({"error": "Num's ou mot de passe incorrect"}), 401
    if user.get("status") == "pending":
        return jsonify({"error": "Compte en attente de validation par l'administration"}), 403
    if user.get("status") == "rejected":
        return jsonify({"error": "Compte non approuvé"}), 403
    if user.get("status") == "frozen":
        return jsonify({"error": "Compte suspendu / gelé par l'administration"}), 403

    token = secrets.token_hex(32)
    user["session_token"] = token
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
    ip = _get_client_ip()
    if _check_rate_limit(ip):
        return jsonify({"error": "Trop de tentatives. Réessayez dans une minute."}), 429
    data = request.get_json() or {}
    nums       = (data.get("nums") or "").strip()
    first_name = (data.get("firstName") or "").strip()
    last_name  = (data.get("lastName") or "").strip()
    email      = (data.get("email") or "").strip()
    password   = (data.get("password") or "").strip()

    # Si nom complet passé en un seul champ
    if not first_name and data.get("name"):
        parts = data["name"].strip().split(" ")
        first_name = parts[0]
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

    if not nums or not first_name or not password:
        return jsonify({"error": "Num's, Prénom, Nom et mot de passe requis"}), 400
    if len(password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400

    db = load_db()
    # Vérifier doublon sur les Num's
    if any(u.get("nums") and u["nums"].strip().lower() == nums.lower() for u in db["users"].values()):
        return jsonify({"error": "Ce Num's est déjà enregistré"}), 409

    display_name = f"{first_name} {last_name}".strip()
    new_id = "u" + secrets.token_hex(6)

    db["users"][new_id] = {
        "id": new_id,
        "username": nums,
        "nums": nums,
        "firstName": first_name,
        "lastName": last_name,
        "name": display_name,
        "email": email,
        "password": generate_password_hash(password),
        "role": "user",
        "status": "pending",
        "points": 100,
        "buque": data.get("buque", ""),
        "proms": data.get("proms", ""),
        "transactions": [],
        "pinnedMarkets": [],
        "session_token": None
    }
    save_db(db)
    return jsonify({"ok": True}), 201

@app.route("/api/auth/daily-claim", methods=["POST"])
@login_required
def daily_claim():
    with _db_lock:
        db = load_db()
        user = db["users"].get(session["user_id"])
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if user.get("lastClaim") == today:
            return jsonify({"error": "Bonus déjà récupéré aujourd'hui"}), 400

        user["lastClaim"] = today
        user["points"] += 5
        add_tx(user, "Bonus quotidien (+5 pts)", 5)
        save_db(db)
        return jsonify({"ok": True, "user": safe_user(user)})

@app.route("/api/auth/change-password", methods=["POST"])
@login_required
def auth_change_password():
    data = request.get_json() or {}
    old_pass = (data.get("oldPassword") or "").strip()
    new_pass = (data.get("newPassword") or "").strip()
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not check_password_hash(user["password"], old_pass):
        return jsonify({"error": "Ancien mot de passe incorrect"}), 400
    if len(new_pass) < 6:
        return jsonify({"error": "Le nouveau mot de passe est trop court (6 car. min)"}), 400

    user["password"] = generate_password_hash(new_pass)
    new_token = secrets.token_hex(32)
    user["session_token"] = new_token
    session["token"] = new_token
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/auth/change-email", methods=["POST"])
@login_required
def auth_change_email():
    data = request.get_json() or {}
    password = (data.get("password") or "").strip()
    new_email = (data.get("newEmail") or "").strip()
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not check_password_hash(user["password"], password):
        return jsonify({"error": "Mot de passe incorrect"}), 400

    user["email"] = new_email
    save_db(db)
    return jsonify({"ok": True, "user": safe_user(user)})

@app.route("/api/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    data = request.get_json() or {}
    identifier = (data.get("username") or data.get("nums") or "").strip().lower()
    db = load_db()
    user = next((
        u for u in db["users"].values()
        if (u.get("nums") and u["nums"].strip().lower() == identifier)
        or (u.get("username") and u["username"].strip().lower() == identifier)
    ), None)

    if user:
        req_id = "pr" + secrets.token_hex(6)
        db.setdefault("password_reset_requests", [])
        if not any(r["userId"] == user["id"] for r in db["password_reset_requests"]):
            db["password_reset_requests"].append({
                "id": req_id,
                "userId": user["id"],
                "userName": user["name"],
                "username": user.get("nums") or user.get("username"),
                "email": user.get("email", ""),
                "time": datetime.now(timezone.utc).isoformat()
            })
            save_db(db)
    return jsonify({"ok": True})

# ──────────────────────────────────────────────────────────────────────────────
# PORTEFEUILLE & POSITIONS OUVERTES
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/users/portfolio")
@login_required
def get_user_portfolio():
    """
    Retourne la liste exhaustive des positions ouvertes de l'utilisateur
    calculées en direct avec leur valeur de cashout spot.
    """
    db = load_db()
    user = db["users"].get(session["user_id"])
    if not user: return jsonify({"error": "Non trouvé"}), 404

    open_positions = []
    total_invested = 0
    total_current_val = 0

    for m in db.get("markets", []):
        probs = compute_probs(m)
        reserves = m.get("poolReserves") or {}
        user_bets = [b for b in m.get("bets", []) if str(b.get("userId")) == str(user["id"])]

        for b in user_bets:
            opt = next((o for o in m.get("options", []) if o["id"] == b["optId"]), None)
            amount = b.get("amount", 0)
            shares = b.get("shares") or amount

            # Calcul de valeur actuelle
            if m.get("status") == "open":
                cur_prob = probs.get(b["optId"], 50)
                if len(m.get("options", [])) == 2 and reserves:
                    other_opt = next((o for o in m["options"] if o["id"] != b["optId"]), None)
                    if other_opt:
                        y = reserves.get(b["optId"], 100)
                        n = reserves.get(other_opt["id"], 100)
                        cur_val = max(1, int((n * shares) / (y + shares)))
                    else:
                        cur_val = max(1, int(shares * (cur_prob / 100)))
                else:
                    cur_val = max(1, int(shares * (cur_prob / 100)))

                total_invested += amount
                total_current_val += cur_val
                open_positions.append({
                    "marketId": m["id"],
                    "marketTitle": m["title"],
                    "betId": b["id"],
                    "optId": b["optId"],
                    "optLabel": opt["label"] if opt else b["optId"],
                    "optColor": opt.get("color", "#22c55e") if opt else "#22c55e",
                    "amount": amount,
                    "shares": shares,
                    "buyProb": b.get("buyProb", cur_prob),
                    "currentProb": cur_prob,
                    "currentValue": cur_val,
                    "pnl": cur_val - amount
                })

    txs = user.get("transactions", [])
    win_txs = [t for t in txs if t.get("desc", "").startswith("Gain '")]
    loss_txs = [t for t in txs if t.get("desc", "").startswith("Pari perdu '")]
    tot_resolved = len(win_txs) + len(loss_txs)
    winrate = round((len(win_txs) / tot_resolved) * 100) if tot_resolved > 0 else 0

    return jsonify({
        "points": user.get("points", 0),
        "portfolioNetWorth": user.get("points", 0) + total_current_val,
        "totalInvested": total_invested,
        "totalCurrentValue": total_current_val,
        "latentPnl": total_current_val - total_invested,
        "winrate": winrate,
        "openPositions": open_positions,
        "transactions": txs
    })

# ──────────────────────────────────────────────────────────────────────────────
# MARCHÉS & MOTEUR AMM
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/markets")
def get_markets():
    db = load_db()
    return jsonify(db.get("markets", []))

@app.route("/api/categories")
def get_categories():
    db = load_db()
    return jsonify(db.get("categories", []))

@app.route("/api/markets/<market_id>")
def get_market(market_id):
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m:
        return jsonify({"error": "Marché introuvable"}), 404
    return jsonify(m)

@app.route("/api/markets/<market_id>/buy", methods=["POST"])
@login_required
def amm_buy_bet(market_id):
    data = request.get_json() or {}
    opt_id = data.get("optId")
    amount = data.get("amount", 0)

    with _db_lock:
        db = load_db()
        user = db["users"].get(session["user_id"])
        m = next((m for m in db["markets"] if m["id"] == market_id), None)

        if not m: return jsonify({"error": "Marché introuvable"}), 404
        if not is_market_open(m): return jsonify({"error": "Marché fermé ou gelé"}), 400
        if not isinstance(amount, int) or amount <= 0: return jsonify({"error": "Montant invalide"}), 400
        if user["points"] < amount: return jsonify({"error": "Solde insuffisant"}), 400

        opt = next((o for o in m["options"] if o["id"] == opt_id), None)
        if not opt: return jsonify({"error": "Option invalide"}), 400

        if "poolReserves" not in m:
            m["poolReserves"] = {o["id"]: 100 for o in m["options"]}

        current_probs = compute_probs(m)
        cur_prob = current_probs.get(opt_id, 50)
        reserves = m["poolReserves"]

        if len(m["options"]) == 2:
            other_opt = next(o for o in m["options"] if o["id"] != opt_id)
            y = reserves.get(opt_id, 100)
            n = reserves.get(other_opt["id"], 100)
            delta_y = (y * amount) / (n + amount)
            shares_bought = int(amount + delta_y)

            reserves[opt_id] = max(10, int(y - delta_y))
            reserves[other_opt["id"]] = int(n + amount)
        else:
            mult = 100 / max(1, cur_prob)
            shares_bought = int(amount * mult)
            reserves[opt_id] = reserves.get(opt_id, 100) + amount

        user["points"] -= amount
        m["volume"] = (m.get("volume") or 0) + amount
        opt["shares"] = (opt.get("shares") or 0) + amount

        new_probs = compute_probs(m)
        now_iso = datetime.now(timezone.utc).isoformat()

        existing = next((b for b in m["bets"] if str(b["userId"]) == str(user["id"]) and b["optId"] == opt_id), None)
        if existing:
            old_amt = existing["amount"]
            tot_amt = old_amt + amount
            existing["buyProb"] = round((existing.get("buyProb", cur_prob) * old_amt + new_probs[opt_id] * amount) / tot_amt)
            existing["amount"] = tot_amt
            existing["shares"] = (existing.get("shares") or old_amt) + shares_bought
            existing["time"] = now_iso
        else:
            m["bets"].append({
                "id": "b" + secrets.token_hex(8),
                "userId": user["id"],
                "optId": opt_id,
                "amount": amount,
                "shares": shares_bought,
                "buyProb": new_probs[opt_id],
                "time": now_iso
            })

        time_label = datetime.now(timezone.utc).strftime("%H:%M")
        m.setdefault("history", []).append({"time": time_label, **new_probs})
        if len(m["history"]) > 100: m["history"] = m["history"][-100:]

        add_tx(user, f"Mise dans '{m['title']}' ({opt['label']})", -amount)
        save_db(db)

        broadcast_sse("market_update", m)
        return jsonify({"user": safe_user(user), "market": m})

@app.route("/api/markets/<market_id>/cashout/<bet_id>", methods=["POST"])
@login_required
def amm_cashout_bet(market_id, bet_id):
    with _db_lock:
        db = load_db()
        user = db["users"].get(session["user_id"])
        m = next((m for m in db["markets"] if m["id"] == market_id), None)
        if not m or not is_market_open(m):
            return jsonify({"error": "Marché fermé ou gelé"}), 400

        bet_idx = next((i for i, b in enumerate(m["bets"]) if b["id"] == bet_id), None)
        if bet_idx is None: return jsonify({"error": "Pari introuvable"}), 404
        bet = m["bets"][bet_idx]
        if str(bet["userId"]) != str(user["id"]): return jsonify({"error": "Accès refusé"}), 403

        cur_probs = compute_probs(m)
        cur_prob = cur_probs.get(bet["optId"], 50)
        reserves = m.setdefault("poolReserves", {o["id"]: 100 for o in m["options"]})

        shares = bet.get("shares") or bet["amount"]
        if len(m["options"]) == 2:
            other_opt = next(o for o in m["options"] if o["id"] != bet["optId"])
            y = reserves.get(bet["optId"], 100)
            n = reserves.get(other_opt["id"], 100)
            refund = max(1, int((n * shares) / (y + shares)))
            reserves[bet["optId"]] = int(y + shares)
            reserves[other_opt["id"]] = max(10, int(n - refund))
        else:
            refund = max(1, int(shares * (cur_prob / 100)))
            reserves[bet["optId"]] = max(10, reserves.get(bet["optId"], 100) - refund)

        user["points"] += refund
        m["bets"].pop(bet_idx)

        new_probs = compute_probs(m)
        now_iso = datetime.now(timezone.utc).isoformat()
        time_label = datetime.now(timezone.utc).strftime("%H:%M")
        m.setdefault("history", []).append({"time": time_label, **new_probs})

        opt = next((o for o in m["options"] if o["id"] == bet["optId"]), {"label": bet["optId"]})
        add_tx(user, f"Revente/Cashout '{m['title']}' ({opt.get('label')})", refund)

        save_db(db)
        broadcast_sse("market_update", m)
        return jsonify({"user": safe_user(user), "market": m, "refund": refund})

@app.route("/api/markets/<market_id>/comments", methods=["POST"])
@login_required
def post_market_comment(market_id):
    data = request.get_json() or {}
    text = (data.get("text") or "").strip()
    if not text or len(text) > 2000:
        return jsonify({"error": "Commentaire invalide (max 2000 car.)"}), 400

    db = load_db()
    user = db["users"].get(session["user_id"])
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m: return jsonify({"error": "Marché introuvable"}), 404

    comment = {
        "id": "c" + secrets.token_hex(6),
        "userId": user["id"],
        "userName": user["name"],
        "text": text,
        "time": datetime.now(timezone.utc).isoformat()
    }
    m.setdefault("comments", []).append(comment)
    save_db(db)

    broadcast_sse("comment_added", {"marketId": market_id, "comment": comment})
    return jsonify({"ok": True, "comment": comment})

# ──────────────────────────────────────────────────────────────────────────────
# PROPOSITIONS DE MARCHÉS
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/proposals", methods=["GET", "POST"])
@login_required
def handle_proposals():
    db = load_db()
    user = db["users"].get(session["user_id"])
    if request.method == "GET":
        if user.get("role") == "admin":
            return jsonify(db.get("proposals", []))
        return jsonify([p for p in db.get("proposals", []) if p["authorId"] == user["id"]])

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    choices = data.get("choices", [])
    image = (data.get("image") or "").strip()

    if not title or len(choices) < 2:
        return jsonify({"error": "Titre et au moins 2 choix requis"}), 400

    proposal = {
        "id": "p" + secrets.token_hex(6),
        "authorId": user["id"],
        "authorName": user["name"],
        "title": title,
        "choices": [c.strip() for c in choices if c.strip()],
        "image": image,
        "status": "pending",
        "adminNote": "",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    db.setdefault("proposals", []).insert(0, proposal)
    save_db(db)
    return jsonify(proposal), 201

# ──────────────────────────────────────────────────────────────────────────────
# SUITE D'ADMINISTRATION COMPLÈTE
# ──────────────────────────────────────────────────────────────────────────────
@app.route("/api/admin/users")
@admin_required
def admin_get_users():
    db = load_db()
    return jsonify([safe_user(u) for u in db["users"].values()])

@app.route("/api/admin/users/<user_id>/grant", methods=["POST"])
@admin_required
def admin_grant_points(user_id):
    """Crédite ou débite des points à un utilisateur."""
    data = request.get_json() or {}
    amount = data.get("amount", 0)
    reason = (data.get("reason") or "Ajustement administratif").strip()

    if not isinstance(amount, int) or amount == 0:
        return jsonify({"error": "Montant invalide"}), 400

    with _db_lock:
        db = load_db()
        user = db["users"].get(user_id)
        if not user: return jsonify({"error": "Utilisateur introuvable"}), 404

        user["points"] = max(0, user.get("points", 0) + amount)
        sign = "+" if amount > 0 else ""
        add_tx(user, f"Admin: {sign}{amount} pts ({reason})", amount)

        _log_admin_action(db, "grant_points", f"{sign}{amount} pts accordés à {user['name']} (@{user.get('nums') or user.get('username')}) : {reason}")
        save_db(db)
        return jsonify({"ok": True, "user": safe_user(user)})

@app.route("/api/admin/users/<user_id>/toggle-status", methods=["POST"])
@admin_required
def admin_toggle_user_status(user_id):
    """Bascule le statut d'un compte (active <-> frozen / suspended)."""
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    if user.get("superAdmin"): return jsonify({"error": "Impossible de suspendre le super-admin"}), 400

    current = user.get("status", "active")
    new_status = "frozen" if current == "active" else "active"
    user["status"] = new_status
    if new_status == "frozen":
        user["session_token"] = secrets.token_hex(32) # révoque la session immédiatement

    _log_admin_action(db, "toggle_status", f"Compte de {user['name']} passé à l'état '{new_status}'")
    save_db(db)
    return jsonify({"ok": True, "status": new_status})

@app.route("/api/admin/users/<user_id>/toggle-role", methods=["POST"])
@admin_required
def admin_toggle_user_role(user_id):
    db = load_db()
    me = db["users"].get(session["user_id"])
    if not me or not me.get("superAdmin"):
        return jsonify({"error": "Réservé au super-administrateur"}), 403

    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    if user["id"] == me["id"]: return jsonify({"error": "Action impossible sur soi-même"}), 400

    new_role = "admin" if user.get("role") != "admin" else "user"
    user["role"] = new_role
    _log_admin_action(db, "toggle_role", f"Rôle de {user['name']} modifié en '{new_role}'")
    save_db(db)
    return jsonify({"ok": True, "role": new_role})

@app.route("/api/admin/users/<user_id>/kick", methods=["POST"])
@admin_required
def admin_kick_user(user_id):
    """Déconnecte de force un utilisateur de tous ses appareils."""
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    user["session_token"] = secrets.token_hex(32)
    _log_admin_action(db, "kick_user", f"Déconnexion forcée de {user['name']}")
    save_db(db)
    return jsonify({"ok": True, "message": f"{user['name']} a été déconnecté"})

@app.route("/api/admin/users/<user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    if user.get("role") == "admin": return jsonify({"error": "Impossible de supprimer un administrateur"}), 400

    _log_admin_action(db, "delete_user", f"Suppression définitive du compte de {user['name']}")
    del db["users"][user_id]
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/users/<user_id>/history")
@admin_required
def admin_get_user_history(user_id):
    """Retourne l'historique complet des transactions et paris de l'utilisateur."""
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404

    user_bets = []
    for m in db.get("markets", []):
        for b in m.get("bets", []):
            if str(b.get("userId")) == str(user_id):
                opt = next((o for o in m.get("options", []) if o["id"] == b["optId"]), None)
                user_bets.append({
                    "marketId": m["id"],
                    "marketTitle": m["title"],
                    "marketStatus": m["status"],
                    "optLabel": opt["label"] if opt else b["optId"],
                    "amount": b.get("amount", 0),
                    "shares": b.get("shares") or b.get("amount", 0),
                    "buyProb": b.get("buyProb", 50),
                    "time": b.get("time", "")
                })

    return jsonify({
        "user": safe_user(user),
        "transactions": user.get("transactions", []),
        "bets": user_bets
    })

@app.route("/api/admin/users/<user_id>/approve", methods=["POST"])
@admin_required
def admin_approve_user(user_id):
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    user["status"] = "active"
    _log_admin_action(db, "approve_user", f"Approbation de {user['name']} (@{user.get('nums') or user.get('username')})")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/users/<user_id>/reject", methods=["POST"])
@admin_required
def admin_reject_user(user_id):
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    user["status"] = "rejected"
    _log_admin_action(db, "reject_user", f"Rejet de {user['name']}")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/users/batch-approve", methods=["POST"])
@admin_required
def admin_batch_approve_users():
    db = load_db()
    count = 0
    for u in db["users"].values():
        if u.get("status") == "pending":
            u["status"] = "active"
            count += 1
    _log_admin_action(db, "batch_approve", f"Approbation groupée de {count} comptes")
    save_db(db)
    return jsonify({"ok": True, "count": count})

@app.route("/api/admin/markets", methods=["POST"])
@admin_required
def admin_create_market():
    data = request.get_json() or {}
    title   = (data.get("title") or "").strip()
    choices = data.get("choices", [])
    image   = (data.get("image") or "").strip()
    cat_id  = data.get("categoryId")
    pause_at = data.get("pauseAt")

    if not title or len(choices) < 2:
        return jsonify({"error": "Titre et 2+ choix requis"}), 400

    options = [
        {"id": f"o{i+1}", "label": c.strip(), "shares": 0, "color": PALETTE[i % len(PALETTE)]}
        for i, c in enumerate(choices)
    ]
    pool_reserves = {o["id"]: 100 for o in options}
    init_probs = {o["id"]: round(100 / len(options)) for o in options}

    new_market = {
        "id": "m" + secrets.token_hex(6),
        "title": title,
        "image": image or "https://images.unsplash.com/photo-1550565118-3a14e8d0386f?auto=format&fit=crop&w=150&q=80",
        "volume": 0,
        "status": "open",
        "resolvedWinner": None,
        "bets": [],
        "options": options,
        "poolReserves": pool_reserves,
        "categoryId": cat_id,
        "pauseAt": pause_at,
        "history": [{"time": "Début", **init_probs}]
    }
    db = load_db()
    db.setdefault("markets", []).insert(0, new_market)
    _log_admin_action(db, "create_market", f"Création du marché '{title}'", market_id=new_market["id"], market_title=title)
    save_db(db)
    broadcast_sse("market_update", new_market)
    return jsonify(new_market), 201

@app.route("/api/admin/markets/<market_id>/rename", methods=["POST"])
@admin_required
def admin_rename_market(market_id):
    data = request.get_json() or {}
    new_title = (data.get("title") or "").strip()
    if not new_title: return jsonify({"error": "Titre requis"}), 400
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m: return jsonify({"error": "Marché introuvable"}), 404
    old = m["title"]
    m["title"] = new_title
    _log_admin_action(db, "rename_market", f"Renommé '{old}' en '{new_title}'", market_id=market_id, market_title=new_title)
    save_db(db)
    broadcast_sse("market_update", m)
    return jsonify({"ok": True, "market": m})

@app.route("/api/admin/markets/<market_id>/toggle-pause", methods=["POST"])
@admin_required
def admin_toggle_pause(market_id):
    data = request.get_json() or {}
    db = load_db()
    m = next((m for m in db["markets"] if m["id"] == market_id), None)
    if not m: return jsonify({"error": "Marché introuvable"}), 404

    if m["status"] == "open":
        m["status"] = "paused"
        action = "Mise en pause"
    else:
        m["status"] = "open"
        action = "Réactivation"

    _log_admin_action(db, "toggle_pause", f"{action} du marché '{m['title']}'", market_id=market_id, market_title=m["title"])
    save_db(db)
    broadcast_sse("market_update", m)
    return jsonify({"ok": True, "market": m})

@app.route("/api/admin/markets/<market_id>/resolve", methods=["POST"])
@admin_required
def admin_resolve_market(market_id):
    data = request.get_json() or {}
    winner_id = data.get("winnerId")

    with _db_lock:
        db = load_db()
        m = next((m for m in db["markets"] if m["id"] == market_id), None)
        if not m: return jsonify({"error": "Marché introuvable"}), 404

        m["status"] = "resolved"
        m["resolvedWinner"] = winner_id

        if winner_id == "cancelled":
            for b in m.get("bets", []):
                u = db["users"].get(b["userId"])
                if u:
                    u["points"] += b["amount"]
                    add_tx(u, f"Remboursement annulation '{m['title']}'", b["amount"])
        else:
            for b in m.get("bets", []):
                u = db["users"].get(b["userId"])
                if u:
                    if b["optId"] == winner_id:
                        payout = b.get("shares") or b["amount"]
                        u["points"] += payout
                        add_tx(u, f"Gain '{m['title']}'", payout)
                    else:
                        add_tx(u, f"Pari perdu '{m['title']}'", 0)

        _log_admin_action(db, "resolve_market", f"Clôture du marché : {winner_id}", market_id=market_id, market_title=m["title"])
        save_db(db)
        broadcast_sse("market_update", m)
        return jsonify({"ok": True})

@app.route("/api/admin/markets/<market_id>", methods=["DELETE"])
@admin_required
def admin_delete_market(market_id):
    db = load_db()
    idx = next((i for i, m in enumerate(db["markets"]) if m["id"] == market_id), None)
    if idx is None: return jsonify({"error": "Marché introuvable"}), 404
    m = db["markets"][idx]
    _log_admin_action(db, "delete_market", f"Suppression du marché '{m['title']}'", market_id=market_id, market_title=m["title"])
    db["markets"].pop(idx)
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/categories", methods=["POST"])
@admin_required
def admin_create_category():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name: return jsonify({"error": "Nom requis"}), 400
    db = load_db()
    new_cat = {
        "id": "cat_" + secrets.token_hex(4),
        "name": name,
        "order": len(db.get("categories", []))
    }
    db.setdefault("categories", []).append(new_cat)
    _log_admin_action(db, "create_category", f"Création catégorie '{name}'")
    save_db(db)
    return jsonify({"ok": True, "category": new_cat})

@app.route("/api/admin/categories/<cat_id>", methods=["DELETE"])
@admin_required
def admin_delete_category(cat_id):
    db = load_db()
    db["categories"] = [c for c in db.get("categories", []) if c["id"] != cat_id]
    for m in db.get("markets", []):
        if m.get("categoryId") == cat_id:
            m["categoryId"] = None
    _log_admin_action(db, "delete_category", f"Suppression catégorie {cat_id}")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/password-resets", methods=["GET"])
@admin_required
def admin_get_password_resets():
    db = load_db()
    return jsonify(db.get("password_reset_requests", []))

@app.route("/api/admin/password-resets/<req_id>/approve", methods=["POST"])
@admin_required
def admin_approve_password_reset(req_id):
    data = request.get_json() or {}
    new_pass = (data.get("newPassword") or "").strip()
    if len(new_pass) < 6: return jsonify({"error": "Mot de passe trop court"}), 400

    db = load_db()
    reqs = db.get("password_reset_requests", [])
    target_req = next((r for r in reqs if r["id"] == req_id), None)
    if not target_req: return jsonify({"error": "Demande introuvable"}), 404

    user = db["users"].get(target_req["userId"])
    if user:
        user["password"] = generate_password_hash(new_pass)
        user["session_token"] = secrets.token_hex(32)

    db["password_reset_requests"] = [r for r in reqs if r["id"] != req_id]
    _log_admin_action(db, "password_reset", f"Réinitialisation mot de passe pour {target_req['userName']}")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/name-changes", methods=["GET"])
@admin_required
def admin_get_name_changes():
    db = load_db()
    return jsonify([r for r in db.get("name_change_requests", []) if r.get("status") == "pending"])

@app.route("/api/admin/name-changes/<req_id>/approve", methods=["POST"])
@admin_required
def admin_approve_name_change(req_id):
    db = load_db()
    reqs = db.get("name_change_requests", [])
    target = next((r for r in reqs if r["id"] == req_id), None)
    if not target: return jsonify({"error": "Demande introuvable"}), 404

    user = db["users"].get(target["userId"])
    if user:
        user["name"] = target["newName"]
        add_tx(user, f"Changement de pseudo : {target['newName']}", 0)

    target["status"] = "approved"
    _log_admin_action(db, "approve_name_change", f"Nouveau pseudo '{target['newName']}' approuvé pour {target['oldName']}")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/name-changes/<req_id>/reject", methods=["POST"])
@admin_required
def admin_reject_name_change(req_id):
    db = load_db()
    reqs = db.get("name_change_requests", [])
    target = next((r for r in reqs if r["id"] == req_id), None)
    if not target: return jsonify({"error": "Demande introuvable"}), 404
    target["status"] = "rejected"
    _log_admin_action(db, "reject_name_change", f"Rejet du pseudo '{target['newName']}' pour {target['oldName']}")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/profile/request-name-change", methods=["POST"])
@login_required
def profile_request_name_change():
    data = request.get_json() or {}
    new_name = (data.get("newName") or "").strip()
    if not new_name: return jsonify({"error": "Nom requis"}), 400
    db = load_db()
    user = db["users"].get(session["user_id"])
    req = {
        "id": "nc" + secrets.token_hex(6),
        "userId": user["id"],
        "oldName": user["name"],
        "newName": new_name,
        "status": "pending",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    db.setdefault("name_change_requests", []).insert(0, req)
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/users/pin-market", methods=["POST"])
@login_required
def toggle_pin_market():
    data = request.get_json() or {}
    market_id = data.get("marketId")
    db = load_db()
    user = db["users"].get(session["user_id"])
    pinned = user.setdefault("pinnedMarkets", [])
    if market_id in pinned:
        pinned.remove(market_id)
        is_pin = False
    else:
        pinned.append(market_id)
        is_pin = True
    save_db(db)
    return jsonify({"user": safe_user(user), "pinned": is_pin})

@app.route("/api/admin/activity-log")
@admin_required
def admin_activity_log():
    db = load_db()
    return jsonify(db.get("admin_audit_log", []))

@app.route("/api/admin/export/csv")
@admin_required
def admin_export_csv():
    db = load_db()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["=== UTILISATEURS ==="])
    writer.writerow(["ID", "Nom", "Num's", "Email", "Bucque", "Prom's", "Solde Points", "Statut", "Role"])
    for u in db["users"].values():
        writer.writerow([u["id"], u["name"], u.get("nums", ""), u.get("email", ""), u.get("buque", ""), u.get("proms", ""), u.get("points", 0), u.get("status", ""), u.get("role", "")])

    writer.writerow([])
    writer.writerow(["=== MARCHES ==="])
    writer.writerow(["ID", "Titre", "Volume", "Statut", "Gagnant"])
    for m in db.get("markets", []):
        writer.writerow([m["id"], m["title"], m.get("volume", 0), m.get("status", ""), m.get("resolvedWinner", "")])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=polyboquette_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@app.route("/api/leaderboard")
def get_leaderboard():
    db = load_db()
    active = [u for u in db["users"].values() if u.get("status") == "active"]
    ranked = sorted(active, key=lambda u: max(0, int(u.get("points", 0))), reverse=True)[:25]
    return jsonify([{"id": u["id"], "name": u["name"], "nums": u.get("nums", ""), "points": u.get("points", 0)} for u in ranked])

# ──────────────────────────────────────────────────────────────────────────────
# LANCEMENT SERVEUR
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[OK] PolyBoquette demarre sur http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
