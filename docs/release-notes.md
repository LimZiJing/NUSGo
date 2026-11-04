# Website releases and release notes

## Release identity and notes

Use a UTC calendar date plus a same-day sequence as the ID: `YYYY-MM-DD.N`, starting at `1` for each date. New IDs must use the next sequence. The matching immutable Git tag is `release-<id>`, for example `release-2026-11-04.1`. A release ID, its notes, and its resolved tag commit never change. Re-promotions and rollbacks reuse the existing ID and record.

The reviewed notes source is `frontend/releases/<id>.json`. It has a readable `title` and `sections` with `Added`, `Improved` and `Fixed` arrays. Keep empty sections empty; the website and GitHub release body omit them. Do not use raw commit titles. `frontend/public/releases/index.json` is generated during the production build from the paginated published GitHub release history, with current prepared notes added before deployment. The index is bundled with that deployment, so publication does not need a second site deployment.

The release ID date is not a deployment timestamp. Never put a guessed or prepared timestamp in the notes or history. After Cloudflare Pages succeeds, the trusted publisher verifies Cloudflare's production deployment record against the commit SHA and run/attempt marker, checks its completion falls within the workflow deployment step, and reads the deployment's completion time and records it with the resolved commit SHA and production run ID in the GitHub Release body. The Publisher verifies the GitHub tag resolves to that commit; `target_commitish` is not used as proof.

## Backend changes interval

For each frontend release, review successful `backend-production` deployments since the previous website release's recorded success time. Identify their backend commit SHAs and summarize only user-facing behavior that is live and compatible with the frontend being promoted. Include those changes in the same notes sections as frontend behavior. The selected frontend SHA is not a backend snapshot. Backend-only deployments do not create website releases.

For the first tracked release, the notes-review cutoff is **2026-11-03T13:08:14Z**, the commit time of planning baseline `92c74516a8d7f853d704e43ffd82a57ce603e138`. This is a review cutoff, not a claim that this commit was deployed. Include successful backend deployments completed after that cutoff and up to the first frontend promotion, checking their actual deployed commits and compatibility. This guide is the initial operator record; before promotion, record the upper cutoff and reviewed backend run IDs here or in the release preparation record. Earlier functionality may appear in the initial baseline summary, without reconstructing historical releases.

## Production and retry workflow

1. Add and review the canonical notes file. Include the live compatible backend changes for the interval described above.
2. Dispatch `deploy-frontend-production` from the exact commit to promote and provide its release ID. Its ref is the selected deployment SHA. It validates the notes and sequence, fetches all published release pages and resolves their actual tag commits, generates the release index, then builds and deploys the site. Its token has read-only repository access.
3. `publish-website-release` runs after the production workflow completes. It checks the run's repository, workflow, selected SHA, successful Cloudflare Pages step plus an independently verified Cloudflare production record and exact completion time; it fetches the notes from that deployed commit; then it creates the immutable tag and GitHub Release. It runs trusted default-branch code with the write token, never the selected deployment ref.
4. If publication fails after Pages succeeded, rerun only the failed `publish-website-release` workflow run. It rechecks the original successful production run and uses its recorded time; it does not deploy again. A successful redeploy or rollback to an already released SHA and ID leaves the original record unchanged. A published ID pointing at another SHA, or a tag whose resolved commit differs, fails closed.

Development, backend-only, failed and prepared-but-not-promoted builds are not website releases. Do not attach build artifacts to GitHub Releases. A fresh repository with no tracked releases keeps the honest empty history baseline until the first production build bundles its prepared notes.

The publisher uses the frontend-production environment for Cloudflare credentials and any configured approval gate. Cloudflare API access must permit reading Pages deployment history. Missing or mismatched deployment evidence prevents publication.
