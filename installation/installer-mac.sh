#!/bin/sh
# Installe ou met à jour l'Atlas d'anatomie sur Mac (macOS 11 ou plus récent, puce Apple ou Intel).
#
# Usage, dans Terminal (Applications, Utilitaires, Terminal) :
#   curl -fsSL https://raw.githubusercontent.com/Eliottcmu/atlas-anatomie/main/installation/installer-mac.sh | sh
#
# Relancer la même commande met l'atlas à jour : la progression, rangée à part dans
# ~/Library/Application Support/AtlasAnatomie, est gardée. Téléchargée par curl et non par le
# navigateur, l'application ne porte pas la marque de quarantaine : pas d'avertissement au lancement.
#
# Tests : ATLAS_ZIP (paquet local au lieu du téléchargement), ATLAS_DOSSIER (dossier d'installation),
# ATLAS_DONNEES (données personnelles, comme le lanceur), ATLAS_SANS_LANCER (valeur quelconque).
set -eu

NOM="Atlas d'anatomie"
PROJET="https://github.com/Eliottcmu/atlas-anatomie"
URL="$PROJET/releases/latest/download/Atlas-anatomie-Mac.zip"
# Données personnelles, comme le lanceur (ATLAS_DONNEES les déplace pour les tests)
DONNEES="${ATLAS_DONNEES:-$HOME/Library/Application Support/AtlasAnatomie}"

ok() { printf '[OK] %s\n' "$1"; }
echec() { printf '[FAIL] %s\nAction : %s\n' "$1" "$2" >&2; exit 1; }

printf "Installation de l'%s\n" "$NOM"
[ "$(uname -s)" = "Darwin" ] || echec "Ce script est pour Mac." "Sous Windows, suivre les instructions Windows de la page $PROJET"
version_macos=$(sw_vers -productVersion)
[ "${version_macos%%.*}" -ge 11 ] || echec "macOS $version_macos est trop ancien : l'atlas demande macOS 11 (Big Sur) ou plus récent." \
  "Mettre à jour macOS (menu Pomme, Réglages Système, Mise à jour de logiciels)."

# Dossier Applications du Mac si on peut y écrire (compte administrateur), sinon celui de l'utilisateur
if [ -n "${ATLAS_DOSSIER:-}" ]; then
  DEST="$ATLAS_DOSSIER"
elif [ -w /Applications ]; then
  DEST=/Applications
else
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

# Atlas ouvert : arrêt propre par son serveur local, sinon arrêt forcé
if [ -f "$DONNEES/instance.json" ]; then
  adresse=$(sed -n 's/.*"adresse":"\([^"]*\)".*/\1/p' "$DONNEES/instance.json")
  if [ -n "$adresse" ] && curl -fsS -m 3 -X POST "$adresse/api/quitter" >/dev/null 2>&1; then
    ok "Atlas ouvert : fermé pour la mise à jour."
    sleep 3
  fi
fi
pkill -f "$NOM.app/Contents/MacOS/atlas" 2>/dev/null || true

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -n "${ATLAS_ZIP:-}" ]; then
  cp "$ATLAS_ZIP" "$TMP/atlas.zip"
else
  printf 'Téléchargement (environ 55 Mo)...\n'
  curl -fL --progress-bar -o "$TMP/atlas.zip" "$URL" || echec "Téléchargement impossible." \
    "Vérifier la connexion internet et relancer la commande, ou télécharger à la main sur $PROJET"
fi
ok "Atlas téléchargé."

# ditto : décompression de l'outil du Mac, qui garde les droits d'exécution et la signature
ditto -x -k "$TMP/atlas.zip" "$TMP/extrait" 2>/dev/null || echec "Le fichier téléchargé est incomplet." "Relancer la commande."
[ -d "$TMP/extrait/$NOM.app" ] || echec "Le fichier téléchargé est incomplet." "Relancer la commande."
rm -rf "$DEST/$NOM.app" 2>/dev/null || echec "L'ancienne version n'a pas pu être remplacée." \
  "Quitter l'atlas puis relancer la commande."
ditto "$TMP/extrait/$NOM.app" "$DEST/$NOM.app"
xattr -dr com.apple.quarantine "$DEST/$NOM.app" 2>/dev/null || true
ok "Atlas installé dans $DEST."

printf "\nC'est prêt. Pour rouvrir l'atlas plus tard : « %s » dans le dossier Applications (ou Launchpad).\n" "$NOM"
printf 'Pour le mettre à jour : relancer la même commande.\n'
[ -n "${ATLAS_SANS_LANCER:-}" ] || open "$DEST/$NOM.app"
