FROM node:20-slim

# 環境變數設定
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome-stable
ENV TZ=Asia/Taipei

# 設定時區
RUN apt-get update && apt-get install -y tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Taipei /etc/localtime && \
    echo "Asia/Taipei" > /etc/timezone

# 安裝 Chrome 依賴和 Chrome 本身
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 安裝 pnpm
RUN npm install -g pnpm@latest

# 設置工作目錄
WORKDIR /app

# 複製其他專案文件
COPY . .

# 使用 pnpm 安裝依賴
RUN pnpm install

# 使用 pnpm 構建應用
RUN pnpm run build

# 設置容器啟動命令
CMD ["node", "/app/dist/main.js"]