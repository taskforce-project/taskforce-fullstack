package com.taskforce.tf_api.shared.util;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Iterator;

/**
 * Utilitaires image SANS dépendance externe ({@code javax.imageio} + AWT headless).
 *
 * <p>Motif : l'upload d'avatar stockait le fichier <b>plein format</b> (jusqu'à 3 Mo) alors qu'il est
 * affiché en ~36 px → on servait ~1,4 Mo pour une vignette (audit Lighthouse : l'avatar pesait ~60 %
 * du poids de la page). On le ramène à {@value #MAX} px, aplati sur fond blanc (le JPEG n'a pas de
 * canal alpha → la transparence deviendrait noire) et ré-encodé en JPEG qualité {@value #QUALITY}.</p>
 */
public final class ImageUtils {

    /** Côté max de l'avatar servi (px) ; l'affichage ne dépasse jamais ~64 px, retina inclus. */
    public static final int MAX = 256;
    /** Qualité JPEG de sortie (0..1). */
    public static final float QUALITY = 0.85f;

    private ImageUtils() {}

    /**
     * Redimensionne une image en vignette max {@value #MAX} px (ratio préservé, <b>jamais agrandie</b>),
     * ré-encodée en JPEG. Renvoie {@code null} si l'entrée n'est pas une image décodable (SVG, corrompu,
     * format exotique) : le caller retombe alors sur l'original pour ne jamais casser l'upload.
     */
    public static byte[] resizeAvatar(byte[] input) {
        if (input == null || input.length == 0) return null;
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(input));
            if (src == null) return null;

            int w = src.getWidth();
            int h = src.getHeight();
            double scale = Math.min(1.0, (double) MAX / Math.max(w, h)); // downscale uniquement
            int tw = Math.max(1, (int) Math.round(w * scale));
            int th = Math.max(1, (int) Math.round(h * scale));

            BufferedImage dst = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = dst.createGraphics();
            try {
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, tw, th);
                g.drawImage(src, 0, 0, tw, th, null);
            } finally {
                g.dispose();
            }
            return encodeJpeg(dst);
        } catch (Exception e) {
            return null; // toute erreur de décodage/encodage → fallback original
        }
    }

    private static byte[] encodeJpeg(BufferedImage img) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            ImageIO.write(img, "jpg", out); // repli très improbable (qualité par défaut)
            return out.toByteArray();
        }
        ImageWriter writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        if (param.canWriteCompressed()) {
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(QUALITY);
        }
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(img, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }
}
