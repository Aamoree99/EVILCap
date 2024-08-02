require('dotenv').config();
const connection = require('./db_connect');
const mysql = require('mysql2');
const path = require('path');
const { getMiningLedger, clearMiningCache, getCachedMiningData, insertMiningData } = require('./mining_ledgers');
const fs = require('fs').promises;
const { Client,
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType,  
    REST, 
    Routes, 
    StringSelectMenuBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    InteractionType } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

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
    new SlashCommandBuilder()
        .setName('ledger')
        .setDescription('Тест журнала добычи')  
        .addIntegerOption(option =>
            option.setName('percentage')
            .setDescription('Процент для Janice')  
            .setRequired(true)),
    new SlashCommandBuilder()
        .setName('moon_payout')
        .setDescription('Выплаты по луне')
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
    } else if (commandName === 'ledger') {
        await handleMiningLedger(interaction);
    } else if (commandName === 'moon_payout') {
        await handlePayouts(interaction);
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

                responseMessage = `${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay}:${minutesUntilNextEvenDay}.`;
            } else {
                if (nextEvenDay <= now || !isEvenDay) {
                    nextEvenDay.setUTCDate(nextEvenDay.getUTCDate() + (nextEvenDay.getUTCDate() % 2 === 0 ? 2 : 1));
                }
                const timeUntilNextEvenDay = nextEvenDay - now;
                const hoursUntilNextEvenDay = Math.floor(timeUntilNextEvenDay / (1000 * 60 * 60));
                const minutesUntilNextEvenDay = Math.floor((timeUntilNextEvenDay % (1000 * 60 * 60)) / (1000 * 60));

                responseMessage = `${interaction.user}, следующая луна будет через ${hoursUntilNextEvenDay}:${minutesUntilNextEvenDay}.`;
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

        const userId = interaction.user.id;
        const userMention = `<@${userId}>`;

        // Get and clean the user's nickname
        let userNickname = interaction.member.nickname || interaction.user.username;
        let cleanedNickname = userNickname.replace(/<[^>]*>/g, '').split('(')[0].trim();

        // Fetch alts from the database using the cleaned nickname
        const [alts] = await connection.promise().query(
            'SELECT alt_name FROM alts WHERE main_name = ?',
            [cleanedNickname]
        );

        if (alts.length === 0) {
            // If no alts, send a message directly using the cleaned nickname
            const embed = new EmbedBuilder()
                .setColor('#0099ff') // Blue color
                .setTitle('Флот на лед')
                .setDescription(`Система: ${name}\nОрка на: ${cleanedNickname}`)
                .setImage('https://wiki.eveuniversity.org/images/b/b1/Ice_glacial_mass.png')
                .setFooter({ text: `Флот создан ${userMention}` });

            const en_embed = new EmbedBuilder()
                .setColor('#0099ff') // Blue color
                .setTitle('Ice Fleet')
                .setDescription(`System: ${name}\nOrca on: ${cleanedNickname}`)
                .setImage('https://wiki.eveuniversity.org/images/b/b1/Ice_glacial_mass.png')
                .setFooter({ text: `Fleet created by ${userMention}` });

            const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
            const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

            if (channel && en_channel) {
                await channel.send({ content: `<@&1163379553348096070> ${userMention}`, embeds: [embed] });
                await en_channel.send({ content: `<@&1163379553348096070> ${userMention}`, embeds: [en_embed] });
                await interaction.reply({ content: "Сообщения отправлены.", ephemeral: true });
            } else {
                await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
            }
        } else {
            alts.push({ alt_name: cleanedNickname });
            const options = alts.map(alt => ({
                label: alt.alt_name,
                value: alt.alt_name,
            }));

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select-character')
                        .setPlaceholder('Выберите персонажа')
                        .addOptions(options)
                );

            await interaction.reply({
                content: 'Выберите персонажа для флота:',
                components: [row],
                ephemeral: true
            });

            const filter = i => i.customId === 'select-character' && i.user.id === userId;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.isSelectMenu()) {
                    const selectedCharacter = i.values[0];
                    
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff') // Blue color
                        .setTitle('Флот на лед')
                        .setDescription(`Система: ${name}\nОрка на: ${selectedCharacter}`)
                        .setImage('https://wiki.eveuniversity.org/images/b/b1/Ice_glacial_mass.png')
                        .setFooter({ text: `Флот создан ${userMention}` });

                    const en_embed = new EmbedBuilder()
                        .setColor('#0099ff') // Blue color
                        .setTitle('Ice Fleet')
                        .setDescription(`System: ${name}\nOrca on: ${selectedCharacter}`)
                        .setImage('https://wiki.eveuniversity.org/images/b/b1/Ice_glacial_mass.png')
                        .setFooter({ text: `Fleet created by ${userMention}` });

                    const channel = client.channels.cache.get(MAIN_CHANNEL_ID); 
                    const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID); 

                    if (channel && en_channel) {
                        await channel.send({ content: `<@&1163379553348096070> ${userMention}`, embeds: [embed] });
                        await en_channel.send({ content: `<@&1163379553348096070> ${userMention}`, embeds: [en_embed] });
                        await i.reply({ content: "Сообщение отправлено.", ephemeral: true });
                    } else {
                        await i.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
                    }
                }
            });
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

        const userId = interaction.user.id;
        const userMention = `<@${userId}>`;

        // Get and clean the user's nickname
        let userNickname = interaction.member.nickname || interaction.user.username;
        let cleanedNickname = userNickname.replace(/<[^>]*>/g, '').split('(')[0].trim();

        // Fetch alts from the database using the cleaned nickname
        const [alts] = await connection.promise().query(
            'SELECT alt_name FROM alts WHERE main_name = ?',
            [cleanedNickname]
        );

        if (alts.length === 0) {
            // If no alts, send a message directly using the cleaned nickname
            const embed = new EmbedBuilder()
                .setColor('#6A6A6A') // Blue color
                .setTitle('Флот на гравик')
                .setDescription(`Система: ${name}\nОрка на: ${cleanedNickname}`)
                .setImage('https://wiki.eveuniversity.org/images/0/06/Ore_ueganite.png')
                .setFooter({ text: `Флот создан ${userMention}` });

            const en_embed = new EmbedBuilder()
                .setColor('#6A6A6A') // Blue color
                .setTitle('Grav Fleet')
                .setDescription(`System: ${name}\nOrca on: ${cleanedNickname}`)
                .setImage('https://wiki.eveuniversity.org/images/0/06/Ore_ueganite.png')
                .setFooter({ text: `Fleet created by ${userMention}` });

            const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
            const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

            if (channel && en_channel) {
                await channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [embed] });
                await en_channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [en_embed] });
                await interaction.reply({ content: "Сообщения отправлены.", ephemeral: true });
            } else {
                await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
            }
        } else {
            alts.push({ alt_name: cleanedNickname });
            const options = alts.map(alt => ({
                label: alt.alt_name,
                value: alt.alt_name,
            }));

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select-character')
                        .setPlaceholder('Выберите персонажа')
                        .addOptions(options)
                );

            await interaction.reply({
                content: 'Выберите персонажа для флота:',
                components: [row],
                ephemeral: true
            });

            const filter = i => i.customId === 'select-character' && i.user.id === userId;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.isSelectMenu()) {
                    const selectedCharacter = i.values[0];

                    const embed = new EmbedBuilder()
                        .setColor('#6A6A6A') // Blue color
                        .setTitle('Флот на гравик')
                        .setDescription(`Система: ${name}\nОрка на: ${selectedCharacter}`)
                        .setImage('https://wiki.eveuniversity.org/images/0/06/Ore_ueganite.png')
                        .setFooter({ text: `Флот создан ${userMention}` });

                    const en_embed = new EmbedBuilder()
                        .setColor('#6A6A6A') // Blue color
                        .setTitle('Grav Fleet')
                        .setDescription(`System: ${name}\nOrca on: ${selectedCharacter}`)
                        .setImage('https://wiki.eveuniversity.org/images/0/06/Ore_ueganite.png')
                        .setFooter({ text: `Fleet created by ${userMention}` });

                    const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
                    const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

                    if (channel && en_channel) {
                        await channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [embed] });
                        await en_channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [en_embed] });
                        await i.reply({ content: "Сообщения отправлены.", ephemeral: true });
                    } else {
                        await i.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
                    }
                }
            });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}

async function handleEvgenCommand(interaction) {
    try {
        const allowedChannels = [MAIN_CHANNEL_ID, EN_MAIN_CHANNEL_ID];
        const currentChannelId = interaction.channel.id;
        const name = interaction.options.getString('name');

        if (!allowedChannels.includes(currentChannelId)) {
            await interaction.reply({ content: "Эту команду можно использовать только в определенных каналах.", ephemeral: true });
            return;
        }

        const userId = interaction.user.id;
        const userMention = `<@${userId}>`;

        // Get and clean the user's nickname
        let userNickname = interaction.member.nickname || interaction.user.username;
        let cleanedNickname = userNickname.replace(/<[^>]*>/g, '').split('(')[0].trim();

        // Fetch alts from the database using the cleaned nickname
        const [alts] = await connection.promise().query(
            'SELECT alt_name FROM alts WHERE main_name = ?',
            [cleanedNickname]
        );

        if (alts.length === 0) {
            // If no alts, use the main character's cleaned nickname directly
            const embed = new EmbedBuilder()
                .setColor('#FFD700') // Blue color
                .setTitle('Флот на белт')
                .setDescription(`Система: ${name}\nОрка на: ${cleanedNickname}\nВо имя <@350931081194897409>`)
                .setImage('https://wiki.eveuniversity.org/images/thumb/8/81/Asteroid-belt-ingame.jpg/500px-Asteroid-belt-ingame.jpg')
                .setFooter({ text: `Флот создан ${userMention}` });

            const en_embed = new EmbedBuilder()
                .setColor('#FFD700') // Blue color
                .setTitle('Fleet to the belt')
                .setDescription(`System: ${name}\nOrca on: ${cleanedNickname}\nIn the name of <@350931081194897409>`)
                .setImage('https://wiki.eveuniversity.org/images/thumb/8/81/Asteroid-belt-ingame.jpg/500px-Asteroid-belt-ingame.jpg')
                .setFooter({ text: `Fleet created by ${userMention}` });

            const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
            const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

            if (channel && en_channel) {
                await channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [embed] });
                await en_channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [en_embed] });
                await interaction.reply({ content: "Сообщения отправлены.", ephemeral: true });
            } else {
                await interaction.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
            }
        } else {
            const options = [{ label: cleanedNickname, value: cleanedNickname }];
            options.push(...alts.map(alt => ({
                label: alt.alt_name,
                value: alt.alt_name,
            })));

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select-character')
                        .setPlaceholder('Выберите персонажа')
                        .addOptions(options)
                );

            await interaction.reply({
                content: 'Выберите персонажа для флота:',
                components: [row],
                ephemeral: true
            });

            const filter = i => i.customId === 'select-character' && i.user.id === userId;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.isSelectMenu()) {
                    const selectedCharacter = i.values[0];

                    const embed = new EmbedBuilder()
                        .setColor('#FFD700') // Blue color
                        .setTitle('Флот на белт')
                        .setDescription(`Система: ${name}\nОрка на: ${selectedCharacter}\nВо имя <@350931081194897409>`)
                        .setImage('https://wiki.eveuniversity.org/images/thumb/8/81/Asteroid-belt-ingame.jpg/500px-Asteroid-belt-ingame.jpg')
                        .setFooter({ text: `Флот создан ${userMention}` });

                    const en_embed = new EmbedBuilder()
                        .setColor('#FFD700') // Blue color
                        .setTitle('Fleet to the belt')
                        .setDescription(`System: ${name}\nOrca on: ${selectedCharacter}\nIn the name of <@350931081194897409>`)
                        .setImage('https://wiki.eveuniversity.org/images/thumb/8/81/Asteroid-belt-ingame.jpg/500px-Asteroid-belt-ingame.jpg')
                        .setFooter({ text: `Fleet created by ${userMention}` });

                    const channel = client.channels.cache.get(MAIN_CHANNEL_ID);
                    const en_channel = client.channels.cache.get(EN_MAIN_CHANNEL_ID);

                    if (channel && en_channel) {
                        await channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [embed] });
                        await en_channel.send({ content: `<@&1163380100520214591> ${userMention}`, embeds: [en_embed] });
                        await i.reply({ content: "Сообщения отправлены.", ephemeral: true });
                    } else {
                        await i.reply({ content: "Один или оба канала не найдены.", ephemeral: true });
                    }
                }
            });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Произошла ошибка при отправке сообщения.", ephemeral: true });
    }
}

async function handleMiningLedger(interaction, initialPercentage = null) {
    try {
        const percentage = initialPercentage !== null ? initialPercentage : interaction.options.getInteger('percentage');

        if (isNaN(percentage)) {
            await interaction.reply('Please provide a valid percentage.');
            return;
        }

        // Отправляем кастомное сообщение
        await interaction.deferReply({ fetchReply: false });
        await interaction.editReply('Считаем камушки...');

        // Основной процесс обработки данных
        const janiceData = await getMiningLedger(percentage);
        const { janiceLink, totalBuyPrice, pilotsData } = janiceData;

        // Формируем ответ в виде таблицы
        let responseMessage = `**Janice Link:** [Click here](<${janiceLink}>)\n**Total Buy Price:** ${totalBuyPrice.toLocaleString()} ISK\n\n`;

        responseMessage += '**Pilots Data:**\n';
        responseMessage += `| Pilot | Janice Link | Total Buy Price |\n`;
        responseMessage += `|-------|-------------|-----------------|\n`;

        for (const [pilot, data] of Object.entries(pilotsData)) {
            responseMessage += `| **${pilot}** | [Click here](<${data.janiceLink}>) | ${data.totalBuyPrice.toLocaleString()} ISK |\n`;
        }

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept')
                    .setLabel('Устраивает')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('reject')
                    .setLabel('Не устраивает')
                    .setStyle(ButtonStyle.Danger),
            );

        await interaction.editReply({ content: responseMessage, components: [buttons] });

        const filter = i => ['accept', 'reject', 'cancel'].includes(i.customId) && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'accept') {
                const cachedData = getCachedMiningData(percentage);
                if (cachedData) {
                    await i.deferUpdate();
                    await insertMiningData(percentage);
                    await i.editReply({ content: 'Спасибо! Журнал выгружен.', components: [] });
                    clearMiningCache(percentage);
            
                    const channelRU = await i.client.channels.fetch(MAIN_CHANNEL_ID);
                    await channelRU.send('Здравствуйте! Последний журнал добычи успешно загружен на сайт. Вы молодцы, копатели! [Ссылка на журнал](<https://evil-capybara.space/logs>)');

                    const channelEN = await i.client.channels.fetch(EN_MAIN_CHANNEL_ID);
                    await channelEN.send('Hello! The latest mining log has been successfully uploaded to the site. Great job, miners! [Link to the log](<https://evil-capybara.space/logs>)');
                } else {
                    await i.update({ content: 'Ошибка: не удалось получить данные из кэша.', components: [] });
                }
            }   else if (i.customId === 'reject') {
                await i.deferUpdate();
                await i.editReply({ content: 'Пожалуйста, вызовите команду /ledger снова с новым процентом.', components: [] });
                clearMiningCache();
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: 'Время ожидания истекло.', components: [] });
            }
        });
    } catch (error) {
        console.error('An error occurred while processing the request:', error);
        await interaction.editReply('An error occurred while processing your request.');
    }
}

async function handlePayouts(interaction) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('specific')
                .setLabel('Конкретным')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('all')
                .setLabel('Всем')
                .setStyle(ButtonStyle.Danger),
        );

    await interaction.reply({ content: 'Кому вы хотите подтвердить выплаты?', components: [row] });

    const filter = i => i.customId === 'specific' || i.customId === 'all';
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'all') {
            const query = 'UPDATE mining_data SET status = "Paid" WHERE status = "Pending"';
            connection.query(query, (error, results) => {
                if (error) {
                    console.error(error);
                    return i.update({ content: 'Произошла ошибка при подтверждении выплат.'});
                }
                i.update({ content: 'Все выплаты подтверждены.', components: []});
            });
        } else if (i.customId === 'specific') {
            const selectQuery = 'SELECT id, pilot_name, payout FROM mining_data WHERE status = "Pending"';
            connection.query(selectQuery, (error, rows) => {
                if (error) {
                    console.error(error);
                    return i.update({ content: 'Произошла ошибка при получении данных.', components: [] });
                }
                const options = rows.map(row => ({
                    label: `${row.pilot_name} - ${row.payout}`,
                    value: row.id.toString()
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Выберите пилотов для выплаты')
                    .addOptions(options)
                    .setMaxValues(options.length); // Позволяет выбирать несколько значений

                const selectRow = new ActionRowBuilder()
                    .addComponents(selectMenu);

                i.update({ content: 'Выберите пилотов для выплаты:', components: [selectRow] });

                const selectFilter = i => i.customId === 'select';
                const selectCollector = interaction.channel.createMessageComponentCollector({ selectFilter, time: 60000 });

                selectCollector.on('collect', async selectInteraction => {
                    const selectedIds = selectInteraction.values;
                    const updateQuery = 'UPDATE mining_data SET status = "Paid" WHERE id IN (?)';
                    connection.query(updateQuery, [selectedIds], (error, results) => {
                        if (error) {
                            console.error(error);
                            return selectInteraction.update({ content: 'Произошла ошибка при подтверждении выплат.', components: [] });
                        }
                        selectInteraction.update({ content: 'Выплаты подтверждены.', components: [] });
                    });
                });
            });
        }
    });
}

client.login(process.env.DISCORD_MINER_BOT_TOKEN);
