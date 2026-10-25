# Installe ou met à jour l'Atlas d'anatomie sous Windows 10 ou 11, sans droits administrateur.
#
# Usage, dans PowerShell (menu Démarrer, taper « PowerShell ») :
#   irm https://raw.githubusercontent.com/Eliottcmu/atlas-anatomie/main/installation/installer-windows.ps1 | iex
#
# Relancer la même commande met l'atlas à jour : la progression, rangée à part dans
# %LOCALAPPDATA%\AtlasAnatomie, est gardée. Téléchargé par PowerShell et non par le navigateur,
# le paquet ne porte pas la marque « venu d'internet » : pas d'écran SmartScreen au lancement.
#
# Tests : ATLAS_ZIP (paquet local au lieu du téléchargement), ATLAS_DOSSIER (dossier d'installation),
# ATLAS_DONNEES (données personnelles, comme le lanceur), ATLAS_SANS_RACCOURCIS et ATLAS_SANS_LANCER
# (variables d'environnement, valeur quelconque).
# Fichier en UTF-8 sans BOM : irm le décode d'après l'en-tête de GitHub, et un BOM gênerait iex.

& {
    $ErrorActionPreference = 'Stop'
    # La barre de progression ralentit beaucoup les téléchargements sous Windows PowerShell 5.1
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $nom = "Atlas d'anatomie"
    $projet = 'https://github.com/Eliottcmu/atlas-anatomie'
    $url = "$projet/releases/latest/download/Atlas-anatomie-Windows.zip"
    $dossier = if ($env:ATLAS_DOSSIER) { $env:ATLAS_DOSSIER } else { Join-Path $env:LOCALAPPDATA "Programs\$nom" }
    # Dossier des données personnelles, comme le lanceur (ATLAS_DONNEES le déplace pour les tests)
    $donnees = if ($env:ATLAS_DONNEES) { $env:ATLAS_DONNEES } else { Join-Path $env:LOCALAPPDATA 'AtlasAnatomie' }

    function Ok([string]$message) { Write-Host "[OK] $message" -ForegroundColor Green }
    function Echec([string]$message, [string]$action) {
        Write-Host "[FAIL] $message" -ForegroundColor Red
        Write-Host "Action : $action" -ForegroundColor Yellow
        throw 'installation interrompue'
    }

    $tmp = Join-Path $env:TEMP ("atlas-installation-" + [guid]::NewGuid().ToString('N'))
    try {
        Write-Host "Installation de l'$nom" -ForegroundColor Cyan
        if (-not [Environment]::Is64BitOperatingSystem -or [Environment]::OSVersion.Version.Major -lt 10) {
            Echec "Ce Windows ne convient pas : l'atlas demande Windows 10 ou 11, en 64 bits." "Utiliser un autre ordinateur."
        }

        # Atlas ouvert : arrêt propre par son serveur local, sinon arrêt forcé (sinon ses fichiers sont verrouillés)
        $instance = Join-Path $donnees 'instance.json'
        if (Test-Path $instance) {
            try {
                $adresse = (Get-Content $instance -Raw | ConvertFrom-Json).adresse
                Invoke-WebRequest -UseBasicParsing -Method Post "$adresse/api/quitter" -TimeoutSec 3 | Out-Null
                Ok "Atlas ouvert : fermé pour la mise à jour."
                Start-Sleep -Seconds 3
            } catch { }
        }
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path.StartsWith($dossier, [StringComparison]::OrdinalIgnoreCase) } |
            Stop-Process -Force -ErrorAction SilentlyContinue

        New-Item -ItemType Directory -Path $tmp | Out-Null
        $zip = Join-Path $tmp 'atlas.zip'
        if ($env:ATLAS_ZIP) {
            Copy-Item $env:ATLAS_ZIP $zip
        } else {
            Write-Host 'Téléchargement (environ 50 Mo)...'
            try {
                Invoke-WebRequest -UseBasicParsing $url -OutFile $zip
            } catch {
                Echec "Téléchargement impossible ($($_.Exception.Message))." "Vérifier la connexion internet et relancer la commande, ou télécharger à la main sur $projet"
            }
        }
        Ok 'Atlas téléchargé.'

        $extrait = Join-Path $tmp 'extrait'
        try {
            Expand-Archive -LiteralPath $zip -DestinationPath $extrait
        } catch {
            Echec 'Le fichier téléchargé est incomplet.' 'Relancer la commande.'
        }
        $source = Join-Path $extrait $nom
        if (-not (Test-Path (Join-Path $source "$nom.exe"))) { Echec 'Le fichier téléchargé est incomplet.' 'Relancer la commande.' }

        if (Test-Path $dossier) {
            try {
                Remove-Item -Recurse -Force $dossier
            } catch {
                Echec "L'ancienne version n'a pas pu être remplacée." "Fermer toutes les fenêtres de l'atlas, puis relancer la commande."
            }
        }
        New-Item -ItemType Directory -Path (Split-Path $dossier) -Force | Out-Null
        Move-Item $source $dossier
        # Un paquet copié depuis un fichier venu d'internet garderait la marque : on la retire
        Get-ChildItem $dossier -Recurse -File | Unblock-File
        $exe = Join-Path $dossier "$nom.exe"
        $version = (Get-Content (Join-Path $dossier 'Lisez-moi.txt') -TotalCount 1) -replace '^.*version\s*', ''
        Ok "Atlas installé dans $dossier (version $version)."

        if (-not $env:ATLAS_SANS_RACCOURCIS) {
            $shell = New-Object -ComObject WScript.Shell
            foreach ($lieu in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
                $raccourci = $shell.CreateShortcut((Join-Path $lieu "$nom.lnk"))
                $raccourci.TargetPath = $exe
                $raccourci.WorkingDirectory = $dossier
                $raccourci.Description = "Atlas d'anatomie en 3D"
                $raccourci.Save()
            }
            Ok "Raccourcis créés sur le Bureau et dans le menu Démarrer."
        }

        Write-Host ''
        Write-Host "C'est prêt. Pour rouvrir l'atlas plus tard : icône « $nom » sur le Bureau ou dans le menu Démarrer." -ForegroundColor Cyan
        Write-Host 'Pour le mettre à jour : relancer la même commande.' -ForegroundColor Cyan
        if (-not $env:ATLAS_SANS_LANCER) { Start-Process $exe }
    } catch {
        if ($_.Exception.Message -ne 'installation interrompue') {
            Write-Host "[FAIL] Erreur inattendue : $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Action : télécharger l'atlas à la main sur $projet" -ForegroundColor Yellow
        }
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
}
