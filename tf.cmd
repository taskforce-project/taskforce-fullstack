@echo off
REM Wrapper pour lancer le control center depuis cmd / Explorateur.
REM Usage : tf            (menu)   |   tf upd   (commande directe)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tf.ps1" %*
