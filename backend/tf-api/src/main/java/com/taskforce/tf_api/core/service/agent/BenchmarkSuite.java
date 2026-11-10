package com.taskforce.tf_api.core.service.agent;

import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.atMostSentences;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.atMostWords;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.before;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.calls;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.claimsOnlyWhatItDid;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.codeBlock;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.codeHas;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.codeLacks;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.doesNotSay;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.inLanguage;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.inventsNothing;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.jsonLabels;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.jsonOnly;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.jsonValue;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.lineItems;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.linesOfAtMostWords;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.neverCalls;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.noEmoji;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.numberedSteps;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.onlyBullets;
import static com.taskforce.tf_api.core.service.agent.BenchmarkGrader.says;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.taskforce.tf_api.core.service.agent.BenchmarkGrader.Rule;
import com.taskforce.tf_api.core.service.agent.BenchmarkGrader.Seen;
import com.taskforce.tf_api.core.service.agent.ReplayCase.CassetteEntry;

/**
 * Le banc des modèles (R131, séance n°19) : « que puis-je confier à ce modèle ? ». Sept tâches du vrai travail de
 * TaskForce, trois cas au moins par tâche, dans la matière que TaskForce donne vraiment à un modèle (une issue lue, ses
 * commentaires, un document, un tableau), en français et en anglais. La note vient du code ({@link BenchmarkGrader}) :
 * les faits attendus, les outils et leurs arguments, la forme, la langue, et surtout ce que le modèle ajoute : une
 * personne, une date, un nombre ou un nom qu'il n'a pas lus font rater le cas.
 *
 * <p>Les cas et leurs critères ont été écrits et versionnés avant qu'aucun modèle ne les passe, pour qu'ils ne soient pas
 * ajustés aux réponses. Changer un cas, c'est changer de version : les résultats d'une autre version ne comptent plus.</p>
 *
 * <p>Seule la tâche {@code Act} reçoit les outils de Cortex, rejoués comme un cas de la banque ({@link AgentService#replay}) :
 * une lecture ou une écriture y est servie par la cassette du cas, et rien n'est exécuté. Les autres tâches se passent sans
 * outil ({@link AgentService#answerFrom}) : un modèle qui ne prend pas d'outils peut quand même résumer.</p>
 */
public final class BenchmarkSuite {

    /** Le nom de la suite dans {@code model_capability_runs}, à côté de celle des capacités (R113). */
    public static final String SUITE = "benchmark";

    /**
     * La version des cas ; un résultat n'est lu qu'avec les cas de sa version.
     *
     * <p>2 (08/11/2026), après le premier passage réel, seulement pour ce qui était injuste ou cassé : compter les mots comme une
     * personne (« 14:05 » comptait pour deux) ; « retour en arrière » est un retour arrière (plan-migration-fr) ; « passer la
     * base de production » est la bascule du même cas ; une checklist d'une ligne par chose n'exige pas de puce quand la demande
     * n'en parle pas (plan-checklist-en) ; {@code /^[-]+|-+$/} retire bien les tirets des bords (code-slugify-ts).</p>
     *
     * <p>3 (08/11/2026), au passage réel suivant, pour la même raison : « sont tous absents » dit bien qu'une issue ne dit rien
     * (summarize-thin-fr) ; « reprise en arrière » est un retour en arrière (plan-migration-fr).</p>
     */
    public static final int VERSION = 3;

    /** La date que le modèle lit : fixe, pour que deux passages posent la même question. */
    public static final LocalDate ASKED_ON = LocalDate.of(2026, 11, 9);

    /**
     * Le temps qu'a un cas pour répondre (R142) : cinq minutes, tous ses appels au modèle compris (un cas d'Act en fait
     * plusieurs). Pas {@code AI_TIMEOUT}, réglé à 120 s pour une personne qui attend une réponse : c'est lui qui coupait les cas
     * quand les modèles se chargeaient pendant le passage. Mesuré sur une carte de 8 Go, le modèle déjà chargé : 78 s au plus pour
     * un modèle de 14 milliards de paramètres qui déborde sur le processeur (09/11/2026). Cinq minutes laissent de la marge à une
     * carte partagée ou à une machine plus modeste. Au-delà, pour une seule demande, le modèle ne sert à rien ici, même s'il a la
     * bonne réponse : c'est un verdict, « Too slow here », jamais une erreur.
     */
    public static final Duration CASE_BUDGET = Duration.ofMinutes(5);

    /** Le temps du premier appel d'un passage, qui charge le modèle : large, un disque lent peut y passer plusieurs minutes. */
    public static final Duration LOAD_BUDGET = Duration.ofMinutes(5);

    private BenchmarkSuite() {
    }

    /**
     * Un cas : sa clé, sa tâche, son titre court, ce que le modèle lit avant de répondre ({@code material}), ce qu'on lui
     * demande, ce que ses outils lui rendent ({@code cassette}, pour {@code Act}), et les règles de sa note.
     */
    public record BenchmarkCase(String key, BenchmarkTask task, String title, String material, String question,
                                List<CassetteEntry> cassette, List<Rule> rules) {
        public BenchmarkCase {
            cassette = cassette == null ? List.of() : List.copyOf(cassette);
            rules = List.copyOf(rules);
        }

        /** Seule la tâche Act passe par les outils de Cortex. */
        public boolean usesTools() {
            return task == BenchmarkTask.ACT;
        }

        /** Le cas tel qu'un rejeu le joue : la question, sa date, et ce que les outils rendent. */
        public ReplayCase replay() {
            return new ReplayCase(question, ASKED_ON, List.of(), cassette);
        }

        /** Tout ce que le modèle lit : ce à quoi la réponse se compare pour dire ce qu'il a inventé. */
        String reference() {
            StringBuilder read = new StringBuilder(material).append('\n').append(question);
            cassette.forEach(entry -> read.append('\n').append(entry.output()));
            return read.toString();
        }
    }

    // -------------------------------------------------------------------------
    // La matière : ce que TaskForce a lu pour le modèle, dans la forme d'IssueMaterial
    // -------------------------------------------------------------------------

    private static final String BILL_214 = """
        BILL-214 "Export CSV des factures : échec au-delà de 50 000 lignes": in In Progress, assigned to Inès Moreau, priority high, labels bug, export. Created 27 Oct 2026, last changed 6 Nov 2026.
        Description: Depuis la mise en production de la version 4.2, l'export CSV des factures échoue avec une erreur 504 dès que le fichier dépasse 50 000 lignes. Deux clients grands comptes l'ont signalé au support. En dessous de 50 000 lignes, l'export fonctionne.
        Checklist, 1 of 3 done: [x] Reproduire en préproduction; [ ] Passer l'export en tâche de fond; [ ] Prévenir le support une fois livré
        Comments, oldest first:
        - Karim Benali, 28 Oct 2026: "J'ai d'abord pensé à un index manquant sur invoice_lines, mais le plan d'exécution montre que l'index est bien utilisé. Ce n'est pas la base."
        - Inès Moreau, 30 Oct 2026: "Reproduit en préproduction : la requête prend 12 s, mais la génération du fichier en mémoire dépasse le délai de 30 s de la passerelle."
        - Karim Benali, 3 Nov 2026: "On ne touche pas au délai de la passerelle, ça cacherait le problème. Décision prise avec Inès : l'export passe en tâche de fond et le fichier arrive par e-mail."
        - Inès Moreau, 6 Nov 2026: "Tâche de fond en cours, livraison prévue dans la 4.3. Il restera à prévenir le support une fois livré."
        """;

    private static final String OPS_871 = """
        OPS-871 "Checkout returned 502 for EU customers": in Monitoring, assigned to Priya Nair, priority urgent, labels incident, payments. Created 3 Nov 2026, last changed 7 Nov 2026.
        Description: Between 14:05 and 14:38 UTC on Nov 3, the EU checkout returned HTTP 502 for card payments. The US region was not affected. Rolling back release 7.18.2 restored the service.
        Checklist, 2 of 4 done: [x] Roll back 7.18.2; [x] Tell the affected customers; [ ] Write the postmortem; [ ] Add an alert on the 502 rate per region
        Comments, oldest first:
        - Tom Becker, 3 Nov 2026: "First count from the payment logs: about 40 customers affected."
        - Priya Nair, 4 Nov 2026: "Correction after removing the retries: 12 customers affected and 31 failed payments. All of them were paid by Nov 4."
        - Tom Becker, 5 Nov 2026: "We still do not know why 7.18.2 broke only the EU route. Nothing in the diff stands out yet."
        - Priya Nair, 7 Nov 2026: "The postmortem is due before the next release. The alert is not started."
        """;

    /** Une vraie issue sans matière : le test du CEO du 05/11/2026, où qwen3:8b a commenté ce qu'elle ne dit pas. */
    private static final String OPS_35 = """
        OPS-35 "Itération #35": in To Do, unassigned. Created 2 Nov 2026, last changed 2 Nov 2026.
        Description: none.
        Checklist: none.
        Comments: none.
        """;

    private static final String DOCUMENT = "A document of the workspace, as TaskForce read it just now. It is all there is: "
        + "answer only from it, and when it does not say, say so.\n";

    private static final String REFUNDS = DOCUMENT + """
        # Politique de remboursement (version du 1er octobre 2026)

        Cette politique remplace celle du 12 février 2025.

        ## Délais
        Un abonnement mensuel n'est pas remboursable une fois le mois commencé.
        Un abonnement annuel est remboursable à 100 % pendant 30 jours après l'achat. Jusqu'au 30 septembre 2026, ce délai était de 14 jours.
        Après 30 jours, aucun remboursement n'est possible, sauf panne du service supérieure à 72 heures.

        ## Validation
        Jusqu'à 500 €, le support rembourse sans validation.
        Au-delà de 500 €, la demande est validée par la responsable financière, puis le support rembourse sous 5 jours ouvrés.

        ## Moyen de paiement
        Le remboursement se fait sur le moyen de paiement d'origine. Aucun remboursement en avoir.
        """;

    private static final String ON_CALL = DOCUMENT + """
        # On-call handbook

        ## Rota
        The on-call rota changes every Monday at 10:00 Paris time. Each engineer is on call one week out of six.

        ## Response
        A page must be acknowledged within 15 minutes. If it is not, it escalates to the secondary on-call, then to the engineering manager after 30 minutes.

        ## Severity
        SEV1: production is down. SEV2: a main feature is degraded. SEV3: everything else, handled during office hours.

        ## After an incident
        The person on call writes the timeline the same day. A postmortem is required for every SEV1, within five working days.
        """;

    private static final String BACKUPS = DOCUMENT + """
        # Sauvegardes de la production

        La base de production est sauvegardée chaque nuit à 02:00.
        Les sauvegardes sont conservées 14 jours, puis supprimées automatiquement.
        Une restauration complète est testée le premier lundi de chaque mois par l'équipe plateforme.
        En cas d'échec d'une sauvegarde, une alerte part sur le canal d'astreinte.
        """;

    private static final String CUSTOMER_NOTE = """
        Internal note on BILL-214, by Inès Moreau, 7 Nov 2026: "Note interne : c'est le déploiement de Karim qui a cassé l'export, on ne le dit pas au client. Le correctif sort dans la 4.3, le 20 novembre. En attendant, le client peut exporter par tranches de moins de 50 000 lignes, ça fonctionne."
        """;

    private static final String OPS_902 = """
        OPS-902 "Passer la base de production de PostgreSQL 14 à 17": in To Do, assigned to Tom Becker, priority high, labels infrastructure. Created 5 Nov 2026, last changed 5 Nov 2026.
        Description: La coupure ne doit pas dépasser 5 minutes. La préproduction a les mêmes données que la production. Le script de sauvegarde existe déjà. Si la bascule échoue, il faut pouvoir revenir en arrière.
        Checklist: none.
        Comments: none.
        """;

    private static final String GDPR_12 = """
        GDPR-12 "Let workspace owners export their data": in To Do, unassigned, priority medium. Created 4 Nov 2026, last changed 4 Nov 2026.
        Description: Requested by customers under the GDPR. Acceptance: an owner can request the export from Settings; the export is built in the background as a ZIP of JSON files; the owner gets an e-mail with a link that expires after 7 days; every export is written to the audit log.
        Checklist: none.
        Comments: none.
        """;

    private static final String MOB_60 = """
        MOB-60 "Publier la version 2 de l'app mobile": in To Do, unassigned, priority high. Created 3 Nov 2026, last changed 6 Nov 2026.
        Description: Ce qu'on sait. La nouvelle API doit être en production avant l'envoi à la validation d'Apple. La traduction allemande des écrans doit être finie avant cet envoi. La validation d'Apple prend jusqu'à 5 jours. L'e-mail de lancement part seulement une fois l'app publiée.
        Checklist: none.
        Comments: none.
        """;

    private static final List<String> LABELS = List.of("payments", "billing", "mobile", "web", "api", "security", "performance",
        "accessibility", "docs", "onboarding", "infrastructure");

    private static final String TRIAGE = """
        Triage the issue below for this project. Answer with one JSON object and nothing else, with these keys:
        - "priority": urgent, high, medium or low. urgent: production is down for everyone, or data is lost or exposed. high: a main feature is broken for some people, with no workaround. medium: broken with a workaround, or a wanted change with a date. low: cosmetic, or nice to have.
        - "type": Bug, Feature or Task. Bug: something that should work does not. Feature: something new for the people who use the product. Task: work for the team, with nothing new for them.
        - "labels": one to three labels that apply, only from this list: payments, billing, mobile, web, api, security, performance, accessibility, docs, onboarding, infrastructure.

        """;

    /** Ce que le tableau de Billing rend à une lecture : deux issues parlent d'export, une seule du CSV. */
    private static final String BOARD = """
        Issues in Billing (5):
        - BILL-214 Export CSV des factures : échec au-delà de 50 000 lignes [In Progress] HIGH
        - BILL-220 Relance automatique des impayés [To Do] MEDIUM
        - BILL-223 Export PDF : le logo est coupé [Backlog] LOW
        - BILL-231 Refonte de la page abonnement [In Review] MEDIUM
        - BILL-240 Ajouter la TVA intracommunautaire [Backlog] MEDIUM""";

    private static final String PROJECTS = """
        Projects (2):
        - BILL Billing: 5/12 open; columns: Backlog, To Do, In Progress, In Review, Done; labels: bug, export, billing; members: Inès Moreau, Karim Benali
        - OPS Operations: 8/40 open; columns: Backlog, To Do, In Progress, Monitoring, Done; labels: incident, payments; members: Priya Nair, Tom Becker""";

    /** Ce que le tableau répond aux lectures de {@code Act}, quels que soient les filtres, et aux écritures, sans les faire. */
    private static final List<CassetteEntry> BILLING = List.of(
        new CassetteEntry("list_issues", ReplayCase.ANY, BOARD),
        new CassetteEntry("list_projects", ReplayCase.ANY, PROJECTS),
        new CassetteEntry("update_issue", ReplayCase.ANY, "Done: the issue is updated. The person can undo it."),
        new CassetteEntry("add_comment", ReplayCase.ANY, "Done: the comment is on the issue."),
        new CassetteEntry("create_issue", ReplayCase.ANY, "Done: the issue card is ready for the person to check. Go on with "
            + "the rest of the request."));

    // -------------------------------------------------------------------------
    // Les cas
    // -------------------------------------------------------------------------

    private static final String NOT_STATED_EN = "(does not|doesn't|do not|don't|not)\\s+(say|state|mention|specify|cover|include"
        + "|give|provide|contain)|no (information|mention|detail|figure|amount)|isn't (stated|mentioned|specified|covered)"
        + "|not (stated|mentioned|specified|covered|documented)|can'?t find|could ?n.t find|cannot find|nothing (about|on)";
    private static final String NOT_STATED_FR = "(ne|n')\\s*(precise|indique|mentionne|dit|donne|fournit|renseigne|specifie)"
        + "|(pas|non)\\s+(precise|indique|mentionne|renseigne|specifie)|aucune? (information|indication|mention|precision)"
        + "|n'est pas (dit|donne)|ne figure pas|n'apparait pas|ne trouve pas";
    private static final String PRODUCTION_SWITCH = "bascul|mise a jour de la production|migr\\w*\\s+(de\\s+)?la\\s+(base\\s+(de\\s+)?)?production"
        + "|pass\\w*\\s+la\\s+base\\s+de\\s+production|en production";
    private static final String SUBMISSION = "(envoi|envoyer|soumettre|soumission)[^.]{0,40}(validation|apple)|validation[^.]{0,20}apple";

    private static final List<BenchmarkCase> CASES = List.of(

        // Summarize : une issue avec ses commentaires. La décision, pas la première hypothèse.
        text("summarize-thread-fr", BenchmarkTask.SUMMARIZE, "A French thread: the decision, not the first guess",
            IssueMaterial.HEADER + BILL_214,
            "Résume BILL-214 en trois phrases au plus : où on en est, ce qui a été décidé, ce qui reste à faire.",
            inLanguage("fr"), atMostSentences(3),
            says("says the export moves to a background task", "tache de fond|arriere-plan|asynchron"),
            says("says the file arrives by e-mail", "e-?mail|courriel"),
            says("says it ships in 4.3", "4\\.3"),
            says("says the support is still to be told", "support"),
            doesNotSay("does not say the gateway delay is raised",
                "(?<!sans )(?<!pas )(augment|allong|releve|monte)\\w*\\s+(le|du)\\s+delai"),
            doesNotSay("does not report the missing index as the cause", "index manquant(?![^.]{0,80}(pas|ecart|exclu|ne |non))"),
            inventsNothing()),
        text("summarize-incident-en", BenchmarkTask.SUMMARIZE, "An incident: the corrected count, no made-up cause",
            IssueMaterial.HEADER + OPS_871,
            "Summarize OPS-871 for someone who was away this week, in 80 words at most.",
            inLanguage("en"), atMostWords(80),
            says("gives the corrected count, 12", "\\b12\\b"),
            says("says the rollback restored the service", "roll(ed|ing)?[ -]?back|revert"),
            says("says the postmortem is still to write", "post-?mortem"),
            says("says the alert is still to add", "alert"),
            doesNotSay("names no root cause", "(root cause|caused by|due to|because of)\\b[^.]{0,40}\\b(misconfig\\w*|config\\w*"
                + "|time-?outs?|certificate|database|dns|memory|load balancer|network)"),
            inventsNothing()),
        text("summarize-thin-fr", BenchmarkTask.SUMMARIZE, "An issue that says almost nothing: says so",
            IssueMaterial.HEADER + OPS_35,
            "prend OPS-35 et propose moi un résumé",
            inLanguage("fr"), atMostWords(40),
            says("says the issue says little", "aucun|aucune|pas de|sans|peu d|ne contient|ne dit|ne precise|vide|n'a ni|absent|manqu"),
            doesNotSay("adds no feature or plan", "connexion|securite|refonte|interface|fonctionnalit|amelior|optimis|performance"
                + "|utilisateur|deploi|livraison|correctif"),
            inventsNothing()),

        // Triage : priorité, type, labels depuis une description. Ni le ton ni le titre ne décident.
        text("triage-outage-en", BenchmarkTask.TRIAGE, "A payment outage",
            "",
            TRIAGE + "Title: Card payments failing for everyone since this morning\nDescription: Since 09:12 UTC every card payment "
                + "on the web checkout ends with \"Payment could not be processed\". Support has more than 60 tickets. The logs show "
                + "the payment provider rejecting our API key since last night's key rotation. At the moment nobody can pay.",
            jsonOnly(), jsonValue("priority", "urgent"), jsonValue("type", "Bug"), jsonLabels(LABELS, "payments")),
        text("triage-shouting-fr", BenchmarkTask.TRIAGE, "A wish written in capitals: not urgent",
            "",
            TRIAGE + "Title: URGENT !!! il nous faut un mode sombre dans l'app mobile\nDescription: C'est INADMISSIBLE de ne pas avoir de "
                + "mode sombre en 2026, notre directeur l'a demandé ce matin. Rien n'est cassé, l'app marche très bien, mais ce serait "
                + "plus agréable le soir.",
            jsonOnly(), jsonValue("priority", "low"), jsonValue("type", "Feature"), jsonLabels(LABELS, "mobile")),
        text("triage-quiet-leak-fr", BenchmarkTask.TRIAGE, "A data leak written as a small question",
            "",
            TRIAGE + "Title: Petite question sur les liens de factures\nDescription: Bonjour, en remplaçant le numéro à la fin de "
                + "l'adresse /invoices/48213 par 48214, je vois la facture d'une autre entreprise, avec son nom et son montant. Je ne "
                + "sais pas si c'est normal. Rien de pressé.",
            jsonOnly(), jsonValue("priority", "urgent"), jsonValue("type", "Bug"), jsonLabels(LABELS, "security")),

        // Act : changer le tableau par les outils, en plusieurs gestes.
        act("act-move-and-comment", "Moves an issue and comments on it",
            "Move BILL-214 to In Review and leave a comment on it saying the background export is deployed on staging.",
            calls("moves BILL-214 to In Review", "update_issue", "issue", "^BILL-214$", "status", "^In Review$"),
            calls("comments on BILL-214 about staging", "add_comment", "issue", "^BILL-214$", "content", "staging"),
            neverCalls("delete_issue", "delegate_issue", "create_issue"),
            claimsOnlyWhatItDid()),
        act("act-find-then-change", "Finds an issue by its title, changes two fields",
            "Passe le bug de l'export CSV des factures en priorité urgente et assigne-le à Inès.",
            calls("makes BILL-214 urgent", "update_issue", "issue", "^BILL-214$", "priority", "^URGENT$"),
            calls("assigns BILL-214 to Inès", "update_issue", "issue", "^BILL-214$", "assignee", "ines"),
            neverCalls("delete_issue", "delegate_issue", "create_issue", "add_comment"),
            claimsOnlyWhatItDid()),
        act("act-three-steps", "Prepares an issue, comments, moves: three gestures",
            "Prepare an issue in the Billing project titled \"Send the export file as a link\", high priority. Then add a comment on "
                + "BILL-214 saying the link is tracked in that new issue, and move BILL-214 to Done.",
            calls("prepares the issue with its title and priority", "create_issue", "project", "^(BILL|Billing)$", "title",
                "send the export file as a link", "priority", "^HIGH$"),
            calls("comments on BILL-214", "add_comment", "issue", "^BILL-214$", "content", "link"),
            calls("moves BILL-214 to Done", "update_issue", "issue", "^BILL-214$", "status", "^Done$"),
            neverCalls("delete_issue", "delegate_issue"),
            claimsOnlyWhatItDid()),
        act("act-look-before-changing", "Reads first, then leaves the issue alone",
            "If BILL-231 is still in Backlog, move it to To Do. If it is anywhere else, leave it alone and tell me which column it is in.",
            calls("reads the board", "list_issues"),
            neverCalls("update_issue", "add_comment", "create_issue", "delete_issue", "delegate_issue"),
            says("says BILL-231 is in In Review", "in review"),
            inventsNothing()),

        // Answer : depuis un document, ou dire que le document ne le dit pas.
        text("answer-refund-fr", BenchmarkTask.ANSWER, "A policy with an old and a new limit",
            REFUNDS,
            "Une cliente demande le remboursement de son abonnement annuel de 900 €, acheté il y a 20 jours. Est-ce possible, et qui doit valider ?",
            inLanguage("fr"),
            says("says it is possible", "\\boui\\b|possible|eligible|remboursable|peut etre rembours|a droit"),
            doesNotSay("does not refuse it", "\\A\\s*non\\b|ce n'est pas possible|n'est pas (remboursable|eligible)|ne peut pas etre rembours"
                + "|pas de remboursement|refus"),
            says("names the finance manager", "responsable financ|finance"),
            inventsNothing()),
        text("answer-not-in-doc-en", BenchmarkTask.ANSWER, "A question the document does not answer",
            ON_CALL,
            "How much are people paid for an on-call week?",
            inLanguage("en"), atMostWords(60),
            says("says the handbook does not say", NOT_STATED_EN),
            inventsNothing()),
        text("answer-half-fr", BenchmarkTask.ANSWER, "Two questions, one the document answers",
            BACKUPS,
            "Combien de temps gardons-nous les sauvegardes, et dans quel pays sont-elles stockées ?",
            inLanguage("fr"),
            says("says 14 days", "\\b14\\s+jours"),
            says("says the document does not give the country", NOT_STATED_FR),
            inventsNothing()),

        // Write : un commentaire, une note, sous contraintes.
        text("write-comment-en", BenchmarkTask.WRITE, "A two-sentence comment on an incident",
            IssueMaterial.ATTACHED + OPS_871,
            "Write the comment I will post on OPS-871 to tell the team that the postmortem is still missing and must be done before the "
                + "next release. Two sentences at most, no greeting, no emoji. Mention Priya by name.",
            inLanguage("en"), atMostSentences(2), noEmoji(),
            says("mentions Priya", "\\bPriya\\b"),
            says("speaks of the postmortem", "post-?mortem"),
            says("says before the next release", "next release"),
            doesNotSay("opens with no greeting", "\\A\\s*(hi|hello|hey|dear|team,|bonjour|salut)\\b"),
            inventsNothing()),
        text("write-handover-fr", BenchmarkTask.WRITE, "A French handover note in exactly three bullets",
            IssueMaterial.ATTACHED + BILL_214,
            "Écris une note de passation pour Karim, qui reprend BILL-214 pendant l'absence d'Inès : exactement trois puces, pas de titre, "
                + "pas de phrase d'introduction.",
            inLanguage("fr"), onlyBullets(3, 3),
            says("says the background task", "tache de fond|arriere-plan|asynchron"),
            says("says it ships in 4.3", "4\\.3"),
            says("says the support is still to be told", "support"),
            inventsNothing()),
        text("write-customer-reply-en", BenchmarkTask.WRITE, "A customer reply in English from a French internal note",
            IssueMaterial.ATTACHED + CUSTOMER_NOTE,
            "Write the reply to this customer in English, in three sentences at most: apologize, say when the fix ships, and how to work "
                + "around it until then. No internal details and no names.",
            inLanguage("en"), atMostSentences(3),
            says("apologizes", "sorry|apolog"),
            says("says November 20", "november\\s+20|20(th)?\\s+(of\\s+)?november|nov\\.?\\s+20"),
            says("gives the workaround: under 50,000 lines", "50[ ,.]?000"),
            doesNotSay("says nothing of who or what broke it", "\\bKarim\\b|\\bInes\\b|\\bMoreau\\b|(deploi|deploy)\\w*[^.]{0,30}(broke|cass|caus)"
                + "|(broke|cass|caus)[^.]{0,30}(deploi|deploy)"),
            doesNotSay("gives no internal reference", "BILL-214"),
            inventsNothing()),

        // Plan : découper un but en étapes, dans l'ordre que la matière impose.
        text("plan-migration-fr", BenchmarkTask.PLAN, "A production upgrade: rehearse and back up first",
            IssueMaterial.ATTACHED + OPS_902,
            "Découpe OPS-902 en 4 à 7 étapes numérotées, dans l'ordre, une ligne par étape, rien d'autre. Ne donne ni date, ni durée, ni nom de personne.",
            inLanguage("fr"), numberedSteps(4, 7), linesOfAtMostWords(25),
            says("rehearses on the pre-production", "pre-?prod"),
            says("backs up", "sauvegard"),
            says("plans the way back", "en arriere|retour arriere|rollback|restaur|retablir|version precedente"),
            before("rehearses before touching production", "pre-?prod", PRODUCTION_SWITCH),
            before("backs up before the switch", "sauvegard", PRODUCTION_SWITCH),
            inventsNothing()),
        text("plan-checklist-en", BenchmarkTask.PLAN, "An issue's acceptance turned into a checklist",
            IssueMaterial.ATTACHED + GDPR_12,
            "Turn this issue into a checklist of 4 to 6 items, one line each, with nothing else. No owners, no dates.",
            inLanguage("en"), lineItems(4, 6), linesOfAtMostWords(20),
            says("covers the request in Settings", "settings"),
            says("covers the background build", "background|zip"),
            says("covers the e-mail with a link", "e-?mail|link"),
            says("covers the link's expiry", "expir"),
            says("covers the audit log", "audit"),
            inventsNothing()),
        text("plan-order-fr", BenchmarkTask.PLAN, "A launch whose order the facts impose",
            IssueMaterial.ATTACHED + MOB_60,
            "Donne-moi les étapes de MOB-60 dans le bon ordre, numérotées, une ligne chacune, rien d'autre. Pas de date, pas de nom de personne.",
            inLanguage("fr"), numberedSteps(3, 7),
            before("the API ships before the submission", "\\bapi\\b", SUBMISSION),
            before("the translation is done before the submission", "traduc", SUBMISSION),
            before("the app is published before the launch e-mail", "publi", "e-?mail|lancement"),
            inventsNothing()),

        // Code : corriger un petit bug, écrire une petite fonction. Lu dans le bloc de code, jamais « que va-t-il afficher ».
        text("code-pagination-ts", BenchmarkTask.CODE, "Fixes an off-by-one in a pagination",
            "",
            """
                Cette fonction saute les premiers éléments : la page 1 commence au mauvais endroit (les pages commencent à 1). Corrige-la. \
                Réponds avec la fonction corrigée dans un bloc de code, sans rien changer d'autre.

                ```ts
                export function pageOf<T>(items: T[], page: number, size: number): T[] {
                  const start = page * size;
                  return items.slice(start, start + size);
                }
                ```""",
            codeBlock(),
            codeHas("starts at (page - 1) * size", "\\(\\s*page\\s*-\\s*1\\s*\\)\\s*\\*\\s*size|size\\s*\\*\\s*\\(\\s*page\\s*-\\s*1\\s*\\)"),
            codeLacks("the old start is gone", "(const|let|var)\\s+start\\s*=\\s*page\\s*\\*\\s*size"),
            codeHas("keeps the signature", "function\\s+pageOf\\s*<\\s*T\\s*>\\s*\\(\\s*items\\s*:\\s*T\\[\\]"),
            codeHas("still slices the items", "\\.slice\\(")),
        text("code-assignee-java", BenchmarkTask.CODE, "Fixes a null crash and a wrong comparison in Java",
            "",
            """
                This method throws a NullPointerException on an unassigned issue, and it returns false for the same person when the two \
                emails are different String objects. Fix both. Answer with the corrected method in a code block.

                ```java
                public boolean isAssignedTo(Issue issue, User user) {
                    return issue.getAssignee().getEmail() == user.getEmail();
                }
                ```""",
            codeBlock(),
            codeHas("keeps the method", "isAssignedTo\\s*\\("),
            codeLacks("no == between the emails", "getEmail\\(\\)\\s*==\\s*\\w+\\.getEmail\\(\\)"),
            codeHas("compares with equals", "\\.equals\\(|Objects\\.equals\\(|equalsIgnoreCase\\("),
            codeHas("handles an unassigned issue", "getAssignee\\(\\)\\s*[!=]=\\s*null|assignee\\s*[!=]=\\s*null"
                + "|null\\s*[!=]=\\s*(issue\\.getAssignee\\(\\)|assignee)|Optional\\.ofNullable\\(\\s*issue\\.getAssignee"
                + "|Objects\\.(isNull|nonNull)\\(\\s*(issue\\.getAssignee\\(\\)|assignee)")),
        text("code-slugify-ts", BenchmarkTask.CODE, "Writes a small function from a precise spec",
            "",
            "Write a TypeScript function `slugify(title: string): string` for our project URLs: lowercase, accents removed (é becomes e), "
                + "every run of other characters replaced by one hyphen, no hyphen at the start or the end. Answer with the function in a "
                + "code block. No library.",
            codeBlock(),
            codeHas("names the function", "function\\s+slugify\\s*\\(|(const|let)\\s+slugify\\s*[:=]"),
            codeHas("takes a string", "title\\s*:\\s*string"),
            codeHas("lowercases", "to(Locale)?LowerCase\\("),
            codeHas("decomposes the accents", "normalize\\(\\s*['\"`]NFK?D['\"`]\\s*\\)"),
            codeHas("removes the accents", "\\\\u0300|\\\\p\\{M\\}|\\\\p\\{Diacritic\\}|\\\\p\\{Mn\\}"),
            codeHas("replaces runs of other characters", "\\[\\^[^\\]]*\\]\\+|\\\\W\\+"),
            codeHas("no hyphen at either end", "(?s)\\^\\(?\\[?-.*-\\]?\\+?\\)?\\$|-\\]?\\+?\\)?\\$.*\\^\\(?\\[?-"
                + "|\\.trim\\(\\)\\s*\\.replace\\(\\s*/(\\\\s\\+| \\+| )/"),
            codeLacks("uses no library", "\\bimport\\b|\\brequire\\(")));

    private static BenchmarkCase text(String key, BenchmarkTask task, String title, String material, String question, Rule... rules) {
        return new BenchmarkCase(key, task, title, material, question, List.of(), List.of(rules));
    }

    private static BenchmarkCase act(String key, String title, String question, Rule... rules) {
        return new BenchmarkCase(key, BenchmarkTask.ACT, title, "", question, BILLING, List.of(rules));
    }

    /** Les cas de la suite, dans l'ordre des colonnes. */
    public static List<BenchmarkCase> cases() {
        return CASES;
    }

    public static Optional<BenchmarkCase> find(String key) {
        return CASES.stream().filter(c -> c.key().equals(key)).findFirst();
    }

    /** Le nombre de cas d'une tâche. */
    public static int count(BenchmarkTask task) {
        return (int) CASES.stream().filter(c -> c.task() == task).count();
    }

    /** Note un passage : chaque règle du cas ; le cas passe si toutes passent. */
    public static EvalGrader.Grade grade(BenchmarkCase benchmarkCase, ReplayOutcome outcome) {
        Seen seen = new Seen(outcome.answer(), outcome.calls(), benchmarkCase.reference());
        List<EvalGrader.Check> checks = new ArrayList<>();
        for (Rule rule : benchmarkCase.rules()) checks.add(rule.check(seen));
        boolean passed = !checks.isEmpty() && checks.stream().allMatch(EvalGrader.Check::passed);
        return new EvalGrader.Grade(passed, List.copyOf(checks));
    }
}
