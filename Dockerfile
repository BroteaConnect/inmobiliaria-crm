# syntax=docker/dockerfile:1
# Multi-stage: build the static bundle, serve dist/ with nginx.
# Coolify must use build_pack=dockerfile — nixpacks has no start command
# for static sites and crash-loops (503).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
# PUBLIC_* vars are inlined into the bundle at build time. The composer
# wires one ARG/ENV pair per feature right below this anchor; the deploy
# skill supplies the values as Coolify build args.
# brotea:build-args
ARG PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ARG PUBLIC_BUILD_COMMIT
ENV PUBLIC_BUILD_COMMIT=$PUBLIC_BUILD_COMMIT
ARG PUBLIC_OUTBOUND_SECRET=""
ENV PUBLIC_OUTBOUND_SECRET=$PUBLIC_OUTBOUND_SECRET
ARG PUBLIC_PB_URL
ENV PUBLIC_PB_URL=$PUBLIC_PB_URL
ARG PUBLIC_GLITCHTIP_DSN
ENV PUBLIC_GLITCHTIP_DSN=$PUBLIC_GLITCHTIP_DSN
ARG PUBLIC_UMAMI_WEBSITE_ID
ENV PUBLIC_UMAMI_WEBSITE_ID=$PUBLIC_UMAMI_WEBSITE_ID
ARG PUBLIC_UMAMI_SRC
ENV PUBLIC_UMAMI_SRC=$PUBLIC_UMAMI_SRC
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Sin esto, /hoy y las demás rutas responden 404: ver nginx.conf.
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
