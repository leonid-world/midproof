FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace/giwa-ui
COPY giwa-ui/package.json giwa-ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY giwa-ui/ ./
ENV VITE_API_URL=/api \
    VITE_MIDNIGHT_POC_ENABLED=false \
    VITE_MIDNIGHT_DEMO_ENABLED=true \
    VITE_MIDPROOF_LOCAL_DEMO=true \
    VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED=false \
    VITE_MIDNIGHT_PROOF_API_URL=/midnight-proof
RUN npm run build
FROM nginx:1.28.0-alpine
COPY docker/local/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/giwa-ui/dist /usr/share/nginx/html
