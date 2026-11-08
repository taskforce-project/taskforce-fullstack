package com.taskforce.tf_api.core.service.agent;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

import com.taskforce.tf_api.core.service.LlmUsage;
import com.taskforce.tf_api.core.service.agent.BenchmarkSuite.BenchmarkCase;
import com.taskforce.tf_api.core.service.agent.ReplayOutcome.ReplayCall;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le banc des modèles (R131) : chaque tâche a au moins trois cas, chaque cas a une réponse connue qui passe et des
 * réponses connues qui ratent, pour la raison attendue. Ces réponses ont été écrites à la main avant qu'aucun modèle ne
 * passe la suite : elles prouvent qu'un cas peut se réussir, et qu'il ne se réussit pas n'importe comment.
 */
@DisplayName("BenchmarkSuite")
class BenchmarkSuiteTest {

    private static final String PASSES = null;

    private static ReplayOutcome outcome(String answer, ReplayCall... calls) {
        return new ReplayOutcome(answer, List.of(calls), "qwen3:8b", new LlmUsage(10, 2, 12));
    }

    /** Un appel comme le rejeu le garde : servi par la cassette. */
    private static ReplayCall call(String tool, String json) {
        return new ReplayCall(tool, json, "allow", "success");
    }

    private static Arguments good(String key, String answer, ReplayCall... calls) {
        return Arguments.of(key, outcome(answer, calls), PASSES);
    }

    private static Arguments bad(String key, String failing, String answer, ReplayCall... calls) {
        return Arguments.of(key, outcome(answer, calls), failing);
    }

    private static final ReplayCall READ_BOARD = call("list_issues", "{\"project\":\"Billing\"}");
    private static final ReplayCall TO_REVIEW = call("update_issue", "{\"issue\":\"BILL-214\",\"status\":\"In Review\"}");
    private static final ReplayCall STAGING = call("add_comment", "{\"issue\":\"BILL-214\",\"content\":\"The background export is deployed on staging.\"}");

    static Stream<Arguments> answers() {
        return Stream.of(
            // Summarize
            good("summarize-thread-fr", "L'export CSV des factures échoue au-delà de 50 000 lignes, car la génération du fichier en "
                + "mémoire dépasse le délai de 30 s de la passerelle. Karim et Inès ont décidé de passer l'export en tâche de fond, avec "
                + "le fichier envoyé par e-mail, pour une livraison dans la 4.3. Il reste à finir ce travail puis à prévenir le support."),
            bad("summarize-thread-fr", "does not report the missing index as the cause", "Le problème vient d'un index manquant sur "
                + "invoice_lines. L'export passe en tâche de fond, le fichier part par e-mail, dans la 4.3. Il reste à prévenir le support."),
            bad("summarize-thread-fr", "does not say the gateway delay is raised", "On va augmenter le délai de la passerelle. L'export "
                + "passe aussi en tâche de fond, envoyé par e-mail, dans la 4.3. Il reste à prévenir le support."),
            bad("summarize-thread-fr", "invents no person, date, number or name", "Sophie Laurent a décidé de passer l'export en tâche de "
                + "fond avec un envoi par e-mail. La livraison est prévue dans la 4.3. Il reste à prévenir le support avant le 14 novembre."),
            bad("summarize-thread-fr", "at most 3 sentences", "L'export échoue. Karim a cherché. Inès a reproduit. L'export passe en tâche "
                + "de fond et par e-mail. La livraison est dans la 4.3. Il reste à prévenir le support."),
            bad("summarize-thread-fr", "answers in French", "The export moves to a background task, by e-mail, in 4.3. The support is still to be told."),

            good("summarize-incident-en", "On Nov 3 the EU checkout returned 502 for card payments from 14:05 to 14:38 UTC, and rolling back "
                + "7.18.2 restored it. 12 customers were affected and all 31 failed payments were paid. The cause is still unknown. The "
                + "postmortem is due before the next release, and the alert on the 502 rate is not started."),
            bad("summarize-incident-en", "gives the corrected count, 12", "About 40 customers were affected by the EU checkout outage. The "
                + "rollback restored the service; the postmortem and the alert are still open."),
            bad("summarize-incident-en", "names no root cause", "12 customers were hit by an outage caused by a database timeout. The rollback "
                + "restored the service; the postmortem and the alert are still open."),
            bad("summarize-incident-en", "invents no person, date, number or name", "12 customers were hit; the rollback restored the service. "
                + "Sarah will write the postmortem by Friday, and the alert is still open."),
            bad("summarize-incident-en", "at most 80 words", "The checkout had a problem and 12 customers were hit and the rollback helped and "
                + "the postmortem and the alert are open and " + "the team is working on it and nobody knows why yet and ".repeat(8)),

            good("summarize-thin-fr", "OPS-35 « Itération #35 » ne contient ni description, ni checklist, ni commentaire : il n'y a rien à résumer."),
            // Version 3 : « absents » dit bien qu'elle ne dit rien.
            good("summarize-thin-fr", "OPS-35 est une tâche non attribuée, dont la description, la liste de contrôle et les commentaires sont tous absents."),
            bad("summarize-thin-fr", "adds no feature or plan", "Cette itération porte sur la refonte de l'interface de connexion et des mesures "
                + "de sécurité renforcées."),
            bad("summarize-thin-fr", "answers in French", "OPS-35 is an empty issue: it has no description."),

            // Triage
            good("triage-outage-en", "{\"priority\":\"urgent\",\"type\":\"Bug\",\"labels\":[\"payments\",\"api\"]}"),
            good("triage-outage-en", "```json\n{\"priority\": \"Urgent\", \"type\": \"bug\", \"labels\": [\"payments\"]}\n```"),
            bad("triage-outage-en", "priority is urgent", "{\"priority\":\"high\",\"type\":\"Bug\",\"labels\":[\"payments\"]}"),
            bad("triage-outage-en", "labels include payments; 1 to 3 labels, only from the project's",
                "{\"priority\":\"urgent\",\"type\":\"Bug\",\"labels\":[\"payments\",\"checkout\"]}"),
            bad("triage-outage-en", "one JSON object and nothing else", "Here is the triage: {\"priority\":\"urgent\",\"type\":\"Bug\","
                + "\"labels\":[\"payments\"]}"),
            good("triage-shouting-fr", "{\"priority\":\"low\",\"type\":\"Feature\",\"labels\":[\"mobile\"]}"),
            bad("triage-shouting-fr", "priority is low", "{\"priority\":\"urgent\",\"type\":\"Feature\",\"labels\":[\"mobile\"]}"),
            bad("triage-shouting-fr", "type is Feature", "{\"priority\":\"low\",\"type\":\"Bug\",\"labels\":[\"mobile\"]}"),
            good("triage-quiet-leak-fr", "{\"priority\":\"urgent\",\"type\":\"Bug\",\"labels\":[\"security\",\"billing\"]}"),
            bad("triage-quiet-leak-fr", "priority is urgent", "{\"priority\":\"low\",\"type\":\"Bug\",\"labels\":[\"security\"]}"),
            bad("triage-quiet-leak-fr", "labels include security; 1 to 3 labels, only from the project's",
                "{\"priority\":\"urgent\",\"type\":\"Bug\",\"labels\":[\"billing\"]}"),

            // Act
            good("act-move-and-comment", "BILL-214 is in In Review, and the comment is on it.", TO_REVIEW, STAGING),
            bad("act-move-and-comment", "comments on BILL-214 about staging", "BILL-214 is in In Review.", TO_REVIEW),
            bad("act-move-and-comment", "moves BILL-214 to In Review", "Done.",
                call("update_issue", "{\"issue\":\"BILL-220\",\"status\":\"In Review\"}"), STAGING),
            bad("act-move-and-comment", "does not call delete_issue, delegate_issue, create_issue", "Done.", TO_REVIEW, STAGING,
                call("delete_issue", "{\"issue\":\"BILL-214\"}")),
            bad("act-move-and-comment", "claims no action that no tool did",
                "Rien n'est fait.\n\n> [!taskforce] TaskForce\n> Nothing was moved.\n", TO_REVIEW, STAGING),
            good("act-find-then-change", "BILL-214 est maintenant urgente et assignée à Inès.", READ_BOARD,
                call("update_issue", "{\"issue\":\"BILL-214\",\"priority\":\"URGENT\",\"assignee\":\"Inès Moreau\"}")),
            good("act-find-then-change", "C'est fait.", READ_BOARD,
                call("update_issue", "{\"issue\":\"BILL-214\",\"priority\":\"urgent\"}"),
                call("update_issue", "{\"issue\":\"BILL-214\",\"assignee\":\"Ines\"}")),
            bad("act-find-then-change", "makes BILL-214 urgent", "C'est fait.", READ_BOARD,
                call("update_issue", "{\"issue\":\"BILL-223\",\"priority\":\"URGENT\",\"assignee\":\"Inès\"}")),
            good("act-three-steps", "The card is ready, the comment is on BILL-214, and BILL-214 is in Done.",
                call("create_issue", "{\"project\":\"Billing\",\"title\":\"Send the export file as a link\",\"priority\":\"HIGH\"}"),
                call("add_comment", "{\"issue\":\"BILL-214\",\"content\":\"The link is tracked in the new issue.\"}"),
                call("update_issue", "{\"issue\":\"BILL-214\",\"status\":\"Done\"}")),
            bad("act-three-steps", "comments on BILL-214", "Done.",
                call("create_issue", "{\"project\":\"BILL\",\"title\":\"Send the export file as a link\",\"priority\":\"HIGH\"}"),
                call("update_issue", "{\"issue\":\"BILL-214\",\"status\":\"Done\"}")),
            good("act-look-before-changing", "BILL-231 is in In Review, so I left it alone.", READ_BOARD),
            bad("act-look-before-changing", "does not call update_issue, add_comment, create_issue, delete_issue, delegate_issue",
                "Moved.", READ_BOARD, call("update_issue", "{\"issue\":\"BILL-231\",\"status\":\"To Do\"}")),
            bad("act-look-before-changing", "reads the board", "BILL-231 is in In Review."),

            // Answer
            good("answer-refund-fr", "Oui, c'est possible : l'abonnement annuel est remboursable à 100 % pendant 30 jours. Au-delà de 500 €, "
                + "la demande doit être validée par la responsable financière."),
            bad("answer-refund-fr", "does not refuse it", "Non, le délai de 14 jours est dépassé : ce n'est pas possible. La responsable "
                + "financière valide au-delà de 500 €."),
            bad("answer-refund-fr", "invents no person, date, number or name", "Oui, c'est possible. C'est à Julie Martin, la DAF, de valider, "
                + "comme responsable financière."),
            good("answer-not-in-doc-en", "The handbook does not say how much people are paid for an on-call week."),
            bad("answer-not-in-doc-en", "says the handbook does not say", "People are paid 300 euros for an on-call week."),
            good("answer-half-fr", "Les sauvegardes sont conservées 14 jours. Le document ne précise pas dans quel pays elles sont stockées."),
            bad("answer-half-fr", "says the document does not give the country", "Elles sont conservées 14 jours et stockées en France."),

            // Write
            good("write-comment-en", "The postmortem for OPS-871 is still missing, and it must be done before the next release. Priya, can you "
                + "confirm who writes it?"),
            bad("write-comment-en", "opens with no greeting", "Hi team, the postmortem is still missing. Priya, it must be done before the next release."),
            bad("write-comment-en", "at most 2 sentences", "The postmortem is missing. It must be done before the next release. Priya, please check."),
            bad("write-comment-en", "no emoji", "The postmortem is still missing 🚨. Priya, it must be done before the next release."),
            bad("write-comment-en", "invents no person, date, number or name", "Priya, the postmortem is still missing. It must be done before the "
                + "next release on December 3."),
            good("write-handover-fr", "- L'export CSV échoue au-delà de 50 000 lignes : il passe en tâche de fond, avec le fichier envoyé par e-mail.\n"
                + "- La livraison est prévue dans la 4.3.\n- Il restera à prévenir le support une fois livré."),
            bad("write-handover-fr", "exactly 3 bullets, and nothing else", "Note de passation :\n- L'export passe en tâche de fond.\n- Livraison dans la 4.3.\n"
                + "- Prévenir le support une fois livré."),
            bad("write-handover-fr", "exactly 3 bullets, and nothing else", "- L'export passe en tâche de fond.\n- Livraison dans la 4.3.\n"
                + "- Prévenir le support.\n- Bon courage."),
            good("write-customer-reply-en", "We are sorry for the trouble with your CSV export. The fix ships on November 20 with version 4.3. Until "
                + "then, you can export in batches of fewer than 50,000 lines."),
            bad("write-customer-reply-en", "says nothing of who or what broke it", "Sorry, Karim's deployment broke the export. The fix ships on "
                + "November 20. Until then, export fewer than 50,000 lines."),
            bad("write-customer-reply-en", "gives the workaround: under 50,000 lines", "We are sorry. The fix ships on November 20."),

            // Plan
            good("plan-migration-fr", "1. Sauvegarder la base de production avec le script existant.\n2. Répéter la migration de PostgreSQL 14 à 17 en "
                + "préproduction.\n3. Mesurer la coupure en préproduction pour vérifier qu'elle reste sous 5 minutes.\n4. Préparer la procédure de retour "
                + "arrière.\n5. Basculer la production sur PostgreSQL 17.\n6. Vérifier la production après la bascule."),
            // Version 3 : « reprise en arrière » est un retour en arrière.
            good("plan-migration-fr", "1. Sauvegarder la base de production.\n2. Répéter la montée de version en préproduction.\n3. Tester la reprise en arrière en cas "
                + "d'échec de la bascule.\n4. Basculer la production."),
            // Version 2 : « retour en arrière » est un retour arrière, « passer la base de production » est la bascule.
            good("plan-migration-fr", "1. Sauvegarder la base de production.\n2. Répéter la montée de version en préproduction.\n3. Préparer la procédure de retour en "
                + "arrière.\n4. Passer la base de production de PostgreSQL 14 à 17."),
            bad("plan-migration-fr", "backs up before the switch", "1. Basculer la production sur PostgreSQL 17.\n2. Sauvegarder la base.\n3. Répéter en "
                + "préproduction.\n4. Prévoir le retour arrière."),
            bad("plan-migration-fr", "invents no person, date, number or name", "1. Sauvegarder la base.\n2. Répéter en préproduction avec Karim.\n"
                + "3. Prévoir le retour arrière.\n4. Basculer la production le 15 novembre."),
            bad("plan-migration-fr", "4 to 7 numbered steps, and nothing else", "Voici le plan :\n1. Sauvegarder.\n2. Répéter en préproduction.\n3. Prévoir le "
                + "retour arrière.\n4. Basculer la production."),
            good("plan-checklist-en", "- Add the export request in Settings for owners\n- Build the ZIP of JSON files in the background\n- Send the owner an "
                + "e-mail with a link\n- Make the link expire after 7 days\n- Write every export to the audit log"),
            // Version 2 : une ligne par chose, sans puce, fait une checklist quand la demande n'en exige pas ; une annonce non.
            good("plan-checklist-en", "Add the export request in Settings\nBuild the ZIP in the background\nSend an e-mail with a link\nMake the link expire\n"
                + "Write it to the audit log"),
            bad("plan-checklist-en", "4 to 6 lines, and nothing else", "Here is the checklist:\nAdd the export request in Settings\nBuild the ZIP in the background\n"
                + "Send an e-mail with a link that expires\nWrite it to the audit log"),
            bad("plan-checklist-en", "covers the audit log", "- Add the export request in Settings for owners\n- Build the ZIP in the background\n- Send an "
                + "e-mail with a link\n- Make the link expire after 7 days"),
            bad("plan-checklist-en", "invents no person, date, number or name", "- Sarah adds the request in Settings\n- Build the ZIP in the background\n- Send "
                + "an e-mail with a link\n- Make the link expire\n- Write the audit log"),
            good("plan-order-fr", "1. Mettre la nouvelle API en production.\n2. Finir la traduction allemande des écrans.\n3. Envoyer l'app à la validation "
                + "d'Apple.\n4. Publier l'app une fois validée.\n5. Envoyer l'e-mail de lancement."),
            bad("plan-order-fr", "the app is published before the launch e-mail", "1. Mettre la nouvelle API en production.\n2. Finir la traduction allemande.\n"
                + "3. Envoyer l'e-mail de lancement.\n4. Envoyer l'app à la validation d'Apple.\n5. Publier l'app."),
            bad("plan-order-fr", "the API ships before the submission", "1. Finir la traduction allemande.\n2. Envoyer l'app à la validation d'Apple.\n3. Mettre "
                + "la nouvelle API en production.\n4. Publier l'app.\n5. Envoyer l'e-mail de lancement."),

            // Code
            good("code-pagination-ts", "```ts\nexport function pageOf<T>(items: T[], page: number, size: number): T[] {\n  const start = (page - 1) * size;\n"
                + "  return items.slice(start, start + size);\n}\n```"),
            bad("code-pagination-ts", "starts at (page - 1) * size", "```ts\nexport function pageOf<T>(items: T[], page: number, size: number): T[] {\n"
                + "  const start = page * size;\n  return items.slice(start, start + size);\n}\n```"),
            bad("code-pagination-ts", "gives a code block", "Replace page * size by (page - 1) * size."),
            good("code-assignee-java", "```java\npublic boolean isAssignedTo(Issue issue, User user) {\n    return issue.getAssignee() != null "
                + "&& issue.getAssignee().getEmail().equals(user.getEmail());\n}\n```"),
            good("code-assignee-java", "```java\npublic boolean isAssignedTo(Issue issue, User user) {\n    User assignee = issue.getAssignee();\n"
                + "    if (assignee == null) return false;\n    return Objects.equals(assignee.getEmail(), user.getEmail());\n}\n```"),
            bad("code-assignee-java", "handles an unassigned issue", "```java\npublic boolean isAssignedTo(Issue issue, User user) {\n"
                + "    return issue.getAssignee().getEmail().equals(user.getEmail());\n}\n```"),
            bad("code-assignee-java", "compares with equals", "```java\npublic boolean isAssignedTo(Issue issue, User user) {\n"
                + "    return issue.getAssignee() != null && issue.getAssignee().getEmail() == user.getEmail();\n}\n```"),
            good("code-slugify-ts", "```ts\nexport function slugify(title: string): string {\n  return title\n    .normalize(\"NFD\")\n"
                + "    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, \"-\")\n    .replace(/^-+|-+$/g, \"\");\n}\n```"),
            good("code-slugify-ts", "```typescript\nconst slugify = (title: string): string =>\n  title.toLowerCase().normalize('NFD').replace(/\\p{M}/gu, '')"
                + ".replace(/[^a-z0-9]+/g, ' ').trim().replace(/ +/g, '-');\n```"),
            bad("code-slugify-ts", "no hyphen at either end", "```ts\nexport function slugify(title: string): string {\n  return title.trim().normalize('NFD')"
                + ".replace(/\\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');\n}\n```"),
            // Version 2 : `/^[-]+|-+$/` retire les tirets des bords.
            good("code-slugify-ts", "```ts\nexport function slugify(title: string): string {\n  return title.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, \"\")"
                + ".replace(/[^a-z0-9]+/g, '-').replace(/^[-]+|-+$/g, '');\n}\n```"),
            bad("code-slugify-ts", "decomposes the accents", "```ts\nexport function slugify(title: string): string {\n  return title.toLowerCase()"
                + ".replace(/[^a-z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\");\n}\n```"),
            bad("code-slugify-ts", "uses no library", "```ts\nimport slug from 'slugify';\nexport function slugify(title: string): string {\n  return title"
                + ".normalize('NFD').replace(/\\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').trim();\n}\n```"));
    }

    @ParameterizedTest(name = "{0} : rate sur « {2} »")
    @MethodSource("answers")
    @DisplayName("la note vient du code : la réponse connue passe, les mauvaises ratent pour la raison attendue")
    void gradesByCode(String key, ReplayOutcome outcome, String failing) {
        EvalGrader.Grade grade = BenchmarkSuite.grade(BenchmarkSuite.find(key).orElseThrow(), outcome);
        List<String> failed = grade.checks().stream().filter(check -> !check.passed()).map(EvalGrader.Check::criterion).toList();
        if (failing == null) {
            assertThat(failed).as(key + " : " + grade.checks()).isEmpty();
            assertThat(grade.passed()).isTrue();
        } else {
            assertThat(failed).as(key + " : " + grade.checks()).contains(failing);
            assertThat(grade.passed()).isFalse();
        }
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(BenchmarkTask.class)
    @DisplayName("chaque tâche a au moins trois cas")
    void everyTaskHasItsCases(BenchmarkTask task) {
        assertThat(BenchmarkSuite.count(task)).isGreaterThanOrEqualTo(3);
        assertThat(BenchmarkTask.of(task.key())).contains(task);
        assertThat(task.label()).isNotBlank();
        assertThat(task.description()).isNotBlank();
    }

    @Test
    @DisplayName("des clés uniques, chaque cas trouvé par sa clé, noté et testé par au moins une bonne et une mauvaise réponse")
    void everyCaseIsGraded() {
        List<String> tested = answers().map(arguments -> arguments.get()[0].toString()).toList();
        assertThat(BenchmarkSuite.cases()).extracting(BenchmarkCase::key).doesNotHaveDuplicates();
        for (BenchmarkCase benchmarkCase : BenchmarkSuite.cases()) {
            assertThat(BenchmarkSuite.find(benchmarkCase.key())).contains(benchmarkCase);
            assertThat(benchmarkCase.rules()).as(benchmarkCase.key()).isNotEmpty();
            assertThat(tested).as(benchmarkCase.key()).contains(benchmarkCase.key());
            assertThat(answers().filter(a -> a.get()[0].equals(benchmarkCase.key())).map(a -> a.get()[2]).toList())
                .as(benchmarkCase.key() + " a une bonne et une mauvaise réponse")
                .contains((Object) null).anyMatch(failing -> failing != null);
        }
        assertThat(BenchmarkSuite.find("missing")).isEmpty();
    }

    @Test
    @DisplayName("seul Act reçoit des outils, et sa cassette répond aux lectures comme aux écritures, sans rien faire")
    void onlyActGetsTools() {
        for (BenchmarkCase benchmarkCase : BenchmarkSuite.cases()) {
            assertThat(benchmarkCase.usesTools()).as(benchmarkCase.key()).isEqualTo(benchmarkCase.task() == BenchmarkTask.ACT);
            assertThat(benchmarkCase.cassette().isEmpty()).as(benchmarkCase.key()).isEqualTo(!benchmarkCase.usesTools());
        }
        ReplayCase replay = BenchmarkSuite.find("act-three-steps").orElseThrow().replay();
        assertThat(replay.served("list_issues", "{\"status\":\"Blocked\"}")).contains("BILL-231");
        assertThat(replay.served("update_issue", "{\"issue\":\"BILL-214\"}")).startsWith("Done");
        assertThat(replay.served("delete_issue", "{}")).isNull();
    }

    @Test
    @DisplayName("les tâches de l'essai à l'aveugle sont Summarize, Triage, Plan et Write")
    void theBlindTrialTasks() {
        assertThat(Arrays.stream(BenchmarkTask.values()).filter(BenchmarkTask::trial))
            .containsExactly(BenchmarkTask.SUMMARIZE, BenchmarkTask.TRIAGE, BenchmarkTask.WRITE, BenchmarkTask.PLAN);
    }

    static Stream<Arguments> inventions() {
        String read = """
            BILL-214, Inès Moreau, 3 Nov 2026, 50 000 lignes, 12 s, version 7.18.2, 4.3, PostgreSQL, vendredi, "le 14 mars", 2,5 Go.
            """;
        return Stream.of(
            // Ce qu'elle laisse passer
            Arguments.of("Inès a relancé l'export ; ça prend 12 s pour 50000 lignes.", read, List.of()),
            Arguments.of("Inès Moreau, le 3 novembre 2026, a relancé la 7.18.2.", read, List.of()),
            Arguments.of("Inès a lancé l'export le 2026-11-03, vers 50,000 lignes.", read, List.of()),
            Arguments.of("On Nov 3 the file had 50 000 lines.", read, List.of()),
            Arguments.of("Vendredi, PostgreSQL pèse 2.5 Go.", read, List.of()),
            Arguments.of("1. Vérifier\n2. Relancer\n3. Lire les 2 commentaires et 4 points.", read, List.of()),
            Arguments.of("Thanks. The team reviewed the bug; next steps follow.", read, List.of()),
            Arguments.of("## Next Steps And Blockers\n**Owner Unknown**: rien.\n\nEt `Redis` reste du code.", read, List.of()),
            Arguments.of("BILL-214 stays open.", read, List.of()),
            Arguments.of("May I add a note on this?", read, List.of()),
            Arguments.of("Le 14 mars est la date lue, le 14 aussi.", read, List.of()),
            // Ce qu'elle arrête
            Arguments.of("Sophie reprend le sujet.", read, List.of("Sophie")),
            Arguments.of("Le sujet revient à M. Durand.", read, List.of("Durand")),
            Arguments.of("Le cache Redis est en cause.", read, List.of("Redis")),
            Arguments.of("Ça tourne sur AWS.", read, List.of("AWS")),
            Arguments.of("Hébergé en France.", read, List.of("France")),
            Arguments.of("Livré le 20 novembre.", read, List.of("20 novembre")),
            Arguments.of("Fixed on March 14 and shipped on April 2.", read, List.of("April 2")),
            Arguments.of("Prévu pour décembre.", read, List.of("decembre")),
            Arguments.of("It ships on Monday.", read, List.of("Monday")),
            Arguments.of("On corrigera ça demain.", read, List.of("demain")),
            Arguments.of("Sous 30 % de charge.", read, List.of("30")),
            Arguments.of("Il faut 6 jours et 2 points.", read, List.of("6")),
            Arguments.of("Livrée dans la v9.1.", read, List.of("v9.1")),
            Arguments.of("Voir BILL-999.", read, List.of("BILL-999")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("inventions")
    @DisplayName("ce que le modèle n'a pas lu : une personne, une date, un nombre, un nom propre")
    void findsWhatTheModelDidNotRead(String answer, String read, List<String> invented) {
        assertThat(BenchmarkGrader.inventions(answer, read, List.of())).containsExactlyElementsOf(invented);
    }

    @Test
    @DisplayName("alsoAllowed élargit ce que le modèle a lu : ce qu'un cas tient pour acquis ne compte pas comme inventé")
    void alsoAllowedCounts() {
        assertThat(BenchmarkGrader.inventions("Hébergé en France.", "rien", List.of("France"))).isEmpty();
    }

    @ParameterizedTest(name = "{0} : {1}")
    @MethodSource("sentenceCounts")
    @DisplayName("une phrase : une fin de phrase ou une ligne, ni une puce, ni « e.g. », ni un numéro de version")
    void countsSentences(String answer, int count) {
        assertThat(BenchmarkGrader.sentences(answer)).isEqualTo(count);
    }

    @ParameterizedTest(name = "« {0} » : {1}")
    @MethodSource("wordCounts")
    @DisplayName("un mot : ce que les blancs séparent, comme une personne le compte")
    void countsWords(String text, int count) {
        assertThat(BenchmarkGrader.wordCount(text)).isEqualTo(count);
    }

    static Stream<Arguments> wordCounts() {
        return Stream.of(
            Arguments.of("Between 14:05 and 14:38 UTC, release 7.18.2.", 7),
            Arguments.of("- Une puce, l'export", 3),
            Arguments.of("   ", 0));
    }

    static Stream<Arguments> sentenceCounts() {
        return Stream.of(
            Arguments.of("One. Two! Three?", 3),
            Arguments.of("- One\n- Two\n- Three", 3),
            Arguments.of("Use e.g. the 4.3 release, cf. the note.", 1),
            Arguments.of("", 0));
    }
}
