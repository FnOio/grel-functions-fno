#!/bin/sh

CURRDATE="$(date -I)"

graphy content.ttl.read --pipe util.dataset.tree --union --pipe content.ttl.write --inputs void-grel.ttl functions.ttl ./output/out.ttl >"_dist/$CURRDATE.ttl"
sed --in-place "s/^RewriteRule .*$/RewriteRule ^$ $CURRDATE.ttl [R=303]/gm" ./_dist/.htaccess
