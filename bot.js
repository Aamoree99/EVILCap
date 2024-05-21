const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ActivityType, PermissionsBitField, ChannelType  } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const axios = require('axios');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();
const qs = require('querystring');
const fs = require('fs').promises;
const path = require('path');
const { scheduleJob } = require('node-schedule');
const { randomInt } = require('crypto');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const GUILD_ID = '1159107187407335434';
const W_CHANNEL_ID = '1159107187986157599'; 
const LOG_CHANNEL_ID = '1239085828395892796'; 
const REPORT_CHANNEL_ID= '1230611265794080848';
const MAIN_CHANNEL_ID= '1172972375688626276';
const CASINO_CHANNEL_ID= '1239752190986420274';
const MOON_CHANNEL_ID= '1159193601289490534';
const EN_MAIN_CHANNEL_ID= '1212507080934686740';
const TARGET_CHANNEL_ID = '1242246489787334747';
const chatApi = process.env.OPENAI_API_KEY;


const waitList = new Map();
const messageMap = new Map();

let tokenCache = {
    accessToken: null,
    expiresAt: null
};

let totalBets = 0;
let accumulatedWins = 0;
let bonusPool = 0;
let transactionsCache = [];
let isProcessing = false;

client.once('ready', async () => {
    client.user.setPresence({
        activities: [{ name: 'анализирование Гачи', type: ActivityType.Playing }],
        status: 'online'
    });
    logAndSend(`<@235822777678954496>, папа я родился!`);
    await getAccessTokenUsingRefreshToken();
    logAndSend(`Logged in as ${client.user.tag}!`);
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    scheduleDailyActivity(client);
    createRoleMessage();
    scheduleTransactionCheck();
    cron.schedule('0 11 * * *', () => {
        updateMoonMessage();
    }, {
        scheduled: true,
        timezone: "UTC"
    });
    await updateMoonMessage();
    scheduleDailyMessage();
    //setInterval(cleanupOldMessages, 60 * 60 * 1000);
});

const clientId = '1238628917900738591'; 
const token = process.env.DISCORD_TOKEN; // Токен, хранящийся в переменных окружения
const guildId = GUILD_ID; 

const commands = [
    new SlashCommandBuilder()
        .setName('addignore')
        .setDescription('Добавляет пользователя в игнор-лист')
        .addStringOption(option => option.setName('username').setDescription('Имя пользователя').setRequired(true)),
    new SlashCommandBuilder()
        .setName('removeignore')
        .setDescription('Удаляет пользователя из игнор-листа')
        .addStringOption(option => option.setName('username').setDescription('Имя пользователя').setRequired(true)),
    new SlashCommandBuilder()
        .setName('listignore')
        .setDescription('Показывает текущий игнор-лист'),
    new SlashCommandBuilder()
        .setName('reactionslist')
        .setDescription('Показывает список пользователей и количество их реакций на сообщение')
        .addStringOption(option =>
            option.setName('messageid')
                .setDescription('ID сообщения')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('channelid')
                .setDescription('ID канала')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('members')
        .setDescription('Показать участников корпы сейчас'),
    new SlashCommandBuilder()
        .setName('moon')
        .setDescription('Создать уведомление о луне.'),
    new SlashCommandBuilder()
        .setName('winners')
        .setDescription('Выплаты казино'),
    new SlashCommandBuilder()
        .setName('startcasino')
        .setDescription('Начать казино игру'),
    new SlashCommandBuilder()
        .setName('show_sessions')
        .setDescription('Показывает активные сессии и их уникальные коды с возможностью удаления'),
    new SlashCommandBuilder()
        .setName('hf')
        .setDescription('Пинг и показать количество участников'),
    new SlashCommandBuilder()
        .setName('create_category')
        .setDescription('Создает новую категорию с каналами и ролями.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Имя категории')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Тег для ролей')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('ice')
        .setDescription('Создает уведомление о льде.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('название системы')
                .setRequired(true))
]
    .map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Начинаю обновление команд приложения.');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log('Команды приложения успешно обновлены.');
    } catch (error) {
        console.error(error);
    }
})();

let activeGames = {};

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    const { commandName, options, channelId } = interaction;

    const commandHandlers = {
        async addignore() {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            const username = options.getString('username');
            const data = await readData();
            if (data.ignoreList.includes(username)) {
                await interaction.reply({ content: "Пользователь уже в игнор-листе.", ephemeral: true });
                return;
            }
            data.ignoreList.push(username);
            await writeData(data);
            await interaction.reply({ content: `${username} добавлен в игнор-лист.`, ephemeral: true });
        },
        async removeignore() {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            const username = options.getString('username');
            const data = await readData();
            const index = data.ignoreList.indexOf(username);
            if (index === -1) {
                await interaction.reply({ content: "Пользователь не найден в игнор-листе.", ephemeral: true });
                return;
            }
            data.ignoreList.splice(index, 1);
            await writeData(data);
            await interaction.reply({ content: `${username} удалён из игнор-листа.`, ephemeral: true });
        },
        async listignore() {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            const data = await readData();
            const message = data.ignoreList.length === 0 ? "Игнор-лист пуст." : `Игнор-лист: ${data.ignoreList.join(', ')}`;
            await interaction.reply({ content: message, ephemeral: true });
        },
        async reactionslist() {
            // Получаем идентификатор канала и сообщения из параметров команды
            const channelId = interaction.options.getString('channelid');
            const messageId = interaction.options.getString('messageid');

            // Идентификатор канала, где вводится команда
            const commandChannelId = interaction.channelId;

            // Проверяем, что команда введена в нужном канале
            if (commandChannelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            await interaction.deferReply({ ephemeral: true });

            try {
                const channel = await client.channels.fetch(channelId);
                const message = await channel.messages.fetch(messageId);
                const userReactions = new Map();

                for (const reaction of message.reactions.cache.values()) {
                    const users = await reaction.users.fetch();
                    for (const user of users.values()) {
                        if (!user.bot) {
                            // Получаем объект участника сервера
                            const member = await interaction.guild.members.fetch(user.id);
                            // Берем никнейм на сервере, если он есть, иначе имя пользователя
                            let username = member.nickname || user.username;
                            // Обрезаем ник до символа '(' если он присутствует
                            const parenIndex = username.indexOf('(');
                            if (parenIndex !== -1) {
                                username = username.substring(0, parenIndex).trim();
                            }

                            if (userReactions.has(username)) {
                                userReactions.set(username, userReactions.get(username) + 1);
                            } else {
                                userReactions.set(username, 1);
                            }
                        }
                    }
                }

                let responseMessage = 'Список реакций на сообщение:\n';
                userReactions.forEach((count, username) => {
                    responseMessage += `${username}: ${count} реакций\n`;
                });

                await interaction.editReply({ content: responseMessage });
            } catch (error) {
                console.error(error);
                await interaction.editReply({ content: 'Произошла ошибка при получении реакции.' });
            }
        },
        async members() {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            const namesSet = await fetchGameNames();
            const namesList = Array.from(namesSet);
            const message = namesList.length === 0 ? "Список имен пуст." : `Список имен: ${namesList.join(', ')}\nОбщее количество: ${namesList.length}`;
            await interaction.reply({ content: message, ephemeral: true });
        },
        async moon() {
            try {
                const data = await readData();
                const ignoreList = data.ignoreList || [];
                const allowedChannels = ['1172972375688626276', '1212507080934686740'];
                const currentChannelId = interaction.channel.id;
                const authorUsername = interaction.user.username;

                if (!allowedChannels.includes(currentChannelId)) {
                    await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
                    return;
                }

                if (ignoreList.includes(authorUsername)) {
                    const phrases = [
                        "Пришло время заработать немного ISK!",
                        "Давайте наберем побольше прибыли!",
                        "Не упустим возможность заработать!",
                        "Пора пополнить наши кошельки!",
                        "Время действовать и зарабатывать!"
                    ];
                    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
                    const baseMessage = "<@&1163380015191302214> Луна взорвана!"; 
                    const channel = client.channels.cache.get('1172972375688626276'); 
                    const en_phrases = [
                        "Time to make some ISK!",
                        "Let's rack up some profits!",
                        "Don't miss the chance to earn!",
                        "Time to fill our wallets!",
                        "Time to act and earn!"
                    ];
                    const en_randomPhrase = en_phrases[Math.floor(Math.random() * en_phrases.length)];
                    const en_baseMessage = "<@&1163380015191302214> The moon has exploded."; 
                    const en_channel = client.channels.cache.get('1212507080934686740'); 

                    if (channel) {
                        await channel.send(`${baseMessage} ${randomPhrase}`);
                        await en_channel.send(`${en_baseMessage} ${en_randomPhrase}`);
                        await interaction.reply({ content: "Сообщение отправлено.", ephemeral: true });
                    } else {
                        await interaction.reply({ content: "Канал не найден.", ephemeral: true });
                    }
                } else {
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinuteUTC = now.getUTCMinutes();
    let nextEvenDay = new Date(now);
    nextEvenDay.setUTCHours(11, 15, 0, 0);

    const isEvenDay = nextEvenDay.getUTCDate() % 2 === 0;

    if (isEvenDay && (currentHourUTC < 11 || (currentHourUTC === 11 && currentMinuteUTC < 15))) {
        // Сегодня четный день, время до 11:15 UTC
        const timeUntilNextEvenDay = nextEvenDay - now;
        const hoursUntilNextEvenDay = Math.floor(timeUntilNextEvenDay / (1000 * 60 * 60));
        const minutesUntilNextEvenDay = Math.floor((timeUntilNextEvenDay % (1000 * 60 * 60)) / (1000 * 60));

        if (currentChannelId === '1172972375688626276') {
            await interaction.channel.send(`${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay} часов и ${minutesUntilNextEvenDay} минут.`);
        } else if (currentChannelId === '1212507080934686740') {
            await interaction.channel.send(`${interaction.user}, the next moon will be in ${hoursUntilNextEvenDay} hours and ${minutesUntilNextEvenDay} minutes.`);
        }
    } else {
        // Сегодня нечетный день или уже прошло 11:15 UTC
        if (nextEvenDay <= now || !isEvenDay) {
            nextEvenDay.setUTCDate(nextEvenDay.getUTCDate() + (nextEvenDay.getUTCDate() % 2 === 0 ? 2 : 1));
        }
        const timeUntilNextEvenDay = nextEvenDay - now;
        const hoursUntilNextEvenDay = Math.floor(timeUntilNextEvenDay / (1000 * 60 * 60));
        const minutesUntilNextEvenDay = Math.floor((timeUntilNextEvenDay % (1000 * 60 * 60)) / (1000 * 60));

        if (currentChannelId === '1172972375688626276') {
            await interaction.channel.send(`${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay} часов и ${minutesUntilNextEvenDay} минут.`);
        } else if (currentChannelId === '1212507080934686740') {
            await interaction.channel.send(`${interaction.user}, the next moon will be in ${hoursUntilNextEvenDay} hours and ${minutesUntilNextEvenDay} minutes.`);
        }
    }
}

            } catch (error) {
                console.error("Error in moon function:", error);
                await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true });
            }
        },
        async winners() {
            const channelId = interaction.channel.id;
        
            if (channelId === LOG_CHANNEL_ID) {
                // Логика для лог-канала
                try {
                    const data = await readData();
                    const winners = data.winners;

                    let reply = '';

                    if (!winners || Object.keys(winners).length === 0) {
                        reply = 'Нет победителей для выплаты.\n';
                    } else {
                        reply = 'Список победителей и их выигрыши:\n';
                        Object.keys(winners).forEach((winner, index) => {
                            reply += `${index + 1}. ${winner} - ${winners[winner]} ISK\n`;
                        });

                        reply += '\nОтветьте с номером победителя, которому была произведена выплата.';
                    }

                    // Добавление текущих значений переменных состояния казино
                    reply += `\n\nТекущее состояние казино:\n`;
                    reply += `Общая сумма ставок: ${totalBets} ISK\n`;
                    reply += `Общая сумма выигрышей: ${accumulatedWins} ISK\n`;
                    reply += `Бонусный пул: ${bonusPool} ISK\n`;

                    const winnerMessage = await interaction.reply({ content: reply, ephemeral: true });

                    // Если есть победители, ожидание номера для подтверждения выплаты
                    if (winners && Object.keys(winners).length > 0) {
                        const filter = response => {
                            const number = parseInt(response.content);
                            return !isNaN(number) && number > 0 && number <= Object.keys(winners).length && response.author.id === interaction.user.id;
                        };

                        const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

                        collector.on('collect', async response => {
                            const number = parseInt(response.content);
                            const winnerName = Object.keys(winners)[number - 1];
                            
                            delete winners[winnerName];

                            await writeData(data);
                            await interaction.channel.send(`Выплата для ${winnerName} была подтверждена и удалена из списка.`);
                        });

                        collector.on('end', collected => {
                            if (collected.size === 0) {
                                interaction.channel.send('Время ожидания истекло. Попробуйте снова.');
                            }
                        });
                    }

                } catch (error) {
                    console.error('Ошибка при чтении данных:', error);
                    await interaction.reply({ content: 'Произошла ошибка при чтении данных. Пожалуйста, попробуйте снова позже.', ephemeral: true });
                }

            } else if (channelId === CASINO_CHANNEL_ID) {
                // Логика для канала казино
                try {
                    const data = await readData();
                    const winners = data.winners || {};

                    const userWins = winners[interaction.user.username];

                    if (!userWins) {
                        await interaction.reply({ content: 'У вас нет выигрышей на данный момент.', ephemeral: true });
                        return;
                    }

                    let reply = `Ваш текущий выигрыш: ${userWins} ISK`;

                    await interaction.reply({ content: reply, ephemeral: true });
                } catch (error) {
                    console.error('Ошибка при чтении данных:', error);
                    await interaction.reply({ content: 'Произошла ошибка при чтении данных. Пожалуйста, попробуйте снова позже.', ephemeral: true });
                }
            } else {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале или канале казино.", ephemeral: true });
            }
        },
        async startcasino() {
            await startCasinoGame(interaction);
        },
        async show_sessions() {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "This command can only be used in the log channel.", ephemeral: true });
                return;
            }

            let data = await readData();
            let activeGames = data.activeGames || {};

            if (!Object.keys(activeGames).length) {
                await interaction.reply('No active sessions.');
                return;
            }

            let sessionMessage = '';
            Object.values(activeGames).forEach((gameInfo, idx) => {
                let nickname = gameInfo.nickname;
                let uniqueCode = gameInfo.uniqueCode;
                sessionMessage += `${idx + 1}. **${nickname}** - Code: \`${uniqueCode}\`\n`;
            });

            let sessionMsg = await interaction.reply({ content: sessionMessage, fetchReply: true });

            // Add reactions for each session
            for (let i = 0; i < Object.keys(activeGames).length; i++) {
                await sessionMsg.react(`${i + 1}\u20E3`);
            }

            const filter = (reaction, user) => user.id !== client.user.id && reaction.message.id === sessionMsg.id;

            const collector = sessionMsg.createReactionCollector({ filter, max: 1 });

            collector.on('collect', async (reaction, user) => {
                let sessionIdx = parseInt(reaction.emoji.name) - 1;
                let userIds = Object.keys(activeGames);
                delete activeGames[userIds[sessionIdx]];
                await writeData(data);

                await sessionMsg.delete();
                const confirmationMessage = await interaction.channel.send(`Session ${sessionIdx + 1} has been deleted.`);
                setTimeout(() => confirmationMessage.delete(), 5000);
            });
        },
        async hf() {
            try {
                const data = await readData();
const participants = data.participants || {};
const maxParticipants = 5;

const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID);
const roleChannel = await client.channels.fetch('1163428374493003826');
const role = await interaction.guild.roles.fetch('1163379884039618641');

if (!mainChannel || !role || !roleChannel) {
    await interaction.reply({ content: 'Канал или роль не найдены.', ephemeral: true });
    return;
}

// Извлекаем имена и количество окон
const participantEntries = Object.entries(participants);

// Получаем список участников с их упоминаниями
const participantNames = await Promise.all(
    participantEntries.map(async ([id, count]) => {
        const member = await interaction.guild.members.fetch(id);
        return `${member.toString()}: ${count}`;
    })
);

const replyMessage = `${role}, приглашаем вас принять участие в канале ${roleChannel}! На данный момент зарегистрированы следующие участники: ${participantNames.join(', ')}. Не упустите шанс, присоединяйтесь к нам!`;
await mainChannel.send(replyMessage);
await interaction.reply({ content: 'Сообщение отправлено.', ephemeral: true });

            } catch (error) {
                console.error("Error in hf function:", error);
                await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true });
            }
        },
            async create_category() {
        try {
            if (channelId !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                return;
            }
            const guild = client.guilds.cache.get(GUILD_ID);
            const name = interaction.options.getString('name');
            const tag = interaction.options.getString('tag');
            const response = await create_category(guild, name, tag);
            await interaction.reply(response);
        } catch (error) {
            console.error(error);
            await interaction.reply('Произошла ошибка при обработке команды.');
        }
        },
        async ice() {
    try {
        
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        const currentChannelId = interaction.channel.id;
        const name = interaction.options.getString('name');
        logAndSend(allowedChannels, currentChannelId, name);
        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        const phrases = [
            "Давайте наберем побольше льда!",
            "Не упустим возможность пополнить запасы!",
            "Пора пополнить наши склады льдом!",
            "Время действовать и собирать лед!"
        ];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        const baseMessage = `<@&1163379553348096070> Орка выставлена и флот открыт в системе ${name}!`; 
        const channel = client.channels.cache.get(MAIN_CHANNEL_ID); 
        const en_phrases = [
            "Let's gather as much ice as we can!",
            "Don't miss the chance to stock up!",
            "Time to fill our warehouses with ice!",
            "Time to act and collect ice!"
        ];
        const en_randomPhrase = en_phrases[Math.floor(Math.random() * en_phrases.length)];
        const en_baseMessage = `<@&1163379553348096070> The Orca is deployed and the fleet is open in the ${name} system!`; 
        const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID); 

        if (channel && en_channel) {
            await channel.send(`${baseMessage} ${randomPhrase}`);
            await en_channel.send(`${en_baseMessage} ${en_randomPhrase}`);
            await interaction.reply({ content: "Сообщение отправлено.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}
    };

    if (interaction.isCommand()) {
        if (commandHandlers[commandName]) {
            await commandHandlers[commandName]();
        }
    }

    if (interaction.isButton()) {
        await confirmTransaction(interaction);
    }
});


client.on('guildMemberAdd', async member => {
    try {
        const channel = member.guild.channels.cache.get(W_CHANNEL_ID);
        if (!channel) {
            logAndSend(`Channel with ID ${W_CHANNEL_ID} not found in guild ${member.guild.id}`);
            return;
        }

        logAndSend(`New member joined: ${member.user.tag} (ID: ${member.id}) in guild ${member.guild.id}`);
        if (!/^[\w\s]+ \([\w]+\)$/.test(member.displayName)) {
            logAndSend(`Member ${member.user.tag} (ID: ${member.id}) does not match the required nickname format.`);
            channel.send(`${member.toString()}, добро пожаловать!\n\nНа нашем сервере мы используем формат никнейма "Ник в игре (Реальное имя)".\n\nПожалуйста, напиши сообщение или ответь боту с твоим ником и именем, например: Captain Price, Серега.`);
            waitList.set(member.id, { guildId: member.guild.id, lastPingTime: Date.now() });
        } else {
            logAndSend(`Member ${member.user.tag} (ID: ${member.id}) matches the required nickname format.`);
        }
    } catch (error) {
        console.error("Error in guildMemberAdd event handler:", error);
    }
});

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 минут в миллисекундах

setInterval(async () => {
    const now = Date.now();
    for (const [memberId, { guildId, lastPingTime }] of waitList.entries()) {
        if (now - lastPingTime >= CHECK_INTERVAL) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const member = guild.members.cache.get(memberId);
            if (!member) continue;

            const channel = guild.channels.cache.get(W_CHANNEL_ID);
            if (!channel) continue;

            channel.send(`${member.toString()}, напоминаем, что на нашем сервере мы используем формат никнейма "Ник в игре (Реальное имя)".\n\nПожалуйста, напиши сообщение или ответь боту с твоим ником и именем, например: Kratos, Олег.`);
            waitList.set(memberId, { guildId, lastPingTime: now });
        }
    }
}, CHECK_INTERVAL);


client.on('messageCreate', async message => {
    try {
        if (message.author.bot || message.channel.id !== W_CHANNEL_ID || !message.content.trim() || !waitList.has(message.author.id)) return;

        if (waitList.get(message.author.id) === message.guild.id) {
            let content = message.content;

            // Удаляем упоминания из содержимого сообщения
            content = content.replace(/<@!?\d+>/g, '').trim();

            if (content.includes(',')) {
                const parts = content.split(',', 2);
                if (parts.length === 2) {
                    const newNick = `${parts[0].trim()} (${parts[1].trim()})`;
                    try {
                        await message.member.setNickname(newNick);
                        const responseMessage = await message.channel.send(`Спасибо! Твой никнейм был изменен на ${newNick}. Ты по поводу какой корпорации? Нажми реакцию 1 для Cosmic Capybara Crew или реакцию 2 для других.`);
                        await responseMessage.react('1️⃣');
                        await responseMessage.react('2️⃣');

                        waitList.delete(message.author.id);

                        // Запоминаем ID сообщения для обработки реакций
                        messageMap.set(responseMessage.id, message.author.id);
                    } catch (error) {
                        message.channel.send("У меня недостаточно прав для изменения никнеймов.");
                        console.error("Permission denied to change nickname:", error);
                    }
                } else {
                    message.channel.send(`${message.author.toString()}, твой ответ должен содержать ник и имя, разделенные запятой.`);
                }
            } else {
                message.channel.send(`${message.author.toString()}, твой ответ должен содержать ник и имя, разделенные запятой.`);
            }
        }
    } catch (error) {
        console.error("Error in messageCreate event handler:", error);
    }
});


client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot || reaction.message.channel.id !== W_CHANNEL_ID) return;

        const originalUserId = messageMap.get(reaction.message.id);
        if (!originalUserId || user.id !== originalUserId) return; // Убедимся, что реакцию ставит нужный пользователь

        if (reaction.emoji.name === '1️⃣') {
            logAndSend(`Пользователь <@${user.id}> выбрал корпорацию Cosmic Capybara Crew.`);
            try {
                const role = reaction.message.guild.roles.cache.find(role => role.id === '1239714360503308348');
                const member = reaction.message.guild.members.cache.get(user.id);
                await member.roles.add(role);
                logAndSend(`Роль <@&${role.id}> была успешно добавлена пользователю <@${user.id}>.`);

                const welcomeChannel = reaction.message.guild.channels.cache.get(REPORT_CHANNEL_ID);
                if (welcomeChannel) {
                    await welcomeChannel.send(`Добро пожаловать на сервер, ${user.toString()}! Мы рады видеть тебя в рядах Пилотов CCCrew! Ты можешь выбрать интересующие тебя активности в канале <#1163428374493003826>. Пожалуйста, ознакомься с нашими правилами и поставь реакцию в канале <#1239710611890376744>.`);
                } else {
                    logAndSend('Канал для приветствия не найден.');
                }
            } catch (error) {
                console.error('Ошибка при добавлении роли:', error);
            }
        } else if (reaction.emoji.name === '2️⃣') {
            const targetUser = reaction.message.guild.members.cache.get('739618523076362310'); // Подставьте реальный ID
            reaction.message.channel.send(`${user.toString()}, ты выбрал другие корпорации. ${targetUser.toString()}, пожалуйста, помоги!`);
        }
    } catch (error) {
        console.error("Error in messageReactionAdd event handler:", error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();
        if (user.bot) return;
        if (!reaction.message.guild) return; 

        const roleName = rolesMap[reaction.emoji.name];
        if (!roleName) return console.log("Реакция не связана с ролью");

        const role = reaction.message.guild.roles.cache.find(role => role.id === roleName);
        if (!role) return console.log("Роль не найдена");

        const member = reaction.message.guild.members.cache.get(user.id);
        if (!member) return;
        
        member.roles.add(role).catch(console.error);
    } catch (error) {
        console.error("Error in messageReactionAdd event handler:", error);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();
        if (user.bot) return;
        if (!reaction.message.guild) return; 

        const roleName = rolesMap[reaction.emoji.name];
        if (!roleName) return console.log("Реакция не связана с ролью");

        const role = reaction.message.guild.roles.cache.find(role => role.id === roleName);
        if (!role) return console.log("Роль не найдена");

        const member = reaction.message.guild.members.cache.get(user.id);
        if (!member) return;
        
        member.roles.remove(role).catch(console.error);
    } catch (error) {
        console.error("Error in messageReactionRemove event handler:", error);
    }
});

async function scheduleDailyActivity(client) {
    try {
        logAndSend(`Пытаюсь получить гильдию с ID: ${GUILD_ID}`);

        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return logAndSend("Гильдия не найдена");

        const channel = guild.channels.cache.get('1163428374493003826');
        if (!channel) return logAndSend("Канал не найден");

        const mainChannel = guild.channels.cache.get(MAIN_CHANNEL_ID);
        if (!mainChannel) {
            logAndSend("Основной канал не найден");
            return;
        }

        let activityData = await readFromJSON(DATA_FILE);
        if (!activityData.eventId) {
            activityData.eventId = [];
        }
        if (!activityData.participants) {
            activityData.participants = {};
        }

        let message;
        let totalAccounts = 0;
        let collector;

        if (activityData.eventId.length > 0) {
            try {
                message = await channel.messages.fetch(activityData.eventId[0]);
                logAndSend("Возобновление существующего сообщения для сбора участников.");
            } catch (error) {
                console.error('Ошибка при получении существующего сообщения:', error);
            }
        }

        if (!message) {
            message = await channel.send({
                content: '<@&1163379884039618641> <@&1230610682018529280>, хотите поучаствовать сегодня в тыловых? Нажмите на кнопку ниже!',
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('participate')
                            .setLabel('Участвовать')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('participate_multi')
                            .setLabel('Добавить окно')
                            .setStyle(ButtonStyle.Secondary)
                    )
                ]
            });
            activityData.eventId = [message.id];
            await writeToJSON(DATA_FILE, activityData);
            logAndSend(`Сохранено новое сообщение с ID: ${message.id}`);
        }

        let inactivityTimeout;
        let isCountingDown = false;

        async function startCountdown() {
            if (isCountingDown) return;
            isCountingDown = true;

            inactivityTimeout = setTimeout(async () => {
                logAndSend("Время ожидания истекло, сбрасываем список участников.");
                activityData.participants = {};
                await writeToJSON(DATA_FILE, activityData);
                isCountingDown = false;
            }, 4 * 60 * 60 * 1000); // 4 часа
        }

        function resetCountdown() {
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
                inactivityTimeout = null;
                isCountingDown = false;
            }
        }

        collector = message.createMessageComponentCollector({ componentType: 2 }); // 2 is Button

        collector.on('collect', async (interaction) => {
            logAndSend(`Кнопка ${interaction.customId} была нажата пользователем ${interaction.user.username}.`);

            if (!isCountingDown) {
                startCountdown();
            }

            if (interaction.customId === 'participate') {
                await interaction.deferUpdate();
                if (!activityData.participants[interaction.user.id]) {
                    activityData.participants[interaction.user.id] = 1; // Регистрируем основное участие
                    totalAccounts += 1;
                    await writeToJSON(DATA_FILE, activityData);
                    await interaction.followUp({ content: 'Вы успешно записаны на участие одним окном!', ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Вы уже записаны!', ephemeral: true });
                }
            } else if (interaction.customId === 'participate_multi') {
                await interaction.deferUpdate();
                if (activityData.participants[interaction.user.id]) {
                    activityData.participants[interaction.user.id] += 1; // Добавляем дополнительное окно
                    totalAccounts += 1;
                    await writeToJSON(DATA_FILE, activityData);
                    await interaction.followUp({ content: 'Дополнительное окно добавлено!', ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Сначала зарегистрируйте основное участие!', ephemeral: true });
                }
            }

            if (totalAccounts >= 5) {
                let participantsDetail = Object.entries(activityData.participants)
                    .map(([id, count]) => `<@${id}> (${count} окон)`)
                    .join(', ');

                await mainChannel.send(`<@&1163379884039618641> Флот полностью сформирован с участием следующих пилотов: ${participantsDetail}. Приглашаем новых участников к следующему сбору!`);
                scheduleEvent();
                activityData.participants = {};
                await writeToJSON(DATA_FILE, activityData);
                resetCountdown();
            }
        });

        async function scheduleEvent() {
            const now = new Date();
            const startTime = new Date(now.getTime() + 30 * 60000);
            const endTime = new Date(startTime.getTime() + 60 * 60000);

            try {
                const event = await guild.scheduledEvents.create({
                    name: 'Homefronts',
                    description: 'Time to make some ISK!',
                    scheduledStartTime: startTime,
                    scheduledEndTime: endTime,
                    privacyLevel: 2,
                    entityType: 3,
                    entityMetadata: {
                        location: 'Dodixie'
                    }
                });
                Object.keys(activityData.participants).forEach(async (userId) => {
                    const user = await client.users.fetch(userId);
                    if (user && !user.bot) {
                        user.send(`Группа собрана! Старт через 30 минут. Вот ссылка: ${event.url}`);
                    }
                });
                logAndSend(`Событие "${event.name}" успешно создано и начнется в ${startTime.toISOString()}.`);
            } catch (error) {
                console.error('Ошибка при создании события:', error);
            }
        }
    } catch (error) {
        console.error("Ошибка в scheduleDailyActivity:", error);
    }
}



function logAndSend(message) {
    try {
        const now = new Date(); // Получение текущей даты и времени
        const timestamp = now.toISOString();
        console.log(`[${timestamp}] ${message}`); // Логирование в консоль

        // Проверяем, что клиент уже готов и имеем доступ к каналам
        if (client.isReady()) {
            const channel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (channel) {
                // Проверяем, что message является строкой
                if (typeof message === 'string' && !message.includes(`[${client.user.tag}]`)) {
                    channel.send(`[${timestamp}] ${message}`).catch(console.error);
                }
            } else {
                console.error('Channel not found!');
            }
        }
    } catch (error) {
        console.error("Error in logAndSend:", error);
    }
}


function generateMessageText() {
    try {
        const introText = `В этом сообщении вы можете выбрать себе роль, тыкнув на соответствующую реакцию. Роли нужны для того, чтобы дискорд мог сообщать вам отдельным уведомлением (звуком или красным квадратиком на приложении), если эту роль "пинганули". Например, если вы выбрали себе роль Лед, кто угодно, увидев спавн льда в игре, может написать в дискорде "<@&1163379553348096070> в Манатириде" и все участники с этой ролью получат оповещение, как если бы им написали в личку. Пинговать можно, поставив перед названием роли собачку @
        
        Пожалуйте, не пингуйте людей по всякой ерунде. Хороший пример пинга - заспавнился лед/газ/гравик/луна взорвана. Плохой пример пинга - "<@&1163380015191302214> ребята, а какими лопатами копать луну?", "<@&1163379553348096070> а сколько дохода с льда?"\n\n`;
        const rolesText = Object.entries(rolesMap)
            .map(([emoji, roleId]) => `${emoji} <@&${roleId}>`)
            .join('\n');
        
        return introText + rolesText;
    } catch (error) {
        console.error("Error in generateMessageText:", error);
    }
}

const rolesMap = {
    '🌕': '1163380015191302214', 
    '💸': '1163379884039618641', 
    '💎': '1163380100520214591', 
    '☁️': '1163404742609879091', 
    '🧊': '1163379553348096070',
    '🔫': '1239331341229752432',      
    '👾': '1239331818063528058',       
    '🌀': '1239331564286902285'        
};

async function createRoleMessage() {
    try {
        const channel = client.channels.cache.get('1163428374493003826');
        if (!channel) {
            console.log("Канал не найден");
            return;
        }

        const expectedText = generateMessageText();

        try {
            const messageId = await readMessageId();
            let messageExists = false;

            if (messageId) {
                try {
                    const message = await channel.messages.fetch(messageId);
                    messageExists = true;

                    if (message.content !== expectedText || !allReactionsPresent(message)) {
                        logAndSend("Сообщение отличается, обновляем...");
                        await message.edit(expectedText);
                        await updateReactions(message);
                        logAndSend("Сообщение обновлено");
                    } else {
                        logAndSend("Сообщение уже существует и оно корректно");
                    }
                    return;
                } catch {
                    logAndSend("Сообщение не найдено, создаем новое");
                }
            }

            if (!messageExists) {
                const message = await channel.send(expectedText);
                await addReactions(message);
                await saveMessageId(message.id);
                logAndSend("Новое сообщение создано и реакции добавлены");
            }
        } catch (error) {
            console.error("Произошла ошибка при создании сообщения:", error);
        }
    } catch (error) {
        console.error("Error in createRoleMessage:", error);
    }
}

function allReactionsPresent(message) {
    try {
        const expectedReactions = new Set(Object.keys(rolesMap));
        const messageReactions = new Set(message.reactions.cache.keys());
        return [...expectedReactions].every(r => messageReactions.has(r));
    } catch (error) {
        console.error("Error in allReactionsPresent:", error);
    }
}

async function updateReactions(message) {
    try {
        const currentReactions = new Set(message.reactions.cache.keys());

        // Добавляем реакции, которые должны быть, но их нет
        for (const emoji of Object.keys(rolesMap)) {
            if (!currentReactions.has(emoji)) {
                try {
                    await message.react(emoji);
                } catch (error) {
                    console.error(`Could not react with ${emoji}:`, error);
                }            
                console.log(`Added missing reaction: ${emoji}`);
            }
        }

        // Удаляем реакции, которые больше не нужны
        for (const reaction of message.reactions.cache.values()) {
            if (!rolesMap.hasOwnProperty(reaction.emoji.name)) {
                await reaction.remove();
                console.log(`Removed outdated reaction: ${reaction.emoji.name}`);
            }
        }
    } catch (error) {
        console.error("Error in updateReactions:", error);
    }
}

async function addReactions(message) {
    try {
        for (const emoji of Object.keys(rolesMap)) {
            await message.react(emoji);
        }
    } catch (error) {
        console.error("Error in addReactions:", error);
    }
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    const role = rolesMap[reaction.emoji.name];
    if (!role) return;

    const messageId = await readMessageId();
    if (!messageId) return;

    if (reaction.message.id === messageId && reaction.message.channel.id === '1163428374493003826') {
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.add(role);
        logAndSend(`Added role <@&${role}> to user <@${user.id}>`);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    const role = rolesMap[reaction.emoji.name];
    if (!role) return;

    const messageId = await readMessageId();
    if (!messageId) return;

    if (reaction.message.id === messageId && reaction.message.channel.id === '1163428374493003826') {
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.remove(role);
        logAndSend(`Removed role <@&${role}> to user <@${user.id}>`);
    }
});

async function checkDiscordMembersAgainstGameList() {
    try {
        const data = await readFromJSON(DATA_FILE);
        const nonComplianceCounter = data.nonComplianceCounter || {};
        console.log(nonComplianceCounter);
        const ignoreList = data.ignoreList || [];

        logAndSend(`Current Ignore List: ${ignoreList.join(', ')}`);

        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            if (!guild) {
                console.error('Guild not found.');
                return;
            }

            const members = await guild.members.fetch();
            const gameNames = await fetchGameNames();

            let reportMessage = 'Пожалуйста, проверьте этих пользователей на соответствие их игровому имени или наличию в корпорации:';

            const roleIds = ["1239714360503308348", "1230610682018529280"]; // Замените SECOND_ROLE_ID на ID второй роли

            roleIds.forEach(roleId => {
                members.forEach(member => {
                    const name = member.displayName.split(' (')[0].trim().toLowerCase();

                    if (ignoreList.includes(name)) {
                        console.log(`Игнорируется: ${name}`);
                        return;
                    }

                    if (!member.roles.cache.has(roleId)) {
                        return;
                    }

                    if (!gameNames.has(name)) {
                        nonComplianceCounter[name] = (nonComplianceCounter[name] || 0) + 1;
                        console.log(`Несоответствие у ${name}, счетчик: ${nonComplianceCounter[name]}`);
                    } else {
                        delete nonComplianceCounter[name];
                    }
                });
            });

            console.log("Текущий nonComplianceCounter:", nonComplianceCounter);

            Object.entries(nonComplianceCounter).forEach(([name, count]) => {
                if (count > 3) {
                    const member = members.find(m => m.displayName.split(' (')[0].trim().toLowerCase() === name);
                    if (member) {
                        reportMessage += `\n- ${member.toString()}`;
                    }
                }
            });

            await writeData({ nonComplianceCounter });

            const reportChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
            if (!reportChannel) {
                console.error(`Report channel with ID ${LOG_CHANNEL_ID} not found.`);
                return;
            }

            if (reportMessage.length > 140) {
                await reportChannel.send(reportMessage);
            } else {
                await reportChannel.send('Все пользователи соответствуют условиям или не достигли предела нарушений.');
            }
        } catch (error) {
            console.error('Error during member check:', error);
        }
    } catch (error) {
        console.error("Error in checkDiscordMembersAgainstGameList:", error);
    }
}


async function getAccessTokenUsingRefreshToken() {
    // Проверяем, есть ли действующий токен в кэше
    if (tokenCache.accessToken && tokenCache.expiresAt > Date.now()) {
        return tokenCache.accessToken;
    }

    try {
        const complianceData = JSON.parse(await fs.readFile('complianceData.json', 'utf8'));
        const authorizationBase64 = complianceData.Authorization[0];
        const refreshToken = complianceData.refreshToken[0];

        const response = await axios.post('https://login.eveonline.com/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authorizationBase64}`
            }
        });

        if (response.data.refresh_token) {
            complianceData.refreshToken[0] = response.data.refresh_token;
            await fs.writeFile('complianceData.json', JSON.stringify(complianceData, null, 2));
        }

        // Обновляем кэш с новым токеном и временем истечения
        tokenCache.accessToken = response.data.access_token;
        tokenCache.expiresAt = Date.now() + 1200 * 1000; // 1200 секунд = 20 минут

        return tokenCache.accessToken;
    } catch (error) {
        console.error('Error refreshing access token:', error);
        return null;
    }
}

async function getCorporationMembers(accessToken) {
    try {
        const access_token = accessToken;
        const response = await axios.get('https://esi.evetech.net/latest/corporations/98769585/members/?datasource=tranquility', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching corporation members:', error);
        return [];
    }
}

async function getCharacterNames(characterIds) {
    try {
        const promises = characterIds.map(async (characterId) => {
            const response = await axios.get(`https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`);
            return response.data.name;
        });
        const characterNames = await Promise.all(promises);
        return characterNames;
    } catch (error) {
        console.error('Error fetching character names:', error);
        return [];
    }
}

async function fetchGameNames() {
    try {
        const accessToken = await getAccessTokenUsingRefreshToken();
        if (!accessToken) {
            console.error("Failed to obtain access token.");
            return new Set();
        }

        const corporationMembers = await getCorporationMembers(accessToken);
        if (!corporationMembers.length) {
            console.error("No members found or failed to fetch members.");
            return new Set();
        }

        const characterNames = await getCharacterNames(corporationMembers);
        if (!characterNames.length) {
            console.error("No character names found or failed to fetch names.");
            return new Set();
        }

        return new Set(characterNames.map(name => name.toLowerCase()));
    } catch (error) {
        console.error('Failed to fetch game names:', error);
        return new Set();
    }
}

const DATA_FILE = path.join(__dirname, 'complianceData.json'); 

async function readFromJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading from JSON file:', error);
        return null;
    }
}

async function writeToJSON(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log("Data successfully written to JSON file");
    } catch (error) {
        console.error('Error writing to JSON file:', error);
    }
}

async function readMessageId() {
    try {
        const jsonData = await readFromJSON(DATA_FILE);
        return jsonData && jsonData.messageId && jsonData.messageId.length > 0 ? jsonData.messageId[0] : null;
    } catch (error) {
        console.error("Error in readMessageId:", error);
    }
}

async function saveMessageId(messageId) {
    try {
        const jsonData = await readFromJSON(DATA_FILE) || {};
        jsonData.messageId = [messageId];
        await writeToJSON(DATA_FILE, jsonData);
    } catch (error) {
        console.error("Error in saveMessageId:", error);
    }
}

async function readData() {
    try {
        return await readFromJSON(DATA_FILE) || { nonComplianceCounter: {}, ignoreList: [] };
    } catch (error) {
        console.error("Error in readData:", error);
    }
}

async function writeData(newData) {
    try {
        const dataFilePath = DATA_FILE;  // Указываете путь к вашему JSON файлу
        const existingData = await readFromJSON(dataFilePath) || {};  // Чтение текущих данных или инициализация пустым объектом, если данных нет
        const updatedData = { ...existingData, ...newData };  // Объединение существующих данных с новыми данными
        await writeToJSON(dataFilePath, updatedData);  // Запись обновлённых данных обратно в файл
        console.log("Data successfully updated in JSON file");
    } catch (error) {
        console.error('Error updating data in JSON file:', error);
    }
}

async function cleanupOldMessages(before = null) {
    const CHANNEL_IDS = [LOG_CHANNEL_ID, CASINO_CHANNEL_ID]; // Replace with your channel IDs

    try {
        logAndSend('Начало чистки...');

        for (const channelId of CHANNEL_IDS) {
            const channel = client.channels.cache.get(channelId);

            if (!channel) {
                console.error(`Канал с ID ${channelId} не найден`);
                continue;
            }

            try {
                const options = { limit: 100 };
                if (before) {
                    options.before = before;
                }
                const messages = await channel.messages.fetch(options);

                if (messages.size === 0) {
                    console.log(`Нет сообщений для удаления в канале ${channelId}`);
                    continue;
                }

                const now = Date.now();
                const twelveHours = 1000 * 60 * 60 * 12; // 12 часов в миллисекундах

                const deletionPromises = [];

                for (const message of messages.values()) {
                    const age = now - message.createdTimestamp;

                    if (age > twelveHours) {
                        deletionPromises.push(
                            message.delete()
                                .then(() => console.log(`Удалено сообщение: ${message.id} из канала ${channelId}`))
                                .catch(error => console.log(`Не удалось удалить сообщение ${message.id} из канала ${channelId}: ${error}`))
                        );
                    }
                }

                await Promise.all(deletionPromises);

                if (messages.size === 100) {
                    const lastMessage = messages.last();
                    await cleanupOldMessages(lastMessage.id); // Recursive call for the same channel
                } else {
                    logAndSend(`Старые сообщения удалены из канала ${channelId}`);
                }
            } catch (error) {
                console.error(`Произошла ошибка при удалении старых сообщений из канала ${channelId}:`, error);
            }
        }
    } catch (error) {
        console.error("Error in cleanupOldMessages:", error);
    }
}



const responses = [
    "Слышь, ты это, заходи, если что.",
    "Эй, мужик, есть что пожрать?",
    "Ну что, сталкер, что нового?",
    "Здорово, братан!",
    "Как жизнь, сталкер?",
    "Не шуми, сталкер.",
    "Будь осторожен, брат.",
    "Эй, сталкер, неси артефакты.",
    "Заходи, сталкер, будь как дома.",
    "Эй, держись поближе, тут опасно.",
    "Слушай сюда, сталкер.",
    "Братан, есть работа для тебя.",
    "Эй, ты кто такой?",
    "Сидорович ждет тебя.",
    "Эй, сталкер, помоги!",
    "Братан, помоги отбиться!",
    "Ты это, сталкер, аккуратнее там.",
    "Удачи тебе в Зоне, сталкер.",
    "Не забывай, здесь Зона, сталкер.",
    "Найди Сидоровича, он тебе поможет.",
    "Ты еще жив? Вот это да!",
    "Сталкер, будь начеку."
];


const specialResponse = "бобр курва";
const specialTriggerWord = "боброе утро";

const triggerWords = [
    "доброе утро",
    "добрый день",
    "добрый вечер",
    "доброго утра",
    "доброго дня",
    "доброго вечера",
    "привет",
    "здравствуйте",
    "здорово",
    "хай",
    "приветствую",
    "приветик",
    "здравствуй",
    "добрейшего утра",
    "добрейший день",
    "добрейший вечер",
    "утро доброе",
    "день добрый",
    "вечер добрый",
    "утра доброго",
    "дня доброго",
    "вечера доброго",
    "добро пожаловать",
    "рад видеть",
    "рад приветствовать"
];


const specialPersonTrigger = "739618523076362310"; // Замените на ID нужного пользователя
const specialPersonResponse = "Здравствуй, мой генерал! Сегодня мы на темной стороне.";

async function generateStalkerResponse(userMessage) {
    const payload = {
        model: 'gpt-3.5-turbo-0125',
        messages: [
            { role: 'system', content: 'Ты - полезный помощник в корпорации космических путешествий. Отвечай так, как будто ты сталкер из игры S.T.A.L.K.E.R. Общайся в грубом и непринужденном стиле, с характерными фразами из игры. Ответ на русском языке.' },
            { role: 'user', content: userMessage }
        ]
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${chatApi}`
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Ошибка при обращении к OpenAI API:', error.response ? error.response.data : error.message);
        return 'НАЩАЛЬНИКА АЩИБКА';
    }
}

client.on('messageCreate', async (message) => {
    // Проверяем, чтобы сообщение не было от бота и было в нужном канале
    if (message.author.bot || message.channel.id !== MAIN_CHANNEL_ID) return;

    const messageContent = message.content.toLowerCase();

    if (messageContent.includes(specialTriggerWord)) {
        await message.reply(specialResponse);
    } else if (message.author.id === specialPersonTrigger && triggerWords.some(word => messageContent.includes(word))) {
        await message.reply(specialPersonResponse);
    } else if (triggerWords.some(word => messageContent.includes(word))) {
        const stalkerResponse = await generateStalkerResponse(message.content);
        await message.reply(stalkerResponse);
    }
});

async function startCasinoGame(interaction) {
    if (!interaction.isCommand() && !interaction.isButton()) {
        return interaction.reply({ content: 'Ошибка: Неправильный тип взаимодействия.', ephemeral: true });
    }

    if (!interaction.channel) {
        return interaction.reply({ content: 'Ошибка: Канал не найден.', ephemeral: true });
    }

    if (interaction.channel.id !== CASINO_CHANNEL_ID) {
        return interaction.reply({ content: 'This command is only available in a specific channel.', ephemeral: true });
    }
    
    if (activeGames[interaction.user.id]) {
        return interaction.reply({ content: 'You have already started a game. Please finish your current game before starting a new one.', ephemeral: true });
    }

    const uniqueCode = generateUniqueCode();
    const initialBalance = await checkBalance();
    const startTime = new Date();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${interaction.user.id}`)
                .setLabel('Confirm ISK Transfer')
                .setStyle(ButtonStyle.Primary),
        );

        // Console log the nickname

        const message = await interaction.reply({ content: `Please confirm the transfer of any amount of ISK to the Cosmic Capybara Crew corporation.`, components: [row], fetchReply: true });
    activeGames[interaction.user.id] = {
        channel: interaction.channel,
        user: interaction.user,
        startTime: startTime.toISOString(),
        initialBalance: initialBalance,
        uniqueCode: uniqueCode,
        messageId: message.id,
        nickname: interaction.member.nickname || interaction.user.username,
        timeout: setTimeout(async () => {
            if (activeGames[interaction.user.id]) {
                await interaction.followUp({ content: 'Game cancelled due to lack of confirmation.', ephemeral: true });
                delete activeGames[interaction.user.id];
                await saveActiveGames();
            }
        }, 300000) // 5 minutes timeout
    };    

    await saveActiveGames();

    await interaction.followUp({ content: `Your unique code for the transfer: ${uniqueCode}`, ephemeral: true });
}

async function confirmTransaction(interaction) {
    const [action, userId] = interaction.customId.split('_');
    if (action !== 'confirm') return;

    const userGame = activeGames[userId];
    if (!userGame || userGame.channel.id !== interaction.channel.id || interaction.message.id !== userGame.messageId) {
        return interaction.reply({ content: 'This button is not for you or not in the correct channel.', ephemeral: true });
    }

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: 'This button is not for you.', ephemeral: true });
    }

    if (interaction.customId === `confirm_${userId}`) {
        clearTimeout(userGame.timeout);
        await interaction.update({ content: 'Thank you! Your transaction is being processed. Please wait up to one hour for confirmation.', components: [] });
        await saveActiveGames();
    }
}


async function fetchTransactions() {
    const token = await getAccessTokenUsingRefreshToken();
    const response = await fetch("https://esi.evetech.net/latest/corporations/98769585/wallets/1/journal/?datasource=tranquility&page=1", {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
        }
    });
    const data = await response.json();

    if (Array.isArray(data)) {
        const now = new Date();
        const eveTimeNow = new Date(now.toISOString().slice(0, 19) + 'Z'); // Преобразуем текущее время в UTC (EVE time)
        const twoHoursAgo = new Date(eveTimeNow.getTime() - 2 * 60 * 60 * 1000); // 2 часа назад по EVE time

        transactionsCache = data.filter(tx => {
            const txDate = new Date(tx.date);
            return tx.ref_type === "player_donation" && txDate >= twoHoursAgo;
        });

    } else {
        console.error('Ошибка: Ожидался массив транзакций');
        transactionsCache = [];
    }
}


async function checkTransactions() {
    if (isProcessing) return;

    isProcessing = true;

    let currentBalance = await checkBalance();

    for (const userId in activeGames) {
        const game = activeGames[userId];
        const normalizedUniqueCode = game.uniqueCode.replace(/\s+/g, ''); // Remove spaces from uniqueCode

        const transaction = transactionsCache.find(tx => tx.reason.replace(/\s+/g, '') === normalizedUniqueCode && tx.amount >= 1);

        if (transaction) {
            const stake = transaction.amount;
            const winAmount = calculateWinAmount(stake);

            try {
                // Fetch the full channel object
                const channel = await client.channels.fetch(game.channel.id);

                if (winAmount <= currentBalance) {
                    await processWin(channel, game.user, winAmount);
                    currentBalance -= winAmount;
                } else {
                    await channel.send(`<@${game.user.id}> did not win. Better luck next time!`);
                }

                delete activeGames[userId];
                await saveActiveGames();
            } catch (error) {
                console.error(`Failed to process transaction for user ${userId}:`, error);
            }
        }
    }

    isProcessing = false;
}



async function processWin(channel, user, winAmount) {
    const userMention = `<@${user.id}>`;

    if (winAmount > 0) {
        const winMessage = `${userMention} won ${winAmount} ISK! Congratulations! Please contact <@235822777678954496>.`;
        await channel.send(winMessage);
    } else {
        const loseMessage = `${userMention} did not win. Better luck next time!`;
        await channel.send(loseMessage);
    }

    // Read existing data
    let data = await readData();
    let winners = data.winners || {};

    // Update winners with the new win amount
    if (winAmount > 0) {
        if (winners[userMention]) {
            winners[userMention] += winAmount;
        } else {
            winners[userMention] = winAmount;
        }
    }

    // Write updated data
    data.winners = winners;
    await writeData(data);
}




function calculateWinAmount(stake) {
    console.log(stake);

    const baseProbabilities = {
        jackpot: 0.001,
        high: 0.01,
        medium: 0.05,
        low: 0.20
    };

    let probabilities = { ...baseProbabilities };

    const amounts = {
        jackpot: stake * 50,
        high: stake * 20,
        medium: stake * 5,
        low: stake * 0.8
    };

    function calculateCasinoProfit() {
        return totalBets - accumulatedWins - bonusPool;
    }

    function adjustProbabilities() {
        const profit = calculateCasinoProfit();

        if (profit < totalBets * 0.2) {
            probabilities.jackpot *= 0.5;
            probabilities.high *= 0.7;
            probabilities.medium *= 0.8;
            probabilities.low *= 0.9;
        } else if (profit > totalBets * 0.5) {
            probabilities.jackpot *= 1.5;
            probabilities.high *= 1.2;
            probabilities.medium *= 1.1;
            probabilities.low *= 1.05;
        } else {
            probabilities = { ...baseProbabilities };
        }
    }

    function addToBonusPool() {
        bonusPool += stake * 0.05;
    }

    function getWinAmount() {
        const randomValue = Math.random();

        if (randomValue < probabilities.jackpot) {
            const win = amounts.jackpot + bonusPool;
            accumulatedWins += win;
            bonusPool = 0;
            return win;
        } else if (randomValue < probabilities.jackpot + probabilities.high) {
            accumulatedWins += amounts.high;
            return amounts.high;
        } else if (randomValue < probabilities.jackpot + probabilities.high + probabilities.medium) {
            accumulatedWins += amounts.medium;
            return amounts.medium;
        } else if (randomValue < probabilities.jackpot + probabilities.high + probabilities.medium + probabilities.low) {
            accumulatedWins += amounts.low;
            return amounts.low;
        } else {
            return 0;
        }
    }

    totalBets += stake;
    addToBonusPool();
    adjustProbabilities();
    return getWinAmount();
}

async function checkBalance() {
    const token = await getAccessTokenUsingRefreshToken();
    const response = await fetch("https://esi.evetech.net/latest/corporations/98769585/wallets/?datasource=tranquility", {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
        }
    });
    const data = await response.json();
    const division1 = data.find(division => division.division === 1);
    return division1.balance;
}

function generateUniqueCode() {
    return Math.random().toString(36).substr(2, 9);
}

async function scheduleTransactionCheck() {
    await deleteOldSessions();
    await loadActiveGames();
    await fetchTransactions();
    logAndSend('Активные игры загружены. Планирование проверки транзакций.');
    await checkTransactions();

    cron.schedule('*/5 * * * *', async () => {
        console.log(`Время проверки транзакций: ${new Date().toISOString()}`);
        await deleteOldSessions();
        await fetchTransactions();
        await checkTransactions();
    }, {
        scheduled: true,
        timezone: "UTC"
    });

    console.log('Проверка транзакций запланирована каждые 5 минут.');
}

async function saveActiveGames() {
    try {
        const simplifiedActiveGames = {};
        for (const userId in activeGames) {
            const game = activeGames[userId];
            simplifiedActiveGames[userId] = {
                channelId: game.channel.id,
                userId: game.user.id, // Still keep userId for reference
                startTime: game.startTime,
                initialBalance: game.initialBalance,
                uniqueCode: game.uniqueCode,
                messageId: game.messageId,
                nickname: game.nickname // Save the nickname
            };
        }
        await writeData({ activeGames: simplifiedActiveGames });
    } catch (error) {
        console.error('Ошибка при сохранении активных игр:', error);
    }
}


async function loadActiveGames() {
    try {
        const data = await readData();
        const simplifiedActiveGames = data.activeGames || {};
        for (const userId in simplifiedActiveGames) {
            const game = simplifiedActiveGames[userId];
            activeGames[userId] = {
                channel: { id: game.channelId },
                user: { id: game.userId },
                startTime: game.startTime,
                initialBalance: game.initialBalance,
                uniqueCode: game.uniqueCode,
                messageId: game.messageId,
                nickname: game.nickname, // Restore the nickname
                timeout: null // We cannot restore the timer, so this needs to be handled separately
            };
        }
        logAndSend(`Бот перезапущен. Восстановлено ${Object.keys(activeGames).length} активных сессий.`);
    } catch (error) {
        console.error('Ошибка при загрузке активных игр:', error);
        activeGames = {};
    }
}

async function deleteOldSessions() {
    const data = await readData();
    const activeGames = data.activeGames || {};
    const currentTime = new Date();

    for (const [userId, gameInfo] of Object.entries(activeGames)) {
        const startTime = new Date(gameInfo.startTime);
        const ageInHours = (currentTime - startTime) / (1000 * 60 * 60);

        if (ageInHours > 3) {
            delete activeGames[userId];
        }
    }

    await writeData(data);
}

const phrases = [
    "Я смотрю Гачи и я горжусь этим",
    "Аниме для мужиков",
    "Жожо лучшее произведение человечества",
    "Никто не может противостоять моему ORA ORA ORA!",
    "Хентай с глубоким сюжетом",
    "2D лучше, чем 3D",
    "Яой для ценителей высокого искусства",
    "Утренние аниме-марафоны — лучший способ начать день",
    "Повязка на глаз — символ мужества",
    "Всегда держи масло под рукой",
    "Никто не может устоять перед моим YES SIR!",
    "Ремень — лучший аксессуар",
    "Жизнь в джимме — жизнь по-настоящему",
    "Всё лучшее происходит в душе"
  ];
  
  async function sendRandomPhrase() {
    const channel = await client.channels.fetch(MAIN_CHANNEL_ID);
    const randomPhrase = phrases[randomInt(phrases.length)];
    channel.send(randomPhrase);
  }
  
  function scheduleDailyMessage() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const randomHour = randomInt(24);
    const randomMinute = randomInt(60);
  
    tomorrow.setHours(randomHour, randomMinute, 0);
  
    scheduleJob(tomorrow, function() {
      sendRandomPhrase();
      scheduleDailyMessage(); 
    });
  }

async function updateMoonMessage() {
    const channel = client.channels.cache.get(MOON_CHANNEL_ID);
    const data = await readData(); 
    let message;
    
    if (data.moonMessage && data.moonMessage.length > 0) {
        const messageId = data.moonMessage[0]; 
        try {
            message = await channel.messages.fetch(messageId);
        } catch (error) {
            console.error('Error fetching the message:', error);
            message = null;
        }
    }

    if (!message) {
        message = await channel.send(createMoonMessage(new Date()));
        data.moonMessage = [message.id]; 
        await writeData(data); 
        console.log(`New message created with ID: ${message.id}`);
    } else {
        const newContent = createMoonMessage(new Date());
        await message.edit(newContent);
        console.log('Message updated successfully.');
    }
}

function createMoonMessage(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = date.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const months = [
        'января/january', 'февраля/february', 'марта/march', 'апреля/april', 'мая/may', 'июня/june',
        'июля/july', 'августа/august', 'сентября/september', 'октября/october', 'ноября/november', 'декабря/december'
    ];

    const moonEmojis = ['🌖', '🌗', '🌘', '🌑'];
    
    let content = `**🌕 Луны по четным дням, старт сразу после ДТ** 🌕\n\n**Цикл луны — 1 месяц (примерно 30 млн. кубов руды)**\n**Журнал добычи**\n`;
    
    let emojiIndex = 0;
    for (let day = today; day <= lastDay; day++) {
        if (day % 2 === 0) {
            let emoji;
            if (day === today) {
                emoji = ' 🟡'; // Today
            } else {
                emoji = moonEmojis[emojiIndex] || '🌑';
                emojiIndex = Math.min(emojiIndex + 1, moonEmojis.length - 1);
            }
            content += `${emoji} ${day} ${months[month]} - Ore ${8 + (day - 16) / 2}\n`;
        }
    }
    
    content += `\nКлонилка стоит на **Ore 1**\n\nРадиус сжималки у орки 116 км, радиус бафов 118 км\nЛунная руда облагается **налогом в 10 процентов** от житабая (считается от скомпрессированной руды)\n***[Журнал добычи](<https://docs.google.com/spreadsheets/d/1eZ2tIRbpC7FL3mK-TgjzCfF5e29-Rmhy2iPi4fuR1no/edit#gid=1084867218>)***`;
        
    return content;
    
}

const MIN_MESSAGES = 70;
const MAX_MESSAGES = 100;

let messageCount = 0;
let nextMessageThreshold = getRandomInt(MIN_MESSAGES, MAX_MESSAGES);
let lastPhraseIndex = -1;  // Хранит индекс последнего отправленного сообщения

const channelInfo = "\n\nВыбрать роль можно в канале <#1163428374493003826>,\n\nОзнакомиться можно в канале <#1211698477151817789>.";
 // замените на ваши ID каналов

// Список фраз с пропагандой тыловых операций
const scheduledPhrases = [
  "USG Ishimura тоже копала луны и к чему это привело? Лучше поддержите атаку Дредноута. " + channelInfo,
  "USM Valor был на боевом дежурстве в тыловых работах и к чему это привело? Лучше копайте Металименальный метеороид. " + channelInfo,
  "Если ты копаешь, а рядом с тобой сапер, значит пора задуматься о заработке в Тыловых работах. " + channelInfo,
  "Капитан Кирк попадал в передряги когда был один. Собери своих друзей и заработай в Тыловых работах без потерь. " + channelInfo,
  "Тыловые операции приносят стабильный доход и требуют меньше усилий. " + channelInfo,
  "Скучаешь между Лунами? Собери друзей и прорвитесь к победе оказав Срочную помощь в войне с пиратами. " + channelInfo,
  "Можно сбиться со счета в количестве падений легендарного Hyperion. Не геройствуйте в еве выигрывает флот. " + channelInfo,
  "2 года было потрачено на съемку легендарной космической одиссеи для сборов 142 миллионов. У тебя есть возможность заработать эти деньги за час. " + channelInfo,
  "За всю серию звездных войн Сокол тысячелетия так и не смог заработать ни одного ISK. Не будь отморозком как Хан Соло и зарабатывай с друзьями миллионы в тыловых работах. " + channelInfo,
  "Пссс! Пилот! Нужны ISK? Есть одна тема. " + channelInfo,
  "Пресвятая Вентура! Почему ты сидишь тут один? Позови друзей для выполнения тыловых работ. " + channelInfo,
  "Ку Пилот! Заводи свой пепелац и обязательно не забудь гравицапу. Зови друзей и полетели у всяких неживых пацаков КЦ забирать. " + channelInfo,
      "Вспомни команду «Ностромо» из «Чужого». Они исследовали опасные зоны космоса. Будь умнее лети с друзщьями в бездны и зарабатывай. " + channelInfo,
  "Это как в «Интерстеллар», только ты вместо черной дыры прыгаешь в бездны. Исследуй, борись и возвращайся с богатствами. " + channelInfo,
  "Вспомни «Стражей Галактики». Им бы твоя ловкость в безднах пригодилась. Бери друзей и вперёд! " + channelInfo,
  "Это как в «Звездных Вратах», только ты вместо цивилизаций ищешь сокровища бездны. " + channelInfo,
  "Не будь как экипаж «Прометея», который не был готов к неизвестности. Подготовь свой корабль перед вылетом в бездны. " + channelInfo,
  "Как в «Темной Звезде», но без драмы. Проникни в глубины бездн и вернись с наградой. " + channelInfo,
  "Ты не Бен Аффлек из «Армагеддона», ты можешь подготовиться лучше. Бери флот и отправляйся в бездны! " + channelInfo,
  "Как в «Миссии на Марс», только твоя цель сокровища бездны. Выживай, борись и возвращайся с победой. " + channelInfo,
  "Вспомни «Солярис» Тарковского. Бездны таят тайны, но твоя цель — найти богатства и вернуться живым. " + channelInfo,
  "Тут как в «Светлячке», ты исследователь и капитан. Бери команду и отправляйтесь в бездны за новыми приключениями и наградами. " + channelInfo,
  "Вспомни фильм «Чужие» — опасности могут поджидать в любой момент. Будь готов к битве перед отправкой в бездны! " + channelInfo,
  "Как в «Экспансии», только ты — в роли Холдена. Управляй флотом, исследуй бездны и получай сокровища. " + channelInfo,
  "Здесь как в «Звездных войнах», только ты вместо контрабанды занимаешься безднами. Удача любит смелых! " + channelInfo,
  "Не повторяй ошибок экипажа «Энтерпрайза» из «Звездного пути». Планируй действия в безднах заранее и возвращайся с трофеями. " + channelInfo,
   "Представь «Звездные войны», только вместо джедаев — ты и твои товарищи. Присоединяйся к фракционным войнам и борись за светлую сторону. " + channelInfo,
  "Вспомни битвы «Галактической Империи» против повстанцев. Как давно это было? Пора написать новую историю, присоединяйся к фракционным войнам и покажи чего ты стоишь. " + channelInfo,
  "Как в «Экспансии», только ты не в Роцинайте, а в своем боевом корабле. Присоединяйся к фракционным войнам и добейся победы. " + channelInfo,
  "Ты как капитан Кирк в «Звездном пути». Собери свой флот и отправляйся в фракционные войны за честь и славу. " + channelInfo,
  "Как в «Вавилон 5», только теперь ты решаешь судьбу войны. Присоединяйся к фракционным боям и изменяй галактику. " + channelInfo,
  "Ты не Том Круз в «Грани будущего», но можешь снова и снова сражаться за свою фракцию и набирать победы. " + channelInfo,
  "Тут как в «Звездных Вратах», ты на передовой, защищая свой народ. Прими участие в фракционных войнах и оставь свой след в истории. " + channelInfo,
  "Ты не Малкольм Рейнольдс из «Светлячка», но твой боевой дух поможет выиграть фракционные войны. Собери команду и вперед! " + channelInfo,
  "Как в «Баттлстар Галактика», только твой флот защищает не людей, а будущее Галактики. Участвуй в фракционных войнах и побеждай. " + channelInfo,
  "Ты не Джон Шепард из «Масс Эффект», но твои действия могут изменить Галактику. Защищай свою сторону в фракционных войнах! " + channelInfo,
  "Как в «Пандоруме», ты находишься в центре войны. Борись за свою фракцию и докажи свое превосходство. " + channelInfo,
  "Ты не герой «Аватара», но можешь бороться за свою нацию, чтобы изменить баланс сил в галактике. " + channelInfo,
  "Вспомни «Звездный десант» и будь готов к битве за свою фракцию. Защищай и побеждай во фракционных войнах! " + channelInfo,
  "Как в «Темной Звезде», только твои враги — не космические аномалии, а вражеские корабли. Участвуй в боях и зарабатывай победы. " + channelInfo
];

client.on('messageCreate', async message => {
    if (message.channel.id === MAIN_CHANNEL_ID && !message.author.bot) {
        messageCount++;
        if (messageCount >= nextMessageThreshold) {
            await sendScheduledPhrase();
        }
    }
});

async function sendScheduledPhrase() {
    const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
        let randomPhraseIndex;
        do {
            randomPhraseIndex = Math.floor(Math.random() * scheduledPhrases.length);
        } while (randomPhraseIndex === lastPhraseIndex);

        const randomPhrase = scheduledPhrases[randomPhraseIndex];
        try {
            await channel.send(randomPhrase);
            messageCount = 0;
            nextMessageThreshold = getRandomInt(MIN_MESSAGES, MAX_MESSAGES);
            lastPhraseIndex = randomPhraseIndex;  // Обновляем индекс последнего отправленного сообщения
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function create_category(guild, name, tag) {
    try {
        // Создаем роли
        const pilotRole = await guild.roles.create({
            name: `Пилот ${tag}`,
            permissions: [],
        });

        const officerRole = await guild.roles.create({
            name: `Офицер ${tag}`,
            permissions: [],
        });

        const ceoRole = await guild.roles.create({
            name: `СЕО ${tag}`,
            permissions: [],
        });

        const additionalRole = guild.roles.cache.find(role => role.id === '1159109482303979662'); // Замените на имя вашей дополнительной роли

        // Создаем категорию
        const category = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: pilotRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: officerRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: ceoRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
                },
                {
                    id: additionalRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
            ],
        });

        // Создаем текстовые каналы
        await guild.channels.create({
            name: '💬｜общий-чат',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: pilotRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: officerRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageRoles],
                },
                {
                    id: ceoRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageChannels],
                },
                {
                    id: additionalRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        await guild.channels.create({
            name: '📊｜killboard',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: pilotRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: officerRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: ceoRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: additionalRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        await guild.channels.create({
            name: '🛡｜офицерский-канал',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: pilotRole.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: officerRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: ceoRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
                {
                    id: additionalRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.SendMessages],
                },
            ],
        });

        // Создаем голосовые каналы
        const voiceChannelPermissions = [
            {
                id: guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: pilotRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
            },
            {
                id: officerRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MoveMembers],
            },
            {
                id: ceoRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageWebhooks],
            },
            {
                id: additionalRole.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
            },
        ];

        await guild.channels.create({
            name: 'Голосовой-1',
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: voiceChannelPermissions,
        });

        await guild.channels.create({
            name: 'Голосовой-2',
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: voiceChannelPermissions,
        });

        await guild.channels.create({
            name: 'Голосовой-3',
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: voiceChannelPermissions,
        });

        return `Категория "${name}" с тегом "${tag}" успешно создана!`;
    } catch (error) {
        console.error(error);
        return 'Произошла ошибка при создании категории и каналов.';
    }
}

client.on('guildMemberRemove', member => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    const mainChannel = member.guild.channels.cache.get(MAIN_CHANNEL_ID);
    
    if (logChannel) {
        logChannel.send(`User ${member.user.tag} (${member.user.id}) has left the server.`);
    }
});

async function respondToMessage(message, pingUser = false) {
    const payload = {
        model: 'gpt-3.5-turbo-0125',
        messages: [
            { role: 'system', content: 'Вы - профессиональный помощник в корпорации космических путешествий. Отвечайте на вопросы с точки зрения эксперта, предоставляя точную и полезную информацию. Ответы должны быть на русском языке и соответствовать профессиональному стилю.' },
            { role: 'user', content: message.content }
        ]
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${chatApi}`
                }
            }
        );

        const botReply = response.data.choices[0].message.content;
        console.log('Ответ от OpenAI API получен:', botReply);

        const replyContent = pingUser ? `<@${message.author.id}> ${botReply}` : botReply;
        await message.channel.send(replyContent);
    } catch (error) {
        console.error('Ошибка при обращении к OpenAI API:', error.response ? error.response.data : error.message);
        await message.channel.send('НАЩАЛЬНИКА АЩИБКА');
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.channel.id === TARGET_CHANNEL_ID) {
        await respondToMessage(message);
    } else if (message.channel.id === MAIN_CHANNEL_ID) {
        const botMentioned = message.mentions.has(client.user);
        const repliedToBot = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

        if (botMentioned || (repliedToBot && !message.mentions.everyone && message.mentions.users.size === 1)) {
            await respondToMessage(message, true);
        }
    }
});


client.login(token); 