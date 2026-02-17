FROM node:lts AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/sdk-ts/package.json packages/sdk-ts/
COPY packages/cli/package.json packages/cli/

RUN npm install

COPY tsconfig.json ./
COPY packages/ packages/

RUN npm run build

FROM node:lts-slim

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/sdk-ts/package.json packages/sdk-ts/
COPY --from=builder /app/packages/cli/package.json packages/cli/

RUN npm install --production

COPY --from=builder /app/packages/core/dist packages/core/dist/
COPY --from=builder /app/packages/server/dist packages/server/dist/
COPY --from=builder /app/packages/sdk-ts/dist packages/sdk-ts/dist/
COPY --from=builder /app/packages/cli/dist packages/cli/dist/

COPY playground/ playground/
COPY templates/ templates/

EXPOSE 8787

CMD ["node", "packages/cli/dist/index.js", "start"]
