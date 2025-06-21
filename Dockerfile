FROM node:24-alpine
LABEL authors="joshw"

# Install curl for fetching latest Node
RUN apk add --no-cache curl

# Install latest Node.js (overwrites the base image’s Node) and latest npm
RUN curl -fsSL https://unofficial-builds.nodejs.org/download/release/v24.2.0/node-v24.2.0-linux-x64-musl.tar.xz -o node.tar.xz \
    && tar -xf node.tar.xz --strip-components=1 -C /usr/local \
    && rm node.tar.xz \
    && npm install -g npm@latest

RUN npm install -g npm@11.4.2

# Show versions for debug
RUN node -v

COPY . /app

WORKDIR /app

RUN npm install

