#!/bin/sh
set -eu

# A newly attached Railway volume is root-owned. Only our dedicated state
# directory is adjusted; MySQL has its own service and volume.
mkdir -p /data/midnight-demo /data/cache
chown app:app /data/midnight-demo /data/cache
chmod 700 /data/midnight-demo
exec gosu app node /app/scripts/midnight-demo.mjs --mode=all
