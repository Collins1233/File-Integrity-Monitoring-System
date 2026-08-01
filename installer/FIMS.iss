; Inno Setup script for FIMS Windows installer.
; Builds FIMS-Setup.exe with Start Menu + optional Desktop shortcuts.
; Compile from repo root:  iscc installer\FIMS.iss

#define MyAppName "File Integrity Monitoring System"
#define MyAppShortName "FIMS"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "FIMS"
#define MyAppURL "https://github.com/Collins1233/File-Integrity-Monitoring-System"
#define MyAppExeName "FIMS.exe"
#define SourceRoot ".."

[Setup]
AppId={{A7C3E8F1-4B2D-4E9A-9C1F-8D2E6B0AF1F5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppShortName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppShortName}
DefaultGroupName={#MyAppShortName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#SourceRoot}\dist
OutputBaseFilename=FIMS-Setup
SetupIconFile={#SourceRoot}\frontend\public\fim-logo.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop icon"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "{#SourceRoot}\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Open File Integrity Monitoring System"
Name: "{group}\Uninstall {#MyAppShortName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Open File Integrity Monitoring System"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppShortName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Keep user baselines/logs in %LOCALAPPDATA%\FIMS — do not wipe on uninstall.
Type: files; Name: "{app}\fim_startup_error.txt"
