@echo off
rem Lanceur Windows de l'agent de substitution (cf. stub-agent.mjs). Jamais en production.
node "%~dp0stub-agent.mjs" %*
