FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json start.js ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
# Run unprivileged: nothing at runtime needs root.
USER node
CMD ["node", "start.js"]
