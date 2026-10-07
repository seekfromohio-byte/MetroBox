# MetroBox

Material Design 3, Netflix-style desktop client for MovieBox — made by JayJoice.

Browse, search and stream movies and series from MovieBox with a featured billboard,
rows, profiles, My List, continue watching, downloads, and a built-in player with
subtitles, quality selection and resume. Fully customizable: Material 3 color themes,
shapes, fonts, card size and subtitle styling. VLC or mpv can be used as the player
instead (streams are HEVC, so external players are used automatically on systems
without an HEVC decoder).

## Install (Debian / Ubuntu)

Download the latest deb from [Releases](https://github.com/seekfromohio-byte/MetroBox/releases/latest)
or directly:

    https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/metrobox_amd64.deb

    sudo dpkg -i metrobox_amd64.deb

## Update checker

The app checks `latest.json` in this repo at launch and notifies about new versions.
Release process: build the deb, attach it to a GitHub release as `metrobox_amd64.deb`,
and update `latest.json`:

```json
{
  "version": "2.0.7",
  "url": "https://github.com/seekfromohio-byte/MetroBox/releases/latest/download/metrobox_amd64.deb",
  "notes": "What's new..."
}
```

## Disclaimer

An unofficial, community-made client built on the [MovieBox-TUI](https://github.com/mesamirh/MovieBox-Tui) project.
Not affiliated with MovieBox.
