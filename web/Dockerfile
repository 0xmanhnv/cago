# AgriMate Next.js frontend. Runs `next start` so next.config rewrites read the
# FRAPPE_INTERNAL_URL env at runtime (the Frappe nginx service on the compose network).
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
