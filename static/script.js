document.addEventListener('DOMContentLoaded', function () {
    const translations = {
        1: {
            en: { title: "EVIL Capybara Incorporated", text: "EVIL Capybara Incorporated – a haven of peace in hisec space. Our multinational alliance is dedicated to industry, research, and mining under the banner of pacifism. Join us to work in a stable, supportive environment where peace is not just a word, but the foundation of prosperity." },
            ru: { title: "EVIL Capybara Incorporated", text: "EVIL Capybara Incorporated – мирное прибежище в безопасном космосе. Наш альянс, объединяющий многие нации, посвящен развитию промышленности, исследованию и добыче с соблюдением принципов пацифизма. Присоединяйтесь к нам, чтобы работать в стабильной, поддерживающей среде, где мир – это не просто слово, а фундамент для процветания." }           
        },
        6: {
            en: { title: "Black List Corporation", text: "Black List Corporation specializes in mineral and ice mining, with a strong emphasis on logistics. We invite you to join our team of professionals and harness the latest technologies to maximize your potential. Our corporation is your chance to be part of a large-scale project with global ambitions." },
            ru: { title: "Black List Corporation", text: "Black List Corporation специализируется на добыче ископаемых и логистике, особенно ценится наш уникальный подход к добыче льда. Мы предлагаем вам присоединиться к нашей команде профессионалов и использовать последние технологии для максимизации вашего потенциала. Наша корпорация – ваш шанс стать частью крупного проекта с глобальными амбициями." }
        },
        7: {
            en: { title: "God’s Forge", text: "God’s Forge is an English-speaking powerhouse in manufacturing. We engage not only in production but also in blueprint research and occasional mining. Our experts work on designing and improving blueprints, allowing us to bring innovative projects to life. Join us to build the future together." },
            ru: { title: "God’s Forge", text: "God’s Forge – это англоязычная производственная мощь. Мы занимаемся не только производством, но и исследованием, а также добычей. Наши специалисты работают над созданием и улучшением чертежей, что позволяет нам воплощать в жизнь инновационные проекты. Присоединяйтесь к нам, чтобы вместе строить будущее." }
        },
        4: {
            en: { title: "Pirate Snitch My Venture", text: "Pirate Snitch My Venture specializes in moon mining in hisec areas. Our goal is to efficiently utilize natural resources while maintaining operational safety and stability. We offer you the chance to be part of a team that embraces challenges and is always eager to evolve." },
            ru: { title: "Pirate Snitch My Venture", text: "Pirate Snitch My Venture осуществляет специализированную добычу лун в хайсек зонах. Наша цель – максимально эффективно использовать природные ресурсы, сохраняя при этом безопасность и стабильность операций. Мы предлагаем вам стать частью команды, которая не боится вызовов и всегда готова к развитию." }
        },
        5: {
            en: { title: "Nova Labs", text: "Nova Labs is a US corporation focused on industry and manufacturing, with opportunities in mining. We offer state-of-the-art equipment and the chance to work in an international team of experts. Our approach to innovation allows every team member to contribute to our collective success and fulfill personal ambitions." },
            ru: { title: "Nova Labs", text: "Nova Labs – это американская корпорация, занимающаяся промышленностью и производством, с возможностями для добычи. Мы предлагаем современное оборудование и возможность работать в международной команде экспертов. Наш подход к инновациям позволяет каждому члену команды вносить вклад в общее дело и реализовывать личные амбиции." }
        },
        2: {
            ru: { title: "Cosmic Capybara Crew" , text: 'Cosmic Capybara Crew – ваш путь к приключениям в космосе. Наша корпорация предлагает обширные возможности для PVE миссий и майнинга, приветствуя новичков и опытных пилотов. Присоединяйтесь к нашему дружелюбному коллективу, где каждый член вносит свой вклад в общее дело. За дополнительной информацией обращайтесь к <span class="contact-name">Aamoree</span>.' },
            en: { title: "Cosmic Capybara Crew" , text: 'Cosmic Capybara Crew – your gateway to space adventures. Our corporation offers extensive opportunities for PVE missions and mining, welcoming both newcomers and experienced pilots. Join our friendly collective where everyone contributes to our common goals. For further information, feel free to reach out to <span class="contact-name">Aamoree</span>.' }
        },
        3: {
            ru: { title: "Yellow Foxes" , text: 'Присоединяйтесь к "Yellow Foxes" и отправляйтесь к звёздам! Мы активное сообщество, специализирующееся на заработке внушительных сумм ISK в EVE, предлагая поддержку и множество возможностей для наших членов. Погрузитесь в безопасную среду с профессиональной поддержкой, где каждый пилот ценится, и успех всегда под рукой.' },
            en: { title: "Yellow Foxes" , text: 'Join the "Yellow Foxes" and soar to the stars! We are a vibrant community focused on earning substantial ISK in EVE, offering both support and vast opportunities to our members. Dive into a secure environment with expert guidance, where every pilot is valued and success is within reach.' }
        },
        8: {
            ru: { title: "Everybody Loves Pizza", text: "Это корпорация, занимающаяся изучением и освоением космоса. Мы неспешно пролетаем мимо маленьких камушков и огромных астероидов размером с баржу, собирая яркие облака газа в трюм осторожного пилота. Наша миссия — создавать ламповую атмосферу и не терпеть тех, кто ее нарушает. Мы приглашаем тех, кто также любит перелопатить пару белтов или высосать облако газа перед сном." },
            en: { title: "Everybody Loves Pizza", text: "This is a corporation focused on the exploration and utilization of space. We leisurely pass by small rocks and massive asteroids the size of barges, collecting bright clouds of gas into the cargo hold of a cautious pilot. Our mission is to create a warm and friendly atmosphere and not tolerate those who disrupt it. We welcome those who also enjoy mining a few belts or harvesting a cloud of gas before bed." }
        },
        9: {
            en: {
                title: "Join Our Ranks Today!",
                text: `You've decided to join us — excellent choice! In-game, reach out to <span class="contact-name">DonaldKrak</span> to get started or click the button below to join our Discord and become part of our thriving community. We're excited to welcome you aboard and start our journey together. Let’s achieve greatness!`,
                note: `Please enter your nickname in the format "EVE nickname (real name)" and specify your corporation upon joining the server.`
            },
            ru: {
                title: "Присоединяйтесь к Нам Сегодня!",
                text: `Вы решили присоединиться к нам — отличный выбор! В игре обращайтесь к <span class="contact-name">DonaldKrak</span>, чтобы начать, или нажмите кнопку ниже, чтобы присоединиться к нашему Discord и стать частью нашего процветающего сообщества. Мы рады приветствовать вас в наших рядах и начать совместное путешествие. Давайте достигнем великолепия вместе!`,
                note: `Введите ваш ник в формате "ник EVE (реальное имя)" и укажите корпорацию при присоединении к серверу.`
            }            
        },
        header: {
            en: { officers: "Officers", zkillboard: "ZKillBoard", hf_waitlist: "Homefronts", lp_store: "LP Store", crabs: "CRAB Tracker" },
            ru: { officers: "Офицеры", zkillboard: "Киллборда", hf_waitlist: "Тыловые районы", lp_store: "LP Store", crabs: "CRAB Tracker" }
        }            
    };

    function detectLanguage() {
        const userLang = navigator.language || navigator.userLanguage;
        const lang = ['ru', 'uk', 'be', 'kk'].some(code => userLang.includes(code)) ? 'ru' : 'en';
        return lang;
    }

    function applyTranslations(lang) {
        document.querySelectorAll('.slide').forEach((slide, index) => {
            const data = translations[index + 1][lang];
            slide.querySelector('.slide-content h1').innerHTML = data.title;
            slide.querySelector('.slide-content p').innerHTML = data.text;
            if (data.note) {
                const noteElement = slide.querySelector('.slide-content small');
                if (noteElement) {
                    noteElement.innerHTML = data.note;
                }
            }
        });

        const headerLinks = document.querySelectorAll('.header-links a');
        const headerTranslations = translations.header[lang];
        headerLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === '/officers') {
                link.innerHTML = headerTranslations.officers;
            } else if (href.includes('zkillboard')) {
                link.innerHTML = headerTranslations.zkillboard;
            } else if (href.includes('/hf_waitlist')) {
                link.innerHTML = headerTranslations.hf_waitlist;
            } else if (href.includes('/lp/lp_calc')) {
                link.innerHTML = headerTranslations.lp_store;
            } else if (href.includes('/crabs')) {
                link.innerHTML = headerTranslations.crabs;
            }
        });

        // Сдвиг переключателя
        const switchSlider = document.querySelector('.switch-slider');
        if (lang === 'ru') {
            switchSlider.style.left = '50%';
        } else {
            switchSlider.style.left = '0';
        }
    }

    function copyName(detectedLang) {
        const contactName = document.querySelector('.contact-name');
        contactName.addEventListener('click', function() {
            const name = this.textContent.trim();
            navigator.clipboard.writeText(name);
            let message = detectedLang === 'ru' ? `Имя "${name}" скопировано в буфер обмена!` : `Name "${name}" copied to clipboard!`;
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

    let userScrolling = false;
    let currentSlide = 1;
    let maxSlides = document.querySelectorAll('.slide').length;
    let lastScrollTime = 0;

    function stopAutoScroll() {
        userScrolling = true;
        clearInterval(interval);
        removeZoomEffect();
    }

    function setCurrentSlide(n) {
        document.querySelectorAll('.slide').forEach(slide => {
            slide.classList.remove('active');
            slide.querySelector('.background-image').classList.remove('zoom-effect');
        });
        document.querySelectorAll('.dot').forEach(dot => dot.classList.remove('active'));
        const activeSlide = document.querySelector('.slide:nth-child(' + n + ')');
        activeSlide.classList.add('active');
        activeSlide.querySelector('.background-image').classList.add('zoom-effect');
        document.querySelector('.dot:nth-child(' + n + ')').classList.add('active');
    }

    const languageSwitchButtons = document.querySelectorAll('.lang-button');

    languageSwitchButtons.forEach(button => {
        button.addEventListener('click', function () {
            languageSwitchButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            applyTranslations(this.dataset.lang);
        });
    });

    let interval = setInterval(() => {
        if (!userScrolling) {
            currentSlide = (currentSlide % maxSlides) + 1;
            setCurrentSlide(currentSlide);
            applyZoomEffect();
        } else {
            removeZoomEffect();
        }
    }, 10000);

    function applyZoomEffect() {
        const activeSlide = document.querySelector('.slide.active');
        if (activeSlide) {
            activeSlide.classList.add('zoom-effect');
        }
    }
    
    function removeZoomEffect() {
        const activeSlide = document.querySelector('.slide.active');
        if (activeSlide) {
            activeSlide.classList.remove('zoom-effect');
        }
    }

    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    }

    const handleScroll = debounce(function(event) {
        stopAutoScroll();
        if (event.deltaY < 0 && currentSlide > 1) {
            currentSlide--;
        } else if (event.deltaY > 0 && currentSlide < maxSlides) {
            currentSlide++;
        }
        setCurrentSlide(currentSlide);
    }, 250, true);
    
    document.querySelector('.slider').addEventListener('wheel', handleScroll);
     
    document.querySelector('.slider').addEventListener('touchstart', event => {
        touchStart = event.touches[0].clientY;
    }, false);
    
    document.querySelector('.slider').addEventListener('touchend', event => {
        let touchEnd = event.changedTouches[0].clientY;
        stopAutoScroll();
        if (Math.abs(touchEnd - touchStart) > 10) {
            if (touchEnd > touchStart && currentSlide > 1) {
                currentSlide--;
            } else if (touchEnd < touchStart && currentSlide < maxSlides) {
                currentSlide++;
            }
            setCurrentSlide(currentSlide);
        }
    }, false);
    
    document.querySelector('.slider').addEventListener('scroll', () => {
        stopAutoScroll();
    });

    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.addEventListener('click', () => {
            setCurrentSlide(index + 1);
            stopAutoScroll();
        });
    });

    const detectedLang = detectLanguage();
    applyTranslations(detectedLang);
    setCurrentSlide(1);
    copyName(detectedLang);
});