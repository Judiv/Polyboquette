"""
PolyBoquette - Backend Flask (API REST & SSE Temps Réel)
========================================================
Architecture :
- Persistance PostgreSQL (prod) ou data/db.json (local)
- Moteur AMM (Constant Product Market Maker)
- Flux temps réel Server-Sent Events (/api/stream)
- Sessions cookies HTTPOnly signées
- Export CSV pour l'administration
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
    "version": 8,
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

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
def _is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email)) and len(email) <= 200

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
        if u.get("role") != "admin" and "superAdmin" not in u:
            u["superAdmin"] = False

    # Migration markets pour AMM
    for m in db.get("markets", []):
        if "comments" not in m: m["comments"] = []
        if "pauseAt" not in m: m["pauseAt"] = None
        if "categoryId" not in m: m["categoryId"] = None
        if "order" not in m: m["order"] = 0
        if "poolReserves" not in m:
            # Initialise les réserves AMM si absentes
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
        "password": generate_password_hash(raw_pwd),
        "name": display,
        "role": "admin",
        "superAdmin": True,
        "status": "active",
        "points": 1000,
        "buque": "", "nums": "", "proms": "",
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
            # Message de bienvenue
            yield f"event: connected\ndata: {json.dumps({'status': 'ok'})}\n\n"
            while True:
                try:
                    msg = client_queue.get(timeout=25)
                    yield msg
                except queue.Empty:
                    # Ping keep-alive
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
    db = load_db()
    user = next((u for u in db["users"].values() if u["username"] == data.get("username")), None)
    if not user or not check_password_hash(user.get("password", ""), data.get("password") or ""):
        return jsonify({"error": "Identifiants incorrects"}), 401
    if user["status"] == "pending":
        return jsonify({"error": "Compte en attente de validation par l'administration"}), 403
    if user["status"] == "rejected":
        return jsonify({"error": "Compte non approuvé"}), 403

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
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip()

    if not username or not password or not name:
        return jsonify({"error": "Nom, identifiant et mot de passe requis"}), 400
    if len(password) < 6:
        return jsonify({"error": "Le mot de passe doit faire au moins 6 caractères"}), 400

    db = load_db()
    if any(u["username"].lower() == username.lower() for u in db["users"].values()):
        return jsonify({"error": "Cet identifiant est déjà utilisé"}), 409

    new_id = "u" + secrets.token_hex(6)
    db["users"][new_id] = {
        "id": new_id,
        "username": username,
        "password": generate_password_hash(password),
        "name": name,
        "email": email,
        "role": "user",
        "status": "pending",
        "points": 100,
        "buque": data.get("buque", ""),
        "nums":  data.get("nums", ""),
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
    username = (data.get("username") or "").strip()
    db = load_db()
    user = next((u for u in db["users"].values() if u["username"].lower() == username.lower()), None)
    if user:
        req_id = "pr" + secrets.token_hex(6)
        db.setdefault("password_reset_requests", [])
        if not any(r["userId"] == user["id"] for r in db["password_reset_requests"]):
            db["password_reset_requests"].append({
                "id": req_id,
                "userId": user["id"],
                "userName": user["name"],
                "username": user["username"],
                "email": user.get("email", ""),
                "time": datetime.now(timezone.utc).isoformat()
            })
            save_db(db)
    return jsonify({"ok": True})

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
    """
    Exécution d'un achat d'actions via le moteur AMM (CPMM).
    """
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

        # Initialisation réserves AMM si absentes
        if "poolReserves" not in m:
            m["poolReserves"] = {o["id"]: 100 for o in m["options"]}

        # Calcul AMM CPMM
        current_probs = compute_probs(m)
        cur_prob = current_probs.get(opt_id, 50)

        reserves = m["poolReserves"]
        if len(m["options"]) == 2:
            other_opt = next(o for o in m["options"] if o["id"] != opt_id)
            y = reserves.get(opt_id, 100)
            n = reserves.get(other_opt["id"], 100)
            delta_y = (y * amount) / (n + amount)
            shares_bought = int(amount + delta_y)

            # Mise à jour réserves
            reserves[opt_id] = max(10, int(y - delta_y))
            reserves[other_opt["id"]] = int(n + amount)
        else:
            mult = 100 / max(1, cur_prob)
            shares_bought = int(amount * mult)
            reserves[opt_id] = reserves.get(opt_id, 100) + amount

        # Débit utilisateur & crédit marché
        user["points"] -= amount
        m["volume"] = (m.get("volume") or 0) + amount
        opt["shares"] = (opt.get("shares") or 0) + amount

        new_probs = compute_probs(m)
        now_iso = datetime.now(timezone.utc).isoformat()

        # Position de l'utilisateur
        existing = next((b for b in m["bets"] if b["userId"] == user["id"] and b["optId"] == opt_id), None)
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

        # Historique des cotes
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
    """
    Cashout / Revente de parts au prix spot AMM.
    """
    with _db_lock:
        db = load_db()
        user = db["users"].get(session["user_id"])
        m = next((m for m in db["markets"] if m["id"] == market_id), None)
        if not m or not is_market_open(m):
            return jsonify({"error": "Marché fermé ou gelé"}), 400

        bet_idx = next((i for i, b in enumerate(m["bets"]) if b["id"] == bet_id), None)
        if bet_idx is None: return jsonify({"error": "Pari introuvable"}), 404
        bet = m["bets"][bet_idx]
        if bet["userId"] != user["id"]: return jsonify({"error": "Accès refusé"}), 403

        # Calcul remboursement AMM
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
# ADMIN : VALIDATIONS, GESTION, CLÔTURES & EXPORT CSV
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
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    user["status"] = "active"
    _log_admin_action(db, "approve_user", f"Approbation de {user['name']} (@{user['username']})")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/users/<user_id>/reject", methods=["POST"])
@admin_required
def admin_reject_user(user_id):
    db = load_db()
    user = db["users"].get(user_id)
    if not user: return jsonify({"error": "Utilisateur introuvable"}), 404
    user["status"] = "rejected"
    _log_admin_action(db, "reject_user", f"Rejet de {user['name']} (@{user['username']})")
    save_db(db)
    return jsonify({"ok": True})

@app.route("/api/admin/users/batch-approve", methods=["POST"])
@admin_required
def admin_batch_approve_users():
    """Approuve toutes les inscriptions en attente d'un coup."""
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

@app.route("/api/admin/markets/<market_id>/resolve", methods=["POST"])
@admin_required
def admin_resolve_market(market_id):
    """
    Résolution de marché AMM (distribution des gains aux détenteurs de shares gagnantes).
    """
    data = request.get_json() or {}
    winner_id = data.get("winnerId")

    with _db_lock:
        db = load_db()
        m = next((m for m in db["markets"] if m["id"] == market_id), None)
        if not m: return jsonify({"error": "Marché introuvable"}), 404

        m["status"] = "resolved"
        m["resolvedWinner"] = winner_id

        if winner_id == "cancelled":
            # Remboursement intégral de tous les paris
            for b in m.get("bets", []):
                u = db["users"].get(b["userId"])
                if u:
                    u["points"] += b["amount"]
                    add_tx(u, f"Remboursement annulation '{m['title']}'", b["amount"])
        else:
            # 1 Share gagnante = 1 Point
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
    """Génère un export CSV des membres et transactions."""
    db = load_db()
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Utilisateurs
    writer.writerow(["=== UTILISATEURS ==="])
    writer.writerow(["ID", "Nom", "Pseudo", "Email", "Bucque", "Num's", "Prom's", "Solde Points", "Statut", "Role"])
    for u in db["users"].values():
        writer.writerow([u["id"], u["name"], u["username"], u.get("email", ""), u.get("buque", ""), u.get("nums", ""), u.get("proms", ""), u.get("points", 0), u.get("status", ""), u.get("role", "")])

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
    ranked = sorted(active, key=lambda u: max(0, int(u.get("points", 0))), reverse=True)[:20]
    return jsonify([{"id": u["id"], "name": u["name"], "points": u.get("points", 0)} for u in ranked])

# ──────────────────────────────────────────────────────────────────────────────
# LANCEMENT SERVEUR
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[OK] PolyBoquette 2.0 demarre sur http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
