#!/usr/bin/env bash
# Builds the office2pdf WASM package (DOCX/XLSX/PPTX -> PDF, 100% client-side)
# and drops it into client/src/lib/office2pdf-wasm/.
#
# office2pdf (https://github.com/developer0hye/office2pdf, Apache-2.0) has no
# published npm package -- it's a Rust crate you build yourself with
# wasm-pack. This is a ONE-TIME step (re-run it only to pick up a new
# office2pdf release); the built .wasm/.js files are checked into this repo
# afterwards like any other asset, so nobody else on the team needs Rust
# installed.
#
# Requirements: Rust (rustup.rs) + the wasm32 target + wasm-pack.
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-pack
#
# Usage:
#   ./scripts/build-office2pdf-wasm.sh [version]   # default: v0.6.8

set -euo pipefail

VERSION="${1:-v0.6.8}"
WORKDIR="$(mktemp -d)"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/client/src/lib/office2pdf-wasm"

echo "==> Cloning office2pdf ${VERSION} into ${WORKDIR}"
git clone --depth 1 --branch "${VERSION}" https://github.com/developer0hye/office2pdf.git "${WORKDIR}"

echo "==> Building WASM package (with bundled Simplified Chinese font fallback)"
(
  cd "${WORKDIR}"
  # Drop wasm-cjk-font (and use --features wasm instead) for a ~3.3MB smaller
  # bundle if your org has no Simplified Chinese documents to convert.
  wasm-pack build crates/office2pdf --target web --features wasm-cjk-font --locked
)

echo "==> Copying built package to ${OUT_DIR}"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"
cp -r "${WORKDIR}/crates/office2pdf/pkg/." "${OUT_DIR}/"
# The generated package.json's "name"/"module" fields point at itself; drop it
# so it isn't mistaken for a real npm dependency during install.
rm -f "${OUT_DIR}/package.json" "${OUT_DIR}/.gitignore"

rm -rf "${WORKDIR}"
echo "==> Done. Commit client/src/lib/office2pdf-wasm/ — it's a build artifact, not source."
