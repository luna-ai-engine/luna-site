/* Luna : adaptateur de données du CRM, sur le site autonome seulement (chantier 1 du mandat CRM ; tables, vues et règles
   d'accès de Sun, migrations 0034 et 0035).

   Fournit aux écrans du CRM (luna-crm.js) window.lunaCrm, au-dessus du même client supabase-js que la page (luna-db.js,
   lunaAuth.client()), le schéma crm étant choisi appel par appel.

   Règles :
   - La page privée ne charge jamais ce fichier : le CRM ne se voit que sur le site (mandat CRM, règle 3 g).
   - Clé publique seule (config.js, par luna-db.js) ; aucune clé secrète, aucun rôle de service. Les règles d'accès de la base
     décident en dernier ressort : Renata et David seulement, droits réservés à David refusés par la base elle-même.
   - Tant que le schéma crm n'est pas ouvert dans l'API (décision de David), start() rend « closed » : les écrans affichent
     un message clair, jamais une erreur.
   - Chaque mise à jour renvoie la version lue ; sans elle, l'adaptateur refuse avant tout appel (la base refuserait aussi,
     428). Version dépassée : la base refuse (409), rendu en erreur « conflict » ; rien n'est écrasé.
   - Recherches : le texte cherché part dans le corps de la requête (fonctions search_companies et search_contacts, appel
     POST), jamais dans l'adresse, qui reste un temps dans les journaux de Supabase (avis de Sayid, condition 9). Aucun nom,
     email ni téléphone n'est mis dans un filtre d'adresse : seulement des identifiants, des codes de listes fixes et des dates.
   - Écritures : champs permis seulement (FIELDS). « Ne pas contacter », revue, archivage et restauration sont des actions
     séparées, pour que l'historique les nomme exactement ; suppression définitive par la seule fonction delete_record (David).
   - Nouveau contact avec ses coordonnées : un seul appel, la fonction create_contact (contrat 1 avec Sun, migration 0036),
     tout ou rien ; aucun repli vers une création en plusieurs appels (critère TR10).
   - Erreurs : un code (kind, detail), jamais le texte de la base, écrit en français alors que l'écran de Renata est en anglais.
   - Lot 3 de Projects (migration 0038 de Sun, contrat docs/crm/CONTRAT_LOT3_PROJETS.md) : l'affaire liée à un projet se crée
     avec son lien (page_opportunity et identifiant lic-/nom- du projet), posé ici seulement, jamais par un formulaire ; les
     affaires liées se lisent toutes (aucun identifiant de projet dans l'adresse : un identifiant nom- reprend un nom) ; le
     décideur se crée en un seul appel, crm.create_deal_decision_maker, tout ou rien. Tant que 0038 n'est pas en ligne
     (colonne project_category absente), la lecture se replie sans la catégorie et le dit (lot3 faux), sans erreur.
   - Lien LinkedIn d'un contact (contrat, section 10, décision de David du 02/10/2026) : champ linkedin_url, forme unique
     https://www.linkedin.com/in/<identifiant>, ramenée à cette forme et contrôlée ici comme par la base (fonction
     crm.normalize_linkedin_url et déclencheur crm.tg_contacts_linkedin de 0038) pour le dire tout de suite ; la base décide
     en dernier ressort. Tant que 0038 n'est pas en ligne, la fiche contact se lit sans ce champ (linkedin_ready faux) et
     un lien saisi est refusé en « not_ready », jamais envoyé ailleurs. */
(function (root) {
  "use strict";

  const SCHEMA = "crm";
  const LIMIT = 1000;
  const PAGE_DOC_KEY = /^[A-Za-z0-9_.:@+-]{1,200}$/;

  // Colonnes lues par les écrans, jamais « * » sur une vue : la clé de recherche (search_key) recopie noms et emails.
  const COLS = {
    member: "label,role",
    list_item: "id,kind,code,label_en,label_fr,position,stage_outcome,is_locked,archived_at,archived_by,version",
    review_period: "id,nature,months,version",
    pipeline: "stage_id,position,label_en,label_fr,stage_outcome,stage_archived,deal_count,value_aed_total",
    company_row: "id,name,status,city_or_emirate,group_ids,sector_ids,tag_ids,auto_groups,primary_contact_id,primary_contact_first_name,primary_contact_last_name,open_deal_count,last_contact_at,archived_at,archived_by,version",
    company: "id,name,status,status_since,source_id,group_ids,sector_ids,tag_ids,website,city_or_emirate,country_code,primary_contact_id,archived_at,archived_by,version,auto_groups,primary_contact_first_name,primary_contact_last_name,open_deal_count,last_contact_at",
    company_dup: "id,name,status,city_or_emirate,archived_at",
    contact_row: "id,first_name,last_name,job_title,company_id,company_name,company_status,decision_role,nature,group_ids,tag_ids,auto_groups,do_not_contact,review_due,review_due_on,is_primary_contact,primary_email,archived_at,archived_by,version",
    contact: "id,first_name,last_name,job_title,company_id,brand_id,decision_role,preferred_language,nature,source_id,group_ids,tag_ids,next_step,follow_up_on,do_not_contact,dnc_since,dnc_by,dnc_reason,review_due_on,last_reviewed_at,last_reviewed_by,archived_at,archived_by,version,company_name,company_status,is_primary_contact,review_due,auto_groups,primary_email,last_contact_at,linkedin_url",
    // Repli tant que la migration 0038 (linkedin_url) n'est pas en ligne.
    contact_base: "id,first_name,last_name,job_title,company_id,brand_id,decision_role,preferred_language,nature,source_id,group_ids,tag_ids,next_step,follow_up_on,do_not_contact,dnc_since,dnc_by,dnc_reason,review_due_on,last_reviewed_at,last_reviewed_by,archived_at,archived_by,version,company_name,company_status,is_primary_contact,review_due,auto_groups,primary_email,last_contact_at",
    contact_dup: "id,first_name,last_name,company_id,company_name,archived_at",
    deal_row: "id,name,company_id,company_name,stage_id,stage_outcome,value_aed,next_step,follow_up_on,days_in_stage,closed_on,close_reason_id,service_ids,source_id,is_renewal,engine_link_kind,engine_link_key,archived_at,archived_by,version",
    deal: "id,name,company_id,brand_id,outlet_id,primary_contact_id,stage_id,stage_entered_at,service_ids,value_aed,is_renewal,source_id,referred_by_company_id,referred_by_contact_id,expected_decision_on,next_step,follow_up_on,close_reason_id,closed_on,engine_link_kind,engine_link_key,archived_at,archived_by,version,stage_outcome,company_name,days_in_stage,last_contact_at",
    // Lot 3 : affaires liées aux projets (project_deal_base : repli tant que la colonne project_category n'est pas en ligne).
    project_deal: "id,engine_link_key,stage_id,stage_outcome,close_reason_id,closed_on,primary_contact_id,project_category,version",
    project_deal_base: "id,engine_link_key,stage_id,stage_outcome,close_reason_id,closed_on,primary_contact_id,version",
    brand: "id,name,company_id,sector_id,archived_at,archived_by,version",
    outlet: "id,name,company_id,brand_id,city_or_emirate,district,country_code,archived_at,archived_by,version",
    contact_email: "id,contact_id,email,state,is_primary,archived_at,archived_by,version",
    contact_email_owner: "contact_id,email",
    contact_phone: "id,contact_id,phone,phone_type,archived_at,archived_by,version",
    note: "id,kind,body,occurred_at,company_id,contact_id,deal_id,brand_id,outlet_id,archived_at,archived_by,created_by,version",
    journal: "id,at,actor,record_type,record_id,parent_type,parent_id,action,changed_fields,old_values,new_values,reason",
    name_company: "id,name",
    name_contact: "id,first_name,last_name,company_id,archived_at",
    name_deal: "id,name",
    preview: "item_type,item_id,effect"
  };

  // Tables écrites et champs que les écrans peuvent y poser (les dates, auteurs et versions sont posés par la base).
  const TABLES = {
    list_item: "list_items", review_period: "review_periods", company: "companies", brand: "brands", outlet: "outlets",
    contact: "contacts", contact_email: "contact_emails", contact_phone: "contact_phones", deal: "deals", note: "notes"
  };
  const FIELDS = {
    list_item: ["label_en", "label_fr", "position"],
    review_period: ["months"],
    company: ["name", "status", "source_id", "group_ids", "sector_ids", "tag_ids", "website", "city_or_emirate", "country_code", "primary_contact_id"],
    brand: ["name", "sector_id"],
    outlet: ["name", "brand_id", "city_or_emirate", "district", "country_code"],
    contact: ["first_name", "last_name", "job_title", "company_id", "brand_id", "decision_role", "preferred_language", "nature", "source_id",
              "group_ids", "tag_ids", "next_step", "follow_up_on", "linkedin_url"],
    contact_email: ["email", "state", "is_primary"],
    contact_phone: ["phone", "phone_type"],
    deal: ["name", "company_id", "brand_id", "outlet_id", "primary_contact_id", "stage_id", "service_ids", "value_aed", "is_renewal", "source_id",
           "referred_by_company_id", "referred_by_contact_id", "expected_decision_on", "next_step", "follow_up_on", "close_reason_id", "closed_on",
           "project_category"],
    note: ["kind", "body", "occurred_at", "company_id", "contact_id", "deal_id", "brand_id", "outlet_id"]
  };
  // Posés seulement à la création : la liste d'un élément, la fiche à laquelle appartient une marque, un point de vente, un
  // email ou un téléphone.
  const ON_INSERT = { list_item: ["kind"], brand: ["company_id"], outlet: ["company_id"], contact_email: ["contact_id"], contact_phone: ["contact_id"] };
  const INSERTABLE = ["list_item", "company", "brand", "outlet", "contact", "contact_email", "contact_phone", "deal", "note"];
  const ARCHIVABLE = ["list_item", "company", "brand", "outlet", "contact", "contact_email", "contact_phone", "deal", "note"];
  const DELETABLE = ["company", "brand", "outlet", "contact", "contact_email", "contact_phone", "deal", "note"];

  // Codes des listes fixes (domaines de la migration 0034) : seuls codes admis dans un filtre d'adresse.
  const CODES = {
    status: ["prospect", "current_client", "past_client", "partner_supplier", "media"],
    nature: ["client", "prospect", "press", "influencer_creator", "partner_supplier", "other"],
    auto_group: ["current_clients", "past_clients", "prospects_leads", "editors_journalists", "influencers_creators", "suppliers_partners"],
    list_kind: ["group", "tag", "sector", "service", "source", "stage", "win_reason", "loss_reason"],
    deletion_reason: ["erasure_request", "duplicate", "entry_error", "other"],
    // Domaine crm.project_category (migration 0038) : les huit codes du lot 2 de l'export, jamais to_classify.
    project_category: ["hotel", "nightclub", "lounge", "wellness_cafe", "fine_dining", "upscale_casual", "casual_dining", "dinner_show"]
  };
  // Identifiant d'un projet de la page, tel que l'exige la contrainte deals_engine_link_chk (migration 0034).
  const PROJECT_KEY = /^(lic|nom)-[A-Za-z0-9._-]{1,200}$/;

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const isUuid = v => UUID.test(String(v == null ? "" : v));
  const idList = list => [...new Set((list || []).filter(isUuid))];
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max || 200);
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // Mêmes formes que la base : contrôlées avant l'envoi pour que l'écran le dise tout de suite. Email : forme commune du
  // contrat 2 avec Sun (après espaces retirés et minuscules, 254 caractères au plus) ; ni « ? », ni « & », ni « = », ni
  // « % », ni « # » : une adresse ne peut pas porter de copie cachée, d'objet ou de texte dans un lien mailto:.
  const EMAIL_RE = /^[a-z0-9._'+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  const PHONE_RE = /^\+?[0-9][0-9 ().-]{3,30}$/;
  // LinkedIn : mêmes étapes que crm.normalize_linkedin_url (http vers https, linkedin.com ou fr.linkedin.com vers
  // www.linkedin.com, barres finales retirées), puis même forme que la contrainte contacts_linkedin_chk de 0038.
  const LINKEDIN_RE = /^https:\/\/www\.linkedin\.com\/in\/(?:[A-Za-z0-9-]|%[0-9A-Fa-f]{2}){3,100}$/;
  // Une adresse collée sans « https:// » (www.linkedin.com/in/…, recette de Jacob du 02/10/2026) reçoit ce début ici, l'écran
  // envoyant toujours la forme complète ; la base, elle, n'ajoute rien.
  const normLinkedin = v => String(v == null ? "" : v).trim().replace(/^((?:www\.|fr\.)?linkedin\.com\/)/i, "https://$1").replace(/^http:\/\//, "https://")
    .replace(/^https:\/\/(linkedin\.com|fr\.linkedin\.com)\//, "https://www.linkedin.com/").replace(/\/+$/, "");
  const valid = {
    linkedin: v => { const u = normLinkedin(v); return LINKEDIN_RE.test(u) ? u : null; },
    email: v => { const e = String(v == null ? "" : v).trim().toLowerCase(); return e.length <= 254 && EMAIL_RE.test(e) ? e : null; },
    phone: v => { const p = String(v == null ? "" : v).trim(); return PHONE_RE.test(p) ? p : null; }
  };

  // ------------------------------------------------------------------ erreurs
  class CrmError extends Error {
    constructor(kind, detail, status) {
      super("crm:" + kind + (detail ? ":" + detail : ""));
      this.name = "CrmError"; this.kind = kind; this.detail = detail || ""; this.status = status || 0;
    }
  }
  // Nature précise d'un refus de la base, lue dans son message (sans jamais le recopier).
  const DETAILS = [
    [/adresse email mal form/i, "email"],
    [/t[ée]l[ée]phone mal form/i, "phone"],
    [/pr[ée]nom ou un nom est obligatoire/i, "name"],
    [/libell[ée] anglais est obligatoire/i, "label_en"],
    [/au moins une [ée]tape ouverte/i, "last_open_stage"],
    [/se renomme mais ne s'archive pas/i, "locked"],
    [/archiv[ée] ne peut plus [êe]tre choisi/i, "archived_choice"],
    [/figure d[ée]j[àa] sur ce contact/i, "email_twice"],
    [/motif de gain ou de perte|motif doit venir de la liste|motif de suppression/i, "reason"],
    [/adresse web invalide/i, "website"],
    [/pays en code de deux lettres/i, "country"],
    [/porte encore des contacts ou des affaires/i, "blocks"],
    [/dur[ée]e de revue compte/i, "months"],
    [/valeur en AED/i, "value"],
    [/deals_one_active_per_engine_link/i, "linked_twice"],
    [/lien LinkedIn invalide/i, "linkedin"],
    [/nom de la personne est obligatoire/i, "name"],
    [/identifiant de la fiche d.origine/i, "person"]
  ];
  function detailOf(message) {
    const hit = DETAILS.find(([re]) => re.test(String(message || "")));
    return hit ? hit[1] : "";
  }
  function classify(res) {
    if (!res || !res.error) return null;
    const e = res.error, code = String(e.code || ""), message = String(e.message || ""), status = Number(res.status) || 0;
    let kind;
    if (code === "PGRST106" || code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883" || code === "3F000"
        || (status === 406 && /schema/i.test(message))) kind = "closed";            // schéma crm pas (encore) ouvert dans l'API
    else if (code === "42703" || code === "PGRST204") kind = "not_ready";               // colonne pas encore en ligne (0038)
    else if (code === "PT409") kind = "conflict";                                    // version dépassée : modifiée entre-temps
    else if (code === "PT428") kind = "version";                                     // version absente
    else if (code === "42501") kind = "forbidden";                                   // droit réservé à David, ou non-membre
    else if (code === "P0002" || code === "PGRST116") kind = "not_found";
    else if (/^2[23]/.test(code)) kind = "invalid";                                   // contrainte, champ obligatoire, format
    else if (!status || status === 0) kind = "offline";                               // connexion coupée, base injoignable
    else kind = "error";
    return new CrmError(kind, detailOf(message), status);
  }

  async function run(builder) {
    let res;
    try { res = await builder; } catch (e) { throw new CrmError("offline"); }
    const err = classify(res);
    if (err) throw err;
    return res.data;
  }

  async function db() {
    const auth = root.lunaAuth;
    const c = auth && typeof auth.client === "function" ? await auth.client() : null;
    if (!c || typeof c.schema !== "function") throw new CrmError("offline");
    return c.schema(SCHEMA);
  }

  const archivedFilter = (q, archived) => (archived ? q.not("archived_at", "is", null) : q.is("archived_at", null));
  function withGroup(q, group) {
    if (isUuid(group)) return q.contains("group_ids", [group]);
    if (CODES.auto_group.includes(group)) return q.contains("auto_groups", [group]);
    return q;
  }
  function pick(values, allowed) {
    const out = {};
    allowed.forEach(k => {
      if (values && Object.prototype.hasOwnProperty.call(values, k)) out[k] = values[k] === "" || values[k] === undefined ? null : values[k];
    });
    return out;
  }
  function needVersion(v) {
    if (!Number.isInteger(v) || v < 1) throw new CrmError("version");
    return v;
  }

  // ------------------------------------------------------------------ accès
  async function start() {
    // Une seule lecture : la ligne de la personne connectée dans crm.members (règle de la base : chacun ne lit que la sienne).
    try {
      const s = await db();
      const rows = await run(s.from("members").select(COLS.member).limit(2));
      const me = (rows || [])[0];
      if (!me) return { state: "denied" };
      return { state: "ready", me: { label: String(me.label || ""), decider: me.role === "decider" } };
    } catch (e) {
      const kind = e && e.kind;
      return { state: kind === "closed" ? "closed" : kind === "forbidden" ? "denied" : "offline" };
    }
  }

  // ------------------------------------------------------------------ lectures
  async function lists() {
    const s = await db();
    return run(s.from("list_items").select(COLS.list_item).order("kind", { ascending: true }).order("position", { ascending: true }).limit(LIMIT));
  }
  async function reviewPeriods() {
    const s = await db();
    return run(s.from("review_periods").select(COLS.review_period).limit(20));
  }
  async function pipeline() {
    const s = await db();
    return run(s.from("pipeline_summary").select(COLS.pipeline).order("position", { ascending: true }).limit(200));
  }

  async function companies(f) {
    f = f || {};
    const s = await db(), q0 = text(f.q);
    let q = q0 ? s.rpc("search_companies", { p_query: q0 }).select(COLS.company_row) : s.from("company_overview").select(COLS.company_row);
    q = archivedFilter(q, !!f.archived);
    if (CODES.status.includes(f.status)) q = q.eq("status", f.status);
    q = withGroup(q, f.group);
    if (isUuid(f.sector)) q = q.contains("sector_ids", [f.sector]);
    if (isUuid(f.tag)) q = q.contains("tag_ids", [f.tag]);
    return run(q.order("name", { ascending: true }).limit(LIMIT));
  }

  async function contacts(f) {
    f = f || {};
    const s = await db(), q0 = text(f.q);
    let q = q0 ? s.rpc("search_contacts", { p_query: q0 }).select(COLS.contact_row) : s.from("contact_overview").select(COLS.contact_row);
    q = archivedFilter(q, !!f.archived);
    if (isUuid(f.company)) q = q.eq("company_id", f.company);
    if (CODES.nature.includes(f.nature)) q = q.eq("nature", f.nature);
    if (CODES.status.includes(f.companyStatus)) q = q.eq("company_status", f.companyStatus);
    q = withGroup(q, f.group);
    if (isUuid(f.tag)) q = q.contains("tag_ids", [f.tag]);
    if (f.review) q = q.eq("review_due", true);
    if (f.dnc) q = q.eq("do_not_contact", true);
    return run(q.order("last_name", { ascending: true, nullsFirst: false }).order("first_name", { ascending: true, nullsFirst: false }).limit(LIMIT));
  }

  async function deals(f) {
    f = f || {};
    const s = await db();
    let q = archivedFilter(s.from("deal_overview").select(COLS.deal_row), !!f.archived);
    if (isUuid(f.stage)) q = q.eq("stage_id", f.stage);
    if (f.outcome === "open") q = q.eq("stage_outcome", "open");
    else if (f.outcome === "closed") q = q.in("stage_outcome", ["won", "lost"]);
    if (isUuid(f.company)) q = q.eq("company_id", f.company);
    if (isUuid(f.service)) q = q.contains("service_ids", [f.service]);
    if (isUuid(f.source)) q = q.eq("source_id", f.source);
    if (f.noNextStep) q = q.is("next_step", null);
    if (DAY.test(String(f.closedFrom || ""))) q = q.gte("closed_on", f.closedFrom);
    if (DAY.test(String(f.closedTo || ""))) q = q.lte("closed_on", f.closedTo);
    q = f.outcome === "closed" ? q.order("closed_on", { ascending: false, nullsFirst: false })
                               : q.order("follow_up_on", { ascending: true, nullsFirst: false });
    return run(q.order("name", { ascending: true, nullsFirst: false }).limit(LIMIT));
  }

  async function one(view, cols, id) {
    if (!isUuid(id)) throw new CrmError("not_found");
    const s = await db();
    const rows = await run(s.from(view).select(cols).eq("id", id).limit(1));
    if (!rows || !rows.length) throw new CrmError("not_found");
    return rows[0];
  }
  const company = id => one("company_overview", COLS.company, id);
  // Fiche contact : avec linkedin_url (0038) ; sinon relue sans, marquée linkedin_ready faux.
  const feature = { linkedin: null };
  async function contact(id) {
    try { const r = await one("contact_overview", COLS.contact, id); feature.linkedin = true; return Object.assign(r, { linkedin_ready: true }); }
    catch (e) { if (!e || e.kind !== "not_ready") throw e; }
    feature.linkedin = false;
    return Object.assign(await one("contact_overview", COLS.contact_base, id), { linkedin_url: null, linkedin_ready: false });
  }
  // LinkedIn disponible : vrai, faux, ou null tant qu'aucune lecture ne l'a dit.
  const linkedinReady = () => feature.linkedin;
  function checkLinkedin(payload, key) {
    if (!(key in payload) || payload[key] == null || payload[key] === "") return;
    if (feature.linkedin === false) throw new CrmError("not_ready", "linkedin");
    const u = valid.linkedin(payload[key]);
    if (!u) throw new CrmError("invalid", "linkedin");
    payload[key] = u;
  }
  // Fonction de la base absente alors qu'un lien LinkedIn part : base d'avant 0038, dit comme tel.
  const linkedinMissing = (e, args) => (e && e.kind === "closed" && args.p_linkedin_url ? new CrmError("not_ready", "linkedin") : e);
  const deal = id => one("deal_overview", COLS.deal, id);

  async function childrenOf(table, cols, key, id, order) {
    if (!isUuid(id)) return [];
    const s = await db();
    let q = s.from(table).select(cols).eq(key, id);
    (order || []).forEach(([c, asc]) => { q = q.order(c, { ascending: asc, nullsFirst: false }); });
    return run(q.limit(LIMIT));
  }
  const brands = companyId => childrenOf("brands", COLS.brand, "company_id", companyId, [["name", true]]);
  const outlets = companyId => childrenOf("outlets", COLS.outlet, "company_id", companyId, [["name", true]]);
  const emails = contactId => childrenOf("contact_emails", COLS.contact_email, "contact_id", contactId, [["is_primary", false], ["created_at", true]]);
  const phones = contactId => childrenOf("contact_phones", COLS.contact_phone, "contact_id", contactId, [["created_at", true]]);

  // Notes et échanges rattachés à une fiche (pour une entreprise : aussi ceux de ses contacts et de ses affaires).
  async function notes(f) {
    f = f || {};
    const parts = [];
    if (isUuid(f.company)) parts.push(`company_id.eq.${f.company}`);
    if (isUuid(f.contact)) parts.push(`contact_id.eq.${f.contact}`);
    if (isUuid(f.deal)) parts.push(`deal_id.eq.${f.deal}`);
    const cs = idList(f.contacts), ds = idList(f.deals);
    if (cs.length) parts.push(`contact_id.in.(${cs.join(",")})`);
    if (ds.length) parts.push(`deal_id.in.(${ds.join(",")})`);
    if (!parts.length) return [];
    const s = await db();
    return run(s.from("notes").select(COLS.note).or(parts.join(",")).order("occurred_at", { ascending: false }).limit(LIMIT));
  }
  async function notesByIds(ids) {
    const list = idList(ids);
    if (!list.length) return [];
    const s = await db();
    return run(s.from("notes").select(COLS.note).in("id", list).limit(LIMIT));
  }

  // Historique d'une fiche et de ce qui lui est rattaché, du plus récent au plus ancien.
  async function history(recordIds, parentId) {
    const list = idList(recordIds), parts = [];
    if (list.length) parts.push(`record_id.in.(${list.join(",")})`);
    if (isUuid(parentId)) parts.push(`parent_id.eq.${parentId}`);
    if (!parts.length) return [];
    const s = await db();
    return run(s.from("journal").select(COLS.journal).or(parts.join(",")).order("at", { ascending: false }).order("id", { ascending: false }).limit(200));
  }

  // Noms des fiches citées par identifiant (« recommandé par », contact principal archivé, fiche d'une note).
  async function names(kind, ids) {
    const list = idList(ids);
    if (!list.length) return [];
    const src = { company: ["companies", COLS.name_company], contact: ["contacts", COLS.name_contact], deal: ["deals", COLS.name_deal] }[kind];
    if (!src) return [];
    const s = await db();
    return run(s.from(src[0]).select(src[1]).in("id", list).limit(LIMIT));
  }

  // ------------------------------------------------------------------ doublons (avertir, jamais fusionner)
  async function sameNameCompanies(name) {
    const n = text(name);
    if (!n) return [];
    const s = await db();
    const rows = await run(s.rpc("search_companies", { p_query: n }).select(COLS.company_dup).limit(50));
    return (rows || []).filter(r => fold(r.name) === fold(n));
  }
  async function emailOwners(email, exceptContactId) {
    const e = valid.email(email);
    if (!e) return [];
    const s = await db();
    const found = (await run(s.rpc("search_contacts", { p_query: e }).select(COLS.contact_dup).limit(50)) || [])
      .filter(r => r.id !== exceptContactId);
    if (!found.length) return [];
    const mails = await run(s.from("contact_emails").select(COLS.contact_email_owner).in("contact_id", idList(found.map(r => r.id)))
      .is("archived_at", null).limit(LIMIT));
    const owners = new Set((mails || []).filter(m => m.email === e).map(m => m.contact_id));
    return found.filter(r => owners.has(r.id));
  }
  async function sameNameContacts(first, last, companyId, exceptContactId) {
    const q = [text(first, 100), text(last, 100)].filter(Boolean).join(" ");
    if (!q || !isUuid(companyId)) return [];
    const s = await db();
    const rows = await run(s.rpc("search_contacts", { p_query: q }).select(COLS.contact_dup).eq("company_id", companyId).limit(50));
    return (rows || []).filter(r => r.id !== exceptContactId && fold(r.first_name) === fold(first) && fold(r.last_name) === fold(last));
  }

  // ------------------------------------------------------------------ écritures
  async function writeOne(table, id, payload) {
    if (!isUuid(id)) throw new CrmError("not_found");
    const s = await db();
    const rows = await run(s.from(table).update(payload).eq("id", id).select("*"));
    if (!rows || !rows.length) throw new CrmError("not_found");    // fiche disparue, ou invisible pour ce compte
    return rows[0];
  }

  async function insert(type, values) {
    if (!INSERTABLE.includes(type)) throw new CrmError("invalid");
    const payload = pick(values, FIELDS[type].concat(ON_INSERT[type] || []));
    if (type === "contact") checkLinkedin(payload, "linkedin_url");
    if (type === "list_item" && !CODES.list_kind.includes(payload.kind)) throw new CrmError("invalid");
    const s = await db();
    const rows = await run(s.from(TABLES[type]).insert(payload).select("*"));
    if (!rows || !rows.length) throw new CrmError("error");
    return rows[0];
  }

  function checkCategory(payload) {
    if (payload.project_category != null && !CODES.project_category.includes(payload.project_category)) throw new CrmError("invalid", "category");
  }

  async function update(type, id, version, changes) {
    if (!FIELDS[type]) throw new CrmError("invalid");
    const payload = pick(changes, FIELDS[type]);
    checkCategory(payload);
    if (type === "contact") checkLinkedin(payload, "linkedin_url");
    if (!Object.keys(payload).length) throw new CrmError("invalid", "nothing");
    payload.version = needVersion(version);
    return writeOne(TABLES[type], id, payload);
  }

  async function archive(type, id, version) {
    if (!ARCHIVABLE.includes(type)) throw new CrmError("invalid");
    // La base pose la date et l'auteur de l'archivage ; seule compte ici la présence d'une date.
    return writeOne(TABLES[type], id, { archived_at: new Date().toISOString(), version: needVersion(version) });
  }
  async function restore(type, id, version) {
    if (!ARCHIVABLE.includes(type)) throw new CrmError("invalid");
    return writeOne(TABLES[type], id, { archived_at: null, version: needVersion(version) });
  }

  // « Ne pas contacter » : activation (motif obligatoire ; date et auteur posés par la base) et retrait (Renata ou David,
  // décision D5), chacun seul dans sa mise à jour : l'historique note dnc_on ou dnc_off, jamais un archivage.
  async function setDoNotContact(id, version, reason) {
    const r = text(reason, 500);
    if (!r) throw new CrmError("invalid", "reason");
    return writeOne("contacts", id, { do_not_contact: true, dnc_reason: r, version: needVersion(version) });
  }
  async function removeDoNotContact(id, version) {
    return writeOne("contacts", id, { do_not_contact: false, version: needVersion(version) });
  }

  // Nouveau contact et ses coordonnées (critère TR10) : un seul appel à crm.create_contact (contrat 1 avec Sun). La base crée le
  // contact, son email principal, son téléphone et, si demandé, le désigne comme contact principal de son entreprise, dans une
  // seule transaction : après tout refus ou toute coupure, rien n'est créé. Une clé absente prend la valeur par défaut de la
  // fonction. Email et téléphone contrôlés avant l'appel, pour que l'écran le dise tout de suite.
  const CREATE_CONTACT = { first_name: "p_first_name", last_name: "p_last_name", job_title: "p_job_title", company_id: "p_company_id",
    brand_id: "p_brand_id", decision_role: "p_decision_role", preferred_language: "p_preferred_language", nature: "p_nature",
    source_id: "p_source_id", email: "p_email", email_state: "p_email_state", phone: "p_phone", phone_type: "p_phone_type",
    make_main: "p_make_main", linkedin_url: "p_linkedin_url" };
  async function createContact(values) {
    const v = values || {}, args = {};
    Object.entries(CREATE_CONTACT).forEach(([k, arg]) => {
      const x = v[k];
      if (x === undefined || x === null || x === "" || (k === "make_main" && x !== true)) return;
      args[arg] = typeof x === "string" ? x.trim() : x;
    });
    if (args.p_email !== undefined) { const e = valid.email(args.p_email); if (!e) throw new CrmError("invalid", "email"); args.p_email = e; }
    if (args.p_phone !== undefined) { const p = valid.phone(args.p_phone); if (!p) throw new CrmError("invalid", "phone"); args.p_phone = p; }
    checkLinkedin(args, "p_linkedin_url");
    const s = await db();
    let r;
    try { r = await run(s.rpc("create_contact", args)); } catch (e) { throw linkedinMissing(e, args); }
    const row = Array.isArray(r) ? r[0] : r;
    if (!row || !row.id) throw new CrmError("error");
    return row;
  }

  // ------------------------------------------------------------------ lot 3 de Projects : affaires liées aux projets
  // Toutes les affaires actives liées à un projet de la page (au plus une par projet, index unique de 0034). Rend
  // { rows, lot3 } : lot3 est faux tant que la migration 0038 n'est pas en ligne (lecture refaite sans project_category).
  async function projectDeals() {
    const s = await db();
    const read = cols => run(s.from("deal_overview").select(cols).eq("engine_link_kind", "page_opportunity").is("archived_at", null).limit(LIMIT));
    // Même migration (0038) que linkedin_url : la réponse dit aussi si LinkedIn est disponible.
    try { const rows = (await read(COLS.project_deal)) || []; feature.linkedin = true; return { rows, lot3: true }; }
    catch (e) { if (!e || e.kind !== "not_ready") throw e; }
    feature.linkedin = false;
    return { rows: ((await read(COLS.project_deal_base)) || []).map(r => Object.assign(r, { project_category: null })), lot3: false };
  }
  // Affaire liée créée au premier geste sur un projet : étape choisie (sinon la première étape ouverte, posée par la base),
  // motif d'une étape finale, catégorie ; ni nom ni entreprise (contraintes deals_name_or_link_chk et deals_company_or_link_chk).
  async function createProjectDeal(projectId, values) {
    if (!PROJECT_KEY.test(String(projectId == null ? "" : projectId))) throw new CrmError("invalid", "project");
    const payload = pick(values, ["stage_id", "close_reason_id", "project_category"]);
    checkCategory(payload);
    payload.engine_link_kind = "page_opportunity";
    payload.engine_link_key = String(projectId);
    const s = await db();
    const rows = await run(s.from("deals").insert(payload).select("*"));
    if (!rows || !rows.length) throw new CrmError("error");
    return rows[0];
  }
  // Décideur d'une affaire (PR17) : contact decision_maker de nature prospect, son email et son mobile, relié comme contact
  // principal de l'affaire, en un seul appel (version de l'affaire exigée). Rien n'est prérempli : seules les valeurs saisies
  // partent. Après tout refus ou toute coupure, rien n'est créé.
  const DECISION_MAKER = { first_name: "p_first_name", last_name: "p_last_name", job_title: "p_job_title", source_id: "p_source_id",
    preferred_language: "p_preferred_language", email: "p_email", email_state: "p_email_state", mobile: "p_mobile", linkedin_url: "p_linkedin_url" };
  async function createDealDecisionMaker(dealId, version, values) {
    if (!isUuid(dealId)) throw new CrmError("not_found");
    const v = values || {}, args = { p_deal_id: dealId, p_deal_version: needVersion(version) };
    Object.entries(DECISION_MAKER).forEach(([k, arg]) => {
      const x = v[k];
      if (x === undefined || x === null || x === "") return;
      args[arg] = typeof x === "string" ? x.trim() : x;
    });
    if (!args.p_first_name && !args.p_last_name) throw new CrmError("invalid", "name");
    if (!isUuid(args.p_source_id)) throw new CrmError("invalid", "source");
    if (args.p_email !== undefined) { const e = valid.email(args.p_email); if (!e) throw new CrmError("invalid", "email"); args.p_email = e; }
    if (args.p_mobile !== undefined) { const p = valid.phone(args.p_mobile); if (!p) throw new CrmError("invalid", "phone"); args.p_mobile = p; }
    checkLinkedin(args, "p_linkedin_url");
    const s = await db();
    const r = await run(s.rpc("create_deal_decision_maker", args));
    const row = Array.isArray(r) ? r[0] : r;
    if (!row || !row.id) throw new CrmError("error");
    return row;
  }

  // Écran « Personnes repérées » (migration 0039, fiche besoin PP6 et PP7) : « Basculer dans Contacts » en un seul appel,
  // crm.import_page_person, tout ou rien. La base retrouve ou crée l'entreprise, crée le contact (Prospect) avec son email, son
  // téléphone et son lien LinkedIn, garde le lien vers la fiche d'origine, et rend le contact EXISTANT au lieu d'en créer un
  // second (même fiche, ou même email déjà porté). Seules les valeurs données partent, rien n'est deviné ; un lien LinkedIn
  // qui n'a pas la forme acceptée n'est pas envoyé (la fiche d'origine n'est pas modifiée). Fonction absente (avant 0039) :
  // « closed », dit comme tel par l'écran.
  async function importPagePerson(values) {
    const v = values || {}, args = {};
    const id = String(v.doc_id == null ? "" : v.doc_id).trim();
    if (!PAGE_DOC_KEY.test(id)) throw new CrmError("invalid", "person");
    args.p_doc_id = id;
    const name = String(v.name == null ? "" : v.name).trim();
    if (!name) throw new CrmError("invalid", "name");
    args.p_name = name.slice(0, 200);
    [["job_title", "p_job_title"], ["organisation", "p_organisation"], ["source", "p_source"]].forEach(([k, a]) => {
      const x = String(v[k] == null ? "" : v[k]).trim(); if (x) args[a] = x.slice(0, 300);
    });
    if (String(v.email == null ? "" : v.email).trim()) { const e = valid.email(v.email); if (!e) throw new CrmError("invalid", "email"); args.p_email = e; }
    if (String(v.phone == null ? "" : v.phone).trim()) { const p = valid.phone(v.phone); if (!p) throw new CrmError("invalid", "phone"); args.p_phone = p; }
    if (String(v.linkedin_url == null ? "" : v.linkedin_url).trim()) { const u = valid.linkedin(v.linkedin_url); if (u) args.p_linkedin_url = u; }
    const s = await db();
    const r = await run(s.rpc("import_page_person", args));
    const row = Array.isArray(r) ? r[0] : r;
    if (!row || !row.id) throw new CrmError("error");
    return row;
  }
  // Contacts déjà basculés depuis une fiche de la page : toutes les fiches actives liées, sans aucun identifiant dans l'adresse
  // (comme projectDeals). Rend { clé de la fiche d'origine : identifiant du contact }.
  async function linkedPersons() {
    const s = await db();
    const rows = await run(s.from("contacts").select("id,engine_link_key").eq("engine_link_kind", "page_person").is("archived_at", null).limit(LIMIT));
    const out = {};
    (rows || []).forEach(r => { if (r && r.engine_link_key && r.id) out[r.engine_link_key] = r.id; });
    return out;
  }

  // Revue des données (« Revoir maintenant ») : Garder repousse la date de revue ; sinon la fiche est archivée.
  async function reviewContact(id, version, keep) {
    if (!isUuid(id)) throw new CrmError("not_found");
    const s = await db();
    const row = await run(s.rpc("review_contact", { p_contact_id: id, p_version: needVersion(version), p_keep: keep !== false }));
    return Array.isArray(row) ? row[0] : row;
  }

  // Suppression définitive : David seul (la base refuse tout autre compte), motif de la liste fixe, aperçu complet avant.
  async function deletionPreview(type, id) {
    if (!DELETABLE.includes(type) || !isUuid(id)) throw new CrmError("invalid");
    const s = await db();
    return run(s.rpc("deletion_preview", { p_record_type: type, p_record_id: id }).select(COLS.preview));
  }
  async function deleteRecord(type, id, reason) {
    if (!DELETABLE.includes(type) || !isUuid(id)) throw new CrmError("invalid");
    if (!CODES.deletion_reason.includes(reason)) throw new CrmError("invalid", "reason");
    const s = await db();
    return run(s.rpc("delete_record", { p_record_type: type, p_record_id: id, p_reason: reason }));
  }

  root.lunaCrm = Object.freeze({
    start, lists, reviewPeriods, pipeline, companies, contacts, deals, company, contact, deal, brands, outlets, emails, phones,
    notes, notesByIds, history, names, sameNameCompanies, emailOwners, sameNameContacts,
    insert, createContact, update, archive, restore, setDoNotContact, removeDoNotContact, reviewContact, deletionPreview, deleteRecord,
    projectDeals, createProjectDeal, createDealDecisionMaker, linkedinReady, importPagePerson, linkedPersons,
    valid, fold, isUuid, CrmError, PROJECT_CATEGORIES: CODES.project_category.slice(), isProjectKey: k => PROJECT_KEY.test(String(k == null ? "" : k))
  });
  // Pour les tests hors ligne seulement : listes de colonnes et de champs, jamais une donnée.
  root.__lunaCrmDbInternals = { COLS, TABLES, FIELDS, ON_INSERT, CODES, CREATE_CONTACT, DECISION_MAKER, PROJECT_KEY, LINKEDIN_RE, normLinkedin, EMAIL_RE, DETAIL_CODES: DETAILS.map(d => d[1]), classify, detailOf };
})(typeof window !== "undefined" ? window : globalThis);
