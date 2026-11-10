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
; l'app qui se ferme à celui de la nouvelle version, une fenêtre de TaskForce dit ce qui se passe. Elle ne peut pas venir
; de l'app, puisque l'installeur remplace TaskForce.exe : c'est l'installeur qui la dessine, avec ce que NSIS embarque déjà
; (le greffon System et les bibliothèques de Windows, GDI et GDI+). Aucun exécutable de plus, aucun script, et surtout pas
; mshta ni un PowerShell caché : l'app n'est pas signée, un antivirus l'a déjà signalée.
;
; C'est l'écran de la coque (le CEO le 10/11/2026 : « vraiment le mm ecran que l ecran de login [...] Juste la partie
; droite qui change ») : la fenêtre de l'écran de l'app qu'elle remplace, à sa place et à sa taille ; à gauche le même
; panneau, une image tirée de celui des pages (installer/panel-*.jpg, scripts/make-screen-panel.mjs) ; à droite le logo,
; l'étape, la barre et la note, aux places et aux couleurs de desktop/static/shell.css.
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
; tant que cette fenêtre est à l'écran : l'ancienne app attend qu'il apparaisse pour quitter, la nouvelle ouvre sa
; première fenêtre à la place qu'il donne (« x y largeur hauteur », en pixels), puis l'efface (cf.
; desktop/src/update-pending.ts). L'ancienne app donne la sienne par la poignée de sa fenêtre (--screen).
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

  ; Les mesures de l'écran de la coque, en points de 96 ppp, celles de desktop/static/shell.css (un test les compare) : la
  ; fenêtre, le panneau, la colonne de droite et, de haut en bas, le logo, l'étape, la barre et les deux lignes de la note.
  !define TF_WIDTH 1000
  !define TF_HEIGHT 640
  !define TF_PANEL 520
  !define TF_COLUMN 340
  !define TF_TOP 236
  !define TF_LOGO 48
  !define TF_STEP_GAP 24
  !define TF_STEP 24
  !define TF_STEP_LINE 30
  !define TF_BAR_GAP 20
  !define TF_BAR 3
  !define TF_NOTE 14
  !define TF_NOTE_LINE 21
  !define /math TF_RIGHT ${TF_WIDTH} - ${TF_PANEL}
  !define /math TF_SPARE ${TF_RIGHT} - ${TF_COLUMN}
  !define /math TF_MARGIN ${TF_SPARE} / 2
  !define /math TF_LEFT ${TF_PANEL} + ${TF_MARGIN}
  !define /math TF_LOGO_END ${TF_TOP} + ${TF_LOGO}
  !define /math TF_STEP_TOP ${TF_LOGO_END} + ${TF_STEP_GAP}
  !define /math TF_STEP_END ${TF_STEP_TOP} + ${TF_STEP_LINE}
  !define /math TF_BAR_TOP ${TF_STEP_END} + ${TF_BAR_GAP}
  !define /math TF_BAR_END ${TF_BAR_TOP} + ${TF_BAR}
  !define /math TF_NOTE_TOP ${TF_BAR_END} + ${TF_BAR_GAP}
  !define /math TF_NOTE_TOP2 ${TF_NOTE_TOP} + ${TF_NOTE_LINE}
  ; Le curseur de la barre : 40 % de la piste.
  !define /math TF_THUMB_X10 ${TF_COLUMN} * 4
  !define /math TF_THUMB ${TF_THUMB_X10} / 10

  ; Les couleurs des deux thèmes (COLORREF, 0x00BBGGRR), celles de shell.css.
  !define TF_BG_LIGHT 0x00FFFFFF
  !define TF_INK_LIGHT 0x00151719
  !define TF_MUTED_LIGHT 0x0062676B
  !define TF_LINE_LIGHT 0x00E0E4E6
  !define TF_BG_DARK 0x00190E0B
  !define TF_INK_DARK 0x00F0F2F3
  !define TF_MUTED_DARK 0x008F979A
  !define TF_LINE_DARK 0x00402A24
  !define TF_ACCENT 0x00F66B2F
  ; La barre immobile sous « moins d'animations » : l'accent à moitié sur la piste, comme la page.
  !define TF_STILL_LIGHT 0x00EBA88B
  !define TF_STILL_DARK 0x009B4B2A
  ; Le panneau si son image manquait : la teinte claire de la peinture.
  !define TF_PANEL_FILL 0x00F1EEEC

  ; Une image du dessin de la barre par pas de 50 ms : son aller dure 1,4 s, comme dans la page.
  !define TF_FRAMES 28

  ; Des points aux pixels de l'écran de la fenêtre, arrondis comme la page (`IntOp` tronque).
  !macro tfPx RESULT VALUE
    IntOp ${RESULT} ${VALUE} * $tfDpi
    IntOp ${RESULT} ${RESULT} + 48
    IntOp ${RESULT} ${RESULT} / 96
  !macroend

  ; Une ligne de texte de la colonne, dans une boîte de ligne de LINE points qui commence à TOP points.
  !macro tfText FONT COLOR TOP LINE TEXT
    System::Call 'gdi32::SelectObject(p $tfMem, p ${FONT})'
    System::Call 'gdi32::SetTextColor(p $tfMem, i ${COLOR})'
    StrCpy $8 "${TEXT}"
    StrCpy $5 ${TOP}
    StrCpy $6 ${LINE}
    Call tfTextAt
  !macroend

  ; Change ce que dit l'écran : l'étape, puis les deux lignes de la note.
  !macro tfSay STEP NOTE NOTE2
    StrCpy $tfStep "${STEP}"
    StrCpy $tfNote "${NOTE}"
    StrCpy $tfNote2 "${NOTE2}"
    Call tfPaint
  !macroend

  ; Une police de la page : Segoe UI Variable (Windows 11), sinon Segoe UI (Windows 10), comme la page la choisit.
  !macro tfFont RESULT SIZE WEIGHT FACE FALLBACK
    !insertmacro tfPx $0 ${SIZE}
    IntOp $0 0 - $0
    ; CLEARTYPE_QUALITY
    System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${FACE}") p .r1'
    ; GDI rend toujours une police : celle demandée, ou une autre à sa place.
    System::Call 'user32::GetDC(p 0) p .r2'
    System::Call 'gdi32::SelectObject(p r2, p r1) p .r3'
    System::Call 'gdi32::GetTextFaceW(p r2, i 64, w .r4)'
    System::Call 'gdi32::SelectObject(p r2, p r3)'
    System::Call 'user32::ReleaseDC(p 0, p r2)'
    ${if} $4 != "${FACE}"
      System::Call 'gdi32::DeleteObject(p r1)'
      System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${FALLBACK}") p .r1'
    ${endIf}
    StrCpy ${RESULT} $1
  !macroend

  !macro customHeader
    Var tfHwnd
    Var tfDc
    Var tfDpi
    Var tfX
    Var tfY
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
    Var tfLeft
    Var tfBarY
    Var tfBarW
    Var tfBarH
    Var tfThumb
    Var tfStepFont
    Var tfNoteFont
    Var tfStep
    Var tfNote
    Var tfNote2
    Var tfBitmap
    Var tfMem
    Var tfDib
    Var tfOld
    Var tfPanel
    Var tfPanelDc
    Var tfPanelW
    Var tfProcess
    Var tfMark

    ; Le texte de $8 dans sa boîte de ligne ($5, $6 en points), centré dans sa hauteur comme la page le fait (la moitié de
    ; l'interligne au-dessus), au bord gauche de la colonne. Le haut du texte, en pixels, se calcule d'un trait, en
    ; 192es de pixel, et s'arrondit vers le haut de l'écran comme la page : (2 x haut + ligne) x ppp - (ascendante +
    ; descendante) x 96, le tout sur 192.
    Function tfTextAt
      System::Alloc 64
      Pop $9
      ; TEXTMETRICW : tmHeight, tmAscent, tmDescent
      System::Call 'gdi32::GetTextMetricsW(p $tfMem, p r9)'
      System::Call '*$9(i .r7, i .r3, i .r4)'
      System::Free $9
      IntOp $5 $5 * 2
      IntOp $5 $5 + $6
      IntOp $5 $5 * $tfDpi
      IntOp $9 $3 + $4
      IntOp $9 $9 * 96
      IntOp $5 $5 - $9
      IntOp $5 $5 / 192
      IntOp $7 $5 + $3
      IntOp $7 $7 + $4
      System::Call '*$tfRect(i $tfLeft, i r5, i $tfW, i r7)'
      ; DT_LEFT, DT_SINGLELINE, DT_NOCLIP, DT_NOPREFIX
      System::Call 'user32::DrawTextW(p $tfMem, w r8, i -1, p $tfRect, i 0x920)'
    FunctionEnd

    ; Le panneau de gauche : l'image à l'échelle de l'écran, ou celle juste au-dessus, réduite par GDI+. Gardée dans un
    ; bitmap de la taille du panneau, recopié à chaque dessin.
    Function tfLoadPanel
      StrCpy $tfPanel 0
      !insertmacro tfPx $tfPanelW ${TF_PANEL}
      IntOp $0 $tfDpi * 100
      IntOp $0 $0 / 96
      InitPluginsDir
      ClearErrors
      ${if} $0 <= 100
        File "/oname=$PLUGINSDIR\tf-panel.jpg" "${PROJECT_DIR}\installer\panel-100.jpg"
      ${elseIf} $0 <= 125
        File "/oname=$PLUGINSDIR\tf-panel.jpg" "${PROJECT_DIR}\installer\panel-125.jpg"
      ${elseIf} $0 <= 150
        File "/oname=$PLUGINSDIR\tf-panel.jpg" "${PROJECT_DIR}\installer\panel-150.jpg"
      ${elseIf} $0 <= 175
        File "/oname=$PLUGINSDIR\tf-panel.jpg" "${PROJECT_DIR}\installer\panel-175.jpg"
      ${else}
        File "/oname=$PLUGINSDIR\tf-panel.jpg" "${PROJECT_DIR}\installer\panel-200.jpg"
      ${endIf}
      ${if} ${Errors}
        ClearErrors
        Return
      ${endIf}
      ; GdiplusStartupInput : version 1, ni rappel, ni fil d'arrière-plan supprimé, ni codecs supprimés.
      System::Call '*(i 1, p 0, i 0, i 0) p .r1'
      System::Call 'gdiplus::GdiplusStartup(*p .r2, p r1, p 0) i .r3'
      System::Free $1
      ${if} $3 != 0
        Return
      ${endIf}
      System::Call 'gdiplus::GdipLoadImageFromFile(w "$PLUGINSDIR\tf-panel.jpg", *p .r4) i .r3'
      ${if} $3 == 0
        System::Call 'user32::GetDC(p 0) p .r0'
        System::Call 'gdi32::CreateCompatibleDC(p r0) p .s'
        Pop $tfPanelDc
        IntOp $5 0 - $tfH
        System::Call '*(i 40, i $tfPanelW, i r5, &i2 1, &i2 24, i 0, i 0, i 0, i 0, i 0, i 0) p .r5'
        System::Call 'gdi32::CreateDIBSection(p r0, p r5, i 0, *p .r6, p 0, i 0) p .s'
        Pop $tfPanel
        System::Free $5
        System::Call 'user32::ReleaseDC(p 0, p r0)'
        System::Call 'gdi32::SelectObject(p $tfPanelDc, p $tfPanel)'
        ; Le fond d'abord : une image plus basse que la fenêtre (un écran trop petit) laisse sa teinte dessous.
        System::Call 'gdi32::CreateSolidBrush(i ${TF_PANEL_FILL}) p .r0'
        System::Call '*$tfRect(i 0, i 0, i $tfPanelW, i $tfH)'
        System::Call 'user32::FillRect(p $tfPanelDc, p $tfRect, p r0)'
        System::Call 'gdi32::DeleteObject(p r0)'
        System::Call 'gdiplus::GdipGetImageWidth(p r4, *i .r6)'
        System::Call 'gdiplus::GdipGetImageHeight(p r4, *i .r7)'
        System::Call 'gdiplus::GdipCreateFromHDC(p $tfPanelDc, *p .r5) i .r3'
        ${if} $3 == 0
          ; À sa taille : pixel pour pixel (le plus proche, sans décalage) ; sinon réduite au mieux (bicubique).
          !insertmacro tfPx $0 ${TF_HEIGHT}
          ${if} $6 == $tfPanelW
          ${andIf} $7 == $0
            System::Call 'gdiplus::GdipSetInterpolationMode(p r5, i 5)'
          ${else}
            System::Call 'gdiplus::GdipSetInterpolationMode(p r5, i 7)'
          ${endIf}
          ; PixelOffsetModeHalf : le centre des pixels, sans le demi-pixel de flou.
          System::Call 'gdiplus::GdipSetPixelOffsetMode(p r5, i 4)'
          System::Call 'gdiplus::GdipDrawImageRectI(p r5, p r4, i 0, i 0, i $tfPanelW, i r0)'
          System::Call 'gdiplus::GdipDeleteGraphics(p r5)'
        ${endIf}
        System::Call 'gdiplus::GdipDisposeImage(p r4)'
      ${endIf}
      System::Call 'gdiplus::GdiplusShutdown(p r2)'
    FunctionEnd

    ; Dessine l'écran entier dans un bitmap que la fenêtre (une commande « static ») repeint d'elle-même. Un bitmap en
    ; 24 bits, sans canal alpha : la commande « static » des styles visuels traite un bitmap dont un pixel a de l'alpha
    ; comme une image transparente, et le fond et le texte, dessinés sans alpha par GDI, disparaîtraient.
    Function tfPaint
      System::Call 'user32::GetDC(p 0) p .r0'
      System::Call 'gdi32::CreateCompatibleDC(p r0) p .s'
      Pop $tfMem
      IntOp $1 0 - $tfH
      ; BITMAPINFOHEADER : 24 bits par pixel, BI_RGB ; de haut en bas (hauteur négative).
      System::Call '*(i 40, i $tfW, i r1, &i2 1, &i2 24, i 0, i 0, i 0, i 0, i 0, i 0) p .r1'
      System::Call 'gdi32::CreateDIBSection(p r0, p r1, i 0, *p .r2, p 0, i 0) p .s'
      Pop $tfDib
      System::Free $1
      System::Call 'user32::ReleaseDC(p 0, p r0)'
      System::Call 'gdi32::SelectObject(p $tfMem, p $tfDib) p .s'
      Pop $tfOld
      System::Call 'gdi32::CreateSolidBrush(i $tfBg) p .r0'
      System::Call '*$tfRect(i 0, i 0, i $tfW, i $tfH)'
      System::Call 'user32::FillRect(p $tfMem, p $tfRect, p r0)'
      System::Call 'gdi32::DeleteObject(p r0)'
      ${if} $tfPanel != 0
        ; SRCCOPY
        System::Call 'gdi32::BitBlt(p $tfMem, i 0, i 0, i $tfPanelW, i $tfH, p $tfPanelDc, i 0, i 0, i 0x00CC0020)'
      ${else}
        System::Call 'gdi32::CreateSolidBrush(i ${TF_PANEL_FILL}) p .r0'
        System::Call '*$tfRect(i 0, i 0, i $tfPanelW, i $tfH)'
        System::Call 'user32::FillRect(p $tfMem, p $tfRect, p r0)'
        System::Call 'gdi32::DeleteObject(p r0)'
      ${endIf}
      ${if} $tfIcon != 0
        !insertmacro tfPx $0 ${TF_LOGO}
        !insertmacro tfPx $1 ${TF_TOP}
        ; DI_NORMAL
        System::Call 'user32::DrawIconEx(p $tfMem, i $tfLeft, i r1, p $tfIcon, i r0, i r0, i 0, p 0, i 3)'
      ${endIf}
      System::Call 'gdi32::SetBkMode(p $tfMem, i 1)'
      !insertmacro tfText $tfStepFont $tfInk ${TF_STEP_TOP} ${TF_STEP_LINE} "$tfStep"
      !insertmacro tfText $tfNoteFont $tfMuted ${TF_NOTE_TOP} ${TF_NOTE_LINE} "$tfNote"
      !insertmacro tfText $tfNoteFont $tfMuted ${TF_NOTE_TOP2} ${TF_NOTE_LINE} "$tfNote2"
      System::Call 'gdi32::SelectObject(p $tfMem, p $tfOld)'
      System::Call 'gdi32::DeleteDC(p $tfMem)'
      ; STM_SETIMAGE, IMAGE_BITMAP
      SendMessage $tfHwnd 0x172 0 $tfDib $0
      ${if} $tfBitmap != 0
        System::Call 'gdi32::DeleteObject(p $tfBitmap)'
      ${endIf}
      StrCpy $tfBitmap $tfDib
      Call tfDrawBar
    FunctionEnd

    ; La barre : à l'aller, comme dans la page ; immobile sous « moins d'animations » du système.
    Function tfDrawBar
      IntOp $4 $tfBarY + $tfBarH
      ${if} $tfMoves != 1
        System::Call 'gdi32::CreateSolidBrush(i $tfStill) p .r0'
        IntOp $2 $tfLeft + $tfBarW
        System::Call '*$tfRect(i $tfLeft, i $tfBarY, i r2, i r4)'
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
      IntOp $1 $1 + $tfLeft
      IntOp $2 $2 + $tfLeft
      IntOp $3 $tfLeft + $tfBarW
      System::Call '*$tfRect(i $tfLeft, i $tfBarY, i r3, i r4)'
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
      ; Tant que cette fenêtre est au premier plan, l'app qui s'ouvre ensuite peut y venir : le gabarit la lance par
      ; l'Explorateur (ExecShellAsUser), et Windows laisserait sinon sa fenêtre derrière celle-ci, puis rendrait la main à
      ; la fenêtre d'avant la mise à jour quand celle-ci part. ASFW_ANY.
      System::Call 'user32::GetForegroundWindow() p .r0'
      ${if} $0 == $tfHwnd
        System::Call 'user32::AllowSetForegroundWindow(i -1)'
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

    ; La place et l'échelle de la fenêtre : celles de l'écran de l'app qu'elle remplace, que l'app donne par la poignée de
    ; sa fenêtre (--screen) ; sinon (une app d'avant cet écran), au centre de l'écran principal, comme l'app place les
    ; siens.
    Function tfPlace
      StrCpy $tfDpi 0
      ClearErrors
      ${GetOptions} $R9 "--screen=" $0
      ${ifNot} ${Errors}
      ${andIf} $0 != ""
        System::Call 'user32::IsWindow(p r0) i .r1'
        ${if} $1 != 0
          System::Call 'user32::GetDpiForWindow(p r0) i .r1'
          ; La zone cliente de sa fenêtre, c'est-à-dire la page, sans les bords que Windows y ajoute : sa taille, puis son
          ; coin sur l'écran.
          System::Call 'user32::GetClientRect(p r0, p $tfRect) i .r2'
          ${if} $1 > 0
          ${andIf} $2 != 0
            System::Call '*$tfRect(i .r3, i .r4, i .r5, i .r6)'
            System::Call '*$tfRect(i 0, i 0)'
            System::Call 'user32::ClientToScreen(p r0, p $tfRect)'
            System::Call '*$tfRect(i .r3, i .r4)'
            StrCpy $tfDpi $1
            StrCpy $tfX $3
            StrCpy $tfY $4
            StrCpy $tfW $5
            StrCpy $tfH $6
          ${endIf}
        ${endIf}
      ${endIf}
      ClearErrors
      ${if} $tfDpi > 0
        Return
      ${endIf}
      ; L'écran principal (MONITOR_DEFAULTTOPRIMARY), son échelle (MDT_EFFECTIVE_DPI) et sa zone de travail.
      System::Call 'user32::MonitorFromPoint(i 0, i 0, i 1) p .r0'
      System::Call 'shcore::GetDpiForMonitor(p r0, i 0, *i .r1, *i .r2) i .r3'
      ${if} $3 != 0
        ; LOGPIXELSX
        System::Call 'user32::GetDC(p 0) p .r0'
        System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i .r1'
        System::Call 'user32::ReleaseDC(p 0, p r0)'
      ${endIf}
      StrCpy $tfDpi $1
      !insertmacro tfPx $tfW ${TF_WIDTH}
      !insertmacro tfPx $tfH ${TF_HEIGHT}
      ; SPI_GETWORKAREA
      System::Call 'user32::SystemParametersInfoW(i 0x30, i 0, p $tfRect, i 0)'
      System::Call '*$tfRect(i .r0, i .r1, i .r2, i .r3)'
      IntOp $4 $2 - $0
      IntOp $4 $4 - $tfW
      IntOp $4 $4 / 2
      IntOp $tfX $0 + $4
      IntOp $5 $3 - $1
      IntOp $5 $5 - $tfH
      IntOp $5 $5 / 2
      IntOp $tfY $1 + $5
    FunctionEnd

    Function tfOpen
      ; Les pixels de chaque écran (Windows 10 1703 et plus), sinon ceux de l'écran principal : jamais une fenêtre étirée
      ; et floue par Windows.
      System::Call 'user32::SetProcessDpiAwarenessContext(p -4) i .r0'
      ${if} $0 == 0
      ${orIf} $0 == "error"
        System::Call 'user32::SetProcessDPIAware()'
      ${endIf}
      ; Dans la barre des tâches, le même bouton que l'app.
      System::Call 'shell32::SetCurrentProcessExplicitAppUserModelID(w "${APP_ID}")'
      System::Alloc 16
      Pop $tfRect
      System::Alloc 64
      Pop $tfMsg
      StrCpy $tfFrame 0
      StrCpy $tfBitmap 0
      Call tfPlace
      !insertmacro tfPx $tfLeft ${TF_LEFT}
      !insertmacro tfPx $tfBarW ${TF_COLUMN}
      !insertmacro tfPx $tfThumb ${TF_THUMB}
      !insertmacro tfPx $tfBarY ${TF_BAR_TOP}
      !insertmacro tfPx $tfBarH ${TF_BAR_END}
      IntOp $tfBarH $tfBarH - $tfBarY

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

      !insertmacro tfFont $tfStepFont ${TF_STEP} 600 "Segoe UI Variable Text Semibold" "Segoe UI Semibold"
      !insertmacro tfFont $tfNoteFont ${TF_NOTE} 400 "Segoe UI Variable Text" "Segoe UI"

      ; Le logo est l'icône de l'installeur, déjà dans le fichier (ressource 103 de NSIS) : la tuile de la marque.
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

      Call tfLoadPanel

      ; WS_POPUP, SS_BITMAP : une fenêtre sans cadre, peinte par la commande « static » de Windows.
      System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "TaskForce", i 0x8000000E, i $tfX, i $tfY, i $tfW, i $tfH, p 0, p 0, p 0, p 0) p .s'
      Pop $tfHwnd
      ${if} $tfHwnd == 0
        Return
      ${endIf}
      ; DWMWA_WINDOW_CORNER_PREFERENCE : coins arrondis sous Windows 11, comme l'écran de l'app.
      System::Call 'dwmapi::DwmSetWindowAttribute(p $tfHwnd, i 33, *i 2, i 4)'
      ; DWMWA_TRANSITIONS_FORCEDISABLED : elle paraît d'un coup, sur l'écran de l'app qu'elle recouvre à l'identique.
      System::Call 'dwmapi::DwmSetWindowAttribute(p $tfHwnd, i 3, *i 1, i 4)'
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
      StrCpy $tfNote "It takes a minute or two."
      StrCpy $tfNote2 "TaskForce opens again by itself."
      Call tfOpen

      ; L'ancienne app attend ce fichier pour quitter : la fenêtre est là, plus rien ne manque à l'écran. Il dit où elle est,
      ; pour que la fenêtre de l'app qui s'ouvre ensuite la recouvre.
      FileOpen $0 "$tfMark" w
      ${ifNot} ${Errors}
        FileWrite $0 "$tfX $tfY $tfW $tfH"
        FileClose $0
        StrCpy $R7 1
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
          ; La nouvelle version a déjà montré sa fenêtre : le travailleur ne fait plus que ranger ses fichiers temporaires.
          ${if} $R7 == 1
          ${andIfNot} ${FileExists} "$tfMark"
            Call tfCloseScreen
            SetErrorLevel 0
            Quit
          ${endIf}
          System::Call 'kernel32::WaitForSingleObject(p $tfProcess, i 50) i .r0'
          ; WAIT_TIMEOUT
          ${if} $0 == 258
            Goto tfWorking
          ${endIf}
        System::Call 'kernel32::GetExitCodeProcess(p $tfProcess, *i .R5)'
        System::Call 'kernel32::CloseHandle(p $tfProcess)'
      ${endIf}

      ${if} $R5 == 0
        !insertmacro tfSay "Opening TaskForce" "The update is installed." ""
        ; Le premier lancement d'une version neuve passe par l'antivirus : large, puis la fenêtre le dit.
        StrCpy $0 90000
        Call tfWaitForApp
        ${if} ${FileExists} "$tfMark"
          !insertmacro tfSay "Taking longer than usual" "TaskForce is still opening." "If nothing opens, find it in the Start menu."
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
        !insertmacro tfSay "TaskForce ${VERSION} didn't install" "Your projects are safe." "TaskForce opens again as it was."
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
