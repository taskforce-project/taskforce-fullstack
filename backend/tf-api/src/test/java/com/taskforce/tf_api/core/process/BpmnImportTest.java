package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.taskforce.tf_api.core.process.ProcessValidator.Context;
import com.taskforce.tf_api.core.process.ProcessValidator.Problem;

/**
 * L'import d'un fichier BPMN 2.0 (ADR-027, E23) : chaque élément hors du sous-ensemble est refusé, avec sa raison en
 * mots ; un fichier qui n'est pas un processus lisible le dit ; ce qu'un autre outil ajoute (ses réglages, des notes
 * dessinées, son nom d'exportateur) est laissé de côté sans changer le processus.
 */
@DisplayName("L'import d'un fichier BPMN 2.0")
class BpmnImportTest {

    static String file(String inside) {
        return file("", inside);
    }

    static String file(String roots, String inside) {
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="t">
              %s
              <bpmn:process id="p" name="P">%s</bpmn:process>
            </bpmn:definitions>
            """.formatted(roots, inside);
    }

    static Stream<Arguments> outside() {
        return Stream.of(
            Arguments.of("inclusiveGateway", file("<bpmn:inclusiveGateway id=\"x\" name=\"Pick\"/>"), "an inclusive gateway"),
            Arguments.of("complexGateway", file("<bpmn:complexGateway id=\"x\" name=\"Join\"/>"), "a complex gateway"),
            Arguments.of("eventBasedGateway", file("<bpmn:eventBasedGateway id=\"x\" name=\"First\"/>"), "an event-based"),
            Arguments.of("multiInstance", file("<bpmn:userTask id=\"x\" name=\"Each\">"
                + "<bpmn:multiInstanceLoopCharacteristics/></bpmn:userTask>"), "multi-instance"),
            Arguments.of("loop", file("<bpmn:userTask id=\"x\" name=\"Again\"><bpmn:standardLoopCharacteristics/>"
                + "</bpmn:userTask>"), "a loop"),
            Arguments.of("eventSubProcess", file("<bpmn:subProcess id=\"x\" name=\"On error\" triggeredByEvent=\"true\"/>"),
                "an event subprocess"),
            Arguments.of("transaction", file("<bpmn:transaction id=\"x\" name=\"Pay\"/>"), "a transaction"),
            Arguments.of("signal", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Go\"><bpmn:signalEventDefinition/>"
                + "</bpmn:intermediateCatchEvent>"), "a signal"),
            Arguments.of("escalation", file("<bpmn:boundaryEvent id=\"x\" name=\"Up\" attachedToRef=\"y\">"
                + "<bpmn:escalationEventDefinition/></bpmn:boundaryEvent>"), "escalates"),
            Arguments.of("compensation", file("<bpmn:serviceTask id=\"x\" name=\"Undo\" isForCompensation=\"true\"/>"),
                "compensation"),
            Arguments.of("conditionalEvent", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"When\">"
                + "<bpmn:conditionalEventDefinition/></bpmn:intermediateCatchEvent>"), "until a condition holds"),
            Arguments.of("link", file("<bpmn:intermediateThrowEvent id=\"x\" name=\"Jump\"><bpmn:linkEventDefinition/>"
                + "</bpmn:intermediateThrowEvent>"), "a link"),
            Arguments.of("cancel", file("<bpmn:endEvent id=\"x\" name=\"Cancel\"><bpmn:cancelEventDefinition/>"
                + "</bpmn:endEvent>"), "cancels a transaction"),
            Arguments.of("dataObject", file("<bpmn:dataObject id=\"x\" name=\"Invoice\"/>"), "a data object"),
            Arguments.of("lanes", file("<bpmn:laneSet id=\"x\"/>"), "lanes"),
            Arguments.of("collaboration", file("<bpmn:collaboration id=\"x\"/>", ""), "pools"),
            Arguments.of("businessRuleTask", file("<bpmn:businessRuleTask id=\"x\" name=\"Score\"/>"), "(DMN)"),
            Arguments.of("scriptTask", file("<bpmn:scriptTask id=\"x\" name=\"Run\"/>"), "runs a script"),
            Arguments.of("sendTask", file("<bpmn:sendTask id=\"x\" name=\"Send\"/>"), "a send task"),
            Arguments.of("receiveTask", file("<bpmn:receiveTask id=\"x\" name=\"Receive\"/>"), "a receive task"),
            Arguments.of("manualTask", file("<bpmn:manualTask id=\"x\" name=\"By hand\"/>"), "a manual task"),
            Arguments.of("task", file("<bpmn:task id=\"x\" name=\"Something\"/>"), "a task of no kind"),
            Arguments.of("callActivity", file("<bpmn:callActivity id=\"x\" name=\"Call\"/>"), "calls another process"),
            Arguments.of("intermediateThrowEvent", file("<bpmn:intermediateThrowEvent id=\"x\" name=\"Tell\"/>"),
                "a throw event"),
            Arguments.of("startTrigger", file("<bpmn:startEvent id=\"x\" name=\"Every day\"><bpmn:timerEventDefinition/>"
                + "</bpmn:startEvent>"), "starts the process on an event"),
            Arguments.of("endTrigger", file("<bpmn:endEvent id=\"x\" name=\"Notify\"><bpmn:messageEventDefinition/>"
                + "</bpmn:endEvent>"), "ends by sending an event"),
            Arguments.of("timerDate", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Until\"><bpmn:timerEventDefinition>"
                + "<bpmn:timeDate>2026-12-01T09:00:00Z</bpmn:timeDate></bpmn:timerEventDefinition>"
                + "</bpmn:intermediateCatchEvent>"), "until a date"),
            Arguments.of("timerCycle", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Weekly\"><bpmn:timerEventDefinition>"
                + "<bpmn:timeCycle>R/P1W</bpmn:timeCycle></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>"),
                "on a cycle"),
            Arguments.of("nonInterruptingDeadline", file("<bpmn:boundaryEvent id=\"x\" name=\"Remind\" attachedToRef=\"y\" "
                + "cancelActivity=\"false\"><bpmn:timerEventDefinition><bpmn:timeDuration>P1D</bpmn:timeDuration>"
                + "</bpmn:timerEventDefinition></bpmn:boundaryEvent>"), "lets its step go on"),
            Arguments.of("boundaryTrigger", file("<bpmn:boundaryEvent id=\"x\" name=\"On mail\" attachedToRef=\"y\">"
                + "<bpmn:messageEventDefinition/></bpmn:boundaryEvent>"), "only a deadline or a failure path"),
            Arguments.of("severalProcesses", file("<bpmn:process id=\"other\"/>", ""), "several processes"),
            Arguments.of("choreographyTask", file("<bpmn:choreographyTask id=\"x\" name=\"Dance\"/>"),
                "a BPMN element TaskForce's processes don't have (choreographyTask)"),
            // Ce qu'un élément du sous-ensemble porte en plus : refusé, jamais laissé de côté en silence (R159, M1).
            Arguments.of("tfSettings", file("<bpmn:userTask id=\"x\" name=\"Ask\"><bpmn:extensionElements>"
                + "<tf:step xmlns:tf=\"" + Bpmn.TF + "\" answeredBy=\"project-lead\" color=\"red\"/>"
                + "</bpmn:extensionElements></bpmn:userTask>"), "TaskForce settings this version doesn't read (tf:step)"),
            Arguments.of("tfSettings", file("<bpmn:userTask id=\"x\" name=\"Ask\"><bpmn:extensionElements>"
                + "<tf:step xmlns:tf=\"" + Bpmn.TF + "\" answeredBy=\"project-lead\"><tf:script>rm</tf:script></tf:step>"
                + "</bpmn:extensionElements></bpmn:userTask>"), "TaskForce settings this version doesn't read (tf:step)"),
            Arguments.of("tfSettings", file("<bpmn:userTask id=\"x\" name=\"Ask\"><bpmn:extensionElements>"
                + "<tf:run xmlns:tf=\"" + Bpmn.TF + "\"/></bpmn:extensionElements></bpmn:userTask>"),
                "(tf:run, which doesn't go there)"),
            Arguments.of("tfSettings", file("<bpmn:userTask id=\"x\" name=\"Ask\"><bpmn:extensionElements>"
                + "<tf:step xmlns:tf=\"" + Bpmn.TF + "\" answeredBy=\"project-lead\"/>"
                + "<tf:step xmlns:tf=\"" + Bpmn.TF + "\" answeredBy=\"role:owner\"/></bpmn:extensionElements>"
                + "</bpmn:userTask>"), "(tf:step, twice)"),
            Arguments.of("completionCondition", file("<bpmn:adHocSubProcess id=\"x\" name=\"Zone\">"
                + "<bpmn:completionCondition>done</bpmn:completionCondition></bpmn:adHocSubProcess>"),
                "ends on a condition of its own"),
            Arguments.of("rendering", file("<bpmn:userTask id=\"x\" name=\"Fill\"><bpmn:rendering id=\"r\"/>"
                + "</bpmn:userTask>"), "a form drawn for another tool"),
            Arguments.of("dataObject", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Wait\"><bpmn:dataOutput id=\"o\"/>"
                + "<bpmn:timerEventDefinition><bpmn:timeDuration>P1D</bpmn:timeDuration></bpmn:timerEventDefinition>"
                + "</bpmn:intermediateCatchEvent>"), "is data drawn in the process"),
            Arguments.of("dataObject", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Wait\">"
                + "<bpmn:dataOutputAssociation id=\"o\"/><bpmn:timerEventDefinition><bpmn:timeDuration>P1D"
                + "</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>"),
                "is data drawn in the process"),
            Arguments.of("foo", file("<bpmn:exclusiveGateway id=\"x\" name=\"Pick\"><bpmn:foo/></bpmn:exclusiveGateway>"),
                "a BPMN element TaskForce's processes don't have (foo)"),
            Arguments.of("setting", file("<bpmn:userTask id=\"x\" name=\"Twice\" completionQuantity=\"2\"/>"),
                "has a setting TaskForce's processes don't have: completionQuantity=\"2\""),
            Arguments.of("setting", file("<bpmn:adHocSubProcess id=\"x\" name=\"Zone\" ordering=\"Sequential\"/>"),
                "ordering=\"Sequential\""),
            Arguments.of("setting", file("<bpmn:serviceTask id=\"x\" name=\"Call\" operationRef=\"op\"/>"),
                "operationRef=\"op\""),
            Arguments.of("setting", file("<bpmn:boundaryEvent id=\"x\" name=\"Fails\" attachedToRef=\"y\">"
                + "<bpmn:errorEventDefinition errorRef=\"e\"/></bpmn:boundaryEvent>"), "errorRef=\"e\""),
            Arguments.of("setting", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Wait\"><bpmn:timerEventDefinition>"
                + "<bpmn:timeDuration language=\"feel\">=days(2)</bpmn:timeDuration></bpmn:timerEventDefinition>"
                + "</bpmn:intermediateCatchEvent>"), "language=\"feel\""),
            Arguments.of("service", file("<bpmn:intermediateCatchEvent id=\"x\" name=\"Wait\"><bpmn:messageEventDefinition>"
                + "<bpmn:operationRef>op</bpmn:operationRef></bpmn:messageEventDefinition></bpmn:intermediateCatchEvent>"),
                "calls a service of another system"),
            Arguments.of("conditionLanguage", file("<bpmn:sequenceFlow id=\"f\" sourceRef=\"a\" targetRef=\"b\">"
                + "<bpmn:conditionExpression language=\"javascript\">x &gt; 1</bpmn:conditionExpression>"
                + "</bpmn:sequenceFlow>"), "is written for another engine (javascript)"),
            Arguments.of("conditionLanguage", file("<bpmn:sequenceFlow id=\"f\" sourceRef=\"a\" targetRef=\"b\">"
                + "<bpmn:conditionExpression>x &gt; 1</bpmn:conditionExpression></bpmn:sequenceFlow>")
                .replace("id=\"d\"", "id=\"d\" expressionLanguage=\"http://www.w3.org/1999/XPath\""),
                "is written for another engine (http://www.w3.org/1999/XPath)"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("outside")
    @DisplayName("un élément hors du sous-ensemble est refusé, avec sa raison en mots")
    void outside_the_subset(String element, String xml, String words) {
        BpmnImport.Result read = BpmnImport.read(xml);

        assertThat(read.foreign()).extracting(ProcessValidator.Foreign::element).contains(element);
        List<Problem> problems = ProcessValidator.check(read.model(), Context.NONE, read.foreign());
        assertThat(problems).extracting(Problem::code).containsOnly("notInSubset");
        assertThat(problems).extracting(Problem::message).anySatisfy(m -> assertThat(m).contains(words).endsWith("."));
    }

    @Test
    @DisplayName("un fichier avec une DTD est refusé : aucune entité externe n'est lue")
    void no_external_entity() {
        String xml = """
            <?xml version="1.0"?>
            <!DOCTYPE d [<!ENTITY secret SYSTEM "file:///etc/passwd">]>
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="t">
              <bpmn:process id="p" name="&secret;"/>
            </bpmn:definitions>
            """;

        assertThatThrownBy(() -> BpmnImport.read(xml)).isInstanceOf(BpmnImport.Unreadable.class)
            .hasMessageStartingWith("The file isn't well-formed XML");
    }

    @Test
    @DisplayName("un fichier trop profond s'arrête au lecteur, en une phrase : rien ne descend au-delà")
    void too_deep() {
        int levels = 20_000;
        String xml = file("<bpmn:subProcess id=\"s\">".repeat(levels) + "</bpmn:subProcess>".repeat(levels));

        assertThatThrownBy(() -> BpmnImport.read(xml)).isInstanceOf(BpmnImport.Unreadable.class)
            .hasMessage("The file nests its parts more than 64 levels deep: a process is never that deep.");
    }

    @Test
    @DisplayName("ce qui n'est pas un processus BPMN 2.0 lisible le dit, en mots")
    void unreadable_files() {
        assertThatThrownBy(() -> BpmnImport.read("")).hasMessage("The file is empty.");
        assertThatThrownBy(() -> BpmnImport.read("not xml")).hasMessageStartingWith("The file isn't well-formed XML");
        assertThatThrownBy(() -> BpmnImport.read("<a/>")).hasMessage("This file isn't a BPMN 2.0 file: it has no "
            + "definitions.");
        assertThatThrownBy(() -> BpmnImport.read("""
            <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="t"/>
            """)).hasMessage("This file holds no process.");
        assertThatThrownBy(() -> BpmnImport.read("x".repeat(BpmnImport.MAX_CHARS + 1)))
            .hasMessage("The file is too large to be one process: split it.");
    }

    @Test
    @DisplayName("ce qu'un modeleur ajoute en enregistrant ne change pas le processus ; les réglages d'un autre outil sont dits")
    void what_a_modeler_adds() {
        ProcessModel e20 = ProcessFixtures.integrateAModule();
        String saved = BpmnExport.toXml(e20)
            .replace("exporter=\"TaskForce\" exporterVersion=\"taskforce-process/1\"",
                "xmlns:modeler=\"http://camunda.org/schema/modeler/1.0\" exporter=\"Camunda Modeler\" "
                    + "exporterVersion=\"5.40.0\" modeler:executionPlatform=\"Camunda Cloud\" "
                    + "modeler:executionPlatformVersion=\"8.8.0\"")
            .replaceFirst("(<bpmn:userTask id=\"write-scope\"[^>]*>\\s*<bpmn:extensionElements>)",
                "$1<zeebe:userTask xmlns:zeebe=\"http://camunda.org/schema/zeebe/1.0\"/>")
            .replace("<bpmn:startEvent id=\"requested\" name=\"Module requested\">",
                "<bpmn:textAnnotation id=\"note\"><bpmn:text>Ask Marie first</bpmn:text></bpmn:textAnnotation>"
                    + "<bpmn:startEvent id=\"requested\" name=\"Module requested\">");

        BpmnImport.Result read = BpmnImport.read(saved);

        assertThat(read.foreign()).isEmpty();
        assertThat(ProcessFingerprint.of(read.model())).isEqualTo(ProcessFingerprint.of(e20));
        assertThat(read.notes()).containsExactly(
            "Notes drawn on the diagram were left out: TaskForce keeps the process, not its drawing.",
            "Settings for another tool were left out (http://camunda.org/schema/zeebe/1.0): TaskForce doesn't run them.");
    }

    @Test
    @DisplayName("les réglages d'un autre moteur en attributs, comme camunda:class, sont dits comme ceux de ses extensions")
    void settings_of_another_engine_in_attributes() {
        String xml = BpmnExport.toXml(ProcessFixtures.integrateAModule())
            .replace("<bpmn:serviceTask id=\"draft-spec\"", "<bpmn:serviceTask xmlns:camunda="
                + "\"http://camunda.org/schema/1.0/bpmn\" camunda:class=\"com.example.DraftDelegate\" id=\"draft-spec\"");

        BpmnImport.Result read = BpmnImport.read(xml);

        assertThat(read.foreign()).isEmpty();
        assertThat(read.notes()).containsExactly("Settings for another tool were left out "
            + "(http://camunda.org/schema/1.0/bpmn): TaskForce doesn't run them.");
        assertThat(ProcessFingerprint.of(read.model())).isEqualTo(ProcessFingerprint.of(ProcessFixtures.integrateAModule()));
    }

    @Test
    @DisplayName("une condition écrite pour un autre moteur reste des mots : le vérificateur la refuse")
    void a_condition_of_another_engine() {
        String xml = BpmnExport.toXml(ProcessFixtures.integrateAModule())
            .replace("<tf:condition step=\"approve-scope\" outcome=\"approved\"/>", "")
            .replace(">The scope is approved<", ">=scopeApproved = true<");

        BpmnImport.Result read = BpmnImport.read(xml);

        assertThat(ProcessValidator.check(read.model(), Context.NONE, read.foreign())).singleElement()
            .satisfies(p -> {
                assertThat(p.code()).isEqualTo("decisionWithoutCondition");
                assertThat(p.message()).contains("on words alone (“=scopeApproved = true”)");
            });
    }

    @Test
    @DisplayName("les références qualifiées se lisent par leur nom local")
    void qualified_references() {
        String xml = BpmnExport.toXml(ProcessFixtures.integrateAModule())
            .replace("attachedToRef=\"build-zone\"", "attachedToRef=\"bpmn:build-zone\"")
            .replace("messageRef=\"acceptance-report.message\"", "messageRef=\"bpmn:acceptance-report.message\"");

        BpmnImport.Result read = BpmnImport.read(xml);

        assertThat(ProcessFingerprint.of(read.model()))
            .isEqualTo(ProcessFingerprint.of(ProcessFixtures.integrateAModule()));
    }
}
