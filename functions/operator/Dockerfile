FROM node:22-bookworm-slim
WORKDIR /app
COPY operator-runtime/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY operator ./operator
USER node
ENV NODE_ENV=production
CMD ["node", "operator/refund-purge-service.js"]
