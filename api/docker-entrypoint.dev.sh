#!/bin/bash
set -e
# When ./config is mounted and was created by Docker, it is root-owned. Chown it
# to the host user so files created here match your uid/gid.
uid="${UID:-1000}"
gid="${GID:-1000}"
if [ -d /config ]; then
  chown -R "${uid}:${gid}" /config
fi

# Let the gosu user read Cursor's install under /root/.local (cursor-agent may load deps from there)
if [ -d /root/.local ]; then
  chmod a+x /root
  chmod -R a+rX /root/.local
fi

# Require cursor-agent to exist and be runnable as the same user that runs the app
if [ ! -x /root/.local/bin/cursor-agent ]; then
  echo "error: /root/.local/bin/cursor-agent missing or not executable" >&2
  exit 1
fi
result=$(gosu "${uid}:${gid}" /root/.local/bin/cursor-agent --version)
if [ $? -ne 0 ]; then
  echo "error: cursor-agent failed to run" >&2
  exit 1
fi
echo "cursor-agent version: $result"

export PATH="/root/.local/bin:$PATH"

## make sure prisma is migrated
npx prisma migrate deploy

exec gosu "${uid}:${gid}" "$@"
