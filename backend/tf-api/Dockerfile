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

# Build de l'application (skip tests pour plus de rapidité)
RUN mvn clean package -DskipTests

# ================================
# Stage 2: Runtime
# ================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/actuator/health || exit 1

# Variables d'environnement par défaut
ENV SPRING_PROFILE=dev \
    JAVA_OPTS="-Xmx512m -Xms256m"

# Lancement de l'application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

