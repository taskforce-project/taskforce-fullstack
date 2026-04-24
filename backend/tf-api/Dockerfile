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
RUN mvn clean package -DskipTests=${SKIP_TESTS}

# ================================
# Stage 2: Runtime
# ================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Installer curl pour healthcheck
RUN apk add --no-cache curl

# Télécharger le Java agent OpenTelemetry (instrumentation automatique pour SigNoz/OTLP)
# Désactivé par défaut via OTEL_SDK_DISABLED=true - activer dans .env.dev quand le profil observability est utilisé
ARG OTEL_AGENT_VERSION=2.12.0
RUN mkdir -p /otel && \
    curl -fsSL -o /otel/opentelemetry-javaagent.jar \
    "https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v${OTEL_AGENT_VERSION}/opentelemetry-javaagent.jar"

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S spring && adduser -S spring -G spring

# Copier le JAR depuis le stage build
COPY --from=build /app/target/*.jar app.jar

# Changer le propriétaire
RUN chown spring:spring app.jar && chown -R spring:spring /otel

# Utiliser l'utilisateur non-root
USER spring:spring

# Port exposé
EXPOSE 8080

# Variables d'environnement par défaut
# OTEL_JAVA_AGENT : vide par défaut, surchargé dans docker-compose quand le profil observability est actif
ENV SPRING_PROFILES_ACTIVE=dev \
    JAVA_OPTS="-Xms256m -Xmx512m" \
    OTEL_JAVA_AGENT=""

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/api/actuator/health || exit 1

# Commande de démarrage avec support des profils
# $OTEL_JAVA_AGENT est vide par défaut ou "-javaagent:/otel/opentelemetry-javaagent.jar" si observability activé
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS $OTEL_JAVA_AGENT -Djava.security.egd=file:/dev/./urandom -jar app.jar"]

