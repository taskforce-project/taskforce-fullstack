; Réglages de l'installeur Windows, inclus par electron-builder (nsis.include dans electron-builder.yml ; hors de
; build/, dossier généré et ignoré par git).

; Une mise à jour s'installe sans fenêtre système (le CEO, 05/11/2026, devant « TaskForce Setup, Installing, please
; wait... » : « c'est une fenêtre système Windows, c'est naze ») : l'app montre son propre écran avant de passer la
; main, puis se rouvre (cf. desktop/src/updater.ts). L'app lance déjà l'installeur avec /S ; le passer ici en silence
; vaut aussi quand une version plus ancienne de l'app le lance sans /S (« Restart now » de la 1.7.0 et d'avant).
; --force-run, que l'app passe au redémarrage, rouvre l'app à la fin, silence ou pas. Les mises à jour seules portent
; --updated : une première installation ou une réinstallation depuis le site gardent leur fenêtre.
!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endIf}
!macroend

; L'écran de la mise à jour (R143, le CEO le 08/11/2026 : « Comme si on restait tjr sur l'app quoi ») : de l'écran de
; l'app qui se ferme à celui de la nouvelle version, une fenêtre aux couleurs de TaskForce dit ce qui se passe. Elle ne
; peut pas venir de l'app, puisque l'installeur remplace TaskForce.exe : c'est l'installeur qui la dessine, avec ce que
; NSIS embarque déjà (le greffon System et les bibliothèques de Windows). Aucun exécutable de plus, aucun script, et
; surtout pas mshta ni un PowerShell caché : l'app n'est pas signée, un antivirus l'a déjà signalée.
;
; L'installeur lancé par « Restart now » se dédouble, avec le même fichier :
;   - le superviseur (ce code, avant tout le reste) tient la fenêtre et lance le travailleur ;
;   - le travailleur (--update-worker) est l'installation d'electron-builder, inchangée, sans fenêtre.
; Pourquoi deux processus : le gabarit d'electron-builder sort par « Quit » à chaque échec et n'offre aucun crochet après
; la relance de l'app. Le code de sortie du travailleur dit donc l'échec, et la fenêtre peut le dire puis rouvrir l'app ;
; elle ne se ferme que quand la nouvelle fenêtre de l'app est là. Une mise à jour installée en quittant l'app (sans
; --force-run) reste invisible : la personne a fermé TaskForce.
;
; La passation entre l'app et l'installeur tient dans un fichier, « update-screen », dans le dossier de l'app, qui existe
; tant que cette fenêtre est à l'écran : l'ancienne app attend qu'il apparaisse pour quitter, la nouvelle l'efface en
; montrant sa première fenêtre (cf. desktop/src/update-pending.ts).
!ifndef BUILD_UNINSTALLER
  !define TF_WORKER_FLAG "--update-worker"

  !macro preInit
    Call tfUpdateScreen
  !macroend

  ; Sans ce crochet, le gabarit montre une boîte de dialogue système quand l'ancien désinstalleur échoue : même en silence,
  ; elle attend un clic, et le travailleur reste bloqué derrière. Pour une mise à jour, c'est l'écran qui le dit ; une
  ; installation depuis le site garde sa boîte.
  !macro customUnInstallCheck
    IfErrors 0 +3
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return
    ${if} $R0 != 0
      ${ifNot} ${isUpdated}
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
      ${endIf}
      DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
      SetErrorLevel 2
      Quit
    ${endIf}
  !macroend

  ; En points de 96 ppp, comme desktop/static/splash.html, et mêmes couleurs : on passe d'une fenêtre à l'autre sans le voir.
  !define TF_WIDTH 420
  !define TF_HEIGHT 280
  !define TF_LOGO 56
  !define TF_BAR_WIDTH 180
  !define TF_BAR_THUMB 72
  !define TF_INK_LIGHT 0x00191B1C
  !define TF_MUTED_LIGHT 0x0062686B
  !define TF_BG_LIGHT 0x00FCFBFB
  !define TF_LINE_LIGHT 0x00E9E6E6
  !define TF_STILL_LIGHT 0x00F9B395
  !define TF_INK_DARK 0x00E8EBEC
  !define TF_MUTED_DARK 0x008F979A
  !define TF_BG_DARK 0x0016110E
  !define TF_LINE_DARK 0x00332B26
  !define TF_STILL_DARK 0x00863E1E
  !define TF_ACCENT 0x00F66B2F

  ; Une image du dessin de la barre par pas de 50 ms : son aller dure 1,4 s, comme dans la page.
  !define TF_FRAMES 28

  !macro tfPx RESULT VALUE
    IntOp ${RESULT} ${VALUE} * $tfDpi
    IntOp ${RESULT} ${RESULT} / 96
  !macroend

  ; Une ligne de texte centrée, à la hauteur TOP (points) et sur HEIGHT points.
  !macro tfLine HDC FONT COLOR TOP HEIGHT TEXT
    !insertmacro tfPx $6 ${TOP}
    !insertmacro tfPx $7 ${HEIGHT}
    IntOp $7 $6 + $7
    StrCpy $8 "${TEXT}"
    System::Call 'gdi32::SelectObject(p ${HDC}, p ${FONT})'
    System::Call 'gdi32::SetTextColor(p ${HDC}, i ${COLOR})'
    System::Call '*$tfRect(i 0, i r6, i $tfW, i r7)'
    ; DT_CENTER, DT_VCENTER, DT_SINGLELINE, DT_NOPREFIX
    System::Call 'user32::DrawTextW(p ${HDC}, w r8, i -1, p $tfRect, i 0x825)'
  !macroend

  ; Change la phrase sous la barre.
  !macro tfSay STEP NOTE
    StrCpy $tfStep "${STEP}"
    StrCpy $tfNote "${NOTE}"
    Call tfPaint
  !macroend

  !macro customHeader
    Var tfHwnd
    Var tfDc
    Var tfDpi
    Var tfW
    Var tfH
    Var tfRect
    Var tfMsg
    Var tfBg
    Var tfLine
    Var tfInk
    Var tfMuted
    Var tfStill
    Var tfIcon
    Var tfMoves
    Var tfFrame
    Var tfBrushLine
    Var tfBrushAccent
    Var tfBarX
    Var tfBarY
    Var tfBarW
    Var tfBarH
    Var tfThumb
    Var tfTitleFont
    Var tfStepFont
    Var tfNoteFont
    Var tfStep
    Var tfNote
    Var tfBitmap
    Var tfProcess
    Var tfMark
    Var tfTitleText

    ; Dessine la page entière dans un bitmap que la fenêtre (une commande « static ») repeint d'elle-même. Un bitmap en
    ; 24 bits, sans canal alpha : la commande « static » des styles visuels traite un bitmap dont un pixel a de l'alpha
    ; comme une image transparente, et le fond et le texte, dessinés sans alpha par GDI, disparaîtraient.
    Function tfPaint
      System::Call 'user32::GetDC(p 0) p .r0'
      System::Call 'gdi32::CreateCompatibleDC(p r0) p .r1'
      IntOp $8 0 - $tfH
      ; BITMAPINFOHEADER : 24 bits par pixel, BI_RGB ; de haut en bas (hauteur négative).
      System::Call '*(i 40, i $tfW, i r8, &i2 1, &i2 24, i 0, i 0, i 0, i 0, i 0, i 0, &i4 0) p .r9'
      System::Call 'gdi32::CreateDIBSection(p r0, p r9, i 0, *p .r8, p 0, i 0) p .r2'
      System::Free $9
      System::Call 'user32::ReleaseDC(p 0, p r0)'
      System::Call 'gdi32::SelectObject(p r1, p r2) p .r3'
      System::Call 'gdi32::CreateSolidBrush(i $tfBg) p .r4'
      System::Call '*$tfRect(i 0, i 0, i $tfW, i $tfH)'
      System::Call 'user32::FillRect(p r1, p $tfRect, p r4)'
      System::Call 'gdi32::DeleteObject(p r4)'
      ${if} $tfIcon != 0
        !insertmacro tfPx $5 ${TF_LOGO}
        IntOp $6 $tfW - $5
        IntOp $6 $6 / 2
        !insertmacro tfPx $7 46
        ; DI_NORMAL
        System::Call 'user32::DrawIconEx(p r1, i r6, i r7, p $tfIcon, i r5, i r5, i 0, p 0, i 3)'
      ${endIf}
      System::Call 'gdi32::SetBkMode(p r1, i 1)'
      !insertmacro tfLine $1 $tfTitleFont $tfInk 120 33 "$tfTitleText"
      !insertmacro tfLine $1 $tfStepFont $tfMuted 192 21 "$tfStep"
      !insertmacro tfLine $1 $tfNoteFont $tfMuted 215 19 "$tfNote"
      System::Call 'gdi32::SelectObject(p r1, p r3)'
      System::Call 'gdi32::DeleteDC(p r1)'
      ; STM_SETIMAGE, IMAGE_BITMAP
      SendMessage $tfHwnd 0x172 0 $2 $0
      ${if} $tfBitmap != 0
        System::Call 'gdi32::DeleteObject(p $tfBitmap)'
      ${endIf}
      StrCpy $tfBitmap $2
      Call tfDrawBar
    FunctionEnd

    ; La barre : à l'aller, comme dans la page ; immobile sous « moins d'animations » du système.
    Function tfDrawBar
      ${if} $tfMoves != 1
        System::Call 'gdi32::CreateSolidBrush(i $tfStill) p .r0'
        IntOp $2 $tfBarX + $tfBarW
        IntOp $3 $tfBarY + $tfBarH
        System::Call '*$tfRect(i $tfBarX, i $tfBarY, i r2, i r3)'
        System::Call 'user32::FillRect(p $tfDc, p $tfRect, p r0)'
        System::Call 'gdi32::DeleteObject(p r0)'
        Return
      ${endIf}
      ; Accélère puis ralentit, en millièmes du trajet.
      ${if} $tfFrame < 14
        IntOp $0 $tfFrame * $tfFrame
      ${else}
        IntOp $0 ${TF_FRAMES} - $tfFrame
        IntOp $0 $0 - 1
        IntOp $0 $0 * $0
      ${endIf}
      IntOp $0 $0 * 2000
      IntOp $0 $0 / 729
      ${if} $tfFrame >= 14
        IntOp $0 1000 - $0
      ${endIf}
      IntOp $1 $tfBarW + $tfThumb
      IntOp $1 $1 * $0
      IntOp $1 $1 / 1000
      IntOp $1 $1 - $tfThumb
      ; Le curseur, coupé aux bords de la piste.
      IntOp $2 $1 + $tfThumb
      ${if} $1 < 0
        StrCpy $1 0
      ${endIf}
      ${if} $2 > $tfBarW
        StrCpy $2 $tfBarW
      ${endIf}
      IntOp $1 $1 + $tfBarX
      IntOp $2 $2 + $tfBarX
      IntOp $3 $tfBarX + $tfBarW
      IntOp $4 $tfBarY + $tfBarH
      System::Call '*$tfRect(i $tfBarX, i $tfBarY, i r3, i r4)'
      System::Call 'user32::FillRect(p $tfDc, p $tfRect, p $tfBrushLine)'
      ${if} $2 > $1
        System::Call '*$tfRect(i r1, i $tfBarY, i r2, i r4)'
        System::Call 'user32::FillRect(p $tfDc, p $tfRect, p $tfBrushAccent)'
      ${endIf}
    FunctionEnd

    ; Un tour de la fenêtre : ses messages, puis le dessin suivant de la barre.
    Function tfTick
      tfMore:
        System::Call 'user32::PeekMessageW(p $tfMsg, p 0, i 0, i 0, i 1) i .r0'
        ${if} $0 != 0
          System::Call 'user32::TranslateMessage(p $tfMsg)'
          System::Call 'user32::DispatchMessageW(p $tfMsg)'
          Goto tfMore
        ${endIf}
      ${if} $tfMoves == 1
        Call tfDrawBar
        IntOp $tfFrame $tfFrame + 1
        ${if} $tfFrame >= ${TF_FRAMES}
          StrCpy $tfFrame 0
        ${endIf}
      ${endIf}
    FunctionEnd

    ; Reste à l'écran `$R0` millisecondes, ou jusqu'à ce que le fichier de la passation disparaisse ($R1 = 1).
    Function tfHold
      System::Call 'kernel32::GetTickCount() i .r9'
      IntOp $R2 $9 + $R0
      tfHolding:
        Call tfTick
        Sleep 50
        ${if} $R1 == 1
          ${ifNot} ${FileExists} "$tfMark"
            Return
          ${endIf}
        ${endIf}
        System::Call 'kernel32::GetTickCount() i .r9'
        ${if} $9 < $R2
          Goto tfHolding
        ${endIf}
    FunctionEnd

    Function tfOpen
      ; Sinon Windows étire la fenêtre aux échelles de 125 % et plus, et elle est floue.
      System::Call 'user32::SetProcessDPIAware()'
      ; Dans la barre des tâches, le même bouton que l'app.
      System::Call 'shell32::SetCurrentProcessExplicitAppUserModelID(w "${APP_ID}")'
      System::Call 'user32::GetDC(p 0) p .r0'
      ; LOGPIXELSX
      System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i .r1'
      System::Call 'user32::ReleaseDC(p 0, p r0)'
      StrCpy $tfDpi $1
      !insertmacro tfPx $tfW ${TF_WIDTH}
      !insertmacro tfPx $tfH ${TF_HEIGHT}
      !insertmacro tfPx $tfBarW ${TF_BAR_WIDTH}
      !insertmacro tfPx $tfThumb ${TF_BAR_THUMB}
      !insertmacro tfPx $tfBarH 3
      !insertmacro tfPx $tfBarY 171
      IntOp $tfBarX $tfW - $tfBarW
      IntOp $tfBarX $tfBarX / 2
      System::Alloc 16
      Pop $tfRect
      System::Alloc 64
      Pop $tfMsg
      StrCpy $tfFrame 0
      StrCpy $tfBitmap 0
      StrCpy $tfTitleText "TaskForce"

      ; Le thème de l'app : celui des applications de Windows.
      ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
      ${if} ${Errors}
      ${orIf} $0 != 0
        StrCpy $tfBg ${TF_BG_LIGHT}
        StrCpy $tfLine ${TF_LINE_LIGHT}
        StrCpy $tfInk ${TF_INK_LIGHT}
        StrCpy $tfMuted ${TF_MUTED_LIGHT}
        StrCpy $tfStill ${TF_STILL_LIGHT}
      ${else}
        StrCpy $tfBg ${TF_BG_DARK}
        StrCpy $tfLine ${TF_LINE_DARK}
        StrCpy $tfInk ${TF_INK_DARK}
        StrCpy $tfMuted ${TF_MUTED_DARK}
        StrCpy $tfStill ${TF_STILL_DARK}
      ${endIf}
      ClearErrors

      ; SPI_GETCLIENTAREAANIMATION : « Effets d'animation » de Windows, l'équivalent de prefers-reduced-motion.
      System::Call 'user32::SystemParametersInfoW(i 0x1042, i 0, *i .r0, i 0)'
      StrCpy $tfMoves $0

      System::Call 'gdi32::CreateSolidBrush(i $tfLine) p .s'
      Pop $tfBrushLine
      System::Call 'gdi32::CreateSolidBrush(i ${TF_ACCENT}) p .s'
      Pop $tfBrushAccent

      !insertmacro tfPx $0 22
      IntOp $0 0 - $0
      ; CLEARTYPE_QUALITY
      System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i 600, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "Segoe UI Semibold") p .s'
      Pop $tfTitleFont
      !insertmacro tfPx $0 14
      IntOp $0 0 - $0
      System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i 400, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "Segoe UI") p .s'
      Pop $tfStepFont
      IntOp $0 $tfDpi * 125
      IntOp $0 $0 / 960
      IntOp $0 0 - $0
      System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i 400, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "Segoe UI") p .s'
      Pop $tfNoteFont

      ; Le logo est l'icône de l'installeur, déjà dans le fichier (ressource 103 de NSIS).
      StrCpy $tfIcon 0
      System::Call 'kernel32::GetModuleHandleW(p 0) p .r0'
      !insertmacro tfPx $1 ${TF_LOGO}
      System::Call 'comctl32::LoadIconWithScaleDown(p r0, p 103, i r1, i r1, *p .r2) i .r3'
      ${if} $3 == 0
        StrCpy $tfIcon $2
      ${else}
        ; IMAGE_ICON
        System::Call 'user32::LoadImageW(p r0, p 103, i 1, i r1, i r1, i 0) p .s'
        Pop $tfIcon
      ${endIf}

      ; Centrée sur l'écran principal, comme l'écran d'attente de l'app.
      ; SPI_GETWORKAREA
      System::Call 'user32::SystemParametersInfoW(i 0x30, i 0, p $tfRect, i 0)'
      System::Call '*$tfRect(i .r0, i .r1, i .r2, i .r3)'
      IntOp $4 $0 + $2
      IntOp $4 $4 - $tfW
      IntOp $4 $4 / 2
      IntOp $5 $1 + $3
      IntOp $5 $5 - $tfH
      IntOp $5 $5 / 2
      ; WS_POPUP, SS_BITMAP : une fenêtre sans cadre, peinte par la commande « static » de Windows.
      System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "TaskForce", i 0x8000000E, i r4, i r5, i $tfW, i $tfH, p 0, p 0, p 0, p 0) p .s'
      Pop $tfHwnd
      ${if} $tfHwnd == 0
        Return
      ${endIf}
      ; DWMWA_WINDOW_CORNER_PREFERENCE : coins arrondis sous Windows 11, comme l'écran d'attente de l'app.
      System::Call 'dwmapi::DwmSetWindowAttribute(p $tfHwnd, i 33, *i 2, i 4)'
      ${if} $tfIcon != 0
        ; WM_SETICON : ICON_BIG et ICON_SMALL
        SendMessage $tfHwnd 0x80 1 $tfIcon $0
        SendMessage $tfHwnd 0x80 0 $tfIcon $0
      ${endIf}
      System::Call 'user32::GetDC(p $tfHwnd) p .s'
      Pop $tfDc
      Call tfPaint
      ; SW_SHOW
      System::Call 'user32::ShowWindow(p $tfHwnd, i 5)'
      System::Call 'user32::SetForegroundWindow(p $tfHwnd)'
      System::Call 'user32::UpdateWindow(p $tfHwnd)'
      Call tfDrawBar
    FunctionEnd

    Function tfCloseScreen
      Delete "$tfMark"
      ${if} $tfHwnd != 0
        System::Call 'user32::DestroyWindow(p $tfHwnd)'
      ${endIf}
    FunctionEnd

    ; Une app qui s'est rouverte (échec) ou la nouvelle version : l'écran attend qu'elle se montre.
    Function tfWaitForApp
      StrCpy $R0 $0
      StrCpy $R1 1
      Call tfHold
    FunctionEnd

    Function tfUpdateScreen
      ${ifNot} ${isUpdated}
      ${orIfNot} ${isForceRun}
        Return
      ${endIf}
      ${GetParameters} $R9
      ClearErrors
      ${GetOptions} $R9 "${TF_WORKER_FLAG}" $R8
      ${ifNot} ${Errors}
        Return
      ${endIf}
      ClearErrors

      ; Le dossier de l'app sert de dossier courant depuis .onInit : le superviseur le rend, le travailleur va le remplacer.
      SetOutPath "$TEMP"

      StrCpy $tfMark "$APPDATA\${PRODUCT_FILENAME}\update-screen"
      StrCpy $tfStep "Installing TaskForce ${VERSION}"
      StrCpy $tfNote "It takes a minute or two. TaskForce opens again by itself."
      Call tfOpen

      ; L'ancienne app attend ce fichier pour quitter : la fenêtre est là, plus rien ne manque à l'écran.
      FileOpen $0 "$tfMark" w
      ${ifNot} ${Errors}
        FileClose $0
      ${endIf}
      ClearErrors

      ; /NCRC : ce fichier vient d'être vérifié, par le lancement du superviseur.
      System::Call '*(i 68, p, p, p, i, i, i, i, i, i, i, i, &i2, &i2, p, p, p, p) p .r1'
      System::Call '*(p, p, i, i) p .r2'
      System::Call 'kernel32::CreateProcessW(w `$EXEPATH`, w `"$EXEPATH" /NCRC ${TF_WORKER_FLAG} $R9`, p 0, p 0, i 0, i 0, p 0, p 0, p r1, p r2) i .r0'
      System::Call '*$2(p .s)'
      Pop $tfProcess
      System::Free $1
      System::Free $2

      StrCpy $R5 2
      ${if} $0 != 0
        tfWorking:
          Call tfTick
          System::Call 'kernel32::WaitForSingleObject(p $tfProcess, i 50) i .r0'
          ; WAIT_TIMEOUT
          ${if} $0 == 258
            Goto tfWorking
          ${endIf}
        System::Call 'kernel32::GetExitCodeProcess(p $tfProcess, *i .R5)'
        System::Call 'kernel32::CloseHandle(p $tfProcess)'
      ${endIf}

      ${if} $R5 == 0
        !insertmacro tfSay "Opening TaskForce" "The update is installed."
        ; Le premier lancement d'une version neuve passe par l'antivirus : large, puis la fenêtre le dit.
        StrCpy $0 90000
        Call tfWaitForApp
        ${if} ${FileExists} "$tfMark"
          !insertmacro tfSay "TaskForce is taking longer than usual" "If nothing opens, find TaskForce in the Start menu."
          StrCpy $0 15000
          Call tfWaitForApp
        ${endIf}
        Call tfCloseScreen
        SetErrorLevel 0
        Quit
      ${endIf}

      ; Le travailleur a échoué, ou n'a pas pu partir : l'ancienne version est encore là dans presque tous les cas.
      ReadRegStr $R6 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${if} $R6 == ""
        StrCpy $R6 $INSTDIR
      ${endIf}
      ${if} ${FileExists} "$R6\${APP_EXECUTABLE_FILENAME}"
        !insertmacro tfSay "TaskForce ${VERSION} didn't install" "Your projects are safe. TaskForce opens again as it was."
        ; Le temps de lire la phrase.
        StrCpy $0 4000
        StrCpy $R0 $0
        StrCpy $R1 0
        Call tfHold
        Exec '"$R6\${APP_EXECUTABLE_FILENAME}"'
        StrCpy $0 30000
        Call tfWaitForApp
      ${else}
        Call tfCloseScreen
        MessageBox MB_OKCANCEL|MB_ICONSTOP "TaskForce could not be installed, and this computer no longer has the previous version.$\r$\n$\r$\nYour projects are safe. Choose OK to download TaskForce again." IDCANCEL +2
        ExecShell "open" "https://taskforce-project.fr/download"
      ${endIf}
      Call tfCloseScreen
      SetErrorLevel 2
      Quit
    FunctionEnd
  !macroend
!endif

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
