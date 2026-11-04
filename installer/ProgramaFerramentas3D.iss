; Script do instalador (Inno Setup 6). Compilado por scripts\build_instalador.ps1.
; A versão vem de fora (/DMyAppVersion=...), para ficar igual a app\versao.py.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef ExePath
  #define ExePath "..\build\pyi\dist\ProgramaFerramentas3D.exe"
#endif

[Setup]
; Não mudar: identifica o programa para instalar por cima (atualizações).
AppId={{8F3C2A1E-6B4D-4E7A-9C21-5D0F3A7B9E42}
AppName=Programa Ferramentas 3D
AppVersion={#MyAppVersion}
AppPublisher=Pedro Henrique
DefaultDirName={localappdata}\Programs\ProgramaFerramentas3D
DefaultGroupName=Programa Ferramentas 3D
DisableProgramGroupPage=yes
; Instala para o usuário atual, sem administrador.
PrivilegesRequired=lowest
OutputDir=..\dist
; O nome termina em "Setup.exe": é o que o app procura nas releases do GitHub.
OutputBaseFilename=ProgramaFerramentas3D-{#MyAppVersion}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\ProgramaFerramentas3D.exe
UninstallDisplayName=Programa Ferramentas 3D

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "atalho"; Description: "Criar atalho na área de trabalho"; Flags: unchecked

[Files]
Source: "{#ExePath}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Programa Ferramentas 3D"; Filename: "{app}\ProgramaFerramentas3D.exe"
Name: "{autodesktop}\Programa Ferramentas 3D"; Filename: "{app}\ProgramaFerramentas3D.exe"; Tasks: atalho

[Run]
; Sem "skipifsilent": o programa reabre também depois de uma atualização silenciosa.
Filename: "{app}\ProgramaFerramentas3D.exe"; Description: "Abrir Programa Ferramentas 3D"; Flags: nowait postinstall
