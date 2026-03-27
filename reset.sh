#!/bin/bash

set -e

cd api

# Set POSTGRES_* (or DATABASE_URL) to match your database, then run.
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=novacode
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432

# reset database
npx prisma migrate reset
