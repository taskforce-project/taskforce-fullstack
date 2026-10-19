FROM quay.io/keycloak/keycloak:26.5.2

# Copier les realms pour l'import
USER root
COPY realms/dev /opt/keycloak/data/import/
# Pages de connexion aux couleurs de TaskForce (loginTheme du realm)
COPY themes/taskforce /opt/keycloak/themes/taskforce/
RUN chown -R keycloak:keycloak /opt/keycloak/data/import /opt/keycloak/themes/taskforce
USER keycloak
