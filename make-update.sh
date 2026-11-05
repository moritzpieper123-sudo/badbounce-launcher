#!/bin/bash
# Usage: make-update.sh 1.7.1  -> builds bbl, writes the version into the app, and creates
# /mnt/project-files/badbounce-launcher/update/{app-update.zip,update.json}
# Commit both to C:\Users\Morit\OneDrive\Badbounce\.claude-workspace\launcher\update\ ; the launcher installs it by itself.
set -e; V="$1"; [ -n "$V" ] || { echo "version?"; exit 1; }
cd /home/claude/bbl && npx tsc -p . && npx vite build >/dev/null
grep -q supabase.co dist/assets/*.js || { echo "cloud config missing in build"; exit 1; }
R="/home/claude/release/Badbounce Launcher/resources/app"
rm -rf "$R/dist" && cp -r dist "$R/dist" && cp electron/*.js "$R/electron/"
sed -i "s/\"version\": *\"[^\"]*\"/\"version\":\"$V\"/" "$R/package.json"
O=/mnt/project-files/badbounce-launcher/update; mkdir -p $O; rm -f /tmp/app-update.zip
(cd "$R" && zip -qr -X /tmp/app-update.zip dist electron package.json)
cp /tmp/app-update.zip $O/app-update.zip && printf '{"version":"%s"}\n' "$V" > $O/update.json
md5sum /tmp/app-update.zip $O/app-update.zip; cat $O/update.json
