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
   - Erreurs : un code (kind, detail), jamais le texte de la base, écrit en français alors que l'écran de Renata est en anglais. */
(function (root) {
  "use strict";

  const SCHEMA = "crm";
  const LIMIT = 1000;

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
    contact: "id,first_name,last_name,job_title,company_id,brand_id,decision_role,preferred_language,nature,source_id,group_ids,tag_ids,next_step,follow_up_on,do_not_contact,dnc_since,dnc_by,dnc_reason,review_due_on,last_reviewed_at,last_reviewed_by,archived_at,archived_by,version,company_name,company_status,is_primary_contact,review_due,auto_groups,primary_email,last_contact_at",
    contact_dup: "id,first_name,last_name,company_id,company_name,archived_at",
    deal_row: "id,name,company_id,company_name,stage_id,stage_outcome,value_aed,next_step,follow_up_on,days_in_stage,closed_on,close_reason_id,service_ids,source_id,is_renewal,archived_at,archived_by,version",
    deal: "id,name,company_id,brand_id,outlet_id,primary_contact_id,stage_id,stage_entered_at,service_ids,value_aed,is_renewal,source_id,referred_by_company_id,referred_by_contact_id,expected_decision_on,next_step,follow_up_on,close_reason_id,closed_on,archived_at,archived_by,version,stage_outcome,company_name,days_in_stage,last_contact_at",
    brand: "id,name,company_id,sector_id,archived_at,archived_by,version",
    outlet: "id,name,company_id,brand_id,city_or_emirate,district,country_code,archived_at,archived_by,version",
    contact_email: "id,contact_id,email,state,is_primary,archived_at,archived_by,version",
    contact_email_owner: "contact_id,email",
    contact_phone: "id,contact_id,phone,phone_type,archived_at,archived_by,version",
    note: "id,kind,body,occurred_at,company_id,contact_id,deal_id,brand_id,outlet_id,archived_at,archived_by,created_by,version",
    journal: "id,at,actor,record_type,record_id,parent_type,parent_id,action,changed_fields,old_values,new_values,reason",
    name_company: "id,name",
    name_contact: "id,first_name,last_name,company_id",
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
              "group_ids", "tag_ids", "next_step", "follow_up_on"],
    contact_email: ["email", "state", "is_primary"],
    contact_phone: ["phone", "phone_type"],
    deal: ["name", "company_id", "brand_id", "outlet_id", "primary_contact_id", "stage_id", "service_ids", "value_aed", "is_renewal", "source_id",
           "referred_by_company_id", "referred_by_contact_id", "expected_decision_on", "next_step", "follow_up_on", "close_reason_id", "closed_on"],
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
    deletion_reason: ["erasure_request", "duplicate", "entry_error", "other"]
  };

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const isUuid = v => UUID.test(String(v == null ? "" : v));
  const idList = list => [...new Set((list || []).filter(isUuid))];
  const text = (v, max) => String(v == null ? "" : v).trim().slice(0, max || 200);
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // Mêmes formes que la base (migration 0034) : contrôlées avant l'envoi pour que l'écran le dise tout de suite.
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const PHONE_RE = /^\+?[0-9][0-9 ().-]{3,30}$/;
  const valid = {
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
    [/valeur en AED/i, "value"]
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
  const contact = id => one("contact_overview", COLS.contact, id);
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
    if (type === "list_item" && !CODES.list_kind.includes(payload.kind)) throw new CrmError("invalid");
    const s = await db();
    const rows = await run(s.from(TABLES[type]).insert(payload).select("*"));
    if (!rows || !rows.length) throw new CrmError("error");
    return rows[0];
  }

  async function update(type, id, version, changes) {
    if (!FIELDS[type]) throw new CrmError("invalid");
    const payload = pick(changes, FIELDS[type]);
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
    insert, update, archive, restore, setDoNotContact, removeDoNotContact, reviewContact, deletionPreview, deleteRecord,
    valid, fold, isUuid, CrmError
  });
  // Pour les tests hors ligne seulement : listes de colonnes et de champs, jamais une donnée.
  root.__lunaCrmDbInternals = { COLS, TABLES, FIELDS, ON_INSERT, CODES, DETAIL_CODES: DETAILS.map(d => d[1]), classify, detailOf };
})(typeof window !== "undefined" ? window : globalThis);
