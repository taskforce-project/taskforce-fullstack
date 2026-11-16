package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.taskforce.tf_api.core.process.ProcessValidator.Context;
import com.taskforce.tf_api.core.process.ProcessValidator.Problem;

/**
 * Le vérificateur (ADR-027, point 6), un cas par refus : chacun part du processus d'E20, qui passe, y change une chose,
 * et attend le refus de cette chose, en phrase. Les fautes qu'ADR-027 nomme d'abord : une étape sans personne, une
 * étape d'agent sans zone ou sans règles, une étape verrouillée absente, un point de pause absent, une décision sans
 * condition jugée par du code, une attente qui ne dit pas ce qu'elle attend, une étape qui ne mène à aucune fin.
 */
@DisplayName("Le vérificateur des processus : un cas par refus")
public class ProcessValidatorTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    // ------------------------------------------------------------------------------------------------- outils

    public static ObjectNode e20() {
        return JSON.valueToTree(ProcessFixtures.integrateAModule());
    }

    public static ProcessModel model(ObjectNode root) {
        try {
            return JSON.treeToValue(root, ProcessModel.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static List<Problem> check(ObjectNode root) {
        return ProcessValidator.check(model(root), Context.NONE);
    }

    public static ArrayNode steps(ObjectNode container) {
        if (!(container.get("steps") instanceof ArrayNode)) {
            container.putArray("steps");
        }
        return (ArrayNode) container.get("steps");
    }

    public static ArrayNode flows(ObjectNode container) {
        if (!(container.get("flows") instanceof ArrayNode)) {
            container.putArray("flows");
        }
        return (ArrayNode) container.get("flows");
    }

    /** L'étape d'identifiant {@code id}, à tous les niveaux. */
    public static ObjectNode step(ObjectNode container, String id) {
        if (container.get("steps") instanceof ArrayNode array) {
            for (JsonNode s : array) {
                if (id.equals(s.path("id").asText())) {
                    return (ObjectNode) s;
                }
                ObjectNode inner = step((ObjectNode) s, id);
                if (inner != null) {
                    return inner;
                }
            }
        }
        return null;
    }

    /** Le chemin d'identifiant {@code id}, à tous les niveaux. */
    public static ObjectNode flow(ObjectNode container, String id) {
        if (container.get("flows") instanceof ArrayNode array) {
            for (JsonNode f : array) {
                if (id.equals(f.path("id").asText())) {
                    return (ObjectNode) f;
                }
            }
        }
        if (container.get("steps") instanceof ArrayNode array) {
            for (JsonNode s : array) {
                ObjectNode inner = flow((ObjectNode) s, id);
                if (inner != null) {
                    return inner;
                }
            }
        }
        return null;
    }

    public static void remove(ArrayNode array, String id) {
        for (int i = 0; i < array.size(); i++) {
            if (id.equals(array.get(i).path("id").asText())) {
                array.remove(i);
                return;
            }
        }
        throw new IllegalArgumentException("not there: " + id);
    }

    static ObjectNode newFlow(String id, String from, String to) {
        return JSON.createObjectNode().put("id", id).put("from", from).put("to", to);
    }

    static ObjectNode human(String id, String name) {
        ObjectNode s = JSON.createObjectNode().put("id", id).put("type", "human").put("name", name)
            .put("answeredBy", "project-lead");
        s.putObject("human").put("who", "project-lead").put("question", "Is it fine?").put("kind", "approval")
            .put("meaning", "approval");
        return s;
    }

    /** Remplace dans la phase {@code stage} le chemin {@code from} → {@code to} par {@code from} → {@code via} → {@code to}. */
    static void insert(ObjectNode root, String stage, String flowId, ObjectNode via) {
        ObjectNode container = step(root, stage);
        ObjectNode flow = flow(container, flowId);
        String to = flow.path("to").asText();
        flow.put("to", via.path("id").asText());
        steps(container).add(via);
        flows(container).add(newFlow(via.path("id").asText() + "-next", via.path("id").asText(), to));
    }

    /** Une décision devant le point d'avant de livrer, dont le chemin « signée » va droit à la livraison. */
    static void signedBypass(ObjectNode root) {
        ObjectNode deliver = step(root, "deliver");
        steps(deliver).add(JSON.createObjectNode().put("id", "signed").put("type", "decision")
            .put("name", "Is the acceptance signed?").put("answeredBy", "project-lead"));
        flow(deliver, "deliver-start-before-delivery").put("to", "signed");
        ObjectNode straight = newFlow("signed-deliver-module", "signed", "deliver-module");
        straight.putObject("condition").put("text", "The acceptance is signed").put("step", "sign-acceptance")
            .put("outcome", "approved");
        flows(deliver).add(straight);
        flows(deliver).add(newFlow("signed-before-delivery", "signed", "before-delivery").put("otherwise", true));
    }

    /** Une échéance d'un jour sur l'étape {@code on} de la phase {@code stage}, qui mène à {@code to}. */
    static void deadline(ObjectNode root, String stage, String on, String to) {
        ObjectNode container = step(root, stage);
        steps(container).add(JSON.createObjectNode().put("id", on + "-late").put("type", "deadline")
            .put("name", "A day without an answer").put("attachedTo", on).put("duration", "P1D"));
        flows(container).add(newFlow(on + "-late-" + to, on + "-late", to));
    }

    static void assertRefused(List<Problem> problems, String code) {
        assertThat(problems).extracting(Problem::code).contains(code);
        for (Problem p : problems) {
            // Aucun tiret cadratin dans une phrase montrée : le caractère s'écrit ici en échappement.
            assertThat(p.message()).as(p.code()).isNotBlank().endsWith(".").doesNotContain("\u2014");
            if (!p.code().equals(p.code().toLowerCase(java.util.Locale.ROOT))) {
                // Un code en plusieurs mots (noOwner) ne s'écrit jamais dans la phrase qu'on montre.
                assertThat(p.message()).as(p.code()).doesNotContain(p.code());
            }
        }
    }

    // ------------------------------------------------------------------------------------------------- le processus d'E20

    @Test
    @DisplayName("le processus d'E20, tel qu'écrit, passe")
    void e20_passes() {
        assertThat(check(e20())).isEmpty();
    }

    // ------------------------------------------------------------------------------------------------- un cas par refus

    static Stream<Arguments> refusals() {
        return Stream.of(
            // Les fautes qu'ADR-027 nomme.
            refusal("noOwner", "une étape sans personne qui en réponde",
                r -> step(r, "write-scope").remove("answeredBy")),
            refusal("agentOutsideZone", "une étape d'agent hors de toute zone",
                r -> {
                    ObjectNode zone = step(r, "spec-zone");
                    zone.put("type", "agent").remove("steps");
                    zone.putObject("agent").put("provider", "cortex");
                }),
            refusal("agentWithoutRules", "une étape d'agent sans règles, ni les siennes ni celles de sa zone",
                r -> step(r, "spec-zone").remove("rules")),
            refusal("decisionWithoutCondition", "une décision qui ne juge que des mots",
                r -> {
                    ObjectNode c = (ObjectNode) flow(r, "go-ahead-specify").get("condition");
                    c.remove("step");
                    c.remove("outcome");
                }),
            refusal("decisionWithoutCondition", "une décision dont un chemin n'a aucune condition",
                r -> flow(r, "go-ahead-specify").remove("condition")),
            refusal("waitWithoutWhat", "une attente qui ne dit pas ce qu'elle attend",
                r -> step(r, "acceptance-report").remove("wait")),
            refusal("waitWithoutWhat", "une attente d'un document sans qui le fournit",
                r -> ((ObjectNode) step(r, "acceptance-report").get("wait")).remove("from")),
            refusal("waitWithoutWhat", "une attente d'un document sans ce qu'elle attend",
                r -> ((ObjectNode) step(r, "acceptance-report").get("wait")).remove("what")),
            refusal("waitWithoutWhat", "une attente d'une durée sans sa durée",
                r -> ((ObjectNode) step(r, "watch").get("wait")).remove("duration")),
            refusal("noEnd", "une étape qui ne mène à aucune fin",
                r -> remove(flows(step(r, "break-down")), "approve-breakdown-break-down-end")),
            refusal("pausePointMissing", "un point de pause absent",
                r -> {
                    ObjectNode deliver = step(r, "deliver");
                    remove(steps(deliver), "before-delivery");
                    remove(flows(deliver), "before-delivery-deliver-module");
                    flow(deliver, "deliver-start-before-delivery").put("to", "deliver-module");
                }),
            refusal("pausePointMisplaced", "une zone d'agent qui commence avant le point de pause d'avant les agents",
                r -> {
                    ObjectNode specify = step(r, "specify");
                    flow(specify, "specify-start-before-mission").put("to", "spec-zone");
                    flow(specify, "spec-zone-review-spec").put("to", "before-mission");
                    flow(specify, "before-mission-spec-zone").put("to", "review-spec");
                }),
            refusal("pausePointMisplaced", "le point d'avant d'appliquer avant tout travail d'agent",
                r -> {
                    ((ObjectNode) step(r, "before-mission").get("lock")).put("ref", "before-apply");
                    ((ObjectNode) step(r, "before-apply").get("lock")).put("ref", "before-mission");
                }),
            refusal("pausePointMisplaced", "le point d'avant de livrer avant celui d'avant d'appliquer",
                r -> {
                    ((ObjectNode) step(r, "before-apply").get("lock")).put("ref", "before-delivery");
                    ((ObjectNode) step(r, "before-delivery").get("lock")).put("ref", "before-apply");
                }),
            refusal("pausePointShape", "un point de pause qui n'est pas une liste de contrôle",
                r -> ((ObjectNode) step(r, "before-mission").get("human")).put("kind", "approval")),
            // Le point d'avant une mission vient avant chaque mission, pas seulement la première (la Présidence, L8).
            refusal("missionWithoutPausePoint", "une zone de construction sans son point d'avant une mission, après le "
                + "découpage comme au retour de la recette",
                r -> flow(r, "build-start-before-mission-build").put("to", "build-zone")),
            refusal("missionWithoutPausePoint", "une zone qui recommence après son échec sans repasser le point",
                r -> flow(r, "unblock-build-before-mission-build").put("to", "build-zone")),
            refusal("missionWithoutPausePoint", "une correction qui commence après l'échec des tests sans le point",
                r -> flow(r, "tests-failed-before-mission-fix").put("to", "fix-zone")),
            refusal("missionWithoutPausePoint", "une spécification refusée que l'agent reprend sans le point",
                r -> flow(r, "spec-approved-before-mission").put("to", "spec-zone")),
            // Un point de pause ne se contourne pas (R159, H1).
            refusal("pausePointDeadline", "une échéance d'un jour sur le point d'avant les agents, qui mène à leur zone",
                r -> deadline(r, "specify", "before-mission", "spec-zone")),
            refusal("pausePointDeadline", "une échéance d'un jour sur le point d'avant d'appliquer, qui mène plus loin",
                r -> deadline(r, "review", "before-apply", "review-end")),
            refusal("pausePointDeadline", "une échéance d'un jour sur le point d'avant de livrer, qui mène à la livraison",
                r -> deadline(r, "deliver", "before-delivery", "deliver-module")),
            refusal("pausePointMisplaced", "une décision devant le point d'avant de livrer, dont un chemin va droit à la "
                + "livraison", ProcessValidatorTest::signedBypass),
            // Une fin qui arrête tout livre aussi, sauf quand seules des décisions y mènent (R159, N2 et N4).
            refusal("pausePointMisplaced", "la fin livrée qui arrête tout, et une décision autour du point d'avant de "
                + "livrer", r -> {
                    step(r, "delivered").put("terminate", true);
                    signedBypass(r);
                }),
            refusal("pausePointMisplaced", "une nouvelle phase qui livre le module et finit sur une fin qui arrête tout",
                r -> {
                    ObjectNode ship = JSON.createObjectNode().put("id", "ship").put("type", "stage").put("name", "Ship");
                    steps(ship).add(JSON.createObjectNode().put("id", "ship-start").put("type", "start"));
                    steps(ship).add(human("ship-module", "Ship the module"));
                    steps(ship).add(JSON.createObjectNode().put("id", "ship-end").put("type", "end"));
                    flows(ship).add(newFlow("ship-start-ship-module", "ship-start", "ship-module"));
                    flows(ship).add(newFlow("ship-module-ship-end", "ship-module", "ship-end"));
                    steps(r).add(ship);
                    steps(r).add(JSON.createObjectNode().put("id", "shipped").put("type", "end")
                        .put("name", "Module shipped").put("terminate", true));
                    flow(r, "accepted-deliver").put("to", "ship");
                    flows(r).add(newFlow("ship-shipped", "ship", "shipped"));
                }),
            refusal("pausePointMisplaced", "une échéance de la livraison qui mène droit à la fin", r -> {
                steps(r).add(JSON.createObjectNode().put("id", "deliver-late").put("type", "deadline")
                    .put("name", "A week without delivery").put("attachedTo", "deliver").put("duration", "P7D"));
                flows(r).add(newFlow("deliver-late-delivered", "deliver-late", "delivered"));
            }),
            refusal("pausePointMisplaced", "un chemin d'échec de la revue qui mène à la recette sans le point d'avant "
                + "d'appliquer", r -> {
                    steps(r).add(JSON.createObjectNode().put("id", "review-failed").put("type", "failure")
                        .put("name", "The review fails").put("attachedTo", "review"));
                    flows(r).add(newFlow("review-failed-accept", "review-failed", "accept"));
                }),
            refusal("pausePointInParallel", "le point d'avant de livrer et la livraison côte à côte, en parallèle", r -> {
                ObjectNode deliver = step(r, "deliver");
                steps(deliver).add(JSON.createObjectNode().put("id", "deliver-split").put("type", "parallel"));
                steps(deliver).add(JSON.createObjectNode().put("id", "deliver-join").put("type", "parallel"));
                flow(deliver, "deliver-start-before-delivery").put("to", "deliver-split");
                flows(deliver).add(newFlow("deliver-split-before-delivery", "deliver-split", "before-delivery"));
                flows(deliver).add(newFlow("deliver-split-deliver-module", "deliver-split", "deliver-module"));
                flow(deliver, "before-delivery-deliver-module").put("to", "deliver-join");
                flow(deliver, "deliver-module-watch").put("from", "deliver-module").put("to", "deliver-join");
                flows(deliver).add(newFlow("deliver-join-watch", "deliver-join", "watch"));
            }),
            // Le processus.
            refusal("format", "un format inconnu", r -> r.put("format", "taskforce-process/9")),
            refusal("badKey", "une clé qui n'en est pas une", r -> r.put("key", "Integrate A Module")),
            refusal("noName", "un processus sans nom", r -> r.remove("name")),
            refusal("noName", "une étape sans nom", r -> step(r, "write-scope").remove("name")),
            refusal("tooLong", "un nom trop long", r -> step(r, "write-scope").put("name", "x".repeat(201))),
            // Les bornes du brouillon, tenues pour tout ce qui entre (R159, L6).
            refusal("tooLong", "le modèle d'un agent trop long",
                r -> ((ObjectNode) step(r, "draft-spec").get("agent")).put("model", "m".repeat(121))),
            refusal("tooLong", "ce qui verrouille une étape, trop long",
                r -> step(r, "write-scope").putObject("lock").put("by", "author").put("ref", "r".repeat(81))),
            refusal("tooLong", "un choix trop long", r -> {
                ObjectNode field = (ObjectNode) step(r, "write-scope").get("human").get("fields").get(0);
                field.put("type", "choice").putArray("choices").add("Soon").add("c".repeat(301));
            }),
            refusal("tooLong", "le nom d'un chemin trop long", r -> flow(r, "requested-frame").put("name", "n".repeat(201))),
            refusal("tooMany", "vingt et une règles", r -> {
                ArrayNode rules = step(r, "spec-zone").putArray("rules");
                for (int i = 0; i < 21; i++) {
                    rules.addObject().put("ref", "rule-" + i);
                }
            }),
            refusal("tooMany", "onze documents", r -> {
                ArrayNode documents = step(r, "write-scope").putArray("documents");
                for (int i = 0; i < 11; i++) {
                    documents.add("Document " + i);
                }
            }),
            refusal("tooMany", "treize champs", r -> {
                ArrayNode fields = ((ObjectNode) step(r, "write-scope").get("human")).putArray("fields");
                for (int i = 0; i < 13; i++) {
                    fields.addObject().put("id", "field-" + i).put("label", "Field " + i).put("type", "text");
                }
            }),
            refusal("tooMany", "treize choix", r -> {
                ObjectNode field = (ObjectNode) step(r, "write-scope").get("human").get("fields").get(0);
                ArrayNode choices = field.put("type", "choice").putArray("choices");
                for (int i = 0; i < 13; i++) {
                    choices.add("Choice " + i);
                }
            }),
            refusal("tooMany", "vingt et un outils", r -> {
                ArrayNode tools = ((ObjectNode) step(r, "draft-spec").get("agent")).putArray("tools");
                for (int i = 0; i < 21; i++) {
                    tools.add("tool-" + i);
                }
            }),
            refusal("badId", "un identifiant qui n'en est pas un", r -> {
                step(r, "write-scope").put("id", "1 write");
                flow(r, "frame-start-write-scope").put("to", "1 write");
                flow(r, "write-scope-approve-scope").put("from", "1 write");
            }),
            refusal("duplicateId", "deux fois le même identifiant", r -> step(r, "write-code").put("id", "write-tests")),
            refusal("duplicateId", "une étape qui prend la clé du processus comme identifiant", r -> {
                step(r, "write-scope").put("id", "integrate-a-module");
                flow(r, "frame-start-write-scope").put("to", "integrate-a-module");
                flow(r, "write-scope-approve-scope").put("from", "integrate-a-module");
            }),
            refusal("duplicateId", "un chemin qui prend la clé du processus comme identifiant",
                r -> flow(r, "requested-frame").put("id", "integrate-a-module")),
            refusal("unknownType", "un type d'étape inconnu", r -> step(r, "write-scope").put("type", "inclusive")),
            refusal("notAContainer", "une tâche humaine qui tient des étapes",
                r -> steps(step(r, "write-scope")).add(human("inside", "Inside"))),
            refusal("notAContainer", "une étape d'agent, dans sa zone, qui tient des étapes",
                r -> steps(step(r, "split-into-issues")).add(human("inside", "Inside"))),
            // La structure.
            refusal("startCount", "deux débuts dans une phase",
                r -> steps(step(r, "frame")).add(JSON.createObjectNode().put("id", "frame-start-2").put("type", "start"))),
            refusal("endMissing", "une phase sans fin", r -> {
                ObjectNode frame = step(r, "frame");
                remove(steps(frame), "frame-end");
                remove(flows(frame), "approve-scope-frame-end");
            }),
            refusal("stepOutsideStage", "une étape hors de toute phase", r -> {
                steps(r).add(human("loose", "Loose task"));
                flow(r, "requested-frame").put("to", "loose");
                flows(r).add(newFlow("loose-frame", "loose", "frame"));
            }),
            refusal("stageInStage", "une phase dans une phase", r -> {
                ObjectNode inner = JSON.createObjectNode().put("id", "inner").put("type", "stage").put("name", "Inner");
                steps(inner).add(JSON.createObjectNode().put("id", "inner-start").put("type", "start"));
                steps(inner).add(JSON.createObjectNode().put("id", "inner-end").put("type", "end"));
                flows(inner).add(newFlow("inner-flow", "inner-start", "inner-end"));
                insert(r, "frame", "write-scope-approve-scope", inner);
            }),
            refusal("terminateInStage", "tout arrêter depuis une phase", r -> step(r, "frame-end").put("terminate", true)),
            refusal("zoneEmpty", "une zone d'agent vide", r -> step(r, "spec-zone").remove("steps")),
            refusal("zoneContent", "une zone d'agent qui tient une tâche humaine",
                r -> steps(step(r, "spec-zone")).add(human("in-zone", "In the zone"))),
            refusal("zoneFlows", "une zone d'agent avec des chemins", r -> {
                ObjectNode zone = step(r, "build-zone");
                flows(zone).add(newFlow("code-then-tests", "write-code", "write-tests"));
            }),
            refusal("flowAcross", "un chemin d'une phase à une autre",
                r -> flow(r, "approve-scope-frame-end").put("to", "review-spec")),
            refusal("flowUnknown", "un chemin vers une étape absente",
                r -> flow(r, "approve-scope-frame-end").put("to", "nowhere")),
            refusal("conditionOutsideDecision", "une condition hors d'une décision", r -> {
                ObjectNode f = flow(r, "frame-start-write-scope");
                f.putObject("condition").put("text", "Always").put("step", "approve-scope").put("outcome", "approved");
            }),
            refusal("startIncoming", "un chemin qui revient au début",
                r -> flows(step(r, "frame")).add(newFlow("back-to-start", "approve-scope", "frame-start"))),
            refusal("endOutgoing", "un chemin qui part d'une fin",
                r -> flows(step(r, "frame")).add(newFlow("after-end", "frame-end", "write-scope"))),
            refusal("boundaryIncoming", "un chemin qui entre dans une échéance",
                r -> flows(step(r, "build")).add(newFlow("into-deadline", "unblock-build", "build-late"))),
            refusal("gatewayShape", "un partage en parallèle d'un seul chemin", r -> {
                ObjectNode accept = step(r, "accept");
                remove(flows(accept), "accept-split-notes-zone");
                remove(flows(accept), "notes-zone-accept-join");
                remove(steps(accept), "notes-zone");
            }),
            refusal("gatewayShape", "une décision d'un seul chemin",
                r -> remove(flows(step(r, "specify")), "spec-approved-before-mission")),
            refusal("severalPaths", "une tâche à deux sorties",
                r -> flows(step(r, "frame")).add(newFlow("second-way", "write-scope", "frame-end"))),
            refusal("decisionWithoutDefault", "une décision sans chemin pour tous les autres cas",
                r -> flow(r, "spec-approved-before-mission").remove("otherwise")),
            refusal("severalDefaults", "une décision à deux chemins pour tous les autres cas", r -> {
                ObjectNode f = flow(r, "spec-approved-specify-end");
                f.remove("condition");
                f.put("otherwise", true);
            }),
            refusal("otherwiseWithCondition", "le chemin de tous les autres cas avec sa condition", r -> {
                ObjectNode f = flow(r, "spec-approved-before-mission");
                f.putObject("condition").put("text", "Refused").put("step", "review-spec").put("outcome", "refused");
            }),
            refusal("conditionWords", "une condition compilée sans ses mots",
                r -> ((ObjectNode) flow(r, "go-ahead-specify").get("condition")).remove("text")),
            refusal("conditionStep", "une condition qui juge une étape absente",
                r -> ((ObjectNode) flow(r, "go-ahead-specify").get("condition")).put("step", "nowhere")),
            refusal("conditionStep", "une condition qui juge une étape qu'on ne juge pas",
                r -> ((ObjectNode) flow(r, "go-ahead-specify").get("condition")).put("step", "write-scope")),
            refusal("conditionStep", "une condition qui attend une issue impossible",
                r -> ((ObjectNode) flow(r, "go-ahead-specify").get("condition")).put("outcome", "succeeded")),
            refusal("conditionStep", "une condition qui juge une étape d'après",
                r -> ((ObjectNode) flow(r, "go-ahead-specify").get("condition")).put("step", "sign-acceptance")),
            refusal("conditionsOverlap", "deux chemins qui prennent la même issue", r -> {
                ObjectNode extra = newFlow("spec-approved-again", "spec-approved", "specify-end");
                extra.putObject("condition").put("text", "Approved again").put("step", "review-spec")
                    .put("outcome", "approved");
                flows(step(r, "specify")).add(extra);
            }),
            // Un processus finit toujours (R159, M4).
            refusal("joinShape", "deux chemins d'une décision qui se retrouvent à une jonction en parallèle", r -> {
                ObjectNode frame = step(r, "frame");
                steps(frame).add(JSON.createObjectNode().put("id", "scope-ok").put("type", "decision")
                    .put("name", "Is the scope fine?").put("answeredBy", "project-lead"));
                steps(frame).add(JSON.createObjectNode().put("id", "frame-join").put("type", "parallel"));
                flow(frame, "approve-scope-frame-end").put("to", "scope-ok");
                ObjectNode yes = newFlow("scope-ok-yes", "scope-ok", "frame-join");
                yes.putObject("condition").put("text", "The scope is approved").put("step", "approve-scope")
                    .put("outcome", "approved");
                flows(frame).add(yes);
                flows(frame).add(newFlow("scope-ok-no", "scope-ok", "frame-join").put("otherwise", true));
                flows(frame).add(newFlow("frame-join-end", "frame-join", "frame-end"));
            }),
            refusal("joinShape", "deux chemins en parallèle qui se croisent avant toute jonction", r -> {
                ObjectNode deliver = step(r, "deliver");
                steps(deliver).add(JSON.createObjectNode().put("id", "release-split").put("type", "parallel"));
                steps(deliver).add(human("tell-support", "Tell the support team"));
                steps(deliver).add(human("tell-users", "Tell the users"));
                flow(deliver, "before-delivery-deliver-module").put("to", "release-split");
                flows(deliver).add(newFlow("release-split-support", "release-split", "tell-support"));
                flows(deliver).add(newFlow("release-split-users", "release-split", "tell-users"));
                flows(deliver).add(newFlow("support-deliver-module", "tell-support", "deliver-module"));
                flows(deliver).add(newFlow("users-deliver-module", "tell-users", "deliver-module"));
            }),
            refusal("joinShape", "un chemin en parallèle qui peut finir avant sa jonction", r -> {
                ObjectNode accept = step(r, "accept");
                steps(accept).add(JSON.createObjectNode().put("id", "report-ok").put("type", "decision")
                    .put("name", "Is the report usable?").put("answeredBy", "project-lead"));
                flow(accept, "acceptance-report-accept-join").put("to", "report-ok");
                ObjectNode yes = newFlow("report-ok-join", "report-ok", "accept-join");
                yes.putObject("condition").put("text", "The review was approved").put("step", "review-code")
                    .put("outcome", "approved");
                flows(accept).add(yes);
                flows(accept).add(newFlow("report-ok-end", "report-ok", "accept-end").put("otherwise", true));
            }),
            refusal("splitInLoop", "un partage en parallèle dans une boucle", r -> {
                ObjectNode accept = step(r, "accept");
                steps(accept).add(human("prepare-acceptance", "Prepare the acceptance"));
                flow(accept, "before-mission-notes-accept-split").put("to", "prepare-acceptance");
                flows(accept).add(newFlow("prepare-acceptance-accept-split", "prepare-acceptance", "accept-split"));
                steps(accept).add(JSON.createObjectNode().put("id", "signed-off").put("type", "decision")
                    .put("name", "Is it signed off?").put("answeredBy", "project-lead"));
                flow(accept, "sign-acceptance-accept-end").put("to", "signed-off");
                ObjectNode yes = newFlow("signed-off-end", "signed-off", "accept-end");
                yes.putObject("condition").put("text", "The acceptance is signed").put("step", "sign-acceptance")
                    .put("outcome", "approved");
                flows(accept).add(yes);
                flows(accept).add(newFlow("signed-off-again", "signed-off", "prepare-acceptance").put("otherwise", true));
            }),
            refusal("decisionLoop", "une décision dont un chemin revient à elle-même",
                r -> flow(r, "spec-approved-before-mission").put("to", "spec-approved")),
            refusal("decisionLoop", "une décision qui revient à elle-même sans que l'étape qu'elle juge tourne de nouveau",
                r -> {
                    ObjectNode specify = step(r, "specify");
                    steps(specify).add(human("explain", "Explain the refusal"));
                    flow(specify, "spec-approved-before-mission").put("to", "explain");
                    flows(specify).add(newFlow("explain-spec-approved", "explain", "spec-approved"));
                }),
            refusal("boundaryTarget", "une échéance sur un début", r -> step(r, "build-late").put("attachedTo", "build-start")),
            refusal("boundaryTarget", "un chemin d'échec sur une tâche humaine",
                r -> step(r, "build-failed").put("attachedTo", "unblock-build")),
            refusal("badDuration", "une durée qui n'en est pas une", r -> step(r, "build-late").put("duration", "two days")),
            refusal("badDuration", "une échéance sans durée", r -> step(r, "build-late").remove("duration")),
            refusal("badDuration", "une échéance en semaines, que XML Schema n'écrit pas",
                r -> step(r, "build-late").put("duration", "P1W")),
            refusal("badDuration", "un délai d'agent en semaines",
                r -> ((ObjectNode) step(r, "draft-spec").get("agent")).put("timeout", "P1W")),
            refusal("badDuration", "une durée en minuscules", r -> ((ObjectNode) step(r, "watch").get("wait"))
                .put("duration", "p7d")),
            refusal("unreachable", "une étape qu'on n'atteint jamais", r -> {
                steps(step(r, "frame")).add(human("orphan", "Orphan task"));
                flows(step(r, "frame")).add(newFlow("orphan-frame-end", "orphan", "frame-end"));
            }),
            // Les réglages.
            refusal("badPerson", "une personne que TaskForce ne connaît pas",
                r -> step(r, "write-scope").put("answeredBy", "the boss")),
            refusal("badPerson", "une personne d'un numéro qu'aucun identifiant ne tient",
                r -> step(r, "write-scope").put("answeredBy", "person:9223372036854775808")),
            refusal("unknownRule", "une règle nommée par un identifiant illisible",
                r -> ((ObjectNode) step(r, "spec-zone").get("rules").get(0)).put("ref", "Bad Rule")),
            refusal("unknownRule", "une version des règles qui n'existe pas",
                r -> ((ObjectNode) step(r, "spec-zone").get("rules").get(0)).put("version", 0)),
            refusal("badIssue", "une issue qui n'en est pas une", r -> step(r, "write-scope").put("issue", "not an issue")),
            refusal("lockShape", "un verrou d'une source inconnue",
                r -> ((ObjectNode) step(r, "before-mission").get("lock")).put("by", "admin")),
            refusal("lockShape", "un point de pause inconnu",
                r -> ((ObjectNode) step(r, "before-mission").get("lock")).put("ref", "before-lunch")),
            refusal("agentShape", "une étape d'agent sans agent", r -> ((ObjectNode) step(r, "draft-spec").get("agent"))
                .remove("provider")),
            refusal("agentShape", "une étape d'agent tentée cinq fois",
                r -> ((ObjectNode) step(r, "draft-spec").get("agent")).put("attempts", 5)),
            refusal("agentShape", "un outil qui n'en est pas un",
                r -> ((ObjectNode) step(r, "draft-spec").get("agent")).putArray("tools").add("Bad Tool")),
            refusal("badDuration", "un délai d'agent qui n'est pas une durée",
                r -> ((ObjectNode) step(r, "draft-spec").get("agent")).put("timeout", "an hour")),
            refusal("humanShape", "une tâche humaine sans personne qui la fait",
                r -> ((ObjectNode) step(r, "approve-scope").get("human")).remove("who")),
            refusal("humanShape", "une tâche humaine sans question",
                r -> ((ObjectNode) step(r, "approve-scope").get("human")).remove("question")),
            refusal("humanShape", "une tâche humaine sans sorte",
                r -> ((ObjectNode) step(r, "approve-scope").get("human")).remove("kind")),
            refusal("humanShape", "un accord sans la signification de sa signature",
                r -> ((ObjectNode) step(r, "approve-scope").get("human")).remove("meaning")),
            refusal("humanShape", "une liste de contrôle sans ligne",
                r -> ((ObjectNode) step(r, "before-mission").get("human")).remove("checklist")),
            refusal("humanShape", "une saisie qui ne demande rien",
                r -> ((ObjectNode) step(r, "write-scope").get("human")).remove("fields")),
            refusal("humanShape", "un accord qui s'ouvre sur sa dernière réponse, ce que seule une liste fait",
                r -> ((ObjectNode) step(r, "approve-scope").get("human")).put("prefill", "last-answer")),
            refusal("humanShape", "une liste qui s'ouvre d'une façon que TaskForce ne connaît pas",
                r -> ((ObjectNode) step(r, "before-delivery").get("human")).put("prefill", "yesterday")),
            refusal("checklistTooLong", "une liste de contrôle de dix lignes", r -> {
                ArrayNode lines = ((ObjectNode) step(r, "before-mission").get("human")).putArray("checklist");
                for (int i = 1; i <= 10; i++) {
                    lines.add("Line " + i + ".");
                }
            }),
            refusal("fieldShape", "un champ d'un type inconnu",
                r -> ((ObjectNode) step(r, "write-scope").get("human").get("fields").get(0)).put("type", "color")),
            refusal("fieldShape", "un choix sans ses choix",
                r -> ((ObjectNode) step(r, "write-scope").get("human").get("fields").get(0)).put("type", "choice")),
            refusal("fieldShape", "un champ sans libellé",
                r -> ((ObjectNode) step(r, "write-scope").get("human").get("fields").get(0)).remove("label")),
            refusal("fieldShape", "deux champs du même identifiant",
                r -> ((ObjectNode) step(r, "write-scope").get("human").get("fields").get(1)).put("id", "goal")),
            refusal("unknownDefault", "un workflow par défaut qui n'existe pas", r -> r.put("derivedFrom", "no-such-default")));
    }

    static Arguments refusal(String code, String why, Consumer<ObjectNode> change) {
        return Arguments.of(code, why, change);
    }

    @ParameterizedTest(name = "{0} : {1}")
    @MethodSource("refusals")
    @DisplayName("chaque faute est refusée, en phrase")
    void each_fault_is_refused(String code, String why, Consumer<ObjectNode> change) {
        ObjectNode process = e20();
        change.accept(process);

        assertRefused(check(process), code);
    }

    @Test
    @DisplayName("chaque code de refus du vérificateur a son cas ici")
    void every_code_has_its_case() throws java.io.IOException {
        Set<String> tested = new java.util.HashSet<>();
        refusals().forEach(a -> tested.add((String) a.get()[0]));
        // Les cas écrits à part, plus bas : ceux qui demandent un contexte, un fichier importé ou un grand processus.
        tested.addAll(Set.of("tooLarge", "tooDeep", "lockedStepMissing", "lockedStepUnlocked", "lockedStepMoved",
            "notInSubset", "badPerson", "unknownRule"));
        String source = java.nio.file.Files.readString(java.nio.file.Path.of(
            "src/main/java/com/taskforce/tf_api/core/process/ProcessValidator.java"));
        Set<String> codes = new java.util.TreeSet<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("add\\(\"([a-zA-Z]+)\"").matcher(source);
        while (m.find()) {
            codes.add(m.group(1));
        }

        assertThat(codes).hasSizeGreaterThan(40);
        assertThat(tested).containsAll(codes);
    }

    // ------------------------------------------------------------------------------------------------- avec le contexte

    @Test
    @DisplayName("une étape verrouillée du workflow par défaut ne s'en va pas")
    void a_locked_step_of_the_default_stays() {
        ObjectNode derived = e20();
        derived.put("key", "integrate-billing").put("derivedFrom", "integrate-a-module");
        ObjectNode deliver = step(derived, "deliver");
        remove(steps(deliver), "before-delivery");
        remove(flows(deliver), "before-delivery-deliver-module");
        flow(deliver, "deliver-start-before-delivery").put("to", "deliver-module");
        Context context = new Context(List.of(), Map.of("integrate-a-module", ProcessFixtures.integrateAModule()),
            null, null);

        List<Problem> problems = ProcessValidator.check(model(derived), context);

        assertRefused(problems, "lockedStepMissing");
        assertThat(problems).filteredOn(p -> p.code().equals("lockedStepMissing")).singleElement()
            .satisfies(p -> {
                assertThat(p.stepId()).isEqualTo("before-delivery");
                assertThat(p.message()).isEqualTo("“Before delivering” is required by a pause point: it can't be removed.");
            });
    }

    @Test
    @DisplayName("une liste verrouillée garde ses lignes, qui la signe, ce que signer veut dire et son ouverture ; des "
        + "lignes s'ajoutent")
    void a_locked_checklist_keeps_its_lines() {
        Context context = new Context(List.of(), Map.of("integrate-a-module", ProcessFixtures.integrateAModule()),
            null, null);
        ObjectNode emptied = e20();
        emptied.put("key", "integrate-billing").put("derivedFrom", "integrate-a-module");
        ObjectNode human = (ObjectNode) step(emptied, "before-mission-build").get("human");
        human.remove("prefill");
        human.putArray("checklist").add("Fine.");
        ObjectNode longer = e20();
        longer.put("key", "integrate-billing").put("derivedFrom", "integrate-a-module");
        ((ArrayNode) step(longer, "before-mission-build").get("human").get("checklist"))
            .add("The client's tester knows the build starts.");

        List<Problem> problems = ProcessValidator.check(model(emptied), context);

        assertRefused(problems, "lockedStepUnlocked");
        assertThat(problems).singleElement().extracting(Problem::stepId).isEqualTo("before-mission-build");
        assertThat(ProcessValidator.check(model(longer), context)).isEmpty();
    }

    @Test
    @DisplayName("une étape verrouillée garde sa place : la liste d'avant de livrer ne passe pas après la livraison")
    void a_locked_step_keeps_its_place() {
        ObjectNode next = e20();
        ObjectNode deliver = step(next, "deliver");
        flow(deliver, "deliver-start-before-delivery").put("to", "deliver-module");
        flow(deliver, "before-delivery-deliver-module").put("from", "deliver-module").put("to", "before-delivery");
        flow(deliver, "deliver-module-watch").put("from", "before-delivery");

        assertThat(check(next)).isEmpty();
        List<Problem> problems = ProcessValidator.check(model(next),
            new Context(List.of(ProcessFixtures.integrateAModule()), Map.of(), null, null));

        assertRefused(problems, "lockedStepMoved");
        assertThat(problems).singleElement().satisfies(p -> {
            assertThat(p.stepId()).isEqualTo("before-delivery");
            assertThat(p.message()).isEqualTo("“Before delivering” is required by a pause point before “Deliver the "
                + "module”: a locked step keeps its place, and what came after it still comes after it.");
        });
    }

    @Test
    @DisplayName("une étape verrouillée de la version en vigueur reste verrouillée, par la même source")
    void a_locked_step_of_the_current_version_stays_locked() {
        ObjectNode next = e20();
        step(next, "before-delivery").remove("lock");

        List<Problem> problems = ProcessValidator.check(model(next),
            new Context(List.of(ProcessFixtures.integrateAModule()), Map.of(), null, null));

        assertRefused(problems, "lockedStepUnlocked");
    }

    @Test
    @DisplayName("une fin qui arrête tout ne passe pas le point d'avant de livrer, dans un processus dérivé du défaut "
        + "aussi ; « Integration stopped », où ne mène qu'une décision, reste un abandon")
    void a_terminating_end_delivers_too() {
        ObjectNode derived = e20();
        derived.put("key", "integrate-billing").put("derivedFrom", "integrate-a-module");
        step(derived, "delivered").put("terminate", true);
        signedBypass(derived);
        Context context = new Context(List.of(), Map.of("integrate-a-module", ProcessFixtures.integrateAModule()),
            null, null);

        assertRefused(ProcessValidator.check(model(derived), context), "pausePointMisplaced");
        assertThat(check(e20())).isEmpty();
    }

    @Test
    @DisplayName("un chemin qui contourne le point d'avant de livrer se dit une fois, pas une fois par zone d'agent")
    void a_way_around_the_delivery_point_is_said_once() {
        ObjectNode process = e20();
        steps(process).add(JSON.createObjectNode().put("id", "deliver-late").put("type", "deadline")
            .put("name", "A week without delivery").put("attachedTo", "deliver").put("duration", "P7D"));
        flows(process).add(newFlow("deliver-late-delivered", "deliver-late", "delivered"));

        assertThat(check(process)).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("pausePointMisplaced");
            assertThat(p.stepId()).isEqualTo("deliver-late");
            assertThat(p.message()).isEqualTo("“A week without delivery” leads the work of “Draft the specification” to "
                + "“Module delivered” without the pause point before the work is delivered: every path from an agent's "
                + "work to the end goes through it.");
        });
    }

    @Test
    @DisplayName("un chemin qui contourne le point d'avant de livrer se dit sur sa dernière étape avant la fin, pas sur la "
        + "première zone d'agent")
    void a_way_around_the_delivery_point_is_said_where_it_ends() {
        ObjectNode process = e20();
        signedBypass(process);

        assertThat(check(process)).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("pausePointMisplaced");
            assertThat(p.stepId()).isEqualTo("close-integration");
        });
    }

    @Test
    @DisplayName("une étape verrouillée ne se cache pas sous une étape d'agent : la zone est le dernier niveau")
    void a_locked_step_does_not_hide_under_an_agent_step() {
        ObjectNode base = e20();
        step(base, "approve-breakdown").putObject("lock").put("by", "author");
        ObjectNode next = base.deepCopy();
        ObjectNode breakDown = step(next, "break-down");
        ObjectNode approve = step(next, "approve-breakdown").deepCopy();
        remove(steps(breakDown), "approve-breakdown");
        remove(flows(breakDown), "approve-breakdown-break-down-end");
        flow(breakDown, "breakdown-zone-approve-breakdown").put("to", "break-down-end");
        steps(step(next, "split-into-issues")).add(approve);

        List<Problem> problems = ProcessValidator.check(model(next),
            new Context(List.of(model(base)), Map.of(), null, null));

        assertRefused(problems, "notAContainer");
        assertThat(problems).filteredOn(p -> p.code().equals("notAContainer")).singleElement()
            .extracting(Problem::stepId).isEqualTo("split-into-issues");
    }

    @Test
    @DisplayName("une personne hors de l'espace, une règle que l'espace n'a pas : refusées")
    void people_and_rules_of_the_workspace() {
        ObjectNode process = e20();
        step(process, "write-scope").put("answeredBy", "person:999");
        Context context = new Context(List.of(), Map.of(), Set.of("read-files"), Set.of(1L, 2L));

        List<Problem> problems = ProcessValidator.check(model(process), context);

        assertThat(problems).extracting(Problem::code).contains("badPerson", "unknownRule");
        assertThat(problems).filteredOn(p -> p.code().equals("badPerson")).first()
            .extracting(Problem::message).isEqualTo("“Write the module's scope” names someone who isn't a member of the "
                + "workspace.");
        assertThat(problems).filteredOn(p -> p.code().equals("unknownRule")).extracting(Problem::message)
            .contains("“Draft the specification” follows a rule that doesn't apply to this project: search-files.");
    }

    @Test
    @DisplayName("une personne d'un numéro trop long se refuse en phrase, même contre les personnes de l'espace")
    void a_person_number_too_long() {
        ObjectNode process = e20();
        step(process, "write-scope").put("answeredBy", "person:9223372036854775808");

        List<Problem> problems = ProcessValidator.check(model(process),
            new Context(List.of(), Map.of(), null, Set.of(1L, 2L)));

        assertRefused(problems, "badPerson");
        assertThat(problems).filteredOn(p -> p.code().equals("badPerson")).singleElement()
            .extracting(Problem::message).isEqualTo("“Write the module's scope” names someone TaskForce doesn't know: "
                + "person:9223372036854775808. Name a person of the workspace, its owner, its admins, or the project's "
                + "lead.");
    }

    @Test
    @DisplayName("un élément hors du sous-ensemble est refusé avec sa raison, et seul")
    void an_element_outside_the_subset() {
        List<Problem> problems = ProcessValidator.check(model(e20()), Context.NONE,
            List.of(new ProcessValidator.Foreign("inclusiveGateway", "pick", "Pick the suppliers")));

        assertThat(problems).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("notInSubset");
            assertThat(p.stepId()).isEqualTo("pick");
            assertThat(p.message()).startsWith("“Pick the suppliers” takes several paths at once");
        });
    }

    @Test
    @DisplayName("un processus trop profond se refuse en une phrase, avant tout parcours")
    void too_deep() {
        ObjectNode process = e20();
        ObjectNode inner = step(process, "frame");
        // La phase est au niveau 1 ; huit niveaux de plus la mettent à neuf, un de trop.
        for (int i = 0; i < 8; i++) {
            ObjectNode next = JSON.createObjectNode().put("id", "deeper-" + i).put("type", "stage").put("name", "Deeper");
            steps(inner).add(next);
            inner = next;
        }

        assertThat(check(process)).singleElement().satisfies(p -> {
            assertThat(p.code()).isEqualTo("tooDeep");
            assertThat(p.message()).isEqualTo("This process nests its steps more than 8 levels deep: a process holds its "
                + "stages, a stage its steps and agent zones, a zone its agent steps.");
        });
    }

    @Test
    @DisplayName("un fichier de mille fautes se dit par ses cinquante premières, puis leur nombre")
    void many_problems_are_counted() {
        List<ProcessValidator.Foreign> foreign = new java.util.ArrayList<>();
        for (int i = 0; i < 120; i++) {
            foreign.add(new ProcessValidator.Foreign("inclusiveGateway", "pick-" + i, "Pick " + i));
        }

        List<Problem> problems = ProcessValidator.check(model(e20()), Context.NONE, foreign);

        assertThat(problems).hasSize(51);
        assertThat(problems.subList(0, 50)).extracting(Problem::code).containsOnly("notInSubset");
        assertThat(problems.get(50)).satisfies(p -> {
            assertThat(p.code()).isEqualTo("moreProblems");
            assertThat(p.stepId()).isNull();
            assertThat(p.message()).isEqualTo("There are 70 more problems: fix these first, then check again.");
        });
    }

    @Test
    @DisplayName("un processus trop grand se découpe")
    void too_large() {
        ObjectNode process = e20();
        ArrayNode frame = steps(step(process, "frame"));
        for (int i = 0; i < ProcessValidator.MAX_STEPS; i++) {
            frame.add(human("extra-" + i, "Extra " + i));
        }

        assertThat(check(process)).singleElement().extracting(Problem::code).isEqualTo("tooLarge");
    }

    @Test
    @DisplayName("les messages visent l'étape : la décision sans condition dit vers où mène le chemin")
    void messages_name_the_step() {
        ObjectNode process = e20();
        ObjectNode c = (ObjectNode) flow(process, "go-ahead-specify").get("condition");
        c.remove("step");
        c.remove("outcome");

        assertThat(check(process)).singleElement().satisfies(p -> {
            assertThat(p.stepId()).isEqualTo("go-ahead");
            assertThat(p.message()).isEqualTo("The decision “Go ahead with the module?” takes the path to “Specify” on "
                + "words alone (“The scope is approved”): TaskForce judges a condition with code, never with a model. "
                + "Say which step it depends on, and which result.");
        });
    }

    @Test
    @DisplayName("une durée ISO 8601 : des jours, des heures, les deux ; jamais zéro ni négative, ni en semaines")
    void durations() {
        assertThat(ProcessValidator.isDuration("P2D")).isTrue();
        assertThat(ProcessValidator.isDuration("PT4H")).isTrue();
        assertThat(ProcessValidator.isDuration("P1DT12H")).isTrue();
        assertThat(ProcessValidator.isDuration("P1Y2M")).isTrue();
        assertThat(ProcessValidator.isDuration("PT1.5S")).isTrue();
        assertThat(ProcessValidator.isDuration("P1W")).isFalse();
        assertThat(ProcessValidator.isDuration("p2d")).isFalse();
        assertThat(ProcessValidator.isDuration("P1DT")).isFalse();
        assertThat(ProcessValidator.isDuration("P99999999999D")).isFalse();
        assertThat(ProcessValidator.isDuration("P0D")).isFalse();
        assertThat(ProcessValidator.isDuration("PT0S")).isFalse();
        assertThat(ProcessValidator.isDuration("P-1D")).isFalse();
        assertThat(ProcessValidator.isDuration("2 days")).isFalse();
        assertThat(ProcessValidator.isDuration("P")).isFalse();
        assertThat(ProcessValidator.isDuration("PT")).isFalse();
        assertThat(ProcessValidator.isDuration(null)).isFalse();
    }
}
