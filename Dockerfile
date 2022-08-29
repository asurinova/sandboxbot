FROM node

WORKDIR /usr/app

COPY package.json ./

RUN yarn global add pm2
RUN yarn

COPY . .

RUN yarn build

CMD yarn start