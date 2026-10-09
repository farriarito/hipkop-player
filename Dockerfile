# HIPKOP PLAYER — production image.
#
#   docker build -t hipkop-player .
#   docker run -d --name hipkop -p 8080:8080 --env-file .env -v hipkop-data:/data hipkop-player
#
# The catalog (SQLite) and the media cache are the only state worth keeping, so
# both are pinned under /data and declared as a volume.

FROM node:24-slim AS build
WORKDIR /app
# Dependencies are installed before the source so the layer is cached. The
# postinstall hook cannot run here (scripts/ is not copied yet) and would also
# drag Playwright browsers into the image, so it is deferred to the next stage.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
# Vendors GSAP + fonts into public/ (what postinstall would have done), then runs
# check + typecheck + the dist bundle.
RUN npm run assets:vendor \
 && npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HIPKOP_PLAYER_HOST=0.0.0.0 \
    HIPKOP_PLAYER_PORT=8080 \
    HIPKOP_DB_PATH=/data/hipkop.sqlite \
    HIPKOP_MEDIA_DIR=/data/media
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/media && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HIPKOP_PLAYER_PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--env-file-if-exists=.env", "dist/server.js"]