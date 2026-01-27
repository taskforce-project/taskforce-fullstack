FROM quay.io/keycloak/keycloak:26.5.2

# Copier les realms pour l'import
USER root
COPY realms/dev /opt/keycloak/data/import/
RUN chown -R keycloak:keycloak /opt/keycloak/data/import
USER keycloak
