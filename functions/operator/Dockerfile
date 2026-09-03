FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY operator ./operator
USER node
ENV NODE_ENV=production
CMD ["node", "operator/refund-purge-service.js"]
