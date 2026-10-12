#!/usr/bin/env bash

# Prepares release <date> (YYYY-MM-DD) of grel.ttl; RELEASE.md has the steps around it.
# - sets dcterms:modified of grel:dataset in grel.ttl to the date
# - copies grel.ttl to _dist/<date>.ttl
# - points the default rewrite rule of _dist/.htaccess at it
# - turns `## Unreleased` in CHANGELOG.md into the version section `## YYYYMMDD`

set -e
cd "$(dirname "$0")"

DATE=$1
if [[ ! $DATE =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
	echo 'Invoke as ./release.sh YYYY-MM-DD'
	exit 1
fi
if [ -e "_dist/$DATE.ttl" ]; then
	echo "_dist/$DATE.ttl exists already."
	exit 1
fi

sed -i -E "s|(dcterms:modified +)\"[0-9-]+\"\^\^xsd:date|\1\"$DATE\"^^xsd:date|" grel.ttl
cp grel.ttl "_dist/$DATE.ttl"
sed -i -E "s|^RewriteRule \^\\$ [0-9-]+\.ttl|RewriteRule ^\$ $DATE.ttl|" _dist/.htaccess
sed -i "s|^## Unreleased|## Unreleased\n\n## ${DATE//-/}|" CHANGELOG.md

echo "Prepared release $DATE; review with git diff."
