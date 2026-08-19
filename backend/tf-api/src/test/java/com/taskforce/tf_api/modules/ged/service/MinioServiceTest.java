package com.taskforce.tf_api.modules.ged.service;

import java.io.ByteArrayInputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import io.minio.MakeBucketArgs;
import io.minio.MinioClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests unitaires — {@link MinioService} (stockage objet). {@code MinioClient} mocké.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MinioService")
class MinioServiceTest {

    @Mock private MinioClient minioClient;
    @InjectMocks private MinioService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "bucket", "tf-bucket");
    }

    @Test
    @DisplayName("ensureBucket crée le bucket s'il n'existe pas")
    void ensureBucket_creates_when_absent() throws Exception {
        when(minioClient.bucketExists(any())).thenReturn(false);

        service.ensureBucket();

        verify(minioClient).makeBucket(any(MakeBucketArgs.class));
    }

    @Test
    @DisplayName("ensureBucket ne recrée pas un bucket existant")
    void ensureBucket_skips_when_present() throws Exception {
        when(minioClient.bucketExists(any())).thenReturn(true);

        service.ensureBucket();

        verify(minioClient, never()).makeBucket(any());
    }

    @Test
    @DisplayName("upload délègue putObject")
    void upload_delegates() throws Exception {
        service.upload("key", new ByteArrayInputStream("x".getBytes()), 1, "text/plain");

        verify(minioClient).putObject(any());
    }

    @Test
    @DisplayName("upload en erreur → RuntimeException")
    void upload_error_wrapped() throws Exception {
        when(minioClient.putObject(any())).thenThrow(new RuntimeException("io"));

        assertThatThrownBy(() -> service.upload("k", new ByteArrayInputStream("x".getBytes()), 1, "text/plain"))
            .isInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("presignedGetUrl renvoie l'URL signée")
    void presigned_url() throws Exception {
        when(minioClient.getPresignedObjectUrl(any())).thenReturn("https://minio/tf/key?sig=1");

        assertThat(service.presignedGetUrl("key")).contains("minio");
    }

    @Test
    @DisplayName("delete délègue removeObject")
    void delete_delegates() throws Exception {
        service.delete("key");

        verify(minioClient).removeObject(any());
    }

    @Test
    @DisplayName("contentType renvoie le type par défaut en cas d'erreur")
    void content_type_default_on_error() throws Exception {
        when(minioClient.statObject(any())).thenThrow(new RuntimeException("missing"));

        assertThat(service.contentType("key")).isEqualTo("application/octet-stream");
    }
}
