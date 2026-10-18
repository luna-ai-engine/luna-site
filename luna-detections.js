/* Luna : « Nouvelle détection » dans Projets et Personnes repérées (site seulement ; fiche besoin
   docs/crm/FICHE_BESOIN_NOUVELLES_DETECTIONS_2026-10-15.md, critères ND1 à ND12).

   Ce fichier lit et écrit la seule collection « detections » de la base du site (un document par élément : « projet:<id> »
   ou « personne:<id de la fiche> », contenu { decision: "confirme" | "ecarte" | "annule", motif? }, auteur, date et version posés
   par la base). Il donne les décisions à la page commune (lunaPage.setDetections) et ajoute, en tête de chaque fiche projet ou
   personne ouverte, la zone de décision (Confirmer, Écarter avec motif facultatif, Annuler).
   Règles : rien n'est envoyé et rien n'entre dans le CRM (aucune autre écriture que « detections ») ; « Enregistré » seulement
   après la réponse de la base ; en cas d'échec, « non enregistré » et rien ne change ; une décision déjà prise par quelqu'un
   d'autre est relue puis affichée (ND10, version vérifiée par DocRef.change). « Annuler » écrit decision = "annule" : il n'y a
   aucune suppression. Aucune donnée personnelle ici ; la page privée ne charge jamais ce fichier. */
(function (root) {
  "use strict";
  const doc = root.document;
  if (!doc || !root.lunaSiteDb || !root.lunaSiteDb.detections) return;

  const TXT = {
    en: {
      title: "Decision", ignored: "A decision by another member is not applied.", await_d: "Waiting for David's decision.", confirm: "Confirm", dismiss: "Dismiss", undo: "Undo", credit: " (1 Apollo credit)",
      reason: "Reason (optional)", saving: "Saving…", saved: "Saved.",
      not_saved: "Not saved: nothing was changed. Try again.",
      note_projet: "Confirming puts this venue first in the search for decision-makers. Dismissing moves it to « Dismissed »; nothing is deleted. Nothing is sent and nothing enters the CRM.",
      note_personne: "Confirm validates this person at the next daily update; contact details are then completed by the team. Dismiss moves it to “Dismissed”; nothing is deleted. Nothing is sent and nothing enters the CRM.",
      pending: "Confirmed, applied at the next daily update.", dismissed: "Dismissed.", reason_is: m => `Reason: ${m}`,
      by_c: (by, on) => `Confirmed${by ? " by " + by : ""}${on ? " on " + on : ""}.`,
      by_d: (by, on) => `Dismissed${by ? " by " + by : ""}${on ? " on " + on : ""}.`,
      by_p: (by, on) => `Decided${by ? " by " + by : ""}${on ? " on " + on : ""}.`,
      already: (by, on) => `Already decided${by ? " by " + by : ""}${on ? " on " + on : ""}. Nothing was changed.`,
      already_undone: "This decision was already undone. Nothing was changed."
    },
    fr: {
      title: "Décision", ignored: "Décision d'un autre membre, non appliquée.", await_d: "Décision de David attendue.", confirm: "Confirmer", dismiss: "Écarter", undo: "Annuler", credit: " (1 crédit Apollo)",
      reason: "Motif (facultatif)", saving: "Enregistrement…", saved: "Enregistré.",
      not_saved: "Non enregistré : rien n'a changé. Réessayez.",
      note_projet: "Confirmer met cet établissement en tête de la recherche des décideurs. Écarter le range dans « Écartés » ; rien n'est supprimé. Rien n'est envoyé et rien n'entre dans le CRM.",
      note_personne: "Confirmer valide cette personne à la prochaine mise à jour quotidienne ; ses coordonnées sont ensuite complétées par l'équipe. Écarter la range dans « Écartés » ; rien n'est supprimé. Rien n'est envoyé et rien n'entre dans le CRM.",
      pending: "Confirmé, appliqué à la prochaine mise à jour quotidienne.", dismissed: "Écarté.", reason_is: m => `Motif : ${m}`,
      by_c: (by, on) => `Confirmé${by ? " par " + by : ""}${on ? " le " + on : ""}.`,
      by_d: (by, on) => `Écarté${by ? " par " + by : ""}${on ? " le " + on : ""}.`,
      by_p: (by, on) => `Décidé${by ? " par " + by : ""}${on ? " le " + on : ""}.`,
      already: (by, on) => `Déjà décidé${by ? " par " + by : ""}${on ? " le " + on : ""}. Rien n'a été changé.`,
      already_undone: "Cette décision a déjà été annulée. Rien n'a été changé."
    }
  };
  const lang = () => (String(doc.documentElement.lang || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  const t = (k, ...a) => { const v = TXT[lang()][k] !== undefined ? TXT[lang()][k] : TXT.en[k]; return typeof v === "function" ? v(...a) : v; };
  const isNode = v => !!v && typeof v === "object" && typeof v.nodeType === "number";
  function h(tag, props, ...kids) {
    const e = doc.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = String(v);
      else if (k === "disabled") e.disabled = !!v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    });
    kids.flat(Infinity).forEach(k => { if (k != null && k !== false && k !== "") e.append(isNode(k) ? k : doc.createTextNode(String(k))); });
    return e;
  }
  const when = s => {
    const d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleString(lang() === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  };

  // decider : vrai seulement si le rôle « decider » de crm.members (le compte de David) a pu être lu ; indéterminé ou illisible
  // (CRM fermé, erreur) : aucun bouton. La base de « detections » laisse écrire tous les membres (migration 0040) : la limite à
  // David est donc posée ici, dans l'écran.
  const D = { docs: new Map(), meta: new Map(), dbp: null, cur: null, started: false, decider: false, roleP: null, echo: new Map() };
  function loadRole() {
    if (D.roleP) return D.roleP;
    D.roleP = (async () => {
      try {
        const A = root.lunaCrm;
        const r = A && typeof A.start === "function" ? await A.start() : null;
        if (r && r.state === "ready" && r.me) { D.decider = !!r.me.decider; return true; }
      } catch (e) { /* rôle illisible : aucun bouton */ }
      D.decider = false; D.roleP = null; return false;     // nouvel essai à la prochaine ouverture
    })();
    return D.roleP;
  }
  // Seule lecture d'une décision : data.par_decideur (booléen posé par la base, vrai seulement si l'auteur de la version courante a le
  // rôle decider de crm.members ; absent = faux). Une décision d'un autre membre, ou la mise à jour par un autre membre d'un document
  // de David, ne compte pas : l'élément reste sans décision applicable. À adapter ici seulement si la base change.
  const eff = d => (d && d.par_decideur === true && ["confirme", "ecarte", "annule"].includes(d.decision) ? d.decision : "");
  const page = () => (root.lunaPage && typeof root.lunaPage.setDetections === "function" && typeof root.lunaPage.detInfo === "function" ? root.lunaPage : null);
  function getDb() {
    if (!D.dbp) D.dbp = (root.claude ? root.claude.use("db") : Promise.resolve(null)).then(d => d, () => null);
    return D.dbp;
  }
  const keyOf = (kind, id) => kind + ":" + id;

  // Décisions données à la page : seules comptent « confirme », « ecarte » et « annule » (l'annulation rend l'élément à « nouveau »).
  function push() {
    const pg = page();
    if (!pg) return;
    const entries = [];
    D.docs.forEach((d, id) => { const e = eff(d); if (e) entries.push([id, e]); });
    try { pg.setDetections(entries); } catch (e) { /* écran inchangé */ }
    paint();
  }

  async function loadMeta(key) {
    const d = D.docs.get(key);
    if (!["confirme", "ecarte"].includes(eff(d)) || D.meta.has(key)) return;
    D.meta.set(key, { loading: true });
    try {
      const db = await getDb();
      const m = await db.doc("detections/" + key).meta();
      D.meta.set(key, m.exists ? { by: m.updated_by || "", at: m.updated_at || "" } : { by: "", at: "" });
    } catch (e) { D.meta.delete(key); return; }
    paint();
  }

  function paint() {
    const P = D.cur;
    if (!P) return;
    if (!P.box.isConnected) { D.cur = null; return; }
    const pg = page(), info = pg ? pg.detInfo(P.kind, P.id) : null;
    if (!info || !info.state) { P.box.hidden = true; P.box.replaceChildren(); return; }
    P.box.hidden = false;
    const d = D.docs.get(P.key) || {}, kids = [h("h4", { text: t("title") })];
    const msg = P.msg ? h("p", { class: "det-msg " + (P.msg.bad ? "err" : P.msg.ok ? "ok" : ""), role: "status", "aria-live": "polite", text: P.msg.text }) : h("p", { class: "det-msg", role: "status" });
    if (info.state === "new") {
      const input = h("input", { type: "text", maxlength: 500, autocomplete: "off", "aria-label": t("reason") });
      input.value = P.reason || "";
      input.addEventListener("input", () => { P.reason = input.value; });
      const credit = P.kind === "personne" && !P.hasContact ? t("credit") : "";
      if (d.decision && !eff(d)) kids.push(h("p", { class: "det-who", text: t("ignored") }));
      if (!D.decider) kids.push(h("p", { class: "det-note", text: t("await_d") }));
      else kids.push(h("p", { class: "det-note", text: t("note_" + P.kind) }),
        h("label", { class: "det-reason" }, t("reason"), input),
        h("div", { class: "det-acts" },
          h("button", { type: "button", class: "btn primary", disabled: P.busy, text: t("confirm") + credit, onclick: () => decide("confirme") }),
          h("button", { type: "button", class: "btn", disabled: P.busy, text: t("dismiss"), onclick: () => decide("ecarte") })));
    } else {
      loadMeta(P.key);
      const m = D.meta.get(P.key) || {}, by = m.by || "", on = m.at ? when(m.at) : "";
      const known = eff(d) === "confirme" || eff(d) === "ecarte";
      if (info.applied || !known) kids.push(h("p", { text: known ? t(info.state === "confirme" ? "by_c" : "by_d", by, on) : (info.state === "confirme" ? t("by_c", "", "") : t("dismissed")) }));
      else if (info.state === "confirme") kids.push(h("p", { text: t("pending") }), h("p", { class: "det-who", text: t("by_c", by, on) }));
      else kids.push(h("p", { text: t("dismissed") }), h("p", { class: "det-who", text: t("by_d", by, on) }));
      if (info.state === "ecarte" && d.motif && known) kids.push(h("p", { class: "det-who", text: t("reason_is", d.motif) }));
      if (!info.applied && known && D.decider) kids.push(h("div", { class: "det-acts" }, h("button", { type: "button", class: "btn", disabled: P.busy, text: t("undo"), onclick: () => decide("annule") })));
    }
    kids.push(msg);
    P.box.replaceChildren(...kids);
  }

  // Une seule écriture à la fois par fiche. La base relit puis n'écrit que si la version n'a pas bougé (DocRef.change) : si
  // quelqu'un a décidé entre-temps, rien n'est écrit, la décision d'autrui est relue et affichée.
  async function decide(decision) {
    const P = D.cur;
    if (!P || P.busy || !D.decider) return;
    P.busy = true; P.msg = { text: t("saving") }; paint();
    const reason = String(P.reason || "").trim().slice(0, 500);
    try {
      const db = await getDb();
      if (!db) throw new Error("base absente");
      const done = await db.doc("detections/" + P.key).change(cur => {
        const have = eff(cur);
        if (decision === "annule" ? (have !== "confirme" && have !== "ecarte") : (have === "confirme" || have === "ecarte")) {
          const e = new Error("deja"); e.deja = true; throw e;
        }
        const next = { decision };
        if (decision === "ecarte" && reason) next.motif = reason;
        return next;
      });
      // L'écho local de la couche (avant la relecture de la base) ne porte pas par_decideur : nous n'écrivons que comme décideur.
      D.echo.set(P.key, done.decision); D.docs.set(P.key, Object.assign({}, done, { par_decideur: true })); D.meta.delete(P.key);
      P.reason = ""; P.msg = { text: t("saved"), ok: true };
      push();
    } catch (e) {
      if (e && e.deja) await settleConflict(P, decision);
      else P.msg = { text: t("not_saved"), bad: true };
    }
    P.busy = false; paint();
  }
  async function settleConflict(P, decision) {
    try {
      const db = await getDb();
      const m = await db.doc("detections/" + P.key).meta();
      if (m.exists) { D.docs.set(P.key, m.data); D.meta.set(P.key, { by: m.updated_by || "", at: m.updated_at || "" }); }
      try { await db.collection("detections").get(); } catch (e) { /* le cache se relira seul */ }
      P.msg = { text: decision === "annule" ? t("already_undone") : t("already", m.updated_by || "", m.updated_at ? when(m.updated_at) : ""), bad: true };
      push();
    } catch (e) { P.msg = { text: t("not_saved"), bad: true }; }
  }

  function onOpen(kind, ev) {
    const d = (ev && ev.detail) || {};
    if (!d.detections || !d.body || typeof d.body.insertBefore !== "function" || !d.id) return;
    const box = h("section", { class: "det-panel", "aria-label": t("title") });
    d.body.insertBefore(box, d.body.children[1] || null);
    D.cur = { kind, id: String(d.id), key: keyOf(kind, d.id), box, busy: false, msg: null, reason: "", hasContact: !!d.hasContact };
    paint();
    loadRole().then(() => paint());
  }

  async function start() {
    if (D.started) return;
    D.started = true;
    const db = await getDb();
    if (!db) return;
    db.collection("detections").onSnapshot(snap => {
      const next = new Map();
      snap.docs.forEach(x => {
        if (!x.exists) return;
        let v = x.data();
        if (typeof v.par_decideur === "boolean") D.echo.delete(x.id);                                  // valeur posée par la base
        else if (D.echo.get(x.id) === v.decision) v = Object.assign({}, v, { par_decideur: true });    // écho local de notre écriture
        next.set(x.id, v);
      });
      next.forEach((v, k) => { const o = D.docs.get(k); if (!o || o.decision !== v.decision || o.par_decideur !== v.par_decideur) D.meta.delete(k); });
      D.docs = next;
      push();
    }, () => {});
  }

  function init() {
    doc.addEventListener("luna:venue-open", ev => onOpen("projet", ev));
    doc.addEventListener("luna:person-open", ev => onOpen("personne", ev));
    try { new root.MutationObserver(() => paint()).observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] }); } catch (e) { /* facultatif */ }
    start();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
