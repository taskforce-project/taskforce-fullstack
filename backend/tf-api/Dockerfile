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

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S spring && adduser -S spring -G spring

# Copier le JAR depuis le stage build
COPY --from=build /app/target/*.jar app.jar

# Changer le propriétaire
RUN chown spring:spring app.jar

# Utiliser l'utilisateur non-root
USER spring:spring

# Port exposé
EXPOSE 8080

# Variables d'environnement par défaut
ENV SPRING_PROFILES_ACTIVE=dev \
    JAVA_OPTS="-Xms256m -Xmx512m"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/api/actuator/health || exit 1

# Commande de démarrage avec support des profils
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -Djava.security.egd=file:/dev/./urandom -jar app.jar"]

# Variables d'environnement par défaut
ENV SPRING_PROFILE=dev \
    JAVA_OPTS="-Xmx512m -Xms256m"

# Lancement de l'application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

