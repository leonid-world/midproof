FROM node:22.21.1-bookworm-slim
WORKDIR /workspace/giwa-contrract
COPY giwa-contrract/package.json giwa-contrract/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY giwa-contrract/ ./
RUN npm run compile
CMD ["node", "scripts/prepare-local-demo.cjs"]
