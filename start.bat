@echo off
title Uruchamianie Projektu - Kasyno

echo =====================================
echo Instalowanie wymaganych paczek NPM...
echo =====================================
call npm install

echo.
echo =====================================
echo Uruchamianie serwera lokalnego...
echo =====================================
echo Serwer wlaczy sie na http://localhost:3000
echo.

:: Otwieranie przeglądarki (uruchomi się domyślna przeglądarka)
start http://localhost:3000

:: Uruchamianie serwera (to zatrzyma konsolę dopóki jej nie zamkniesz)
node server.js

pause
