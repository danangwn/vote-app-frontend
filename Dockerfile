# ---- build stage ----
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
# If you need env variables at build time (NEXT_PUBLIC_*), set them here (or use build args)
# Example: ARG NEXT_PUBLIC_API_URL
# then: RUN NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL npm run build
RUN npm run build

# ---- runtime stage ----
FROM node:18-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production
# Use a non-root user (optional security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy only what we need from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/next.config.ts ./next.config.ts

EXPOSE 3000

# Start Next in production
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
