@echo off
rem Spiel und Mehrspieler-Server fuer das Heimnetz: Freunde oeffnen die angezeigte Adresse (http://192.168.x.x:8175)
cd /d "%~dp0"
start "" http://127.0.0.1:8175
node server.js --lan
