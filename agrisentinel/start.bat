@echo off
setlocal
set "ROOT=%~dp0"

echo Starting AgriSentinel...
echo   1/3  ML inference service  ->  http://127.0.0.1:8001
start "AgriSentinel ML" /d "%ROOT%ml_service" cmd /k python -m uvicorn app:app --host 127.0.0.1 --port 8001

echo   2/3  Django API            ->  http://127.0.0.1:8000
start "AgriSentinel API" /d "%ROOT%backend" cmd /k "python manage.py migrate && python manage.py seed_demo && python manage.py runserver 127.0.0.1:8000"

echo   3/3  React frontend        ->  http://localhost:5173
start "AgriSentinel Web" /d "%ROOT%frontend" cmd /k npm run dev

timeout /t 4 >nul
start "" http://localhost:5173
