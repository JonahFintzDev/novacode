#!/bin/bash

set -e

cd api

# get name from user input
read -p "Enter the name of the migration: " migrationName

export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_DB=novacode
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432

# create migration
npx prisma migrate dev --name $migrationName

# show migration status
npx prisma migrate status

# show migration history
npx prisma migrate history