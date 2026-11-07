; Réglages de l'installeur Windows, inclus par electron-builder (nsis.include dans electron-builder.yml ; hors de
; build/, dossier généré et ignoré par git).

; Une mise à jour s'installe sans fenêtre (le CEO, 05/11/2026, devant « TaskForce Setup, Installing, please wait... » :
; « c'est une fenêtre système Windows, c'est naze ») : l'app montre son propre écran avant de passer la main, puis se
; rouvre (cf. desktop/src/updater.ts). L'app lance déjà l'installeur avec /S ; le passer ici en silence vaut aussi quand
; une version plus ancienne de l'app le lance sans /S (« Restart now » de la 1.7.0 et d'avant). --force-run, que l'app
; passe au redémarrage, rouvre l'app à la fin, silence ou pas. Les mises à jour seules portent --updated : une première
; installation ou une réinstallation depuis le site gardent leur fenêtre.
!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endIf}
!macroend

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
