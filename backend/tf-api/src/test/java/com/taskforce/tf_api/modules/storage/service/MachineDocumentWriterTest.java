package com.taskforce.tf_api.modules.storage.service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.taskforce.tf_api.modules.storage.domain.StorageKind;
import com.taskforce.tf_api.modules.storage.domain.StorageTarget;
import com.taskforce.tf_api.modules.storage.service.DocumentWriter.DocumentFile;
import com.taskforce.tf_api.modules.storage.service.DocumentWriter.Written;
import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Ranger sur la machine (R156)")
class MachineDocumentWriterTest {

    @TempDir
    Path folder;

    private StorageTarget target(String path) {
        return StorageTarget.builder().workspaceId(1L).kind(StorageKind.MACHINE).localPath(path).build();
    }

    @Test
    @DisplayName("sur l'app desktop, le document s'écrit dans le dossier choisi, sans remplacer un fichier du même nom")
    void writesWithoutReplacing() throws Exception {
        MachineDocumentWriter writer = new MachineDocumentWriter(true);
        StorageTarget checked = writer.check(1L, 7L, target(folder.toString()));
        assertThat(checked.getLocalPath()).isEqualTo(folder.toAbsolutePath().normalize().toString());
        assertThat(writer.offered()).isTrue();

        DocumentFile file = DocumentFile.markdown("Weekly report", "# Week 46\n");
        Written first = writer.write(1L, 7L, checked, file);
        Written second = writer.write(1L, 7L, checked, file);

        assertThat(first.fileName()).isEqualTo("Weekly report.md");
        assertThat(second.fileName()).isEqualTo("Weekly report (2).md");
        assertThat(Files.readString(Path.of(first.location()), StandardCharsets.UTF_8)).isEqualTo("# Week 46\n");
        assertThat(Path.of(second.location())).exists();
    }

    @Test
    @DisplayName("sur un serveur, la machine n'est pas une cible")
    void refusedOnAServer() {
        MachineDocumentWriter writer = new MachineDocumentWriter(false);
        assertThat(writer.offered()).isFalse();
        assertThatThrownBy(() -> writer.check(1L, 7L, target(folder.toString())))
            .isInstanceOf(BusinessException.class).hasMessageContaining("desktop app");
    }

    @Test
    @DisplayName("un dossier qui n'existe pas est refusé, avec ce qu'il faut faire")
    void missingFolder() {
        MachineDocumentWriter writer = new MachineDocumentWriter(true);
        assertThatThrownBy(() -> writer.check(1L, 7L, target(folder.resolve("nope").toString())))
            .isInstanceOf(BusinessException.class).hasMessageContaining("Choose another one");
        assertThatThrownBy(() -> writer.check(1L, 7L, target(" ")))
            .isInstanceOf(BusinessException.class);
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
        "Rapport.md, 2, Rapport (2).md",
        "Rapport, 3, Rapport (3)",
        "a.b.md, 2, a.b (2).md",
    })
    @DisplayName("le nom suivant garde l'extension")
    void numbered(String name, int copy, String expected) {
        assertThat(MachineDocumentWriter.numbered(name, copy)).isEqualTo(expected);
    }

    @ParameterizedTest(name = "\"{0}\" -> \"{1}\"")
    @CsvSource(delimiter = '|', value = {
        "Weekly report|Weekly report.md",
        "Q4: plan / budget?|Q4 plan budget.md",
        "  ...  |Document.md",
        "Notes.|Notes.md",
        "a<b>c|a b c.md",
    })
    @DisplayName("le nom du fichier est sûr partout")
    void safeFileName(String title, String expected) {
        assertThat(DocumentFile.markdown(title, "x").fileName()).isEqualTo(expected);
    }

    @Test
    @DisplayName("l'empreinte est celle du texte en UTF-8")
    void sha256() {
        assertThat(DocumentFile.markdown("t", "abc").sha256())
            .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
