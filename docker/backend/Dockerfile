FROM node:lts-alpine

ENV NODE_ENV=production

RUN mkdir /app
WORKDIR /app

COPY package.json .

RUN apk update && apk upgrade && \
    apk add --no-cache bash
    
RUN npm install --omit=dev

COPY moleculer.config.js ./
COPY services ./

USER node

#CMD ["bash"]
CMD ["npm", "start"]