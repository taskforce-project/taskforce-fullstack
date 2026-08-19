package com.taskforce.tf_api.modules.ged.service;

import java.io.InputStream;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class MinioService {

    private final MinioClient minioClient;
    /** Client signant les URLs présignées avec l'endpoint PUBLIC (joignable par le navigateur). */
    private final MinioClient minioPublicClient;

    @Value("${minio.bucket}")
    private String bucket;

    @PostConstruct
    public void ensureBucket() {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("Minio bucket '{}' created", bucket);
            }
        } catch (Exception e) {
            log.warn("Could not ensure Minio bucket '{}': {}", bucket, e.getMessage());
        }
    }

    public void upload(String objectKey, InputStream stream, long size, String contentType) {
        try {
            minioClient.putObject(
                PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(stream, size, -1)
                    .contentType(contentType)
                    .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("Minio upload failed: " + e.getMessage(), e);
        }
    }

    public String presignedGetUrl(String objectKey) {
        try {
            return minioPublicClient.getPresignedObjectUrl(
                GetPresignedObjectUrlArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .method(Method.GET)
                    .expiry(1, TimeUnit.HOURS)
                    .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("Minio presign failed: " + e.getMessage(), e);
        }
    }

    public void delete(String objectKey) {
        try {
            minioClient.removeObject(
                RemoveObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("Minio delete failed: " + e.getMessage(), e);
        }
    }

    /** Type MIME stocké de l'objet (pour servir avec le bon Content-Type). */
    public String contentType(String objectKey) {
        try {
            return minioClient.statObject(
                StatObjectArgs.builder().bucket(bucket).object(objectKey).build()
            ).contentType();
        } catch (Exception e) {
            return "application/octet-stream";
        }
    }

    public InputStream getObjectStream(String objectKey) {
        try {
            return minioClient.getObject(
                GetObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .build()
            );
        } catch (Exception e) {
            throw new RuntimeException("Minio object not found: " + objectKey, e);
        }
    }
}
