require('dotenv').config();
const { Telegraf } = require('telegraf');
const minerBot = require('./miner_bot.js');
console.log(minerBot)
const { handleMoonCommand } = require('./miner_bot');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const TARGET_CHAT_ID = '2479123103';

bot.on('new_chat_members', (ctx) => {
  ctx.message.new_chat_members.forEach((member) => {
    ctx.reply(`Привет, ${member.first_name}! Добро пожаловать на сервер капибары 🐾`);
  });
});

bot.command('moon', async (ctx) => {
    console.log("TG MOON")
    try {
        const interaction = {
            user: { username: ctx.from.username },
            reply: async (message) => ctx.reply(message.content),
        };

        await handleMoonCommand(interaction, true); 
    } catch (error) {
        console.error('Ошибка при выполнении команды /moon:', error);
        await ctx.reply('Произошла ошибка при выполнении команды.');
    }
});


bot.start((ctx) => ctx.reply('Привет! Я ваш бот. Я здесь, чтобы помочь вам на сервере капибары.'));

bot.launch()
  .then(() => console.log('Бот запущен'))
  .catch((err) => console.error('Ошибка при запуске бота:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
