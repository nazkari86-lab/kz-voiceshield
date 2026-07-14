export type TrainingChoice = {
  id: string
  text: string
  safe: boolean
  feedback: string
}

export type TrainingStep = {
  caller: string
  pattern: string
  choices: TrainingChoice[]
}

export type TrainingScenario = {
  id: string
  title: string
  language: 'RU' | 'KZ'
  difficulty: 'Beginner' | 'Advanced'
  skill?: TrainingSkill
  steps: TrainingStep[]
}

export type TrainingSkill = 'banking' | 'links' | 'remote_access' | 'identity' | 'payments' | 'investments' | 'jobs' | 'marketplace'

const coreTrainingScenarios: TrainingScenario[] = [
  {
    id: 'bank-code-ru',
    title: 'Fake bank security call',
    language: 'RU',
    difficulty: 'Beginner',
    steps: [
      {
        caller: 'Служба безопасности банка. На ваше имя оформляют кредит. Нужно срочно отменить операцию.',
        pattern: 'Authority impersonation plus urgency',
        choices: [
          { id: 'hang-up', text: 'Завершить звонок и самостоятельно позвонить в банк', safe: true, feedback: 'Правильно: официальный обратный звонок разрушает сценарий подмены номера.' },
          { id: 'continue', text: 'Попросить сотрудника объяснить подробнее', safe: false, feedback: 'Опасно: продолжение разговора даёт мошеннику время усилить давление.' },
        ],
      },
      {
        caller: 'Для отмены назовите код из SMS. Его нельзя сообщать даже сотруднику отделения.',
        pattern: 'Secret-code extraction',
        choices: [
          { id: 'refuse-code', text: 'Не сообщать код и завершить звонок', safe: true, feedback: 'Правильно: банк никогда не запрашивает одноразовый код по входящему звонку.' },
          { id: 'read-code', text: 'Назвать код, чтобы отменить кредит', safe: false, feedback: 'Критическая ошибка: код может подтвердить перевод, вход или кредитную операцию.' },
        ],
      },
    ],
  },
  {
    id: 'relative-kz',
    title: 'Relative in trouble',
    language: 'KZ',
    difficulty: 'Advanced',
    steps: [
      {
        caller: 'Апа, мен қиын жағдайға түстім. Қазір ақша жіберу керек, ешкімге айтпаңыз.',
        pattern: 'Family impersonation, secrecy and urgency',
        choices: [
          { id: 'family-word', text: 'Отбасылық құпия сөзді сұрап, өз нөміріне қайта қоңырау шалу', safe: true, feedback: 'Дұрыс: басқа арнамен және құпия сөзбен тексеру дауысты қолдан жасаудан қорғайды.' },
          { id: 'ask-amount', text: 'Қанша ақша керек екенін сұрау', safe: false, feedback: 'Қауіпті: ақша сомасын талқылау қоңырау шалушының шын екенін дәлелдемейді.' },
        ],
      },
      {
        caller: 'Телефоным өшіп қалады. Мына картаға дәл қазір аударыңыз.',
        pattern: 'Third-party payment destination',
        choices: [
          { id: 'trusted-call', text: 'Ақша аудармай, сенімді туысқа қоңырау шалу', safe: true, feedback: 'Дұрыс: тәуелсіз тексеру қысымға негізделген сценарийді тоқтатады.' },
          { id: 'transfer', text: 'Аз мөлшерде ақша аударып көру', safe: false, feedback: 'Қате: аз аударым да картаны растап, кейінгі қысымға жол ашады.' },
        ],
      },
    ],
  },
  {
    id: 'delivery-link-ru',
    title: 'Delivery fee link',
    language: 'RU',
    difficulty: 'Beginner',
    steps: [
      {
        caller: 'Ваша посылка задержана. Оплатите 490 тенге по ссылке в SMS в течение десяти минут.',
        pattern: 'Small-fee lure and external link',
        choices: [
          { id: 'official-order', text: 'Проверить заказ только в официальном приложении доставки', safe: true, feedback: 'Верно: не открывайте ссылку из неожиданного сообщения.' },
          { id: 'open-link', text: 'Открыть ссылку и быстро оплатить небольшую сумму', safe: false, feedback: 'Опасно: малая сумма часто используется для кражи данных карты.' },
        ],
      },
      {
        caller: 'Если сайт просит номер карты, это стандартная проверка доставки.',
        pattern: 'Normalization of unsafe payment request',
        choices: [
          { id: 'verify-channel', text: 'Закрыть сайт и проверить статус через официальный канал', safe: true, feedback: 'Верно: статус доставки не требует подтверждения карты на чужом сайте.' },
          { id: 'enter-card', text: 'Ввести карту, но не называть код по телефону', safe: false, feedback: 'Небезопасно: фишинговая страница может украсть данные карты без звонка.' },
        ],
      },
    ],
  },
  {
    id: 'investment-kz',
    title: 'Investment guarantee',
    language: 'KZ',
    difficulty: 'Advanced',
    steps: [
      {
        caller: 'Бүгін ғана жабық инвестицияға кірсеңіз, табысқа кепілдік береміз. Шешімді қазір қабылдау керек.',
        pattern: 'Guaranteed return and time pressure',
        choices: [
          { id: 'decline-offer', text: 'Кепілдендірілген табысқа сенбей, ресми лицензияны өзім тексеру', safe: true, feedback: 'Дұрыс: жоғары кепілденген табыс және асықтыру алаяқтықтың жиі белгісі.' },
          { id: 'reserve', text: 'Орынды сақтау үшін аз ғана депозит жіберу', safe: false, feedback: 'Қауіпті: алғашқы шағын аударым көбіне кейінгі қысымға жол ашады.' },
        ],
      },
      {
        caller: 'Кіру үшін AnyDesk орнатып, экранды көрсетіңіз. Бұл тек техникалық көмек.',
        pattern: 'Remote-access takeover',
        choices: [
          { id: 'reject-remote', text: 'Қолданбаны орнатпау және сөйлесуді тоқтату', safe: true, feedback: 'Дұрыс: экранды басқару банктік қосымшалар мен кодтарға қол жеткізуі мүмкін.' },
          { id: 'install-remote', text: 'Қолданбаны орнатып, тек инвестиция бетін көрсету', safe: false, feedback: 'Қате: қашықтан қолжетімділік телефондағы басқа деректерге де қауіп төндіреді.' },
        ],
      },
    ],
  },
]

type ScenarioTemplate = {
  id: string
  title: string
  language: 'RU' | 'KZ'
  difficulty: 'Beginner' | 'Advanced'
  skill: TrainingSkill
  caller: string
  safe: string
  unsafe: string
  feedback: string
  escalation: string
  escalationSafe: string
  escalationUnsafe: string
  escalationFeedback: string
}

const templates: readonly ScenarioTemplate[] = [
  { id: 'bank-app-update-ru', title: 'Bank app update', language: 'RU', difficulty: 'Beginner', skill: 'banking', caller: 'Это банк. Чтобы защитить счёт, установите обновление по ссылке из SMS.', safe: 'Открыть только официальный магазин приложений и перезвонить в банк', unsafe: 'Перейти по ссылке и установить файл', feedback: 'Верно: банк не рассылает APK и не просит устанавливать программу во время звонка.', escalation: 'Сейчас придёт код для подтверждения нового защищённого устройства.', escalationSafe: 'Не сообщать код и завершить разговор', escalationUnsafe: 'Продиктовать код для защиты счёта', escalationFeedback: 'Код может подтвердить вход в банковский аккаунт.' },
  { id: 'credit-cancellation-kz', title: 'Несие рәсімделді', language: 'KZ', difficulty: 'Beginner', skill: 'banking', caller: 'Сіздің атыңызға несие рәсімделіп жатыр. Болдырмау үшін қазір бөлімге қосыламын.', safe: 'Қоңырауды үзіп, банктің ресми нөміріне өзім қоңырау шалу', unsafe: 'Операторға қосылуды күту', feedback: 'Дұрыс: кіріс қоңыраудағы нөмір мен атына сенуге болмайды.', escalation: 'Қауіпсіз шотқа ақша аудару керек, әйтпесе несие бекітіледі.', escalationSafe: 'Ештеңе аудармай, банк қосымшасын өзім тексеру', escalationUnsafe: 'Ақшаны қауіпсіз шотқа жіберу', escalationFeedback: 'Қауіпсіз шот деген алдау тәсілі: банк клиенттен ақша аударуды сұрамайды.' },
  { id: 'marketplace-seller-ru', title: 'Marketplace seller payment', language: 'RU', difficulty: 'Beginner', skill: 'marketplace', caller: 'Я оплатил ваш товар. Введите данные карты по ссылке, чтобы получить деньги.', safe: 'Проверить оплату только внутри маркетплейса', unsafe: 'Ввести номер карты для получения перевода', feedback: 'Верно: для получения денег не нужны CVV, срок действия или SMS-код.', escalation: 'Без карты курьер не сможет забрать товар сегодня.', escalationSafe: 'Отказаться от ссылки и написать покупателю только в чате площадки', escalationUnsafe: 'Продолжить оформление на внешнем сайте', escalationFeedback: 'Срочность нужна, чтобы вы не заметили чужой домен.' },
  { id: 'qr-parking-kz', title: 'QR төлемі', language: 'KZ', difficulty: 'Beginner', skill: 'links', caller: 'Тұрақ ақысын төлеу үшін QR-кодты сканерлеп, картаңызды растаңыз.', safe: 'Ресми тұрақ қосымшасын немесе терминалды пайдалану', unsafe: 'QR-кодтағы сайтқа карта деректерін енгізу', feedback: 'Дұрыс: жалған QR-код төлем парағын алмастыра алады.', escalation: 'Сайт картаңызға 1 теңге тексеру жасайды.', escalationSafe: 'Бетті жабу және ресми арнадан төлеу', escalationUnsafe: 'Тексеру үшін SMS кодын енгізу', escalationFeedback: 'Бір реттік код карта операциясын растауы мүмкін.' },
  { id: 'remote-support-ru', title: 'Fake technical support', language: 'RU', difficulty: 'Advanced', skill: 'remote_access', caller: 'Служба поддержки телефона: у вас вирус. Установите AnyDesk, я всё исправлю.', safe: 'Не устанавливать программу и закрыть разговор', unsafe: 'Установить программу, но не открывать банк', feedback: 'Верно: удалённый доступ даёт контроль над экраном и приложениями.', escalation: 'Покажите экран, я помогу удалить вирус за две минуты.', escalationSafe: 'Не включать демонстрацию и проверить телефон через официальный сервис', escalationUnsafe: 'Включить демонстрацию экрана', escalationFeedback: 'Демонстрация может раскрыть коды, уведомления и банковские данные.' },
  { id: 'government-fine-kz', title: 'Мемлекеттік айыппұл', language: 'KZ', difficulty: 'Beginner', skill: 'identity', caller: 'Сізге мемлекеттік органнан айыппұл келді. Бүгін төлемесеңіз шотыңыз бұғатталады.', safe: 'Хабарламаны eGov немесе ресми қызмет арқылы тексеру', unsafe: 'Қоңыраудағы сілтемемен төлеу', feedback: 'Дұрыс: мемлекеттік орган қорқытып, белгісіз төлем сілтемесін жібермейді.', escalation: 'Жеке куәлік нөміріңізді айтыңыз, ісіңізді жабамын.', escalationSafe: 'Жеке деректерді бермеу', escalationUnsafe: 'ЖСН мен карта нөмірін айту', escalationFeedback: 'ЖСН және қаржылық деректер бірге алаяқтықты күшейтеді.' },
  { id: 'job-fee-ru', title: 'Job offer training fee', language: 'RU', difficulty: 'Beginner', skill: 'jobs', caller: 'Вас приняли на удалённую работу. Оплатите обучение 8 000 тенге, место закрепим.', safe: 'Проверить компанию и не платить за трудоустройство', unsafe: 'Оплатить небольшую сумму ради вакансии', feedback: 'Верно: честный работодатель не требует оплату за доступ к вакансии.', escalation: 'Осталось одно место, перевод нужен в течение пяти минут.', escalationSafe: 'Отказаться и сохранить переписку как доказательство', escalationUnsafe: 'Перевести деньги, чтобы не упустить работу', escalationFeedback: 'Ограничение по времени маскирует отсутствие реальной вакансии.' },
  { id: 'charity-transfer-kz', title: 'Қайырымдылық жинағы', language: 'KZ', difficulty: 'Advanced', skill: 'payments', caller: 'Балаға шұғыл операцияға ақша жинап жатырмыз. Мына картаға аударыңыз.', safe: 'Қордың ресми парақшасы мен реквизиттерін тексеру', unsafe: 'Эмоцияға беріліп, картаға дереу аудару', feedback: 'Дұрыс: қайырымдылықты да тәуелсіз ресми арнадан тексеру керек.', escalation: 'Скриншот жіберсеңіз, атыңызды алғыс тізіміне қосамыз.', escalationSafe: 'Жеке деректер мен түбіртекті жібермеу', escalationUnsafe: 'Төлем скриншотын және нөмірді жіберу', escalationFeedback: 'Скриншоттағы деректер кейінгі алдауға қолданылуы мүмкін.' },
  { id: 'crypto-wallet-ru', title: 'Crypto wallet recovery', language: 'RU', difficulty: 'Advanced', skill: 'investments', caller: 'Мы нашли ваш криптокошелёк. Назовите seed-фразу, чтобы вернуть доступ.', safe: 'Не сообщать seed-фразу и войти только через официальный кошелёк', unsafe: 'Продиктовать часть фразы для проверки', feedback: 'Верно: seed-фраза даёт полный доступ к активам.', escalation: 'Это безопасный бот, отправьте фразу в чат, не по телефону.', escalationSafe: 'Не отправлять фразу никуда', escalationUnsafe: 'Отправить фразу в чат', escalationFeedback: 'Любой получатель seed-фразы может вывести средства.' },
  { id: 'tax-refund-kz', title: 'Салық қайтарымы', language: 'KZ', difficulty: 'Beginner', skill: 'links', caller: 'Сізге салық қайтарымы бекітілді. Ақша алу үшін сілтемедегі форманы толтырыңыз.', safe: 'Қайтарымды тек ресми салық кабинетінен тексеру', unsafe: 'Сілтемедегі банк картасын толтыру', feedback: 'Дұрыс: күтпеген қайтарым сілтемесі фишинг болуы мүмкін.', escalation: 'Картаны байлау үшін CVV керек.', escalationSafe: 'CVV бермеу және бетті жабу', escalationUnsafe: 'CVV енгізу', escalationFeedback: 'CVV-ді ешкімге беруге болмайды.' },
  { id: 'messenger-account-ru', title: 'Messenger account takeover', language: 'RU', difficulty: 'Beginner', skill: 'identity', caller: 'Это служба Telegram. Вам пришёл код, назовите его для защиты аккаунта.', safe: 'Не сообщать код и включить двухэтапную проверку', unsafe: 'Назвать код сотруднику Telegram', feedback: 'Верно: код входа предназначен только владельцу аккаунта.', escalation: 'Если не назовёте, аккаунт удалят через минуту.', escalationSafe: 'Игнорировать угрозу и проверить настройки приложения', escalationUnsafe: 'Назвать код из-за угрозы удаления', escalationFeedback: 'Угроза удаления используется для захвата аккаунта.' },
  { id: 'police-case-kz', title: 'Тергеуші қоңырауы', language: 'KZ', difficulty: 'Advanced', skill: 'identity', caller: 'Мен тергеушімін. Сіздің картаңыз қылмыста қолданылған, қазір жауап беріңіз.', safe: 'Қоңырауды тоқтатып, органның ресми нөмірін өзім табу', unsafe: 'Істі түсіндіру үшін барлық сұраққа жауап беру', feedback: 'Дұрыс: құқық қорғау органдары телефонмен банк кодын немесе аударым сұрамайды.', escalation: 'Құпия тергеу үшін бұл туралы ешкімге айтпаңыз.', escalationSafe: 'Құпиялылық талабына сенбеу және жақын адамға хабарлау', escalationUnsafe: 'Ешкімге айтпай нұсқауды орындау', escalationFeedback: 'Оқшаулау алаяқтың қысымын күшейтеді.' },
  { id: 'airline-refund-ru', title: 'Airline refund', language: 'RU', difficulty: 'Beginner', skill: 'payments', caller: 'Вам одобрен возврат за билет. Для зачисления назовите данные карты и код.', safe: 'Оформить возврат через приложение авиакомпании', unsafe: 'Сообщить данные карты ради возврата', feedback: 'Верно: возврат оформляется по заказу, а не через входящий звонок.', escalation: 'Без кода возврат сегодня отменится.', escalationSafe: 'Завершить разговор и открыть заказ самостоятельно', escalationUnsafe: 'Сообщить SMS-код', escalationFeedback: 'Код подтверждает операции, а не возврат денег.' },
  { id: 'loan-messenger-kz', title: 'Микронесие мессенджері', language: 'KZ', difficulty: 'Advanced', skill: 'banking', caller: 'Сізге микронесие бекітілді. Болдырмау үшін операторға экранды көрсетіңіз.', safe: 'Ешқандай қолданба орнатпай, ұйымды ресми арнадан тексеру', unsafe: 'Экранды көрсету үшін қашықтан қолжетімділік орнату', feedback: 'Дұрыс: қашықтан қолжетімділік несие мәселесін шешпейді.', escalation: 'Банктік қолданбаны ашыңыз, тек балансты қараймыз.', escalationSafe: 'Банктік қолданбаны қоңырауда ашпау', escalationUnsafe: 'Банктік қолданбаны ашып көрсету', escalationFeedback: 'Алаяқтар осы сәтте аударым жасауға итермелейді.' },
  { id: 'fake-prize-ru', title: 'Prize delivery', language: 'RU', difficulty: 'Beginner', skill: 'links', caller: 'Вы выиграли телефон. Оплатите доставку 990 тенге по ссылке.', safe: 'Не платить и проверить конкурс у организатора', unsafe: 'Оплатить доставку маленькой суммой', feedback: 'Верно: приз без участия и с оплатой доставки - частая схема.', escalation: 'Курьер уже выехал, оплатите сейчас.', escalationSafe: 'Отказаться от навязанной срочности', escalationUnsafe: 'Оплатить, чтобы не потерять приз', escalationFeedback: 'Малый платёж часто является входом к краже карты.' },
  { id: 'doctor-relative-kz', title: 'Жалған дәрігер', language: 'KZ', difficulty: 'Advanced', skill: 'identity', caller: 'Туысыңыз ауруханаға түсті, мен дәрігермін. Отаға ақша керек.', safe: 'Туыстың өз нөміріне және аурухананың ресми нөміріне қоңырау шалу', unsafe: 'Картаға ақша аударып, кейін тексеру', feedback: 'Дұрыс: эмоцияға негізделген төтенше жағдайды екі арнадан тексеріңіз.', escalation: 'Қазір аудармасаңыз операция кешігеді.', escalationSafe: 'Ақша жібермеу және ресми растау алу', escalationUnsafe: 'Дереу аудару', escalationFeedback: 'Қысым нақты медициналық ақпараттың орнын баса алмайды.' },
  { id: 'supplier-invoice-ru', title: 'Fake supplier invoice', language: 'RU', difficulty: 'Advanced', skill: 'marketplace', caller: 'Мы поставщик. Реквизиты изменились, оплатите счёт на новую карту сегодня.', safe: 'Перезвонить поставщику по сохранённому номеру и сверить договор', unsafe: 'Оплатить по новым реквизитам из сообщения', feedback: 'Верно: смену реквизитов всегда подтверждают независимым каналом.', escalation: 'Директор уже согласовал, просто подтвердите перевод кодом.', escalationSafe: 'Не подтверждать перевод без проверки', escalationUnsafe: 'Подтвердить перевод кодом', escalationFeedback: 'Код завершает мошеннический платёж.' },
  { id: 'wifi-router-kz', title: 'Интернет провайдері', language: 'KZ', difficulty: 'Beginner', skill: 'remote_access', caller: 'Интернетіңіз бұзылады. Роутерді тексеру үшін телефонға қолдау қолданбасын орнатыңыз.', safe: 'Провайдердің ресми қолдау қызметіне өзім қоңырау шалу', unsafe: 'Белгісіз қолданбаны орнату', feedback: 'Дұрыс: техникалық көмек белгісіз қашықтан басқару құралын талап етпейді.', escalation: 'Қолданбаға экран жазу рұқсатын беріңіз.', escalationSafe: 'Рұқсат бермеу және қолданбаны жою', escalationUnsafe: 'Экран жазуға рұқсат беру', escalationFeedback: 'Экран жазу құпия деректерді ашуы мүмкін.' },
  { id: 'pharmacy-discount-ru', title: 'Pharmacy discount club', language: 'RU', difficulty: 'Beginner', skill: 'links', caller: 'Вам доступна скидка на лекарства. Подтвердите карту на сайте аптеки.', safe: 'Проверить предложение в официальном приложении аптеки', unsafe: 'Подтвердить карту на ссылке из SMS', feedback: 'Верно: скидка не требует реквизитов карты на неожиданном сайте.', escalation: 'Акция закончится через три минуты.', escalationSafe: 'Не реагировать на таймер и проверить источник', escalationUnsafe: 'Спешить и вводить данные', escalationFeedback: 'Таймер - инструмент давления, а не доказательство акции.' },
  { id: 'social-benefit-kz', title: 'Әлеуметтік төлем', language: 'KZ', difficulty: 'Beginner', skill: 'payments', caller: 'Сізге әлеуметтік төлем тағайындалды. Алу үшін картаңызды тіркеңіз.', safe: 'Төлемді eGov немесе банк қосымшасынан тексеру', unsafe: 'Қоңырауда карта деректерін айту', feedback: 'Дұрыс: әлеуметтік төлем үшін CVV және SMS-код сұралмайды.', escalation: 'Тіркеу үшін код келді, дауыстап айтыңыз.', escalationSafe: 'Кодты бермеу', escalationUnsafe: 'Кодты айту', escalationFeedback: 'Код басқа қаржылық әрекетті растауы мүмкін.' },
  { id: 'rental-deposit-ru', title: 'Apartment rental deposit', language: 'RU', difficulty: 'Advanced', skill: 'payments', caller: 'Квартира уже ваша, но нужно перевести задаток до просмотра, иначе её снимут.', safe: 'Не переводить деньги до проверки квартиры и владельца', unsafe: 'Отправить задаток, чтобы забронировать жильё', feedback: 'Верно: предоплата до просмотра и проверки документов - высокий риск.', escalation: 'Я в другом городе, ключи передаст сосед после оплаты.', escalationSafe: 'Отказаться от сделки без личной проверки', escalationUnsafe: 'Оплатить ради ключей', escalationFeedback: 'История с отсутствующим владельцем часто используется для кражи задатка.' },
  { id: 'wrong-transfer-kz', title: 'Қате аударым', language: 'KZ', difficulty: 'Beginner', skill: 'payments', caller: 'Мен сізге қате ақша аудардым. Қайтару үшін банк жіберген кодты айтыңыз.', safe: 'Банктегі операцияны өзім тексеріп, қолдауға жазу', unsafe: 'Кодты айтып, аударымды қайтару', feedback: 'Дұрыс: код арқылы басқа операция расталуы мүмкін.', escalation: 'Қазір қайтармасаңыз полицияға арыз беремін.', escalationSafe: 'Қысымға ермей, тек ресми банк арнасын пайдалану', escalationUnsafe: 'Қорыққаннан кодты беру', escalationFeedback: 'Қорқыту қате аударымды дәлелдемейді.' },
  { id: 'sim-swap-ru', title: 'SIM replacement alert', language: 'RU', difficulty: 'Advanced', skill: 'identity', caller: 'Оператор связи: вашу SIM сейчас заменят. Назовите паспортные данные и код отмены.', safe: 'Перезвонить оператору по номеру с официального сайта', unsafe: 'Назвать код для отмены замены', feedback: 'Верно: коды и персональные данные нельзя сообщать входящему звонку.', escalation: 'Без кода номер отключится навсегда.', escalationSafe: 'Игнорировать ультиматум и использовать официальный канал', escalationUnsafe: 'Передать код из-за угрозы', escalationFeedback: 'Захват SIM открывает доступ к SMS-кодам банков.' },
  { id: 'kyc-photo-kz', title: 'Жалған KYC тексеруі', language: 'KZ', difficulty: 'Advanced', skill: 'remote_access', caller: 'Инвестиция платформасы KYC тексеруі үшін жеке куәлік пен селфи жіберуді сұрайды.', safe: 'Платформаның лицензиясын тексеріп, құжаттарды жібермеу', unsafe: 'Құжат пен селфиді чатқа жіберу', feedback: 'Дұрыс: құжат көшірмесі жалған аккаунттар мен несиеге қолданылуы мүмкін.', escalation: 'Құжатты экраннан көрсетсеңіз де болады.', escalationSafe: 'Экраннан да құжатты көрсетпеу', escalationUnsafe: 'Бейнеқоңырауда құжатты көрсету', escalationFeedback: 'Көрсетілген құжатты жазып алуға болады.' },
  { id: 'insurance-refund-ru', title: 'Insurance refund', language: 'RU', difficulty: 'Beginner', skill: 'links', caller: 'Страховая компания вернёт переплату. Перейдите по ссылке и выберите банк.', safe: 'Проверить договор и возврат в официальном кабинете страховщика', unsafe: 'Перейти по ссылке и выбрать банк', feedback: 'Верно: неизвестная форма выбора банка может украсть доступ.', escalation: 'Для возврата нужно войти через банковские данные.', escalationSafe: 'Не входить и обратиться в страховую самостоятельно', escalationUnsafe: 'Войти в банк на странице из сообщения', escalationFeedback: 'Нельзя вводить банковские данные на ссылке из неожиданного звонка.' },
  { id: 'donation-prize-kz', title: 'Сыйлық сертификаты', language: 'KZ', difficulty: 'Beginner', skill: 'marketplace', caller: 'Сіз дүкеннен сыйлық сертификатын ұтып алдыңыз. Жеткізу үшін карта нөмірін беріңіз.', safe: 'Акцияны дүкеннің ресми парақшасынан тексеру', unsafe: 'Сыйлық үшін карта нөмірін беру', feedback: 'Дұрыс: ұтыс алу үшін карта деректері қажет емес.', escalation: 'Тек 1 теңге ұстаймыз, SMS кодын айтыңыз.', escalationSafe: 'Код бермеу және хабарламаны өшіру', escalationUnsafe: '1 теңгелік тексеруге код беру', escalationFeedback: 'Тіпті шағын сомаға арналған код та қауіпті операцияны растауы мүмкін.' },
]

const templateScenarios: TrainingScenario[] = templates.map((template) => ({
  id: template.id,
  title: template.title,
  language: template.language,
  difficulty: template.difficulty,
  skill: template.skill,
  steps: [
    { caller: template.caller, pattern: template.skill, choices: [
      { id: 'safe', text: template.safe, safe: true, feedback: template.feedback },
      { id: 'unsafe', text: template.unsafe, safe: false, feedback: `Қауіпті / Опасно: ${template.feedback}` },
    ] },
    { caller: template.escalation, pattern: `${template.skill} escalation`, choices: [
      { id: 'safe-escalation', text: template.escalationSafe, safe: true, feedback: template.escalationFeedback },
      { id: 'unsafe-escalation', text: template.escalationUnsafe, safe: false, feedback: `Қауіпті / Опасно: ${template.escalationFeedback}` },
    ] },
  ],
}))

export const trainingScenarios: TrainingScenario[] = [...coreTrainingScenarios, ...templateScenarios]

export const trainingSkillLabels: Record<TrainingSkill, string> = {
  banking: 'Banking and OTP',
  links: 'Links and QR codes',
  remote_access: 'Remote access',
  identity: 'Identity impersonation',
  payments: 'Payments and transfers',
  investments: 'Investments',
  jobs: 'Jobs and fees',
  marketplace: 'Marketplace sales',
}

export const scenarioSkill = (scenario: TrainingScenario): TrainingSkill => scenario.skill ?? 'banking'

export const dailyTrainingScenario = (date = new Date()): TrainingScenario => {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
  return trainingScenarios[day % trainingScenarios.length]!
}

export const examScenarios = (count = 5, date = new Date()): TrainingScenario[] => {
  const start = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000) % trainingScenarios.length
  return Array.from({ length: Math.min(count, trainingScenarios.length) }, (_, index) => trainingScenarios[(start + index * 5) % trainingScenarios.length]!)
}

export const trainingScore = (answers: boolean[]) =>
  answers.length === 0 ? 0 : Math.round((answers.filter(Boolean).length / answers.length) * 100)
