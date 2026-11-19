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
    "appSubtitle": "让 Agent 吵，真人陪审团一票定胜负！",
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
    "pitch1Title": "神仙班底，当庭互撕",
    "pitch1Desc": "控辩双方竭力自辩，法官步步紧逼追问；台上金句频出、火花四溅！",
    "pitch2Title": "真人陪审定胜负",
    "pitch2Desc": "两个 Agent 唇枪舌剑疯狂对质，台下的你手握关键选票，一票决定谁受罚！",
    "pitch3Title": "荒谬判决与上诉互撕",
    "pitch3Desc": "生成盖有大红公章的终审判决海报，把被起诉的好友直接拉来二审再战！",
    "footerCopy": "《互联网法庭》MVP · 任何破事都能开庭 · 严肃搞笑 · 社交娱乐",
    "footerNotice": "文明娱乐，切勿在公开场合泄露他人隐私信息"
  },
  "zh_TW": {
    "appTitle": "互聯網最高破事法庭",
    "appSubtitle": "讓 Agent 吵，真人陪審團一票定勝負！",
    "mvpBadge": "MVP公測版",
    "currentTrial": "當前庭審：",
    "resetTrial": "重置庭審",
    "classicCases": "經典案卷",
    "customCase": "我要起訴朋友",
    "agentHub": "Agent 辯護樞紐",
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
    "plaintiffTurn": "【原告本人陳詞】",
    "defendantTurn": "【被告本人反駁】",
    "judgeTurn": "【法官主持】",
    "evidencePresented": "呈堂證供！",
    "objection": "異議！",
    "objectionSub": "OBJECTION !",
    "holdIt": "等等！",
    "holdItSub": "HOLD IT !",
    "takeThat": "看招！",
    "takeThatSub": "TAKE THAT !",
    "order": "全體肅靜！",
    "orderSub": "—— 互聯網最高法庭正在開庭 ——",
    "juryModalTitle": "陪審團閉門公決！",
    "juryModalDesc": "控辯雙方已當庭火力全開！請作為真人陪審官投票，決定誰將受罰！",
    "juryPlaintiffCardTitle": "更支持原告的主張",
    "juryPlaintiffCardDesc": "原告大佔公理！嚴懲此等反人類離譜行為！",
    "juryPlaintiffCardBtn": "投票支持原告",
    "juryDefendantCardTitle": "更支持被告的回應",
    "juryDefendantCardDesc": "被告完全無辜！捍衛凡人摸魚犯傻的崇高權利！",
    "juryDefendantCardBtn": "投票支持被告",
    "juryNotice": "你的每一票都將決定最終判決與奇葩受罰措施，落槌無悔！",
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
    "pitch1Title": "神仙班底，當庭交鋒",
    "pitch1Desc": "原告與被告各自本人陳述，法官追問主持；控辯交鋒，火花四濺。",
    "pitch2Title": "真人陪審投票",
    "pitch2Desc": "控辯雙方全力輸出、拿出致命證物。台下真人陪審團一票定生死，法官當庭落槌！",
    "pitch3Title": "荒謬判決與傳召上訴",
    "pitch3Desc": "一鍵生成帶公章的判決海報與傳票，把被起訴的好友拉來二次上訴互撕！",
    "footerCopy": "《互聯網法庭》MVP · 任何破事都能開庭 · 嚴肅搞笑 · 社交娛樂",
    "footerNotice": "文明娛樂，切勿在公開場合洩露他人隱私資訊"
  },
  "en_US": {
    "appTitle": "Supreme Internet Petty Court",
    "appSubtitle": "Let Agents Fight, The Human Jury Decides All!",
    "mvpBadge": "MVP Public Beta",
    "currentTrial": "Current Trial:",
    "resetTrial": "Reset Trial",
    "classicCases": "Classic Cases",
    "customCase": "Sue a Friend",
    "agentHub": "Agent Defense Hub",
    "historyArchive": "Court Archives",
    "multiplayer": "Multiplayer Clash",
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
    "debating": "Heated Debate!",
    "prevLine": "Previous",
    "nextLine": "Next Line",
    "autoPlay": "Auto Play",
    "pause": "Pause",
    "voteNow": "Jury Vote",
    "supportPlaintiff": "🔥 Pro Plaintiff",
    "supportDefendant": "🧊 Pro Defense",
    "danmakuPlaceholder": "As the audience juror, shout your petty verdict...",
    "sendDanmaku": "Send Danmaku",
    "switchCase": "Pick Another Drama",
    "turnProgress": "Trial Round:",
    "plaintiffTurn": "[Plaintiff's Passionate Claim]",
    "defendantTurn": "[Defendant's Fierce Rebuttal]",
    "judgeTurn": "[Judge Presiding]",
    "evidencePresented": "Smoking-Gun Evidence!",
    "objection": "OBJECTION !",
    "objectionSub": "異議あり！",
    "holdIt": "HOLD IT !",
    "holdItSub": "等等！",
    "takeThat": "TAKE THAT !",
    "takeThatSub": "看招！",
    "order": "ORDER IN COURT !",
    "orderSub": "— The Supreme Petty Court is Now in Session —",
    "juryModalTitle": "The Jury Deliberates!",
    "juryModalDesc": "Both sides have torn each other to shreds! As the sole human juror, vote to decide who pays the price!",
    "juryPlaintiffCardTitle": "Stand with the Plaintiff",
    "juryPlaintiffCardDesc": "The plaintiff has the moral high ground! Severely penalize this outrageous absurdity!",
    "juryPlaintiffCardBtn": "Vote for Plaintiff",
    "juryDefendantCardTitle": "Stand with the Defendant",
    "juryDefendantCardDesc": "The defendant is completely innocent! Defend our sacred right to slack off and be petty!",
    "juryDefendantCardBtn": "Vote for Defendant",
    "juryNotice": "Your vote directly dictates the final decree and absurd penalties. The gavel falls without regret!",
    "verdictModalTitle": "Final Verdict Delivered!",
    "verdictCourtHeader": "Supreme Internet Grievance Court",
    "verdictCivilDoc": "ENTERTAINMENT RULING",
    "plaintiffParty": "【Plaintiff】:",
    "defendantParty": "【Defendant】:",
    "disputeTopic": "【Dispute Matter】:",
    "sectionFacts": "I. Facts Established by Court",
    "sectionRuling": "II. Official Judgment",
    "sectionPenalties": "[Mandatory Absurd Penalties]:",
    "sectionJudgeQuote": "【Judge’s Golden Admonition】:",
    "chiefJudge": "Presiding Judge: Cyber Chief Justice",
    "courtClerk": "Record: Court System",
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
    "pitch1Title": "Fierce Battles on Stage",
    "pitch1Desc": "Plaintiff and defendant spar with razor-sharp arguments while the cyber judge keeps order.",
    "pitch2Title": "Sole Human Jury Decides",
    "pitch2Desc": "Agents unleash their wildest evidence and arguments. You hold the ultimate power of life, death, and social embarrassment!",
    "pitch3Title": "Absurd Decrees & Retrials",
    "pitch3Desc": "Generate sealed official ruling posters to summon your real-life friends for ruthless second-instance appeals!",
    "footerCopy": "Internet Court MVP · Every Petty Drama Deserves Justice · Satirical Social Game",
    "footerNotice": "For entertainment only. Please protect personal privacy."
  },
  "ja_JP": {
    "appTitle": "ネット最高破事裁判所",
    "appSubtitle": "Agentが吠え、人間陪審員が一票で白黒つける！",
    "mvpBadge": "MVP公開テスト版",
    "currentTrial": "審理中の事件：",
    "resetTrial": "裁判リセット",
    "classicCases": "定番事件簿",
    "customCase": "友達を訴える",
    "agentHub": "Agent 弁護ハブ",
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
    "debating": "白熱弁論中！",
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
    "plaintiffTurn": "【原告の魂の叫び】",
    "defendantTurn": "【被告の決死の反論】",
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
    "juryModalTitle": "陪審団、運命の評決へ！",
    "juryModalDesc": "原告・被告の血みどろ舌戦が終了！唯一の人間陪審員として、罰を受けるべき方を決めろ！",
    "juryPlaintiffCardTitle": "原告の主張を全面支持",
    "juryPlaintiffCardDesc": "原告に正義あり！この常軌を逸した破廉恥行為に鉄槌を下せ！",
    "juryPlaintiffCardBtn": "原告に清き一票",
    "juryDefendantCardTitle": "被告の反論を全面支持",
    "juryDefendantCardDesc": "被告は完全に無罪！サボりと愚行を愛する凡人の神聖なる権利を守れ！",
    "juryDefendantCardBtn": "被告に清き一票",
    "juryNotice": "あなたの投票が判決と理不尽な懲罰を直撃決定。下された木槌に後悔なし！",
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
    "pitch1Title": "神仙キャストによる法廷舌戦",
    "pitch1Desc": "原告と被告が本人として主張し、サイバー裁判長が厳しく追及。火花散るトークバトル！",
    "pitch2Title": "人間陪審員の一票が全てを決める",
    "pitch2Desc": "双方が証拠と弁論を突きつけ合う。最後はあなたの一票で有罪・無罪と理不尽な罰ゲームが決定！",
    "pitch3Title": "爆笑判決ポスターと二審控訴",
    "pitch3Desc": "大紅印鑑付きの判決ポスターをワンクリック出力、友達を控訴審へ引きずり出せ！",
    "footerCopy": "《ネット法廷》MVP · どんな下らない揉め事も開廷 · 風刺＆エンタメ",
    "footerNotice": "ジョークツールです。個人情報の公開にはご注意ください。"
  }
};
