document.addEventListener('DOMContentLoaded', function () {
    const translations = {
        1: {
            en: { title: "EVIL Capybara Incorporated", text: "EVIL Capybara Incorporated – a haven of peace in hisec space. Our multinational alliance is dedicated to industry, research, and mining under the banner of pacifism. Join us to work in a stable, supportive environment where peace is not just a word, but the foundation of prosperity." },
            ru: { title: "EVIL Capybara Incorporated", text: "EVIL Capybara Incorporated – мирное прибежище в безопасном космосе. Наш альянс, объединяющий многие нации, посвящен развитию промышленности, исследованию и добыче с соблюдением принципов пацифизма. Присоединяйтесь к нам, чтобы работать в стабильной, поддерживающей среде, где мир – это не просто слово, а фундамент для процветания." }           
        },
        2: {
            en: { title: "Black List Corporation", text: "Black List Corporation specializes in mineral and ice mining, with a strong emphasis on logistics. We invite you to join our team of professionals and harness the latest technologies to maximize your potential. Our corporation is your chance to be part of a large-scale project with global ambitions." },
            ru: { title: "Black List Corporation", text: "Black List Corporation специализируется на добыче ископаемых и логистике, особенно ценится наш уникальный подход к добыче льда. Мы предлагаем вам присоединиться к нашей команде профессионалов и использовать последние технологии для максимизации вашего потенциала. Наша корпорация – ваш шанс стать частью крупного проекта с глобальными амбициями." }
        },
        3: {
            en: { title: "God’s Forge", text: "God’s Forge is an English-speaking powerhouse in manufacturing. We engage not only in production but also in blueprint research and occasional mining. Our experts work on designing and improving blueprints, allowing us to bring innovative projects to life. Join us to build the future together." },
            ru: { title: "God’s Forge", text: "God’s Forge – это англоязычная производственная мощь. Мы занимаемся не только производством, но и исследованием, а также добычей. Наши специалисты работают над созданием и улучшением чертежей, что позволяет нам воплощать в жизнь инновационные проекты. Присоединяйтесь к нам, чтобы вместе строить будущее." }
        },
        4: {
            en: { title: "Pirate Snitch My Venture", text: "Pirate Snitch My Venture specializes in moon mining in hisec areas. Our goal is to efficiently utilize natural resources while maintaining operational safety and stability. We offer you the chance to be part of a team that embraces challenges and is always eager to evolve." },
            ru: { title: "Pirate Snitch My Venture", text: "Pirate Snitch My Venture осуществляет специализированную добычу лун в хайсек зонах. Наша цель – максимально эффективно использовать природные ресурсы, сохраняя при этом безопасность и стабильность операций. Мы предлагаем вам стать частью команды, которая не боится вызовов и всегда готова к развитию." }
        },
        5: {
            en: { title: "The Necro Order", text: "The Necro Order is the PVP wing of our alliance, specializing in faction warfare and PVP in lowsec. If you crave adrenaline and want to test your skills in real combat, this is the place for you. We promise not just battles, but support, training, and the chance to be part of a hardened brotherhood of warriors." },
            ru: { title: "The Necro Order", text: "The Necro Order представляет собой PVP-крыло нашего альянса, специализирующееся на фракционных войнах и боевых действиях в лолусек зонах. Если вы ищете адреналин и желаете проверить свои навыки в настоящих баталиях, то вам к нам. Мы обещаем не только бои, но и поддержку, обучение и возможность стать частью закалённой боевой братии." }
        },
        6: {
            en: { title: "Nova Labs", text: "Nova Labs is a European corporation focused on industry and manufacturing, with opportunities in mining. We offer state-of-the-art equipment and the chance to work in an international team of experts. Our approach to innovation allows every team member to contribute to our collective success and fulfill personal ambitions." },
            ru: { title: "Nova Labs", text: "Nova Labs – это европейская корпорация, занимающаяся промышленностью и производством, с возможностями для добычи. Мы предлагаем современное оборудование и возможность работать в международной команде экспертов. Наш подход к инновациям позволяет каждому члену команды вносить вклад в общее дело и реализовывать личные амбиции." }
        },
        7: {
            en: {
                title: "Join Our Ranks Today!",
                text: `You've decided to join us — excellent choice! In-game, reach out to <span class="contact-name">DonaldKrak</span> to get started or click the button below to join our Discord and become part of our thriving community. We're excited to welcome you aboard and start our journey together. Let’s achieve greatness!`
            },
            ru: {
                title: "Присоединяйтесь к Нам Сегодня!",
                text: `Вы решили присоединиться к нам — отличный выбор! В игре обращайтесь к <span class="contact-name">DonaldKrak</span>, чтобы начать, или нажмите кнопку ниже, чтобы присоединиться к нашему Discord и стать частью нашего процветающего сообщества. Мы рады приветствовать вас в наших рядах и начать совместное путешествие. Давайте достигнем великолепия вместе!`
            }            
        }            
    };

    function copyName(detectedLang) {
        const contactName = document.querySelector('.contact-name');
        contactName.addEventListener('click', function () {
            const name = this.textContent.trim();
            navigator.clipboard.writeText(name);
            const lang = detectedLang;
            let message;
            if (lang === 'ru') {
                message = `Имя "${name}" скопировано в буфер обмена!`;
            } else {
                message = `Name "${name}" copied to clipboard!`;
            }
            showMessage(message);
        });
    }

    function showMessage(message) {
        const messageElement = document.getElementById("message");
        messageElement.textContent = message;
        messageElement.style.display = "block";
        setTimeout(() => {
            messageElement.style.display = "none";
        }, 3000);
    }

    function detectLanguage() {
        const lang = navigator.language;
        const detectedLang = /ru|uk|kk/.test(lang) ? 'ru' : 'en';
        const detectedButton = document.querySelector(`.language-switch button[data-lang="${detectedLang}"]`);
        if (detectedButton) {
            detectedButton.classList.add('active');
        }
        return detectedLang;
    }

    function applyTranslations(lang) {
        document.querySelectorAll('.slide').forEach((slide, index) => {
            const data = translations[index + 1][lang];
            slide.querySelector('.slide-content h1').innerHTML = data.title;
            slide.querySelector('.slide-content p').innerHTML = data.text;
        });
    }

    function setCurrentSlide(n) {
        document.querySelectorAll('.slide').forEach((slide) => {
            slide.classList.remove('active');
        });
        document.querySelectorAll('.dot').forEach((dot) => {
            dot.classList.remove('active');
        });
        document.querySelector('.slide:nth-child(' + n + ')').classList.add('active');
        document.querySelector('.dot:nth-child(' + n + ')').classList.add('active');
    }

    const languageSwitchButtons = document.querySelectorAll('.language-switch button');

    languageSwitchButtons.forEach(button => {
        button.addEventListener('click', function () {
            languageSwitchButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            applyTranslations(this.dataset.lang);
        });
    });

    let touchStartY, touchEndY;

    document.querySelector('.slider').addEventListener('touchstart', function (event) {
        touchStartY = event.touches[0].clientY;
    });

    document.querySelector('.slider').addEventListener('touchend', function (event) {
        touchEndY = event.changedTouches[0].clientY;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const swipeDistance = touchEndY - touchStartY;
        if (Math.abs(swipeDistance) > swipeThreshold) {
            if (swipeDistance > 0 && currentSlide > 1) {
                currentSlide--;
            } else if (swipeDistance < 0 && currentSlide < maxSlides) {
                currentSlide++;
            }
            setCurrentSlide(currentSlide);
        }
    }

    let currentSlide = 1;
    let maxSlides = document.querySelectorAll('.slide').length;
    let interval = setInterval(() => {
        if (currentSlide <= maxSlides) {
            setCurrentSlide(currentSlide);
            currentSlide++;
        } else {
            clearInterval(interval);
        }
    }, 6000);

    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.addEventListener('click', function () {
            setCurrentSlide(index + 1);
        });
    });

    applyTranslations(detectLanguage());
    copyName(detectLanguage());
});