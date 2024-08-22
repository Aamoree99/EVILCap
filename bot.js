const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActivityType, 
    PermissionsBitField, 
    ChannelType, 
    AttachmentBuilder, 
    EmbedBuilder,
    Events,
    TextInputComponent,
    TextInputStyle,
    ModalBuilder,
    TextInputBuilder

} = require('discord.js');

const { SlashCommandBuilder } = require('@discordjs/builders');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    EndBehaviorType, 
    getVoiceConnection 
} = require('@discordjs/voice');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const axios = require('axios');
const cron = require('node-cron');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();
const qs = require('querystring');
const { combineAndFormatData } = require('./get_observers.js');
const fs = require('fs').promises;
const Canvas = require('canvas');
const Jimp = require('jimp');
const webp = require('webp-converter');
const { parseStringPromise } = require('xml2js');
const path = require('path');
const { scheduleJob } = require('node-schedule');
const { randomInt } = require('crypto');
const { log } = require('console');
const moment = require('moment');
const connection = require('./db_connect');
const mysql = require('mysql2');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const GUILD_ID = '1159107187407335434';
const LOG_CHANNEL_ID = '1239085828395892796'; 
const REPORT_CHANNEL_ID= '1230611265794080848';
const MAIN_CHANNEL_ID= '1172972375688626276';
const CASINO_CHANNEL_ID= '1239752190986420274';
const MOON_CHANNEL_ID= '1159193601289490534';
const EN_MAIN_CHANNEL_ID= '1212507080934686740';
const TARGET_CHANNEL_ID = '1242246489787334747';
const HOMEFRONTS_ID='1243701044157091860';
const allowedUserId = '235822777678954496';
const guildId = GUILD_ID;
const RSS_URL = 'https://status.eveonline.com/history.rss';

let tokenCache = {
    accessToken: null,
    expiresAt: null
};

let totalBets = 0;
let accumulatedWins = 0;
let bonusPool = 0;
let transactionsCache = [];
let isProcessing = false;
const userSessions = {};
let StealthBot = false;


client.once('ready', async () => {
    client.user.setPresence({
        activities: [{ name: 'Руководит процессами', type: ActivityType.Custom }],
        status: 'online'
    });
    await notifyDatabaseConnection();
    logAndSend(`<@235822777678954496>, я восстал из пепла!`);
    logAndSend(`Logged in as ${client.user.tag}!`);
    sendLatestNewsIfNew();
    //cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    createRoleMessage();
    //scheduleTransactionCheck();
    await checkBirthdays();
    cron.schedule('0 10 * * *', () => {
        updateMoonMessage();
        checkBirthdays();
    }, {
        scheduled: true,
        timezone: "UTC"
    });
    cron.schedule('0 0 * * 1', async () => {
        await findTopMessage();
    });
    cron.schedule('0 11 * * 2', () => {
        sendSPMessage();
    });
    await updateMoonMessage();
    //scheduleDailyMessage();
    //setInterval(cleanupOldMessages, 60 * 60 * 1000);
    cron.schedule('0 12 * * 0', async () => {
        await calculateAndAwardMedals();
        resetWeeklyActivity();
    });
    checkMembersStatus();
    cron.schedule('*/15 * * * *', () => {
        checkMembersStatus();
        sendLatestNewsIfNew()
    });
});

async function notifyDatabaseConnection() {
    try {
        connection.ping((err) => {
            if (err) {
                console.error('Ошибка при проверке подключения к базе данных:', err);
                return;
            }
            
            const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                logChannel.send(`Подключение к базе данных установлено, ID подключения: ${connection.threadId}`)
                    .then(() => console.log('Сообщение о подключении к базе данных отправлено в лог-канал.'))
                    .catch(error => console.error('Ошибка при отправке сообщения в лог-канал:', error));
            } else {
                console.error('Не удалось найти лог-канал. Проверьте LOG_CHANNEL_ID.');
            }
        });

    } catch (error) {
        console.error('Ошибка в функции notifyDatabaseConnection:', error);
    }
}

const clientId = '1238628917900738591'; 
const token = process.env.DISCORD_TOKEN; // Токен, хранящийся в переменных окружения

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
    /*new SlashCommandBuilder()
        .setName('winners')
        .setDescription('Выплаты казино'),
    new SlashCommandBuilder()
        .setName('startcasino')
        .setDescription('Начать казино игру'),
    new SlashCommandBuilder()
        .setName('show_sessions')
        .setDescription('Показывает активные сессии и их уникальные коды с возможностью удаления'),*/
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
        .setName('channel_info')
        .setDescription('TEST')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID категории')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Добавить дату вашего дня рождения')
        .addStringOption(option => 
            option.setName('date')
                    .setDescription('Введите дату в формате ДД.ММ.ГГГГ или ДД.ММ')
                    .setRequired(true)),
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Показать информацию о пользователе')
        .addStringOption(option => 
            option.setName('id')
                .setDescription('ID пользователя')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('sendcustommessage')
        .setDescription('Отправляет кастомное сообщение в указанный канал.'),
    new SlashCommandBuilder()
        .setName('topweekly')
        .setDescription('Показывает топ-10 пользователей за неделю')
        .addBooleanOption(option =>
            option.setName('все')
                  .setDescription('Включить всех пользователей (по умолчанию: да)')
                  .setRequired(true)),
    new SlashCommandBuilder()
        .setName('topalltime')
        .setDescription('Показывает топ-10 пользователей за все время'),
    new SlashCommandBuilder()
        .setName('adamkadyrov')
        .setDescription('Показывает список людей с медалями в лог-канал'),
    new SlashCommandBuilder()
        .setName('medals')
        .setDescription('Управление медалями')
        .addStringOption(option => 
            option.setName('input')
                .setDescription('Формат: уровень: имя медали. Пример: 3: Золотая звезда')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('alts')
        .setDescription('Запись альтов'),
    new SlashCommandBuilder()
        .setName('crabs')
        .setDescription('Record or display dungeon run statistics.')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time in mm:ss format (optional).'))
        .addNumberOption(option =>
            option.setName('sum')
                .setDescription('Sum of the run (optional).'))

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

client.on('messageCreate', message => {
    if (message.content === '!reboot') {
        if (message.author.id === '235822777678954496') { 
            message.channel.send('Перезагружаюсь...')
                .then(() => process.exit(0));
        } else {
            message.channel.send('У вас нет прав для выполнения этой команды.');
        }
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const VOICE_CHANNEL_ID = '1212507874593349732';
    const USER_ID_TO_MONITOR = '739618523076362310';

    if (newState.channelId === VOICE_CHANNEL_ID) {
        if (newState.id === USER_ID_TO_MONITOR) {
            const textChannel = client.channels.cache.get(MAIN_CHANNEL_ID);
            if (textChannel) {
                const voiceChannelLink = `https://discord.com/channels/${GUILD_ID}/${VOICE_CHANNEL_ID}`;
                textChannel.send(`Пользователь <@${USER_ID_TO_MONITOR}> находится в голосовом канале. Присоединяйтесь к беседе!\n${voiceChannelLink}`);
            } else {
                console.error(`Text channel with ID ${MAIN_CHANNEL_ID} not found.`);
            }
        }
    }
});


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
        
        async channel_info() {
            const categoryId = options.getString('id');
            console.log(`Получен ID категории: ${categoryId}`); // Отладочная информация
            const category = await interaction.guild.channels.fetch(categoryId);

            if (!category) {
                console.error(`Категория не найдена по ID: ${categoryId}`);
                await interaction.reply({ content: "Неверный ID категории или категория не найдена.", ephemeral: true });
                return;
            }

            console.log(`Тип канала: ${category.type}`);

            if (category.type !== 4) { // 4 соответствует GUILD_CATEGORY
                console.error(`Канал по ID: ${categoryId} не является категорией`);
                await interaction.reply({ content: "Неверный ID категории или категория не найдена.", ephemeral: true });
                return;
            }

            const channels = category.children.cache;
            if (!channels.size) {
                console.error(`В категории по ID: ${categoryId} нет дочерних каналов`);
                await interaction.reply({ content: "В категории нет дочерних каналов.", ephemeral: true });
                return;
            }

            let channelList = "Список каналов в категории:\n";
            channels.forEach(channel => {
                channelList += `ID: ${channel.id}, Имя: ${channel.name}, Тип: ${channel.type}\n`;
            });

            console.log(`Список каналов в категории ${categoryId}:\n${channelList}`); // Отладочная информация

            const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
            if (!logChannel) {
                console.error(`Лог-канал не найден по ID: ${LOG_CHANNEL_ID}`);
                await interaction.reply({ content: "Лог-канал не найден.", ephemeral: true });
                return;
            }

            await logChannel.send(channelList);
            await interaction.reply({ content: "Список каналов отправлен в лог-канал.", ephemeral: true });
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
            try {
                if (interaction.channelId !== LOG_CHANNEL_ID) {
                    await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                    return;
                }
        
                await interaction.deferReply({ ephemeral: true });
        
                const data = await readData();
                const message = data.ignoreList.length === 0 ? "Игнор-лист пуст." : `Игнор-лист: ${data.ignoreList.join(', ')}`;
        
                await interaction.editReply({ content: message });
            } catch (error) {
                console.error('Error in listignore function:', error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'Произошла ошибка при выполнении команды.' });
                } else {
                    await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true });
                }
            }
        },

        async reactionslist() {
            const channelId = interaction.options.getString('channelid');
            const messageId = interaction.options.getString('messageid');

            const commandChannelId = interaction.channelId;

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
                            const member = await interaction.guild.members.fetch(user.id);
                            let username = member.nickname || user.username;
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

        async winners() {
            const channelId = interaction.channel.id;
        
            if (channelId === LOG_CHANNEL_ID) {
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

                    reply += `\n\nТекущее состояние казино:\n`;
                    reply += `Общая сумма ставок: ${totalBets} ISK\n`;
                    reply += `Общая сумма выигрышей: ${accumulatedWins} ISK\n`;
                    reply += `Бонусный пул: ${bonusPool} ISK\n`;

                    const winnerMessage = await interaction.reply({ content: reply, ephemeral: true });

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
        async create_category() {
            try {
                if (channelId !== LOG_CHANNEL_ID) {
                    await interaction.reply({ content: "Эта команда доступна только в лог-канале.", ephemeral: true });
                    return;
                }
        
                const guild = client.guilds.cache.get(GUILD_ID);
                const name = interaction.options.getString('name');
                const tag = interaction.options.getString('tag');
        
                // Быстрый ответ на взаимодействие для предотвращения таймаута
                await interaction.reply({ content: 'Создание категории и ролей началось...', ephemeral: true });
        
                // Дальнейшие асинхронные операции
                await createСategory(guild, name, tag);
        
                // Сообщение после успешного выполнения
                await interaction.followUp({ content: `Категория "${name}" с тегом "${tag}" успешно создана!`, ephemeral: true });
            } catch (error) {
                console.error(error);
        
                // Если ошибка произошла до первого ответа на взаимодействие
                if (!interaction.replied) {
                    await interaction.reply({ content: 'Произошла ошибка при создании категории.', ephemeral: true });
                } else {
                    // Если ошибка произошла после первого ответа
                    await interaction.followUp({ content: 'Произошла ошибка при создании категории.', ephemeral: true });
                }
            }
        },

        async birthday() {
            const date = interaction.options.getString('date');
            const dateRegexWithYear = /^\d{2}\.\d{2}\.\d{4}$/;
            const dateRegexWithoutYear = /^\d{2}\.\d{2}$/;

            if (!dateRegexWithYear.test(date) && !dateRegexWithoutYear.test(date)) {
                return interaction.reply({ content: 'Неправильный формат даты. Используйте ДД.ММ.ГГГГ или ДД.ММ. Пример: 25.12.1990 или 25.12', ephemeral: true });
            }

            try {
                const data = await readData();
                if (!data.birthdays) {
                    data.birthdays = {};
                }
                data.birthdays[interaction.user.id] = date;
                await writeData(data);
                interaction.reply({ content: 'Ваш день рождения успешно добавлен!', ephemeral: true });
            } catch (error) {
                console.error('Error saving birthday:', error);
                interaction.reply({ content: 'Произошла ошибка при сохранении вашего дня рождения. Попробуйте позже.', ephemeral: true });
            }
        },

        async sendcustommessage() {
            const allowedUserId = '235822777678954496'; // ID разрешенного пользователя

            if (interaction.user.id !== allowedUserId) {
                await interaction.reply({ content: "У вас нет прав на использование этой команды.", ephemeral: true });
                return;
            }
        
            StealthBot = !StealthBot;
            await interaction.reply({ content: `StealthBot режим ${StealthBot ? 'включен' : 'выключен'}.`, ephemeral: true });
        }, 
        async userinfo() {
            if (interaction.channel.id !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Пошел нахуй", ephemeral: true });
                return;
            }
            const userInput = interaction.options.getString('id');
            const userId = userInput.replace(/[<@!>]/g, '');
            
            try {
                const [results] = await queryDatabase(
                    'SELECT * FROM UserActivityTotal WHERE user_id = ?',
                    [userId]
                );

                if (!results || results.length === 0) {
                    await interaction.reply({ content: `Пользователь с ID ${userId} не найден.`, ephemeral: true });
                    return;
                }

                const userInfo = results || {};
                const lastVisit = userInfo.last_visit ?? 'null';
                const messagesCount = userInfo.messages_count ?? 'null';
                const onlineTime = (userInfo.online_time !== null && userInfo.online_time !== undefined) ? formatTime(userInfo.online_time) : 'null';

                await interaction.reply({
                    content: `Информация о пользователе <@${userId}>:\n` +
                             `- Последнее посещение: ${lastVisit}\n` +
                             `- Количество сообщений: ${messagesCount}\n` +
                             `- Общее время в онлайне: ${onlineTime} часов`
                });
            } catch (err) {
                console.error('Ошибка выполнения запроса:', err);
                await interaction.reply({ content: 'Ошибка выполнения запроса к базе данных. Попробуйте позже.', ephemeral: true });
            }
        },

        async topalltime() {
            if (interaction.channel.id !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Пошел нахуй", ephemeral: true });
                return;
            }
            try {
                const results = await queryDatabase(
                    `SELECT user_id, messages_count, last_visit, online_time 
                     FROM UserActivityTotal 
                     ORDER BY messages_count DESC 
                     LIMIT 10`
                );
                if (!results || results.length === 0) {
                    await interaction.reply({ content: 'Нет данных для отображения.', ephemeral: true });
                    return;
                }
                let replyMessage = 'Топ-10 пользователей за все время:\n';
                results.forEach((user, index) => {
                    const lastVisit = user.last_visit ?? 'null';
                    const onlineTime = (user.online_time !== null && user.online_time !== undefined) ? formatTime(user.online_time) : 'null';
                    replyMessage += `${index + 1}. <@${user.user_id}> - ${user.messages_count} сообщений, ` +
                                    `последнее посещение: ${lastVisit}, ` +
                                    `общее время онлайн: ${onlineTime} часов\n`;
                });

                await interaction.reply({ content: replyMessage});
            } catch (err) {
                console.error('Ошибка выполнения запроса:', err);
                await interaction.reply({ content: 'Ошибка выполнения запроса к базе данных. Попробуйте позже.', ephemeral: true });
            }
        },

        async topweekly() {
            const allUsers = interaction.options.getBoolean('все', true);
            if (interaction.channel.id !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Пошел нахуй", ephemeral: true });
                return;
            }
            try {
                let query = `
                    SELECT user_id, messages_count, last_visit, online_time 
                    FROM UserActivityWeekly
                    ORDER BY messages_count DESC 
                    LIMIT 10
                `;
    
                if (!allUsers) {
                    const guild = await interaction.client.guilds.fetch(GUILD_ID);
                    const channelMembers = await getChannelMembers(guild, '1213973137176133772');
                    const excludedUserIds = channelMembers.map(member => member.id).join(',');
                    query = `
                        SELECT user_id, messages_count, last_visit, online_time 
                        FROM UserActivityWeekly
                        WHERE user_id NOT IN (${excludedUserIds})
                        ORDER BY messages_count DESC 
                        LIMIT 10
                    `;
                }
    
                const results = await queryDatabase(query);
    
                if (!results || results.length === 0) {
                    await interaction.reply({ content: 'Нет данных для отображения.', ephemeral: true });
                    return;
                }
    
                let replyMessage = 'Топ-10 пользователей за неделю:\n';
                results.forEach((user, index) => {
                    const lastVisit = user.last_visit ?? 'null';
                    const onlineTime = (user.online_time !== null && user.online_time !== undefined) ? formatTime(user.online_time) : 'null';
                    replyMessage += `${index + 1}. <@${user.user_id}> - ${user.messages_count} сообщений, ` +
                                    `последнее посещение: ${lastVisit}, ` +
                                    `общее время онлайн: ${onlineTime} часов\n`;
                });
    
                await interaction.reply({ content: replyMessage });
            } catch (err) {
                console.error('Ошибка выполнения запроса:', err);
                await interaction.reply({ content: 'Ошибка выполнения запроса к базе данных. Попробуйте позже.', ephemeral: true });
            }
        }, 
        async adamkadyrov() {
            if (interaction.channel.id !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Пошел нахуй", ephemeral: true });
                return;
            }
            try {
                const rows = await queryDatabase(
                    'SELECT user_id, level, awarded_at FROM Medals ORDER BY level DESC, awarded_at DESC'
                );

                if (!rows || rows.length === 0) {
                    await interaction.reply({ content: 'Нет данных для отображения.', ephemeral: true });
                    return;
                }

                let replyMessage = 'Список кадыровцев:\n';
                rows.forEach((row, index) => {
                    replyMessage += `${index + 1}. <@${row.user_id}> - Уровень медали: ${row.level}, Получено: ${new Date(row.awarded_at).toLocaleString()}\n`;
                });

                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send(replyMessage);
                } else {
                    await interaction.reply({ content: 'Лог-канал не найден.', ephemeral: true });
                }

                await interaction.reply({ content: 'Список отправлен в лог-канал.', ephemeral: true });
            } catch (err) {
                console.error('Ошибка выполнения запроса:', err);
                await interaction.reply({ content: 'Ошибка получения данных. Попробуйте позже.', ephemeral: true });
            }
        },

        async medals() {
            if (interaction.channel.id !== LOG_CHANNEL_ID) {
                await interaction.reply({ content: "Пошел нахуй", ephemeral: true });
                return;
            }
            try {
                const input = options.getString('input');

                if (input) {
                    const [levelStr, name] = input.split(':').map(s => s.trim());
                    const level = parseInt(levelStr, 10);

                    if (!level || !name) {
                        await interaction.reply({ content: 'Неверный формат ввода. Используйте `level: name`.', ephemeral: true });
                        return;
                    }

                    const existing = await queryDatabase(
                        'SELECT * FROM MedalNames WHERE level = ?',
                        [level]
                    );

                    if (existing.length > 0) {
                        await queryDatabase(
                            'UPDATE MedalNames SET name = ? WHERE level = ?',
                            [name, level]
                        );
                        await interaction.reply({ content: `Медаль с уровнем ${level} обновлена.` });
                    } else {
                        await queryDatabase(
                            'INSERT INTO MedalNames (level, name) VALUES (?, ?)',
                            [level, name]
                        );
                        await interaction.reply({ content: `Медаль с уровнем ${level} добавлена.` });
                    }
                } else {
                    const rows = await queryDatabase(
                        'SELECT level, name FROM MedalNames ORDER BY level ASC'
                    );
                
                    if (!rows || rows.length === 0) {
                        await interaction.reply({ content: 'Нет данных для отображения.', ephemeral: true });
                        return;
                    }
                
                    let replyMessages = [];
                    let currentMessage = 'Список медалей:\n';
                    const maxMessageLength = 2000;
                
                    rows.forEach((row) => {
                        const newLine = `Уровень ${row.level}: ${row.name}\n`;
                        if ((currentMessage + newLine).length > maxMessageLength) {
                            replyMessages.push(currentMessage);
                            currentMessage = newLine;
                        } else {
                            currentMessage += newLine;
                        }
                    });
                
                    // Push the last message if it contains any data
                    if (currentMessage.length > 0) {
                        replyMessages.push(currentMessage);
                    }
                
                    // Send the first message using reply and the rest using followUp
                    await interaction.reply({ content: replyMessages[0] });
                    for (let i = 1; i < replyMessages.length; i++) {
                        await interaction.followUp({ content: replyMessages[i] });
                    }
                }                
            } catch (err) {
                console.error('Ошибка выполнения запроса:', err);
                await interaction.reply({ content: 'Ошибка получения данных. Попробуйте позже.', ephemeral: true });
            }
        },

        async alts() {
            let userNickname = interaction.member.nickname || interaction.user.username;
            let cleanedNickname = userNickname.replace(/<[^>]*>/g, '').split('(')[0].trim();
          
            try {
              const [alts] = await connection.promise().query(
                'SELECT alt_name FROM alts WHERE main_name = ?',
                [cleanedNickname]
              );
          
              let altNames = '';
              if (alts.length > 0) {
                altNames = alts.map(row => row.alt_name).join(', ');
              }
          
              const modal = new ModalBuilder()
                .setCustomId('altsModal')
                .setTitle('Управление альтами');

            const input = new TextInputBuilder()
                .setCustomId('altsInput')
                .setLabel('Введите ваши альты, разделенные запятыми')
                .setStyle(TextInputStyle.Short)
                .setValue(altNames)
                .setPlaceholder('Для удаления всех альтов введите "REMOVE_ALL"'); 

          
              const actionRow = new ActionRowBuilder().addComponents(input);
              modal.addComponents(actionRow);
          
              await interaction.showModal(modal);
          
            } catch (error) {
              console.error('Database query failed:', error);
              await interaction.reply({ content: 'Failed to retrieve your alts.', ephemeral: true });
            }
          },
        async crabs() {
            await handleDungeonCommand(interaction); 
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

client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit() || interaction.customId !== 'altsModal') return;
  
    let userNickname = interaction.member.nickname || interaction.user.username;
    let cleanedNickname = userNickname.replace(/<[^>]*>/g, '').split('(')[0].trim();
    let altInput = interaction.fields.getTextInputValue('altsInput').trim();
  
    try {
      if (!connection) {
        throw new Error('Database connection is not defined.');
      }
  
      if (altInput === 'REMOVE_ALL') {
        // Удаление всех альтов
        await connection.promise().query(
          'DELETE FROM alts WHERE main_name = ?', [cleanedNickname]
        );
        await interaction.reply({ content: 'All alts have been removed!', ephemeral: true });
        return;
      }
  
      let altNames = altInput.split(',').map(name => name.trim()).filter(name => name);
  
      // Получение существующих альтов
      const [existingAlts] = await connection.promise().query(
        'SELECT alt_name FROM alts WHERE main_name = ?',
        [cleanedNickname]
      );
  
      const existingAltNames = new Set(existingAlts.map(row => row.alt_name.toLowerCase()));
      const inputAltNames = new Set(altNames.map(name => name.toLowerCase()));
  
      // Определение альтов для добавления
      const altsToAdd = altNames.filter(altName => !existingAltNames.has(altName.toLowerCase()));
  
      // Определение альтов для удаления
      const altsToRemove = existingAlts
        .filter(row => !inputAltNames.has(row.alt_name.toLowerCase()))
        .map(row => row.alt_name);
  
      // Добавление новых альтов
      if (altsToAdd.length > 0) {
        const addQueries = altsToAdd.map(altName => connection.promise().query(
          'INSERT INTO alts (alt_name, main_name) VALUES (?, ?)', [altName, cleanedNickname]
        ));
        await Promise.all(addQueries);
      }
  
      // Удаление альтов, которые отсутствуют в новом списке
      if (altsToRemove.length > 0) {
        const removeQueries = altsToRemove.map(altName => connection.promise().query(
          'DELETE FROM alts WHERE alt_name = ? AND main_name = ?', [altName, cleanedNickname]
        ));
        await Promise.all(removeQueries);
      }
  
      await interaction.reply({ content: 'Alts have been updated!', ephemeral: true });
    } catch (error) {
      console.error('Database operation failed:', error);
      await interaction.reply({ content: 'Failed to update your alts.', ephemeral: true });
    }
  });

  async function handleDungeonCommand(interaction) {
    const time = interaction.options.getString('time');
    const sum = interaction.options.getNumber('sum');

    if (time && sum) {
        // Проверяем, содержит ли время только секунды или уже в формате 'mm:ss'
        let formattedTime;

        if (time.includes(':')) {
            // Время в формате 'mm:ss' или 'hh:mm:ss'
            const timeParts = time.split(':').map(Number);

            if (timeParts.length === 2) {
                // Формат 'mm:ss', преобразуем в '00:mm:ss'
                formattedTime = `00:${timeParts[0].toString().padStart(2, '0')}:${timeParts[1].toString().padStart(2, '0')}`;
            } else if (timeParts.length === 3) {
                // Формат 'hh:mm:ss'
                formattedTime = `${timeParts[0].toString().padStart(2, '0')}:${timeParts[1].toString().padStart(2, '0')}:${timeParts[2].toString().padStart(2, '0')}`;
            } else {
                await interaction.reply('Invalid time format. Please use mm:ss or hh:mm:ss.');
                return;
            }
        } else {
            // Если время указано только в секундах, преобразуем в '00:mm:ss'
            const totalSeconds = Number(time);
            if (isNaN(totalSeconds)) {
                await interaction.reply('Invalid time format. Please provide time as mm:ss or seconds.');
                return;
            }
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            formattedTime = `00:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        try {
            await connection.promise().query(
                'INSERT INTO time_record (time, value) VALUES (?, ?)',
                [formattedTime, sum]
            );
            await interaction.reply('Run recorded successfully! 🗒️');
        } catch (err) {
            console.error(err);
            await interaction.reply('There was an error recording your run.');
        }
    } else {
        try {
            const [rows] = await connection.promise().query(
                'SELECT time, value FROM time_record ORDER BY time DESC LIMIT 10'
            );

            if (rows.length === 0) {
                await interaction.reply('No records found.');
                return;
            }

            let totalSeconds = 0;
            let totalSums = 0;

            rows.forEach(run => {
                const [hours, minutes, seconds] = run.time.split(':').map(Number);
                const timeInSeconds = hours * 3600 + minutes * 60 + seconds;
                totalSeconds += timeInSeconds;
                totalSums += run.value;
            });

            const averageSeconds = totalSeconds / rows.length;
            const averageHours = Math.floor(averageSeconds / 3600);
            const averageMinutes = Math.floor((averageSeconds % 3600) / 60);
            const averageFinalSeconds = Math.floor(averageSeconds % 60);
            const averageSum = totalSums / rows.length;

            let replyMessage = 'Last 10 CRAB runs:\n';
            rows.forEach((run, index) => {
                const [hours, minutes, seconds] = run.time.split(':').map(Number);
                replyMessage += `Run ${index + 1}: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} - Sum: ${run.value}kk ISK\n`;
            });

            replyMessage += `\nAverage Time: ${averageHours.toString().padStart(2, '0')}:${averageMinutes.toString().padStart(2, '0')}:${averageFinalSeconds.toString().padStart(2, '0')}\nAverage Sum: ${averageSum.toFixed(2)}`;

            await interaction.reply(replyMessage);
        } catch (err) {
            console.error(err);
            await interaction.reply('There was an error retrieving the statistics.');
        }
    }
}



  
  
async function getChannelMembers(guild, channelId) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
        throw new Error('Channel not found or is not a text channel.');
    }

    const members = channel.members;
    return members.map(member => member.user);
}

client.on('messageCreate', async (message) => {
    const allowedUserId = '235822777678954496'; // ID разрешенного пользователя

    // Проверяем режим StealthBot и автора сообщения
    if (StealthBot && message.author.id === allowedUserId) {
        const content = message.content;
        await message.delete();
        await message.channel.send(content); // Отправка текста от имени бота
    }
});

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60); // Извлечение целых часов
    const remainingMinutes = minutes % 60; // Извлечение оставшихся минут

    // Форматирование с ведущими нулями
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(remainingMinutes).padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}`;
}

async function generateProfileImage(userId, guild) {
    try {
        const background = await Canvas.loadImage('./adam.jpg');

        // Получаем аватар пользователя
        const member = await guild.members.fetch(userId);
        const avatarURL = member.user.displayAvatarURL({ size: 256 });
        const response = await fetch(avatarURL);
        if (!response.ok) throw new Error(`Failed to fetch avatar: ${response.statusText}`);
        const avatarBuffer = await response.buffer();
        const mimeType = response.headers.get('content-type');

        let pngAvatarBuffer;

        // Преобразование WEBP в PNG с помощью webp-converter
        if (mimeType === 'image/webp') {
            const webpFilePath = path.join(__dirname, 'avatar.webp');
            await fs.writeFile(webpFilePath, avatarBuffer);

            const pngFilePath = path.join(__dirname, 'avatar.png');
            await webp.dwebp(webpFilePath, pngFilePath, "-o");

            pngAvatarBuffer = await fs.readFile(pngFilePath);

            // Удаляем временные файлы
            await fs.unlink(webpFilePath);
            await fs.unlink(pngFilePath);
        } else {
            // Преобразование изображения в PNG с помощью jimp
            const avatarImage = await Jimp.read(avatarBuffer);
            pngAvatarBuffer = await avatarImage.getBufferAsync(Jimp.MIME_PNG);
        }
        const avatar = await Canvas.loadImage(pngAvatarBuffer);

        const canvas = Canvas.createCanvas(900, 900);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

        const avatarRadius = 80;
        const avatarDiameter = avatarRadius * 2;
        const avatarX = 430 - avatarRadius;
        const avatarY = 120 - avatarRadius;

        ctx.save();
        ctx.beginPath();
        ctx.arc(430, 120, avatarRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarDiameter, avatarDiameter);
        ctx.restore();

        const username = member.displayName || member.user.username;

        ctx.font = 'bold 50px Times New Roman';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(username, canvas.width / 2, canvas.height - 50);
        ctx.fillText(username, canvas.width / 2, canvas.height - 50);

        return canvas.toBuffer(); // Возвращаем буфер изображения
    } catch (error) {
        console.error('Ошибка создания изображения:', error);
        throw new Error('Произошла ошибка при создании изображения.');
    }
}

async function sendSPMessage() {
    const attachment = {
        files: ['./SP.jpg']
    };

    const mainMessageText = '🔥 Привет, чемпионы! Не забудьте забрать свои **бесплатные 15 000 SP**! 💰 Доступно прямо сейчас! 🚀';
    const enMessageText = '🔥 Hey, champions! Don\'t forget to claim your **free 15,000 SP**! 💰 Available now! 🚀';

    const mainChannel = await client.channels.fetch(MAIN_CHANNEL_ID);
    if (mainChannel) {
        await mainChannel.send({ content: mainMessageText, ...attachment });
    }

    const enMainChannel = await client.channels.fetch(EN_MAIN_CHANNEL_ID);
    if (enMainChannel) {
        await enMainChannel.send({ content: enMessageText, ...attachment });
    }
}

function normalizeDate(dateStr) {
    const parts = dateStr.split('.');
    if (parts.length === 2) {
        return parts.map(part => part.padStart(2, '0')).join('.');
    } else if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${day}.${month}.${year}`;
    }
    return dateStr;
}

async function checkBirthdays() {
    try {
        console.log("Reading data...");
        const data = await readData();

        if (!data || !data.birthdays) {
            console.log("No birthday data available.");
            return;
        }

        const today = new Date();
        const todayStr = today.toISOString().slice(8, 10) + '.' + today.toISOString().slice(5, 7); // Format as DD.MM
        const todayStrWithYear = today.toISOString().slice(8, 10) + '.' + today.toISOString().slice(5, 7) + '.' + today.toISOString().slice(0, 4); // Format as DD.MM.YYYY

        console.log(`Today's date: ${todayStr} (without year) or ${todayStrWithYear} (with year)`);

        const birthdayUsers = Object.keys(data.birthdays).filter(userId => {
            const birthday = normalizeDate(data.birthdays[userId]);
            console.log(`Checking user ${userId} with birthday ${birthday}`);
            return birthday.slice(0, 5) === todayStr || birthday === todayStrWithYear;
        });

        if (birthdayUsers.length > 0) {
            const messages = birthdayUsers.map(userId => {
                const birthday = normalizeDate(data.birthdays[userId]);
                let ageMessage = '';

                if (birthday.length === 10) { // If date is in DD.MM.YYYY format
                    const birthYear = parseInt(birthday.slice(6, 10));
                    const currentYear = today.getFullYear();
                    const age = currentYear - birthYear;
                    ageMessage = age > 0 ? `, ему исполнилось ${age} лет` : '';
                } else {
                    // No ageMessage if only DD.MM format
                    ageMessage = '';
                }

                return `<@${userId}>${ageMessage}`;
            }).filter(Boolean).join(', ');

            const message = birthdayUsers.length === 1 
                ? `🎉 Поздравляем ${messages}! У него сегодня день рождения! 🎉`
                : `🎉 Сегодня особый день для ${messages}! Поздравляем их с днем рождения! 🎉`;

            const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
            if (channel) {
                console.log(`Sending message: ${message}`);
                channel.send(message);
            } else {
                console.log("Channel not found. Please check MAIN_CHANNEL_ID.");
            }
        } else {
            console.log("No birthdays found for today.");
        }
    } catch (error) {
        console.error('Error checking birthdays:', error);
    }
}




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

async function logAndSend(message) {
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
        const introText = `**В этом сообщении вы можете выбрать себе роль, нажав на соответствующую реакцию.**\n\nРоли нужны для того, чтобы Discord мог уведомлять вас отдельным сообщением (звуком или красным квадратиком на приложении), если кто-то "пинганул" эту роль. Например, если вы выбрали себе роль **@Лед**, кто угодно, увидев спавн льда в игре, может написать в Discord "@Лед в Манатириде" и все участники с этой ролью получат оповещение, как если бы им написали в личку. Чтобы пинговать, поставьте перед названием роли собачку (@).\n\n\n⚠️ **Пожалуйста, не пингуйте людей по пустякам.**\n\n**Хороший пример пинга:**\n\n- Заспавнился лед/газ/гравик/луна взорвана.\n\n\n**Плохой пример пинга:**\n\n- "@Луна ребята, а какими лопатами копать луну?"\n\n- "@Лед а сколько дохода с льда?"\n\n\n`;        
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

            const roleIds = ["1239714360503308348", "1230610682018529280"]; 

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

/*
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== MAIN_CHANNEL_ID) return;

    const messageContent = message.content.toLowerCase();
    const containsTriggerWord = triggerWords.some(word => messageContent.includes(word));

    if (!containsTriggerWord) return;

    const currentDate = new Date();
    const lastResponseTimestamp = await getLastResponseTimestamp(message.author.id); // Получаем timestamp последнего ответа из БД

    if (lastResponseTimestamp) {
        const lastResponseDate = new Date(lastResponseTimestamp);

        if (isSameCalendarDay(currentDate, lastResponseDate)) {
            return;
        }
    }

    if (messageContent.includes(specialTriggerWord)) {
        await message.reply(specialResponse);
    } else if (containsTriggerWord && message.author.id === specialPersonTrigger) {
        const commanderResponse = await generateCommanderResponse(message.content);
        await message.reply(commanderResponse);
    } else if (containsTriggerWord) {
        const stalkerResponse = await generateStalkerResponse(message.content);
        await message.reply(stalkerResponse);
    }

    // Обновляем время последнего ответа в БД
    await updateLastResponseTimestamp(message.author.id, currentDate);
});
*/
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

    //const uniqueCode = generateUniqueCode();
    //const initialBalance = await checkBalance();
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

        const recentTransactions = data.filter(tx => {
            return tx.ref_type === 'player_donation';
        });

        transactionsCache = recentTransactions; // Сохраняем транзакции в cache
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
    await loadActiveGames();
    await fetchTransactions();
    logAndSend('Активные игры загружены. Планирование проверки транзакций.');
    await checkTransactions();

    cron.schedule('*/5 * * * *', async () => {
        console.log(`Время проверки транзакций: ${new Date().toISOString()}`);
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
                userId: game.user.id, 
                startTime: game.startTime,
                initialBalance: game.initialBalance,
                uniqueCode: game.uniqueCode,
                messageId: game.messageId,
                nickname: game.nickname 
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

async function sendLatestNewsIfNew() {
    try {

        const data = await readData();
        const lastSavedLink = data.rssfeed;


        const response = await fetch(RSS_URL);
        const xml = await response.text();
        const parsedData = await parseStringPromise(xml);
        const entries = parsedData.rss.channel[0].item;

        if (entries.length === 0) return;


        const latestEntry = entries[0];
        const latestLink = latestEntry.link[0];
        const latestTitle = latestEntry.title[0];

        const formattedMessage = `**${latestTitle}**\n${latestLink}`;


        const mainChannel = client.channels.cache.get(MAIN_CHANNEL_ID);
        const enChannel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

        if (!lastSavedLink) {
            if (mainChannel) await mainChannel.send({ content: formattedMessage });
            if (enChannel) await enChannel.send({ content: formattedMessage });

            await writeData({ rssfeed: latestLink });
        } else if (latestLink !== lastSavedLink) {
            if (mainChannel) await mainChannel.send({ content: formattedMessage });
            if (enChannel) await enChannel.send({ content: formattedMessage });

            await writeData({ rssfeed: latestLink });
        }
    } catch (error) {
        console.error('Ошибка при проверке новостей:', error);
    }
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
        message = await channel.send(await createMoonMessage(new Date()));
        data.moonMessage = [message.id]; 
        await writeData(data); 
        console.log(`New message created with ID: ${message.id}`);
    } else {
        const newContent = await createMoonMessage(new Date());
        await message.edit(newContent);
        console.log('Message updated successfully.');
    }
}

async function createMoonMessage(currentDate) {
    const months = [
        'января/january', 'февраля/february', 'марта/march', 'апреля/april', 'мая/may', 'июня/june',
        'июля/july', 'августа/august', 'сентября/september', 'октября/october', 'ноября/november', 'декабря/december'
    ];

    const moonEmojis = ['🌖', '🌗', '🌘', '🌑'];

    // Получение данных
    const data = await combineAndFormatData();

    if (!Array.isArray(data)) {
        throw new TypeError('Expected data to be an array');
    }

    // Парсинг и сортировка данных
    const sortedData = data.map(item => ({
        ...item,
        chunk_arrival_date: new Date(item.chunk_arrival_date),
        fuel_expires_date: new Date(item.fuel_expires_date)
    })).sort((a, b) => a.chunk_arrival_date - b.chunk_arrival_date);

    // Определяем текущий и следующий месяц
    const currentMonth = currentDate.getMonth();
    const nextMonth = (currentMonth + 1) % 12;

    // Разделяем данные на текущий и следующий месяцы
    const currentMonthData = sortedData.filter(item => item.chunk_arrival_date.getMonth() === currentMonth);
    const nextMonthData = sortedData.filter(item => item.chunk_arrival_date.getMonth() === nextMonth);

    // Создание содержания сообщения
    let content = `**🌕 Лунный календарь 🌕**\n\n`;
    content += `**Цикл луны — 1 месяц (примерно 30 млн. кубов руды)**\n\n`;
    content += `**Расписание добычи**\n\n`;

    function formatEntry(date, name, emoji) {
        const day = date.getDate();
        const month = months[date.getMonth()];
        return `> **${emoji} ${day} ${month} - ${name}**\n`;
    }

    // Обработка текущего месяца
    currentMonthData.forEach(({ chunk_arrival_date, name }, index) => {
        const emoji = index < 3 ? moonEmojis[index] : moonEmojis[3];
        content += formatEntry(chunk_arrival_date, name, emoji);
    });

    // Добавляем разделитель для следующего месяца
    content += `\n**Следующий месяц**\n\n`;

    // Обработка следующего месяца
    nextMonthData.forEach(({ chunk_arrival_date, name }) => {
        content += formatEntry(chunk_arrival_date, name, moonEmojis[3]);
    });

    // Добавляем общую информацию
    content += `\n🚀 **Клонилка расположена на Ore 1**\n`;
    content += `⚙️ **Радиус сжималки у орки: 116 км, радиус бафов: 118 км**\n`;
    content += `💰 **Налог на лунную руду: 10% от скомпрессированной руды**\n`;
    content += `📜 **[Журнал добычи](<https://evil-capybara.space/moon>)**\n`;

    await checkFuelExpirations(sortedData);

    return content;
}

async function checkFuelExpirations(data) {
    const channel = client.channels.cache.get('1213973137176133772');
    const today = new Date();
    const tenDaysLater = new Date();
    tenDaysLater.setDate(today.getDate() + 10);

    // Функция для форматирования даты в дд мм гггг
    const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
    };

    // Сортировка данных по дате истечения
    const sortedData = data.sort((a, b) => new Date(a.fuel_expires_date) - new Date(b.fuel_expires_date));

    // Формирование сообщения для всех станций
    const message = sortedData.map(item => {
        const expiresDate = new Date(item.fuel_expires_date);
        const formattedExpiresDate = formatDate(expiresDate);
        const isExpiringSoon = expiresDate < tenDaysLater;

        return isExpiringSoon 
            ? `⚠️ Станция **${item.name}** - топливо заканчивается **${formattedExpiresDate}** ⚠️`
            : `Станция **${item.name}** - топливо заканчивается **${formattedExpiresDate}**`;
    }).join('\n');

    // Отправка сообщения в лог-канал
    try {
        await channel.send(message);
        console.log('Уведомления для всех станций отправлены.');
    } catch (error) {
        console.error('Ошибка при отправке уведомлений:', error);
    }
}



/* const MIN_MESSAGES = 70;
const MAX_MESSAGES = 100;

let messageCount = 0;
let nextMessageThreshold = getRandomInt(MIN_MESSAGES, MAX_MESSAGES);
let lastPhraseIndex = -1;  // Хранит индекс последнего отправленного сообщения

const channelInfo = "\n\nВыбрать роль можно в канале <#1163428374493003826>,\n\nОзнакомиться можно в канале <#1211698477151817789>.";

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
} */

async function createСategory(guild, name, tag) {
    try {
        const pilotRolePosition = guild.roles.cache.filter(role => role.name.startsWith('Пилот')).sort((a, b) => a.position - b.position).first()?.position || 1;
        const officerRolePosition = guild.roles.cache.filter(role => role.name.startsWith('Офицер')).sort((a, b) => a.position - b.position).first()?.position + 1 || 1;
        const ceoRolePosition = guild.roles.cache.filter(role => role.name.startsWith('CEO')).sort((a, b) => a.position - b.position).first()?.position + 2 || 1;

        const pilotRole = await guild.roles.create({
            name: `Пилот ${tag}`,
            color: '#3498DB', // Цвет роли
            hoist: true, // Выделение в списках
            position: pilotRolePosition
        });

const officerRole = await guild.roles.create({
            name: `Офицер ${tag}`,
            color: '#9B59B6', // Цвет роли
            hoist: true, // Выделение в списках
            position: officerRolePosition,
            permissions: [
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.CreateInstantInvite,
                PermissionsBitField.Flags.ManageRoles,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak
            ]
        });

        const ceoRole = await guild.roles.create({
            name: `CEO ${tag}`,
            color: '#E91E63', // Цвет роли
            hoist: true, // Выделение в списках
            position: ceoRolePosition,
            permissions: [
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.CreateInstantInvite,
                PermissionsBitField.Flags.ManageRoles,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak
            ]
        });


        const category = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AddReactions,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.ManageRoles,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ManageWebhooks,
                        PermissionsBitField.Flags.UseApplicationCommands,
                        PermissionsBitField.Flags.Stream,
                        PermissionsBitField.Flags.SendTTSMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.UseExternalEmojis,
                        PermissionsBitField.Flags.UseExternalStickers,
                        PermissionsBitField.Flags.MentionEveryone,
                        PermissionsBitField.Flags.ManageNicknames,
                        PermissionsBitField.Flags.KickMembers,
                        PermissionsBitField.Flags.BanMembers,
                        PermissionsBitField.Flags.Administrator,
                        PermissionsBitField.Flags.ViewAuditLog,
                        PermissionsBitField.Flags.PrioritySpeaker,
                        PermissionsBitField.Flags.RequestToSpeak,
                        PermissionsBitField.Flags.ManageThreads,
                        PermissionsBitField.Flags.CreatePublicThreads,
                        PermissionsBitField.Flags.CreatePrivateThreads,
                        PermissionsBitField.Flags.UseExternalSounds,
                        PermissionsBitField.Flags.SendMessagesInThreads,
                        PermissionsBitField.Flags.ModerateMembers
                    ],
                },
                {
                    id: pilotRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AddReactions,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.UseExternalEmojis,
                        PermissionsBitField.Flags.UseExternalStickers,
                        PermissionsBitField.Flags.UseSoundboard,
                        PermissionsBitField.Flags.Stream,
                        PermissionsBitField.Flags.UseEmbeddedActivities,
                    ],
                    deny: [
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.ManageRoles,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ManageWebhooks,
                        PermissionsBitField.Flags.UseApplicationCommands,
                        PermissionsBitField.Flags.SendTTSMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.MentionEveryone,
                        PermissionsBitField.Flags.ManageNicknames,
                        PermissionsBitField.Flags.KickMembers,
                        PermissionsBitField.Flags.BanMembers,
                        PermissionsBitField.Flags.Administrator,
                        PermissionsBitField.Flags.ViewAuditLog,
                        PermissionsBitField.Flags.PrioritySpeaker,
                        PermissionsBitField.Flags.RequestToSpeak,
                        PermissionsBitField.Flags.ManageThreads,
                        PermissionsBitField.Flags.CreatePublicThreads,
                        PermissionsBitField.Flags.CreatePrivateThreads,
                        PermissionsBitField.Flags.SendMessagesInThreads,
                        PermissionsBitField.Flags.ModerateMembers
                    ],
                },
                {
                    id: officerRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AddReactions,
                        PermissionsBitField.Flags.ManageRoles,
                        PermissionsBitField.Flags.ManageWebhooks,
                        PermissionsBitField.Flags.UseApplicationCommands,
                        PermissionsBitField.Flags.SendTTSMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.UseExternalEmojis,
                        PermissionsBitField.Flags.UseExternalStickers,
                        PermissionsBitField.Flags.MentionEveryone,
                        PermissionsBitField.Flags.ManageNicknames,
                        PermissionsBitField.Flags.ManageThreads,
                        PermissionsBitField.Flags.CreatePublicThreads,
                        PermissionsBitField.Flags.CreatePrivateThreads,
                        PermissionsBitField.Flags.UseSoundboard,
                        PermissionsBitField.Flags.SendMessagesInThreads,
                        PermissionsBitField.Flags.ModerateMembers,
                        PermissionsBitField.Flags.Stream,
                        PermissionsBitField.Flags.UseEmbeddedActivities,
                        PermissionsBitField.Flags.CreateInstantInvite,
                        PermissionsBitField.Flags.MoveMembers
                    ],
                    deny: [
                        PermissionsBitField.Flags.KickMembers,
                        PermissionsBitField.Flags.BanMembers,
                        PermissionsBitField.Flags.ViewAuditLog,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.Administrator
                    ]
                },
                {
                    id: ceoRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AddReactions,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.ManageRoles,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ManageWebhooks,
                        PermissionsBitField.Flags.UseApplicationCommands,
                        PermissionsBitField.Flags.SendTTSMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.UseExternalEmojis,
                        PermissionsBitField.Flags.UseExternalStickers,
                        PermissionsBitField.Flags.MentionEveryone,
                        PermissionsBitField.Flags.ManageNicknames,
                        PermissionsBitField.Flags.ManageThreads,
                        PermissionsBitField.Flags.CreatePublicThreads,
                        PermissionsBitField.Flags.CreatePrivateThreads,
                        PermissionsBitField.Flags.UseSoundboard,
                        PermissionsBitField.Flags.SendMessagesInThreads,
                        PermissionsBitField.Flags.ModerateMembers,
                        PermissionsBitField.Flags.Stream,
                        PermissionsBitField.Flags.UseEmbeddedActivities,
                        PermissionsBitField.Flags.CreateInstantInvite,
                        PermissionsBitField.Flags.MoveMembers
                    ],
                    deny: [
                        PermissionsBitField.Flags.KickMembers,
                        PermissionsBitField.Flags.BanMembers,
                        PermissionsBitField.Flags.ViewAuditLog,
                        PermissionsBitField.Flags.Administrator
                    ]
                }
            ],
        });

        const textChannelNames = ['💬｜общий-чат', '📊｜killboard', '🛡｜офицерский-канал'];

        for (const channelName of textChannelNames) {
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: category.permissionOverwrites.cache.map(permission => ({
                    id: permission.id,
                    allow: permission.allow,
                    deny: permission.deny
                })),
            });

            if (channelName === '🛡｜офицерский-канал') {
                await channel.permissionOverwrites.create(pilotRole.id, {
                    [PermissionsBitField.Flags.ViewChannel]: false,
                });
            }
        }

        const voiceChannelNames = ['Голосовой-1', 'Голосовой-2', 'Голосовой-3'];

        for (const channelName of voiceChannelNames) {
            await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: category.permissionOverwrites.cache,
            });
        }

        const roleIds = [pilotRole.id, officerRole.id, ceoRole.id];

        await welcomePermissions(roleIds);
        await importantPermissions(roleIds);
        await alliancePermissions(roleIds);
        logAndSend(`Категория "${name}" с тегом "${tag}" успешно создана! Слава <@235822777678954496>!`);
        return;
    } catch (error) {
        console.error(error);
        return 'Произошла ошибка при создании категории и каналов.';
    }
}

async function welcomePermissions(roleIds) {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Guild not found.');
            return;
        }

        const category = await guild.channels.fetch('1159112666799951873');
        if (!category || category.type !== 4) {
            console.error('Invalid category ID or category not found.');
            return;
        }

        const channels = guild.channels.cache.filter(channel => channel.parentId === category.id);
        if (!channels.size) {
            console.error('No channels found in the category.');
            return;
        }

        // Применение разрешений к категории
        category.permissionOverwrites.edit(roleIds[0], {
            [PermissionsBitField.Flags.ViewChannel]: false
        });

        [roleIds[1], roleIds[2]].forEach(roleId => {
            category.permissionOverwrites.edit(roleId, {
                [PermissionsBitField.Flags.ViewChannel]: true,
                [PermissionsBitField.Flags.SendMessages]: true,
                [PermissionsBitField.Flags.ReadMessageHistory]: true,
                [PermissionsBitField.Flags.ManageRoles]: false,
                [PermissionsBitField.Flags.Connect]: true,
                [PermissionsBitField.Flags.Speak]: true,
                [PermissionsBitField.Flags.MoveMembers]: true,
                [PermissionsBitField.Flags.EmbedLinks]: true
            });
        });

        channels.forEach(channel => {
            // Запретить роли пилота видеть каналы в категории
            channel.permissionOverwrites.edit(roleIds[0], {
                [PermissionsBitField.Flags.ViewChannel]: false
            });

            // Разрешить ролям офицера и CEO полные права
            [roleIds[1], roleIds[2]].forEach(roleId => {
                channel.permissionOverwrites.edit(roleId, {
                    [PermissionsBitField.Flags.ViewChannel]: true,
                    [PermissionsBitField.Flags.SendMessages]: true,
                    [PermissionsBitField.Flags.ReadMessageHistory]: true,
                    [PermissionsBitField.Flags.ManageRoles]: false,
                    [PermissionsBitField.Flags.Connect]: true,
                    [PermissionsBitField.Flags.Speak]: true,
                    [PermissionsBitField.Flags.MoveMembers]: true,
                    [PermissionsBitField.Flags.EmbedLinks]: true,
                    [PermissionsBitField.Flags.CreateInstantInvite]: true
                });
            });
        });

        logAndSend('Welcome permissions updated successfully.');
    } catch (error) {
        console.error('Error updating permissions:', error);
    }
}


async function importantPermissions(roleIds) {
    const IMPORTANT_ID = '1212808485172154449'; // ID категории

    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Guild not found.');
            return;
        }

        const category = await guild.channels.fetch(IMPORTANT_ID);
        if (!category || category.type !== 4) {
            console.error('Invalid category ID or category not found.');
            return;
        }

        const channels = guild.channels.cache.filter(channel => channel.parentId === category.id);
        if (!channels.size) {
            console.error('No channels found in the category.');
            return;
        }

        channels.forEach(channel => {
            // Пилоты видят каналы и могут смотреть историю, но на все остальное запрет
            roleIds.forEach(roleId => {
                channel.permissionOverwrites.edit(roleId, {
                    [PermissionsBitField.Flags.ViewChannel]: true,
                    [PermissionsBitField.Flags.ReadMessageHistory]: true,
                    [PermissionsBitField.Flags.SendMessages]: false,
                    [PermissionsBitField.Flags.CreateInstantInvite]: false,
                    [PermissionsBitField.Flags.AttachFiles]: false,
                    [PermissionsBitField.Flags.EmbedLinks]: false,
                    [PermissionsBitField.Flags.SendTTSMessages]: false,
                    [PermissionsBitField.Flags.AddReactions]: false,
                    [PermissionsBitField.Flags.UseExternalEmojis]: false,
                    [PermissionsBitField.Flags.UseExternalStickers]: false,
                    [PermissionsBitField.Flags.MentionEveryone]: false,
                    [PermissionsBitField.Flags.ManageMessages]: false,
                    [PermissionsBitField.Flags.ManageChannels]: false,
                    [PermissionsBitField.Flags.ManageWebhooks]: false,
                    [PermissionsBitField.Flags.ManageRoles]: false,
                    [PermissionsBitField.Flags.ManageThreads]: false,
                    [PermissionsBitField.Flags.CreatePublicThreads]: false,
                    [PermissionsBitField.Flags.CreatePrivateThreads]: false,
                    [PermissionsBitField.Flags.SendMessagesInThreads]: false,
                    [PermissionsBitField.Flags.UseApplicationCommands]: false
                });
            });

            // Дополнительные права для офицеров и CEO
            if (channel.type === 15) { // Предположим, что 15 - это тип каналов, где нужны дополнительные права
                [roleIds[1], roleIds[2]].forEach(roleId => {
                    channel.permissionOverwrites.edit(roleId, {
                        [PermissionsBitField.Flags.ViewChannel]: true,
                        [PermissionsBitField.Flags.ReadMessageHistory]: true,
                        [PermissionsBitField.Flags.SendMessages]: true,
                        [PermissionsBitField.Flags.CreateInstantInvite]: true,
                        [PermissionsBitField.Flags.AttachFiles]: true,
                        [PermissionsBitField.Flags.EmbedLinks]: true,
                        [PermissionsBitField.Flags.SendMessagesInThreads]: true,
                        [PermissionsBitField.Flags.SendTTSMessages]: false,
                        [PermissionsBitField.Flags.AddReactions]: false,
                        [PermissionsBitField.Flags.UseExternalEmojis]: false,
                        [PermissionsBitField.Flags.UseExternalStickers]: false,
                        [PermissionsBitField.Flags.MentionEveryone]: false,
                        [PermissionsBitField.Flags.ManageMessages]: false,
                        [PermissionsBitField.Flags.ManageChannels]: false,
                        [PermissionsBitField.Flags.ManageWebhooks]: false,
                        [PermissionsBitField.Flags.ManageRoles]: false,
                        [PermissionsBitField.Flags.ManageThreads]: false,
                        [PermissionsBitField.Flags.CreatePublicThreads]: false,
                        [PermissionsBitField.Flags.CreatePrivateThreads]: false,
                        [PermissionsBitField.Flags.UseApplicationCommands]: true
                    });
                });
            }
        });

        logAndSend('Impoertant permissions updated successfully.');
    } catch (error) {
        console.error('Error updating permissions:', error);
    }
}



async function alliancePermissions(roleIds) {
    const CATEGORY_ID = '1212506201376694342'; // ID категории

    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error('Guild not found.');
            return;
        }

        const category = await guild.channels.fetch(CATEGORY_ID);
        if (!category || category.type !== 4) { // Проверяем, что это категория
            console.error('Invalid category ID or category not found.');
            return;
        }

        const channels = guild.channels.cache.filter(channel => channel.parentId === category.id);
        if (!channels.size) {
            console.error('No channels found in the category.');
            return;
        }

        // Применение разрешений к категории
        category.permissionOverwrites.edit(roleIds[0], {
            [PermissionsBitField.Flags.ViewChannel]: true,
            [PermissionsBitField.Flags.CreateInstantInvite]: true,
            [PermissionsBitField.Flags.SendMessages]: true,
            [PermissionsBitField.Flags.SendTTSMessages]: false,
            [PermissionsBitField.Flags.EmbedLinks]: true,
            [PermissionsBitField.Flags.AttachFiles]: true,
            [PermissionsBitField.Flags.AddReactions]: true,
            [PermissionsBitField.Flags.UseExternalEmojis]: true,
            [PermissionsBitField.Flags.UseExternalStickers]: true,
            [PermissionsBitField.Flags.MentionEveryone]: false,
            [PermissionsBitField.Flags.ReadMessageHistory]: true,
            [PermissionsBitField.Flags.UseApplicationCommands]: true,
            [PermissionsBitField.Flags.ManageThreads]: false,
            [PermissionsBitField.Flags.CreatePublicThreads]: false,
            [PermissionsBitField.Flags.CreatePrivateThreads]: false,
            [PermissionsBitField.Flags.SendMessagesInThreads]: false,
            [PermissionsBitField.Flags.Connect]: true,
            [PermissionsBitField.Flags.Speak]: true,
            [PermissionsBitField.Flags.Stream]: true,
            [PermissionsBitField.Flags.UseVAD]: true,
            [PermissionsBitField.Flags.PrioritySpeaker]: false,
            [PermissionsBitField.Flags.MuteMembers]: false,
            [PermissionsBitField.Flags.DeafenMembers]: false,
            [PermissionsBitField.Flags.MoveMembers]: false,
            [PermissionsBitField.Flags.ManageRoles]: false,
            [PermissionsBitField.Flags.ManageChannels]: false
        });

        [roleIds[1], roleIds[2]].forEach(roleId => {
            category.permissionOverwrites.edit(roleId, {
                [PermissionsBitField.Flags.ViewChannel]: true,
                [PermissionsBitField.Flags.CreateInstantInvite]: true,
                [PermissionsBitField.Flags.SendMessages]: true,
                [PermissionsBitField.Flags.SendTTSMessages]: false,
                [PermissionsBitField.Flags.EmbedLinks]: true,
                [PermissionsBitField.Flags.AttachFiles]: true,
                [PermissionsBitField.Flags.AddReactions]: true,
                [PermissionsBitField.Flags.UseExternalEmojis]: true,
                [PermissionsBitField.Flags.UseExternalStickers]: true,
                [PermissionsBitField.Flags.MentionEveryone]: false,
                [PermissionsBitField.Flags.ReadMessageHistory]: true,
                [PermissionsBitField.Flags.UseApplicationCommands]: true,
                [PermissionsBitField.Flags.ManageThreads]: true,
                [PermissionsBitField.Flags.CreatePublicThreads]: true,
                [PermissionsBitField.Flags.CreatePrivateThreads]: false,
                [PermissionsBitField.Flags.SendMessagesInThreads]: false,
                [PermissionsBitField.Flags.Connect]: true,
                [PermissionsBitField.Flags.Speak]: true,
                [PermissionsBitField.Flags.Stream]: true,
                [PermissionsBitField.Flags.UseVAD]: true,
                [PermissionsBitField.Flags.PrioritySpeaker]: false,
                [PermissionsBitField.Flags.MuteMembers]: false,
                [PermissionsBitField.Flags.DeafenMembers]: false,
                [PermissionsBitField.Flags.MoveMembers]: true,
                [PermissionsBitField.Flags.ManageRoles]: false,
                [PermissionsBitField.Flags.ManageChannels]: false,
                [PermissionsBitField.Flags.UseEmbeddedActivities]: true,
                [PermissionsBitField.Flags.CreateEvents]: true,
                [PermissionsBitField.Flags.ManageEvents]: true
            });
        });

        channels.forEach(channel => {
            // Установка прав для роли пилота
            channel.permissionOverwrites.edit(roleIds[0], {
                [PermissionsBitField.Flags.ViewChannel]: true,
                [PermissionsBitField.Flags.CreateInstantInvite]: true,
                [PermissionsBitField.Flags.SendMessages]: true,
                [PermissionsBitField.Flags.SendTTSMessages]: false,
                [PermissionsBitField.Flags.EmbedLinks]: true,
                [PermissionsBitField.Flags.AttachFiles]: true,
                [PermissionsBitField.Flags.AddReactions]: true,
                [PermissionsBitField.Flags.UseExternalEmojis]: true,
                [PermissionsBitField.Flags.UseExternalStickers]: true,
                [PermissionsBitField.Flags.MentionEveryone]: false,
                [PermissionsBitField.Flags.ReadMessageHistory]: true,
                [PermissionsBitField.Flags.UseApplicationCommands]: true,
                [PermissionsBitField.Flags.ManageThreads]: false,
                [PermissionsBitField.Flags.CreatePublicThreads]: false,
                [PermissionsBitField.Flags.CreatePrivateThreads]: false,
                [PermissionsBitField.Flags.SendMessagesInThreads]: false,
                [PermissionsBitField.Flags.Connect]: true,
                [PermissionsBitField.Flags.Speak]: true,
                [PermissionsBitField.Flags.Stream]: true,
                [PermissionsBitField.Flags.UseVAD]: true,
                [PermissionsBitField.Flags.PrioritySpeaker]: false,
                [PermissionsBitField.Flags.MuteMembers]: false,
                [PermissionsBitField.Flags.DeafenMembers]: false,
                [PermissionsBitField.Flags.MoveMembers]: false,
                [PermissionsBitField.Flags.ManageRoles]: false,
                [PermissionsBitField.Flags.ManageChannels]: false
            });

            // Установка прав для ролей офицера и CEO
            [roleIds[1], roleIds[2]].forEach(roleId => {
                channel.permissionOverwrites.edit(roleId, {
                    [PermissionsBitField.Flags.ViewChannel]: true,
                    [PermissionsBitField.Flags.CreateInstantInvite]: true,
                    [PermissionsBitField.Flags.SendMessages]: true,
                    [PermissionsBitField.Flags.SendTTSMessages]: false,
                    [PermissionsBitField.Flags.EmbedLinks]: true,
                    [PermissionsBitField.Flags.AttachFiles]: true,
                    [PermissionsBitField.Flags.AddReactions]: true,
                    [PermissionsBitField.Flags.UseExternalEmojis]: true,
                    [PermissionsBitField.Flags.UseExternalStickers]: true,
                    [PermissionsBitField.Flags.MentionEveryone]: false,
                    [PermissionsBitField.Flags.ReadMessageHistory]: true,
                    [PermissionsBitField.Flags.UseApplicationCommands]: true,
                    [PermissionsBitField.Flags.ManageThreads]: true,
                    [PermissionsBitField.Flags.CreatePublicThreads]: true,
                    [PermissionsBitField.Flags.CreatePrivateThreads]: false,
                    [PermissionsBitField.Flags.SendMessagesInThreads]: false,
                    [PermissionsBitField.Flags.Connect]: true,
                    [PermissionsBitField.Flags.Speak]: true,
                    [PermissionsBitField.Flags.Stream]: true,
                    [PermissionsBitField.Flags.UseVAD]: true,
                    [PermissionsBitField.Flags.PrioritySpeaker]: false,
                    [PermissionsBitField.Flags.MuteMembers]: false,
                    [PermissionsBitField.Flags.DeafenMembers]: false,
                    [PermissionsBitField.Flags.MoveMembers]: true,
                    [PermissionsBitField.Flags.ManageRoles]: false,
                    [PermissionsBitField.Flags.ManageChannels]: false,
                    [PermissionsBitField.Flags.UseEmbeddedActivities]: true,
                    [PermissionsBitField.Flags.CreateEvents]: true,
                    [PermissionsBitField.Flags.ManageEvents]: true
                });
            });
        });

        logAndSend('Alliance permissions updated successfully.');
    } catch (error) {
        console.error('Error updating permissions:', error);
    }
}

async function fleetNotify(fc, eventType) {
    const guild = await client.guilds.fetch(GUILD_ID);
    const category = guild.channels.cache.get(HOMEFRONTS_ID);
    const textChannel = category.children.cache.find(channel => channel.type === 0);

    const member = guild.members.cache.find(member => member.displayName.includes(fc));
    const userTag = member ? `<@${member.id}>` : fc;

    await textChannel.send({
        content: `<@&1163379884039618641> Fleet led by ${userTag} for ${eventType} has been launched. Join here: <http://evil-capybara.space/hf_waitlist>`
    });

    await guild.channels.create({
        name: `Fleet ${fc}`,
        type: 2, 
        userLimit: 5,
        parent: category, 
        permissionOverwrites: category.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            allow: overwrite.allow,
            deny: overwrite.deny
        }))
    });

    return { success: true };
}


async function deleteVoiceChannelByFc(fc) {
    const guild = await client.guilds.fetch(GUILD_ID);
    const category = guild.channels.cache.get(HOMEFRONTS_ID);
    const voiceChannel = category.children.cache.find(channel => channel.type === 2 && channel.name.includes(`Fleet ${fc}`));
    
    if (voiceChannel) {
        await voiceChannel.delete();
    }
}

client.on('messageCreate', async message => {
    if (message.channel.id === '1245452568818356308' && !message.author.bot) {
        const hasImage = message.attachments.some(attachment => attachment.contentType && attachment.contentType.startsWith('image/'));
        
        if (hasImage) {
            const randomGifUrl = GIF_ARRAY[Math.floor(Math.random() * GIF_ARRAY.length)];
            const botMessage = await message.reply(randomGifUrl);
            reactionsMeme(message);
            deleteMessageAfterDelay(botMessage, 600000);
        }
    }

    if (message.channel.id === '1159948735183327265' && !message.author.bot) {
        checkForLinkImageOrFile(message);
    }
});

const GIF_ARRAY = [
    'https://media.giphy.com/media/cS8BiSoG0AZLa/giphy.gif',
    'https://media.giphy.com/media/tHIRLHtNwxpjIFqPdV/giphy.gif',
    'https://media.giphy.com/media/W2zkTjEn4kv9BTeNdF/giphy.gif',
    'https://media.giphy.com/media/8c1SH3KQGyWOBa9XvK/giphy.gif',
    'https://media.giphy.com/media/Vl4OUrJVseW94TMvov/giphy.gif',
    'https://media.giphy.com/media/dmvodzjX8wU7icE3TL/giphy.gif',
    'https://media.giphy.com/media/UbCIDXVKaB8kpgxlCa/giphy.gif',
    'https://media.giphy.com/media/65DegL2mRps2Ru03cl/giphy.gif',
    'https://media.giphy.com/media/bLhHnPAY2qZPFOgend/giphy.gif',
    'https://media.giphy.com/media/dZS6VBPvhoJhkdi1RG/giphy.gif',
    'https://media.giphy.com/media/Z5xk7fGO5FjjTElnpT/giphy.gif',
    'https://media.giphy.com/media/jFGpEfirTeNZxY5k5I/giphy.gif',
    'https://giphy.com/gifs/shaq-shimmy-UO5elnTqo4vSg',
    'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif?cid=ecf05e474eg1v9llab7nx0agmwpnfp9tt1hqhph94lnzofia&ep=v1_gifs_related&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/l2SpXyO9TOJCrCbo4/giphy.gif?cid=ecf05e474eg1v9llab7nx0agmwpnfp9tt1hqhph94lnzofia&ep=v1_gifs_related&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/oF5oUYTOhvFnO/giphy.gif?cid=ecf05e474eg1v9llab7nx0agmwpnfp9tt1hqhph94lnzofia&ep=v1_gifs_related&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/BQCsG0FBYjeYkmQ5bs/giphy.gif?cid=ecf05e474eg1v9llab7nx0agmwpnfp9tt1hqhph94lnzofia&ep=v1_gifs_related&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbDNuY3NweXJqZHdmaWRpd2cwdXZwamhmeXMzNnF1bm1kaXZsNDNlcSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/f3e3vLxB7TOuIxDVrX/giphy.gif'
];

async function reactionsMeme(message) {
    try {
        await message.react('👍'); // Палец вверх
        await message.react('👎'); // Палец вниз
    } catch (error) {
        console.error('Failed to add reactions:', error);
    }
}

async function checkForLinkImageOrFile(message) {
    const hasLink = message.content.includes('http');
    const hasImage = message.attachments.some(attachment => attachment.contentType && attachment.contentType.startsWith('image/'));
    const hasFile = message.attachments.size > 0;

    if (hasLink || hasImage || hasFile) {
        await reactionsMeme(message);
    }
}

async function deleteMessageAfterDelay(message, delay) {
    setTimeout(async () => {
        try {
            await message.delete();
            console.log('Bot message deleted');
        } catch (error) {
            console.error('Failed to delete bot message:', error);
        }
    }, delay);
}

async function findTopMessage() {
    const channel = await client.channels.fetch('1245452568818356308');
    const oneWeekAgo = moment().subtract(7, 'days').toDate();
    let topMessage = null;
    let bestRatio = -1;

    // Получаем все сообщения за последнюю неделю
    const messages = await channel.messages.fetch({ limit: 100 });
    const recentMessages = messages.filter(msg => msg.createdAt >= oneWeekAgo && msg.attachments.size > 0);

    recentMessages.forEach(msg => {
        const likes = msg.reactions.cache.get('👍')?.count || 0;
        const dislikes = msg.reactions.cache.get('👎')?.count || 0;
        const ratio = likes - dislikes; 

        if (ratio > bestRatio) {
            bestRatio = ratio;
            topMessage = msg;
        }
    });

    if (topMessage) {
        const topImage = topMessage.attachments.first();
        const author = topMessage.author;
        const channel = await client.channels.fetch('1245452568818356308');
        await channel.send({
            content: `Лучшее изображение недели от ${author}!\n${topImage.url}`
        });
    }
}

client.on('messageCreate', async (message) => {
    if (message.content === `!apocalypse` && message.author.id === allowedUserId) {
        try {
            const guild = message.guild;
            if (!guild) {
                console.log('Не удалось получить гильдию.');
                return;
            }

            const guildName = guild.name;
            const categories = [];
            const channels = [];

            guild.channels.cache.forEach(channel => {
                if (channel.type === 4) {
                    categories.push({ id: channel.id, name: channel.name });
                } else {
                    channels.push({ id: channel.id, name: channel.name, parentId: channel.parentId });
                }
            });
        } catch (error) {
            console.error('Ошибка при получении данных о гильдии:', error);
        }
    }
});

client.on('messageCreate', message => {
    if (!message.guild || message.author.bot) return;

    updateUserActivity(message.author.id);

    const userId = message.author.id;
    const now = Date.now();
    if (!userSessions[userId]) {
        userSessions[userId] = {
            startTime: now,
            lastMessageTime: now
        };
    } else {
        userSessions[userId].lastMessageTime = now;
    }
});

async function checkMembersStatus() {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const members = await guild.members.fetch();
        
        members.forEach(member => {
            if (member.presence?.status === 'online') {
                if (userSessions[member.id]) {
                    // Пользователь онлайн и уже есть в массиве, добавляем 15 минут
                    updateOnlineTime(member.id, 15); // добавляем 15 минут
                } else {
                    // Пользователь онлайн и его нет в массиве, добавляем его
                    userSessions[member.id] = {
                        startTime: Date.now(),
                        lastStatus: 'online',
                        lastMessageTime: Date.now()
                    };
                }
            } else {
                if (userSessions[member.id]) {
                    // Пользователь был онлайн, но ушел
                    delete userSessions[member.id];
                }
            }
        });

    } catch (error) {
        console.error('Ошибка проверки статуса участников:', error);
    }
}

function updateOnlineTime(userId, duration) {
    // Обновляем общее время в онлайне
    queryDatabase(
        'UPDATE UserActivityTotal SET online_time = online_time + ? WHERE user_id = ?',
        [duration, userId]
    ).catch(err => {
        console.error('Ошибка обновления времени в онлайне (общая):', err);
    });

    // Обновляем еженедельное время в онлайне
    queryDatabase(
        'UPDATE UserActivityWeekly SET online_time = online_time + ? WHERE user_id = ?',
        [duration, userId]
    ).catch(err => {
        console.error('Ошибка обновления времени в онлайне (недельная):', err);
    });
}

async function updateUserActivity(userId) {
    const now = new Date();
    const nowIso = now.toISOString().slice(0, 19).replace('T', ' '); // Текущая дата и время в формате ISO для TIMESTAMP
    let lastVisit = null;

    // Получаем последнюю дату посещения из общей таблицы
    try {
        const [lastVisitResult] = await queryDatabase(
            'SELECT last_visit FROM UserActivityTotal WHERE user_id = ?',
            [userId]
        );

        if (lastVisitResult && lastVisitResult.last_visit) {
            lastVisit = lastVisitResult.last_visit;
        }
    } catch (err) {
        console.error('Ошибка получения последней даты посещения:', err);
    }

    // Получаем только дату для сравнения
    const lastVisitDate = lastVisit ? new Date(lastVisit).toISOString().split('T')[0] : null;
    const nowDate = new Date(nowIso).toISOString().split('T')[0];
    const isNewVisit = !lastVisitDate || lastVisitDate !== nowDate;

    // Определяем значение для visit_count
    const visitCountIncrement = isNewVisit ? 1 : 0;

    // Обновление общей активности
    try {
        await queryDatabase(
            `INSERT INTO UserActivityTotal (user_id, last_visit, messages_count, online_time, visit_count)
            VALUES (?, ?, 1, 0, ?)
            ON DUPLICATE KEY UPDATE
                last_visit = VALUES(last_visit),
                messages_count = messages_count + 1,
                visit_count = visit_count + VALUES(visit_count)`,
            [userId, nowIso, visitCountIncrement]
        );
    } catch (err) {
        console.error('Ошибка обновления данных пользователя (общая):', err);
    }

    // Обновление еженедельной активности
    try {
        await queryDatabase(
            `INSERT INTO UserActivityWeekly (user_id, last_visit, messages_count, online_time, visit_count)
            VALUES (?, ?, 1, 0, ?)
            ON DUPLICATE KEY UPDATE
                last_visit = VALUES(last_visit),
                messages_count = messages_count + 1,
                visit_count = visit_count + VALUES(visit_count)`,
            [userId, nowIso, visitCountIncrement]
        );
    } catch (err) {
        console.error('Ошибка обновления данных пользователя (недельная):', err);
    }
}

async function getChannelMemberIds(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            console.log(`Канал с ID ${channelId} не найден или не является текстовым каналом.`);
            return [];
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const userIds = new Set();

        messages.forEach(message => {
            userIds.add(message.author.id);
        });

        return Array.from(userIds);
    } catch (error) {
        console.error(`Ошибка при получении участников канала ${channelId}:`, error);
        return [];
    }
}

async function calculateAndAwardMedals() {
    const EXCLUDE_CHANNEL_ID = '1213973137176133772';

    try {
        const excludeUserIds = await getChannelMemberIds(EXCLUDE_CHANNEL_ID);


        const whereClause = excludeUserIds.length > 0
            ? `WHERE user_id NOT IN (${excludeUserIds.map(id => `'${id}'`).join(', ')})`
            : '';

        const query = `
            SELECT user_id, visit_count, SUM(messages_count) AS total_messages
            FROM UserActivityWeekly
            ${whereClause}
            GROUP BY user_id
            ORDER BY total_messages DESC
            LIMIT 10
        `;

        const results = await queryDatabase(query);

        if (!results || results.length === 0) {
            console.log('Нет данных для создания топа.');
            return;
        }

        awardMedals(results);
    } catch (err) {
        console.error('Ошибка получения данных:', err);
    }
}


async function awardMedals(users) {
    if (!users.length) return;

    const topChannel = client.channels.cache.get(MAIN_CHANNEL_ID);
    if (!topChannel) {
        console.error(`Канал с ID ${MAIN_CHANNEL_ID} не найден.`);
        return;
    }

    let announcement = 'Топ активных участников за последнюю неделю:\n';
    let awardedUser = null;
    let awardedMedal = null;
    let awardedReward = null;
    let awardGiven = false; 

    for (const [index, user] of users.entries()) {
        const place = index + 1;
        const totalMessages = user.total_messages || 0;

        try {
            const canAward = await canUserBeAwarded(user.user_id);
            console.log(user, canAward);

            if (!awardGiven && canAward) {
                const { medalName, reward } = await awardUser(user.user_id, true);
                awardedMedal = medalName;
                awardedReward = reward;
                awardedUser = user.user_id;
                announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений, получает медаль ${awardedMedal}\n`;
                awardGiven = true; // Устанавливаем флаг, что медаль была присуждена
            } else {
                announcement += `${place}. <@${user.user_id}> - ${totalMessages} сообщений\n`;
            }
        } catch (err) {
            console.error('Ошибка присуждения медали:', err);
        }
    }

    if (awardedUser) {
        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) throw new Error('Гильдия не найдена.');

            const imageBuffer = await generateProfileImage(awardedUser, guild);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'awarded-image.png' });

            await topChannel.send({
                content: `<@${awardedUser}> получил(а) ${awardedMedal}! За наградой ${awardedReward} млн ISK обращайтесь к <@739618523076362310>.`,
                files: [attachment],
            });
        } catch (error) {
            console.error('Ошибка при отправке изображения:', error);
            await topChannel.send('Произошла ошибка при создании изображения.');
        }
    }

    topChannel.send(announcement);
}

async function canUserBeAwarded(userId) {
    try {
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        if (results.length > 0) {
            const lastAwardedDate = new Date(results[0].awarded_at);
            const currentLevel = results[0].level;
            const threeWeeksAgo = new Date();
            threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
            threeWeeksAgo.setSeconds(threeWeeksAgo.getSeconds() - 1);

            if (currentLevel >= maxLevel) {
                return false;
            }

            return lastAwardedDate < threeWeeksAgo;
        }
        return true;
    } catch (err) {
        console.error('Ошибка проверки медали:', err);
        return false;
    }
}

async function awardUser(userId, isFirstPlace) {
    try {
        console.log(userId, isFirstPlace);
        const maxLevelResults = await queryDatabase(
            'SELECT MAX(level) AS maxLevel FROM MedalNames'
        );
        const maxLevel = maxLevelResults[0].maxLevel;

        const results = await queryDatabase(
            'SELECT level, awarded_at FROM Medals WHERE user_id = ? ORDER BY awarded_at DESC LIMIT 1',
            [userId]
        );

        let level = 1;

        if (results.length > 0) {
            const currentLevel = results[0].level;

            if (currentLevel >= maxLevel) {
                const medalName = (await queryDatabase(
                    'SELECT name FROM MedalNames WHERE level = ?',
                    [currentLevel]
                ))[0].name;
                const reward = 10 + ((currentLevel - 1) * 40 / (maxLevel - 1));
                return { medalName, reward: Math.round(reward * 10) / 10 };
            }

            if (isFirstPlace) {
                level = currentLevel + 1;
                await queryDatabase(
                    'UPDATE Medals SET level = ?, awarded_at = NOW() WHERE user_id = ? AND awarded_at = ?',
                    [level, userId, results[0].awarded_at]
                );
            } else {
                level = currentLevel;
            }
        } else if (isFirstPlace) {
            console.log(`Inserting new medal for user ${userId}`);
            await queryDatabase(
                'INSERT INTO Medals (user_id, level, awarded_at) VALUES (?, 1, NOW())',
                [userId]
            );
        }

        const medalNameResults = await queryDatabase(
            'SELECT name FROM MedalNames WHERE level = ?',
            [level]
        );

        const medalName = medalNameResults[0].name;
        const reward = 10 + ((level - 1) * 40 / (maxLevel - 1));
        return { medalName, reward: Math.round(reward * 10) / 10 };
    } catch (err) {
        console.error('Ошибка присуждения медали:', err);
        throw err;
    }
}



function resetWeeklyActivity() {
    queryDatabase('DELETE FROM UserActivityWeekly')
        .then(() => {
            console.log('Таблица еженедельной активности очищена.');
        })
        .catch(err => {
            console.error('Ошибка очистки таблицы еженедельной активности:', err);
        });
}

function queryDatabase(query, params) {
    return new Promise((resolve, reject) => {
        connection.query(query, params, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

const logMessage = async (message) => {
    try {
      const channel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (channel) {
        await channel.send(message);
      } else {
        console.error('Log channel not found.');
      }
    } catch (error) {
      console.error('Error logging message to Discord:', error);
    }
  };


  async function getSpeechFiles() {
    try {
        const files = await fs.readdir('./speeches/');
        return files.filter(file => file.startsWith('speech') && file.endsWith('.mp3'));
    } catch (error) {
        console.error('Error reading directory:', error);
        return [];
    }
}

async function playSpeech(v_connection) {
    const player = createAudioPlayer();
    const files = await getSpeechFiles();
    
    if (files.length === 0) {
        console.error('No audio files found!');
        return;
    }

    let currentIndex = 0; // Индекс текущего файла

    const playNext = async () => {
        if (files.length === 0) return;

        const filePath = path.join('./speeches/', files[currentIndex]);
        console.log('Playing file:', filePath);

        try {
            const resource = createAudioResource(filePath, { inlineVolume: true });
            player.play(resource);
            v_connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                currentIndex = (currentIndex + 1) % files.length; // Перейти к следующему файлу или вернуться к первому
                setTimeout(playNext, 30000); // 1 минута паузы
            });

            player.on('error', error => {
                console.error('Error playing file:', error);
            });
        } catch (error) {
            console.error('Error creating audio resource:', error);
        }
    };

    playNext();
}

client.on('messageCreate', async message => {
    if (message.content.startsWith('!join')) {
        const args = message.content.split(' ');
        const channelId = args[1];

        if (!channelId) {
            message.reply('Please provide a channel ID!');
            return;
        }

        const channel = await client.channels.fetch(channelId);
        if (channel && channel.type === ChannelType.GuildVoice) {
            const v_connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            v_connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('The bot has connected to the channel!');
                playSpeech(v_connection);
            });

            v_connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                try {
                    await Promise.race([
                        entersState(v_connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(v_connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    v_connection.destroy();
                }
            });
        } else {
            message.reply('The channel is not a voice channel or does not exist!');
        }
    } else if (message.content === '!leave') {
        const v_connection = getVoiceConnection(message.guild.id);
        if (v_connection) {
            v_connection.destroy();
        }
    }
});

client.login(token); 

module.exports = {
    client,
    fleetNotify,
    deleteVoiceChannelByFc
};
