package com.taskforce.tf_api.shared.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ImageUtils — resize avatar (vignette JPEG, sans dépendance)")
class ImageUtilsTest {

    private static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    @Test
    @DisplayName("réduit une grande image au côté max, ré-encode en JPEG décodable")
    void resize_downscalesLargeImage() throws Exception {
        byte[] resized = ImageUtils.resizeAvatar(png(800, 600));
        assertThat(resized).isNotNull();

        BufferedImage out = ImageIO.read(new ByteArrayInputStream(resized));
        assertThat(out).isNotNull();
        assertThat(Math.max(out.getWidth(), out.getHeight())).isEqualTo(ImageUtils.MAX); // 800 → 256
        assertThat(out.getWidth()).isEqualTo(256);
        assertThat(out.getHeight()).isEqualTo(192); // 600 * 256/800
    }

    @Test
    @DisplayName("n'agrandit jamais une petite image")
    void resize_doesNotUpscaleSmallImage() throws Exception {
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(ImageUtils.resizeAvatar(png(64, 64))));
        assertThat(out.getWidth()).isEqualTo(64);
        assertThat(out.getHeight()).isEqualTo(64);
    }

    @Test
    @DisplayName("renvoie null pour une entrée non décodable (→ fallback original côté service)")
    void resize_returnsNullForNonImage() {
        assertThat(ImageUtils.resizeAvatar("pas une image".getBytes())).isNull();
        assertThat(ImageUtils.resizeAvatar(new byte[0])).isNull();
        assertThat(ImageUtils.resizeAvatar(null)).isNull();
    }
}
