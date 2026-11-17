export type Language = 'zh_CN' | 'zh_TW' | 'en_US' | 'ja_JP';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  mvpBadge: string;
  currentTrial: string;
  resetTrial: string;
  classicCases: string;
  customCase: string;
  agentHub: string;
  historyArchive: string;
  multiplayer: string;
  mute: string;
  unmute: string;
  
  // Court Stage
  prosecutionBench: string;
  defenseBench: string;
  judgeBench: string;
  judgeName: string;
  judgeTitle: string;
  scaleTitle: string;
  plaintiffRep: string;
  defendantRep: string;
  debating: string;
  prevLine: string;
  nextLine: string;
  autoPlay: string;
  pause: string;
  voteNow: string;
  supportPlaintiff: string;
  supportDefendant: string;
  danmakuPlaceholder: string;
  sendDanmaku: string;
  switchCase: string;
  turnProgress: string;
  plaintiffTurn: string;
  defendantTurn: string;
  judgeTurn: string;
  evidencePresented: string;

  // Shouts
  objection: string;
  objectionSub: string;
  holdIt: string;
  holdItSub: string;
  takeThat: string;
  takeThatSub: string;
  order: string;
  orderSub: string;

  // Jury Vote
  juryModalTitle: string;
  juryModalDesc: string;
  juryPlaintiffCardTitle: string;
  juryPlaintiffCardDesc: string;
  juryPlaintiffCardBtn: string;
  juryDefendantCardTitle: string;
  juryDefendantCardDesc: string;
  juryDefendantCardBtn: string;
  juryNotice: string;

  // Verdict
  verdictModalTitle: string;
  verdictCourtHeader: string;
  verdictCivilDoc: string;
  plaintiffParty: string;
  defendantParty: string;
  disputeTopic: string;
  sectionFacts: string;
  sectionRuling: string;
  sectionPenalties: string;
  sectionJudgeQuote: string;
  chiefJudge: string;
  courtClerk: string;
  effectiveNotice: string;
  stampCenter: string;
  stampTitle: string;
  copySummons: string;
  copiedSuccess: string;
  savePoster: string;
  exporting: string;
  startAppeal: string;
  summonFriend: string;
  playAgain: string;

  // Appeal
  appealTitle: string;
  appealPartyLabel: string;
  appealPartyDef: string;
  appealPartyPlf: string;
  appealPresetsLabel: string;
  appealInputLabel: string;
  appealPlaceholder: string;
  appealSubmitBtn: string;

  // Footer & Pitches
  pitch1Title: string;
  pitch1Desc: string;
  pitch2Title: string;
  pitch2Desc: string;
  pitch3Title: string;
  pitch3Desc: string;
  footerCopy: string;
  footerNotice: string;
}

// UI translations only; case dossiers and most supporting forms are authored in Simplified Chinese.
export const TRANSLATIONS: Record<Language, Translations> = {
  "zh_CN": {
    "appTitle": "互联网最高破事法庭",
    "appSubtitle": "控辩双方当庭激辩 · 唯一真人陪审公决",
    "mvpBadge": "MVP公测版",
    "currentTrial": "当前庭审：",
    "resetTrial": "重置庭审",
    "classicCases": "经典案卷",
    "customCase": "我要起诉朋友",
    "agentHub": "Agent 辩护枢纽",
    "historyArchive": "历史案卷库",
    "multiplayer": "联机对决",
    "mute": "静音",
    "unmute": "开启声音",
    "prosecutionBench": "原告席",
    "defenseBench": "被告席",
    "judgeBench": "审判长席",
    "judgeName": "赛博破事大法官",
    "judgeTitle": "互联网最高仲裁席",
    "scaleTitle": "审判正义天平",
    "plaintiffRep": "原告风评",
    "defendantRep": "被告风评",
    "debating": "辩论中！",
    "prevLine": "上一句",
    "nextLine": "下一句",
    "autoPlay": "自动播放",
    "pause": "暂停",
    "voteNow": "陪审投票",
    "supportPlaintiff": "🔥 支持原告",
    "supportDefendant": "🧊 支持被告",
    "danmakuPlaceholder": "旁听留言",
    "sendDanmaku": "发弹幕",
    "switchCase": "换个破事审理",
    "turnProgress": "辩论轮次：",
    "plaintiffTurn": "【原告陈词】",
    "defendantTurn": "【被告反驳】",
    "judgeTurn": "【法官主持】",
    "evidencePresented": "呈堂证供！",
    "objection": "异议！",
    "objectionSub": "OBJECTION !",
    "holdIt": "等等！",
    "holdItSub": "HOLD IT !",
    "takeThat": "看招！",
    "takeThatSub": "TAKE THAT !",
    "order": "全体肃静！",
    "orderSub": "—— 互联网最高法庭正在开庭 ——",
    "juryModalTitle": "陪审团闭门公决！",
    "juryModalDesc": "控辩双方已当庭火力全开！请作为真人陪审官投票，决定谁将受罚！",
    "juryPlaintiffCardTitle": "更支持原告的主张",
    "juryPlaintiffCardDesc": "原告大占公理！严惩此等反人类离谱行为！",
    "juryPlaintiffCardBtn": "投票支持原告",
    "juryDefendantCardTitle": "更支持被告的回应",
    "juryDefendantCardDesc": "被告完全无辜！捍卫凡人摸鱼犯傻的崇高权利！",
    "juryDefendantCardBtn": "投票支持被告",
    "juryNotice": "你的每一票都将决定最终判决与奇葩受罚措施，落槌无悔！",
    "verdictModalTitle": "终审裁决书出炉！",
    "verdictCourtHeader": "互联网最高破事仲裁庭",
    "verdictCivilDoc": "娱 乐 裁 决 书",
    "plaintiffParty": "【起诉原告】：",
    "defendantParty": "【应诉被告】：",
    "disputeTopic": "【争议案由】：",
    "sectionFacts": "一、审 理 查 明",
    "sectionRuling": "二、本 庭 判 决",
    "sectionPenalties": "【调解与执行建议】：",
    "sectionJudgeQuote": "【审判长警世箴言】：",
    "chiefJudge": "审判长：赛博大法官",
    "courtClerk": "记录：庭审系统",
    "effectiveNotice": "虚构娱乐裁决，不具有法律效力",
    "stampCenter": "★ 互联网最高仲裁 ★",
    "stampTitle": "破事终审 裁决专用章",
    "copySummons": "复制传票发微信",
    "copiedSuccess": "已复制传票！",
    "savePoster": "保存判决海报",
    "exporting": "海报生成中...",
    "startAppeal": "我不服！发起二审上诉",
    "summonFriend": "传唤朋友看判决",
    "playAgain": "再审一起破事",
    "appealTitle": "发起二审紧急上诉！",
    "appealPartyLabel": "上诉主体（谁不服判决？）：",
    "appealPartyDef": "被告不服",
    "appealPartyPlf": "原告不服",
    "appealPresetsLabel": "快捷上诉借口（点击即填）：",
    "appealInputLabel": "自定二审翻盘陈词：",
    "appealPlaceholder": "写出你为什么不服、你有什么逆天的新证据，准备当场推翻判决...",
    "appealSubmitBtn": "敲定上诉！开庭加时审理！",
    "pitch1Title": "三位角色，当庭交锋",
    "pitch1Desc": "原告和被告各自以本人身份陈述，法官追问、归纳；预置排练与实时庭审明确区分。",
    "pitch2Title": "真人陪审投票",
    "pitch2Desc": "原告与被告自行举证、质询和反驳。你只需旁听并投票，法官负责宣读裁决。",
    "pitch3Title": "荒谬判决与传召上诉",
    "pitch3Desc": "保存娱乐判决海报，邀请朋友查看案卷，也可以带着新证据申请复审。",
    "footerCopy": "《互联网法庭》MVP · 任何破事都能开庭 · 严肃搞笑 · 社交娱乐",
    "footerNotice": "文明娱乐，切勿在公开场合泄露他人隐私信息"
  },
  "zh_TW": {
    "appTitle": "互聯網最高破事法庭",
    "appSubtitle": "原告、被告、法官 · 三 Agent 庭審 · 真人陪審投票",
    "mvpBadge": "MVP公測版",
    "currentTrial": "當前庭審：",
    "resetTrial": "重置庭審",
    "classicCases": "經典案卷",
    "customCase": "我要起訴朋友",
    "agentHub": "三 Agent 設定",
    "historyArchive": "歷史案卷庫",
    "multiplayer": "連線對決",
    "mute": "靜音",
    "unmute": "開啟聲音",
    "prosecutionBench": "原告席",
    "defenseBench": "被告席",
    "judgeBench": "審判長席",
    "judgeName": "賽博破事大法官",
    "judgeTitle": "互聯網最高仲裁席",
    "scaleTitle": "審判正義天平",
    "plaintiffRep": "原告風評",
    "defendantRep": "被告風評",
    "debating": "辯論中！",
    "prevLine": "上一句",
    "nextLine": "下一句",
    "autoPlay": "自動播放",
    "pause": "暫停",
    "voteNow": "陪審投票",
    "supportPlaintiff": "🔥 支持原告",
    "supportDefendant": "🧊 支持被告",
    "danmakuPlaceholder": "身為現場吃瓜陪審團，發條彈幕懟兩句...",
    "sendDanmaku": "發彈幕",
    "switchCase": "換個破事審理",
    "turnProgress": "辯論輪次：",
    "plaintiffTurn": "【原告本人陳述】",
    "defendantTurn": "【被告本人回應】",
    "judgeTurn": "【法官主持】",
    "evidencePresented": "呈堂證供！",
    "objection": "異議！",
    "objectionSub": "OBJECTION !",
    "holdIt": "等等！",
    "holdItSub": "HOLD IT !",
    "takeThat": "看招！",
    "takeThatSub": "TAKE THAT !",
    "order": "全體肅靜！",
    "orderSub": "—— 互聯網法庭正在開庭 ——",
    "juryModalTitle": "陪審投票",
    "juryModalDesc": "雙方 Agent 已完成陳述與質詢。請陪審投票，由法官依票決宣讀裁決。",
    "juryPlaintiffCardTitle": "更支持原告",
    "juryPlaintiffCardDesc": "現有材料較支持原告的主張。",
    "juryPlaintiffCardBtn": "投票支持原告",
    "juryDefendantCardTitle": "更支持被告",
    "juryDefendantCardDesc": "現有材料較支持被告的回應。",
    "juryDefendantCardBtn": "投票支持被告",
    "juryNotice": "陪審投票決定支持哪一方，由法官宣讀娛樂裁決。",
    "verdictModalTitle": "終審裁決書出爐！",
    "verdictCourtHeader": "互聯網最高破事仲裁庭",
    "verdictCivilDoc": "娛 樂 裁 決 書",
    "plaintiffParty": "【起訴原告】：",
    "defendantParty": "【應訴被告】：",
    "disputeTopic": "【爭議案由】：",
    "sectionFacts": "一、審 理 查 明",
    "sectionRuling": "二、本 庭 判 決",
    "sectionPenalties": "【調解與執行建議】：",
    "sectionJudgeQuote": "【審判長警世箴言】：",
    "chiefJudge": "審判長：賽博大法官",
    "courtClerk": "記錄：庭審系統",
    "effectiveNotice": "虛構娛樂裁決，不具法律效力",
    "stampCenter": "★ 互聯網最高仲裁 ★",
    "stampTitle": "破事終審 裁決專用章",
    "copySummons": "複製傳票發微信",
    "copiedSuccess": "已複製傳票！",
    "savePoster": "保存判決海報",
    "exporting": "海報生成中...",
    "startAppeal": "我不服！發起二審上訴",
    "summonFriend": "傳喚朋友看判決",
    "playAgain": "再審一起破事",
    "appealTitle": "發起二審緊急上訴！",
    "appealPartyLabel": "上訴主體（誰不服判決？）：",
    "appealPartyDef": "被告不服",
    "appealPartyPlf": "原告不服",
    "appealPresetsLabel": "快捷上訴藉口（點擊即填）：",
    "appealInputLabel": "自定二審翻盤陳詞：",
    "appealPlaceholder": "寫出你為什麼不服、你有什麼逆天的新證據，準備當場推翻判決...",
    "appealSubmitBtn": "敲定上訴！開庭加時審理！",
    "pitch1Title": "三位角色，當庭交鋒",
    "pitch1Desc": "原告與被告以本人身份陳述，法官主持；預置排練與即時庭審有別。",
    "pitch2Title": "真人陪審投票",
    "pitch2Desc": "原告與被告自行舉證、質詢和反駁。真人旁聽投票，由法官宣讀裁決。",
    "pitch3Title": "荒謬判決與傳召上訴",
    "pitch3Desc": "一鍵生成帶公章的判決海報與微信傳票，把被起訴的好友拉來二次上訴互撕！",
    "footerCopy": "《互聯網法庭》MVP · 任何破事都能開庭 · 嚴肅搞笑 · 社交娛樂",
    "footerNotice": "文明娛樂，切勿在公開場合洩露他人隱私資訊"
  },
  "en_US": {
    "appTitle": "Internet Petty Grievance Court",
    "appSubtitle": "Plaintiff, Defendant, Judge · Three Agents · Human Jury Vote",
    "mvpBadge": "MVP Public Beta",
    "currentTrial": "Current Trial:",
    "resetTrial": "Reset Trial",
    "classicCases": "Classic Cases",
    "customCase": "Sue a Friend",
    "agentHub": "Three Agent Settings",
    "historyArchive": "Court Archives",
    "multiplayer": "Multiplayer VS",
    "mute": "Mute",
    "unmute": "Unmute",
    "prosecutionBench": "Plaintiff",
    "defenseBench": "Defendant",
    "judgeBench": "The Bench",
    "judgeName": "Cyber Chief Justice",
    "judgeTitle": "Supreme Internet Arbitration",
    "scaleTitle": "Scales of Justice",
    "plaintiffRep": "Plaintiff Favored",
    "defendantRep": "Defense Favored",
    "debating": "Arguing!",
    "prevLine": "Previous",
    "nextLine": "Next Line",
    "autoPlay": "Auto Play",
    "pause": "Pause",
    "voteNow": "Jury Vote",
    "supportPlaintiff": "🔥 Pro Plaintiff",
    "supportDefendant": "🧊 Pro Defense",
    "danmakuPlaceholder": "As an audience juror, shout your thoughts...",
    "sendDanmaku": "Send Danmaku",
    "switchCase": "Select Another Case",
    "turnProgress": "Trial Round:",
    "plaintiffTurn": "[Plaintiff’s Own Statement]",
    "defendantTurn": "[Defendant’s Own Response]",
    "judgeTurn": "[Judge Presiding]",
    "evidencePresented": "Evidence Presented!",
    "objection": "OBJECTION !",
    "objectionSub": "異議あり！",
    "holdIt": "HOLD IT !",
    "holdItSub": "等等！",
    "takeThat": "TAKE THAT !",
    "takeThatSub": "看招！",
    "order": "ORDER IN COURT !",
    "orderSub": "— The Internet Court is Now in Session —",
    "juryModalTitle": "Cast Your Jury Vote",
    "juryModalDesc": "The agents have presented evidence and questioned each other. Cast your jury vote; the judge will announce the corresponding ruling.",
    "juryPlaintiffCardTitle": "Support the Plaintiff",
    "juryPlaintiffCardDesc": "The current record better supports the plaintiff’s claim.",
    "juryPlaintiffCardBtn": "Vote for Plaintiff",
    "juryDefendantCardTitle": "Support the Defendant",
    "juryDefendantCardDesc": "The current record better supports the defendant’s response.",
    "juryDefendantCardBtn": "Vote for Defendant",
    "juryNotice": "Your jury vote chooses the supported party; the judge announces the entertainment ruling.",
    "verdictModalTitle": "Final Verdict Delivered!",
    "verdictCourtHeader": "Supreme Internet Grievance Court",
    "verdictCivilDoc": "ENTERTAINMENT RULING",
    "plaintiffParty": "【Plaintiff】:",
    "defendantParty": "【Defendant】:",
    "disputeTopic": "【Dispute Matter】:",
    "sectionFacts": "I. Facts Established by Court",
    "sectionRuling": "II. Official Judgment",
    "sectionPenalties": "[Suggested Resolution]:",
    "sectionJudgeQuote": "【Judge’s Golden Admonition】:",
    "chiefJudge": "Presiding Judge: Cyber Chief Justice",
    "courtClerk": "Record: Trial System",
    "effectiveNotice": "Fictional entertainment ruling with no legal effect",
    "stampCenter": "★ SUPREME INTERNET ARBITRATION ★",
    "stampTitle": "Official Petty Grievance Seal",
    "copySummons": "Copy Summons Text",
    "copiedSuccess": "Summons Copied!",
    "savePoster": "Save Verdict Poster (PNG)",
    "exporting": "Rendering Image...",
    "startAppeal": "I Appeal! Request Retrial",
    "summonFriend": "Summon Friend to Review",
    "playAgain": "Try Another Petty Case",
    "appealTitle": "Emergency Second-Instance Appeal!",
    "appealPartyLabel": "Who is appealing?:",
    "appealPartyDef": "Defendant Appeals",
    "appealPartyPlf": "Plaintiff Appeals",
    "appealPresetsLabel": "Quick Excuses (Click to fill):",
    "appealInputLabel": "Your Appeal Rebuttal:",
    "appealPlaceholder": "State why the verdict was totally unfair and what outrageous new evidence you bring...",
    "appealSubmitBtn": "Grant Appeal & Resume Trial!",
    "pitch1Title": "Three Roles in Court",
    "pitch1Desc": "The plaintiff and defendant speak for themselves; the judge presides. Preset rehearsals are distinct from live turns.",
    "pitch2Title": "Human Jury Vote",
    "pitch2Desc": "The agents present evidence and question each other. People watch and vote; the judge announces the ruling.",
    "pitch3Title": "Absurd Verdicts & Summons",
    "pitch3Desc": "Generate official sealed court decree posters to confront friends and trigger appeal battles!",
    "footerCopy": "Internet Court MVP · Every Petty Drama Deserves Justice · Satirical Social Game",
    "footerNotice": "For entertainment only. Please protect personal privacy."
  },
  "ja_JP": {
    "appTitle": "ネット最高破事裁判所",
    "appSubtitle": "原告・被告・裁判官 · 3 Agent · 人間の陪審投票",
    "mvpBadge": "MVP公開テスト版",
    "currentTrial": "審理中の事件：",
    "resetTrial": "裁判リセット",
    "classicCases": "定番事件簿",
    "customCase": "友達を訴える",
    "agentHub": "3 Agent 設定",
    "historyArchive": "過去の判決録",
    "multiplayer": "オンライン対決",
    "mute": "ミュート",
    "unmute": "サウンドON",
    "prosecutionBench": "原告席",
    "defenseBench": "被告席",
    "judgeBench": "裁判長席",
    "judgeName": "サイバー最高裁判長",
    "judgeTitle": "ネット最高仲裁所",
    "scaleTitle": "審判の正義天秤",
    "plaintiffRep": "原告支持率",
    "defendantRep": "被告支持率",
    "debating": "弁論中！",
    "prevLine": "前のセリフ",
    "nextLine": "次のセリフ",
    "autoPlay": "自動再生",
    "pause": "一時停止",
    "voteNow": "陪審投票",
    "supportPlaintiff": "🔥 原告を支持",
    "supportDefendant": "🧊 被告を支持",
    "danmakuPlaceholder": "陪審員としてツッコミの弾幕を打つ...",
    "sendDanmaku": "弾幕送信",
    "switchCase": "別の事件を審理",
    "turnProgress": "法廷ラウンド：",
    "plaintiffTurn": "【原告本人の陳述】",
    "defendantTurn": "【被告本人の応答】",
    "judgeTurn": "【裁判官の進行】",
    "evidencePresented": "決定的な証拠品！",
    "objection": "異議あり！",
    "objectionSub": "OBJECTION !",
    "holdIt": "待った！",
    "holdItSub": "HOLD IT !",
    "takeThat": "くらえ！",
    "takeThatSub": "TAKE THAT !",
    "order": "静粛に！",
    "orderSub": "—— ネット破事裁判所、ただいま開廷 ——",
    "juryModalTitle": "陪審投票",
    "juryModalDesc": "双方の Agent による主張と質問が終わりました。陪審票を投じると、裁判官が票決に沿って裁定を読み上げます。",
    "juryPlaintiffCardTitle": "原告を支持",
    "juryPlaintiffCardDesc": "現在の資料は原告の主張をより支持しています。",
    "juryPlaintiffCardBtn": "原告支持の意見を送信",
    "juryDefendantCardTitle": "被告を支持",
    "juryDefendantCardDesc": "現在の資料は被告の応答をより支持しています。",
    "juryDefendantCardBtn": "被告支持の意見を送信",
    "juryNotice": "陪審票で支持する側を選び、裁判官が娯楽用の裁定を読み上げます。",
    "verdictModalTitle": "最終判決文が下されました！",
    "verdictCourtHeader": "ネット最高破事仲裁裁判所",
    "verdictCivilDoc": "娯 楽 用 裁 定 書",
    "plaintiffParty": "【提訴原告】：",
    "defendantParty": "【応訴被告】：",
    "disputeTopic": "【係争事件】：",
    "sectionFacts": "一、裁判所が認定した事実",
    "sectionRuling": "二、本 法 廷 の 判 決",
    "sectionPenalties": "【解決に向けた提案】：",
    "sectionJudgeQuote": "【裁判長からのありがたい訓戒】：",
    "chiefJudge": "裁判長：サイバー最高裁判長",
    "courtClerk": "記録：審理システム",
    "effectiveNotice": "娯楽用の架空の判断であり、法的効力はありません",
    "stampCenter": "★ ネット最高仲裁印 ★",
    "stampTitle": "破事終審 裁決専用印",
    "copySummons": "召喚状テキストをコピー",
    "copiedSuccess": "召喚状をコピーしました！",
    "savePoster": "判決ポスターを保存 (PNG)",
    "exporting": "画像生成中...",
    "startAppeal": "不服！二審控訴を申し立てる",
    "summonFriend": "友達に判決を突きつける",
    "playAgain": "別の事件を審理する",
    "appealTitle": "緊急控訴審を申し立て！",
    "appealPartyLabel": "控訴申立人（誰が不服か？）：",
    "appealPartyDef": "被告が不服",
    "appealPartyPlf": "原告が不服",
    "appealPresetsLabel": "控訴の言い訳テンプレ（クリックで入力）：",
    "appealInputLabel": "二審大逆転の主張：",
    "appealPlaceholder": "一審判決がいかに不当か、そしてどんなとんでもない新証拠があるかを書き殴れ...",
    "appealSubmitBtn": "控訴受理！延長審理スタート！",
    "pitch1Title": "三人の役で審理",
    "pitch1Desc": "原告と被告が本人として述べ、裁判官が進行。定型の練習台詞とリアルタイムの発言は区別されます。",
    "pitch2Title": "人間の陪審投票",
    "pitch2Desc": "Agent が証拠と質問を交わし、人は傍聴して投票します。裁判官が票決に沿って裁定を読み上げます。",
    "pitch3Title": "爆笑判決書と友人召喚",
    "pitch3Desc": "大紅印鑑付きの判決ポスターをワンクリック出力、友達を控訴審へ引きずり出せ！",
    "footerCopy": "《ネット法廷》MVP · どんな下らない揉め事も開廷 · 風刺＆エンタメ",
    "footerNotice": "ジョークツールです。個人情報の公開にはご注意ください。"
  }
};
