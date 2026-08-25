---
title: Intégrations
subtitle: Connecter vos outils à votre espace.
---

TaskForce se connecte aux outils que votre équipe utilise déjà. Les connexions se gèrent depuis la
carte **« Connecter vos outils »** du Dashboard, ou dans les **Paramètres**.

## Outils connectables

Aujourd'hui, vous pouvez connecter :

<CardGroup cols={2}>
  <Card title="GitHub" icon="github">
    Reliez votre code à vos opérations.
  </Card>
  <Card title="Slack" icon="slack">
    Portez l'activité de TaskForce dans vos canaux.
  </Card>
</CardGroup>

D'autres outils figurent dans le **catalogue** et s'ajouteront progressivement. Le catalogue indique,
pour chacun, s'il est **connecté** ou non, et combien sont disponibles.

## Connecter un outil

<Steps>
  <Step title="Ouvrir le catalogue">
    Depuis la carte du Dashboard ou les Paramètres, ouvrez les **Intégrations**.
  </Step>
  <Step title="Connecter">
    Cliquez sur **Connecter**. Selon l'outil, l'autorisation passe par **OAuth** (redirection vers le
    service) ou par une **configuration** (jeton / paramètres).
  </Step>
  <Step title="Gérer ensuite">
    Une fois connecté, l'outil se **gère** ou se **déconnecte** depuis la même page.
  </Step>
</Steps>

{/* SCREENSHOT: integrations-catalog — le catalogue d'intégrations (connectés / disponibles) */}

<Info>
  Les **identifiants** de connexion sont **chiffrés** au repos. La gestion des intégrations est
  réservée aux **Propriétaires et Admins** de l'espace. → [Membres & rôles](/guides/membres-et-roles)
</Info>
