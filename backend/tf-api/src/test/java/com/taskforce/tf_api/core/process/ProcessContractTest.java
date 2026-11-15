package com.taskforce.tf_api.core.process;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.StringReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.stream.Stream;

import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Le contrat des processus (ADR-027, E23) sur le processus d'E20, « intégrer un module », premier workflow par défaut :
 * il passe le vérificateur, son export est celui de {@code contracts/process/integrate-a-module.bpmn} (le fichier que
 * la Présidence ouvre dans le Desktop Modeler de Camunda), ce fichier est valide pour le schéma XSD de BPMN 2.0 et pour
 * celui de l'extension {@code tf:}, il revient à l'identique (la même empreinte, {@code tf:} gardée), et chaque fichier
 * réécrit par un modeleur ({@code contracts/process/round-trip/}) aussi. Le sous-ensemble de J2 est exactement ce que
 * ce processus emploie.
 *
 * <p>Le dossier des contrats se lit à {@code ../../contracts} depuis {@code backend/tf-api}, ou là où
 * {@code -Dcontracts.dir} l'indique. Avec {@code -Dprocess.contracts.write=true}, le test réécrit l'export attendu au
 * lieu de le comparer (après un changement voulu de l'export).</p>
 */
@DisplayName("Le contrat des processus : le processus d'E20, aller et retour")
class ProcessContractTest {

    static final String DEFAULT = ProcessFixtures.DEFAULT;

    static Path contracts() {
        return ProcessFixtures.contracts();
    }

    static ProcessModel integrateAModule() {
        return ProcessFixtures.integrateAModule();
    }

    static Set<String> taskforceRules() {
        return ProcessFixtures.taskforceRules();
    }

    static Schema bpmnSchema() throws Exception {
        URL bpmn = ProcessContractTest.class.getResource("/org/operaton/bpm/model/bpmn/schema/BPMN20.xsd");
        assertThat(bpmn).as("the BPMN 2.0 XSD, from the test dependency").isNotNull();
        SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        return factory.newSchema(new StreamSource[] {
            new StreamSource(bpmn.toExternalForm()),
            new StreamSource(contracts().resolve("process/taskforce-process-1.xsd").toFile())
        });
    }

    @Test
    @DisplayName("le processus d'E20 passe le vérificateur, ses règles existent toutes chez TaskForce")
    void the_default_passes() {
        ProcessModel model = integrateAModule();

        List<ProcessValidator.Problem> problems = ProcessValidator.check(model,
            new ProcessValidator.Context(List.of(), java.util.Map.of(), taskforceRules(), null));

        assertThat(problems).isEmpty();
        assertThat(model.allSteps().stream().filter(s -> s.pausePoint() != null).map(ProcessModel.Step::pausePoint))
            .containsExactlyInAnyOrderElementsOf(ProcessModel.PAUSE_POINTS);
    }

    @Test
    @DisplayName("son export est le fichier du contrat, que la Présidence ouvre dans un modeleur")
    void the_export_is_the_contract() throws IOException {
        String xml = BpmnExport.toXml(integrateAModule());
        Path file = contracts().resolve("process/" + DEFAULT + ".bpmn");

        if (Boolean.getBoolean("process.contracts.write")) {
            Files.writeString(file, xml, StandardCharsets.UTF_8);
        }

        assertThat(Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n"))
            .as("the export changed: run with -Dprocess.contracts.write=true, then refresh the bpmn-moddle file")
            .isEqualTo(xml);
    }

    @Test
    @DisplayName("l'export est valide pour le schéma XSD de BPMN 2.0, et l'extension tf: pour le sien")
    void the_export_is_valid_bpmn() throws Exception {
        String xml = BpmnExport.toXml(integrateAModule());

        bpmnSchema().newValidator().validate(new StreamSource(new StringReader(xml)));
    }

    @Test
    @DisplayName("le schéma de tf: que le serveur suit à l'import est celui du contrat")
    void the_server_reads_the_contract_schema() throws IOException {
        try (var in = getClass().getResourceAsStream("/process/taskforce-process-1.xsd")) {
            assertThat(in).isNotNull();
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n"))
                .isEqualTo(Files.readString(contracts().resolve("process/taskforce-process-1.xsd"), StandardCharsets.UTF_8)
                    .replace("\r\n", "\n"));
        }
    }

    @Test
    @DisplayName("l'aller et retour garde tout : la même empreinte, le même modèle")
    void the_round_trip_keeps_everything() {
        ProcessModel model = integrateAModule();

        BpmnImport.Result back = BpmnImport.read(BpmnExport.toXml(model));

        assertThat(back.foreign()).isEmpty();
        assertThat(back.notes()).isEmpty();
        assertThat(ProcessFingerprint.of(back.model())).isEqualTo(ProcessFingerprint.of(model));
        assertThat(ProcessFingerprint.canonical(back.model())).isEqualTo(ProcessFingerprint.canonical(model));
    }

    @Test
    @DisplayName("le sous-ensemble de J2 est exactement ce qu'emploie le processus d'E20")
    void the_subset_is_frozen_on_e20() {
        Document doc = BpmnImport.parse(BpmnExport.toXml(integrateAModule()));
        Set<String> used = new TreeSet<>();
        NodeList all = doc.getElementsByTagNameNS(Bpmn.MODEL, "*");
        for (int i = 0; i < all.getLength(); i++) {
            used.add(((Element) all.item(i)).getLocalName());
        }

        assertThat(used).containsExactlyInAnyOrderElementsOf(
            ProcessSubset.ELEMENTS.stream().map(ProcessSubset.Element::bpmn).toList());
        // Les cinq types d'étapes, et toute la structure.
        assertThat(integrateAModule().allSteps().stream().map(ProcessModel.Step::type).distinct())
            .containsExactlyInAnyOrderElementsOf(ProcessModel.TYPES);
    }

    /**
     * Des processus qui passaient le vérificateur et perdaient quelque chose à l'aller et retour, ou s'exportaient en un
     * fichier invalide (R159, M2) : un champ qui n'est pas du type de l'étape, un caractère qu'un fichier XML ne porte
     * pas.
     */
    static Stream<Arguments> passing() {
        String control = "Write" + (char) 1 + " the scope" + (char) 0x1F;
        String nonCharacter = "Write the scope" + (char) 0xFFFF;
        String loneSurrogate = "Approve " + (char) 0xD800 + "it";
        return Stream.of(
            Arguments.of("une attente d'une durée qui dit aussi ce qu'elle attend, et de qui", (Consumer<ObjectNode>) r ->
                ((ObjectNode) ProcessValidatorTest.step(r, "watch").get("wait")).put("what", "A report")
                    .put("from", "project-lead")),
            Arguments.of("une attente d'un document qui a aussi une durée", (Consumer<ObjectNode>) r ->
                ((ObjectNode) ProcessValidatorTest.step(r, "acceptance-report").get("wait")).put("duration", "P3D")),
            Arguments.of("une tâche humaine avec une durée, une étape surveillée et une attente", (Consumer<ObjectNode>) r -> {
                ObjectNode s = ProcessValidatorTest.step(r, "write-scope");
                s.put("duration", "P1D").put("attachedTo", "frame-start");
                s.putObject("wait").put("kind", "timer").put("duration", "P1D");
            }),
            Arguments.of("un début qui arrête tout", (Consumer<ObjectNode>) r ->
                ProcessValidatorTest.step(r, "requested").put("terminate", true)),
            Arguments.of("des réglages d'agent vides sur une tâche humaine", (Consumer<ObjectNode>) r ->
                ProcessValidatorTest.step(r, "write-scope").putObject("agent")),
            Arguments.of("une question de tâche humaine sur une étape d'agent", (Consumer<ObjectNode>) r ->
                ProcessValidatorTest.step(r, "draft-spec").putObject("human").put("question", "Why?")),
            Arguments.of("des caractères de contrôle dans un nom et une description", (Consumer<ObjectNode>) r -> {
                ProcessValidatorTest.step(r, "write-scope").put("name", control);
                r.put("description", control);
            }),
            Arguments.of("U+FFFF dans un nom, une moitié de paire seule dans une description", (Consumer<ObjectNode>) r -> {
                ProcessValidatorTest.step(r, "write-scope").put("name", nonCharacter);
                ProcessValidatorTest.step(r, "approve-scope").put("description", loneSurrogate);
            }));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("passing")
    @DisplayName("ce qui passe le vérificateur s'exporte en un fichier valide, et revient avec la même empreinte")
    void what_passes_comes_back(String why, Consumer<ObjectNode> change) throws Exception {
        ObjectNode root = ProcessValidatorTest.e20();
        change.accept(root);
        ProcessModel model = ProcessValidatorTest.model(root);
        assertThat(ProcessValidator.check(model, ProcessValidator.Context.NONE)).as(why).isEmpty();

        String xml = BpmnExport.toXml(model);

        bpmnSchema().newValidator().validate(new StreamSource(new StringReader(xml)));
        BpmnImport.Result back = BpmnImport.read(xml);
        assertThat(back.foreign()).isEmpty();
        assertThat(ProcessFingerprint.canonical(back.model())).isEqualTo(ProcessFingerprint.canonical(model));
    }

    static Stream<Path> rewritten() throws IOException {
        Path dir = contracts().resolve("process/round-trip");
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> p.toString().endsWith(".bpmn")).sorted().toList().stream();
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rewritten")
    @DisplayName("un fichier réécrit par un modeleur revient à l'identique, tf: gardée")
    void a_rewritten_file_comes_back(Path file) throws Exception {
        String xml = Files.readString(file, StandardCharsets.UTF_8);

        BpmnImport.Result back = BpmnImport.read(xml);

        assertThat(back.foreign()).isEmpty();
        assertThat(ProcessFingerprint.of(back.model())).isEqualTo(ProcessFingerprint.of(integrateAModule()));
        bpmnSchema().newValidator().validate(new StreamSource(new StringReader(xml)));
    }
}
