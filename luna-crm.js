/* Luna : écrans du CRM, sur le site autonome seulement (chantier 1 du mandat CRM, spécification « une journée de Renata »,
   écrans E2 à E8). Pipeline, Entreprises, Contacts, fiches (affaire, entreprise, contact), formulaires, listes et durées de
   revue dans Paramètres.

   Règles :
   - Données par l'adaptateur luna-crm-db.js seulement (window.lunaCrm). La page privée ne charge jamais ce fichier.
   - Deux langues sans mélange : l'écran anglais (Renata) n'affiche que les textes anglais, l'écran français (David) que les
     textes français ; seules les données saisies (noms, notes) s'affichent telles quelles. Libellé d'une liste modifiable sans
     traduction française : le libellé anglais tel que saisi (décision D3 de David).
   - Tout texte venu de la base s'affiche comme texte (textContent), jamais comme HTML ; un lien n'est ouvert que s'il commence
     par https://, http://, mailto: ou tel: (D4 : le téléphone de Renata appelle ou écrit ; Luna n'envoie rien).
   - Aucun message de réussite sans enregistrement confirmé par la base ; en cas d'échec, « non enregistré » et la saisie est
     gardée (critère TR10). Un nouveau contact et ses coordonnées se créent en un seul appel, tout ou rien. Chaque mise à
     jour renvoie la version lue (TR11) ; après un refus de version, la fiche ou la liste est relue avant le message.
   - Un champ dont les choix n'ont pas pu être chargés n'est jamais envoyé vide à la place de sa valeur ; « Enregistrer »
     attend la fin du chargement. Une fenêtre qui envoie ne se ferme pas avant la réponse, et cette réponse ne ferme qu'elle.
   - Sous « ne pas contacter », appeler et écrire sont désactivés ; le numéro et l'adresse restent lisibles (décision de Luna
     du 27/09/2026). Un lien mailto: encode l'adresse : elle ne peut porter ni copie cachée, ni objet, ni texte.
   - Heures saisies et affichées à l'heure de Dubaï, quel que soit le fuseau de l'appareil.
   - Geste retour du téléphone : il ferme la fenêtre, puis chaque niveau de la fiche, sans quitter le site ; une saisie en
     cours demande confirmation.
   - Conçus d'abord pour un téléphone de 390 points de large : aucun défilement horizontal, aucun texte coupé (TR2). */
(function (root) {
  "use strict";
  const doc = root.document;

  // ------------------------------------------------------------------ listes fixes (codes et libellés de la migration 0034)
  const FIXED = {
    relationship_status: [["prospect", "Prospect", "Prospect"], ["current_client", "Current client", "Client actuel"],
      ["past_client", "Past client", "Ancien client"], ["partner_supplier", "Partner or supplier", "Partenaire ou fournisseur"], ["media", "Media", "Média"]],
    contact_nature: [["client", "Client", "Client"], ["prospect", "Prospect", "Prospect"], ["press", "Press", "Presse"],
      ["influencer_creator", "Influencer or creator", "Influenceur ou créateur"], ["partner_supplier", "Partner or supplier", "Partenaire ou fournisseur"],
      ["other", "Other", "Autre"]],
    decision_role: [["decision_maker", "Decision-maker", "Décideur"], ["involved", "Involved in the decision", "Participe à la décision"],
      ["day_to_day", "Day-to-day contact", "Contact au quotidien"]],
    exchange_type: [["note", "Note", "Note"], ["call", "Call", "Appel"], ["email", "Email", "Email"], ["message", "Message", "Message"],
      ["meeting", "Meeting", "Rendez-vous"], ["event", "Event", "Événement"]],
    email_state: [["not_confirmed", "Not confirmed", "À vérifier"], ["confirmed", "Confirmed", "Confirmé"]],
    preferred_language: [["en", "English", "Anglais"], ["fr", "French", "Français"], ["ar", "Arabic", "Arabe"], ["other", "Other", "Autre"]],
    phone_type: [["mobile", "Mobile", "Mobile"], ["office", "Office", "Bureau"], ["other", "Other", "Autre"]],
    stage_outcome: [["open", "Open", "Ouverte"], ["won", "Won", "Gagnée"], ["lost", "Lost", "Perdue"]],
    auto_group: [["current_clients", "Current clients", "Clients actuels"], ["past_clients", "Past clients", "Anciens clients"],
      ["prospects_leads", "Prospects and leads", "Prospects et pistes"], ["editors_journalists", "Editors and journalists", "Rédacteurs et journalistes"],
      ["influencers_creators", "Influencers and creators", "Influenceurs et créateurs"], ["suppliers_partners", "Suppliers and partners", "Fournisseurs et partenaires"]],
    deletion_reason: [["erasure_request", "Erasure request", "Demande d'effacement"], ["duplicate", "Duplicate", "Doublon"],
      ["entry_error", "Entry error", "Erreur de saisie"], ["other", "Other", "Autre"]],
    journal_action: [["create", "Created", "Création"], ["update", "Changed", "Modification"], ["archive", "Archived", "Archivage"],
      ["restore", "Restored", "Restauration"], ["delete", "Deleted permanently", "Suppression définitive"], ["stage_change", "Stage changed", "Changement d'étape"],
      ["status_change", "Status changed", "Changement de statut"], ["dnc_on", "Do not contact set", "« Ne pas contacter » activé"],
      ["dnc_off", "Do not contact removed", "« Ne pas contacter » retiré"], ["review", "Reviewed", "Revue faite"]]
  };
  const LIST_KINDS = ["group", "tag", "sector", "service", "source", "stage", "win_reason", "loss_reason"];

  // ------------------------------------------------------------------ textes des écrans (mêmes clés dans les deux langues)
  const plural = (n, one, many) => (Number(n) === 1 ? one : many);
  const CT = {
    en: {
      nav_pipeline: "Pipeline", nav_companies: "Companies", nav_contacts: "Contacts",
      pt_pipeline: "Pipeline", pt_companies: "Companies", pt_contacts: "Contacts",
      lead_pipeline: "Your deals by stage, with their number and their value in AED. Tap a stage to see its deals, the most urgent first.",
      lead_companies: "Your clients, prospects, partners and media, with their brands, outlets and decision-makers.",
      lead_contacts: "The people you work with. Tap a phone number or an email to call or write from your phone: Luna sends nothing.",
      st_loading: "Loading…",
      st_closed: "The CRM is not open on this site yet. It will appear here as soon as David opens it.",
      st_denied: "Access to the CRM is limited to Renata and David.",
      st_offline: "Luna could not reach the CRM. Check your internet connection, then try again.",
      retry: "Try again", load_fail: "Could not load. Check your internet connection, then try again.",
      gone: "This record no longer exists, or it is not available.",
      add_menu: "Add", new_company: "New company", new_contact: "New contact", new_deal: "New deal", log_activity: "Log activity",
      edit_company: "Edit company", edit_contact: "Edit contact", edit_deal: "Edit deal", edit_note: "Edit note", new_brand: "New brand",
      edit_brand: "Edit brand", new_outlet: "New outlet", edit_outlet: "Edit outlet", add_email: "Add an email", add_phone: "Add a phone",
      save: "Save", cancel: "Cancel", close: "Close", back: "Back", edit: "Edit", archive: "Archive", restore: "Restore", add: "Add",
      change: "Change", choose: "Choose…", none: "None", yes: "Yes", no: "No", reload: "Reload", open_it: "Open it",
      create_anyway: "Create anyway", save_anyway: "Save anyway", delete_perm: "Delete permanently", more_details: "More details",
      saving: "Saving…", saved: "Saved.", restored: "Restored.", archived_done: "Archived.", opt_optional: "optional",
      search: "Search", search_companies: "Search a company", search_contacts: "Name, job title, company, email",
      search_pick: "Type to search", filters: n => (n ? `Filters (${n})` : "Filters"),
      count_companies: n => plural(n, "1 company", `${n} companies`), count_contacts: n => plural(n, "1 contact", `${n} contacts`),
      count_deals: n => plural(n, "1 deal", `${n} deals`),
      none_match: "Nothing matches these filters.", no_companies_yet: "No company yet. Tap + to add the first one.",
      no_contacts_list: "No contact yet. Tap + to add the first one.", no_deals_stage: "No deal at this stage.", none_yet: "None yet",
      all_statuses: "All relationship statuses", all_groups: "All groups", all_industries: "All industries", all_tags: "All tags",
      all_types: "All contact types", all_company_statuses: "All company statuses", all_services: "All services", all_sources: "All sources",
      f_to_review: "To review", f_dnc: "Do not contact", f_archived: "Archived", f_no_next: "Without next step", f_period: "Period",
      view_open: "Open", view_closed: "Closed", view_label: "Deals to show",
      period_month: "This month", period_quarter: "This quarter", period_year: "This year", period_all: "All dates",
      pipeline_value: "Pipeline value", stage_count: (stage, n, v) => `${stage}: ${plural(n, "1 deal", n + " deals")} · ${v}`,
      outcome_count: (label, n, v) => `${label}: ${plural(n, "1 deal", n + " deals")} · ${v}`,
      days_in_stage: n => plural(n, "1 day in this stage", `${n} days in this stage`), no_next_step: "No next step",
      follow_up_on: d => `Follow-up on ${d}`, closed_on_d: d => `Closed on ${d}`, unnamed_deal: "Deal without a name",
      last_contact_on: d => `Last contact ${d}`, open_deals_n: n => plural(n, "1 open deal", `${n} open deals`),
      archived_on: (d, who) => `Archived on ${d}${who ? " by " + who : ""}`, archived_chip: "Archived", show_archived: n => `Archived (${n})`,
      f_name: "Name", f_status: "Relationship status", f_source: "Source", f_groups: "Groups", f_industries: "Industries",
      f_industry: "Industry", f_tags: "Tags", f_website: "Website", f_city: "City or emirate", f_district: "District",
      f_country: "Country code", f_location: "Location", f_main_contact: "Main contact", f_last_contact: "Last contact",
      f_first_name: "First name", f_last_name: "Last name", f_job_title: "Job title", f_company: "Company", f_brand: "Brand",
      f_outlet: "Outlet", f_decision_role: "Decision role", f_language: "Preferred language", f_type: "Contact type",
      f_email: "Email", f_emails: "Emails", f_email_state: "Email status", f_phone: "Phone", f_phones: "Phones", f_phone_type: "Phone type",
      f_next_step: "Next step", f_follow_up: "Follow-up date", f_deal_name: "Deal name", f_stage: "Stage", f_value: "Value (AED)",
      f_services: "Services", f_renewal: "Renewal", f_deal_contact: "Main contact for this deal", f_referred_by: "Referred by",
      f_expected_decision: "Expected decision date", f_reason: "Reason", f_closed_on: "Closed on", f_days: "Days in this stage",
      f_activity_type: "Type", f_when: "Date and time", f_text: "Text", f_about: "About", f_about_deal: "About the deal",
      f_with_contact: "With", f_label_en: "English label", f_label_fr: "French label", f_main_contact_check: "Main contact of the company",
      f_primary_email: "Main email", f_dnc_reason: "Reason",
      sec_summary: "Summary", sec_decision_makers: "Decision-makers", sec_brands_outlets: "Brands and outlets", sec_deals: "Deals",
      sec_notes: "Notes and activity", sec_history: "History", sec_identity: "Identity", sec_details: "Contact details",
      sec_classification: "Classification", sec_next_step: "Next step", sec_data: "Data", sec_deal: "Details",
      status_since: d => `since ${d}`, no_contacts_yet: "No contact yet.", no_brand: "Directly under the company",
      no_brands_yet: "No brand or outlet yet.", make_main: "Make main contact", main_contact_badge: "Main contact",
      no_deals_yet: "No deal yet.", deals_closed: "Closed", no_company: "No company",
      call: "Call", write: "Email", confirm_email: "Mark as confirmed", make_primary: "Make main email", primary: "Main",
      review_date: "Review date", last_review_l: "Last review", review_now: "Review now", keep: "Keep", to_review: "To review",
      review_lead: "Keep this contact and set the next review date, or archive it.", review_kept: d => `Kept. Next review on ${d}.`,
      dnc: "Do not contact", dnc_on: "Set do not contact", dnc_off: "Remove do not contact",
      dnc_since: (d, who) => `Since ${d}${who ? ", by " + who : ""}`, dnc_default_reason: "Asked not to be contacted",
      dnc_on_lead: "This person will no longer be contacted. Give the reason; Luna adds the date and your name.",
      dnc_off_lead: "This person can be contacted again. The removal is kept in the history.",
      dnc_links_off: "Calling and writing are switched off while do not contact is set.",
      change_stage: "Change stage", won_reason: "Why was this deal won?", lost_reason: "Why was this deal lost?", reason_asked: "A reason is asked",
      make_client_title: "Current client", make_client_q: name => `Also mark ${name} as a current client?`,
      make_client_yes: "Yes, current client", make_client_no: "Not now",
      note_hint: "Note the work, not private life (health, family, religion).", no_notes: "No note or activity yet.",
      by_x: who => `by ${who}`, about_x: name => `About ${name}`,
      no_history: "No history yet.", system: "Luna", changed_x: list => `Changed: ${list}`, empty_value: "empty",
      archive_title: "Archive", archive_lead: "The record leaves the lists and stays in Archived, with the date and your name. You can restore it at any time.",
      del_lead: "This cannot be undone. Check what will be removed, choose a reason, then confirm.",
      del_will_delete: "Will be deleted", del_will_unlink: "Will be kept but detached",
      del_blocks: "This company still has contacts or deals: move them or delete them first.",
      del_notes: "Notes that will be kept but detached (they may name this person):", del_reason: "Reason", del_done: "Deleted permanently.",
      dup_company: "A company with this name already exists:", dup_email: "This email is already on another contact:",
      dup_name: "A contact with this name already exists in this company:", dup_nothing_merged: "Nothing is merged: you choose.",
      conflict_hint: "Someone else changed this record. Reload it to see the latest version.",
      err_offline: "Not saved: the connection was lost. Your entry is kept; try again.",
      err_conflict: "Not saved: this record was changed in the meantime. Reload it, then make your change again.",
      err_conflict_reloaded: "Not saved: this record was changed in the meantime. It has been reloaded; make your change again.",
      err_forbidden: "Not saved: this action is reserved for David.", err_not_found: "Not saved: this record no longer exists or is not available.",
      err_closed: "Not saved: the CRM is not open on this site yet.", err_invalid: "Not saved: please check the fields.",
      err_generic: "Not saved: something went wrong. Your entry is kept; try again.",
      err_required: "Not saved: fill in the required fields.", err_email: "Not saved: this email address is not valid.",
      err_phone: "Not saved: this phone number is not valid.", err_name: "Not saved: enter a first name or a last name.",
      err_label_en: "Not saved: the English label is required.", err_last_open_stage: "Not saved: at least one open stage must remain.",
      err_locked: "Not saved: this item can be renamed but not archived.", err_archived_choice: "Not saved: an archived item can no longer be chosen.",
      err_reason: "Not saved: choose a reason.", err_value: "Not saved: enter the value as a whole number of AED, without decimals.",
      err_email_twice: "Not saved: this email is already on this contact.", err_website: "Not saved: this website address is not valid.",
      err_country: "Not saved: enter a two-letter country code, such as AE.", err_blocks: "Not deleted: this company still has contacts or deals.",
      err_months: "Not saved: enter a number of months between 1 and 120.", err_note_text: "Not saved: a note needs a text.",
      err_nothing: "Nothing to save: no change.", partial_contact: "The contact is saved, but some details were not. Check the contact page.",
      err_version: "Not saved: this page is out of date. Reload it and make your change again.",
      err_version_reloaded: "Not saved: this page was out of date. It has been reloaded; make your change again.",
      err_move_partial: "The new order was only partly saved. The list has been reloaded and shows the saved order: check it, and move the item again only if it is not in the right place.",
      err_move_unsure: "The new order was only partly saved, and the list could not be reloaded: the order shown may be wrong. Check your internet connection. The list will be reloaded before any other move.",
      list_reloaded: "The list has been reloaded and shows the saved order. Check it, then move the item again if needed.",
      choices_kept: "Brand, outlet and main contact could not be loaded; saving keeps them as they are.",
      choices_failed: "Brand, outlet and main contact could not be loaded; try again to choose them.",
      brands_kept: "The brands could not be loaded; saving keeps the brand as it is.",
      brands_failed: "The brands could not be loaded; try again to choose one.",
      not_loaded: "Not loaded", other_company: "Other company",
      main_now: name => `Current main contact: ${name}. Ticking the box makes this person the main contact instead.`,
      pipeline_value_filtered: "Pipeline value (filtered)",
      leave_q: "Leave this form? What you typed will be lost.", leave: "Leave", stay: "Keep editing",
      set_lists: "Lists", set_lists_lead: "Your lists for sorting companies, contacts and deals. An archived item disappears from the choices but stays on the records that carry it; nothing is deleted.",
      lists_label: "List", list_group: "Groups", list_tag: "Tags", list_sector: "Industries", list_service: "Services", list_source: "Sources",
      list_stage: "Pipeline stages", list_win_reason: "Win reasons", list_loss_reason: "Loss reasons",
      auto_groups_note: "Six more groups fill in by themselves from the company status or the contact type; they are not edited here.",
      rename: "Rename", move_up: "Move up", move_down: "Move down", add_item: "Add an item", edit_item: "Rename an item",
      new_item: "New item", locked_note: "Can be renamed, not archived", fr_missing: "No French label yet",
      set_review: "Data review", set_review_lead: "How long a contact's details are kept before the next review, by contact type. Only David can change these durations.",
      months_n: n => plural(n, "1 month", `${n} months`), months_label: "Months",
      rt_company: "Company", rt_brand: "Brand", rt_outlet: "Outlet", rt_contact: "Contact", rt_contact_email: "Email",
      rt_contact_phone: "Phone", rt_deal: "Deal", rt_note: "Note", rt_list_item: "List item", rt_review_period: "Review duration", rt_member: "Member",
      fld_other: "other details", fld_name: "name", fld_status: "relationship status", fld_source_id: "source", fld_group_ids: "groups",
      fld_sector_ids: "industries", fld_sector_id: "industry", fld_tag_ids: "tags", fld_website: "website", fld_city_or_emirate: "city or emirate",
      fld_country_code: "country", fld_primary_contact_id: "main contact", fld_engine_link_kind: "link to Luna's detection",
      fld_engine_link_key: "link to Luna's detection", fld_archived_at: "archiving", fld_archive_reason: "archiving reason",
      fld_company_id: "company", fld_brand_id: "brand", fld_outlet_id: "outlet", fld_district: "district", fld_first_name: "first name",
      fld_last_name: "last name", fld_job_title: "job title", fld_decision_role: "decision role", fld_preferred_language: "preferred language",
      fld_nature: "contact type", fld_next_step: "next step", fld_follow_up_on: "follow-up date", fld_do_not_contact: "do not contact",
      fld_dnc_reason: "do not contact reason", fld_review_due_on: "review date", fld_last_reviewed_at: "last review",
      fld_contact_id: "contact", fld_email: "email", fld_state: "email status", fld_is_primary: "main email", fld_phone: "phone number",
      fld_phone_type: "phone type", fld_stage_id: "stage", fld_service_ids: "services", fld_value_aed: "value", fld_is_renewal: "renewal",
      fld_referred_by_company_id: "referred by", fld_referred_by_contact_id: "referred by", fld_expected_decision_on: "expected decision date",
      fld_close_reason_id: "reason", fld_closed_on: "closing date", fld_kind: "type", fld_body: "text", fld_occurred_at: "date",
      fld_deal_id: "deal", fld_label_en: "English label", fld_label_fr: "French label", fld_position: "order", fld_stage_outcome: "stage type",
      fld_code: "internal code", fld_months: "duration", fld_label: "name", fld_role: "role"
    },
    fr: {
      nav_pipeline: "Pipeline", nav_companies: "Entreprises", nav_contacts: "Contacts",
      pt_pipeline: "Pipeline", pt_companies: "Entreprises", pt_contacts: "Contacts",
      lead_pipeline: "Vos affaires par étape, avec leur nombre et leur valeur en AED. Touchez une étape pour voir ses affaires, les plus urgentes en tête.",
      lead_companies: "Vos clients, prospects, partenaires et médias, avec leurs marques, leurs points de vente et leurs décideurs.",
      lead_contacts: "Les personnes avec qui vous travaillez. Touchez un numéro ou un email pour appeler ou écrire depuis votre téléphone : Luna n'envoie rien.",
      st_loading: "Chargement…",
      st_closed: "Le CRM n'est pas encore ouvert sur ce site. Il apparaîtra ici dès que David l'aura ouvert.",
      st_denied: "L'accès au CRM est réservé à Renata et David.",
      st_offline: "Luna n'a pas pu joindre le CRM. Vérifiez votre connexion internet, puis réessayez.",
      retry: "Réessayer", load_fail: "Chargement impossible. Vérifiez votre connexion internet, puis réessayez.",
      gone: "Cette fiche n'existe plus, ou n'est pas accessible.",
      add_menu: "Ajouter", new_company: "Nouvelle entreprise", new_contact: "Nouveau contact", new_deal: "Nouvelle affaire", log_activity: "Noter un échange",
      edit_company: "Modifier l'entreprise", edit_contact: "Modifier le contact", edit_deal: "Modifier l'affaire", edit_note: "Modifier la note",
      new_brand: "Nouvelle marque", edit_brand: "Modifier la marque", new_outlet: "Nouveau point de vente", edit_outlet: "Modifier le point de vente",
      add_email: "Ajouter un email", add_phone: "Ajouter un téléphone",
      save: "Enregistrer", cancel: "Annuler", close: "Fermer", back: "Retour", edit: "Modifier", archive: "Archiver", restore: "Restaurer",
      add: "Ajouter", change: "Changer", choose: "Choisir…", none: "Aucun", yes: "Oui", no: "Non", reload: "Recharger", open_it: "L'ouvrir",
      create_anyway: "Créer quand même", save_anyway: "Enregistrer quand même", delete_perm: "Supprimer définitivement",
      more_details: "Plus de détails", saving: "Enregistrement…", saved: "Enregistré.", restored: "Restauré.", archived_done: "Archivé.",
      opt_optional: "facultatif",
      search: "Rechercher", search_companies: "Chercher une entreprise", search_contacts: "Nom, poste, entreprise, email",
      search_pick: "Tapez pour chercher", filters: n => (n ? `Filtres (${n})` : "Filtres"),
      count_companies: n => (Number(n) > 1 ? `${n} entreprises` : `${n} entreprise`), count_contacts: n => (Number(n) > 1 ? `${n} contacts` : `${n} contact`),
      count_deals: n => (Number(n) > 1 ? `${n} affaires` : `${n} affaire`),
      none_match: "Rien ne correspond à ces filtres.", no_companies_yet: "Aucune entreprise pour l'instant. Touchez + pour ajouter la première.",
      no_contacts_list: "Aucun contact pour l'instant. Touchez + pour ajouter le premier.", no_deals_stage: "Aucune affaire à cette étape.",
      none_yet: "Aucun pour l'instant",
      all_statuses: "Tous les statuts de relation", all_groups: "Tous les groupes", all_industries: "Tous les secteurs", all_tags: "Toutes les étiquettes",
      all_types: "Toutes les natures", all_company_statuses: "Tous les statuts d'entreprise", all_services: "Tous les services", all_sources: "Toutes les sources",
      f_to_review: "À revoir", f_dnc: "Ne pas contacter", f_archived: "Archivés", f_no_next: "Sans prochaine étape", f_period: "Période",
      view_open: "Ouvertes", view_closed: "Clôturées", view_label: "Affaires à afficher",
      period_month: "Ce mois-ci", period_quarter: "Ce trimestre", period_year: "Cette année", period_all: "Toutes les dates",
      pipeline_value: "Valeur du pipeline", stage_count: (stage, n, v) => `${stage} : ${Number(n) > 1 ? n + " affaires" : n + " affaire"} · ${v}`,
      outcome_count: (label, n, v) => `${label} : ${Number(n) > 1 ? n + " affaires" : n + " affaire"} · ${v}`,
      days_in_stage: n => (Number(n) > 1 ? `${n} jours dans cette étape` : `${n} jour dans cette étape`), no_next_step: "Aucune prochaine étape",
      follow_up_on: d => `Relance le ${d}`, closed_on_d: d => `Clôturée le ${d}`, unnamed_deal: "Affaire sans nom",
      last_contact_on: d => `Dernier contact le ${d}`, open_deals_n: n => (Number(n) > 1 ? `${n} affaires ouvertes` : `${n} affaire ouverte`),
      archived_on: (d, who) => `Archivé le ${d}${who ? " par " + who : ""}`, archived_chip: "Archivé", show_archived: n => `Archivés (${n})`,
      f_name: "Nom", f_status: "Statut de relation", f_source: "Source", f_groups: "Groupes", f_industries: "Secteurs",
      f_industry: "Secteur", f_tags: "Étiquettes", f_website: "Site web", f_city: "Ville ou émirat", f_district: "Quartier",
      f_country: "Code du pays", f_location: "Emplacement", f_main_contact: "Contact principal", f_last_contact: "Dernier contact",
      f_first_name: "Prénom", f_last_name: "Nom", f_job_title: "Poste", f_company: "Entreprise", f_brand: "Marque",
      f_outlet: "Point de vente", f_decision_role: "Rôle dans la décision", f_language: "Langue préférée", f_type: "Nature du contact",
      f_email: "Email", f_emails: "Emails", f_email_state: "État de l'email", f_phone: "Téléphone", f_phones: "Téléphones", f_phone_type: "Type de téléphone",
      f_next_step: "Prochaine étape", f_follow_up: "Date de relance", f_deal_name: "Nom de l'affaire", f_stage: "Étape", f_value: "Valeur (AED)",
      f_services: "Services", f_renewal: "Renouvellement", f_deal_contact: "Contact principal de l'affaire", f_referred_by: "Recommandé par",
      f_expected_decision: "Date de décision prévue", f_reason: "Motif", f_closed_on: "Clôturée le", f_days: "Jours dans cette étape",
      f_activity_type: "Type", f_when: "Date et heure", f_text: "Texte", f_about: "Au sujet de", f_about_deal: "Au sujet de l'affaire",
      f_with_contact: "Avec", f_label_en: "Libellé anglais", f_label_fr: "Libellé français", f_main_contact_check: "Contact principal de l'entreprise",
      f_primary_email: "Email principal", f_dnc_reason: "Motif",
      sec_summary: "Résumé", sec_decision_makers: "Décideurs", sec_brands_outlets: "Marques et points de vente", sec_deals: "Affaires",
      sec_notes: "Notes et échanges", sec_history: "Historique", sec_identity: "Identité", sec_details: "Coordonnées",
      sec_classification: "Classement", sec_next_step: "Prochaine étape", sec_data: "Données", sec_deal: "Détails",
      status_since: d => `depuis le ${d}`, no_contacts_yet: "Aucun contact pour l'instant.", no_brand: "Directement rattachés à l'entreprise",
      no_brands_yet: "Aucune marque ni aucun point de vente pour l'instant.", make_main: "Désigner comme contact principal",
      main_contact_badge: "Contact principal", no_deals_yet: "Aucune affaire pour l'instant.", deals_closed: "Clôturées", no_company: "Aucune entreprise",
      call: "Appeler", write: "Écrire", confirm_email: "Marquer comme confirmé", make_primary: "Désigner comme email principal", primary: "Principal",
      review_date: "Date de revue", last_review_l: "Dernière revue", review_now: "Revoir maintenant", keep: "Garder", to_review: "À revoir",
      review_lead: "Gardez ce contact et fixez la prochaine date de revue, ou archivez-le.", review_kept: d => `Gardé. Prochaine revue le ${d}.`,
      dnc: "Ne pas contacter", dnc_on: "Activer « Ne pas contacter »", dnc_off: "Retirer « Ne pas contacter »",
      dnc_since: (d, who) => `Depuis le ${d}${who ? ", par " + who : ""}`, dnc_default_reason: "Demande de la personne",
      dnc_on_lead: "Cette personne ne sera plus contactée. Indiquez le motif ; Luna ajoute la date et votre nom.",
      dnc_off_lead: "Cette personne pourra de nouveau être contactée. Le retrait est gardé dans l'historique.",
      dnc_links_off: "Appeler et écrire sont désactivés tant que « Ne pas contacter » est actif.",
      change_stage: "Changer d'étape", won_reason: "Pourquoi cette affaire est-elle gagnée ?", lost_reason: "Pourquoi cette affaire est-elle perdue ?", reason_asked: "Un motif est demandé",
      make_client_title: "Client actuel", make_client_q: name => `Passer aussi ${name} en « Client actuel » ?`,
      make_client_yes: "Oui, client actuel", make_client_no: "Pas maintenant",
      note_hint: "Notez le travail, pas la vie privée (santé, famille, religion).", no_notes: "Aucune note ni aucun échange pour l'instant.",
      by_x: who => `par ${who}`, about_x: name => `Au sujet de ${name}`,
      no_history: "Aucun historique pour l'instant.", system: "Luna", changed_x: list => `Modifié : ${list}`, empty_value: "vide",
      archive_title: "Archiver", archive_lead: "La fiche quitte les listes et reste dans les Archivés, avec la date et votre nom. Vous pouvez la restaurer à tout moment.",
      del_lead: "Cette action est définitive. Vérifiez ce qui sera supprimé, choisissez un motif, puis confirmez.",
      del_will_delete: "Sera supprimé", del_will_unlink: "Sera gardé mais détaché",
      del_blocks: "Cette entreprise porte encore des contacts ou des affaires : déplacez-les ou supprimez-les d'abord.",
      del_notes: "Notes gardées mais détachées (elles peuvent nommer cette personne) :", del_reason: "Motif", del_done: "Supprimé définitivement.",
      dup_company: "Une entreprise porte déjà ce nom :", dup_email: "Cet email figure déjà sur un autre contact :",
      dup_name: "Un contact de ce nom existe déjà dans cette entreprise :", dup_nothing_merged: "Rien n'est fusionné : vous choisissez.",
      conflict_hint: "Quelqu'un d'autre a modifié cette fiche. Rechargez-la pour voir la dernière version.",
      err_offline: "Non enregistré : la connexion a été coupée. Votre saisie est gardée ; réessayez.",
      err_conflict: "Non enregistré : cette fiche a été modifiée entre-temps. Rechargez-la, puis refaites votre modification.",
      err_conflict_reloaded: "Non enregistré : cette fiche a été modifiée entre-temps. Elle a été rechargée ; refaites votre modification.",
      err_forbidden: "Non enregistré : cette action est réservée à David.", err_not_found: "Non enregistré : cette fiche n'existe plus ou n'est pas accessible.",
      err_closed: "Non enregistré : le CRM n'est pas encore ouvert sur ce site.", err_invalid: "Non enregistré : vérifiez les champs.",
      err_generic: "Non enregistré : une erreur est survenue. Votre saisie est gardée ; réessayez.",
      err_required: "Non enregistré : remplissez les champs obligatoires.", err_email: "Non enregistré : cette adresse email n'est pas valide.",
      err_phone: "Non enregistré : ce numéro de téléphone n'est pas valide.", err_name: "Non enregistré : saisissez un prénom ou un nom.",
      err_label_en: "Non enregistré : le libellé anglais est obligatoire.", err_last_open_stage: "Non enregistré : il doit rester au moins une étape ouverte.",
      err_locked: "Non enregistré : cet élément se renomme mais ne s'archive pas.", err_archived_choice: "Non enregistré : un élément archivé ne peut plus être choisi.",
      err_reason: "Non enregistré : choisissez un motif.", err_value: "Non enregistré : saisissez la valeur en nombre entier d'AED, sans décimales.",
      err_email_twice: "Non enregistré : cet email figure déjà sur ce contact.", err_website: "Non enregistré : cette adresse de site web n'est pas valide.",
      err_country: "Non enregistré : saisissez un code de pays de deux lettres, comme AE.", err_blocks: "Non supprimé : cette entreprise porte encore des contacts ou des affaires.",
      err_months: "Non enregistré : saisissez un nombre de mois entre 1 et 120.", err_note_text: "Non enregistré : une note demande un texte.",
      err_nothing: "Rien à enregistrer : aucune modification.", partial_contact: "Le contact est enregistré, mais une partie des coordonnées ne l'est pas. Vérifiez la fiche du contact.",
      err_version: "Non enregistré : cette page n'est plus à jour. Rechargez-la et refaites votre modification.",
      err_version_reloaded: "Non enregistré : cette page n'était plus à jour. Elle a été rechargée ; refaites votre modification.",
      err_move_partial: "Le nouvel ordre n'a été enregistré qu'en partie. La liste a été relue et montre l'ordre enregistré : vérifiez-le, et déplacez de nouveau l'élément seulement s'il n'est pas à la bonne place.",
      err_move_unsure: "Le nouvel ordre n'a été enregistré qu'en partie, et la liste n'a pas pu être relue : l'ordre affiché peut être faux. Vérifiez votre connexion internet. La liste sera relue avant tout autre déplacement.",
      list_reloaded: "La liste a été relue et montre l'ordre enregistré. Vérifiez-le, puis déplacez de nouveau l'élément si besoin.",
      choices_kept: "Marque, point de vente et contact principal n'ont pas pu être chargés ; l'enregistrement les garde tels quels.",
      choices_failed: "Marque, point de vente et contact principal n'ont pas pu être chargés ; réessayez pour les choisir.",
      brands_kept: "Les marques n'ont pas pu être chargées ; l'enregistrement garde la marque telle quelle.",
      brands_failed: "Les marques n'ont pas pu être chargées ; réessayez pour en choisir une.",
      not_loaded: "Non chargé", other_company: "Autre entreprise",
      main_now: name => `Contact principal actuel : ${name}. Cocher la case fait de cette personne le contact principal à sa place.`,
      pipeline_value_filtered: "Valeur du pipeline (filtrée)",
      leave_q: "Quitter ce formulaire ? Votre saisie sera perdue.", leave: "Quitter", stay: "Continuer la saisie",
      set_lists: "Listes", set_lists_lead: "Vos listes pour classer entreprises, contacts et affaires. Un élément archivé disparaît des choix mais reste sur les fiches qui le portent ; rien n'est supprimé.",
      lists_label: "Liste", list_group: "Groupes", list_tag: "Étiquettes", list_sector: "Secteurs", list_service: "Services", list_source: "Sources",
      list_stage: "Étapes du pipeline", list_win_reason: "Motifs de gain", list_loss_reason: "Motifs de perte",
      auto_groups_note: "Six autres groupes se remplissent seuls d'après le statut de l'entreprise ou la nature du contact ; ils ne se modifient pas ici.",
      rename: "Renommer", move_up: "Monter", move_down: "Descendre", add_item: "Ajouter un élément", edit_item: "Renommer un élément",
      new_item: "Nouvel élément", locked_note: "Se renomme, ne s'archive pas", fr_missing: "Pas encore de libellé français",
      set_review: "Revue des données", set_review_lead: "Durée avant la prochaine revue des données d'un contact, selon sa nature. Seul David peut modifier ces durées.",
      months_n: n => `${n} mois`, months_label: "Mois",
      rt_company: "Entreprise", rt_brand: "Marque", rt_outlet: "Point de vente", rt_contact: "Contact", rt_contact_email: "Email",
      rt_contact_phone: "Téléphone", rt_deal: "Affaire", rt_note: "Note", rt_list_item: "Élément de liste", rt_review_period: "Durée de revue", rt_member: "Membre",
      fld_other: "autres informations", fld_name: "nom", fld_status: "statut de relation", fld_source_id: "source", fld_group_ids: "groupes",
      fld_sector_ids: "secteurs", fld_sector_id: "secteur", fld_tag_ids: "étiquettes", fld_website: "site web", fld_city_or_emirate: "ville ou émirat",
      fld_country_code: "pays", fld_primary_contact_id: "contact principal", fld_engine_link_kind: "lien vers la détection de Luna",
      fld_engine_link_key: "lien vers la détection de Luna", fld_archived_at: "archivage", fld_archive_reason: "motif d'archivage",
      fld_company_id: "entreprise", fld_brand_id: "marque", fld_outlet_id: "point de vente", fld_district: "quartier", fld_first_name: "prénom",
      fld_last_name: "nom", fld_job_title: "poste", fld_decision_role: "rôle dans la décision", fld_preferred_language: "langue préférée",
      fld_nature: "nature du contact", fld_next_step: "prochaine étape", fld_follow_up_on: "date de relance", fld_do_not_contact: "ne pas contacter",
      fld_dnc_reason: "motif de « Ne pas contacter »", fld_review_due_on: "date de revue", fld_last_reviewed_at: "dernière revue",
      fld_contact_id: "contact", fld_email: "email", fld_state: "état de l'email", fld_is_primary: "email principal", fld_phone: "numéro",
      fld_phone_type: "type de téléphone", fld_stage_id: "étape", fld_service_ids: "services", fld_value_aed: "valeur", fld_is_renewal: "renouvellement",
      fld_referred_by_company_id: "recommandé par", fld_referred_by_contact_id: "recommandé par", fld_expected_decision_on: "date de décision prévue",
      fld_close_reason_id: "motif", fld_closed_on: "date de clôture", fld_kind: "type", fld_body: "texte", fld_occurred_at: "date",
      fld_deal_id: "affaire", fld_label_en: "libellé anglais", fld_label_fr: "libellé français", fld_position: "ordre", fld_stage_outcome: "type d'étape",
      fld_code: "code interne", fld_months: "durée", fld_label: "nom", fld_role: "rôle"
    }
  };

  // ------------------------------------------------------------------ formes pures (sans écran), essayées hors navigateur
  // Heure de Dubaï, fixe (UTC+4, sans heure d'été) : c'est celle qu'affiche fmtWhen. Une date et heure saisie dans un
  // formulaire se lit et s'écrit à cette heure-là, quel que soit le fuseau de l'appareil (défaut C13).
  const DUBAI_MS = 4 * 3600e3;
  function toLocalInput(iso) {
    const d = iso ? new Date(iso) : new Date();
    return isNaN(d) ? "" : new Date(d.getTime() + DUBAI_MS).toISOString().slice(0, 16);
  }
  function fromLocalInput(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v || ""));
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - DUBAI_MS;
    return isNaN(ms) ? null : new Date(ms).toISOString();
  }
  // Valeur en AED : nombre entier. Un séparateur de milliers (espace, espace insécable ou fine, virgule, apostrophe, point),
  // toujours le même, n'est admis que devant un groupe d'exactement trois chiffres : « 2 500,50 » ou « 2.500,5 » sont refusés
  // au lieu de devenir 250 050 (défaut C9). Rend null si vide, undefined si refusé.
  function parseAed(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return null;
    if (!/^\d+$/.test(s) && !/^\d{1,3}(?:([\s\u00a0\u202f,'.])\d{3}(?:\1\d{3})*)$/.test(s)) return undefined;
    const digits = s.replace(/\D/g, "");
    if (digits.length > 10) return undefined;
    const n = Number(digits);
    return n <= 2147483647 ? n : undefined;
  }
  // Lien mailto: d'une adresse enregistrée : partie avant et partie après le dernier « @ » encodées séparément, jamais une
  // simple concaténation ; une suite « ?bcc=… » ou « ?subject=… » reste du texte et n'ajoute aucun paramètre (défaut C1).
  function mailHref(email) {
    const e = String(email == null ? "" : email).trim(), i = e.lastIndexOf("@");
    if (i < 1 || i === e.length - 1) return "";
    return "mailto:" + encodeURIComponent(e.slice(0, i)) + "@" + encodeURIComponent(e.slice(i + 1));
  }

  // Attente la plus longue d'un chargement qui garde « Enregistrer » inactif (défauts C5 et C6), en millisecondes.
  const WAIT = { choicesMs: 10000 };

  // Pour les tests hors ligne seulement : textes, listes fixes et formes pures, jamais une donnée ; WAIT se raccourcit dans
  // les essais pour ne pas attendre dix secondes.
  root.__lunaCrmInternals = { CT, FIXED, LIST_KINDS, toLocalInput, fromLocalInput, parseAed, mailHref, WAIT };
  if (!doc || typeof doc.addEventListener !== "function" || !doc.documentElement) return;   // hors navigateur : textes seulement

  // ------------------------------------------------------------------ outils
  const api = () => root.lunaCrm;
  const byId = id => doc.getElementById(id);
  const lang = () => (String(doc.documentElement.lang || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  function t(key, ...args) {
    const v = CT[lang()][key];
    if (typeof v === "function") return v(...args);
    return v == null ? "" : v;
  }
  const colon = () => (lang() === "fr" ? " : " : ": ");
  const fx = (list, code) => { const r = (FIXED[list] || []).find(x => x[0] === code); return r ? r[lang() === "fr" ? 2 : 1] : ""; };
  const fxOptions = list => (FIXED[list] || []).map(r => [r[0], r[lang() === "fr" ? 2 : 1]]);
  const isNode = v => !!v && typeof v === "object" && typeof v.nodeType === "number";

  function h(tag, props, ...kids) {
    const e = doc.createElement(tag);
    let value;
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = String(v);
      else if (k === "value") value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden" || k === "open") e[k] = !!v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    });
    kids.flat(Infinity).forEach(k => { if (k == null || k === false || k === "") return; e.append(isNode(k) ? k : doc.createTextNode(String(k))); });
    if (value !== undefined) e.value = value == null ? "" : value;
    return e;
  }
  // Remplace le contenu d'un élément ; un morceau absent (null, false, vide) n'est jamais écrit tel quel à l'écran.
  const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== "")
    .map(k => (isNode(k) ? k : doc.createTextNode(String(k)))));
  const icon = name => { const i = doc.createElement("i"); i.setAttribute("data-lucide", name); i.setAttribute("aria-hidden", "true"); return i; };
  const refreshIcons = () => { try { if (root.lucide) root.lucide.createIcons({ attrs: { "stroke-width": 1.5 } }); } catch (e) { /* icônes facultatives */ } };
  function debounce(fn, ms) { let timer = null; return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); }; }

  const locale = () => (lang() === "fr" ? "fr-FR" : "en-GB");
  const fmtInt = n => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Number(n) || 0);
  const fmtAed = n => fmtInt(n) + " AED";
  function fmtDay(s) {
    if (!s) return "";
    const str = String(s), m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(str);
    return isNaN(d) ? "" : d.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Dubai" });
  }
  function fmtWhen(s) {
    const d = new Date(s);
    return isNaN(d) ? "" : d.toLocaleString(locale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
  }
  function today() {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
      .forEach(x => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  }
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const fullName = r => [r && r.first_name, r && r.last_name].filter(Boolean).join(" ");
  const actor = a => (!a ? "" : /^system:/.test(String(a)) ? t("system") : String(a));
  const telHref = p => "tel:" + String(p || "").replace(/[^\d+]/g, "");
  const natureFor = status => ({ current_client: "client", past_client: "client", prospect: "prospect", partner_supplier: "partner_supplier", media: "press" }[status] || "");
  const statusTone = s => (s === "current_client" ? "good" : s === "prospect" ? "" : "muted");

  // ------------------------------------------------------------------ état
  const PANELS = ["pipeline", "companies", "contacts"];
  const S = {
    state: "loading", me: null, items: [], byId: new Map(), periods: [], stack: [], current: null, seq: {}, built: {},
    pf: { view: "open", stage: "", service: "", source: "", noNext: false, archived: false, period: "month" },
    cf: { q: "", status: "", group: "", sector: "", tag: "", archived: false },
    kf: { q: "", group: "", nature: "", companyStatus: "", tag: "", review: false, dnc: false, archived: false },
    listKind: "group", listsUnsure: false
  };
  const nextSeq = k => (S.seq[k] = (S.seq[k] || 0) + 1);
  const isDecider = () => !!(S.me && S.me.decider);
  const byPos = (a, b) => (Number(a.position) - Number(b.position)) || String(a.label_en).localeCompare(String(b.label_en));
  const items = (kind, withArchived) => S.items.filter(i => i.kind === kind && (withArchived || !i.archived_at)).sort(byPos);
  function itemLabel(id) {
    const i = S.byId.get(id);
    if (!i) return "";
    return lang() === "fr" ? (i.label_fr || i.label_en) : i.label_en;
  }
  // Choix d'une liste : éléments non archivés, plus ceux que la fiche porte déjà (un élément archivé reste sur sa fiche).
  function itemOptions(kind, keep) {
    const kept = new Set([].concat(keep || []).filter(Boolean));
    return items(kind, true).filter(i => !i.archived_at || kept.has(i.id)).map(i => [i.id, itemLabel(i.id)]);
  }
  const groupOptions = () => [...fxOptions("auto_group"), ...itemOptions("group")];

  // ------------------------------------------------------------------ petits éléments d'écran
  const stateKey = () => ({ loading: "st_loading", closed: "st_closed", denied: "st_denied" }[S.state] || "st_offline");
  function stateBox() {
    const box = h("div", { class: "crm-state card", role: "status" }, h("p", { text: t(stateKey()) }));
    if (S.state === "offline") box.append(h("div", {}, btn(t("retry"), () => start())));
    return box;
  }
  function loadError(e, again) {
    const kind = e && e.kind;
    const box = h("div", { class: "crm-state card", role: "status" },
      h("p", { text: kind === "closed" ? t("st_closed") : kind === "not_found" ? t("gone") : t("load_fail") }));
    if (again && kind !== "closed" && kind !== "not_found") box.append(h("div", {}, btn(t("retry"), again)));
    return box;
  }
  const loading = () => h("p", { class: "crm-loading", role: "status", text: t("st_loading") });
  const empty = text => h("div", { class: "empty", text });
  const chip = (text, tone) => (text ? h("span", { class: "chip" + (tone ? " " + tone : ""), text }) : null);
  const section = (title, ...kids) => h("section", { class: "p-sec crm-sec" }, h("h4", { text: title }), ...kids);
  const sublabel = text => h("p", { class: "crm-sublabel", text });
  const note = text => h("p", { class: "note", text });
  function kv(rows) {
    const g = h("dl", { class: "crm-kv" });
    rows.filter(r => r && r[1] !== "" && r[1] != null).forEach(([k, v]) => { g.append(h("dt", { text: k }), h("dd", {}, isNode(v) ? v : String(v))); });
    return g.childNodes.length ? g : null;
  }
  function btn(label, onclick, cls, aria) {
    return h("button", { type: "button", class: "btn" + (cls ? " " + cls : ""), text: label, onclick, "aria-label": aria || null, title: aria || null });
  }
  // Bouton d'action : désactivé pendant l'enregistrement (pas de double envoi).
  function actBtn(label, run, cls, aria) {
    const b = btn(label, null, cls, aria);
    b.addEventListener("click", async () => {
      if (b.disabled) return;
      b.disabled = true;
      try { await run(); } finally { b.disabled = false; }
    });
    return b;
  }
  const acts = (...kids) => h("div", { class: "crm-acts" }, ...kids);
  function rowButton({ title, chips, lines, onclick, archivedLine }) {
    return h("button", { type: "button", class: "crm-row", onclick },
      h("span", { class: "t" }, h("span", { class: "n", text: title }), ...(chips || [])),
      ...(lines || []).filter(Boolean).map(l => (isNode(l) ? l : h("span", { class: "s", text: l }))),
      archivedLine ? h("span", { class: "s", text: archivedLine }) : null);
  }
  function siteLink(w) {
    const s = String(w || "").trim();
    if (!s) return "";
    const href = /^https?:\/\/[^\s]+$/i.test(s) ? s : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) ? "https://" + s : "";
    return href ? h("a", { href, target: "_blank", rel: "noopener noreferrer", text: s }) : s;
  }
  function quickLink(iconName, label, href) {
    const a = h("a", { class: "p-act" }, icon(iconName), label);
    if (href) a.setAttribute("href", href); else { a.setAttribute("aria-disabled", "true"); a.setAttribute("role", "link"); }
    return a;
  }
  const archivedLine = r => (r && r.archived_at ? t("archived_on", fmtDay(r.archived_at), actor(r.archived_by)) : "");

  let toastTimer = null;
  // Un message d'un geste précédent ne reste jamais affiché pendant un autre enregistrement (critère TR10).
  function clearToast() { clearTimeout(toastTimer); const e = byId("crm-toast"); if (e) e.hidden = true; }
  function toast(text, bad) {
    const e = byId("crm-toast");
    if (!e) return;
    e.textContent = text; e.className = "crm-toast" + (bad ? " err" : ""); e.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { e.hidden = true; }, bad ? 9000 : 3000);
  }
  function errorText(e) {
    const kind = e && e.kind;
    if (kind === "offline") return t("err_offline");
    if (kind === "conflict") return t("err_conflict");
    if (kind === "version") return t("err_version");
    if (kind === "forbidden") return t("err_forbidden");
    if (kind === "not_found") return t("err_not_found");
    if (kind === "closed") return t("err_closed");
    if (kind === "invalid") { const k = "err_" + (e.detail || ""); return e.detail && CT.en[k] !== undefined ? t(k) : t("err_invalid"); }
    return t("err_generic");
  }
  // Fiche modifiée ailleurs entre-temps (conflict, 409) ou lue sans sa version (version, 428) : réessayer tel quel échouerait
  // encore. La fiche est relue d'abord ; « rechargée » ne s'écrit qu'après une relecture réussie.
  const isStale = e => !!e && (e.kind === "conflict" || e.kind === "version");
  async function staleText(e, reload) {
    let ok;
    try { ok = (await (reload || refreshAfterWrite)()) !== false; } catch (x) { ok = false; }
    if (e.kind === "conflict") return t(ok ? "err_conflict_reloaded" : "err_conflict");
    return t(ok ? "err_version_reloaded" : "err_version");
  }
  // Action immédiate (sans formulaire) : message seulement après la réponse de la base ; fiche rechargée si elle a changé.
  async function doAction(run, okText, after) {
    try {
      const res = await run();
      toast(okText || t("saved"));
      if (after) await after(res);
      await refreshAfterWrite();
      return res;
    } catch (e) {
      toast(isStale(e) ? await staleText(e) : errorText(e), true);
      return undefined;
    }
  }

  // Échec dans une petite fenêtre : fiche modifiée entre-temps, la fenêtre (celle qui a envoyé, jeton tok) se ferme et la
  // fiche est rechargée ; sinon le message reste dans la fenêtre.
  async function failIn(msg, e, tok) {
    if (isStale(e)) { closeDialog(true, tok); toast(await staleText(e), true); return; }
    clearToast();
    msg.className = "crm-msg err"; msg.textContent = errorText(e);
  }

  // ------------------------------------------------------------------ fenêtre de formulaire (par-dessus l'écran)
  // dialogSeq : jeton de la fenêtre ouverte ; la réponse d'un envoi ne ferme que la fenêtre qui l'a lancé (défaut C15).
  // dialogGuard : dit si la fenêtre contient une saisie (le geste retour demande alors confirmation, défaut C11).
  let dialogBusy = false, dialogReturn = null, dialogSeq = 0, dialogGuard = null;
  function openDialog(title, ...content) {
    const d = byId("crm-dialog"), body = byId("crm-dialog-body");
    if (!d || !body) return 0;
    dialogReturn = doc.activeElement;
    clearToast();
    dialogSeq += 1; dialogGuard = null;
    byId("crm-dialog-title").textContent = title;
    put(body, ...content.flat(Infinity).filter(Boolean));
    d.hidden = false; byId("crm-dialog-back").hidden = false; dialogBusy = false;
    body.scrollTop = 0;
    updateFab(); refreshIcons();
    const first = body.querySelector("input:not([type=checkbox]):not([disabled]), select, textarea");
    setTimeout(() => { try { (first || byId("crm-dialog-close")).focus({ preventScroll: true }); } catch (e) { /* focus facultatif */ } }, 30);
    return dialogSeq;
  }
  function closeDialog(force, tok) {
    if (dialogBusy && !force) return false;
    if (tok != null && tok !== dialogSeq) return false;
    const d = byId("crm-dialog");
    if (!d || d.hidden) return false;
    dialogBusy = false; dialogGuard = null;
    d.hidden = true; byId("crm-dialog-back").hidden = true; byId("crm-dialog-body").replaceChildren();
    updateFab();
    try { if (dialogReturn && dialogReturn.isConnected) dialogReturn.focus({ preventScroll: true }); } catch (e) { /* focus facultatif */ }
    return true;
  }
  // Envoi depuis une petite fenêtre (confirmation, étape, revue, client actuel, suppression) : la fenêtre reste ouverte
  // pendant l'envoi (ni le fond, ni « Fermer », ni Échap, ni le geste retour ne la ferment) ; sa réponse ne touche qu'elle.
  async function busyRun(tok, fn) {
    if (dialogBusy || tok !== dialogSeq) return;
    dialogBusy = true;
    try { await fn(); } finally { if (tok === dialogSeq) dialogBusy = false; }
  }

  // ------------------------------------------------------------------ geste retour du téléphone (défaut C11)
  // Chaque calque ouvert (chaque niveau de la fiche, la fenêtre) porte une entrée d'historique, sans changer l'adresse : le
  // geste retour ferme le calque du dessus au lieu de quitter le site ; une fenêtre qui contient une saisie demande d'abord
  // confirmation. Le traitement de l'adresse au démarrage de la page n'est pas touché.
  const H = { pushed: 0, pending: false, timer: null };
  const hist = () => (root.history && typeof root.history.pushState === "function" && typeof root.history.go === "function" ? root.history : null);
  function layerDepth() {
    const sheet = byId("crm-sheet"), dialog = byId("crm-dialog");
    return (sheet && !sheet.hidden ? Math.max(S.stack.length, 1) : 0) + (dialog && !dialog.hidden ? 1 : 0);
  }
  function syncHistory() {
    if (!hist() || H.timer) return;
    H.timer = setTimeout(() => { H.timer = null; applyHistory(); }, 0);
  }
  function applyHistory() {
    const h = hist();
    if (!h || H.pending) return;
    const want = layerDepth();
    while (H.pushed < want) { H.pushed += 1; h.pushState({ lunaCrm: H.pushed }, ""); }
    if (H.pushed > want) { const n = H.pushed - want; H.pending = true; H.pushed = want; h.go(-n); }
  }
  // « Quitter » passe par la fermeture ordinaire : pendant un envoi, la fenêtre reste ouverte jusqu'à la réponse (défaut C15,
  // repris pour cette question). Toucher « Enregistrer » répond à la question : elle disparaît dès que l'envoi part.
  function askLeave() {
    const body = byId("crm-dialog-body");
    if (!body || body.querySelector(".crm-leave")) return;
    const box = h("div", { class: "crm-warn crm-leave", role: "alert" }, h("span", { text: t("leave_q") }),
      h("div", { class: "crm-acts" }, btn(t("stay"), () => box.remove()), btn(t("leave"), () => closeDialog(), "danger")));
    body.insertBefore(box, body.firstChild);
    body.scrollTop = 0;
  }
  function onPopState(ev) {
    const idx = ev && ev.state && typeof ev.state.lunaCrm === "number" ? ev.state.lunaCrm : 0;
    if (H.pending) { H.pending = false; H.pushed = idx; applyHistory(); return; }   // retour demandé par l'écran lui-même
    const depth = layerDepth();
    H.pushed = Math.min(idx, depth);
    if (depth === 0) { if (idx > 0 && hist()) hist().back(); return; }              // entrée restée d'avant un rechargement
    if (idx >= depth) { applyHistory(); return; }
    const dialog = byId("crm-dialog");
    if (!dialog.hidden) {
      if (dialogBusy || (dialogGuard && dialogGuard())) {                           // envoi en cours, ou saisie : on demande
        if (!dialogBusy) askLeave();
        applyHistory();
        return;
      }
      closeDialog(true);
    }
    if (!byId("crm-sheet").hidden && layerDepth() > idx) {
      while (S.stack.length > 1 && layerDepth() > idx) S.stack.pop();
      if (layerDepth() > idx) closeSheet(); else renderSheet();
    }
    applyHistory();
  }

  function field(label, control, o) {
    o = o || {};
    const lab = h("span", { class: "crm-label" }, label, o.optional ? h("small", { text: " (" + t("opt_optional") + ")" }) : null);
    return h(o.group ? "div" : "label", { class: "crm-field" }, lab, control, o.hint ? h("small", { class: "crm-hint", text: o.hint }) : null);
  }
  function fText(key, label, value, o) {
    o = o || {};
    const input = h("input", { type: o.type || "text", value: value == null ? "" : value, maxlength: o.max || 200, autocomplete: "off",
      inputmode: o.inputmode || null, autocapitalize: o.type === "email" || o.type === "url" ? "off" : null, spellcheck: o.type === "email" || o.type === "url" ? "false" : null });
    const f = { key, input, node: field(label, input, { optional: !o.required && !o.noOpt, hint: o.hint }), get: () => input.value.trim(), more: !!o.more };
    f.check = () => { const v = input.value.trim(); if (o.required && !v) return "err_required"; return o.check ? o.check(v) : ""; };
    return f;
  }
  function fArea(key, label, value, o) {
    o = o || {};
    const input = h("textarea", { maxlength: o.max || 4000, value: value == null ? "" : value });
    return { key, input, node: field(label, input, { optional: !o.required && !o.noOpt, hint: o.hint }), get: () => input.value.trim(), check: () => "" };
  }
  function fSelect(key, label, options, value, o) {
    o = o || {};
    const sel = h("select", {}, o.empty !== undefined ? h("option", { value: "", text: o.empty }) : null, options.map(([v, l]) => h("option", { value: v, text: l })));
    sel.value = value == null ? "" : value;
    if (sel.value !== String(value == null ? "" : value)) sel.value = o.empty !== undefined ? "" : (options[0] ? options[0][0] : "");
    const f = { key, input: sel, node: field(label, sel, { optional: !o.required && !o.noOpt }), get: () => sel.value || null, more: !!o.more };
    f.check = () => (o.required && !sel.value ? (o.requiredKey || "err_required") : "");
    return f;
  }
  function fCheck(key, label, value, o) {
    const box = h("input", { type: "checkbox", checked: !!value });
    return { key, input: box, node: h("label", { class: "crm-check" }, box, h("span", { text: label })), get: () => box.checked, check: () => "", more: !!(o && o.more) };
  }
  function fMulti(key, label, options, values, o) {
    const set = new Set(values || []);
    const group = h("div", { class: "crm-checks", role: "group", "aria-label": label },
      options.map(([v, l]) => h("label", {}, h("input", { type: "checkbox", value: v, checked: set.has(v) }), h("span", { text: l }))));
    return { key, node: field(label, group, { optional: true, group: true }), get: () => [...group.querySelectorAll("input:checked")].map(b => b.value), check: () => "", more: !!(o && o.more) };
  }
  function fDate(key, label, value, o) {
    const input = h("input", { type: "date", value: value || "" });
    return { key, input, node: field(label, input, { optional: true }), get: () => input.value || null, check: () => "", more: !!(o && o.more) };
  }
  function fDateTime(key, label, iso) {
    const initial = toLocalInput(iso);
    const input = h("input", { type: "datetime-local", value: initial });
    return { key, input, node: field(label, input, { noOpt: true }), get: () => (input.value === initial && iso ? iso : fromLocalInput(input.value)),
             check: () => (input.value ? "" : "err_required") };
  }
  function fAed(key, label, value) {
    const input = h("input", { type: "text", inputmode: "numeric", autocomplete: "off", value: value == null ? "" : fmtInt(value) });
    return { key, input, node: field(label, input, { optional: true }), get: () => parseAed(input.value), check: () => (parseAed(input.value) === undefined ? "err_value" : "") };
  }
  // Choix d'une fiche par recherche (le texte cherché part dans le corps de la requête, par l'adaptateur).
  function fPicker(key, label, value, o) {
    o = o || {};
    let cur = value || null, seq = 0;
    const wrap = h("div", { class: "crm-picker" });
    const results = h("div", { class: "crm-picks" });
    const input = h("input", { type: "search", placeholder: t("search_pick"), autocomplete: "off", "aria-label": label });
    const kinds = o.kinds || ["company"];
    function render() {
      if (cur) {
        put(wrap, h("div", { class: "crm-picked" },
          h("span", { class: "n", text: cur.name + (kinds.length > 1 ? " · " + t("rt_" + cur.type) : "") }),
          o.fixed ? null : btn(t("change"), () => { cur = null; input.value = ""; results.replaceChildren(); render(); if (o.onChange) o.onChange(null); try { input.focus(); } catch (e) { /* facultatif */ } }, "sm")));
      } else put(wrap, input, results);
    }
    input.addEventListener("input", debounce(async () => {
      const q = input.value.trim(), my = ++seq;
      if (!q) { results.replaceChildren(); return; }
      try {
        const out = [];
        if (kinds.includes("company")) (await api().companies({ q })).slice(0, 8).forEach(r => out.push({ type: "company", id: r.id, name: r.name, meta: fx("relationship_status", r.status), row: r }));
        if (kinds.includes("contact")) (await api().contacts({ q })).slice(0, 8).forEach(r => out.push({ type: "contact", id: r.id, name: fullName(r), meta: r.company_name || t("rt_contact"), row: r }));
        if (my !== seq) return;
        put(results, ...(out.length ? out.map(x => h("button", { type: "button", class: "crm-pick", onclick: () => {
          cur = { type: x.type, id: x.id, name: x.name, row: x.row }; render(); if (o.onChange) o.onChange(cur);
        } }, h("span", { class: "n", text: x.name }), x.meta ? h("small", { text: x.meta }) : null)) : [h("p", { class: "crm-msg", text: t("none_match") })]));
      } catch (e) { if (my === seq) put(results, h("p", { class: "crm-msg err", text: t("load_fail") })); }
    }, 250));
    render();
    return { key, input, node: field(label, wrap, { optional: !o.required, group: true }), get: () => cur, check: () => (o.required && !cur ? "err_required" : ""), more: !!o.more };
  }

  // Formulaire : contrôle des champs, enregistrement, message « non enregistré » et saisie gardée en cas d'échec.
  // ui.hold(clé, vrai) garde « Enregistrer » inactif tant qu'un chargement dont dépendent les valeurs n'est pas fini, dix
  // secondes au plus (défauts C5 et C6, WAIT.choicesMs) ; ui.note(...) affiche un avis dans le formulaire ; reload relit ce
  // qu'il faut après un refus.
  function formDialog({ title, fields, submit, submitLabel, intro, done, openMore, reload }) {
    const msg = h("p", { class: "crm-msg", role: "status", "aria-live": "polite" });
    const extra = h("div", { class: "crm-extra" });
    const notice = h("div", { class: "crm-notice", hidden: true });
    const save = h("button", { type: "submit", class: "btn primary", text: submitLabel || t("save") });
    const main = fields.filter(f => !f.more), more = fields.filter(f => f.more);
    const form = h("form", { class: "crm-form", novalidate: true },
      intro || null, main.map(f => f.node),
      more.length ? h("details", { class: "crm-more", open: !!openMore }, h("summary", { text: t("more_details") }), h("div", { class: "crm-form" }, more.map(f => f.node))) : null,
      notice, extra, h("div", { class: "crm-actions" }, msg, btn(t("cancel"), () => closeDialog()), save));
    const holds = new Set();
    let sending = false;
    const syncSave = () => { save.disabled = sending || holds.size > 0; };
    const ui = { msg, extra, notice, form, save, dirty: false, token: 0,
      hold(key, on) { if (on) holds.add(key); else holds.delete(key); syncSave(); },
      note(...nodes) { put(notice, ...nodes); notice.hidden = !notice.childNodes.length; } };
    form.addEventListener("input", () => { ui.dirty = true; });
    form.addEventListener("change", () => { ui.dirty = true; });
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (dialogBusy || holds.size) return;
      extra.replaceChildren();
      const values = {};
      for (const f of fields) {
        if (f.node.hidden) continue;
        const bad = f.check ? f.check() : "";
        if (bad) {
          msg.className = "crm-msg err"; msg.textContent = t(bad);
          if (f.more) { const d = form.querySelector("details.crm-more"); if (d) d.open = true; }
          try { if (f.input) f.input.focus(); } catch (e) { /* facultatif */ }
          return;
        }
        values[f.key] = f.get();
      }
      dialogBusy = true; sending = true; syncSave(); msg.className = "crm-msg"; msg.textContent = t("saving"); clearToast();
      const leaveBox = byId("crm-dialog-body").querySelector(".crm-leave");
      if (leaveBox) leaveBox.remove();
      try {
        const res = await submit(values, ui);
        if (res === false) {                                                   // avertissement affiché : Renata choisit
          msg.textContent = "";
          try { extra.scrollIntoView({ block: "nearest" }); } catch (e) { /* facultatif */ }
          return;
        }
        closeDialog(true, ui.token);
        toast(t("saved"));
        if (done) await done(res);
      } catch (e) {
        clearToast();
        msg.className = "crm-msg err"; msg.textContent = errorText(e);
        if (isStale(e)) {
          extra.append(h("div", { class: "crm-warn" }, e.kind === "conflict" ? h("span", { text: t("conflict_hint") }) : null,
            btn(t("reload"), async () => { closeDialog(true, ui.token); await (reload || refreshAfterWrite)(); })));
        }
      } finally { if (ui.token === dialogSeq) dialogBusy = false; sending = false; syncSave(); }
    });
    ui.token = openDialog(title, form);
    dialogGuard = () => ui.dirty;
    return ui;
  }
  // Renvoie le formulaire après « Créer quand même » (repli pour les navigateurs sans requestSubmit).
  function resubmit(ui) { if (typeof ui.form.requestSubmit === "function") ui.form.requestSubmit(); else ui.save.click(); }
  function warnBox(title, rows, onAnyway, anywayLabel) {
    return h("div", { class: "crm-warn", role: "alert" }, h("span", { text: title }), rows,
      h("span", { class: "s", text: t("dup_nothing_merged") }), h("div", { class: "crm-acts" }, btn(anywayLabel || t("create_anyway"), onAnyway)));
  }
  function openLink(label, type, id) {
    return h("button", { type: "button", class: "linkbtn", text: label, onclick: () => { if (dialogBusy) return; closeDialog(true); openRecord(type, id); } });
  }
  // Champs réellement changés (rien n'est envoyé si rien ne change).
  function diff(row, values, keys) {
    const out = {};
    keys.forEach(k => {
      if (!(k in values)) return;
      const a = row ? row[k] : null, b = values[k] === "" ? null : values[k];
      let same;
      if (Array.isArray(a) || Array.isArray(b)) same = JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
      else if (/_at$/.test(k) && a && b) same = new Date(a).getTime() === new Date(b).getTime();
      else same = (a == null ? null : a) === (b == null ? null : b);
      if (!same) out[k] = b;
    });
    return out;
  }
  async function saveChanges(type, row, values, keys) {
    const ch = diff(row, values, keys);
    if (!Object.keys(ch).length) return row;
    return api().update(type, row.id, row.version, ch);
  }

  // ------------------------------------------------------------------ listes (panneaux)
  const panelEl = p => byId("p-crm-" + p);
  const panelVisible = p => { const e = panelEl(p); return !!e && !e.hidden; };
  function renderPanel(p, rebuild) {
    const box = byId("crm-" + p);
    if (!box) return;
    if (S.state !== "ready") { put(box, stateBox()); S.built[p] = false; return; }
    if (!panelVisible(p)) return;
    if (!S.built[p] || rebuild) { BUILD[p](box); S.built[p] = true; refreshIcons(); }
    LOAD[p]();
  }
  function ctlSelect(id, label, options, value, onChange) {
    const sel = h("select", { id, "aria-label": label }, options.map(([v, l]) => h("option", { value: v, text: l })));
    sel.value = value || "";
    if (sel.value !== (value || "")) sel.value = options.length ? options[0][0] : "";
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  }
  function ctlCheck(id, label, value, onChange) {
    const b = h("input", { type: "checkbox", id, checked: !!value });
    b.addEventListener("change", () => onChange(b.checked));
    return h("label", { class: "check", for: id }, b, h("span", { text: label }));
  }
  function ctlSearch(id, placeholder, value, onInput) {
    const i = h("input", { type: "search", id, placeholder, "aria-label": t("search"), value: value || "", autocomplete: "off" });
    i.addEventListener("input", debounce(() => onInput(i.value), 250));
    return h("div", { class: "searchbar crm-search" }, icon("search"), i);
  }
  const filterBox = (id, controls, n) => h("details", { class: "crm-filters", id }, h("summary", { text: t("filters", n) }), h("div", { class: "crm-filter-grid" }, controls));
  function setFilterCount(id, n) { const d = byId(id); if (d && d.firstChild) d.firstChild.textContent = t("filters", n); }
  async function loadList(key, listId, infoId, getRows, render, emptyText) {
    const my = nextSeq(key), list = byId(listId), info = byId(infoId);
    if (!list) return;
    list.setAttribute("aria-busy", "true");
    try {
      const rows = await getRows();
      if (my !== S.seq[key]) return;
      render(rows, list, info, emptyText);
    } catch (e) {
      if (my !== S.seq[key]) return;
      if (info) info.textContent = "";
      put(list, loadError(e, () => LOAD[key === "co" ? "companies" : key === "ct" ? "contacts" : "pipeline"]()));
    } finally { if (my === S.seq[key]) list.removeAttribute("aria-busy"); }
  }

  // Entreprises (E4)
  const companyFilterCount = () => ["status", "group", "sector", "tag"].filter(k => S.cf[k]).length + (S.cf.archived ? 1 : 0);
  function buildCompanies(box) {
    const f = S.cf;
    const re = () => { setFilterCount("crm-co-filters", companyFilterCount()); loadCompanies(); };
    put(box, 
      h("div", { class: "crm-controls" },
        ctlSearch("crm-co-q", t("search_companies"), f.q, v => { f.q = v; loadCompanies(); }),
        filterBox("crm-co-filters", [
          ctlSelect("crm-co-status", t("f_status"), [["", t("all_statuses")], ...fxOptions("relationship_status")], f.status, v => { f.status = v; re(); }),
          ctlSelect("crm-co-group", t("f_groups"), [["", t("all_groups")], ...groupOptions()], f.group, v => { f.group = v; re(); }),
          ctlSelect("crm-co-sector", t("f_industries"), [["", t("all_industries")], ...itemOptions("sector")], f.sector, v => { f.sector = v; re(); }),
          ctlSelect("crm-co-tag", t("f_tags"), [["", t("all_tags")], ...itemOptions("tag")], f.tag, v => { f.tag = v; re(); }),
          ctlCheck("crm-co-arch", t("f_archived"), f.archived, v => { f.archived = v; re(); })
        ], companyFilterCount())),
      h("p", { class: "crm-count", id: "crm-co-count", role: "status", "aria-live": "polite" }),
      h("div", { class: "crm-list", id: "crm-co-list" }));
  }
  function companyRow(r) {
    const main = [r.primary_contact_first_name, r.primary_contact_last_name].filter(Boolean).join(" ");
    const meta = [main, r.last_contact_at ? t("last_contact_on", fmtDay(r.last_contact_at)) : "",
      Number(r.open_deal_count) ? t("open_deals_n", Number(r.open_deal_count)) : ""].filter(Boolean).join(" · ");
    return rowButton({ title: r.name, chips: [chip(fx("relationship_status", r.status), statusTone(r.status))], lines: [meta],
      archivedLine: archivedLine(r), onclick: () => openRecord("company", r.id) });
  }
  function loadCompanies() {
    const filtered = !!(S.cf.q || companyFilterCount());
    return loadList("co", "crm-co-list", "crm-co-count", () => api().companies(S.cf), (rows, list, info) => {
      info.textContent = t("count_companies", rows.length);
      put(list, ...(rows.length ? rows.map(companyRow) : [empty(filtered ? t("none_match") : t("no_companies_yet"))]));
    });
  }

  // Contacts (E6)
  const contactFilterCount = () => ["group", "nature", "companyStatus", "tag"].filter(k => S.kf[k]).length + ["review", "dnc", "archived"].filter(k => S.kf[k]).length;
  function buildContacts(box) {
    const f = S.kf;
    const re = () => { setFilterCount("crm-ct-filters", contactFilterCount()); loadContacts(); };
    put(box, 
      h("div", { class: "crm-controls" },
        ctlSearch("crm-ct-q", t("search_contacts"), f.q, v => { f.q = v; loadContacts(); }),
        filterBox("crm-ct-filters", [
          ctlSelect("crm-ct-group", t("f_groups"), [["", t("all_groups")], ...groupOptions()], f.group, v => { f.group = v; re(); }),
          ctlSelect("crm-ct-nature", t("f_type"), [["", t("all_types")], ...fxOptions("contact_nature")], f.nature, v => { f.nature = v; re(); }),
          ctlSelect("crm-ct-costatus", t("f_status"), [["", t("all_company_statuses")], ...fxOptions("relationship_status")], f.companyStatus, v => { f.companyStatus = v; re(); }),
          ctlSelect("crm-ct-tag", t("f_tags"), [["", t("all_tags")], ...itemOptions("tag")], f.tag, v => { f.tag = v; re(); }),
          ctlCheck("crm-ct-review", t("f_to_review"), f.review, v => { f.review = v; re(); }),
          ctlCheck("crm-ct-dnc", t("f_dnc"), f.dnc, v => { f.dnc = v; re(); }),
          ctlCheck("crm-ct-arch", t("f_archived"), f.archived, v => { f.archived = v; re(); })
        ], contactFilterCount())),
      h("p", { class: "crm-count", id: "crm-ct-count", role: "status", "aria-live": "polite" }),
      h("div", { class: "crm-list", id: "crm-ct-list" }));
  }
  function contactRow(r) {
    const chips = [
      r.is_primary_contact ? chip(t("main_contact_badge"), "good") : null,
      r.decision_role === "decision_maker" ? chip(fx("decision_role", "decision_maker"), "") : null,
      r.do_not_contact ? chip(t("dnc"), "warn") : null,
      r.review_due && !r.archived_at ? chip(t("to_review"), "warn") : null];
    return rowButton({ title: fullName(r), chips, lines: [[r.job_title, r.company_name].filter(Boolean).join(" · ")],
      archivedLine: archivedLine(r), onclick: () => openRecord("contact", r.id) });
  }
  function loadContacts() {
    const filtered = !!(S.kf.q || contactFilterCount());
    return loadList("ct", "crm-ct-list", "crm-ct-count", () => api().contacts(S.kf), (rows, list, info) => {
      info.textContent = t("count_contacts", rows.length);
      put(list, ...(rows.length ? rows.map(contactRow) : [empty(filtered ? t("none_match") : t("no_contacts_list"))]));
    });
  }

  // Pipeline (E2)
  const pipelineFilterCount = () => (S.pf.service ? 1 : 0) + (S.pf.source ? 1 : 0) + (S.pf.noNext && S.pf.view === "open" ? 1 : 0) + (S.pf.archived ? 1 : 0);
  function buildPipeline(box) {
    const f = S.pf;
    const re = () => { setFilterCount("crm-pl-filters", pipelineFilterCount()); loadPipeline(); };
    const seg = h("div", { class: "crm-seg", role: "group", "aria-label": t("view_label") },
      [["open", t("view_open")], ["closed", t("view_closed")]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(f.view === v), text: l,
        onclick: () => { if (f.view === v) return; f.view = v; buildPipeline(box); loadPipeline(); } })));
    const period = f.view === "closed" ? ctlSelect("crm-pl-period", t("f_period"),
      [["month", t("period_month")], ["quarter", t("period_quarter")], ["year", t("period_year")], ["all", t("period_all")]], f.period, v => { f.period = v; loadPipeline(); }) : null;
    put(box, 
      h("div", { class: "crm-controls" }, h("div", { class: "crm-bar" }, seg, period),
        filterBox("crm-pl-filters", [
          ctlSelect("crm-pl-service", t("f_services"), [["", t("all_services")], ...itemOptions("service")], f.service, v => { f.service = v; re(); }),
          ctlSelect("crm-pl-source", t("f_source"), [["", t("all_sources")], ...itemOptions("source")], f.source, v => { f.source = v; re(); }),
          f.view === "open" ? ctlCheck("crm-pl-nonext", t("f_no_next"), f.noNext, v => { f.noNext = v; re(); }) : null,
          ctlCheck("crm-pl-arch", t("f_archived"), f.archived, v => { f.archived = v; re(); })
        ].filter(Boolean), pipelineFilterCount())),
      h("div", { class: "crm-total", id: "crm-pl-total" }),
      h("div", { class: "crm-stages", id: "crm-pl-stages" }),
      h("p", { class: "crm-count", id: "crm-pl-count", role: "status", "aria-live": "polite" }),
      h("div", { class: "crm-list", id: "crm-pl-list" }));
  }
  function periodRange(p) {
    const d = today(), y = d.slice(0, 4), m = Number(d.slice(5, 7));
    if (p === "month") return { from: `${y}-${d.slice(5, 7)}-01`, to: d };
    if (p === "quarter") return { from: `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`, to: d };
    if (p === "year") return { from: `${y}-01-01`, to: d };
    return {};
  }
  const stageLabel = s => itemLabel(s.stage_id) || (lang() === "fr" ? (s.label_fr || s.label_en) : s.label_en);
  function dealRow(r, o) {
    o = o || {};
    const closed = r.stage_outcome && r.stage_outcome !== "open";
    const lines = [[o.hideCompany ? "" : r.company_name, r.value_aed != null ? fmtAed(r.value_aed) : ""].filter(Boolean).join(" · ")];
    const chips = [];
    if (closed || o.showStage) chips.push(chip(itemLabel(r.stage_id), r.stage_outcome === "won" ? "good" : "muted"));
    if (closed) lines.push([r.close_reason_id ? itemLabel(r.close_reason_id) : "", r.closed_on ? t("closed_on_d", fmtDay(r.closed_on)) : ""].filter(Boolean).join(" · "));
    else {
      const late = !!(r.follow_up_on && r.follow_up_on < today());
      const nextText = r.next_step ? r.next_step + (r.follow_up_on ? " · " + fmtDay(r.follow_up_on) : "")
                                   : (r.follow_up_on ? t("follow_up_on", fmtDay(r.follow_up_on)) : t("no_next_step"));
      lines.push(h("span", { class: "s" + (late ? " late" : ""), text: nextText }));
      lines.push(t("days_in_stage", Number(r.days_in_stage) || 0));
    }
    return rowButton({ title: r.name || t("unnamed_deal"), chips, lines, archivedLine: archivedLine(r), onclick: () => openRecord("deal", r.id) });
  }
  async function loadPipeline() {
    const my = nextSeq("pl"), f = S.pf;
    const list = byId("crm-pl-list"), info = byId("crm-pl-count"), stagesBox = byId("crm-pl-stages"), total = byId("crm-pl-total");
    if (!list) return;
    list.setAttribute("aria-busy", "true");
    const common = { service: f.service, source: f.source, archived: f.archived };
    const sumOf = rows => fmtAed(rows.reduce((a, r) => a + Number(r.value_aed || 0), 0));
    try {
      if (f.archived) {
        const rows = await api().deals(common);
        if (my !== S.seq.pl) return;
        total.replaceChildren(); stagesBox.replaceChildren();
        info.textContent = t("count_deals", rows.length);
        put(list, ...(rows.length ? rows.map(r => dealRow(r, { showStage: true })) : [empty(t("none_match"))]));
      } else if (f.view === "open") {
        // Sans filtre : nombres et valeurs de la vue pipeline_summary. Avec un filtre (service, source, sans prochaine étape) :
        // calculés sur les affaires ouvertes filtrées, lues une fois, et la valeur est dite « filtrée » (défaut C10).
        const filtered = !!(f.service || f.source || f.noNext);
        const [sum, open] = await Promise.all([api().pipeline(), filtered ? api().deals({ ...common, outcome: "open", noNextStep: f.noNext }) : null]);
        if (my !== S.seq.pl) return;
        const by = id => (open || []).filter(r => r.stage_id === id);
        // Étapes dans l'ordre de Paramètres (position, puis libellé anglais) : deux positions égales s'affichent partout pareil.
        const shown = (sum || []).slice().sort(byPos).filter(s => s.stage_outcome === "open").map(s => (filtered
          ? Object.assign({}, s, { deal_count: by(s.stage_id).length, value_aed_total: by(s.stage_id).reduce((a, r) => a + Number(r.value_aed || 0), 0) }) : s));
        const stages = shown.filter(s => !s.stage_archived || Number(s.deal_count) > 0);
        if (!stages.some(s => s.stage_id === f.stage)) f.stage = stages.length ? stages[0].stage_id : "";
        const totalValue = stages.reduce((a, s) => a + Number(s.value_aed_total || 0), 0);
        put(total, h("span", { class: "l", text: t(filtered ? "pipeline_value_filtered" : "pipeline_value") }), h("span", { class: "v", text: fmtAed(totalValue) }));
        put(stagesBox, ...stages.map(s => h("button", { type: "button", class: "crm-stage", "aria-pressed": String(s.stage_id === f.stage),
          onclick: () => { f.stage = s.stage_id; loadPipeline(); } },
          h("span", { class: "l", text: stageLabel(s) }), h("span", { class: "n", text: fmtInt(s.deal_count) }), h("span", { class: "v", text: fmtAed(s.value_aed_total) }))));
        const rows = !f.stage ? [] : filtered ? by(f.stage) : await api().deals({ ...common, stage: f.stage, noNextStep: f.noNext });
        if (my !== S.seq.pl) return;
        const cur = stages.find(s => s.stage_id === f.stage);
        info.textContent = cur ? t("stage_count", stageLabel(cur), rows.length, sumOf(rows)) : "";
        put(list, ...(rows.length ? rows.map(r => dealRow(r)) : [empty(t("no_deals_stage"))]));
      } else {
        const range = periodRange(f.period);
        const rows = await api().deals({ ...common, outcome: "closed", closedFrom: range.from, closedTo: range.to });
        if (my !== S.seq.pl) return;
        const won = rows.filter(r => r.stage_outcome === "won"), lost = rows.filter(r => r.stage_outcome === "lost");
        total.replaceChildren();
        put(stagesBox, 
          h("div", { class: "crm-stage static" }, h("span", { class: "l", text: fx("stage_outcome", "won") }), h("span", { class: "n", text: fmtInt(won.length) }), h("span", { class: "v", text: sumOf(won) })),
          h("div", { class: "crm-stage static" }, h("span", { class: "l", text: fx("stage_outcome", "lost") }), h("span", { class: "n", text: fmtInt(lost.length) }), h("span", { class: "v", text: sumOf(lost) })));
        info.textContent = t("count_deals", rows.length);
        put(list, ...(rows.length ? rows.map(r => dealRow(r)) : [empty(t("none_match"))]));
      }
    } catch (e) {
      if (my !== S.seq.pl) return;
      info.textContent = ""; total.replaceChildren(); stagesBox.replaceChildren();
      put(list, loadError(e, loadPipeline));
    } finally { if (my === S.seq.pl) list.removeAttribute("aria-busy"); }
  }

  const BUILD = { pipeline: buildPipeline, companies: buildCompanies, contacts: buildContacts };
  const LOAD = { pipeline: loadPipeline, companies: loadCompanies, contacts: loadContacts };

  // ------------------------------------------------------------------ fiches (par-dessus les listes)
  function showSheet() { byId("crm-sheet").hidden = false; byId("crm-sheet-back").hidden = false; updateFab(); }
  function closeSheet() {
    S.stack = []; S.current = null; nextSeq("sheet");
    byId("crm-sheet").hidden = true; byId("crm-sheet-back").hidden = true; byId("crm-sheet-body").replaceChildren();
    updateFab();
  }
  function sheetBack() { S.stack.pop(); syncHistory(); if (S.stack.length) renderSheet(); else closeSheet(); }
  async function openRecord(type, id) {
    const top = S.stack[S.stack.length - 1];
    if (!top || top.type !== type || top.id !== id) S.stack.push({ type, id });
    showSheet();
    return renderSheet();
  }
  // Rend vrai si la fiche a été relue et affichée, faux sinon.
  async function renderSheet() {
    const top = S.stack[S.stack.length - 1];
    if (!top) { closeSheet(); return true; }
    const my = nextSeq("sheet"), body = byId("crm-sheet-body"), title = byId("crm-sheet-title");
    byId("crm-sheet-back-btn").hidden = S.stack.length < 2;
    const same = S.current && S.current.type === top.type && S.current.row && S.current.row.id === top.id;
    const scroll = same ? body.scrollTop : 0;
    if (!same) { title.textContent = ""; put(body, loading()); }
    let ok = true;
    try {
      const view = await VIEWS[top.type](top.id);
      if (my !== S.seq.sheet) return true;
      title.textContent = view.title;
      put(body, ...view.nodes.filter(Boolean));
      body.scrollTop = scroll;
      refreshIcons();
    } catch (e) {
      if (my !== S.seq.sheet) return true;
      S.current = null; ok = false;
      put(body, loadError(e, renderSheet));
    }
    updateFab();
    return ok;
  }
  // Rend faux si la fiche ouverte n'a pas pu être relue (le message ne dira pas « rechargée »).
  async function refreshAfterWrite() {
    PANELS.forEach(p => { if (panelVisible(p)) renderPanel(p); });
    if (!byId("crm-sheet").hidden) return renderSheet();
    return true;
  }
  function archivedBanner(type, row) {
    if (!row.archived_at) return null;
    return h("div", { class: "crm-warn" }, h("span", { text: archivedLine(row) }),
      h("div", { class: "crm-acts" }, actBtn(t("restore"), () => doAction(() => api().restore(type, row.id, row.version), t("restored")))));
  }
  function archivedList(list, labelOf, action) {
    if (!list.length) return null;
    const run = action || doAction;
    return h("details", { class: "crm-archived" }, h("summary", { text: t("show_archived", list.length) }),
      list.map(([type, r]) => h("div", { class: "crm-subline" },
        h("span", { class: "s" }, h("b", { text: labelOf([type, r]) }), " · " + archivedLine(r)),
        h("span", { class: "crm-mini" }, actBtn(t("restore"), () => run(() => api().restore(type, r.id, r.version), t("restored")), "sm")))));
  }
  function confirmArchive(type, row) {
    const msg = h("p", { class: "crm-msg", role: "status" });
    const tok = openDialog(t("archive_title"), h("p", { class: "note", text: t("archive_lead") }),
      h("div", { class: "crm-actions" }, btn(t("cancel"), () => closeDialog()), actBtn(t("archive"), () => busyRun(tok, async () => {
        try { await api().archive(type, row.id, row.version); closeDialog(true, tok); toast(t("archived_done")); await refreshAfterWrite(); }
        catch (e) { await failIn(msg, e, tok); }
      }), "primary")), msg);
  }
  function footer(type, row, onEdit) {
    return h("div", { class: "crm-foot" },
      row.archived_at ? null : btn(t("edit"), onEdit),
      row.archived_at ? actBtn(t("restore"), () => doAction(() => api().restore(type, row.id, row.version), t("restored")))
                      : btn(t("archive"), () => confirmArchive(type, row)),
      isDecider() ? btn(t("delete_perm"), () => deleteDialog(type, row), "danger") : null);
  }
  function notesSection(ctx, notesList, rel) {
    rel = rel || {};
    const active = notesList.filter(n => !n.archived_at), arch = notesList.filter(n => n.archived_at);
    const about = n => {
      if (!ctx.company) return "";
      if (n.deal_id) { const d = (rel.deals || []).find(x => x.id === n.deal_id); if (d) return t("about_x", d.name || t("unnamed_deal")); }
      if (n.contact_id) { const c = (rel.contacts || []).find(x => x.id === n.contact_id); if (c) return t("about_x", fullName(c)); }
      return "";
    };
    const locked = Object.values(ctx).some(r => r && r.archived_at);
    const noteBox = n => h("article", { class: "crm-note" },
      h("div", { class: "crm-note-head" }, chip(fx("exchange_type", n.kind), n.kind === "note" ? "muted" : ""),
        h("span", { class: "s", text: [fmtWhen(n.occurred_at), n.created_by ? t("by_x", actor(n.created_by)) : "", about(n)].filter(Boolean).join(" · ") })),
      n.body ? h("p", { class: "crm-note-body", text: n.body }) : null,
      locked ? null : h("div", { class: "crm-mini" }, btn(t("edit"), () => noteForm(n), "sm"),
        actBtn(t("archive"), () => doAction(() => api().archive("note", n.id, n.version), t("archived_done")), "sm")));
    return section(t("sec_notes"),
      active.length ? active.map(noteBox) : note(t("no_notes")),
      archivedList(arch.map(n => ["note", n]), ([, n]) => [fx("exchange_type", n.kind), fmtDay(n.occurred_at)].join(" · ")),
      locked ? null : acts(btn(t("log_activity"), () => noteForm(null, ctx))));
  }
  const VALUED = ["status", "stage_id", "value_aed", "nature", "months", "close_reason_id", "closed_on", "follow_up_on", "expected_decision_on",
                  "review_due_on", "is_renewal", "state", "is_primary", "phone_type", "decision_role", "preferred_language", "source_id", "do_not_contact"];
  function fmtValue(f, v) {
    if (v == null) return "";
    if (f === "status") return fx("relationship_status", v);
    if (f === "nature") return fx("contact_nature", v);
    if (f === "decision_role") return fx("decision_role", v);
    if (f === "preferred_language") return fx("preferred_language", v);
    if (f === "state") return fx("email_state", v);
    if (f === "phone_type") return fx("phone_type", v);
    if (f === "stage_id" || f === "source_id" || f === "close_reason_id") return itemLabel(v);
    if (f === "value_aed") return fmtAed(v);
    if (f === "months") return t("months_n", v);
    if (/_on$/.test(f)) return fmtDay(v);
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    return "";
  }
  function journalDetail(j) {
    if (j.action === "delete") return j.reason ? t("f_reason") + colon() + fx("deletion_reason", j.reason) : "";
    if (j.action !== "update" && j.action !== "stage_change" && j.action !== "status_change") return "";
    const skip = ["archived_at", "archive_reason", "engine_link_key"];
    const parts = (j.changed_fields || []).filter(f => !skip.includes(f)).map(f => {
      const label = t("fld_" + f) || t("fld_other");
      const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
      if (VALUED.includes(f) && has(j.old_values, f) && has(j.new_values, f)) {
        const a = fmtValue(f, j.old_values[f]) || t("empty_value"), b = fmtValue(f, j.new_values[f]) || t("empty_value");
        return `${label} (${a} → ${b})`;
      }
      return label;
    });
    return parts.length ? t("changed_x", [...new Set(parts)].join(", ")) : "";
  }
  function historySection(rows, mainId) {
    const line = j => h("li", {},
      h("span", { class: "s", text: [fmtWhen(j.at), actor(j.actor)].filter(Boolean).join(" · ") }),
      h("span", { class: "t", text: [j.record_id !== mainId ? t("rt_" + j.record_type) : "", fx("journal_action", j.action)].filter(Boolean).join(" · ") }),
      journalDetail(j) ? h("span", { class: "s", text: journalDetail(j) }) : null);
    return section(t("sec_history"), rows.length ? h("ol", { class: "crm-history" }, rows.map(line)) : note(t("no_history")));
  }

  // Fiche entreprise (E5) : résumé, décideurs, marques et points de vente, affaires, notes et échanges, historique.
  async function companyView(id) {
    const A = api();
    const co = await A.company(id);
    const [contacts, brands, outlets, deals] = await Promise.all([A.contacts({ company: id }), A.brands(id), A.outlets(id), A.deals({ company: id })]);
    const notesList = await A.notes({ company: id, contacts: contacts.map(c => c.id), deals: deals.map(d => d.id) });
    const hist = await A.history([id, ...brands.map(b => b.id), ...outlets.map(o => o.id), ...notesList.filter(n => n.company_id === id).map(n => n.id)]);
    S.current = { type: "company", row: co, contacts, brands, outlets, deals };
    const groups = [...(co.auto_groups || []).map(g => fx("auto_group", g)), ...(co.group_ids || []).map(itemLabel)].filter(Boolean);
    const summary = section(t("sec_summary"), kv([
      [t("f_status"), `${fx("relationship_status", co.status)} · ${t("status_since", fmtDay(co.status_since))}`],
      [t("f_groups"), groups.join(", ")],
      [t("f_industries"), (co.sector_ids || []).map(itemLabel).filter(Boolean).join(", ")],
      [t("f_tags"), (co.tag_ids || []).map(itemLabel).filter(Boolean).join(", ")],
      [t("f_source"), co.source_id ? itemLabel(co.source_id) : ""],
      [t("f_website"), siteLink(co.website)],
      [t("f_location"), [co.city_or_emirate, co.country_code].filter(Boolean).join(", ")],
      [t("f_main_contact"), fullName({ first_name: co.primary_contact_first_name, last_name: co.primary_contact_last_name })],
      [t("f_last_contact"), co.last_contact_at ? fmtDay(co.last_contact_at) : t("none_yet")]
    ]));
    const locked = !!co.archived_at;
    const coRef = { type: "company", id: co.id, name: co.name, row: co };
    // décideurs : le contact principal en tête, puis par rôle dans la décision
    const rank = c => (c.id === co.primary_contact_id ? 0 : ({ decision_maker: 1, involved: 2, day_to_day: 3 }[c.decision_role] || 4));
    const people = contacts.slice().sort((a, b) => rank(a) - rank(b) || fullName(a).localeCompare(fullName(b)));
    const deciders = section(t("sec_decision_makers"),
      people.length ? h("div", { class: "crm-list inline" }, people.map(c => h("div", { class: "crm-line" },
        h("button", { type: "button", class: "crm-row", onclick: () => openRecord("contact", c.id) },
          h("span", { class: "t" }, h("span", { class: "n", text: fullName(c) }),
            c.id === co.primary_contact_id ? chip(t("main_contact_badge"), "good") : null, c.do_not_contact ? chip(t("dnc"), "warn") : null),
          h("span", { class: "s", text: [c.decision_role ? fx("decision_role", c.decision_role) : "", c.job_title].filter(Boolean).join(" · ") })),
        c.id !== co.primary_contact_id && !locked
          ? h("div", { class: "crm-mini" }, actBtn(t("make_main"), () => doAction(() => A.update("company", co.id, co.version, { primary_contact_id: c.id })), "sm"))
          : null))) : note(t("no_contacts_yet")),
      locked ? null : acts(btn(t("new_contact"), () => contactForm(null, { company: coRef }))));
    // marques et points de vente
    const activeBrands = brands.filter(b => !b.archived_at), activeOutlets = outlets.filter(o => !o.archived_at);
    const outletLine = o => h("div", { class: "crm-subline" },
      h("span", { class: "s" }, h("b", { text: o.name }), [o.district, o.city_or_emirate].filter(Boolean).length ? " · " + [o.district, o.city_or_emirate].filter(Boolean).join(", ") : ""),
      locked ? null : h("span", { class: "crm-mini" }, btn(t("edit"), () => outletForm(co, o, brands), "sm"),
        actBtn(t("archive"), () => doAction(() => A.archive("outlet", o.id, o.version), t("archived_done")), "sm")));
    const blocks = [];
    activeBrands.forEach(b => blocks.push(h("div", { class: "crm-brand" },
      h("div", { class: "crm-subline head" }, h("span", {}, h("b", { text: b.name }), b.sector_id ? h("small", { text: " · " + itemLabel(b.sector_id) }) : null),
        locked ? null : h("span", { class: "crm-mini" }, btn(t("edit"), () => brandForm(co, b), "sm"),
          actBtn(t("archive"), () => doAction(() => A.archive("brand", b.id, b.version), t("archived_done")), "sm"))),
      activeOutlets.filter(o => o.brand_id === b.id).map(outletLine))));
    brands.filter(b => b.archived_at && activeOutlets.some(o => o.brand_id === b.id)).forEach(b => blocks.push(h("div", { class: "crm-brand" },
      h("div", { class: "crm-subline head" }, h("span", {}, h("b", { text: b.name }), " ", chip(t("archived_chip"), "muted"))),
      activeOutlets.filter(o => o.brand_id === b.id).map(outletLine))));
    const loose = activeOutlets.filter(o => !o.brand_id);
    if (loose.length) blocks.push(h("div", { class: "crm-brand" }, h("div", { class: "crm-subline head" }, h("b", { text: t("no_brand") })), loose.map(outletLine)));
    const brandsSec = section(t("sec_brands_outlets"), blocks.length ? blocks : note(t("no_brands_yet")),
      archivedList([...brands.filter(b => b.archived_at).map(b => ["brand", b]), ...outlets.filter(o => o.archived_at).map(o => ["outlet", o])], ([, r]) => r.name),
      locked ? null : acts(btn(t("new_brand"), () => brandForm(co, null)), btn(t("new_outlet"), () => outletForm(co, null, brands))));
    // affaires : ouvertes, puis clôturées
    const open = deals.filter(d => d.stage_outcome === "open"), closed = deals.filter(d => d.stage_outcome !== "open");
    const dealsSec = section(t("sec_deals"),
      open.length || closed.length ? null : note(t("no_deals_yet")),
      open.length ? h("div", { class: "crm-list inline" }, open.map(d => dealRow(d, { hideCompany: true, showStage: true }))) : null,
      closed.length ? sublabel(t("deals_closed")) : null,
      closed.length ? h("div", { class: "crm-list inline" }, closed.map(d => dealRow(d, { hideCompany: true }))) : null,
      locked ? null : acts(btn(t("new_deal"), () => dealForm(null, { company: coRef }))));
    return { title: co.name, nodes: [
      h("div", { class: "chips" }, chip(fx("relationship_status", co.status), statusTone(co.status))), archivedBanner("company", co),
      summary, deciders, brandsSec, dealsSec, notesSection({ company: co }, notesList, { contacts, deals }), historySection(hist, id),
      footer("company", co, () => companyForm(co))] };
  }

  // Fiche contact (E7)
  async function contactView(id) {
    const A = api();
    const ct = await A.contact(id);
    const [mails, tels, notesList, brands] = await Promise.all([A.emails(id), A.phones(id), A.notes({ contact: id }), ct.company_id ? A.brands(ct.company_id) : []]);
    const hist = await A.history([id, ...notesList.map(n => n.id)], id);
    S.current = { type: "contact", row: ct, emails: mails, phones: tels, brands };
    const locked = !!ct.archived_at, dnc = !!ct.do_not_contact;
    const activeMails = mails.filter(m => !m.archived_at), activeTels = tels.filter(p => !p.archived_at);
    const mainMail = activeMails.find(m => m.is_primary) || activeMails[0], firstTel = activeTels[0];
    const quick = h("div", { class: "p-actions" },
      quickLink("phone", t("call"), !dnc && firstTel ? telHref(firstTel.phone) : ""),
      quickLink("mail", t("write"), !dnc && mainMail ? mailHref(mainMail.email) : ""));
    const company = ct.company_id ? h("button", { type: "button", class: "linkbtn", text: ct.company_name || t("rt_company"), onclick: () => openRecord("company", ct.company_id) }) : t("no_company");
    const brand = ct.brand_id ? ((brands.find(b => b.id === ct.brand_id) || {}).name || "") : "";
    const identity = section(t("sec_identity"), kv([
      [t("f_first_name"), ct.first_name || ""], [t("f_last_name"), ct.last_name || ""], [t("f_job_title"), ct.job_title || ""],
      [t("f_company"), company], [t("f_brand"), brand],
      [t("f_decision_role"), ct.decision_role ? fx("decision_role", ct.decision_role) : ""],
      [t("f_main_contact"), ct.company_id ? (ct.is_primary_contact ? t("yes") : t("no")) : ""]]),
      ct.company_id && !ct.is_primary_contact && !locked ? acts(actBtn(t("make_main"), () => doAction(async () => {
        const co = await A.company(ct.company_id);
        return A.update("company", co.id, co.version, { primary_contact_id: ct.id });
      }))) : null);
    const mailLine = m => h("div", { class: "crm-subline" },
      h("span", { class: "s" }, dnc || !mailHref(m.email) ? h("b", { text: m.email }) : h("a", { href: mailHref(m.email), text: m.email }), " ",
        chip(fx("email_state", m.state), m.state === "confirmed" ? "good" : "warn"), m.is_primary ? " " : null, m.is_primary ? chip(t("primary"), "muted") : null),
      locked ? null : h("span", { class: "crm-mini" },
        m.state !== "confirmed" ? actBtn(t("confirm_email"), () => doAction(() => A.update("contact_email", m.id, m.version, { state: "confirmed" })), "sm") : null,
        m.is_primary ? null : actBtn(t("make_primary"), () => doAction(() => A.update("contact_email", m.id, m.version, { is_primary: true })), "sm"),
        actBtn(t("archive"), () => doAction(() => A.archive("contact_email", m.id, m.version), t("archived_done")), "sm")));
    const telLine = p => h("div", { class: "crm-subline" },
      h("span", { class: "s" }, dnc ? h("b", { text: p.phone }) : h("a", { href: telHref(p.phone), text: p.phone }), " · " + fx("phone_type", p.phone_type)),
      locked ? null : h("span", { class: "crm-mini" }, actBtn(t("archive"), () => doAction(() => A.archive("contact_phone", p.id, p.version), t("archived_done")), "sm")));
    const detailsSec = section(t("sec_details"),
      dnc ? note(t("dnc_links_off")) : null,
      sublabel(t("f_emails")), activeMails.length ? activeMails.map(mailLine) : note(t("none_yet")),
      sublabel(t("f_phones")), activeTels.length ? activeTels.map(telLine) : note(t("none_yet")),
      kv([[t("f_language"), ct.preferred_language ? fx("preferred_language", ct.preferred_language) : ""]]),
      archivedList([...mails.filter(m => m.archived_at).map(m => ["contact_email", m]), ...tels.filter(p => p.archived_at).map(p => ["contact_phone", p])],
        ([type, r]) => (type === "contact_email" ? r.email : r.phone)),
      locked ? null : acts(btn(t("add_email"), () => emailForm(ct)), btn(t("add_phone"), () => phoneForm(ct))));
    const groups = [...(ct.auto_groups || []).map(g => fx("auto_group", g)), ...(ct.group_ids || []).map(itemLabel)].filter(Boolean);
    const classSec = section(t("sec_classification"), kv([
      [t("f_type"), fx("contact_nature", ct.nature)], [t("f_source"), itemLabel(ct.source_id)],
      [t("f_groups"), groups.join(", ")], [t("f_tags"), (ct.tag_ids || []).map(itemLabel).filter(Boolean).join(", ")]]));
    const nextSec = section(t("sec_next_step"), kv([[t("f_next_step"), ct.next_step || ""], [t("f_follow_up"), fmtDay(ct.follow_up_on)]]) || note(t("no_next_step")));
    const dataSec = section(t("sec_data"), kv([
      [t("review_date"), fmtDay(ct.review_due_on) + (ct.review_due && !locked ? " · " + t("to_review") : "")],
      [t("last_review_l"), ct.last_reviewed_at ? [fmtDay(ct.last_reviewed_at), actor(ct.last_reviewed_by)].filter(Boolean).join(" · ") : ""],
      [t("dnc"), dnc ? t("dnc_since", fmtDay(ct.dnc_since), actor(ct.dnc_by)) : t("no")],
      [t("f_reason"), dnc ? ct.dnc_reason || "" : ""]]),
      locked ? null : acts(btn(t("review_now"), () => reviewDialog(ct)), dnc ? btn(t("dnc_off"), () => dncOffDialog(ct)) : btn(t("dnc_on"), () => dncOnDialog(ct))));
    return { title: fullName(ct), nodes: [
      h("div", { class: "chips" }, chip(fx("contact_nature", ct.nature), "muted"), ct.is_primary_contact ? chip(t("main_contact_badge"), "good") : null,
        ct.decision_role === "decision_maker" ? chip(fx("decision_role", ct.decision_role), "") : null, dnc ? chip(t("dnc"), "warn") : null,
        ct.review_due && !locked ? chip(t("to_review"), "warn") : null),
      archivedBanner("contact", ct), quick, identity, detailsSec, classSec, nextSec, notesSection({ contact: ct }, notesList), dataSec,
      historySection(hist, id), footer("contact", ct, () => contactForm(ct))] };
  }

  // Fiche affaire (E3)
  async function dealView(id) {
    const A = api();
    const d = await A.deal(id);
    const co = d.company_id;
    const [notesList, brands, outlets, contacts] = await Promise.all([A.notes({ deal: id }), co ? A.brands(co) : [], co ? A.outlets(co) : [], co ? A.contacts({ company: co }) : []]);
    const missing = [d.referred_by_contact_id, d.primary_contact_id].filter(x => x && !contacts.some(c => c.id === x));
    const [refCos, moreContacts, hist] = await Promise.all([d.referred_by_company_id ? A.names("company", [d.referred_by_company_id]) : [],
      missing.length ? A.names("contact", missing) : [], A.history([id, ...notesList.map(n => n.id)])]);
    const people = [...contacts, ...moreContacts];
    const personOf = cid => people.find(c => c.id === cid);
    const referred = d.referred_by_company_id ? { type: "company", id: d.referred_by_company_id, name: (refCos[0] || {}).name || "" }
                   : d.referred_by_contact_id ? { type: "contact", id: d.referred_by_contact_id, name: fullName(personOf(d.referred_by_contact_id)) } : null;
    S.current = { type: "deal", row: d, brands, outlets, contacts, referred };
    const locked = !!d.archived_at, closed = d.stage_outcome !== "open";
    const link = (type, rid, text) => (rid && text ? h("button", { type: "button", class: "linkbtn", text, onclick: () => openRecord(type, rid) }) : "");
    const mainContact = d.primary_contact_id ? personOf(d.primary_contact_id) : null;
    const head = section(t("f_stage"), h("div", { class: "crm-stagehead" }, chip(itemLabel(d.stage_id), d.stage_outcome === "won" ? "good" : d.stage_outcome === "lost" ? "muted" : ""),
      locked ? null : btn(t("change_stage"), () => stageDialog(d), "primary")),
      kv([[t("f_company"), link("company", d.company_id, d.company_name)],
        closed ? [t("f_reason"), d.close_reason_id ? itemLabel(d.close_reason_id) : ""] : [t("f_days"), String(Number(d.days_in_stage) || 0)],
        closed ? [t("f_closed_on"), fmtDay(d.closed_on)] : null]));
    const details = section(t("sec_deal"), kv([
      [t("f_value"), d.value_aed != null ? fmtAed(d.value_aed) : ""],
      [t("f_services"), (d.service_ids || []).map(itemLabel).filter(Boolean).join(", ")],
      [t("f_renewal"), d.is_renewal ? t("yes") : t("no")],
      [t("f_deal_contact"), mainContact ? link("contact", mainContact.id, fullName(mainContact)) : ""],
      [t("f_brand"), d.brand_id ? ((brands.find(b => b.id === d.brand_id) || {}).name || "") : ""],
      [t("f_outlet"), d.outlet_id ? ((outlets.find(o => o.id === d.outlet_id) || {}).name || "") : ""],
      [t("f_source"), d.source_id ? itemLabel(d.source_id) : ""],
      [t("f_referred_by"), referred ? link(referred.type, referred.id, referred.name) : ""],
      [t("f_expected_decision"), fmtDay(d.expected_decision_on)],
      [t("f_last_contact"), d.last_contact_at ? fmtDay(d.last_contact_at) : t("none_yet")]]));
    const next = section(t("sec_next_step"), kv([[t("f_next_step"), d.next_step || ""], [t("f_follow_up"), fmtDay(d.follow_up_on)]]) || note(t("no_next_step")));
    return { title: d.name || t("unnamed_deal"), nodes: [archivedBanner("deal", d), head, details, next, notesSection({ deal: d }, notesList),
      historySection(hist, id), footer("deal", d, () => dealForm(d, { referred }))] };
  }
  const VIEWS = { company: companyView, contact: contactView, deal: dealView };

  // ------------------------------------------------------------------ formulaires des fiches
  function companyForm(row) {
    const edit = !!row;
    const name = fText("name", t("f_name"), edit ? row.name : "", { required: true, max: 200 });
    const status = fSelect("status", t("f_status"), fxOptions("relationship_status"), edit ? row.status : "prospect", { required: true });
    const fields = [name, status];
    if (edit) fields.push(
      fSelect("source_id", t("f_source"), itemOptions("source", row.source_id), row.source_id, { empty: t("none") }),
      fMulti("group_ids", t("f_groups"), itemOptions("group", row.group_ids), row.group_ids),
      fMulti("sector_ids", t("f_industries"), itemOptions("sector", row.sector_ids), row.sector_ids),
      fMulti("tag_ids", t("f_tags"), itemOptions("tag", row.tag_ids), row.tag_ids),
      fText("website", t("f_website"), row.website, { max: 2048, type: "url", inputmode: "url", check: v => (!v || !/\s/.test(v) ? "" : "err_website") }),
      fText("city_or_emirate", t("f_city"), row.city_or_emirate, { max: 100 }),
      fText("country_code", t("f_country"), row.country_code || "AE", { max: 2, check: v => (!v || /^[A-Za-z]{2}$/.test(v) ? "" : "err_country") }));
    let anyway = false;
    name.input.addEventListener("input", () => { anyway = false; });
    formDialog({
      title: edit ? t("edit_company") : t("new_company"), fields,
      submit: async (v, ui) => {
        if (!edit && !anyway) {
          const same = await api().sameNameCompanies(v.name);
          if (same.length) {
            ui.extra.append(warnBox(t("dup_company"), same.map(s => openLink([s.name, fx("relationship_status", s.status), s.city_or_emirate,
              s.archived_at ? t("archived_chip") : ""].filter(Boolean).join(" · "), "company", s.id)), () => { anyway = true; resubmit(ui); }));
            return false;
          }
        }
        if (!edit) return api().insert("company", { name: v.name, status: v.status });
        if (v.country_code) v.country_code = v.country_code.toUpperCase();
        return saveChanges("company", row, v, ["name", "status", "source_id", "group_ids", "sector_ids", "tag_ids", "website", "city_or_emirate", "country_code"]);
      },
      done: async res => { if (!edit && res && res.id) await openRecord("company", res.id); else await refreshAfterWrite(); if (!edit) renderPanels(); }
    });
  }

  // Chargement dont dépend « Enregistrer » (marque, point de vente, contact : défauts C5 et C6) : au-delà de WAIT.choicesMs
  // sans réponse, il compte comme un échec (avis affiché, champs gardés tels quels) ; une réponse tardive est ignorée.
  function timeLimit(promise, ms) {
    let timer = null;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject({ kind: "timeout" }), ms); });
    return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
  }
  // Avis d'une liste de choix non chargée, avec « Réessayer » (défauts C5 et C6).
  const choicesNote = (key, again) => h("div", { class: "crm-warn", role: "status" }, h("span", { text: t(key) }),
    h("div", { class: "crm-acts" }, btn(t("retry"), again)));
  const marked = (label, mark) => label + (mark ? " · " + mark : "");

  function contactForm(row, pre) {
    const edit = !!row, p = pre || {};
    const company0 = edit ? (row.company_id ? { type: "company", id: row.company_id, name: row.company_name || "", row: { status: row.company_status } } : null) : (p.company || null);
    const first = fText("first_name", t("f_first_name"), edit ? row.first_name : "", { max: 100, noOpt: true });
    const last = fText("last_name", t("f_last_name"), edit ? row.last_name : "", { max: 100, noOpt: true });
    first.check = () => (!first.get() && !last.get() ? "err_name" : "");
    const job = fText("job_title", t("f_job_title"), edit ? row.job_title : "", { max: 150 });
    const nature = fSelect("nature", t("f_type"), fxOptions("contact_nature"), edit ? row.nature : (natureFor(company0 && company0.row && company0.row.status) || "prospect"), { required: true });
    let natureTouched = edit;
    nature.input.addEventListener("change", () => { natureTouched = true; });
    const brand = fSelect("brand_id", t("f_brand"), [], "", { empty: t("none") });
    const main = fCheck("main", t("f_main_contact_check"), edit ? !!row.is_primary_contact : false);
    const mainHint = h("small", { class: "crm-hint", hidden: true });
    main.node = h("div", { class: "crm-field" }, main.node, mainHint);
    // Marques de l'entreprise choisie : « Enregistrer » attend leur chargement (dix secondes au plus) ; en cas d'échec ou
    // passé ce délai, la marque n'est pas envoyée (elle reste telle quelle) si l'entreprise n'a pas changé (défaut C6).
    let ui = null, brandsOk = true, brandSeq = 0;
    async function loadBrands(c) {
      const my = ++brandSeq, same = edit && !!c && c.id === row.company_id;
      brandsOk = !c;
      put(brand.input, h("option", { value: "", text: c ? t("st_loading") : t("none") }));
      brand.input.disabled = !!c;
      if (ui) { ui.note(); ui.hold("brands", !!c); }
      if (!c) return;
      try {
        const list = await timeLimit(api().brands(c.id), WAIT.choicesMs);
        if (my !== brandSeq) return;
        put(brand.input, h("option", { value: "", text: t("none") }),
          list.filter(b => !b.archived_at || (same && b.id === row.brand_id)).map(b => h("option", { value: b.id, text: marked(b.name, b.archived_at ? t("archived_chip") : "") })));
        if (same && row.brand_id) brand.input.value = row.brand_id;
        brandsOk = true;
      } catch (e) {
        if (my !== brandSeq) return;
        put(brand.input, h("option", { value: "", text: t("not_loaded") }));
        if (ui) ui.note(choicesNote(same ? "brands_kept" : "brands_failed", () => loadBrands(company.get())));
      } finally {
        if (my === brandSeq) { brand.input.disabled = !brandsOk; if (ui) ui.hold("brands", false); }
      }
    }
    function setCompany(c, initial) {
      brand.node.hidden = !c; main.node.hidden = !c;
      if (c && !natureTouched && c.row && natureFor(c.row.status)) nature.input.value = natureFor(c.row.status);
      // « Contact principal » vaut pour l'entreprise choisie : revenir à l'entreprise d'origine rend son état d'origine ; toute
      // autre entreprise décoche la case, qui ne se coche que si Renata la coche pour celle-ci. Le contact principal actuel
      // de cette entreprise est affiché, s'il existe (défaut C14).
      if (!initial) main.input.checked = !!(edit && c && c.id === row.company_id && row.is_primary_contact);
      const r = (c && c.row) || {};
      const current = fullName({ first_name: r.primary_contact_first_name, last_name: r.primary_contact_last_name });
      mainHint.textContent = current && !(edit && r.primary_contact_id === row.id) ? t("main_now", current) : "";
      mainHint.hidden = !mainHint.textContent;
      return loadBrands(c);
    }
    const company = fPicker("company", t("f_company"), company0, { kinds: ["company"], onChange: c => setCompany(c, false) });
    const role = fSelect("decision_role", t("f_decision_role"), fxOptions("decision_role"), edit ? row.decision_role : "", { empty: t("none") });
    const source = fSelect("source_id", t("f_source"), itemOptions("source", edit ? row.source_id : null), edit ? row.source_id : "", { required: true, empty: t("choose") });
    const language = fSelect("preferred_language", t("f_language"), fxOptions("preferred_language"), edit ? row.preferred_language : "", { empty: t("none") });
    const fields = [first, last, job, company, brand, role, main, nature, source];
    let email = null, phone = null;
    if (!edit) {
      email = fText("email", t("f_email"), "", { type: "email", inputmode: "email", max: 254, check: v => (!v || api().valid.email(v) ? "" : "err_email") });
      phone = fText("phone", t("f_phone"), "", { type: "tel", inputmode: "tel", max: 32, check: v => (!v || api().valid.phone(v) ? "" : "err_phone") });
      fields.push(email, fSelect("email_state", t("f_email_state"), fxOptions("email_state"), "not_confirmed", { noOpt: true }),
        phone, fSelect("phone_type", t("f_phone_type"), fxOptions("phone_type"), "mobile", { noOpt: true }));
    }
    fields.push(language);
    if (edit) fields.push(
      fMulti("group_ids", t("f_groups"), itemOptions("group", row.group_ids), row.group_ids),
      fMulti("tag_ids", t("f_tags"), itemOptions("tag", row.tag_ids), row.tag_ids),
      fText("next_step", t("f_next_step"), row.next_step, { max: 500 }),
      fDate("follow_up_on", t("f_follow_up"), row.follow_up_on));
    let anyway = false;
    [first.input, last.input, email && email.input].filter(Boolean).forEach(i => i.addEventListener("input", () => { anyway = false; }));
    ui = formDialog({
      title: edit ? t("edit_contact") : t("new_contact"), fields,
      submit: async (v, form) => {
        const A = api(), c = v.company;
        if (!anyway) {
          const warn = [];
          if (!edit && v.email) (await A.emailOwners(v.email)).forEach(r => warn.push([t("dup_email"), r]));
          const nameChanged = !edit || fold(v.first_name) !== fold(row.first_name) || fold(v.last_name) !== fold(row.last_name) || (c && c.id) !== row.company_id;
          if (c && nameChanged) (await A.sameNameContacts(v.first_name, v.last_name, c.id, edit ? row.id : null)).forEach(r => warn.push([t("dup_name"), r]));
          if (warn.length) {
            [...new Set(warn.map(w => w[0]))].forEach(title => form.extra.append(warnBox(title,
              warn.filter(w => w[0] === title).map(([, r]) => openLink([fullName(r), r.company_name, r.archived_at ? t("archived_chip") : ""].filter(Boolean).join(" · "), "contact", r.id)),
              () => { anyway = true; resubmit(form); }, edit ? t("save_anyway") : t("create_anyway"))));
            return false;
          }
        }
        const values = { first_name: v.first_name || null, last_name: v.last_name || null, job_title: v.job_title || null, company_id: c ? c.id : null,
          brand_id: c ? v.brand_id : null, decision_role: v.decision_role, nature: v.nature, source_id: v.source_id, preferred_language: v.preferred_language };
        if (c && !brandsOk) { if (edit && c.id === row.company_id) delete values.brand_id; else values.brand_id = null; }
        // Nouveau contact : un seul appel, tout ou rien ; en cas d'échec, rien n'est créé, la fenêtre reste ouverte avec la
        // saisie (critère TR10, contrat 1).
        if (!edit) {
          return { row: await A.createContact(Object.assign(values, { email: v.email || null, email_state: v.email_state, phone: v.phone || null,
            phone_type: v.phone_type, make_main: !!(c && v.main) })), problems: [] };
        }
        Object.assign(values, { group_ids: v.group_ids, tag_ids: v.tag_ids, next_step: v.next_step || null, follow_up_on: v.follow_up_on });
        const saved = await saveChanges("contact", row, values, Object.keys(values));
        const problems = [];
        const wasMain = !!row.is_primary_contact && c && row.company_id === c.id;
        if (c && !!v.main !== wasMain) {
          try {
            const coRow = await A.company(c.id);
            if (v.main) await A.update("company", coRow.id, coRow.version, { primary_contact_id: saved.id });
            else if (coRow.primary_contact_id === saved.id) await A.update("company", coRow.id, coRow.version, { primary_contact_id: null });
          } catch (e) { problems.push(e); }
        }
        return { row: saved, problems };
      },
      done: async res => {
        if (res.problems.length) toast(t("partial_contact"), true);
        if (!edit) { renderPanels(); await openRecord("contact", res.row.id); } else await refreshAfterWrite();
      }
    });
    setCompany(company0, true);
  }

  function dealForm(row, pre) {
    const edit = !!row, p = pre || {};
    const company0 = edit ? (row.company_id ? { type: "company", id: row.company_id, name: row.company_name || "" } : null) : (p.company || null);
    const name = fText("name", t("f_deal_name"), edit ? row.name : "", { required: true, max: 200 });
    const brand = fSelect("brand_id", t("f_brand"), [], "", { empty: t("none"), more: true });
    const outlet = fSelect("outlet_id", t("f_outlet"), [], "", { empty: t("none"), more: true });
    const contact = fSelect("primary_contact_id", t("f_deal_contact"), [], "", { empty: t("none"), more: true });
    const choices = [brand, outlet, contact];
    // Marques, points de vente et contacts de l'entreprise : « Enregistrer » attend leur chargement (dix secondes au plus) ;
    // en cas d'échec ou passé ce délai, les trois champs ne sont pas envoyés (ils restent tels quels) si l'entreprise n'a pas
    // changé (défaut C5). Le contact principal actuel de l'affaire reste dans les choix même s'il est archivé ou rattaché
    // ailleurs (défaut C7).
    let ui = null, refsOk = true, refsSeq = 0;
    async function setCompany(c) {
      const my = ++refsSeq, same = edit && !!c && c.id === row.company_id;
      refsOk = !c;
      choices.forEach(f => { put(f.input, h("option", { value: "", text: c ? t("st_loading") : t("none") })); f.input.disabled = !!c; });
      if (ui) { ui.note(); ui.hold("choices", !!c); }
      if (!c) return;
      try {
        const [bs, os, cs, kept] = await timeLimit((async () => {
          const [bs, os, cs] = await Promise.all([api().brands(c.id), api().outlets(c.id), api().contacts({ company: c.id })]);
          let kept = null;
          if (same && row.primary_contact_id && !cs.some(x => x.id === row.primary_contact_id)) {
            const found = (await api().names("contact", [row.primary_contact_id]))[0];
            const mark = !found ? "" : found.archived_at ? t("archived_chip") : found.company_id !== c.id ? t("other_company") : "";
            kept = h("option", { value: row.primary_contact_id, text: marked((found && fullName(found)) || t("rt_contact"), mark) });
          }
          return [bs, os, cs, kept];
        })(), WAIT.choicesMs);
        if (my !== refsSeq) return;
        put(brand.input, h("option", { value: "", text: t("none") }), bs.filter(b => !b.archived_at || (same && b.id === row.brand_id))
          .map(b => h("option", { value: b.id, text: marked(b.name, b.archived_at ? t("archived_chip") : "") })));
        put(outlet.input, h("option", { value: "", text: t("none") }), os.filter(o => !o.archived_at || (same && o.id === row.outlet_id))
          .map(o => h("option", { value: o.id, text: marked(o.name, o.archived_at ? t("archived_chip") : "") })));
        put(contact.input, h("option", { value: "", text: t("none") }), cs.map(x => h("option", { value: x.id, text: fullName(x) })), kept);
        if (same) { brand.input.value = row.brand_id || ""; outlet.input.value = row.outlet_id || ""; contact.input.value = row.primary_contact_id || ""; }
        else if (p.contact && cs.some(x => x.id === p.contact)) contact.input.value = p.contact;
        refsOk = true;
      } catch (e) {
        if (my !== refsSeq) return;
        choices.forEach(f => put(f.input, h("option", { value: "", text: t("not_loaded") })));
        if (ui) ui.note(choicesNote(same ? "choices_kept" : "choices_failed", () => setCompany(company.get())));
      } finally {
        if (my === refsSeq) { choices.forEach(f => { f.input.disabled = !refsOk; }); if (ui) ui.hold("choices", false); }
      }
    }
    const company = fPicker("company", t("f_company"), company0, { kinds: ["company"], required: true, onChange: setCompany });
    const openStages = items("stage").filter(s => s.stage_outcome === "open");
    const fields = [name, company];
    if (!edit) fields.push(fSelect("stage_id", t("f_stage"), openStages.map(s => [s.id, itemLabel(s.id)]), openStages.length ? openStages[0].id : "", { required: true }));
    fields.push(
      fAed("value_aed", t("f_value"), edit ? row.value_aed : null),
      fMulti("service_ids", t("f_services"), itemOptions("service", edit ? row.service_ids : null), edit ? row.service_ids : []),
      fDate("expected_decision_on", t("f_expected_decision"), edit ? row.expected_decision_on : ""),
      fText("next_step", t("f_next_step"), edit ? row.next_step : "", { max: 500 }),
      fDate("follow_up_on", t("f_follow_up"), edit ? row.follow_up_on : ""),
      brand, outlet, contact,
      fCheck("is_renewal", t("f_renewal"), edit ? row.is_renewal : false, { more: true }),
      fSelect("source_id", t("f_source"), itemOptions("source", edit ? row.source_id : null), edit ? row.source_id : "", { empty: t("none"), more: true }),
      fPicker("referred", t("f_referred_by"), p.referred || null, { kinds: ["company", "contact"], more: true }));
    ui = formDialog({
      title: edit ? t("edit_deal") : t("new_deal"), fields,
      openMore: edit && !!(row.brand_id || row.outlet_id || row.primary_contact_id || row.is_renewal || row.source_id || p.referred),
      submit: async v => {
        const values = { name: v.name, company_id: v.company ? v.company.id : null, value_aed: v.value_aed, service_ids: v.service_ids,
          expected_decision_on: v.expected_decision_on, next_step: v.next_step || null, follow_up_on: v.follow_up_on, brand_id: v.brand_id,
          outlet_id: v.outlet_id, primary_contact_id: v.primary_contact_id, is_renewal: !!v.is_renewal, source_id: v.source_id,
          referred_by_company_id: v.referred && v.referred.type === "company" ? v.referred.id : null,
          referred_by_contact_id: v.referred && v.referred.type === "contact" ? v.referred.id : null };
        if (!refsOk) {
          if (edit && v.company && v.company.id === row.company_id) ["brand_id", "outlet_id", "primary_contact_id"].forEach(k => { delete values[k]; });
          else Object.assign(values, { brand_id: null, outlet_id: null, primary_contact_id: null });
        }
        if (!edit) return api().insert("deal", Object.assign(values, { stage_id: v.stage_id }));
        return saveChanges("deal", row, values, Object.keys(values));
      },
      done: async res => { if (!edit && res && res.id) { renderPanels(); await openRecord("deal", res.id); } else await refreshAfterWrite(); }
    });
    setCompany(company0);
  }

  function noteForm(n, ctx) {
    const edit = !!n, c = ctx || {};
    const kind = fSelect("kind", t("f_activity_type"), fxOptions("exchange_type"), edit ? n.kind : "call", { required: true });
    const when = fDateTime("occurred_at", t("f_when"), edit ? n.occurred_at : null);
    const body = fArea("body", t("f_text"), edit ? n.body : "", { max: 20000, hint: t("note_hint") });
    body.check = () => (kind.get() === "note" && !body.get() ? "err_note_text" : "");
    const fields = [];
    let intro = null;
    if (!edit) {
      const target = c.company || c.contact || c.deal;
      if (target) intro = note(t("about_x", c.company ? c.company.name : c.contact ? fullName(c.contact) : (c.deal.name || t("unnamed_deal"))));
      else fields.push(fPicker("about", t("f_about"), null, { kinds: ["company", "contact"], required: true }));
      if (c.contact && c.contact.company_id) {
        const dealSel = fSelect("deal_id", t("f_about_deal"), [], "", { empty: t("none") });
        api().deals({ company: c.contact.company_id, outcome: "open" }).then(ds => ds.forEach(d => dealSel.input.append(h("option", { value: d.id, text: d.name || t("unnamed_deal") })))).catch(() => {});
        fields.push(dealSel);
      }
      if (c.deal && c.deal.company_id) {
        const withSel = fSelect("contact_id", t("f_with_contact"), [], "", { empty: t("none") });
        api().contacts({ company: c.deal.company_id }).then(cs => cs.forEach(x => withSel.input.append(h("option", { value: x.id, text: fullName(x) })))).catch(() => {});
        fields.push(withSel);
      }
    }
    fields.push(kind, when, body);
    formDialog({
      title: edit ? t("edit_note") : t("log_activity"), intro, fields,
      submit: async v => {
        const values = { kind: v.kind, occurred_at: v.occurred_at, body: v.body || null };
        if (edit) return saveChanges("note", n, values, ["kind", "occurred_at", "body"]);
        if (c.company) values.company_id = c.company.id;
        if (c.contact) values.contact_id = c.contact.id;
        if (c.deal) values.deal_id = c.deal.id;
        if (v.about) values[v.about.type === "company" ? "company_id" : "contact_id"] = v.about.id;
        if (v.deal_id) values.deal_id = v.deal_id;
        if (v.contact_id) values.contact_id = v.contact_id;
        return api().insert("note", values);
      },
      done: refreshAfterWrite
    });
  }

  function brandForm(co, b) {
    const name = fText("name", t("f_name"), b ? b.name : "", { required: true, max: 200 });
    const sector = fSelect("sector_id", t("f_industry"), itemOptions("sector", b ? b.sector_id : null), b ? b.sector_id : "", { empty: t("none") });
    formDialog({ title: b ? t("edit_brand") : t("new_brand"), fields: [name, sector],
      submit: v => (b ? saveChanges("brand", b, v, ["name", "sector_id"]) : api().insert("brand", { company_id: co.id, name: v.name, sector_id: v.sector_id })),
      done: refreshAfterWrite });
  }
  function outletForm(co, o, brands) {
    const fields = [
      fText("name", t("f_name"), o ? o.name : "", { required: true, max: 200 }),
      fSelect("brand_id", t("f_brand"), brands.filter(b => !b.archived_at || (o && b.id === o.brand_id)).map(b => [b.id, b.name]), o ? o.brand_id : "", { empty: t("no_brand") }),
      fText("city_or_emirate", t("f_city"), o ? o.city_or_emirate : "", { max: 100 }),
      fText("district", t("f_district"), o ? o.district : "", { max: 100 }),
      fText("country_code", t("f_country"), o ? o.country_code : "AE", { max: 2, check: v => (!v || /^[A-Za-z]{2}$/.test(v) ? "" : "err_country") })];
    formDialog({ title: o ? t("edit_outlet") : t("new_outlet"), fields,
      submit: v => {
        const values = { name: v.name, brand_id: v.brand_id, city_or_emirate: v.city_or_emirate || null, district: v.district || null, country_code: (v.country_code || "AE").toUpperCase() };
        return o ? saveChanges("outlet", o, values, Object.keys(values)) : api().insert("outlet", Object.assign({ company_id: co.id }, values));
      },
      done: refreshAfterWrite });
  }
  function emailForm(ct) {
    const email = fText("email", t("f_email"), "", { type: "email", inputmode: "email", required: true, max: 254, check: v => (api().valid.email(v) ? "" : "err_email") });
    const state = fSelect("state", t("f_email_state"), fxOptions("email_state"), "not_confirmed", { noOpt: true });
    const hasMain = ((S.current && S.current.emails) || []).some(m => !m.archived_at);
    const primary = fCheck("is_primary", t("f_primary_email"), !hasMain);
    let anyway = false;
    email.input.addEventListener("input", () => { anyway = false; });
    formDialog({ title: t("add_email"), fields: [email, state, primary], submitLabel: t("add"),
      submit: async (v, ui) => {
        if (!anyway) {
          const owners = await api().emailOwners(v.email, ct.id);
          if (owners.length) {
            ui.extra.append(warnBox(t("dup_email"), owners.map(r => openLink([fullName(r), r.company_name].filter(Boolean).join(" · "), "contact", r.id)),
              () => { anyway = true; resubmit(ui); }, t("save_anyway")));
            return false;
          }
        }
        return api().insert("contact_email", { contact_id: ct.id, email: api().valid.email(v.email), state: v.state, is_primary: v.is_primary });
      },
      done: refreshAfterWrite });
  }
  function phoneForm(ct) {
    const phone = fText("phone", t("f_phone"), "", { type: "tel", inputmode: "tel", required: true, max: 32, check: v => (api().valid.phone(v) ? "" : "err_phone") });
    const type = fSelect("phone_type", t("f_phone_type"), fxOptions("phone_type"), "mobile", { noOpt: true });
    formDialog({ title: t("add_phone"), fields: [phone, type], submitLabel: t("add"),
      submit: v => api().insert("contact_phone", { contact_id: ct.id, phone: api().valid.phone(v.phone), phone_type: v.phone_type }),
      done: refreshAfterWrite });
  }
  function dncOnDialog(ct) {
    formDialog({ title: t("dnc_on"), intro: note(t("dnc_on_lead")), submitLabel: t("dnc_on"),
      fields: [fText("reason", t("f_dnc_reason"), t("dnc_default_reason"), { required: true, max: 500 })],
      submit: v => api().setDoNotContact(ct.id, ct.version, v.reason), done: refreshAfterWrite });
  }
  function dncOffDialog(ct) {
    formDialog({ title: t("dnc_off"), intro: note(t("dnc_off_lead")), submitLabel: t("dnc_off"), fields: [],
      submit: () => api().removeDoNotContact(ct.id, ct.version), done: refreshAfterWrite });
  }
  function reviewDialog(ct) {
    const msg = h("p", { class: "crm-msg", role: "status" });
    const go = keep => () => busyRun(tok, async () => {
      try {
        const r = await api().reviewContact(ct.id, ct.version, keep);
        closeDialog(true, tok);
        toast(keep ? t("review_kept", fmtDay(r && r.review_due_on)) : t("archived_done"));
        await refreshAfterWrite();
      } catch (e) { await failIn(msg, e, tok); }
    });
    const tok = openDialog(t("review_now"), note(t("review_lead")), kv([[t("review_date"), fmtDay(ct.review_due_on)]]),
      h("div", { class: "crm-actions" }, actBtn(t("keep"), go(true), "primary"), actBtn(t("archive"), go(false))), msg);
  }
  // Changer d'étape (PI3) : deux touches pour une étape ouverte ; Gagné ou Perdu demandent un motif (PI4, PI5).
  // Une seule écriture à la fois : dès la première touche, tous les choix sont inactifs et la fenêtre occupée, jusqu'à la
  // réponse (défaut C12).
  function stageDialog(d) {
    const msg = h("p", { class: "crm-msg", role: "status", "aria-live": "polite" });
    const box = h("div", { class: "crm-stage-pick" });
    let tok = 0;
    const lock = on => box.querySelectorAll("button").forEach(b => { b.disabled = on || b.dataset.current === "true"; });
    function save(changes, won) {
      return busyRun(tok, async () => {
        lock(true);
        try {
          await api().update("deal", d.id, d.version, changes);
          closeDialog(true, tok); toast(t("saved"));
          await refreshAfterWrite();
          if (won) await askMakeClient(d);
        } catch (e) { await failIn(msg, e, tok); }
        finally { if (tok === dialogSeq) lock(false); }
      });
    }
    function finalStage(s) {
      const won = s.stage_outcome === "won";
      const reason = fSelect("close_reason_id", won ? t("won_reason") : t("lost_reason"), itemOptions(won ? "win_reason" : "loss_reason"), "",
        { required: true, empty: t("choose"), requiredKey: "err_reason" });
      put(box, h("div", { class: "chips" }, chip(itemLabel(s.id), won ? "good" : "muted")), reason.node,
        h("div", { class: "crm-actions" }, btn(t("back"), () => { put(box, ...choices()); msg.textContent = ""; }),
          actBtn(t("save"), async () => {
            const bad = reason.check();
            if (bad) { msg.className = "crm-msg err"; msg.textContent = t(bad); return; }
            await save({ stage_id: s.id, close_reason_id: reason.get() }, won);
          }, "primary")));
    }
    const choices = () => items("stage").map(s => h("button", { type: "button", class: "crm-stage-opt", disabled: s.id === d.stage_id, "aria-current": s.id === d.stage_id ? "true" : null,
      "data-current": s.id === d.stage_id ? "true" : null,
      onclick: async () => {
        if (dialogBusy) return;
        if (s.stage_outcome !== "open") { finalStage(s); return; }
        await save({ stage_id: s.id }, false);
      } },
      h("span", { class: "n", text: itemLabel(s.id) }), s.stage_outcome !== "open" ? h("small", { text: t("reason_asked") }) : null));
    put(box, ...choices());
    tok = openDialog(t("change_stage"), box, msg);
  }
  async function askMakeClient(d) {
    if (!d.company_id) return;
    let co;
    try { co = await api().company(d.company_id); } catch (e) { return; }
    if (co.status === "current_client" || co.archived_at) return;
    const msg = h("p", { class: "crm-msg", role: "status" });
    const tok = openDialog(t("make_client_title"), h("p", { text: t("make_client_q", co.name) }),
      h("div", { class: "crm-actions" }, btn(t("make_client_no"), () => closeDialog()), actBtn(t("make_client_yes"), () => busyRun(tok, async () => {
        try { await api().update("company", co.id, co.version, { status: "current_client" }); closeDialog(true, tok); toast(t("saved")); await refreshAfterWrite(); }
        catch (e) { await failIn(msg, e, tok); }
      }), "primary")), msg);
  }
  // Suppression définitive (David seul) : aperçu complet, notes détachées montrées, motif, confirmation (TR7).
  async function deleteDialog(type, row) {
    const msg = h("p", { class: "crm-msg", role: "status" });
    const box = h("div", { class: "crm-del" }, loading());
    const reason = fSelect("reason", t("del_reason"), fxOptions("deletion_reason"), "", { required: true, empty: t("choose"), requiredKey: "err_reason" });
    let tok = 0;
    const confirm = actBtn(t("delete_perm"), () => busyRun(tok, async () => {
      const bad = reason.check();
      if (bad) { msg.className = "crm-msg err"; msg.textContent = t(bad); return; }
      try {
        await api().deleteRecord(type, row.id, reason.get());
        closeDialog(true, tok); toast(t("del_done"));
        S.stack.pop(); S.current = null;
        if (S.stack.length) await renderSheet(); else closeSheet();
        renderPanels();
      } catch (e) { msg.className = "crm-msg err"; msg.textContent = e && e.detail === "blocks" ? t("err_blocks") : errorText(e); }
    }), "danger");
    confirm.disabled = true;
    tok = openDialog(t("delete_perm"), note(t("del_lead")), box, reason.node, h("div", { class: "crm-actions" }, btn(t("cancel"), () => closeDialog()), confirm), msg);
    try {
      const prev = await api().deletionPreview(type, row.id);
      const count = effect => {
        const m = {};
        prev.filter(p => p.effect === effect).forEach(p => { m[p.item_type] = (m[p.item_type] || 0) + 1; });
        return Object.entries(m).map(([k, n]) => t("rt_" + k) + colon() + n).join(", ");
      };
      const blocks = prev.some(p => p.effect === "blocks");
      put(box, kv([[t("del_will_delete"), count("delete")], [t("del_will_unlink"), count("unlink")]]) || loading(),
        blocks ? h("div", { class: "crm-warn", role: "alert" }, h("span", { text: t("del_blocks") })) : null);
      const detached = prev.filter(p => p.effect === "unlink" && p.item_type === "note").map(p => p.item_id);
      if (detached.length) {
        const ns = await api().notesByIds(detached);
        box.append(note(t("del_notes")), ...ns.map(n => h("blockquote", { class: "crm-quote", text: [fx("exchange_type", n.kind), fmtDay(n.occurred_at), n.body || ""].filter(Boolean).join(" · ") })));
      }
      confirm.disabled = blocks;
    } catch (e) { put(box, h("p", { class: "crm-msg err", text: errorText(e) })); }
  }

  // ------------------------------------------------------------------ Paramètres : listes (E8, PA1 à PA5) et durées de revue (PA6)
  // Relit les listes et les durées de revue, puis redessine. Rend faux si la relecture échoue ; keepOnFail laisse alors
  // l'écran tel quel (une saisie en cours n'est pas effacée).
  async function reloadLists(keepOnFail) {
    let ok = true;
    try { await loadRefs(); } catch (e) { ok = false; }
    if (ok || keepOnFail !== true) {
      renderSettings();
      S.built = {};
      PANELS.forEach(p => renderPanel(p));
    }
    return ok;
  }
  // Geste de Paramètres : après une réussite comme après tout refus (conflit ou autre) ou un déplacement fait à moitié, les
  // listes et les durées sont relues avant le message ; « rechargée » ne s'écrit qu'après une relecture réussie (défaut C8).
  // Un déplacement fait à moitié n'est jamais dit « non enregistré » : relecture réussie, la liste montre l'ordre enregistré ;
  // relecture en échec, le message le dit et l'ordre affiché est tenu pour incertain (S.listsUnsure) jusqu'à la prochaine
  // relecture réussie.
  async function listAction(run, okText) {
    try {
      const res = await run();
      toast(okText || t("saved"));
      await reloadLists();
      if (!byId("crm-sheet").hidden) await renderSheet();
      return res;
    } catch (e) {
      const ok = await reloadLists(true);
      let text = errorText(e);
      if (e && e.partial) { text = t(ok ? "err_move_partial" : "err_move_unsure"); if (!ok) S.listsUnsure = true; }
      else if (e && e.kind === "conflict") text = t(ok ? "err_conflict_reloaded" : "err_conflict");
      else if (e && e.kind === "version") text = t(ok ? "err_version_reloaded" : "err_version");
      toast(text, true);
      return undefined;
    }
  }
  function itemForm(kind, item) {
    const en = fText("label_en", t("f_label_en"), item ? item.label_en : "", { required: true, max: 80, noOpt: true });
    const fr = fText("label_fr", t("f_label_fr"), item ? item.label_fr : "", { max: 80 });
    formDialog({ title: item ? t("edit_item") : t("new_item"), intro: note(t("list_" + kind)), fields: [en, fr],
      submit: v => (item ? saveChanges("list_item", item, { label_en: v.label_en, label_fr: v.label_fr || null }, ["label_en", "label_fr"])
                          : api().insert("list_item", { kind, label_en: v.label_en, label_fr: v.label_fr || null })),
      done: () => reloadLists(), reload: () => reloadLists() });
  }
  // Déplacement dans une liste (défaut C8). L'ordre voulu est celui de l'écran (position, puis libellé anglais), l'élément
  // échangé avec son voisin. Chaque place garde sa position quand les positions montent déjà strictement (un échange
  // ordinaire écrit deux éléments, comme avant) ; une égalité de positions, reste d'un déplacement coupé, est réparée au
  // passage : la place suivante prend la position d'avant plus un. Seuls les éléments dont la position change sont écrits.
  const POSITION_MAX = 100000;                                                 // limite de la base (list_items_position_chk)
  function movePlan(list, idx, dir) {
    const order = list.slice();
    order[idx] = list[idx + dir]; order[idx + dir] = list[idx];
    let prev = -1, slots = list.map(i => (prev = Math.max(Number(i.position) || 0, prev + 1)));
    if (prev > POSITION_MAX) slots = list.map((i, k) => k + 1);
    return order.map((i, k) => [i, slots[k]]).filter(([i, p]) => Number(i.position) !== p);
  }
  async function moveItem(list, idx, dir) {
    if (!list[idx] || !list[idx + dir]) return;
    if (S.listsUnsure) {                                                       // ordre affiché incertain : relire d'abord, ne rien déplacer
      const ok = await reloadLists(true);
      toast(t(ok ? "list_reloaded" : "err_move_unsure"), !ok);
      return;
    }
    const plan = movePlan(list, idx, dir);
    await listAction(async () => {
      let done = 0;
      try { for (const [i, p] of plan) { await api().update("list_item", i.id, i.version, { position: p }); done += 1; } }
      catch (e) { if (done && e && typeof e === "object") e.partial = true; throw e; }   // une écriture au moins est faite
    }, t("saved"));
  }
  function renderSettings() {
    const lists = byId("crm-set-lists"), review = byId("crm-set-review");
    if (!lists || !review) return;
    if (S.state !== "ready") {
      put(lists, h("h3", { text: t("set_lists") }), note(t(stateKey())));
      review.hidden = true;
      return;
    }
    const kind = S.listKind, active = items(kind), archived = items(kind, true).filter(i => i.archived_at);
    const openStages = items("stage").filter(s => s.stage_outcome === "open").length;
    const rowOf = (i, idx) => h("li", { class: "crm-item" },
      h("div", { class: "crm-item-l" }, h("span", { class: "n", text: itemLabel(i.id) }),
        lang() === "fr" && !i.label_fr ? chip(t("fr_missing"), "warn") : null,
        kind === "stage" ? chip(fx("stage_outcome", i.stage_outcome), i.stage_outcome === "open" ? "muted" : "good") : null,
        i.is_locked ? h("small", { class: "s", text: t("locked_note") }) : null),
      h("div", { class: "crm-mini" },
        btn(t("rename"), () => itemForm(kind, i), "sm"),
        idx > 0 ? actBtn("↑", () => moveItem(active, idx, -1), "sm", t("move_up")) : null,
        idx < active.length - 1 ? actBtn("↓", () => moveItem(active, idx, 1), "sm", t("move_down")) : null,
        i.is_locked || (kind === "stage" && i.stage_outcome === "open" && openStages <= 1) ? null
          : actBtn(t("archive"), () => listAction(() => api().archive("list_item", i.id, i.version), t("archived_done")), "sm")));
    put(lists, h("h3", { text: t("set_lists") }), note(t("set_lists_lead")),
      ctlSelect("crm-set-kind", t("lists_label"), LIST_KINDS.map(k => [k, t("list_" + k)]), kind, v => { S.listKind = v; renderSettings(); }),
      kind === "group" ? note(t("auto_groups_note")) : null,
      h("ol", { class: "crm-items" }, active.map(rowOf)),
      archivedList(archived.map(i => ["list_item", i]), ([, i]) => itemLabel(i.id), listAction),
      acts(btn(t("add_item"), () => itemForm(kind, null))));
    review.hidden = false;
    const periods = FIXED.contact_nature.map(([code]) => S.periods.find(p => p.nature === code)).filter(Boolean);
    const periodRow = p => {
      if (!isDecider()) return h("li", {}, h("span", { text: fx("contact_nature", p.nature) }), h("b", { text: t("months_n", p.months) }));
      const input = h("input", { type: "number", min: 1, max: 120, step: 1, inputmode: "numeric", value: p.months, "aria-label": `${fx("contact_nature", p.nature)} (${t("months_label")})` });
      return h("li", {}, h("span", { text: fx("contact_nature", p.nature) }), h("span", { class: "crm-mini" }, input,
        actBtn(t("save"), async () => {
          const n = Number(input.value);
          if (!Number.isInteger(n) || n < 1 || n > 120) { toast(t("err_months"), true); return; }
          await listAction(() => api().update("review_period", p.id, p.version, { months: n }), t("saved"));
        }, "sm")));
    };
    put(review, h("h3", { text: t("set_review") }), note(t("set_review_lead")), h("ul", { class: "crm-periods" }, periods.map(periodRow)));
  }

  // ------------------------------------------------------------------ bouton « + » (toujours visible sur les écrans du CRM)
  function updateFab() {
    const fab = byId("crm-fab"), dialog = byId("crm-dialog"), sheet = byId("crm-sheet");
    if (!fab || !dialog || !sheet) return;
    fab.hidden = !(S.state === "ready" && dialog.hidden && (PANELS.some(panelVisible) || !sheet.hidden));
    syncHistory();
  }
  function fabMenu() {
    const cur = S.current, r = cur && cur.row;
    let coRef = null;
    if (cur && cur.type === "company") coRef = { type: "company", id: r.id, name: r.name, row: r };
    else if (r && r.company_id) coRef = { type: "company", id: r.company_id, name: r.company_name || "", row: { status: r.company_status } };
    const go = fn => () => { closeDialog(true); fn(); };
    openDialog(t("add_menu"), h("div", { class: "crm-menu" },
      btn(t("new_company"), go(() => companyForm(null))),
      btn(t("new_contact"), go(() => contactForm(null, coRef && !(r && r.archived_at) ? { company: coRef } : {}))),
      btn(t("new_deal"), go(() => dealForm(null, coRef && !(r && r.archived_at) ? { company: coRef, contact: cur && cur.type === "contact" ? r.id : null } : {}))),
      btn(t("log_activity"), go(() => noteForm(null, cur && r && !r.archived_at ? { [cur.type]: r } : {})))));
  }

  // ------------------------------------------------------------------ démarrage
  function translateStatic() {
    doc.querySelectorAll("[data-ci]").forEach(e => { const v = t(e.dataset.ci); if (typeof v === "string" && v) e.textContent = v; });
    doc.querySelectorAll("[data-ci-label]").forEach(e => { const v = t(e.dataset.ciLabel); if (v) { e.setAttribute("aria-label", v); e.setAttribute("title", v); } });
  }
  function renderPanels() { PANELS.forEach(p => renderPanel(p)); }
  function renderAll() { renderPanels(); renderSettings(); updateFab(); }
  async function loadRefs() {
    const [list, periods] = await Promise.all([api().lists(), api().reviewPeriods()]);
    S.items = list || []; S.byId = new Map(S.items.map(i => [i.id, i])); S.periods = periods || [];
    S.listsUnsure = false;                                                     // l'ordre affiché redevient l'ordre enregistré
  }
  async function start() {
    S.state = "loading"; S.built = {}; renderAll();
    const A = api();
    const r = A ? await A.start() : { state: "offline" };
    S.me = r.me || null; S.state = r.state;
    if (S.state === "ready") {
      try { await loadRefs(); } catch (e) { S.state = e && e.kind === "closed" ? "closed" : e && e.kind === "forbidden" ? "denied" : "offline"; }
    }
    S.built = {};
    renderAll();
  }
  function init() {
    if (!byId("crm-sheet") || !byId("crm-dialog")) return;
    translateStatic();
    byId("crm-sheet-close").addEventListener("click", closeSheet);
    byId("crm-sheet-back").addEventListener("click", closeSheet);
    byId("crm-sheet-back-btn").addEventListener("click", sheetBack);
    byId("crm-dialog-close").addEventListener("click", () => closeDialog());
    byId("crm-dialog-back").addEventListener("click", () => closeDialog());
    byId("crm-fab").addEventListener("click", fabMenu);
    doc.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if (!byId("crm-dialog").hidden) closeDialog(); else if (!byId("crm-sheet").hidden) closeSheet();
    });
    // Geste retour du téléphone : ferme le calque du dessus (défaut C11). Une entrée restée d'avant un rechargement de la
    // page est remise à zéro, sans changer l'adresse.
    if (typeof root.addEventListener === "function") root.addEventListener("popstate", onPopState);
    const hh = hist();
    if (hh && hh.state && typeof hh.state.lunaCrm === "number") { try { hh.replaceState(null, ""); } catch (e) { /* facultatif */ } }
    // Un panneau du CRM qui s'ouvre (menu de la page) relit ses données.
    const watch = new MutationObserver(muts => {
      muts.forEach(m => { const p = String(m.target.id || "").replace(/^p-crm-/, ""); if (PANELS.includes(p) && !m.target.hidden) renderPanel(p); });
      updateFab();
    });
    PANELS.forEach(p => { const e = panelEl(p); if (e) watch.observe(e, { attributes: true, attributeFilter: ["hidden"] }); });
    // La langue se choisit dans Paramètres (page) : les écrans du CRM la suivent.
    new MutationObserver(() => { translateStatic(); S.built = {}; renderAll(); if (!byId("crm-sheet").hidden) renderSheet(); })
      .observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden && S.state === "ready") renderPanels(); });
    start();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
