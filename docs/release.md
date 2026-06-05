# Release and Branching

## Branch Model

- `master` is the stable development line and should stay releasable.
- `codex/*` branches are used for larger feature work.
- `release/*` branches are optional, temporary release-preparation branches.
- `vX.Y.Z` tags are the permanent release record and trigger GitHub release builds.

Do not keep long-lived `release/*` branches for ordinary releases. Use tags and GitHub Releases as the durable release history.

## Environments

- `dev/local`: run with `pnpm tauri dev`; updater checks are not part of local development.
- `release`: built by GitHub Actions from `vX.Y.Z` tags; publishes installable assets and `latest.json` for the updater.

There is currently no separate staging updater channel.

## Normal Release

1. Update `CHANGELOG.md`.
2. Add release notes at `docs/releases/vX.Y.Z.md`.
3. Run:

   ```bash
   pnpm release X.Y.Z
   ```

4. Wait for the GitHub Actions release workflow to finish.
5. Inspect the draft release assets and notes.
6. Publish the draft release.

The release script syncs app versions, runs tests, commits version changes when needed, creates the annotated tag, and pushes the branch and tag.

## Initial Release or Retagging Current Version

If the repository is already at the target version, use:

```bash
pnpm release X.Y.Z --allow-current-version
```

This creates the tag without a version-bump commit.

## Publish Checklist

- CI is passing on `master`.
- Release workflow is successful for all platforms.
- `latest.json` exists in the release assets.
- Signed updater artifacts and `.sig` files are uploaded.
- Release notes are present and user-facing.
- The draft release is manually reviewed before publishing.
