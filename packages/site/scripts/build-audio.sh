#!/usr/bin/env bash
# build-audio.sh — Synthesise CC0 UI ping sounds for the SoundToggle.
#
# Generates four deterministic audio files using ffmpeg's aevalsrc filter
# (sine wave with exponential decay). The -fflags +bitexact -flags +bitexact
# -map_metadata -1 flags strip non-deterministic metadata (creation timestamps)
# so that running this script twice produces byte-identical output.
#
# Why: synthesised in-house rather than sourced from an external URL so
# audio generation is fully offline-friendly and provenance is self-contained.
# Committed files mean CI never needs to regenerate them (same pattern as the
# Phase 6 webmention gate — see ADR 0037).
#
# Audio design:
#   cmd-k — two-tone click: 880 Hz, 140 ms, soft exponential decay, −12 LUFS target
#   hover  — softer lower ping: 440 Hz, 110 ms, sharper decay
#
# Budget: total ≤ 40 960 bytes (40 KB) across all four files.
#
# @see packages/specs/specs/07-atmosphere.md § T2
# @see packages/specs/adrs/0037-web-audio-no-howler.md
# @see https://ffmpeg.org/ffmpeg-filters.html#aevalsrc

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="${REPO_ROOT}/packages/site/public/audio"

mkdir -p "${OUT_DIR}"

# cmd-k.mp3 — short two-tone click (140 ms, soft attack, target ~1.4 KB)
ffmpeg -y \
  -f lavfi \
  -i "aevalsrc='0.5*sin(2*PI*880*t)*exp(-30*t)':d=0.14" \
  -ar 44100 \
  -codec:a libmp3lame \
  -q:a 9 \
  -fflags +bitexact \
  -flags +bitexact \
  -map_metadata -1 \
  "${OUT_DIR}/cmd-k.mp3"

# cmd-k.webm — same source, opus codec (for browsers with webm support)
ffmpeg -y \
  -f lavfi \
  -i "aevalsrc='0.5*sin(2*PI*880*t)*exp(-30*t)':d=0.14" \
  -ar 48000 \
  -codec:a libopus \
  -b:a 24k \
  -fflags +bitexact \
  -flags +bitexact \
  -map_metadata -1 \
  "${OUT_DIR}/cmd-k.webm"

# hover.mp3 — softer/lower ping (110 ms, target ~1 KB)
ffmpeg -y \
  -f lavfi \
  -i "aevalsrc='0.3*sin(2*PI*440*t)*exp(-40*t)':d=0.11" \
  -ar 44100 \
  -codec:a libmp3lame \
  -q:a 9 \
  -fflags +bitexact \
  -flags +bitexact \
  -map_metadata -1 \
  "${OUT_DIR}/hover.mp3"

# hover.webm — same source, opus codec
ffmpeg -y \
  -f lavfi \
  -i "aevalsrc='0.3*sin(2*PI*440*t)*exp(-40*t)':d=0.11" \
  -ar 48000 \
  -codec:a libopus \
  -b:a 24k \
  -fflags +bitexact \
  -flags +bitexact \
  -map_metadata -1 \
  "${OUT_DIR}/hover.webm"

echo "Audio files generated:"
du -b "${OUT_DIR}"/*.mp3 "${OUT_DIR}"/*.webm
TOTAL=$(du -b "${OUT_DIR}"/*.mp3 "${OUT_DIR}"/*.webm | awk '{sum+=$1} END {print sum}')
echo "Total: ${TOTAL} bytes (budget: 40960)"
if [ "${TOTAL}" -gt 40960 ]; then
  echo "ERROR: total exceeds 40 KB budget" >&2
  exit 1
fi
