# Mattress ERP API — container image
FROM node:22-alpine

# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm install

# Copy the source and build.
COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000

# On boot: sync the schema to the database, seed reference data, then serve.
# `prisma db push` creates the tables directly from schema.prisma (no migration
# files needed), which is ideal for first-run and development.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npm run db:seed && node dist/main.js"]
