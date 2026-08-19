# ===============================
# DOCKERFILE MULTI-STAGE
# Compatible DEV et PROD
# ===============================

# ================================
# Stage 1: Build
# ================================
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

# Copier uniquement pom.xml pour cache des dépendances
COPY pom.xml .

# Télécharger les dépendances (layer mis en cache)
RUN mvn dependency:go-offline -B

# Copier le code source
COPY src ./src

# Build de l'application (skip tests pour plus de rapidité en dev)
ARG SKIP_TESTS=true
RUN mvn clean package -Dmaven.test.skip=${SKIP_TESTS}

# ================================
# Stage 2: Runtime
# ================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Mettre à jour les paquets OS de base (CVE HIGH curl/libcurl/libexpat/p11-kit — audit Trivy 17/08/2026),
# puis installer curl pour le healthcheck.
RUN apk upgrade --no-cache && apk add --no-cache curl

# Télécharger le Java agent OpenTelemetry (instrumentation automatique pour SigNoz/OTLP)
# Désactivé par défaut via OTEL_SDK_DISABLED=true - activer dans .env.dev quand le profil observability est utilisé
# 2.12.0 → 2.26.1 (22/07/2026, audit Trivy) : l'agent 2.12.0 porte une CVE CRITICAL.
ARG OTEL_AGENT_VERSION=2.26.1
RUN mkdir -p /otel && \
    curl -fsSL -o /otel/opentelemetry-javaagent.jar \
    "https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_AGENT_VERSION}/opentelemetry-javaagent.jar"

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S spring && adduser -S spring -G spring

# Copier le JAR depuis le stage build
COPY --from=build /app/target/*.jar app.jar

# Changer le propriétaire
RUN chown spring:spring app.jar && chown -R spring:spring /otel

# Dossier de logs (logback y écrit application.log) — créé + possédé par spring, sinon FileNotFoundException au boot.
RUN mkdir -p /var/log/taskforce-api && chown spring:spring /var/log/taskforce-api

# Utiliser l'utilisateur non-root
USER spring:spring

# Port exposé
EXPOSE 8080

# Variables d'environnement par défaut
# SPRING_PROFILES_ACTIVE=prod : défaut SÛR (fail-safe). Le profil `prod` exige des secrets/env
# (DB, Keycloak, TF_ENCRYPTION_KEY…) → un `docker run` nu ÉCHOUE au démarrage au lieu de tourner
# avec les réglages permissifs de `dev` (`flyway clean` armé, tokens HS512 maison, mot de passe DB
# par défaut). Le dev surcharge explicitement en `dev` (docker-compose.dev.yml), la prod en `prod`
# (docker-compose.prod.yml). Cf. PC-024.
# OTEL_JAVA_AGENT : vide par défaut, surchargé dans docker-compose quand le profil observability est actif.
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-Xms256m -Xmx512m" \
    OTEL_JAVA_AGENT=""

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# Commande de démarrage avec support des profils
# $OTEL_JAVA_AGENT est vide par défaut ou "-javaagent:/otel/opentelemetry-javaagent.jar" si observability activé
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS $OTEL_JAVA_AGENT -Djava.security.egd=file:/dev/./urandom -jar app.jar"]

