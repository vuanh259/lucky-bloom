FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs fulfillment.mjs gifts.json ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/lucky-bloom.sqlite
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
