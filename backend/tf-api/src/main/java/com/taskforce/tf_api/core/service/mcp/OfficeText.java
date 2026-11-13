package com.taskforce.tf_api.core.service.mcp;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import com.taskforce.tf_api.shared.exception.BusinessException;

/**
 * Le texte d'un document Word ou PowerPoint (OOXML), lu en Java avec le seul JDK, sans dépendance : un fichier Office est
 * une archive ZIP de XML, et son texte est dans les éléments {@code w:t} (Word) ou {@code a:t} (PowerPoint), un
 * paragraphe par {@code w:p} ou {@code a:p}. Assez pour qu'une réponse de Cortex cite un document de l'entreprise ; la
 * mise en forme et les tableaux complexes attendront la lecture de R96 (Tika, POI).
 *
 * <p>Sûr sur un fichier du dehors : aucune entité externe ni DTD, une archive bornée (taille décompressée et nombre de
 * parties), un texte borné.</p>
 */
public final class OfficeText {

    public static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    public static final String PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    private static final long MAX_UNZIPPED = 20L * 1024 * 1024;
    private static final int MAX_ENTRIES = 2_000;
    private static final Pattern SLIDE = Pattern.compile("ppt/slides/slide(\\d{1,4})\\.xml");

    private OfficeText() {
    }

    /** Un type que cette lecture sait ouvrir ? */
    public static boolean readable(String mimeType, String name) {
        return kind(mimeType, name) != null;
    }

    /** Le texte du document, borné à {@code maxChars}. */
    public static String extract(byte[] file, String mimeType, String name, int maxChars) {
        String kind = kind(mimeType, name);
        if (kind == null) throw new BusinessException("TaskForce can't read this kind of file yet.");
        Map<String, byte[]> parts = unzip(file, kind);
        StringBuilder out = new StringBuilder();
        if ("docx".equals(kind)) {
            byte[] body = parts.get("word/document.xml");
            if (body == null) throw new BusinessException("This Word document has no text.");
            paragraphs(body, "p", "t", out, maxChars);
        } else {
            for (Map.Entry<String, byte[]> slide : parts.entrySet()) {
                if (out.length() >= maxChars) break;
                if (!out.isEmpty()) out.append("\n");
                out.append("[Slide ").append(slide.getKey()).append("]\n");
                paragraphs(slide.getValue(), "p", "t", out, maxChars);
            }
        }
        return out.length() > maxChars ? out.substring(0, maxChars) : out.toString().strip();
    }

    private static String kind(String mimeType, String name) {
        String n = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        if (DOCX.equals(mimeType) || n.endsWith(".docx")) return "docx";
        if (PPTX.equals(mimeType) || n.endsWith(".pptx")) return "pptx";
        return null;
    }

    /** Les parties utiles de l'archive : le corps d'un document, ou les diapositives dans l'ordre. */
    private static Map<String, byte[]> unzip(byte[] file, String kind) {
        Map<String, byte[]> out = new TreeMap<>((a, b) -> {
            if ("docx".equals(kind)) return a.compareTo(b);
            return Integer.compare(Integer.parseInt(a), Integer.parseInt(b));
        });
        long total = 0;
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(file))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) throw new BusinessException("This document is too large to read.");
                String key = null;
                if ("docx".equals(kind) && "word/document.xml".equals(entry.getName())) key = entry.getName();
                Matcher m = SLIDE.matcher(entry.getName());
                if ("pptx".equals(kind) && m.matches()) key = m.group(1);
                if (key == null) continue;
                byte[] data = zip.readNBytes((int) Math.min(MAX_UNZIPPED - total + 1, Integer.MAX_VALUE - 8));
                total += data.length;
                if (total > MAX_UNZIPPED) throw new BusinessException("This document is too large to read.");
                out.put(key, data);
            }
        } catch (IOException e) {
            throw new BusinessException("This document couldn't be opened.");
        }
        return out;
    }

    /** Le texte des éléments {@code <x:t>}, un paragraphe par {@code <x:p>}. */
    private static void paragraphs(byte[] xml, String paragraph, String text, StringBuilder out, int maxChars) {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
        List<String> line = new ArrayList<>();
        boolean inText = false;
        try (InputStream in = new ByteArrayInputStream(xml)) {
            XMLStreamReader r = factory.createXMLStreamReader(in);
            try {
                while (r.hasNext() && out.length() < maxChars) {
                    int event = r.next();
                    if (event == XMLStreamConstants.START_ELEMENT && text.equals(r.getLocalName())) {
                        inText = true;
                    } else if (event == XMLStreamConstants.END_ELEMENT && text.equals(r.getLocalName())) {
                        inText = false;
                    } else if (event == XMLStreamConstants.CHARACTERS && inText) {
                        line.add(r.getText());
                    } else if (event == XMLStreamConstants.END_ELEMENT && paragraph.equals(r.getLocalName())) {
                        String joined = String.join("", line).strip();
                        if (!joined.isEmpty()) out.append(joined).append('\n');
                        line.clear();
                    }
                }
            } finally {
                r.close();
            }
        } catch (XMLStreamException | IOException e) {
            throw new BusinessException("This document couldn't be read.");
        }
    }
}
