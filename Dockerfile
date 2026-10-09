FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HIPKOP_PLAYER_HOST=0.0.0.0 PORT=8080 HIPKOP_DB_PATH=/data/hipkop.sqlite HIPKOP_MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/ ./
COPY --from=build --chown=node:node /app/scripts/migrate-data.js /app/scripts/moderate.js ./scripts/
RUN mkdir -p /data/media && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
