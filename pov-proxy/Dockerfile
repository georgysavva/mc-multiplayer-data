FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev || npm i --omit=dev
COPY index.js tcp-proxy.js ./
ENV NODE_ENV=production
CMD ["node", "tcp-proxy.js"]