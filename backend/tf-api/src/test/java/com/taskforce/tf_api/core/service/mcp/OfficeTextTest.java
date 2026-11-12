package com.taskforce.tf_api.core.service.mcp;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.taskforce.tf_api.shared.exception.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("Le texte d'un document Word ou PowerPoint, lu avec le seul JDK")
class OfficeTextTest {

    private static byte[] zip(Map<String, String> parts) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (Map.Entry<String, String> p : parts.entrySet()) {
                zip.putNextEntry(new ZipEntry(p.getKey()));
                zip.write(p.getValue().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static final String W = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"";
    private static final String A = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"";

    @Test
    @DisplayName("Word : un paragraphe par ligne, les morceaux d'un paragraphe recollés")
    void word() throws IOException {
        byte[] docx = zip(Map.of("word/document.xml", "<w:document " + W + "><w:body>"
            + "<w:p><w:r><w:t>Revenue </w:t></w:r><w:r><w:t>target</w:t></w:r></w:p>"
            + "<w:p><w:r><w:t>1.2 M</w:t></w:r></w:p><w:p/></w:body></w:document>"));
        assertThat(OfficeText.extract(docx, OfficeText.DOCX, "plan.docx", 1000)).isEqualTo("Revenue target\n1.2 M");
        assertThat(OfficeText.readable(null, "Plan.DOCX")).isTrue();
    }

    @Test
    @DisplayName("PowerPoint : les diapositives dans l'ordre de leur numéro")
    void slides() throws IOException {
        Map<String, String> parts = new LinkedHashMap<>();
        parts.put("ppt/slides/slide10.xml", "<p:sld xmlns:p=\"p\" " + A + "><a:p><a:r><a:t>Ten</a:t></a:r></a:p></p:sld>");
        parts.put("ppt/slides/slide2.xml", "<p:sld xmlns:p=\"p\" " + A + "><a:p><a:r><a:t>Two</a:t></a:r></a:p></p:sld>");
        parts.put("ppt/presentation.xml", "<p/>");
        String text = OfficeText.extract(zip(parts), OfficeText.PPTX, "deck.pptx", 1000);
        assertThat(text).isEqualTo("[Slide 2]\nTwo\n\n[Slide 10]\nTen");
    }

    @Test
    @DisplayName("borné, et sûr : pas de DTD, un type inconnu refusé, une archive cassée refusée")
    void boundedAndSafe() throws IOException {
        byte[] docx = zip(Map.of("word/document.xml", "<w:document " + W + "><w:body><w:p><w:r><w:t>"
            + "x".repeat(500) + "</w:t></w:r></w:p></w:body></w:document>"));
        assertThat(OfficeText.extract(docx, OfficeText.DOCX, "a.docx", 100)).hasSizeLessThanOrEqualTo(100);

        byte[] dtd = zip(Map.of("word/document.xml", "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM "
            + "\"file:///etc/passwd\">]><w:document " + W + "><w:p><w:t>&e;</w:t></w:p></w:document>"));
        // Une entité externe n'est jamais lue : le document est refusé, ou lu sans elle.
        try {
            assertThat(OfficeText.extract(dtd, OfficeText.DOCX, "a.docx", 100)).doesNotContain("root");
        } catch (BusinessException refused) {
            assertThat(refused).hasMessageContaining("couldn't be read");
        }
        assertThatThrownBy(() -> OfficeText.extract(new byte[] { 1, 2, 3 }, "application/pdf", "a.pdf", 100))
            .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> OfficeText.extract(zip(Map.of("other.xml", "<x/>")), OfficeText.DOCX, "a.docx", 100))
            .isInstanceOf(BusinessException.class).hasMessageContaining("no text");
    }
}
