# Releasing grel-functions-fno

A release is named after its date (`YYYY-MM-DD`, written `<date>` below) and is the copy `_dist/<date>.ttl` of `grel.ttl`. Consumers pin a release: grel-functions-java ships it in its jar as `functions_grel.ttl`.

## Before you start

- bash (Git Bash on Windows) and curl.
- Push access to `origin` (https://gitlab.ilabt.imec.be/KNoWS/fno/lib/grel-functions-fno), and write access to <https://users.ugent.be/~bjdmeest/function/>.
- You are on `master`, up to date with `origin/master`, with a clean working tree.
- `## Unreleased` in `CHANGELOG.md` lists everything since the last release.

## Release

1. Run `./release.sh <date>`. It sets `dcterms:modified` of `grel:dataset` in `grel.ttl` to the date, copies `grel.ttl` to `_dist/<date>.ttl`, points the default rewrite rule of `_dist/.htaccess` at it, and turns `## Unreleased` in `CHANGELOG.md` into the section `## YYYYMMDD`.
2. Review the changes (`git diff`), commit them as "release <date>" and push `master`.
3. GitLab mirrors `master` to GitHub (https://github.com/FnOio/grel-functions-fno); check that `_dist/<date>.ttl` is there.
4. Upload `grel.ttl` to <https://users.ugent.be/~bjdmeest/function/grel.ttl>, the document behind the `grel:` namespace, and run `./check-online.sh` until it reports a match.

## After the release

- In grel-functions-java, run `./sync-descriptions.sh <date>` and release it (see its `RELEASE.md`).
