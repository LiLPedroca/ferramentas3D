# Gera o executável e o instalador (Setup.exe) em dist\.
# Uso (na pasta do projeto, com o venv criado): powershell -ExecutionPolicy Bypass -File scripts\build_instalador.ps1

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$python = Join-Path $raiz ".venv\Scripts\python.exe"
$iscc = Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) { $iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" }

$versao = [regex]::Match((Get-Content "app\versao.py" -Raw), 'VERSAO = "([^"]+)"').Groups[1].Value
if (-not $versao) { throw "Versão não encontrada em app\versao.py" }
Write-Host "Versão: $versao"

# Build em build\pyi para não esbarrar em um .exe antigo aberto em dist\.
$exeGerado = Join-Path $raiz "build\pyi\dist\ProgramaFerramentas3D.exe"
& $python -m PyInstaller --noconfirm --onefile --windowed --name ProgramaFerramentas3D `
    --distpath build\pyi\dist --workpath build\pyi\work --specpath build\pyi main.py
if ($LASTEXITCODE -ne 0) { throw "Falha no PyInstaller" }

& $iscc "/DMyAppVersion=$versao" "/DExePath=$exeGerado" "installer\ProgramaFerramentas3D.iss"
if ($LASTEXITCODE -ne 0) { throw "Falha no Inno Setup" }

Write-Host "Instalador: dist\ProgramaFerramentas3D-$versao-Setup.exe"
