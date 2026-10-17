# Builds the production Next.js server and runs it with `node server.js`
# (the standalone output from next.config.ts), not `next dev`.
# Used by ../docker-compose.staging.yml.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Baked into the client bundle at build time — must be set before `next build`.
# Empty (the deployed setup) means relative /api URLs that the app proxies to BACKEND_URL (SCRUM-198),
# so the browser talks to one origin; the build fails if it is empty and BACKEND_URL is not set.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# Read by next.config.ts when it builds the /api rewrite, so it is a build setting too.
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
