/* Luna : écran de connexion du site autonome (« Continuer avec Google » uniquement, aucun mot de passe), bouton de
   déconnexion dans Paramètres et adresse email des demandes lue dans la base après connexion (jamais écrite dans le site
   public). S'appuie sur window.lunaAuth (luna-db.js). Bilingue : suit la langue de la page (attribut lang de <html>). */
(function (root) {
  "use strict";
  const doc = root.document;

  // La page ne s'affiche jamais dans le cadre d'un autre site (protection contre le détournement de clic) ; GitHub Pages ne
  // permet pas d'en-tête frame-ancestors. __LUNA_ALLOW_FRAME n'existe que dans le banc de rendu local.
  let framed = false;
  try { framed = root.top !== root.self; } catch (e) { framed = true; }
  if (framed && !root.__LUNA_ALLOW_FRAME) {
    doc.documentElement.style.display = "none";
    try { root.top.location.href = root.location.href; } catch (e) { /* cadre d'une autre origine : la page reste masquée */ }
    return;
  }

  const L = {
    en: {
      title: "Sign in", lead: "Sign in with your Google account. No password to create or remember.",
      google: "Continue with Google", opening: "Opening Google…",
      foot: "Access limited to the people registered by David.",
      err_failed: "Sign-in did not complete. Please try again.",
      err_start: "Google could not be reached. Check your internet connection and try again.",
      denied_title: "Restricted access", denied: "This access is restricted; ask David to add you.",
      denied_account: e => `Google account used: ${e}`, other: "Use another Google account",
      unconf: "Luna cannot connect right now. Check your internet connection, then reload the page.",
      error: "Luna could not check your access. Check your internet connection, then reload the page.", reload: "Reload",
      signout: "Sign out", session: "Session", signed_as: e => `Signed in with the Google account ${e}`
    },
    fr: {
      title: "Connexion", lead: "Connectez-vous avec votre compte Google. Aucun mot de passe à créer ni à retenir.",
      google: "Continuer avec Google", opening: "Ouverture de Google…",
      foot: "Accès réservé aux personnes inscrites par David.",
      err_failed: "La connexion n'a pas abouti. Réessayez.",
      err_start: "Google n'a pas pu être joint. Vérifiez votre connexion internet et réessayez.",
      denied_title: "Accès réservé", denied: "Cet accès est réservé ; demandez à David de vous ajouter.",
      denied_account: e => `Compte Google utilisé : ${e}`, other: "Utiliser un autre compte Google",
      unconf: "Luna ne peut pas se connecter pour le moment. Vérifiez votre connexion internet, puis rechargez la page.",
      error: "Luna n'a pas pu vérifier votre accès. Vérifiez votre connexion internet, puis rechargez la page.", reload: "Recharger",
      signout: "Se déconnecter", session: "Session", signed_as: e => `Connecté avec le compte Google ${e}`
    }
  };
  const lang = () => (String(doc.documentElement.lang || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  const t = k => (L[lang()][k] !== undefined ? L[lang()][k] : L.en[k]);
  const $ = id => doc.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  let view = "checking", lastState = null, formMsg = "", opening = null;   // opening : identifiant du bouton qui a lancé Google

  function show(v) {
    view = v;
    ["checking", "form", "denied", "unconf"].forEach(n => { const e = $("ll-" + n); if (e) e.hidden = n !== v; });
    translate();
  }
  function translate() {
    doc.querySelectorAll("[data-li]").forEach(e => { const v = t(e.dataset.li); if (typeof v === "string") e.textContent = v; });
    const en = $("ll-lang-en"), fr = $("ll-lang-fr");
    if (en && fr) { en.setAttribute("aria-pressed", String(lang() === "en")); fr.setAttribute("aria-pressed", String(lang() === "fr")); }
    const g = opening && $(opening); if (g) g.textContent = t("opening");
    const m = $("ll-form-msg"); if (m) { m.textContent = formMsg ? t(formMsg) : ""; m.className = "ll-msg" + (formMsg ? " err" : ""); }
    const acc = $("ll-denied-account");
    if (acc) { const e = lastState && lastState.email; acc.textContent = e ? t("denied_account")(e) : ""; acc.hidden = !e; }
    const u = $("ll-unconf-text"); if (u && lastState) u.textContent = t(lastState.state === "error" ? "error" : "unconf");
    if ($("luna-session-email") && lastState) $("luna-session-email").textContent = lastState.email ? t("signed_as")(lastState.email) : "";
  }

  async function google(btn) {
    if (opening) return;
    opening = btn.id; formMsg = ""; btn.disabled = true; translate();
    const r = await root.lunaAuth.signInWithGoogle();
    if (r && r.error) {
      // Aucune redirection : le bouton redevient utilisable.
      opening = null; btn.disabled = false; formMsg = "err_start";
      if (view !== "form") show("form"); else translate();
    }
    // Sinon la page part vers Google ; au retour (bouton précédent du navigateur) pageshow remet le bouton en état.
  }

  function onAuth(s) {
    lastState = s;
    const locked = s.state !== "member";
    doc.body.classList.toggle("luna-locked", locked);
    const box = $("luna-login"); if (box) box.hidden = !locked;
    if (s.state === "member") { translate(); watchAddress(); fitPlaceholders(); return; }
    if (s.state === "checking") show("checking");
    else if (s.state === "unconfigured" || s.state === "error") show("unconf");
    else if (s.state === "denied") show("denied");
    else if (s.state === "signed_out") {
      if (s.returnError === "failed" && !formMsg) formMsg = "err_failed";
      show("form");
    }
  }

  let addressWatched = false;
  async function watchAddress() {
    // Adresse des demandes par email : document « renata/site » de la base, lisible par les seuls membres connectés.
    if (addressWatched) return; addressWatched = true;
    try {
      const db = await root.claude.use("db"); if (!db) return;
      db.doc("renata/site").onSnapshot(d => {
        const a = d.exists ? String((d.data() || {}).adresse_demandes || "").trim() : "";
        const box = doc.querySelector(".mail"), code = $("req-address");
        if (code) code.textContent = EMAIL_RE.test(a) ? a : "";
        if (box) box.hidden = !EMAIL_RE.test(a);
      }, () => {});
    } catch (e) { /* adresse facultative */ }
  }

  // Écran étroit (téléphone) : une indication de champ trop longue pour sa case est remplacée par sa forme courte, sans rien
  // changer à la page ; la forme complète revient dès qu'elle tient (rotation, autre langue).
  const SHORT = {
    fr: { search_all: "Entreprise, contact, marché, sujet…", search_dir: "Établissement, lieu, concept, groupe", search_ct: "Nom, poste, groupe, établissement",
          search_opp: "Nom, lieu, concept", search_press: "Nom, lieu, concept", search_name: "Nom ou numéro de licence", search_dd: "Nom ou numéro de licence" },
    en: { search_all: "Company, contact, market, topic…", search_dir: "Venue, place, concept, group", search_ct: "Name, position, group, venue",
          search_opp: "Name, place, concept", search_press: "Name, place, concept", search_name: "Name or licence number", search_dd: "Name or licence number" }
  };
  let canvas = null;
  function fits(input, text) {
    if (!input.getClientRects().length) return true;
    canvas = canvas || doc.createElement("canvas");
    const ctx = canvas.getContext("2d"); if (!ctx) return true;
    const st = root.getComputedStyle(input, "::placeholder"), box = root.getComputedStyle(input);
    ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    const room = input.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
    return ctx.measureText(text).width <= room;
  }
  function fitPlaceholders() {
    doc.querySelectorAll("input[data-ph]").forEach(e => {
      const short = (SHORT[lang()] || {})[e.dataset.ph];
      if (!short) return;
      const full = e.placeholder === e.dataset.phShort ? (e.dataset.phFull || e.placeholder) : e.placeholder;
      e.dataset.phFull = full; e.dataset.phShort = short;
      e.placeholder = fits(e, full) ? full : short;
    });
  }

  function setPageLang(l) {
    // Passe par les boutons de langue de la page (Paramètres) : la page reste seule maîtresse de sa langue.
    const b = $(l === "fr" ? "lang-fr" : "lang-en"); if (b) b.click(); else doc.documentElement.lang = l;
  }

  function init() {
    if (!root.lunaAuth) return;
    $("ll-google").addEventListener("click", ev => google(ev.currentTarget));
    $("ll-other").addEventListener("click", ev => google(ev.currentTarget));
    $("ll-reload").addEventListener("click", () => root.location.reload());
    $("ll-lang-en").addEventListener("click", () => setPageLang("en"));
    $("ll-lang-fr").addEventListener("click", () => setPageLang("fr"));
    const out = $("luna-signout"); if (out) out.addEventListener("click", () => { out.disabled = true; root.lunaAuth.signOut(); });
    root.addEventListener("pageshow", ev => {
      // Retour arrière depuis Google (page restaurée du cache) : le bouton redevient utilisable.
      if (ev.persisted && opening) { opening = null; ["ll-google", "ll-other"].forEach(id => { const b = $(id); if (b) b.disabled = false; }); translate(); }
    });
    new MutationObserver(() => { translate(); fitPlaceholders(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
    // Un panneau caché n'a pas de largeur : l'ajustement se refait à chaque changement de panneau et de taille d'écran.
    doc.addEventListener("click", ev => { if (ev.target.closest && ev.target.closest(".nav button, .subtabs button")) setTimeout(fitPlaceholders, 0); });
    root.addEventListener("resize", () => setTimeout(fitPlaceholders, 50));
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitPlaceholders);
    root.lunaAuth.onChange(onAuth);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(window);
