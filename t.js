const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const speechFile = path.resolve('./speech.mp3');

async function main() {
  try {
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: `Добро пожаловать на Evil-Capybara!

Ищете надежный способ обменять LP на ISK? Мы представляем вам идеальное решение! На Evil-Capybara ваш обмен LP на ISK станет быстрым и удобным. Получите лучшие курсы и мгновенные транзакции на нашем сайте.

Поддержите наш Альянс!

Каждое ваше пожертвование на Aamoree способствует развитию информационной инфраструктуры нашего Альянса. Внесите свой вклад в наше будущее, и вместе мы достигнем новых высот!

Переходите на новый уровень с нашим журналом добычи!

Забудьте о старом Excel. На Evil-Capybara вы найдете журнал добычи, который работает быстрее, лучше и удобнее. Все данные под рукой, никаких задержек — только эффективная работа.

Олег, не бойся!

Мы готовы помочь вам во всем. С Evil-Capybara ваши операции будут легче и успешнее.

Посетите нас на Evil-Capybara и убедитесь сами!`,
    });
    
    console.log(speechFile);
    
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
