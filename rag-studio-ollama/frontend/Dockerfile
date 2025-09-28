# frontend/Dockerfile
FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

# Статика будет в ./dist