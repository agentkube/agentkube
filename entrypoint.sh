#!/bin/sh

# Run migrations
bunx prisma migrate deploy

# Start the application
exec bun run src/index.ts