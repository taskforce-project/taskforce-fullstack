package com.taskforce.tf_api.shared.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.minio.MinioClient;

@Configuration
public class MinioConfig {

    @Value("${minio.endpoint}")
    private String endpoint;

    /** Endpoint public (navigateur) pour signer les URLs présignées ; vide → repli sur l'interne. */
    @Value("${minio.public-endpoint:}")
    private String publicEndpoint;

    @Value("${minio.access-key}")
    private String accessKey;

    @Value("${minio.secret-key}")
    private String secretKey;

    /**
     * Région S3 fixée EXPLICITEMENT (défaut MinIO « us-east-1 »). Sans elle, la présignature déclenche
     * un appel réseau {@code getBucketLocation} vers l'endpoint du client ; pour le client public
     * (localhost:9000) cet appel part du conteneur backend et échoue (localhost = le backend lui-même) →
     * URL présignée nulle, aucune preview (ISS-13). Avec la région, la présignature est 100 % locale.
     */
    @Value("${minio.region:us-east-1}")
    private String region;

    /** Client interne : upload / lecture / suppression via le réseau Docker (minio:9000). */
    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .region(region)
                .credentials(accessKey, secretKey)
                .build();
    }

    /**
     * Client dédié à la SIGNATURE des URLs présignées : signe avec l'endpoint PUBLIC (joignable par
     * le navigateur). MinIO inclut l'hôte dans la signature — impossible de réécrire l'hôte après coup,
     * il faut donc signer directement avec le bon hôte. Repli sur l'endpoint interne si non configuré.
     */
    @Bean
    public MinioClient minioPublicClient() {
        String signingEndpoint = (publicEndpoint != null && !publicEndpoint.isBlank()) ? publicEndpoint : endpoint;
        return MinioClient.builder()
                .endpoint(signingEndpoint)
                .region(region)
                .credentials(accessKey, secretKey)
                .build();
    }
}
