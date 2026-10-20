; Réglages de l'installeur Windows, inclus par electron-builder (nsis.include dans electron-builder.yml ; hors de
; build/, dossier généré et ignoré par git).

; Désinstallation demandée par la personne : la page « merci » du site s'ouvre dans son navigateur
; (landing-page/src/pages/goodbye.astro). Pas pendant une mise à jour, où l'installeur lance l'ancien désinstalleur
; avec --updated, ni pour une désinstallation silencieuse (/S) lancée par un outil d'administration.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ClearErrors
    ${GetParameters} $R0
    ${GetOptions} $R0 "/S" $R1
    ${if} ${Errors}
      ExecShell "open" "https://taskforce-project.fr/goodbye"
    ${endIf}
  ${endIf}
!macroend
