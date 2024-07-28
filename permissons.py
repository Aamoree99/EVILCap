import discord

intents = discord.Intents.default()
intents.guilds = True
intents.guild_messages = True

bot = discord.Client(intents=intents)



# Айди категорий, которые нужно просмотреть
category_ids = [1212808485172154449, 1212506201376694342]

@bot.event
async def on_ready():
    print(f'Бот {bot.user} готов к работе!')
    with open('permissions_report.txt', 'w', encoding='utf-8') as file:
        for guild in bot.guilds:
            file.write(f'Сервер: {guild.name}\n\n')
            for category_id in category_ids:
                category = discord.utils.get(guild.categories, id=category_id)
                if category:
                    file.write(f'Категория: {category.name}\n')
                    for role in guild.roles:
                        # Получаем разрешения для роли в категории
                        overwrites = category.overwrites_for(role)
                        permissions = {
                            perm[0]: perm[1] for perm in overwrites if perm[1] is not None
                        }
                        if permissions:
                            file.write(f'  Роль: {role.name}\n')
                            for perm, value in permissions.items():
                                status = "Разрешено" if value else "Запрещено"
                                file.write(f'    {perm}: {status}\n')

                    for channel in category.channels:
                        file.write(f'  Канал: {channel.name}\n')
                        for role in guild.roles:
                            # Получаем разрешения для роли в канале
                            overwrites = channel.overwrites_for(role)
                            permissions = {
                                perm[0]: perm[1] for perm in overwrites if perm[1] is not None
                            }
                            if permissions:
                                file.write(f'    Роль: {role.name}\n')
                                for perm, value in permissions.items():
                                    status = "Разрешено" if value else "Запрещено"
                                    file.write(f'      {perm}: {status}\n')
                    file.write('\n')
    print('Отчет о разрешениях записан в permissions_report.txt')
    await bot.close()

bot.run(TOKEN)