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
                        .title("TaskForce API")
                        .version("1.0.0")
                        .description("REST API of TaskForce, the open-source project management and AI delivery platform")
                        // Le projet n'a pas d'adresse de support : on renvoie au dépôt, où se posent les questions.
                        .contact(new Contact()
                                .name("TaskForce")
                                .url("https://github.com/taskforce-project/taskforce-fullstack"))
                        .license(new License()
                                .name("AGPL-3.0")
                                .url("https://www.gnu.org/licenses/agpl-3.0.html")))
                .components(new Components()
                        .addSecuritySchemes("bearer-jwt", new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Access token returned by POST /api/auth/login")))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"));
    }
}
