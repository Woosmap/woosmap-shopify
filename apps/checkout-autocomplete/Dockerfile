FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build

# Run as non-root. node:20-alpine ships an unprivileged `node` user; /app must be
# owned by it because docker-start runs `prisma migrate deploy` against the
# sqlite file and `prisma generate` writes into node_modules.
RUN chown -R node:node /app
USER node

CMD ["npm", "run", "docker-start"]
