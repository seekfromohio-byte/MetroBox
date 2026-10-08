#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$repo_root/com.jayjoice.metrobox.yml"
app_bundle="$repo_root/dist/linux-unpacked"
output="$repo_root/dist/MetroBox.flatpak"
build_root="$(mktemp -d "${TMPDIR:-/tmp}/metrobox-flatpak.XXXXXX")"
trap 'rm -rf "$build_root"' EXIT
cd "$repo_root"

if ! command -v flatpak-builder >/dev/null 2>&1; then
  echo "flatpak-builder is required. Install flatpak-builder and retry." >&2
  exit 1
fi
if [ ! -x "$app_bundle/metrobox" ]; then
  echo "Missing $app_bundle. Build the Linux app first with: npm run dist:linux" >&2
  exit 1
fi

flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak-builder --user --install-deps-from=flathub --force-clean \
  --repo="$build_root/repo" "$build_root/build" "$manifest"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  "$build_root/repo" "$output" com.jayjoice.metrobox stable
echo "Created $output"
