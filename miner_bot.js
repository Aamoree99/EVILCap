require('dotenv').config();
const connection = require('./db_connect');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs').promises;
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Events,  REST, Routes } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const GUILD_ID = '1159107187407335434';
const MAIN_CHANNEL_ID = '1172972375688626276';
const EN_MAIN_CHANNEL_ID = '1212507080934686740';
const LOG_CHANNEL_ID = '1239085828395892796'; 
const DATA_FILE = path.join(__dirname, 'complianceData.json'); 


const commands = [
    new SlashCommandBuilder()
        .setName('moon')
        .setDescription('Создать уведомление о луне.'),
    new SlashCommandBuilder()
        .setName('ice')
        .setDescription('Создает уведомление о льде.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Название системы')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('grav')
        .setDescription('Создает уведомление о гравитации.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Название системы')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('evgen')
        .setDescription('Создать уведомление о белте во имя Евгения.')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Название системы')
                .setRequired(true)),
];

// Регистрация команд при запуске бота
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_MINER_BOT_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands },
        );
        client.user.setPresence({
            activities: [{ name: 'Копает велдспар', type: ActivityType.Custom }],
            status: 'online',
        });
        await notifyDatabaseConnection();
        const channel = client.channels.cache.get('1239085828395892796');
        if (channel) {
            channel.send('Шахтер прибыл на работу, <@235822777678954496>.');
        } else {
            console.error('Channel not found.');
        }
    } catch (error) {
        console.error(error);
    }
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

async function readFromJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading from JSON file:', error);
        return null;
    }
}
// Обработка команд
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'moon') {
        await handleMoonCommand(interaction);
    } else if (commandName === 'ice') {
        await handleIceCommand(interaction);
    } else if (commandName === 'grav') {
        await handleGravCommand(interaction);
    } else if (commandName === 'evgen') {
        await handleEvgenCommand(interaction);
    }
});

async function handleMoonCommand(interaction) {
    try {
        const data = await readFromJSON(DATA_FILE);
        const ignoreList = data.ignoreList || [];
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        const currentChannelId = interaction.channel.id;
        const authorUsername = interaction.user.username;

        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        let responseMessage = '';

        if (ignoreList.includes(authorUsername)) {
            const baseMessage = "<@&1163380015191302214>";
            const en_baseMessage = "<@&1163380015191302214>";
            const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
            const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

            if (channel && en_channel) {
                const todayDate = new Date().getDate();
                const stationName = `**Pashanai - Ore ${Math.floor(todayDate / 2)}**`;

                const embedRU = new EmbedBuilder()
                    .setTitle("*Лунные продукты готовы к сбору.*")
                    .addFields(
                        { name: "Система", value: "[**Pashanai**](https://evemaps.dotlan.net/system/Pashanai)", inline: true },
                        { name: "Станция", value: stationName, inline: true }
                    )
                    .setColor("#A52A2A")
                    .setImage("https://wiki.eveuniversity.org/images/1/10/Athanor.jpg");

                const embedEN = new EmbedBuilder()
                    .setTitle("*The moon products are ready to be harvested.*")
                    .addFields(
                        { name: "System", value: "[**Pashanai**](https://evemaps.dotlan.net/system/Pashanai)", inline: true },
                        { name: "Station", value: stationName, inline: true }
                    )
                    .setColor("#A52A2A")
                    .setImage("https://wiki.eveuniversity.org/images/1/10/Athanor.jpg");

                await channel.send({ content: baseMessage, embeds: [embedRU] });
                await en_channel.send({ content: en_baseMessage, embeds: [embedEN] });

                responseMessage = "Сообщение отправлено.";
            } else {
                responseMessage = "Канал не найден.";
            }
        } else {
            const now = new Date();
            const currentHourUTC = now.getUTCHours();
            const currentMinuteUTC = now.getUTCMinutes();
            let nextEvenDay = new Date(now);
            nextEvenDay.setUTCHours(11, 15, 0, 0);

            const isEvenDay = nextEvenDay.getUTCDate() % 2 === 0;

            if (isEvenDay && (currentHourUTC < 11 || (currentHourUTC === 11 && currentMinuteUTC < 15))) {
                const timeUntilNextEvenDay = nextEvenDay - now;
                const hoursUntilNextEvenDay = Math.floor(timeUntilNextEvenDay / (1000 * 60 * 60));
                const minutesUntilNextEvenDay = Math.floor((timeUntilNextEvenDay % (1000 * 60 * 60)) / (1000 * 60));

                responseMessage = `${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay} часов и ${minutesUntilNextEvenDay} минут.`;
            } else {
                if (nextEvenDay <= now || !isEvenDay) {
                    nextEvenDay.setUTCDate(nextEvenDay.getUTCDate() + (nextEvenDay.getUTCDate() % 2 === 0 ? 2 : 1));
                }
                const timeUntilNextEvenDay = nextEvenDay - now;
                const hoursUntilNextEvenDay = Math.floor(timeUntilNextEvenDay / (1000 * 60 * 60));
                const minutesUntilNextEvenDay = Math.floor((timeUntilNextEvenDay % (1000 * 60 * 60)) / (1000 * 60));

                responseMessage = `${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay} часов и ${minutesUntilNextEvenDay} минут.`;
            }
        }

        await interaction.reply({ content: responseMessage, ephemeral: true });
    } catch (error) {
        console.error("Error in moon function:", error);
        await interaction.reply({ content: 'Произошла ошибка при выполнении команды.', ephemeral: true });
    }
}

async function handleIceCommand(interaction) {
    try {
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        const currentChannelId = interaction.channel.id;
        const name = interaction.options.getString('name');

        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        const userMention = `<@${interaction.user.id}>`;
        const phrases = [
            "Давайте наберем побольше льда!",
            "Не упустим возможность пополнить запасы!",
            "Пора пополнить наши склады льдом!",
            "Время действовать и собирать лед!"
        ];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        const baseMessage = `<@&1163379553348096070> Орка выставлена и флот открыт в системе ${name}! ${randomPhrase} Флот создан господином ${userMention}`; 
        const channel = client.channels.cache.get(MAIN_CHANNEL_ID); 

        const en_phrases = [
            "Let's gather as much ice as we can!",
            "Don't miss the chance to stock up!",
            "Time to fill our warehouses with ice!",
            "Time to act and collect ice!"
        ];
        const en_randomPhrase = en_phrases[Math.floor(Math.random() * en_phrases.length)];
        const en_baseMessage = `<@&1163379553348096070> The Orca for ice is deployed and the fleet is open in the ${name} system! ${en_randomPhrase} Fleet created by the master ${userMention}`; 
        const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID); 

        if (channel && en_channel) {
            await channel.send(baseMessage);
            await en_channel.send(en_baseMessage);
            await interaction.reply({ content: "Сообщение отправлено.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}

async function handleGravCommand(interaction) {
    try {
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        const currentChannelId = interaction.channel.id;
        const name = interaction.options.getString('name');
        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        const userMention = `<@${interaction.user.id}>`;
        const baseMessage = `<@&1163380100520214591> в системе ${name}. Флот создан и открыт господином ${userMention}. Орка с прессом выставлена.`; 
        const channel = client.channels.cache.get(MAIN_CHANNEL_ID); 
        const en_baseMessage = `<@&1163380100520214591> in the ${name} system. The fleet for Grav is created and open by the master ${userMention}. The Orca with a press is deployed.`; 
        const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID); 

        if (channel && en_channel) {
            await channel.send(baseMessage);
            await en_channel.send(en_baseMessage);
            await interaction.reply({ content: "Сообщение отправлено.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}

async function handleEvgenCommand(interaction) {
    try {
        const currentChannelId = interaction.channel.id;
        const name = interaction.options.getString('name');
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        const userMention = `<@${interaction.user.id}>`;
        const baseMessage = `Флот отправляется на белт в системе ${name} господином ${userMention}! Во имя <@350931081194897409>`;
        const en_baseMessage = `Fleet is heading to the belt in the ${name} system by the master ${userMention}! In the name of <@350931081194897409>`;

        const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
        const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

        if (channel && en_channel) {
            await channel.send(baseMessage);
            await en_channel.send(en_baseMessage);
            await interaction.reply({ content: "Сообщения отправлены.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}

client.login(process.env.DISCORD_MINER_BOT_TOKEN);
