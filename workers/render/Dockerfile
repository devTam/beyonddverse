FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY . .
ENV NODE_ENV=production
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
EXPOSE 8080
CMD ["npx", "tsx", "workers/render/src/server.ts"]
