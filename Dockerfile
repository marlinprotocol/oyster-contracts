FROM node:10.15-jessie

RUN cd ~ && mkdir app
WORKDIR /home/app
RUN npm i -g truffle
RUN npm i -g ganache-cli
RUN npm i -S truffle-privatekey-provider
COPY . /home/app
CMD [ "ganache-cli"]