/**
 * Site-wide copy — header, footer, homepage, 404 and the Glory Points page.
 *
 * Kept beside its translation on purpose: the pair drifts far less when both
 * languages are in one file and a reviewer can see them together. Tool-specific
 * strings live in en.ts / id.ts.
 *
 * `SiteStrings` is derived from the English object, so the Indonesian one is
 * checked at build time — a missing key is a compile error, never a silently
 * English sentence on an Indonesian page.
 */
export const siteEn = {
  nav: {
    shytalk: 'ShyTalk',
    tools: 'Tools',
    contact: 'Contact',
  },
  menuLabel: 'Toggle navigation menu',
  skipToContent: 'Skip to content',

  home: {
    title: 'Shyden Ltd — a new technology company',
    description:
      'We build things worth talking about. ShyTalk is our first product — live rooms where you learn a language by speaking it with someone learning yours.',
    eyebrow: 'A new company',
    heroHeading: 'Shyden builds things worth talking about.',
    heroLead:
      'ShyTalk is the first out of the door — live rooms where you learn a language by speaking it with someone learning yours. Somewhere to actually talk.',
    exploreShytalk: 'Explore ShyTalk',
    opensAt: 'opens',
    flagshipKicker: 'The flagship',
    shytalkBody:
      'Take a seat in a live room and talk — with people learning your language, or in a free lesson with a real teacher when you want the structure.',
    shytalkFeature1: 'Live audio rooms with up to eight seats',
    shytalkFeature2: "Ask for a seat, or just listen until you're ready",
    shytalkFeature3: 'Free lessons with real teachers',
    shytalkFeature4: 'Moderated, age-segregated, and built to stay friendly',
    shytalkShotAlt:
      'The ShyTalk app on a phone, showing a live audio room with people on its seats and the room chat below them.',
    visitShytalk: 'Visit the ShyTalk site',
    toolsHeading: "While you're waiting, try these.",
    toolsLead:
      "Two tools we've already built. Free, no sign-up, and working right now.",
    toolBadge: 'Live now',
    workGloryTitle: 'Glory Points Calculator',
    workGloryBody:
      'Turn YeeTalk glory points into the coins, beans and gift value you need to reach your target.',
    openGlory: 'Open the calculator',
    workClassroomTitle: 'Classroom Group Creator',
    workClassroomBody:
      'Paste a class list and get fair, random groups in seconds. Built for teachers, free forever.',
    openClassroom: 'Open the group creator',
    emailUs: 'Email us',
  },

  notFound: {
    title: 'Page not found — Shyden',
    description: "The page you were looking for doesn't exist.",
    heading: 'Page not found',
    body: "That page doesn't exist.",
    backHome: 'Back to the homepage',
  },

  footer: {
    // The legal entity name, company number and registered office are legal
    // facts from Companies House and stay verbatim in every language. Only the
    // wording around them is translated.
    registered: 'Registered in England & Wales.',
    companyNo: 'Company No.',
    regOffice: 'Registered office:',
  },

  glory: {
    title: 'Glory Points Calculator — Shyden',
    description:
      'Convert YeeTalk glory points into coins, beans and total gift value — instantly, in your browser.',
    forYeetalk: 'For YeeTalk ↗',
    heading: 'Glory Points Calculator',
    lead: "Glory points are part of YeeTalk's in-app gifting. Enter the number of glory points you're aiming for and this companion tool, built by Shyden, works out the exact coins, beans and total gift value you need to reach it.",
    howToHeading: 'How to use it',
    howToSteps: [
      'Enter the number of glory points you want to reach in the box below.',
      'Select Calculate — or press Enter.',
      'Read off the exact coins, beans and total gift value you need to hit that target.',
    ],
    inputLabel: 'Glory points',
    calculate: 'Calculate',
    resultLine: (coins: string, beans: string, gift: string) =>
      `${coins} coins → ${beans} beans → ${gift} total gift value`,
    needsJs: 'This calculator needs JavaScript enabled.',
    assumptions:
      'Assumes 1 coin per point, 0.9 beans per coin, and gifts converting to beans at 40%.',
    // Keyed to gloryPoints.ts's ERRORS so the calculator's own English copy —
    // asserted as a contract by its unit tests — stays untouched while the
    // Indonesian page still speaks Indonesian.
    errors: {
      empty: 'Please enter a number.',
      notWhole: 'Please enter a whole number.',
      zero: 'Enter a number greater than zero.',
      tooLarge: 'That number is too large.',
    },
  },

  // `switchTo` (one string meaning "the other language") was removed in #21
  // Stage 2: it could only ever label one alternative. The switcher now reads
  // each language's own name from LOCALE_METADATA. `label` names the control
  // itself and stays.
  language: {
    label: 'Language',
    // `betaLabel` is the accessible name for the BETA badge; the badge's own
    // text is BETA_BADGE and is deliberately NOT translated (it labels a
    // language the reader may not speak). This label and the notice ARE.
    betaLabel: 'beta translation',
    betaNotice: 'Translations may not be accurate. If you notice it, tell us.',
  },
};

export type SiteStrings = typeof siteEn;

export const siteId: SiteStrings = {
  nav: {
    shytalk: 'ShyTalk',
    tools: 'Alat',
    contact: 'Kontak',
  },
  menuLabel: 'Buka atau tutup menu navigasi',
  skipToContent: 'Lewati ke konten',

  home: {
    title: 'Shyden Ltd — perusahaan teknologi baru',
    description:
      'Kami membangun hal-hal yang layak dibicarakan. ShyTalk adalah produk pertama kami — ruang langsung tempat Anda belajar bahasa dengan berbicara bersama orang yang sedang belajar bahasa Anda.',
    eyebrow: 'Perusahaan baru',
    heroHeading: 'Shyden membangun hal-hal yang layak dibicarakan.',
    heroLead:
      'ShyTalk adalah yang pertama kami luncurkan — ruang langsung tempat Anda belajar bahasa dengan berbicara bersama orang yang sedang belajar bahasa Anda. Tempat untuk benar-benar berbicara.',
    exploreShytalk: 'Jelajahi ShyTalk',
    opensAt: 'membuka',
    flagshipKicker: 'Produk unggulan',
    shytalkBody:
      'Ambil kursi di ruang langsung dan mulailah berbicara — dengan orang yang sedang belajar bahasa Anda, atau dalam pelajaran gratis bersama guru sungguhan bila Anda menginginkan yang lebih terstruktur.',
    shytalkFeature1: 'Ruang audio langsung dengan hingga delapan kursi',
    shytalkFeature2: 'Minta kursi, atau cukup mendengarkan sampai Anda siap',
    shytalkFeature3: 'Pelajaran gratis bersama guru sungguhan',
    shytalkFeature4:
      'Dimoderasi, dipisahkan menurut usia, dan dibuat agar tetap ramah',
    shytalkShotAlt:
      'Aplikasi ShyTalk di ponsel, menampilkan ruang audio langsung dengan orang-orang di kursinya dan obrolan ruangan di bawahnya.',
    visitShytalk: 'Kunjungi situs ShyTalk',
    toolsHeading: 'Sambil menunggu, coba ini.',
    toolsLead:
      'Dua alat yang sudah kami buat. Gratis, tanpa pendaftaran, dan berfungsi sekarang juga.',
    toolBadge: 'Aktif sekarang',
    workGloryTitle: 'Kalkulator Glory Points',
    workGloryBody:
      'Ubah glory points YeeTalk menjadi koin, bean, dan nilai hadiah yang Anda butuhkan untuk mencapai target.',
    openGlory: 'Buka kalkulator',
    workClassroomTitle: 'Pembuat Kelompok Kelas',
    workClassroomBody:
      'Tempelkan daftar kelas dan dapatkan kelompok acak yang adil dalam hitungan detik. Dibuat untuk guru, gratis selamanya.',
    openClassroom: 'Buka pembuat kelompok',
    emailUs: 'Kirim email',
  },

  notFound: {
    title: 'Halaman tidak ditemukan — Shyden',
    description: 'Halaman yang Anda cari tidak ada.',
    heading: 'Halaman tidak ditemukan',
    body: 'Halaman itu tidak ada.',
    backHome: 'Kembali ke beranda',
  },

  footer: {
    registered: 'Terdaftar di Inggris & Wales.',
    companyNo: 'No. Perusahaan',
    regOffice: 'Kantor terdaftar:',
  },

  glory: {
    title: 'Kalkulator Glory Points — Shyden',
    description:
      'Ubah glory points YeeTalk menjadi koin, bean, dan total nilai hadiah — seketika, di peramban Anda.',
    forYeetalk: 'Untuk YeeTalk ↗',
    heading: 'Kalkulator Glory Points',
    lead: 'Glory points adalah bagian dari fitur hadiah di dalam aplikasi YeeTalk. Masukkan jumlah glory points yang Anda tuju, dan alat pendamping buatan Shyden ini menghitung persis berapa koin, bean, dan total nilai hadiah yang Anda perlukan.',
    howToHeading: 'Cara menggunakannya',
    howToSteps: [
      'Masukkan jumlah glory points yang ingin Anda capai pada kotak di bawah.',
      'Pilih Hitung — atau tekan Enter.',
      'Baca jumlah persis koin, bean, dan total nilai hadiah yang diperlukan untuk mencapai target itu.',
    ],
    inputLabel: 'Glory points',
    calculate: 'Hitung',
    resultLine: (coins: string, beans: string, gift: string) =>
      `${coins} koin → ${beans} bean → ${gift} total nilai hadiah`,
    needsJs: 'Kalkulator ini memerlukan JavaScript yang aktif.',
    assumptions:
      'Mengasumsikan 1 koin per poin, 0,9 bean per koin, dan hadiah dikonversi ke bean sebesar 40%.',
    errors: {
      empty: 'Silakan masukkan angka.',
      notWhole: 'Silakan masukkan bilangan bulat.',
      zero: 'Masukkan angka lebih besar dari nol.',
      tooLarge: 'Angka itu terlalu besar.',
    },
  },

  language: {
    label: 'Bahasa',
    betaLabel: 'terjemahan beta',
    betaNotice:
      'Terjemahan mungkin tidak akurat. Jika Anda melihatnya, beri tahu kami.',
  },
};

/**
 * zh — generated from siteEn and the DeepL cache (#22). Machine output is a
 * FIRST DRAFT: checked for structure, not for fluency. See the review list on
 * the issue.
 */
export const siteZh: SiteStrings = {
  nav: {
    shytalk: 'ShyTalk',
    tools: '工具',
    contact: '联系我们',
  },
  menuLabel: '切换导航菜单',
  skipToContent: '跳转至正文',
  home: {
    title: 'Shyden Ltd — 一家新的科技公司',
    description:
      '我们打造值得谈论的产品。ShyTalk 是我们的第一款产品——在实时房间里，你通过开口说来学习一门语言，对方也正在学你的语言。',
    eyebrow: '一家新公司',
    heroHeading: 'Shyden 打造值得谈论的产品。',
    heroLead:
      'ShyTalk 是我们推出的第一款产品——在实时房间里，你通过开口说来学习一门语言，对方也正在学你的语言。一个真正可以开口的地方。',
    exploreShytalk: '了解 ShyTalk',
    opensAt: '打开',
    flagshipKicker: '旗舰产品',
    shytalkBody:
      '在实时房间里坐下来开口说——和正在学你语言的人交流，或者在想要更有条理时，参加由真人老师带的免费课程。',
    shytalkFeature1: '实时语音房间，最多八个座位',
    shytalkFeature2: '申请一个座位，或者先听着，等你准备好',
    shytalkFeature3: '由真人老师带的免费课程',
    shytalkFeature4: '有人管理、按年龄分区，为友善而设计',
    shytalkShotAlt:
      'ShyTalk 应用在手机上显示一个实时语音房间，座位上有人，下面是房间聊天。',
    visitShytalk: '访问 ShyTalk 网站',
    toolsHeading: '等待期间，先试试这些。',
    toolsLead: '我们已经做好的两款工具。免费，无需注册，现在就能用。',
    toolBadge: '已上线',
    workGloryTitle: 'Glory Points 计算器',
    workGloryBody:
      '把 YeeTalk 的 glory points 换算成达成目标所需的金币、beans 和礼物价值。',
    openGlory: '打开计算器',
    workClassroomTitle: '课堂小组创建器',
    workClassroomBody:
      '粘贴一份班级名单，几秒钟就能得到公平的随机分组。为教师而做，永久免费。',
    openClassroom: '打开小组创建器',
    emailUs: '给我们发邮件',
  },
  notFound: {
    title: '页面未找到 — Shyden',
    description: '您要查找的页面不存在。',
    heading: '页面未找到',
    body: '该页面不存在。',
    backHome: '返回首页',
  },
  footer: {
    registered: '注册于England & Wales。',
    companyNo: '公司编号：',
    regOffice: '注册办事处：',
  },
  glory: {
    title: 'Glory Points 计算器 — Shyden',
    description:
      '将YeeTalk荣耀点数兑换为金币、豆豆和总礼品价值——在浏览器中即可即时完成。',
    forYeetalk: '适用于 YeeTalk ↗',
    heading: 'Glory Points 计算器',
    lead: '“荣耀点”是YeeTalk应用内送礼功能的一部分。输入您希望获得的荣耀点数，这款由Shyden开发的辅助工具会计算出您需要多少金币、豆子以及总送礼金额才能达到该目标。',
    howToHeading: '如何使用',
    howToSteps: [
      '请在下方框中输入您希望达到的荣耀点数。',
      '选择“计算”——或按 Enter 键。',
      '请准确读出达到该目标所需的硬币、豆子以及礼物总价值。',
    ],
    inputLabel: '荣耀点数',
    calculate: '计算',
    resultLine: siteEn.glory.resultLine,
    needsJs: '此计算器需要启用 JavaScript。',
    assumptions:
      '假设每1分需1枚金币，每枚金币可兑换0.9颗豆子，且礼物可按40%的比例兑换成豆子。',
    errors: {
      empty: '请输入一个数字。',
      notWhole: '请输入一个整数。',
      zero: '请输入一个大于零的数字。',
      tooLarge: '这个数字太大了。',
    },
  },
  language: {
    label: '语言',
    betaLabel: '测试版翻译',
    betaNotice: '翻译可能不准确。如果您发现问题，请告诉我们。',
  },
};

/**
 * vi — generated from siteEn and the DeepL cache (#22). Machine output is a
 * FIRST DRAFT: checked for structure, not for fluency. See the review list on
 * the issue.
 */
export const siteVi: SiteStrings = {
  nav: {
    shytalk: 'ShyTalk',
    tools: 'Công cụ',
    contact: 'Liên hệ',
  },
  menuLabel: 'Chuyển đổi menu điều hướng',
  skipToContent: 'Chuyển thẳng đến nội dung',
  home: {
    title: 'Shyden Ltd — một công ty công nghệ mới',
    description:
      'Chúng tôi xây dựng những thứ đáng để nói đến. ShyTalk là sản phẩm đầu tiên của chúng tôi — những phòng trực tuyến nơi bạn học một ngôn ngữ bằng cách nói nó với người đang học ngôn ngữ của bạn.',
    eyebrow: 'Một công ty mới',
    heroHeading: 'Shyden xây dựng những thứ đáng để nói đến.',
    heroLead:
      'ShyTalk là sản phẩm đầu tiên chúng tôi ra mắt — những phòng trực tuyến nơi bạn học một ngôn ngữ bằng cách nói nó với người đang học ngôn ngữ của bạn. Một nơi để thực sự trò chuyện.',
    exploreShytalk: 'Khám phá ShyTalk',
    opensAt: 'mở',
    flagshipKicker: 'Sản phẩm chủ lực',
    shytalkBody:
      'Nhận một chỗ ngồi trong phòng trực tuyến và bắt đầu nói — với những người đang học ngôn ngữ của bạn, hoặc trong một buổi học miễn phí cùng giáo viên thật khi bạn muốn có cấu trúc hơn.',
    shytalkFeature1: 'Phòng âm thanh trực tuyến với tối đa tám chỗ ngồi',
    shytalkFeature2: 'Xin một chỗ ngồi, hoặc cứ nghe cho đến khi bạn sẵn sàng',
    shytalkFeature3: 'Buổi học miễn phí cùng giáo viên thật',
    shytalkFeature4:
      'Có kiểm duyệt, phân tách theo độ tuổi, và được xây dựng để luôn thân thiện',
    shytalkShotAlt:
      'Ứng dụng ShyTalk trên điện thoại, hiển thị một phòng âm thanh trực tuyến với những người trên các chỗ ngồi và khung trò chuyện của phòng ở bên dưới.',
    visitShytalk: 'Truy cập trang ShyTalk',
    toolsHeading: 'Trong lúc chờ, hãy thử những công cụ này.',
    toolsLead:
      'Hai công cụ chúng tôi đã xây dựng. Miễn phí, không cần đăng ký, và dùng được ngay bây giờ.',
    toolBadge: 'Đang hoạt động',
    workGloryTitle: 'Máy tính Glory Points',
    workGloryBody:
      'Chuyển glory points của YeeTalk thành số xu, bean và giá trị quà tặng bạn cần để đạt mục tiêu.',
    openGlory: 'Mở máy tính',
    workClassroomTitle: 'Trình tạo nhóm trong lớp học',
    workClassroomBody:
      'Dán danh sách lớp và nhận các nhóm ngẫu nhiên, công bằng chỉ trong vài giây. Dành cho giáo viên, miễn phí mãi mãi.',
    openClassroom: 'Mở trình tạo nhóm',
    emailUs: 'Gửi email cho chúng tôi',
  },
  notFound: {
    title: 'Không tìm thấy trang — Shyden',
    description: 'Trang bạn đang tìm kiếm không tồn tại.',
    heading: 'Không tìm thấy trang',
    body: 'Trang đó không tồn tại.',
    backHome: 'Quay lại trang chủ',
  },
  footer: {
    registered: 'Được đăng ký tại England & Wales.',
    companyNo: 'Số đăng ký doanh nghiệp',
    regOffice: 'Trụ sở chính:',
  },
  glory: {
    title: 'Glory Points Máy tính — Shyden',
    description:
      'Chuyển đổi điểm vinh quang YeeTalk thành xu, hạt đậu và tổng giá trị quà tặng — ngay lập tức, ngay trên trình duyệt của bạn.',
    forYeetalk: 'Dành cho YeeTalk ↗',
    heading: 'Glory Points Máy tính',
    lead: 'Điểm vinh quang là một phần của tính năng tặng quà trong ứng dụng YeeTalk. Chỉ cần nhập số điểm vinh quang mà bạn muốn đạt được, công cụ hỗ trợ này – do Shyden phát triển – sẽ tính toán chính xác số xu, hạt đậu và tổng giá trị quà tặng mà bạn cần để đạt được mục tiêu đó.',
    howToHeading: 'Cách sử dụng',
    howToSteps: [
      'Hãy nhập số điểm vinh quang mà bạn muốn đạt được vào ô bên dưới.',
      'Chọn “Tính toán” — hoặc nhấn phím Enter.',
      'Hãy đếm chính xác số đồng xu, hạt đậu và tổng giá trị quà tặng mà bạn cần để đạt được mục tiêu đó.',
    ],
    inputLabel: 'Điểm vinh quang',
    calculate: 'Tính toán',
    resultLine: siteEn.glory.resultLine,
    needsJs: 'Trình tính này cần bật JavaScript.',
    assumptions:
      'Giả định mỗi điểm tương ứng với 1 đồng xu, mỗi đồng xu tương ứng với 0,9 hạt đậu, và quà tặng được quy đổi thành hạt đậu theo tỷ lệ 40%.',
    errors: {
      empty: 'Vui lòng nhập một số.',
      notWhole: 'Vui lòng nhập một số nguyên.',
      zero: 'Hãy nhập một số lớn hơn 0.',
      tooLarge: 'Con số đó quá lớn.',
    },
  },
  language: {
    label: 'Ngôn ngữ',
    betaLabel: 'bản dịch beta',
    betaNotice:
      'Bản dịch có thể không chính xác. Nếu bạn phát hiện lỗi, hãy cho chúng tôi biết.',
  },
};

/**
 * th — generated from siteEn and the DeepL cache (#22). Machine output is a
 * FIRST DRAFT: checked for structure, not for fluency. See the review list on
 * the issue.
 */
export const siteTh: SiteStrings = {
  nav: {
    shytalk: 'ShyTalk',
    tools: 'เครื่องมือ',
    contact: 'ติดต่อ',
  },
  menuLabel: 'สลับเมนูนำทาง',
  skipToContent: 'ไปตรงสู่เนื้อหา',
  home: {
    title: 'Shyden Ltd — บริษัทเทคโนโลยีน้องใหม่',
    description:
      'เราสร้างสิ่งที่ควรค่าแก่การพูดถึง ShyTalk คือผลิตภัณฑ์แรกของเรา — ห้องสนทนาสดที่คุณเรียนภาษาด้วยการพูดกับคนที่กำลังเรียนภาษาของคุณ',
    eyebrow: 'บริษัทน้องใหม่',
    heroHeading: 'Shyden สร้างสิ่งที่ควรค่าแก่การพูดถึง',
    heroLead:
      'ShyTalk คือสิ่งแรกที่เราปล่อยออกมา — ห้องสนทนาสดที่คุณเรียนภาษาด้วยการพูดกับคนที่กำลังเรียนภาษาของคุณ ที่ที่ได้พูดจริง ๆ',
    exploreShytalk: 'สำรวจ ShyTalk',
    opensAt: 'เปิด',
    flagshipKicker: 'ผลิตภัณฑ์หลัก',
    shytalkBody:
      'นั่งลงในห้องสนทนาสดแล้วเริ่มพูดคุย — กับคนที่กำลังเรียนภาษาของคุณ หรือในบทเรียนฟรีกับครูตัวจริงเมื่อคุณอยากได้ความเป็นระบบมากขึ้น',
    shytalkFeature1: 'ห้องเสียงสดรองรับได้สูงสุดแปดที่นั่ง',
    shytalkFeature2: 'ขอที่นั่ง หรือจะฟังไปก่อนจนกว่าคุณจะพร้อม',
    shytalkFeature3: 'บทเรียนฟรีกับครูตัวจริง',
    shytalkFeature4: 'มีการดูแล แบ่งตามช่วงอายุ และสร้างมาให้เป็นมิตรเสมอ',
    shytalkShotAlt:
      'แอป ShyTalk บนโทรศัพท์ แสดงห้องเสียงสดที่มีผู้คนอยู่บนที่นั่งและแชตของห้องอยู่ด้านล่าง',
    visitShytalk: 'เยี่ยมชมเว็บไซต์ ShyTalk',
    toolsHeading: 'ระหว่างที่รอ ลองสิ่งเหล่านี้ดู',
    toolsLead:
      'เครื่องมือสองอย่างที่เราทำไว้แล้ว ฟรี ไม่ต้องสมัคร และใช้ได้ทันที',
    toolBadge: 'พร้อมใช้งาน',
    workGloryTitle: 'เครื่องคำนวณ Glory Points',
    workGloryBody:
      'แปลง glory points ของ YeeTalk เป็นจำนวนเหรียญ bean และมูลค่าของขวัญที่คุณต้องใช้เพื่อไปให้ถึงเป้าหมาย',
    openGlory: 'เปิดเครื่องคำนวณ',
    workClassroomTitle: 'เครื่องมือสร้างกลุ่มในห้องเรียน',
    workClassroomBody:
      'วางรายชื่อนักเรียนแล้วได้กลุ่มแบบสุ่มที่ยุติธรรมภายในไม่กี่วินาที สร้างมาเพื่อครู ฟรีตลอดไป',
    openClassroom: 'เปิดเครื่องมือสร้างกลุ่ม',
    emailUs: 'ส่งอีเมลให้เรา',
  },
  notFound: {
    title: 'ไม่พบหน้า — Shyden',
    description: 'หน้าที่คุณกำลังค้นหาไม่มีอยู่',
    heading: 'ไม่พบหน้า',
    body: 'หน้านั้นไม่มีอยู่',
    backHome: 'กลับสู่หน้าหลัก',
  },
  footer: {
    registered: 'จดทะเบียนในEngland & Wales',
    companyNo: 'เลขทะเบียนบริษัท',
    regOffice: 'สำนักงานจดทะเบียน:',
  },
  glory: {
    title: 'Glory Points เครื่องคิดเลข — Shyden',
    description:
      'แปลงคะแนนเกียรติยศ YeeTalk เป็นเหรียญ ถั่ว และมูลค่ารวมของของขวัญ — ทันที ในเบราว์เซอร์ของคุณ',
    forYeetalk: 'สำหรับ YeeTalk ↗',
    heading: 'Glory Points เครื่องคิดเลข',
    lead: 'คะแนน Glory เป็นส่วนหนึ่งของระบบการส่งของขวัญภายในแอป YeeTalk เพียงป้อนจำนวนคะแนน Glory ที่คุณต้องการ เครื่องมือช่วยนี้ ซึ่งพัฒนาโดย Shyden จะคำนวณจำนวนเหรียญ (coins) และเมล็ด (beans) รวมถึงมูลค่ารวมของของขวัญที่คุณต้องใช้เพื่อให้ถึงเป้าหมายนั้น',
    howToHeading: 'วิธีใช้',
    howToSteps: [
      'กรอกจำนวนคะแนนเกียรติยศที่คุณต้องการให้ถึงลงในช่องด้านล่าง',
      'เลือก "คำนวณ" — หรือกด Enter',
      'อ่านจำนวนเหรียญและเมล็ดถั่วที่แน่นอน รวมถึงมูลค่ารวมของของขวัญที่คุณต้องใช้เพื่อให้ถึงเป้าหมายนั้น',
    ],
    inputLabel: 'คะแนนเกียรติยศ',
    calculate: 'คำนวณ',
    resultLine: siteEn.glory.resultLine,
    needsJs: 'เครื่องคำนวณนี้ต้องเปิด JavaScript ไว้',
    assumptions:
      'สมมติว่า 1 คะแนนเท่ากับ 1 เหรียญ, 0.9 ถั่วต่อเหรียญ และของขวัญจะถูกแปลงเป็นถั่วในอัตรา 40%',
    errors: {
      empty: 'กรุณาป้อนตัวเลข',
      notWhole: 'กรุณาป้อนตัวเลขเต็ม',
      zero: 'กรอกตัวเลขที่มากกว่าศูนย์',
      tooLarge: 'ตัวเลขนั้นใหญ่เกินไป',
    },
  },
  language: {
    label: 'ภาษา',
    betaLabel: 'คำแปลเวอร์ชันเบต้า',
    betaNotice: 'คำแปลอาจไม่ถูกต้อง หากคุณพบข้อผิดพลาด โปรดแจ้งให้เราทราบ',
  },
};

/**
 * The tables and the lookup live in `./index`, beside `getStrings`.
 *
 * This file used to end with `SITE_TABLE` and `getSiteStrings`, which meant
 * importing `isLocale`/`DEFAULT_LOCALE` as VALUES from `./index` -- and that
 * one import is why `scripts/i18n-translate.mjs` could not read this
 * catalogue: the harness runs under plain Node, which resolves neither an
 * extensionless `./index` nor the tree behind it, so every site string
 * (header, footer, homepage, 404) was invisible to the translator while
 * en.ts, which imports nothing, was not. #22 moved the lookup rather than
 * duplicating `isLocale` here, so there is still exactly one place that
 * decides what a locale is. This file is now pure data, like en.ts and id.ts.
 */
