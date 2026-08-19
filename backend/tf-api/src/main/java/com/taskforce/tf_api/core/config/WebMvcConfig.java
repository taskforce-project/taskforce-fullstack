package com.taskforce.tf_api.core.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.taskforce.tf_api.core.security.WorkspaceAccessInterceptor;

import lombok.RequiredArgsConstructor;

/**
 * Enregistre l'intercepteur RBAC d'accès workspace (PROD-3.2).
 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final WorkspaceAccessInterceptor workspaceAccessInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(workspaceAccessInterceptor)
            .addPathPatterns("/api/workspaces/**");
    }
}
