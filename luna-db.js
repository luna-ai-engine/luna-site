/* Luna : adaptateur de données du site autonome (décision de David du 25/09/2026, mandat § 10).

   Fournit à la page Luna la même interface que dans Claude :
     window.claude.use("db")   : collection(path).onSnapshot / orderBy / limit / where / get / add, doc(path).get / set / update / onSnapshot
     window.claude.use("user") : isOwner()
   au-dessus de supabase-js v2 (window.supabase, chargé avant ce fichier), sur la table renata.luna_documents
   (collection, doc_id, data, version, updated_at, updated_by) et renata.luna_members (email, nom, role owner|member).

   Règles :
   - Connexion uniquement par « Continuer avec Google » (Supabase Auth, fournisseur google, retour sur l'adresse du site).
   - use("db") et use("user") n'aboutissent qu'une fois la personne connectée et reconnue comme membre ; sinon l'écran de
     connexion (luna-login.js) reste affiché. Une personne connectée qui n'est pas membre est aussitôt déconnectée.
   - Lecture : temps réel si le canal Supabase est abonné ; sinon relecture toutes les 60 s ; toujours au retour sur l'onglet.
     Chaque relecture ne demande d'abord que (doc_id, version, updated_at), puis le contenu des seuls documents changés.
   - Écriture : seulement « suivi » et « demandes » (les règles d'accès de la base décident en dernier ressort). Jamais de
     suppression.
   - CRM : ce fichier ne lit aucune table du CRM ; il prête seulement son client à luna-crm-db.js (lunaAuth.client()), qui
     n'existe que sur le site.
   - Aucune clé ici : l'adresse de la base et sa clé PUBLIQUE viennent de config.js (window.LUNA_CONFIG). */
(function (root) {
  "use strict";

  const SCHEMA = "renata", TABLE = "luna_documents", MEMBERS = "luna_members";
  const COLLECTIONS = ["renata", "contacts", "suivi", "demandes"];
  const WRITABLE = ["suivi", "demandes"];
  const POLL_MS = 60000, SAFETY_MS = 300000, TICK_MS = 15000, PAGE = 500, CHUNK = 40, DEBOUNCE_MS = 400;

  const cfg = () => root.LUNA_CONFIG || {};
  const now = () => Date.now();
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  // ------------------------------------------------------------------ client Supabase
  let client = null;
  function getClient() {
    if (client) return client;
    const sb = root.supabase, c = cfg();
    if (!sb || typeof sb.createClient !== "function" || !c.supabaseUrl || !c.supabaseKey) return null;
    // flowType implicit : la session revient dans l'adresse de retour de Google (effacée aussitôt par supabase-js) ; aucun
    // code à garder sur l'appareil entre le départ vers Google et le retour.
    client = sb.createClient(c.supabaseUrl, c.supabaseKey, {
      db: { schema: SCHEMA },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "luna-auth" }
    });
    return client;
  }

  // ------------------------------------------------------------------ session et appartenance
  // state : "unconfigured" | "checking" | "signed_out" | "member" | "denied" | "error"
  //   denied : compte Google connecté mais absent des membres (ou refusé par Supabase) ; la session est aussitôt fermée.
  //   error  : la base n'a pas pu dire si la personne est membre (réseau, base) ; rien n'est ouvert.
  // returnError : issue d'un retour de Google en erreur, lue dans l'adresse puis effacée : "denied" | "failed" | "".
  const auth = { state: "checking", email: "", member: null, listeners: new Set(), returnError: "" };
  let memberResolve = null;
  const memberReady = new Promise(res => { memberResolve = res; });

  function setState(state) {
    auth.state = state;
    auth.listeners.forEach(fn => { try { fn(publicAuthState()); } catch (e) { /* écran de connexion : jamais bloquant */ } });
    if (state === "member" && memberResolve) { memberResolve(true); memberResolve = null; }
  }
  function publicAuthState() {
    return { state: auth.state, email: auth.email, name: auth.member ? auth.member.nom || "" : "", owner: isOwnerSync(), returnError: auth.returnError };
  }
  function isOwnerSync() { return !!(auth.member && auth.member.role === "owner"); }

  async function deny(email) {
    // Non-membre : message clair, puis fermeture de la session (toutes ses sessions, pas seulement cet appareil).
    auth.member = null; auth.email = email || ""; setState("denied");
    const c = getClient();
    try { await c.auth.signOut(); } catch (e) { /* session locale effacée malgré tout */ }
  }

  async function checkMembership(session) {
    const email = String((session && session.user && session.user.email) || "").trim().toLowerCase();
    auth.email = email;
    if (!email) { await deny(""); return; }
    const c = getClient();
    let rows = null;
    try {
      // Règle de la base : un compte connecté ne lit que SA ligne de luna_members (aucune ligne s'il n'est pas membre).
      const r = await c.from(MEMBERS).select("email,nom,role").eq("email", email).limit(1);
      if (!r.error) rows = r.data || [];
    } catch (e) { rows = null; }
    if (rows === null) { auth.member = null; setState("error"); return; }
    const me = rows.find(m => String(m.email || "").trim().toLowerCase() === email);
    if (!me) { await deny(email); return; }
    auth.member = { email, nom: me.nom || "", role: me.role === "owner" ? "owner" : "member" };
    setState("member");
  }

  function readReturnError() {
    // Retour de Google en erreur, par exemple « error=server_error&error_code=signup_disabled&error_description=... »
    // (compte absent de Supabase, inscriptions fermées) ou « error=access_denied » (connexion annulée chez Google).
    try {
      const h = new URLSearchParams(String(root.location && root.location.hash || "").replace(/^#/, ""));
      const q = new URLSearchParams(String(root.location && root.location.search || ""));
      const get = k => h.get(k) || q.get(k) || "";
      const error = get("error"), code = get("error_code"), text = get("error_description");
      if (error || code || text) {
        auth.returnError = (code === "signup_disabled" || /signups? not allowed|user not (found|allowed)/i.test(text)) ? "denied" : "failed";
        if (root.history && root.history.replaceState) root.history.replaceState(null, "", root.location.pathname);
      }
    } catch (e) { /* adresse illisible : ignorée */ }
  }

  let authStarted = false;
  function startAuth() {
    if (authStarted) return; authStarted = true;
    const c = getClient();
    if (!c) { setState("unconfigured"); return; }
    readReturnError();
    let checkedFor = null;
    c.auth.onAuthStateChange((event, session) => {
      // Ne jamais appeler Supabase directement dans ce rappel (verrou interne de supabase-js) : différer.
      setTimeout(() => {
        if (event === "SIGNED_OUT") {
          if (auth.state === "denied") return;                           // déconnexion voulue d'un non-membre
          if (auth.state === "member") { try { root.location.reload(); } catch (e) { /* hors navigateur */ } }
          auth.member = null; checkedFor = null; setState("signed_out"); return;
        }
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
          const email = String((session.user && session.user.email) || "").toLowerCase();
          if (checkedFor === email) return;
          checkedFor = email; checkMembership(session);
        } else if (event === "INITIAL_SESSION" && !session) {
          if (auth.returnError === "denied") { auth.email = ""; setState("denied"); } else setState("signed_out");
        }
      }, 0);
    });
  }

  const lunaAuth = {
    get configured() { return !!getClient(); },
    state: publicAuthState,
    onChange(fn) { auth.listeners.add(fn); try { fn(publicAuthState()); } catch (e) { /* ignoré */ } return () => auth.listeners.delete(fn); },
    async signInWithGoogle() {
      // Quitte la page vers Google (par Supabase), puis revient sur l'adresse du site, session dans l'adresse de retour.
      const c = getClient(); if (!c) return { error: "unconfigured" };
      const target = cfg().siteUrl || (root.location.origin + root.location.pathname);
      try {
        const r = await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: target, queryParams: { prompt: "select_account" } } });
        return { error: r && r.error ? "failed" : null };
      } catch (e) { return { error: "failed" }; }
    },
    async signOut() {
      // Paramètres : ferme la session de cet appareil seulement, puis recharge (écran de connexion).
      const c = getClient(); if (!c) return;
      try { await c.auth.signOut({ scope: "local" }); } catch (e) { /* session locale effacée malgré tout */ }
      try { root.location.reload(); } catch (e) { /* hors navigateur */ }
    },
    // CRM du site (luna-crm-db.js) : le même client et la même session (clé publique seule), rendus seulement une fois la
    // personne reconnue membre du site ; null sans configuration. Le schéma crm est choisi appel par appel, et ses règles
    // d'accès (Renata et David seulement) décident en dernier ressort.
    async client() {
      startAuth();
      if (!getClient()) return null;
      await memberReady;
      return getClient();
    }
  };

  // ------------------------------------------------------------------ cache des collections
  const store = {};
  COLLECTIONS.forEach(c => { store[c] = { rows: new Map(), loaded: false, listeners: new Set(), running: null, again: false, fails: 0, last: 0 }; });
  const stamp = r => (r.version == null && r.updated_at == null) ? null : `${r.version == null ? "" : r.version}|${r.updated_at == null ? "" : r.updated_at}`;

  async function fetchAll(coll, cols) {
    const c = getClient(), out = [];
    for (let from = 0; ; from += PAGE) {
      const r = await c.from(TABLE).select(cols).eq("collection", coll).order("doc_id", { ascending: true }).range(from, from + PAGE - 1);
      if (r.error) throw r.error;
      const rows = r.data || [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }
  async function fetchIds(coll, ids) {
    const c = getClient(), out = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const r = await c.from(TABLE).select("doc_id,version,updated_at,data").eq("collection", coll).in("doc_id", ids.slice(i, i + CHUNK));
      if (r.error) throw r.error;
      out.push(...(r.data || []));
    }
    return out;
  }

  async function doRefresh(coll) {
    const s = store[coll];
    let changed = false;
    if (!s.loaded) {
      const rows = await fetchAll(coll, "doc_id,version,updated_at,data");
      s.rows = new Map(rows.map(r => [r.doc_id, { data: r.data, stamp: stamp(r) }]));
      s.loaded = true; changed = true;
    } else {
      const idx = await fetchAll(coll, "doc_id,version,updated_at");
      const seen = new Set(idx.map(r => r.doc_id));
      const want = idx.filter(r => { const cur = s.rows.get(r.doc_id); const st = stamp(r); return !cur || st === null || cur.stamp !== st; }).map(r => r.doc_id);
      for (const id of [...s.rows.keys()]) if (!seen.has(id)) { s.rows.delete(id); changed = true; }
      if (want.length) {
        const rows = want.length > CHUNK * 3 ? await fetchAll(coll, "doc_id,version,updated_at,data") : await fetchIds(coll, want);
        rows.forEach(r => {
          const cur = s.rows.get(r.doc_id), st = stamp(r);
          if (!cur || st === null || cur.stamp !== st || JSON.stringify(cur.data) !== JSON.stringify(r.data)) { s.rows.set(r.doc_id, { data: r.data, stamp: st }); changed = true; }
        });
      }
    }
    s.last = now(); s.fails = 0;
    if (changed) notify(coll);
  }

  function refresh(coll) {
    const s = store[coll];
    if (s.running) { if (s.loaded) s.again = true; return s.running; }   // premier chargement en cours : il servira tout le monde
    s.running = (async () => {
      try {
        do { s.again = false; await doRefresh(coll); } while (s.again);
      } catch (e) {
        s.fails += 1; s.last = now();
        // Échec du premier chargement, ou trois relectures de suite en échec : signalé aux écouteurs.
        if (!s.loaded || s.fails >= 3) s.listeners.forEach(l => { if (l.error) { try { l.error(e); } catch (x) { /* ignoré */ } } });
      } finally { s.running = null; }
    })();
    return s.running;
  }
  const pending = {};
  function schedule(coll) {
    if (!store[coll]) return;
    clearTimeout(pending[coll]);
    pending[coll] = setTimeout(() => refresh(coll), DEBOUNCE_MS);
  }
  const active = () => COLLECTIONS.filter(c => store[c].listeners.size > 0);

  // ------------------------------------------------------------------ requêtes façon Firestore
  const getPath = (obj, path) => String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function cmp(a, b) {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  const OPS = ["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"];
  function test(v, op, x) {
    switch (op) {
      case "==": return v === x || (v != null && x != null && JSON.stringify(v) === JSON.stringify(x));
      case "!=": return !(v === x || (v != null && x != null && JSON.stringify(v) === JSON.stringify(x)));
      case "<": return v != null && cmp(v, x) < 0;
      case "<=": return v != null && cmp(v, x) <= 0;
      case ">": return v != null && cmp(v, x) > 0;
      case ">=": return v != null && cmp(v, x) >= 0;
      case "in": return Array.isArray(x) && x.some(y => test(v, "==", y));
      case "not-in": return Array.isArray(x) && !x.some(y => test(v, "==", y));
      case "array-contains": return Array.isArray(v) && v.some(y => test(y, "==", x));
      case "array-contains-any": return Array.isArray(v) && Array.isArray(x) && v.some(y => x.some(z => test(y, "==", z)));
      default: throw new Error("opérateur non pris en charge : " + op);
    }
  }

  function docSnap(coll, id, entry) {
    const exists = !!entry;
    const data = exists ? entry.data : undefined;
    return { id, exists, ref: new DocRef(coll, id), data: () => clone(data), get: f => clone(getPath(data, f)) };
  }
  function querySnap(coll, docs) {
    return { docs, size: docs.length, empty: docs.length === 0, forEach: fn => docs.forEach(fn), query: coll };
  }

  function checkColl(coll) {
    if (!COLLECTIONS.includes(coll)) throw new Error("collection inconnue : " + coll);
    return coll;
  }
  function splitDocPath(path) {
    const parts = String(path).split("/").filter(Boolean);
    if (parts.length !== 2) throw new Error("chemin de document attendu « collection/identifiant » : " + path);
    return [checkColl(parts[0]), parts[1]];
  }

  class Query {
    constructor(coll, filters, order, lim) { this.coll = checkColl(coll); this.filters = filters || []; this.order = order || []; this.lim = lim == null ? null : lim; }
    where(field, op, value) {
      if (!OPS.includes(op)) throw new Error("opérateur non pris en charge : " + op);
      return new Query(this.coll, [...this.filters, [field, op, value]], this.order, this.lim);
    }
    orderBy(field, dir) { return new Query(this.coll, this.filters, [...this.order, [field, dir === "desc" ? -1 : 1]], this.lim); }
    limit(n) { return new Query(this.coll, this.filters, this.order, Math.max(0, n | 0)); }
    _apply() {
      const s = store[this.coll];
      let list = [...s.rows.entries()].map(([id, e]) => ({ id, e }));
      this.filters.forEach(([f, op, x]) => { list = list.filter(({ e }) => test(getPath(e.data, f), op, x)); });
      if (this.order.length) {
        list.sort((a, b) => {
          for (const [f, d] of this.order) { const r = cmp(getPath(a.e.data, f), getPath(b.e.data, f)); if (r) return r * d; }
          return cmp(a.id, b.id);
        });
      }
      if (this.lim != null) list = list.slice(0, this.lim);
      return querySnap(this.coll, list.map(({ id, e }) => docSnap(this.coll, id, e)));
    }
    async get() { await refresh(this.coll); if (!store[this.coll].loaded) throw new Error("lecture impossible"); return this._apply(); }
    onSnapshot(next, error) {
      const s = store[this.coll];
      const l = { emit: () => { try { next(this._apply()); } catch (e) { /* erreur de l'écouteur : n'arrête pas les autres */ } }, error: typeof error === "function" ? error : null };
      s.listeners.add(l);
      if (s.loaded) Promise.resolve().then(() => { if (s.listeners.has(l)) l.emit(); }); else refresh(this.coll);
      ensureLive();
      return () => { s.listeners.delete(l); };
    }
  }

  class CollectionRef extends Query {
    constructor(coll) { super(coll); this.id = coll; this.path = coll; }
    doc(id) { return new DocRef(this.coll, id == null ? newId() : String(id)); }
    async add(data) {
      const ref = new DocRef(this.coll, newId());
      await writeRow(this.coll, ref.id, data, "insert");
      return ref;
    }
  }

  class DocRef {
    constructor(coll, id) { this.coll = checkColl(coll); this.id = String(id); this.path = coll + "/" + this.id; }
    async get() {
      const r = await getClient().from(TABLE).select("doc_id,version,updated_at,data").eq("collection", this.coll).eq("doc_id", this.id).maybeSingle();
      if (r.error) throw r.error;
      return docSnap(this.coll, this.id, r.data ? { data: r.data.data } : null);
    }
    async set(data, options) {
      if (options && options.merge) {
        const cur = await this.get();
        return writeRow(this.coll, this.id, Object.assign({}, cur.exists ? cur.data() : {}, clone(data)), "upsert");
      }
      return writeRow(this.coll, this.id, data, "upsert");
    }
    async update(data) {
      const c = getClient();
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await c.from(TABLE).select("doc_id,version,data").eq("collection", this.coll).eq("doc_id", this.id).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) throw new Error("document absent : " + this.path);
        const merged = clone(r.data.data) || {};
        Object.entries(clone(data)).forEach(([k, v]) => {
          const keys = k.split("."); let o = merged;
          keys.slice(0, -1).forEach(p => { if (o[p] == null || typeof o[p] !== "object") o[p] = {}; o = o[p]; });
          o[keys[keys.length - 1]] = v;
        });
        let q = c.from(TABLE).update({ data: merged }).eq("collection", this.coll).eq("doc_id", this.id);
        if (r.data.version != null) q = q.eq("version", r.data.version);          // pas d'écrasement d'une modification concurrente
        const u = await q.select("doc_id");
        if (u.error) throw u.error;
        if ((u.data || []).length) { localSet(this.coll, this.id, merged); return; }
      }
      throw new Error("document modifié entre-temps : " + this.path);
    }
    onSnapshot(next, error) {
      return new Query(this.coll).onSnapshot(snap => {
        const d = snap.docs.find(x => x.id === this.id);
        next(d || docSnap(this.coll, this.id, null));
      }, error);
    }
  }

  function newId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) { /* repli ci-dessous */ }
    const b = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  async function writeRow(coll, id, data, mode) {
    if (!WRITABLE.includes(coll)) throw new Error("écriture refusée : la collection « " + coll + " » est en lecture seule");
    const payload = { collection: coll, doc_id: id, data: clone(data) || {} };
    const q = getClient().from(TABLE);
    const r = mode === "insert" ? await q.insert(payload) : await q.upsert(payload, { onConflict: "collection,doc_id" });
    if (r.error) throw r.error;
    localSet(coll, id, payload.data);
  }
  function localSet(coll, id, data) {
    const s = store[coll];
    if (s.loaded) { s.rows.set(id, { data: clone(data), stamp: "local" }); notify(coll); }
    schedule(coll);
  }
  function notify(coll) { store[coll].listeners.forEach(l => l.emit()); }

  // ------------------------------------------------------------------ temps réel et relecture
  let live = false, channel = null, realtimeOk = false, timer = null;
  function ensureLive() {
    if (live) return; live = true;
    const c = getClient();
    try {
      channel = c.channel("luna-documents")
        .on("postgres_changes", { event: "*", schema: SCHEMA, table: TABLE }, payload => {
          const coll = (payload && payload.new && payload.new.collection) || (payload && payload.old && payload.old.collection);
          if (coll && store[coll]) schedule(coll); else active().forEach(schedule);
        })
        .subscribe(status => { realtimeOk = status === "SUBSCRIBED"; });
    } catch (e) { realtimeOk = false; }
    timer = setInterval(tick, TICK_MS);
    const wake = () => { if (!root.document || !root.document.hidden) active().forEach(c2 => refresh(c2)); };
    if (root.document && root.document.addEventListener) root.document.addEventListener("visibilitychange", wake);
    if (root.addEventListener) { root.addEventListener("online", wake); root.addEventListener("pageshow", wake); root.addEventListener("focus", wake); }
  }
  function tick() {
    if (root.document && root.document.hidden) return;
    const every = realtimeOk ? SAFETY_MS : POLL_MS;
    active().forEach(c => { if (now() - store[c].last >= every) refresh(c); });
  }

  // ------------------------------------------------------------------ interface exposée à la page
  const db = {
    collection: path => new CollectionRef(String(path).split("/").filter(Boolean)[0]),
    doc: path => { const [c, id] = splitDocPath(path); return new DocRef(c, id); }
  };
  const user = {
    isOwner: async () => { await memberReady; return isOwnerSync(); },
    email: () => auth.email,
    name: () => (auth.member && auth.member.nom) || ""
  };

  root.lunaAuth = lunaAuth;
  root.claude = {
    async use(name) {
      if (name !== "db" && name !== "user") return null;
      startAuth();
      if (!getClient()) return null;
      await memberReady;
      return name === "db" ? db : user;
    }
  };
  // Pour les tests hors ligne seulement : état interne, jamais une donnée.
  root.__lunaInternals = { store, refresh, tick, isRealtime: () => realtimeOk, setRealtime: v => { realtimeOk = !!v; }, startAuth, POLL_MS, SAFETY_MS };
  startAuth();
})(typeof window !== "undefined" ? window : globalThis);
