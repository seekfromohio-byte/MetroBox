# MetroBox

<img width="1254" height="1254" alt="image" src="https://github.com/user-attachments/assets/bdba3da5-4afc-4812-afcd-bc47bc0afcbc" />

MetroBox is an unofficial community-made desktop client built on the [MovieBox-TUI](https://github.com/mesamirh/MovieBox-Tui) project. Browse, search and stream movies and series with a featured billboard, profiles, My List, continue watching, downloads, and a built-in player with subtitles, quality selection and resume. Customize Material 3 colors, shapes, fonts, card size and subtitle styling.

## Supported platforms

- **Windows:** x64 and ARM64
- **macOS:** Intel and Apple silicon (universal app)
- **Linux:** x64 Flatpak bundle, Debian/Ubuntu package, and AppImage
- **Android and IOS:** COMING SOON!

Video codec and hardware-decoding support depends on the device, operating system and graphics hardware. VLC or mpv can be used for external playback. Install ffmpeg separately for DASH downloads and software transcoding; MetroBox detects it from `PATH`, or you can set its full path in Settings.

## Download and install

Download the installer for your system from [Releases](https://github.com/seekfromohio-byte/MetroBox/releases/latest):

- **Windows:** `MetroBox-Setup.exe` — run the installer.
- **macOS:** `MetroBox.dmg` — open it and drag MetroBox to Applications. The universal app runs on Intel and Apple silicon Macs.
- **Flatpak:** `MetroBox.flatpak` — with Flathub configured, install it with `flatpak install --user ./MetroBox.flatpak`.
- **Debian / Ubuntu:** `metrobox_amd64.deb` — install with `sudo apt install ./metrobox_amd64.deb`.
- **Other Linux distributions:** `metrobox_amd64.AppImage` — make it executable, then run it.

Flatpak downloads will be attached to releases built after this packaging change.

The Windows and macOS builds are currently unsigned. Windows may show a SmartScreen warning, and macOS may require you to approve opening the app in Privacy & Security. Signed releases will need a Windows signing certificate and an Apple Developer ID certificate with notarization configured in the release workflow.

The Flatpak runs MetroBox in a sandbox and includes network, graphics, audio, and Videos-folder access. The built-in player works there; host-installed VLC, mpv, and ffmpeg are not automatically available inside the sandbox.

## Build from source

Install Node.js 22.12 or newer, then run:

```sh
npm ci
npm start
```

Build on the target platform (cross-platform builds should use the matching operating system):

```sh
npm run dist:linux
npm run dist:flatpak
npm run dist:win
npm run dist:mac
```

For a Flatpak build, install Flatpak and flatpak-builder, then build the Linux app first with `npm run dist:linux` and run `npm run dist:flatpak`. Installers are written to `dist/`. macOS builds produce a universal DMG and ZIP, Windows builds produce an x64/ARM64 NSIS installer, and Linux builds produce a Flatpak bundle, Debian package, and AppImage.

## Release builds

Pushing a version tag such as `v2.0.10` runs [the release workflow](.github/workflows/release.yml). It builds each platform on its native GitHub Actions runner and attaches the installers to a GitHub release. The workflow reads the app version from the tag.

After publishing a release, update `latest.json` on `main` so the in-app update checker can link to the right installer for each operating system:

```json
{
  "version": "2.0.10",
  "platforms": {
    "linux": {
      "url": "https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/metrobox_amd64.deb"
    },
    "linuxFlatpak": {
      "url": "https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/MetroBox.flatpak"
    },
    "win32": {
      "url": "https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/MetroBox-Setup.exe"
    },
    "darwin": {
      "url": "https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/MetroBox.dmg"
    }
  },
  "notes": "What's new in the latest release..."
}
```
## Discord
join discord server pretty plz :3 https://discord.gg/ZhSKNj9KfF

## Disclaimer

MetroBox is not affiliated with MovieBox.
