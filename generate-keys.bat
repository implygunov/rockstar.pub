@echo off
setlocal EnableDelayedExpansion

title Генератор ключей Rockstar 2.0 - роли 2026

:menu
cls
echo.
echo  ╔════════════════════════════════════════════╗
echo  ║      Генератор ключей активации            ║
echo  ╚════════════════════════════════════════════╝
echo.
echo  Доступные роли (выбери цифру):
echo    1. user     - обычный юзер (дефолт)
echo    2. beta     - бета-тестер
echo    3. alpha    - альфа-тестер
echo    4. youtube  - ютубер
echo    5. cracker  - крякер
echo    6. admin    - администратор
echo.
echo  0. Выход
echo.
echo  Или запускай сразу с параметрами:
echo    generate-keys.bat cracker 5 90
echo.
echo  Выбери роль (цифра) или Enter для дефолта (user):
set "choice="
set /p choice= →

if "!choice!"=="" (
    set "ROLE=user"
    goto :ask_count
)

if "!choice!"=="0" exit

if "!choice!"=="1" set "ROLE=user"
if "!choice!"=="2" set "ROLE=beta"
if "!choice!"=="3" set "ROLE=alpha"
if "!choice!"=="4" set "ROLE=youtube"
if "!choice!"=="5" set "ROLE=cracker"
if "!choice!"=="6" set "ROLE=admin"

if not defined ROLE (
    echo.
    echo  Ебать, такой роли нет в системе! Выбери из списка, долбоёб.
    echo.
    pause
    goto :menu
)

:ask_count
echo.
set "COUNT=1"
set /p COUNT=  Сколько ключей наклепать? (Enter = 1):
if "!COUNT!"=="" set COUNT=1

:ask_days
echo.
set "DAYS=30"
set /p DAYS=  На сколько дней валидны? (Enter = 30):
if "!DAYS!"=="" set DAYS=30

echo.
echo  Окей, генерим !COUNT! ключ(ей) роли !ROLE! на !DAYS! дней.
echo  =======================================================
echo.

:: Если запустили с аргументами — они перекрывают меню
if not "%~1"=="" (
    set "ROLE=%~1"
    if not "%~2"=="" set "COUNT=%~2"
    if not "%~3"=="" set "DAYS=%~3"
    echo  Командная строка перебила выбор:
    echo    Роль:     !ROLE!
    echo    Кол-во:   !COUNT!
    echo    Дней:     !DAYS!
    echo.
)

:: Запускаем генератор
node api/utils/generateKeys.js "!ROLE!" "!COUNT!" "!DAYS!"

echo.
echo  Всё, ключи сгенерированы (смотри консоль или файл keys.txt, если пишешь туда).
echo  Готово, пиздец, можно раздавать.
echo.
pause
goto :menu