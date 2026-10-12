#!/usr/bin/env bash

# Checks that the published FnO descriptions match grel.ttl.
# Exit code 0: they match; 1: they differ (upload grel.ttl by hand); 2: the download failed.

set -e

URL=https://users.ugent.be/~bjdmeest/function/grel.ttl
LOCAL="$(dirname "$0")/grel.ttl"

ONLINE=$(mktemp)
trap 'rm -f "$ONLINE"' EXIT

if ! curl -fsSL -o "$ONLINE" "$URL"; then
	echo "Downloading $URL failed."
	exit 2
fi

# Line endings depend on the checkout, so they are ignored.
if diff -u --strip-trailing-cr --label "$URL" --label "$LOCAL" "$ONLINE" "$LOCAL"; then
	echo "$URL matches $LOCAL."
else
	echo
	echo "$URL differs from $LOCAL: upload that file to $URL."
	exit 1
fi
