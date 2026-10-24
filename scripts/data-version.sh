#!/usr/bin/env bash
# Prints the data version for a commit: the last commit that changed the data contract.
# The frontend embeds it as VITE_DATA_VERSION and the backend serves it as NUSGO_DATA_VERSION, and
# the frontend refuses to run when they differ. Commits that only touch frontend or backend code
# keep the same version, so each side can deploy on its own.
# Needs full git history (actions/checkout with fetch-depth: 0).
set -euo pipefail

# deploy-prod.sh runs this over SSH from the home directory, so work from the repository root.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

commit="${1:-HEAD}"

# The contract is the canonical data files and the types shared by both sides. The backend deploy
# workflow and the frontend deploy workflows must all trigger on these paths.
git log -1 --format=%H "$commit" -- shared frontend/public/data
