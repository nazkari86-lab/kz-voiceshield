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
  steps: TrainingStep[]
}

export const trainingScenarios: TrainingScenario[] = [
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

export const trainingScore = (answers: boolean[]) =>
  answers.length === 0 ? 0 : Math.round((answers.filter(Boolean).length / answers.length) * 100)
