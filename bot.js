const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ActivityType } = require('discord.js');
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

const waitList = new Map();
const messageMap = new Map();

let tokenCache = {
    accessToken: null,
    expiresAt: null
};

let totalBets = 0;
let accumulatedWins = 0;
let bonusPool = 0;

client.once('ready', async () => {
    client.user.setPresence({
        activities: [{ name: 'поклонение Дону', type: ActivityType.Playing }],
        status: 'online'
    });
    logAndSend(`<@235822777678954496>, папа я родился!`);
    await getAccessTokenUsingRefreshToken();
    logAndSend(`Logged in as ${client.user.tag}!`);
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); 
    cron.schedule('0 10 * * *', () => {
        logAndSend('Выполняю задачу отправки уведомлений о мероприятии.');
        scheduleDailyActivity(client);
    });
    checkBalance();
    await createRoleMessage();
    setInterval(cleanupOldMessages, 60 * 60 * 1000);
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
        .setDescription('Начать казино игру')
    
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

const activeGames = {};

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
            const allowedChannels = ['1172972375688626276', '1212507080934686740'];
            const currentChannelId = interaction.channel.id;

            if (!allowedChannels.includes(currentChannelId)) {
                await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
                return;
            }
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
            if (channelId !== CASINO_CHANNEL_ID) {
                return interaction.reply({ content: 'Эта команда доступна только в определенном канале.', ephemeral: true });
            }

            if (activeGames[interaction.user.id]) {
                return interaction.reply({ content: 'Вы уже начали игру. Пожалуйста, завершите текущую игру перед началом новой.', ephemeral: true });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_${interaction.user.id}`)
                        .setLabel('Подтвердить отправку 1кк ISK')
                        .setStyle(ButtonStyle.Primary),
                );

            const initialBalance = await checkBalance();
            const startTime = new Date();
            const expectedAmount = 1000000; // 1 млн ISK

            activeGames[interaction.user.id] = { 
                channel: interaction.channel, 
                user: interaction.user, 
                startTime, 
                initialBalance, 
                expectedAmount, 
                timeout: null 
            };

            await interaction.reply({ content: 'Пожалуйста, подтвердите отправку 1кк ISK корпорации Cosmic Capybara Crew.', components: [row] });

            // Установка таймера на 30 минут для отмены игры
            activeGames[interaction.user.id].timeout = setTimeout(async () => {
                if (activeGames[interaction.user.id]) {
                    await interaction.followUp({ content: 'Игра отменена из-за отсутствия подтверждения.', ephemeral: true });
                    delete activeGames[interaction.user.id];
                }
            }, 300000);
        }
    };

    if (interaction.isCommand()) {
        if (commandHandlers[commandName]) {
            await commandHandlers[commandName]();
        }
    }

    // Обработка нажатия кнопки
    if (interaction.isButton()) {
        const [action, userId] = interaction.customId.split('_');
        if (action !== 'confirm') return;

        const userGame = activeGames[userId];
        if (!userGame || userGame.channel.id !== interaction.channel.id) {
            return interaction.reply({ content: 'Эта кнопка не для вас или не в правильном канале.', ephemeral: true });
        }

        if (interaction.user.id !== userId) {
            return interaction.reply({ content: 'Эта кнопка не для вас.', ephemeral: true });
        }

        if (interaction.customId === `confirm_${userId}`) {
            clearTimeout(userGame.timeout); // Очистка таймера, если пользователь подтвердил
            await interaction.update({ content: 'Пожалуйста, подождите 5 минут для обработки перевода...', components: [] });

            setTimeout(async () => {
                const currentBalance = await checkBalance();

                if (currentBalance >= userGame.initialBalance + userGame.expectedAmount) {
                    const winAmount = calculateWinAmount();
                    await startGame(userGame.channel, userGame.user, winAmount);
                    delete activeGames[userId];
                } else {
                    await interaction.followUp({ content: 'Ошибка при обработке перевода. Попробуйте снова.', ephemeral: true });
                }
            }, 300100);
        }
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
            channel.send(`${member.toString()}, пожалуйста, напиши свой ник и имя через запятую, например: Ник игры, Имя.`);
            waitList.set(member.id, member.guild.id);
        } else {
            logAndSend(`Member ${member.user.tag} (ID: ${member.id}) matches the required nickname format.`);
        }
    } catch (error) {
        console.error("Error in guildMemberAdd event handler:", error);
    }
});

client.on('messageCreate', async message => {
    try {
        if (message.author.bot || message.channel.id !== W_CHANNEL_ID || !message.content.trim() || !waitList.has(message.author.id)) return;

        if (waitList.get(message.author.id) === message.guild.id) {
            const content = message.content;
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
            logAndSend(`Пользователь <@${user.tag}> выбрал корпорацию Cosmic Capybara Crew.`);
            try {
                const role = reaction.message.guild.roles.cache.find(role => role.id === '1239714360503308348');
                const member = reaction.message.guild.members.cache.get(user.id);
                await member.roles.add(role);
                logAndSend(`Роль <@&${role.id}> была успешно добавлена пользователю <@&${user.id}>.`);

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

        const channel = guild.channels.cache.get(MAIN_CHANNEL_ID);
        if (!channel) return logAndSend("Канал не найден");

        let activityData = await readFromJSON(DATA_FILE);
        if (!activityData.eventId) {
            activityData.eventId = [];
        }
        if (!activityData.participants) {
            activityData.participants = [];
        }

        let message;
        let participants = new Set(activityData.participants);

        if (activityData.eventId.length > 0) {
            try {
                message = await channel.messages.fetch(activityData.eventId[0]);
                logAndSend("Возобновление существующего сообщения для сбора участников.");
            } catch (error) {
                console.error('Error fetching existing message:', error);
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
                            .setStyle(ButtonStyle.Primary)
                    )
                ]
            });
            activityData.eventId = [message.id];
            await writeToJSON(DATA_FILE, activityData);
        }

        let collector = message.createMessageComponentCollector({ componentType: 2 }); // 2 is Button

        collector.on('collect', async (interaction) => {
            logAndSend(`Кнопка ${interaction.customId} была нажата пользователем ${interaction.user.username}.`);
            if (interaction.customId === 'participate') {
                await interaction.deferUpdate();
                if (participants.has(interaction.user.id)) {
                    await interaction.followUp({ content: 'Вы уже записаны!', ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Спасибо за ваш интерес, мы вас записали!', ephemeral: true });
                    participants.add(interaction.user.id);
                    activityData.participants = Array.from(participants);
                    await writeToJSON(DATA_FILE, activityData);

                    if (participants.size >= 5) {
                        const now = new Date();
                        const timezoneOffset = now.getTimezoneOffset() * 60000; // переводим в миллисекунды
                        const localNow = new Date(now.getTime() - timezoneOffset);
                        const startTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 19, 0, 0, 0);
                        const endTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 20, 0, 0, 0);
                        let event;
                        try {
                            event = await guild.scheduledEvents.create({
                                name: 'Homefronts',
                                description: 'Time to make some ISK!',
                                scheduledStartTime: startTime, // начало через 1 час
                                scheduledEndTime: endTime, // конец через 2 часа
                                privacyLevel: 2,
                                entityType: 3, // 3 для онлайн событий
                                entityMetadata: {
                                    location: 'Dodixie' // Указываем, что местоположение онлайн
                                }
                            });
                            logAndSend(`Создан ивент: ${event.name}`);

                            logAndSend('Событие успешно создано!');
                        } catch (error) {
                            console.error('Ошибка при создании события:', error);
                        }

                        if (event) {
                            participants.forEach(async (userId) => {
                                const user = await client.users.fetch(userId);
                                if (user && !user.bot) {
                                    user.send(`Привет! Напоминаем, что сегодня в 19:00 начнется мероприятие. Вот ссылка: ${event.url}`);
                                }
                            });
                        } else {
                            logAndSend("Событие не было создано, сообщение не отправлено.");
                        }

                        try {
                            await message.delete();
                            activityData = { ...activityData, eventId: [], participants: [] };
                            await writeToJSON(DATA_FILE, activityData);
                        } catch (error) {
                            console.error('Ошибка при удалении сообщения:', error);
                        }

                        collector.stop();
                    }
                }
            }
        });

        collector.on('end', async () => {
            logAndSend(`Collected ${participants.size} participants.`);
            if (participants.size < 5) {
                try {
                    await message.delete();
                    activityData = { ...activityData, eventId: [], participants: [] };
                    await writeToJSON(DATA_FILE, activityData);
                } catch (error) {
                    console.error('Ошибка при удалении сообщения:', error);
                }
            }
        });

        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset() * 60000; // переводим в миллисекунды
        const localNow = new Date(now.getTime() - timezoneOffset);

        const endTime = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 18, 55, 0, 0);
        const duration = endTime.getTime() - localNow.getTime();

        setTimeout(() => {
            if (collector) {
                collector.stop();
            }
        }, duration);
    } catch (error) {
        console.error("Error in scheduleDailyActivity:", error);
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
    const channel = client.channels.cache.get(LOG_CHANNEL_ID);
    try {
        logAndSend('Начало чистки...');

        if (!channel) {
            console.error("Канал не найден");
            return;
        }

        try {
            const options = { limit: 100 };
            if (before) {
                options.before = before;
            }
            const messages = await channel.messages.fetch(options);

            const now = Date.now();
            const twelveHours = 1000 * 60 * 60; // 12 часов в миллисекундах

            const deletionPromises = [];

            for (const message of messages.values()) {
                const age = now - message.createdTimestamp;

                if (age > twelveHours) {
                    deletionPromises.push(
                        message.delete()
                            .then(() => console.log(`Удалено сообщение: ${message.id}`))
                            .catch(error => console.log(`Не удалось удалить сообщение ${message.id}: ${error}`))
                    );
                }
            }

            await Promise.all(deletionPromises);

            if (messages.size === 100) {
                const lastMessage = messages.last();
                await cleanupOldMessages(lastMessage.id);
            } else {
                logAndSend("Старые сообщения удалены");
            }
        } catch (error) {
            console.error("Произошла ошибка при удалении старых сообщений:", error);
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
    "Как жизнь, сталкер?"
];

const specialResponse = "бобр курва";
const specialTriggerWord = "боброе утро";

const triggerWords = [
    "доброе утро",
    "добрый день",
    "добрый вечер",
    "доброго утра",
    "доброго дня",
    "доброго вечера"
];

const specialPersonTrigger = "739618523076362310"; // Замените на ID нужного пользователя
const specialPersonResponse = "Здравствуй, мой генерал! Сегодня мы на темной стороне.";

client.on('messageCreate', async (message) => {
    // Проверяем, чтобы сообщение не было от бота и было в нужном канале
    if (message.author.bot || message.channel.id !== LOG_CHANNEL_ID) return;

    const messageContent = message.content.toLowerCase();

    if (messageContent.includes(specialTriggerWord)) {
        await message.reply(specialResponse);
    } else if (message.author.id === specialPersonTrigger && triggerWords.some(word => messageContent.includes(word))) {
        await message.reply(specialPersonResponse);
    } else {
        for (const word of triggerWords) {
            if (messageContent.includes(word)) {
                const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                await message.reply(randomResponse);
                break; // Прерываем цикл, если нашли соответствующее слово
            }
        }
    }
});
        
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
    console.log(division1.balance);
    return division1.balance;
}



function calculateWinAmount() {
    // Вероятности для разных уровней выигрышей (начальные значения)
    const baseProbabilities = {
        jackpot: 0.001, // 0.1%
        high: 0.01, // 1%
        medium: 0.05, // 5%
        low: 0.20 // 20%
    };

    // Копируем базовые вероятности в объект вероятностей
    let probabilities = { ...baseProbabilities };

    // Размеры выигрышей
    const amounts = {
        jackpot: 50000000, // 50 млн ISK
        high: 20000000, // 20 млн ISK
        medium: 5000000, // 5 млн ISK
        low: 800000 // 800k ISK (ниже взноса)
    };

    const stake = 1000000; // 1 млн ISK

    // Функция для расчета текущего состояния казино
    function calculateCasinoProfit() {
        return totalBets - accumulatedWins - bonusPool;
    }

    // Функция для динамического изменения вероятностей
    function adjustProbabilities() {
        const profit = calculateCasinoProfit();

        if (profit < totalBets * 0.2) {
            // Если прибыль казино меньше 20% от общей суммы ставок, уменьшаем вероятность выигрышей
            probabilities.jackpot *= 0.5;
            probabilities.high *= 0.7;
            probabilities.medium *= 0.8;
            probabilities.low *= 0.9;
        } else if (profit > totalBets * 0.5) {
            // Если прибыль казино больше 50% от общей суммы ставок, увеличиваем вероятность выигрышей
            probabilities.jackpot *= 1.5;
            probabilities.high *= 1.2;
            probabilities.medium *= 1.1;
            probabilities.low *= 1.05;
        } else {
            // Вероятности возвращаются к базовым значениям
            probabilities = { ...baseProbabilities };
        }
    }

    // Функция для добавления бонуса в пул
    function addToBonusPool() {
        bonusPool += stake * 0.05; // 5% от ставки идет в бонусный пул
    }

    // Функция для расчета выигрыша
    function getWinAmount() {
        const randomValue = Math.random();

        if (randomValue < probabilities.jackpot) {
            accumulatedWins += amounts.jackpot + bonusPool;
            const win = amounts.jackpot + bonusPool;
            bonusPool = 0; // Сбрасываем бонусный пул
            return win; // Джекпот
        } else if (randomValue < probabilities.jackpot + probabilities.high) {
            accumulatedWins += amounts.high;
            return amounts.high; // Высокий выигрыш
        } else if (randomValue < probabilities.jackpot + probabilities.high + probabilities.medium) {
            accumulatedWins += amounts.medium;
            return amounts.medium; // Средний выигрыш
        } else if (randomValue < probabilities.jackpot + probabilities.high + probabilities.medium + probabilities.low) {
            accumulatedWins += amounts.low;
            return amounts.low; // Низкий выигрыш
        } else {
            return 0; // Ничего не выигрывает
        }
    }

    // Обновление общей суммы ставок
    totalBets += stake;

    // Добавляем часть ставки в бонусный пул
    addToBonusPool();

    // Корректируем вероятности перед расчетом выигрыша
    adjustProbabilities();

    // Рассчитываем и возвращаем выигрыш
    return getWinAmount();
}


async function startGame(channel, user, winAmount) {
    if (winAmount > 0) {
        const winMessage = `<@${user.id}> выиграл ${winAmount} ISK! Поздравляем! Напиши <@235822777678954496>.`;
        await channel.send(winMessage);
    } else {
        const loseMessage = `<@${user.id}> не выиграл. Удачи в следующий раз!`;
        await channel.send(loseMessage);
    }

    // Чтение текущих победителей из файла
    let data = await readData();
    let winners = data.winners || {};

    if (winAmount > 0) {
        if (winners[user.username]) {
            // Если пользователь уже существует, добавляем выигрыш к его сумме
            winners[user.username] += winAmount;
        } else {
            // Если пользователя нет, добавляем новую запись
            winners[user.username] = winAmount;
        }

        // Запись обновленного списка победителей в файл
        await writeData({ winners });
    }

    // Запись обновленного списка победителей в файл
    await writeData({ winners });
}



client.login(process.env.DISCORD_TOKEN); 
