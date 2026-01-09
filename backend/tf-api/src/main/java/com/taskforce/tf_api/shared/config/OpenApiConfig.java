package com.taskforce.tf_api.shared.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration OpenAPI/Swagger pour la documentation de l'API
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Taskforce API")
                        .version("1.0.0")
                        .description("API REST modulaire pour l'ERP Taskforce")
                        .contact(new Contact()
                                .name("Taskforce Team")
                                .email("support@taskforce.com"))
                        .license(new License()
                                .name("Propriétaire")
                                .url("https://taskforce.com/license")))
                .components(new Components()
                        .addSecuritySchemes("bearer-jwt", new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("JWT token obtenu via Keycloak")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
