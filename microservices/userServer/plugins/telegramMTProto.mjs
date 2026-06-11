import path from 'path';
import MTProto from '@mtproto/core';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const manifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключите Telegram аккаунт (двойной клик для настройки)',
  fields: []
};
class telegram {
  constructor(api_id, api_hash, phone, id) {
    this.id = id;
    this.api_id = api_id;
    this.api_hash = api_hash;
    this.phone = phone;
    this.botCreated = false;
    this.messageSubscribers = [];

    this.mtproto = new MTProto({
      api_id: this.api_id,
      api_hash: this.api_hash,
      storageOptions: {
        path: path.resolve(__dirname, './data/1.json'),
      },
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.messageSubscribers.push(callback);
    }
  }

  sendCode() {
    return this.mtproto.call('auth.sendCode', {
      phone_number: this.phone,
      api_id: this.api_id,
      api_hash: this.api_hash,
      settings: {
        _: 'codeSettings',
      },
    });
  }

  signIn(code, phone_code_hash) {
    return this.mtproto.call('auth.signIn', {
      phone_number: this.phone,
      phone_code_hash: phone_code_hash,
      phone_code: code,
    });
  }

  checkAuth() {
    return this.mtproto.call('users.getFullUser', {
      id: {
        _: 'inputUserSelf',
      }
    });
  }

  async getUserById(userId) {
    try {
      const user = await this.mtproto.call('users.getUsers', {
        id: [{
          _: 'inputUser',
          user_id: userId,
        }]
      });

      if (user && user.length > 0) {
        return { ...user[0] };
      } else {
        return null;
      }
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  parseBotDetails(text) {
    const tokenMatch = text.match(/\b\d+:[\w-]+\b/);
    const botUrlMatch = text.match(/t\.me\/[\w_]+/);

    return {
      token: tokenMatch ? tokenMatch[0] : null,
      botUrl: botUrlMatch ? botUrlMatch[0] : null,
      integration_id: this.id
    };
  }

  async createBot({ botName }, callback) {
    try {
      this.botCreated = false;

      await this.sendMessage({ username: 'BotFather', messageText: '/newbot' }, () => { });

      this.mtproto.updates.on('updates', async (update) => {

        if (!this.botCreated) {
          if (update.users[0].id == '93372553') {
            const message = update.updates[0].message.message;

            if (message.includes("Alright, a new bot. How are we going to call it")) {
              await this.sendMessage({ username: 'BotFather', messageText: botName }, () => { });

            } else if (message.includes("choose a username for your bot. It must end in")) {
              await this.sendMessage({ username: 'BotFather', messageText: botName + '_bot' }, () => { });

            } else if (message.includes("Done! Congratulations on your new bot")) {

              const botDetails = this.parseBotDetails(update.updates[0].message.message);
              console.log('Детали бота:', botDetails);

              callback(null, botDetails);
              this.botCreated = true;

            } else if (message.includes("Sorry, too many attempts.")) {

              callback({ error: update.updates[0].message.message }, null);
              this.botCreated = true;

            } else {

              callback({ error: update.updates[0].message.message }, null);
              this.botCreated = true;
            }
          }
        }
      });

    } catch (error) {
      console.log(error);
    }
  }

  async sendPollAndWaitForAnswer(username, pollQuestion, pollAnswers) {
    try {

      const user = await this.mtproto.call('contacts.resolveUsername', {
        username: username
      });

      const inputPeer = {
        _: 'inputPeerUser',
        user_id: user.users[0].id,
        access_hash: user.users[0].access_hash.toString()
      };

      const poll = {
        _: 'poll',
        id: Math.floor(Math.random() * 1e16),
        closed: false,
        public_voters: true,
        question: pollQuestion,
        answers: pollAnswers.map(answer => {
          return {
            _: 'pollAnswer',
            text: answer,
            option: Buffer.from(answer).toString('hex').substring(0, 1)
          };
        }),
      };

      const media = {
        _: 'inputMediaPoll',
        poll: poll
      };

      await this.mtproto.call('messages.sendMedia', {
        peer: inputPeer,
        media: media,
        random_id: Math.floor(Math.random() * 1e16)
      });

      return new Promise((resolve, reject) => {

        this.subscribe((userId, message, pollAnswer) => {
          if (pollAnswer && userId === user.users[0].id) {
            resolve(pollAnswer);
          }
        });

      });

    } catch (error) {
      console.log(error);
    }
  }

  listenUpdates() {

    this.mtproto.updates.on('updates', async (update) => {
      console.log('updates event', update);
    });

    this.mtproto.updates.on('updateShort', async (update) => {
      console.log('updateShort event', update);
    });

    this.mtproto.updates.on('updateShortMessage', async (update) => {

      const user = await this.getUserById(update.user_id);

      console.log(`MESSAGE: ${user.username} ${user.id} ${user.first_name} : ${update.message}`);

      for (let i = 0; i < this.messageSubscribers.length; i++) {
        this.messageSubscribers[i](update.user_id, update.message);
      }

    });

    this.mtproto.updates.on('updateShortChatMessage', async (update) => {
      console.log('updateShortChatMessage event', update);
    });

    this.mtproto.updates.on('updateNewMessage', async () => { });

    this.mtproto.updates.on('updateNewChannelMessage', async () => { });

    this.mtproto.updates.on('updatesCombined', async () => { });

    this.mtproto.updates.on('updatesTooLong', async () => { });

  }

  async sendMessage({ username, messageText }, callback) {
    try {

      const user = await this.mtproto.call('contacts.resolveUsername', {
        username: username
      });

      const inputPeer = {
        _: 'inputPeerUser',
        user_id: user.users[0].id,
        access_hash: user.users[0].access_hash.toString()
      };

      const result = await this.mtproto.call('messages.sendMessage', {
        peer: inputPeer,
        message: messageText,
        random_id: Math.floor(Math.random() * 1e9)
      });

      callback(null, { ...result });

    } catch (error) {
      console.log(error);
    }
  }

  async start() {

    this.checkAuth()
        .then(() => {

          console.log('YES AUTH');
          this.listenUpdates();

        })
        .catch(error => {

          if (error.error_message.includes('_MIGRATE_')) {

            const [type, nextDcId] = error.error_message.split('_MIGRATE_');
            this.mtproto.setDefaultDc(+nextDcId);

            return this.checkAuth();
          }

          if (error.error_message === 'AUTH_KEY_UNREGISTERED') {

            return this.sendCode()
                .then(result => {

                  this.rl.question('Введите код, который вы получили по SMS: ', (code) => {

                    this.signIn(code, result.phone_code_hash)
                        .then(() => {

                          this.listenUpdates();

                        })
                        .catch(error => {
                          console.log('catch(error', error);
                        })
                        .finally(() => {
                          this.rl.close();
                        });

                  });

                }).catch(err => {
                  console.log('ERRR', err);
                });
          }

        });
  }

  async sendMessageByPhoneNumber(phoneNumber, messageText) {
    try {

      const importResult = await this.mtproto.call('contacts.importContacts', {
        contacts: [{
          _: 'inputPhoneContact',
          client_id: 4,
          phone: phoneNumber,
          first_name: 'вася',
          last_name: 'пупкин'
        }]
      });

      if (importResult.users.length > 0) {

        const user = importResult.users[0];

        const inputPeer = {
          _: 'inputPeerUser',
          user_id: user.id,
          access_hash: user.access_hash
        };

        await this.mtproto.call('messages.sendMessage', {
          peer: inputPeer,
          message: messageText,
          random_id: Math.floor(Math.random() * 1e9)
        });

      } else {

        console.log('No user found for this phone number.');

      }

    } catch (error) {
      console.log(error);
    }
  }
}

function includes(message) {
  return message;
}

export default telegram;