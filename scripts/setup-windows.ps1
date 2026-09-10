<#
.SYNOPSIS
    Installe les prérequis de MBA Player et lance l'application.

.DESCRIPTION
    Enchaîne ce qu'il faut faire à la main autrement : vérifier Node.js et git,
    installer ce qui manque, récupérer le dépôt, installer les dépendances et
    démarrer le serveur de développement.

    À lancer depuis PowerShell :

        powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1

    L'option -ExecutionPolicy Bypass est nécessaire parce que Windows refuse par
    défaut d'exécuter un script téléchargé. Elle ne vaut que pour cette
    exécution et ne change aucun réglage du système.

.PARAMETER InstallPath
    Où placer le dépôt. Par défaut, un dossier mbaplayer dans vos Documents.

.PARAMETER AllowPrivateHosts
    À utiliser si votre portail est sur votre réseau local (192.168.x.x). Le
    filtre anti-SSRF bloque ces adresses par défaut.
#>

[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'mbaplayer'),
    [switch]$AllowPrivateHosts
)

$ErrorActionPreference = 'Stop'

# Next.js 16 refuse de compiler en dessous de cette version.
$MinimumNodeMajor = 20
$RepositoryUrl = 'https://github.com/mbikedev/mbaplayer.git'

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    $Message" -ForegroundColor Yellow }

<#
    Après une installation par winget, le PATH du processus en cours est
    toujours l'ancien : les nouvelles commandes ne sont pas trouvables sans
    rouvrir un terminal. Relire le PATH depuis le registre évite ce détour.
#>
function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machine, $user | Where-Object { $_ }) -join ';'
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
    if (-not (Test-Command 'node')) { return 0 }
    try {
        # `node -v` renvoie "v22.14.0" ; on ne garde que le premier nombre.
        $raw = & node -v
        if ($raw -match 'v(\d+)\.') { return [int]$Matches[1] }
    } catch { }
    return 0
}

function Install-WithWinget {
    param([string]$PackageId, [string]$Label)

    if (-not (Test-Command 'winget')) {
        throw "$Label est absent et winget n'est pas disponible sur ce système. " +
              "Installez-le manuellement, puis relancez ce script."
    }

    Write-Step "Installation de $Label"
    # --silent évite les fenêtres d'installateur ; les codes de sortie non nuls
    # sont normaux quand le paquet est déjà présent, d'où le contrôle après coup.
    & winget install --id $PackageId --source winget --accept-package-agreements `
        --accept-source-agreements --silent | Out-Host
    Update-PathFromRegistry
}

# ---------------------------------------------------------------- Node.js ----

Write-Step 'Vérification de Node.js'
$nodeMajor = Get-NodeMajor

if ($nodeMajor -ge $MinimumNodeMajor) {
    Write-Ok "Node $(& node -v) déjà présent."
} else {
    if ($nodeMajor -gt 0) {
        Write-Warn "Node $(& node -v) est trop ancien (minimum : v$MinimumNodeMajor)."
    } else {
        Write-Warn 'Node.js absent.'
    }

    Install-WithWinget -PackageId 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS'

    $nodeMajor = Get-NodeMajor
    if ($nodeMajor -lt $MinimumNodeMajor) {
        throw "Node.js reste introuvable après installation. Fermez ce terminal, " +
              "rouvrez-en un neuf, et relancez ce script."
    }
    Write-Ok "Node $(& node -v) installé."
}

# -------------------------------------------------------------------- git ----

Write-Step 'Vérification de git'
if (Test-Command 'git') {
    Write-Ok 'git déjà présent.'
} else {
    Install-WithWinget -PackageId 'Git.Git' -Label 'Git'
    if (-not (Test-Command 'git')) {
        throw 'git reste introuvable après installation. Rouvrez un terminal et relancez ce script.'
    }
    Write-Ok 'git installé.'
}

# ----------------------------------------------------------------- dépôt ----

if (Test-Path (Join-Path $InstallPath '.git')) {
    Write-Step "Mise à jour du dépôt dans $InstallPath"
    Push-Location $InstallPath
    try { & git pull --ff-only | Out-Host } finally { Pop-Location }
} else {
    if (Test-Path $InstallPath) {
        throw "$InstallPath existe déjà sans être un dépôt git. Choisissez un autre " +
              "emplacement avec -InstallPath, ou renommez ce dossier."
    }
    Write-Step "Clonage dans $InstallPath"
    & git clone $RepositoryUrl $InstallPath | Out-Host
}

Set-Location $InstallPath

# ---------------------------------------------------------- dépendances ----

Write-Step 'Installation des dépendances (une à deux minutes)'
& npm install | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'npm install a échoué. Le message ci-dessus en donne la raison.' }
Write-Ok 'Dépendances installées.'

# -------------------------------------------------------------- démarrage ----

if ($AllowPrivateHosts) {
    $env:MBAPLAYER_ALLOW_PRIVATE_HOSTS = '1'
    Write-Warn 'Portails sur adresse privée autorisés pour cette session.'
}

Write-Step 'Démarrage de MBA Player'
Write-Host ''
Write-Host '    http://localhost:3000' -ForegroundColor Green
Write-Host ''
Write-Host '    Ctrl+C pour arrêter.' -ForegroundColor DarkGray
Write-Host ''

# Laisser au serveur le temps d'écouter avant d'ouvrir le navigateur, sinon la
# page s'ouvre sur une erreur de connexion.
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 6
    Start-Process 'http://localhost:3000'
} | Out-Null

& npm run dev
