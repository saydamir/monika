FROM node:18-alpine AS builder

WORKDIR /monika

COPY package*.json ./

# npm workspaces
COPY packages packages
RUN npm ci --workspaces --if-present
RUN npm run build --workspaces --if-present

RUN npm ci
COPY . .

RUN npm pack

FROM node:18-alpine AS runner

COPY --from=builder /monika/hyperjumptech-monika-*.tgz ./
COPY --from=builder /monika/packages/notification/hyperjumptech-monika-notification-*.tgz ./packages/notification/
RUN npm install -g --unsafe-perm ./hyperjumptech-monika-*.tgz

WORKDIR /
RUN mkdir /config

CMD ["monika"]