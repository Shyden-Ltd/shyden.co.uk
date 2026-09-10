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
  nav: { services: 'Services', work: 'Work', contact: 'Contact' },
  menuLabel: 'Toggle navigation menu',
  skipToContent: 'Skip to content',

  home: {
    title: 'Shyden Ltd — Bespoke, AI-powered software',
    description:
      'Shyden Ltd builds bespoke, AI-accelerated software end-to-end — or embeds specialists in your existing team.',
    heroHeading:
      'We build bespoke software — AI-accelerated, yours end-to-end.',
    heroLead: 'Or embed our specialists in the team you already have.',
    getInTouch: 'Get in touch',
    seeOurWork: 'See our work',
    servicesHeading: 'What we do',
    serviceBuildTitle: 'We build your product',
    serviceBuildBody:
      'Plan, build and maintain your software end-to-end — AI-accelerated, delivered by us.',
    serviceHireTitle: 'Hire our specialists',
    serviceHireBody:
      'Embed our people in your existing software and processes to move faster with less risk.',
    workHeading: 'Our work',
    workShytalkBody: 'Our flagship product.',
    workGloryTitle: 'Glory Points Calculator',
    workGloryBody: 'A companion tool we built for YeeTalk.',
    workClassroomTitle: 'Classroom Group Creator',
    workClassroomBody: 'A free tool for teachers, built by us.',
    contactHeading: 'Get in touch',
    contactBody: "Tell us what you're building.",
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
  nav: { services: 'Layanan', work: 'Karya', contact: 'Kontak' },
  menuLabel: 'Buka atau tutup menu navigasi',
  skipToContent: 'Lewati ke konten',

  home: {
    title: 'Shyden Ltd — Perangkat lunak khusus bertenaga AI',
    description:
      'Shyden Ltd membangun perangkat lunak khusus yang dipercepat AI dari awal hingga akhir — atau menempatkan spesialis kami di tim Anda yang sudah ada.',
    heroHeading:
      'Kami membangun perangkat lunak khusus — dipercepat AI, sepenuhnya milik Anda.',
    heroLead: 'Atau tempatkan spesialis kami di tim yang sudah Anda miliki.',
    getInTouch: 'Hubungi kami',
    seeOurWork: 'Lihat karya kami',
    servicesHeading: 'Apa yang kami lakukan',
    serviceBuildTitle: 'Kami membangun produk Anda',
    serviceBuildBody:
      'Merencanakan, membangun, dan memelihara perangkat lunak Anda dari awal hingga akhir — dipercepat AI, dikerjakan oleh kami.',
    serviceHireTitle: 'Rekrut spesialis kami',
    serviceHireBody:
      'Tempatkan orang-orang kami di perangkat lunak dan proses Anda yang sudah berjalan agar bergerak lebih cepat dengan risiko lebih kecil.',
    workHeading: 'Karya kami',
    workShytalkBody: 'Produk unggulan kami.',
    workGloryTitle: 'Kalkulator Glory Points',
    workGloryBody: 'Alat pendamping yang kami buat untuk YeeTalk.',
    workClassroomTitle: 'Pembuat Kelompok Kelas',
    workClassroomBody: 'Alat gratis untuk guru, dibuat oleh kami.',
    contactHeading: 'Hubungi kami',
    contactBody: 'Ceritakan apa yang sedang Anda bangun.',
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
    services: '服务',
    work: '工作',
    contact: '联系我们',
  },
  menuLabel: '切换导航菜单',
  skipToContent: '跳转至正文',
  home: {
    title: 'Shyden Ltd — 量身定制的、基于人工智能的软件',
    description:
      'Shyden Ltd 提供端到端的定制化、AI加速软件开发服务——或向您的现有团队派遣专业人员。',
    heroHeading: '我们开发定制化软件——由人工智能加速，全程由您掌控。',
    heroLead: '或者将我们的专家派驻到您现有的团队中。',
    getInTouch: '联系我们',
    seeOurWork: '查看我们的作品',
    servicesHeading: '我们的业务',
    serviceBuildTitle: '我们为您打造产品',
    serviceBuildBody:
      '端到端地规划、构建和维护您的软件——由我们提供，并借助人工智能加速。',
    serviceHireTitle: '聘请我们的专家',
    serviceHireBody:
      '将我们的团队融入您现有的软件和流程中，以更快的速度、更低的风险推进工作。',
    workHeading: '我们的工作',
    workShytalkBody: '我们的旗舰产品。',
    workGloryTitle: 'Glory Points 计算器',
    workGloryBody: '我们为YeeTalk开发的一款配套工具。',
    workClassroomTitle: '课堂小组创建器',
    workClassroomBody: '一款由我们开发的、面向教师的免费工具。',
    contactHeading: '联系我们',
    contactBody: '请告诉我们您正在开发什么。',
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
    services: 'Dịch vụ',
    work: 'Công việc',
    contact: 'Liên hệ',
  },
  menuLabel: 'Chuyển đổi menu điều hướng',
  skipToContent: 'Chuyển thẳng đến nội dung',
  home: {
    title:
      'Shyden Ltd — Phần mềm được thiết kế riêng, ứng dụng trí tuệ nhân tạo',
    description:
      'Shyden Ltd phát triển phần mềm theo yêu cầu, được tăng tốc bằng trí tuệ nhân tạo từ đầu đến cuối — hoặc cử các chuyên gia tham gia vào đội ngũ hiện tại của quý vị.',
    heroHeading:
      'Chúng tôi phát triển phần mềm theo yêu cầu — được tăng tốc bằng trí tuệ nhân tạo (AI), hoàn toàn thuộc sở hữu của quý khách từ đầu đến cuối.',
    heroLead:
      'Hoặc bố trí các chuyên gia của chúng tôi làm việc trực tiếp trong đội ngũ hiện có của quý vị.',
    getInTouch: 'Liên hệ với chúng tôi',
    seeOurWork: 'Xem các dự án của chúng tôi',
    servicesHeading: 'Chúng tôi làm gì',
    serviceBuildTitle: 'Chúng tôi phát triển sản phẩm của bạn',
    serviceBuildBody:
      'Lập kế hoạch, phát triển và bảo trì phần mềm của bạn từ đầu đến cuối — được tăng tốc bằng trí tuệ nhân tạo (AI), do chúng tôi cung cấp.',
    serviceHireTitle: 'Hãy thuê các chuyên gia của chúng tôi',
    serviceHireBody:
      'Hãy tích hợp đội ngũ chuyên gia của chúng tôi vào phần mềm và quy trình hiện có của quý vị để tiến triển nhanh hơn với rủi ro thấp hơn.',
    workHeading: 'Công việc của chúng tôi',
    workShytalkBody: 'Sản phẩm chủ lực của chúng tôi.',
    workGloryTitle: 'Glory Points Máy tính',
    workGloryBody: 'Một công cụ hỗ trợ mà chúng tôi đã phát triển cho YeeTalk.',
    workClassroomTitle: 'Trình tạo nhóm trong lớp học',
    workClassroomBody:
      'Một công cụ miễn phí dành cho giáo viên, do chính chúng tôi phát triển.',
    contactHeading: 'Liên hệ với chúng tôi',
    contactBody: 'Hãy cho chúng tôi biết bạn đang phát triển dự án gì.',
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
    services: 'บริการ',
    work: 'งาน',
    contact: 'ติดต่อ',
  },
  menuLabel: 'สลับเมนูนำทาง',
  skipToContent: 'ไปตรงสู่เนื้อหา',
  home: {
    title: 'Shyden Ltd — ซอฟต์แวร์ที่ออกแบบตามความต้องการและใช้เทคโนโลยี AI',
    description:
      'Shyden Ltd พัฒนาซอฟต์แวร์ตามความต้องการของลูกค้าแบบครบวงจรด้วยเทคโนโลยี AI — หรือจัดส่งผู้เชี่ยวชาญมาทำงานร่วมกับทีมที่มีอยู่ของคุณ',
    heroHeading:
      'เราพัฒนาซอฟต์แวร์ตามความต้องการ — ด้วยเทคโนโลยี AI ที่ช่วยเร่งความเร็ว และให้บริการแบบครบวงจรสำหรับคุณ',
    heroLead: 'หรือให้ผู้เชี่ยวชาญของเราเข้าร่วมทำงานในทีมที่มีอยู่แล้ว',
    getInTouch: 'ติดต่อเรา',
    seeOurWork: 'ดูผลงานของเรา',
    servicesHeading: 'สิ่งที่เราทำ',
    serviceBuildTitle: 'เราพัฒนาผลิตภัณฑ์ของคุณ',
    serviceBuildBody:
      'วางแผน พัฒนา และดูแลรักษาซอฟต์แวร์ของคุณอย่างครบวงจร — ด้วยเทคโนโลยี AI ที่ช่วยเร่งความเร็ว และให้บริการโดยเรา',
    serviceHireTitle: 'จ้างผู้เชี่ยวชาญของเรา',
    serviceHireBody:
      'นำทีมงานของเราไปผสานเข้ากับซอฟต์แวร์และกระบวนการที่มีอยู่ของคุณ เพื่อดำเนินการได้เร็วขึ้นด้วยความเสี่ยงที่น้อยลง',
    workHeading: 'งานของเรา',
    workShytalkBody: 'ผลิตภัณฑ์หลักของเรา',
    workGloryTitle: 'Glory Points เครื่องคิดเลข',
    workGloryBody: 'เครื่องมือเสริมที่เราพัฒนาขึ้นสำหรับ YeeTalk',
    workClassroomTitle: 'เครื่องมือสร้างกลุ่มในห้องเรียน',
    workClassroomBody: 'เครื่องมือฟรีสำหรับครู ที่เราพัฒนาขึ้นเอง',
    contactHeading: 'ติดต่อเรา',
    contactBody: 'บอกเราว่าคุณกำลังสร้างอะไรอยู่',
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
