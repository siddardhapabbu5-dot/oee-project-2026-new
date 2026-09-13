#!/bin/sh
set -e
echo "Running database migrations..."
npx prisma migrate deploy
echo "Starting Nakshatra OEE API..."
exec node dist/server.js
