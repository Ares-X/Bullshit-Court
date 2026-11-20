import { CaseData } from '../types';

// Fictional dossiers and prerecorded rehearsal lines; live turns are produced by courtRuntime.
export const PRESET_CASES: CaseData[] = [
  {
    "id": "case-hotpot-potato",
    "title": "火锅底料化土豆案",
    "caseNumber": "【互破初字第20261117-01号】",
    "category": "美食争端",
    "tags": [
      "预置排练",
      "火锅底线",
      "淀粉犯罪",
      "公共安全"
    ],
    "summary": "八人火锅聚餐时，王土豆将整盘土豆倒入九宫格中心，煮了45分钟。李毛肚认为糊汤影响涮鸭肠，要求以后分格煮；王土豆认为软烂土豆让汤更香。",
    "plaintiffName": "李毛肚",
    "plaintiffTitle": "原告 · 较真、爱吃脆毛肚",
    "defendantName": "王土豆",
    "defendantTitle": "被告 · 护短、爱软烂土豆",
    "coreClash": "火锅涮土豆到底属于正常烹饪自由，还是对公共锅底的淀粉恐怖袭击？",
    "agents": {
      "plaintiff": {
        "id": "case-hotpot-potato-plaintiff",
        "name": "李毛肚",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。较真、爱吃脆毛肚，要求事先协商",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-hotpot-potato-defendant",
        "name": "王土豆",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。护短、爱软烂土豆，也能承认没问大家",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-hotpot-potato-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    },
    "evidences": [
      {
        "id": "ev-1",
        "name": "锅底残渣照片",
        "description": "可见锅底浑浊、捞勺上附着土豆泥；未测定黏度。",
        "icon": "🍲",
        "owner": "plaintiff"
      },
      {
        "id": "ev-2",
        "name": "聚餐用锅习惯说明",
        "description": "李毛肚自行整理的用锅建议，不是法律或已获全员同意的规则。",
        "icon": "📜",
        "owner": "plaintiff"
      },
      {
        "id": "ev-3",
        "name": "王土豆的口味说明",
        "description": "被告自述浓汤更挂肉，是个人口味，不是检测结论。",
        "icon": "🥔",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "同一锅红油，有人说糊了，有人说香了。今天请两位说清楚，八个人的晚饭怎么煮成了两种说法。原告，你从下土豆那一刻讲。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-2",
        "speaker": "plaintiff",
        "speakerName": "李毛肚",
        "avatar": "👩‍💼",
        "text": "我只想涮爽脆鸭肠！他把整盘土豆倒进沸腾的中心格，45分钟后，我夹起来的鸭肠已经穿上了土豆羽绒服。下次拜托给土豆换个格子。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 15,
        "danmaku": []
      },
      {
        "id": "turn-3",
        "speaker": "defendant",
        "speakerName": "王土豆",
        "avatar": "👨‍💼",
        "text": "土豆是我下的。我就爱吃一抿就化的，汤浓了还更挂肉。你说鸭肠穿了羽绒服，我吃着它像穿了红油礼服。至于下在哪格，我们可以商量。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-4",
        "speaker": "plaintiff",
        "speakerName": "李毛肚",
        "avatar": "👩‍💼",
        "text": "请看锅底残渣的照片，连捞勺上都挂着土豆泥。你爱喝浓汤当然可以。可这是八个人的锅，怎么就成了一人投票、七人喝粥？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1",
          "name": "锅底残渣照片",
          "description": "可见锅底浑浊、捞勺上附着土豆泥；未测定黏度。",
          "icon": "🍲",
          "owner": "plaintiff"
        },
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-5",
        "speaker": "defendant",
        "speakerName": "王土豆",
        "avatar": "👨‍💼",
        "text": "我认，下锅前没问大家。我的口味说明写的是浓汤怎么挂肉，也没法替同桌七个人验舌头。下次我单拿个漏勺让土豆在里头化，行吧？",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-3",
          "name": "王土豆的口味说明",
          "description": "被告自述浓汤更挂肉，是个人口味，不是检测结论。",
          "icon": "🥔",
          "owner": "defendant"
        },
        "tiltChange": -25,
        "danmaku": []
      },
      {
        "id": "turn-6",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "土豆怎么吃随各位，八个人的锅怎么用得有个说法。陪审团请投票，本庭等票数出来再落槌。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "下次聚餐使用独立漏勺煮土豆。",
        "共同锅底改变做法前先询问同桌。"
      ],
      "quote": "“毛肚尚有七上八下之度，土豆岂容无法无天之化？九宫格的每一滴红油，都是文明的尊严！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "尊重软烂土豆的口味，聚餐前约定分格规则。"
      ],
      "quote": "“真正的吃货，敢于直面黏稠的锅底，敢于正视融化的土豆。海纳百川，有泥乃大！”"
    }
  },
  {
    "id": "case-cyber-funeral",
    "title": "朋友圈换朋友黑白大头照配文“永远怀念”案",
    "caseNumber": "【互破奇字第20261117-06号】",
    "category": "猎奇幽默",
    "tags": [
      "预置排练",
      "赛博送终",
      "黑白遗照",
      "永远怀念"
    ],
    "summary": "周六晚十点，赵活人拒绝五排邀请后，钱阎王把他的黑白照片配上“永远怀念”发到朋友圈。姑姑连打11个电话，14人留言“一路走好”。赵活人要求删图澄清；钱阎王称只是游戏玩梗。",
    "plaintiffName": "赵活人",
    "plaintiffTitle": "原告 · 气急但清楚",
    "defendantName": "钱阎王",
    "defendantTitle": "被告 · 爱玩梗嘴硬",
    "coreClash": "因打游戏被鸽而给活人办赛博葬礼，到底属于当代朋克玩梗还是严重的公然赛博发丧罪？",
    "evidences": [
      {
        "id": "ev-601",
        "name": "朋友圈截图",
        "description": "可见黑白照片、九宫格蜡烛和“永远怀念”；14人留言“一路走好”。",
        "icon": "🪦",
        "owner": "plaintiff"
      },
      {
        "id": "ev-602",
        "name": "姑姑来电及语音记录",
        "description": "11个未接电话和60秒语音，反映亲属误以为原告出事。",
        "icon": "🎙️",
        "owner": "plaintiff"
      },
      {
        "id": "ev-603",
        "name": "钱阎王的脱敏玩笑草稿",
        "description": "被告自写草稿，不是学术论文，不能证明照片有治疗功效。",
        "icon": "🕯️",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-601",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "原告本人已到庭，不需要招魂。今天只审这条朋友圈有没有越界。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-602",
        "speaker": "plaintiff",
        "speakerName": "赵活人",
        "avatar": "👩‍💼",
        "text": "我只说了“累了要睡”，他就给我配蜡烛发朋友圈！姑姑连打11个电话，我还没睡着，先忙着证明自己活着。我要他把照片删了，发条澄清。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-603",
        "speaker": "defendant",
        "speakerName": "钱阎王",
        "avatar": "👨‍💼",
        "text": "我悼念的是一起开黑的电竞英灵，不是咒他。我以为朋友看见“鸽王”就懂这是玩笑。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-604",
        "speaker": "plaintiff",
        "speakerName": "赵活人",
        "avatar": "👩‍💼",
        "text": "截图里已有14人说一路走好。懂梗的是你，接姑姑电话的是我；你没问过我能不能用这张照片。",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-602",
          "name": "姑姑来电及语音记录",
          "description": "11个未接电话和60秒语音，反映亲属误以为原告出事。",
          "icon": "🎙️",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-605",
        "speaker": "defendant",
        "speakerName": "钱阎王",
        "avatar": "👨‍💼",
        "text": "那份脱敏疗法是我自己写的玩笑草稿，不是论文。我愿意删，但希望澄清里也写清我没有恶意。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-603",
          "name": "钱阎王的脱敏玩笑草稿",
          "description": "被告自写草稿，不是学术论文，不能证明照片有治疗功效。",
          "icon": "🕯️",
          "owner": "defendant"
        },
        "tiltChange": -20,
        "danmaku": []
      },
      {
        "id": "turn-606",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "玩梗动机与实际误导分开看。请补充可见范围和澄清情况；请真人陪审投票，我将根据票决宣读裁决。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "删除相关照片并在原可见范围澄清。",
        "未经同意不再用他人照片制作追悼玩笑。"
      ],
      "quote": "“肉身尚在人间喘气，岂容好友朋友圈出殡？友谊的小舟就算翻了，也不能直接换成白纸扎的棺材！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "说明这条朋友圈是玩梗，不再扩大误解。"
      ],
      "quote": "“生死看淡，不服就干！鸽掉五排的人在精神上确实已经死了，发个讣告不过是尊重事实！”"
    },
    "agents": {
      "plaintiff": {
        "id": "case-cyber-funeral-plaintiff",
        "name": "赵活人",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。气急但清楚，要求公开澄清",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-cyber-funeral-defendant",
        "name": "钱阎王",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。爱玩梗嘴硬，逐渐承认误导",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-cyber-funeral-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    }
  },
  {
    "id": "case-toxic-smoothie",
    "title": "香菜折耳根皮蛋榨汁命名为“能量代餐”给室友喝案",
    "caseNumber": "【互破奇字第20261117-07号】",
    "category": "猎奇幽默",
    "tags": [
      "预置排练",
      "生化投毒",
      "折耳根之怒",
      "黑暗料理"
    ],
    "summary": "钱女巫把一斤折耳根、香菜、两枚皮蛋和半勺陈醋打成饮品，称为“抹茶奶盖”递给室友。刘受害喝下半杯后干呕并就诊，要求道歉和说明配料。饮品的健康功效尚无证据。",
    "plaintiffName": "刘受害",
    "plaintiffTitle": "原告 · 直白描述自己喝到什么",
    "defendantName": "钱女巫",
    "defendantTitle": "被告 · 热心冒失",
    "coreClash": "将自然界最刺激的三大食材融合喂给朋友，属于健康善意分享还是反人类生化恐怖袭击？",
    "evidences": [
      {
        "id": "ev-701",
        "name": "杯底残留照片",
        "description": "原告提交的墨绿色饮品残留照片；成分以配料陈述为准，未做化验。",
        "icon": "🧪",
        "owner": "plaintiff"
      },
      {
        "id": "ev-702",
        "name": "门诊就诊记录",
        "description": "记录原告饮用后干呕并前来就诊的主诉；不能单独确立因果或健康功效。",
        "icon": "🏥",
        "owner": "plaintiff"
      },
      {
        "id": "ev-703",
        "name": "钱女巫的配料笔记",
        "description": "记录一斤折耳根、香菜、两枚皮蛋、半勺陈醋；所谓排毒功效是其个人猜想。",
        "icon": "🥬",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-701",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "杯子先盖好。今天审配料有没有告知，不能拿排毒传说当医学结论。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-702",
        "speaker": "plaintiff",
        "speakerName": "刘受害",
        "avatar": "👩‍💼",
        "text": "她说这是抹茶奶盖，我喝了半杯才知道有折耳根和皮蛋。我当场干呕，后来去门诊。我要求她道歉，以后先说配料。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-703",
        "speaker": "defendant",
        "speakerName": "钱女巫",
        "avatar": "👨‍💼",
        "text": "食材是我花钱买的，我也洗过。我觉得天然食材搭一起会健康，没想到她这么难受。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-704",
        "speaker": "plaintiff",
        "speakerName": "刘受害",
        "avatar": "👩‍💼",
        "text": "天然不等于我愿意喝。病历能记录我的就诊和主诉；你递杯时为什么不直接说这是皮蛋汁？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-702",
          "name": "门诊就诊记录",
          "description": "记录原告饮用后干呕并前来就诊的主诉；不能单独确立因果或健康功效。",
          "icon": "🏥",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-705",
        "speaker": "defendant",
        "speakerName": "钱女巫",
        "avatar": "👨‍💼",
        "text": "我怕说出来你不尝，就换了名字，这是我不对。那份协同假说是我的猜想，不能证明排毒，我收回这个宣传。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-703",
          "name": "钱女巫的配料笔记",
          "description": "记录一斤折耳根、香菜、两枚皮蛋、半勺陈醋；所谓排毒功效是其个人猜想。",
          "icon": "🥬",
          "owner": "defendant"
        },
        "tiltChange": -20,
        "danmaku": []
      },
      {
        "id": "turn-706",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "已告知的成分、就诊记录和个人猜想分别入卷。具体不适原因仍需证据，不凭一句排毒下结论。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "向室友道歉，提供完整配料说明。",
        "后续分享饮品先告知成分，不宣传未经证实的功效。"
      ],
      "quote": "“折耳根虽好，不可强灌于人；皮蛋虽香，不可破壁打浆！寝室不是切尔诺贝利，室友不是神农尝百草的试验田！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "饮品由各人自愿选择，配料仍应提前说清。"
      ],
      "quote": "“良药从不讨喜，神水自当难咽！虽然气味如同地狱，但轻盈四斤的身躯不会说谎！”"
    },
    "agents": {
      "plaintiff": {
        "id": "case-toxic-smoothie-plaintiff",
        "name": "刘受害",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。直白描述自己喝到什么，重视知情选择",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-toxic-smoothie-defendant",
        "name": "钱女巫",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。热心冒失，面对记录能收回功效宣传",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-toxic-smoothie-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    }
  },
  {
    "id": "case-paramecium-reincarnation",
    "title": "算命算出发小下辈子变成草履虫提前索取孝心案",
    "caseNumber": "【互破奇字第20261117-08号】",
    "category": "当代玄学",
    "tags": [
      "预置排练",
      "前世今生",
      "草履虫孝心",
      "玄学绑架"
    ],
    "summary": "李天师声称孙无辜下辈子会成为自家鱼缸里的草履虫，要求本世每周请两次全糖烧仙草以报恩。孙无辜提交十余份账单，要求停止索取；李天师称是朋友间的轮回玩笑。",
    "plaintiffName": "孙无辜",
    "plaintiffTitle": "原告 · 清醒吐槽",
    "defendantName": "李天师",
    "defendantTitle": "被告 · 爱编神秘学故事",
    "coreClash": "下辈子的跨物种抚养因果，能否作为本辈子敲诈奶茶的合法民事债权凭证？",
    "evidences": [
      {
        "id": "ev-801",
        "name": "李天师手绘草履虫图",
        "description": "被告自行绘制，并非轮回或债务的科学证明。",
        "icon": "🧫",
        "owner": "defendant"
      },
      {
        "id": "ev-802",
        "name": "十余份奶茶账单",
        "description": "全糖烧仙草账单，备注为“报养育之恩”；是否自愿需结合聊天核实。",
        "icon": "🧋",
        "owner": "plaintiff"
      },
      {
        "id": "ev-803",
        "name": "李天师自编轮回宣言",
        "description": "被告自创的玩笑文本，不属于任何组织发布的法律或规则。",
        "icon": "🌌",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-801",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "本庭只审这辈子的奶茶账单，下辈子的鱼缸不在取证范围。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-802",
        "speaker": "plaintiff",
        "speakerName": "孙无辜",
        "avatar": "👩‍💼",
        "text": "他说我下辈子是他养的草履虫，要我每周买两次烧仙草，还得叫恩公。我不买就被说不孝。我要求停止索取。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-803",
        "speaker": "defendant",
        "speakerName": "李天师",
        "avatar": "👨‍💼",
        "text": "草履虫是我算出来的，奶茶是我们平时的玩笑。我觉得他也乐意配合，并没真签什么轮回合同。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-804",
        "speaker": "plaintiff",
        "speakerName": "孙无辜",
        "avatar": "👩‍💼",
        "text": "这十余份账单都备注“报养育之恩”。我拒绝后你就拉黑，玩笑怎么还配催收？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-802",
          "name": "十余份奶茶账单",
          "description": "全糖烧仙草账单，备注为“报养育之恩”；是否自愿需结合聊天核实。",
          "icon": "🧋",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-805",
        "speaker": "defendant",
        "speakerName": "李天师",
        "avatar": "👨‍💼",
        "text": "那张解剖图和轮回宣言都是我画、我写的，不能证明债务。如果他明确不乐意，我不该继续要。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-803",
          "name": "李天师自编轮回宣言",
          "description": "被告自创的玩笑文本，不属于任何组织发布的法律或规则。",
          "icon": "🌌",
          "owner": "defendant"
        },
        "tiltChange": -20,
        "danmaku": []
      },
      {
        "id": "turn-806",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "自编宣言不能创设他人的义务。双方可补充付款时的聊天记录，我会区分自愿请客与施压索取。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "停止以轮回报恩为由索取奶茶。",
        "双方核对账单，协商处理非自愿请客部分。"
      ],
      "quote": "“今生且把今生过，莫向来世算细账！人若活在自己的胡思乱想里，连池塘里的青苔都会找你要抚养费！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "轮回故事只当玩笑，今后的请客要明确自愿。"
      ],
      "quote": "“茫茫宇宙，寄蜉蝣于天地，渺沧海之一粟。能提前为下辈子的单细胞发小备下一缸清泉，何尝不是一种极致的浪漫？”"
    },
    "agents": {
      "plaintiff": {
        "id": "case-paramecium-reincarnation-plaintiff",
        "name": "孙无辜",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。清醒吐槽，拒绝被朋友强加债务",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-paramecium-reincarnation-defendant",
        "name": "李天师",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。爱编神秘学故事，嘴硬但承认是自创",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-paramecium-reincarnation-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    }
  },
  {
    "id": "case-hot-water-plant",
    "title": "给公司发财树浇沸水辩称“怕冬天植物着凉”案",
    "caseNumber": "【互破奇字第20261117-09号】",
    "category": "职场黑洞",
    "tags": [
      "预置排练",
      "阎王善意",
      "开水烫树",
      "发财树之死"
    ],
    "summary": "冬日气温降到零度，实习生白纯纯向公司价值八千元的发财树连浇三壶沸水，次日树叶发黑。主管钱头秃称自己受了连带批评，要求分清责任；白纯纯称本想给树保暖。",
    "plaintiffName": "钱头秃",
    "plaintiffTitle": "原告 · 务实、怕背锅",
    "defendantName": "白纯纯",
    "defendantTitle": "被告 · 紧张坦诚",
    "coreClash": "以满腔纯善之爱行毁灭性开水烫树之举，到底属于正能量关怀还是应当严惩的过失杀树罪？",
    "evidences": [
      {
        "id": "ev-901",
        "name": "发财树次日照片",
        "description": "叶片发黑，原告称是浇沸水后次日拍摄；未做专业鉴定。",
        "icon": "🪴",
        "owner": "plaintiff"
      },
      {
        "id": "ev-902",
        "name": "茶水间与花盆监控",
        "description": "可见被告取三壶冒着白气的水后浇树，水温来自被告陈述。",
        "icon": "📹",
        "owner": "plaintiff"
      },
      {
        "id": "ev-903",
        "name": "白纯纯养树日记",
        "description": "记录其担心气温零度使树受冻的想法，不能证明热水养树正确。",
        "icon": "📖",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-901",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "树没能来，本庭看照片和录像。先分清浇水经过，再看主管承担了什么损失。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-902",
        "speaker": "plaintiff",
        "speakerName": "钱头秃",
        "avatar": "👩‍💼",
        "text": "三壶沸水下去，第二天办公室像煮白菜汤。我是带教主管，被老板批评。我要分清谁操作、谁应负责，不能全算我头上。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-903",
        "speaker": "defendant",
        "speakerName": "白纯纯",
        "avatar": "👨‍💼",
        "text": "水是我浇的。那天气温零度，窗边很冷，我真以为热水能给树保暖，没有想毁坏公司东西。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-904",
        "speaker": "plaintiff",
        "speakerName": "钱头秃",
        "avatar": "👩‍💼",
        "text": "录像里能看见你连倒三壶。善意我可以听，但操作前为什么不问人？八千元是案卷标价，也该拿购买凭证核实。",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-902",
          "name": "茶水间与花盆监控",
          "description": "可见被告取三壶冒着白气的水后浇树，水温来自被告陈述。",
          "icon": "📹",
          "owner": "plaintiff"
        },
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-905",
        "speaker": "defendant",
        "speakerName": "白纯纯",
        "avatar": "👨‍💼",
        "text": "日记能说明我的想法，不能证明方法正确。我愿意补学养护，也希望赔偿按实际损失谈，别只按老板的气话算。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-903",
          "name": "白纯纯养树日记",
          "description": "记录其担心气温零度使树受冻的想法，不能证明热水养树正确。",
          "icon": "📖",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-906",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "动机、操作过错和损失金额分别核实。年终奖是否受影响也需凭证，不能把批评直接写成扣款。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "主管与实习生共同核对实际损失及责任。",
        "养护前查清方法，不再给树喝沸水。"
      ],
      "quote": "“爱不是不顾常识的沸水，爱是恰到好处的常温！你的同理心再滚烫，也不能直接把发财树烫成火锅配菜！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "补上植物养护常识，损失金额另行核实。"
      ],
      "quote": "“水虽沸腾，心如冰雪！在功利冷漠的职场里，连发财树都得到了一壶热水的温存，何尝不是人间不可多得的温情奇迹？”"
    },
    "agents": {
      "plaintiff": {
        "id": "case-hot-water-plant-plaintiff",
        "name": "钱头秃",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。务实、怕背锅，关注实际责任",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-hot-water-plant-defendant",
        "name": "白纯纯",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。紧张坦诚，善意不能替代常识",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-hot-water-plant-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    }
  },
  {
    "id": "case-yogurt-lid",
    "title": "喝酸奶不舔盖并当面扔进垃圾桶故意精神折磨案",
    "caseNumber": "【互破奇字第20261117-10号】",
    "category": "猎奇幽默",
    "tags": [
      "预置排练",
      "酸奶之魂",
      "暴殄天物",
      "强迫症处刑"
    ],
    "summary": "高暴发当着同事王不浪费的面，把十五元酸奶的盖子连同残留酸奶扔入垃圾桶并盖上纸巾。王不浪费认为其挑眉是在嘲讽节俭，要求道歉；高暴发坚持自己有不舔盖的自由。",
    "plaintiffName": "王不浪费",
    "plaintiffTitle": "原告 · 节俭敏感",
    "defendantName": "高暴发",
    "defendantTitle": "被告 · 讲究个人选择、嘴欠",
    "coreClash": "酸奶盖上的那层厚奶到底谁有权利决定它的生死？不舔盖并公然处决算不算精神霸凌？",
    "evidences": [
      {
        "id": "ev-1001",
        "name": "垃圾桶酸奶盖照片",
        "description": "可见酸奶残留与覆盖纸巾；未称量残留重量。",
        "icon": "🥛",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1002",
        "name": "王不浪费手环记录",
        "description": "记录当时心率波动，不属于心脏疾病或精神损伤诊断。",
        "icon": "⌚",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1003",
        "name": "高暴发的消费选择说明",
        "description": "被告自述不想舔盖，属于个人偏好，不是医学或心理学报告。",
        "icon": "💄",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1001",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "酸奶归谁，与说话是否尊重人，是两个问题。原告先说自己的诉求。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-1002",
        "speaker": "plaintiff",
        "speakerName": "王不浪费",
        "avatar": "👩‍💼",
        "text": "我刚说“不吃可以给我”，他就把盖子扔了，还冲我挑眉。我不是要强迫他舔盖，我是觉得他拿我节俭当笑话。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-1003",
        "speaker": "defendant",
        "speakerName": "高暴发",
        "avatar": "👨‍💼",
        "text": "酸奶是我花十五元买的，我不想舔盖。扔掉后盖纸巾是怕弄脏垃圾桶，不代表我看不起他。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1004",
        "speaker": "plaintiff",
        "speakerName": "王不浪费",
        "avatar": "👩‍💼",
        "text": "照片能证明盖上还有酸奶，手环能记录我当时激动，但不能读出你的心。我想问：你当时有没有嘲笑我？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1002",
          "name": "王不浪费手环记录",
          "description": "记录当时心率波动，不属于心脏疾病或精神损伤诊断。",
          "icon": "⌚",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1005",
        "speaker": "defendant",
        "speakerName": "高暴发",
        "avatar": "👨‍💼",
        "text": "我说过一句“资本的味道”，确实嘴欠。我可以为这句话道歉；但不舔盖这件事，希望他也尊重我的选择。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-1003",
          "name": "高暴发的消费选择说明",
          "description": "被告自述不想舔盖，属于个人偏好，不是医学或心理学报告。",
          "icon": "💄",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1006",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "本庭区分个人饮食选择与当面嘲讽。手环数据不能直接证明医学损伤，双方可继续补充原话和现场情况。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "为当面嘲讽节俭的言语道歉。",
        "个人饮食选择不作为相互羞辱的话题。"
      ],
      "quote": "“你可以不爱舔盖，但不能在饥渴的灵魂面前公开行刑！一粥一饭当思来之不易，盖上凝乳岂容轻薄践踏！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "不强迫他人舔盖，节俭习惯也应受到尊重。"
      ],
      "quote": "“放手也是一种修行，不舔方能见得天地！把盖子丢掉的那一刻，丢掉的是对物质的执念，拾起的是独立的人格！”"
    },
    "agents": {
      "plaintiff": {
        "id": "case-yogurt-lid-plaintiff",
        "name": "王不浪费",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。节俭敏感，诉求是尊重",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-yogurt-lid-defendant",
        "name": "高暴发",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。讲究个人选择、嘴欠，能为嘲笑道歉",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-yogurt-lid-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    }
  },
  {
    "id": "case-wechat-are-you-there",
    "title": "微信只发『在吗』蒸发两小时案",
    "caseNumber": "【互破初字第20261117-11号】",
    "category": "社交礼仪",
    "tags": [
      "预置排练",
      "社交窒息",
      "精神恐吓",
      "在吗犯罪"
    ],
    "summary": "吴在吗在14:03发来“在吗”，周秒回8秒后回复“在的，怎么了”，等到16:03才看到对方晒猫吃草莓，仍未收到事项说明。周秒回要求有事直说；吴在吗称猫打翻水杯使自己中断聊天。",
    "plaintiffName": "周秒回",
    "plaintiffTitle": "原告 · 容易焦虑",
    "defendantName": "吴在吗",
    "defendantTitle": "被告 · 散漫健忘",
    "coreClash": "发“在吗”不带事由，究竟是基本礼貌试探，还是对他人心理防线的恐怖袭击？",
    "agents": {
      "plaintiff": {
        "id": "case-wechat-are-you-there-plaintiff",
        "name": "周秒回",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。容易焦虑，想约定沟通习惯",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-wechat-are-you-there-defendant",
        "name": "吴在吗",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。散漫健忘，重视不用即时回复的自由",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-wechat-are-you-there-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    },
    "evidences": [
      {
        "id": "ev-1101",
        "name": "14:03至16:03聊天与动态截图",
        "description": "14:03收到“在吗”，8秒后回复“在的，怎么了”；16:03看见晒猫吃草莓动态，仍未收到事项说明。",
        "icon": "📱",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1102",
        "name": "周秒回搜索记录",
        "description": "包括借钱与裁员相关搜索，反映其担忧，不证明被告恶意。",
        "icon": "🔍",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1103",
        "name": "吴在吗的中断聊天说明",
        "description": "自述猫打翻水杯后忘记回复，尚无独立记录印证。",
        "icon": "🐱",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1101",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "今天没有未读红点庭审。先说消息时间，再说对回复速度的合理期待。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-1102",
        "speaker": "plaintiff",
        "speakerName": "周秒回",
        "avatar": "👩‍💼",
        "text": "他14:03问在吗，我8秒后回了，到16:03还不知道什么事，却看到他晒猫吃草莓。我脑补了借钱和裁员。以后能不能有事直说？",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1103",
        "speaker": "defendant",
        "speakerName": "吴在吗",
        "avatar": "👨‍💼",
        "text": "我先问是怕打扰。猫突然打翻水杯，我去收拾了，后来发动态时忘了回，不是故意吊他胃口。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1104",
        "speaker": "plaintiff",
        "speakerName": "周秒回",
        "avatar": "👩‍💼",
        "text": "搜索记录能证明我确实焦虑，不能证明你必须随叫随到。但你既然有空发动态，补一句“晚点说”很难吗？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1102",
          "name": "周秒回搜索记录",
          "description": "包括借钱与裁员相关搜索，反映其担忧，不证明被告恶意。",
          "icon": "🔍",
          "owner": "plaintiff"
        },
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-1105",
        "speaker": "defendant",
        "speakerName": "吴在吗",
        "avatar": "👨‍💼",
        "text": "不难，这次我漏回了。我愿意以后把事和在吗一起发，但也希望别把两小时没回直接理解成恶意。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-1103",
          "name": "吴在吗的中断聊天说明",
          "description": "自述猫打翻水杯后忘记回复，尚无独立记录印证。",
          "icon": "🐱",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1106",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "事实是询问后长时间未说明事项，恶意尚不能据此认定。双方可谈消息习惯；我将根据真人陪审投票宣读裁决。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "有事尽量随消息说明，临时中断时补一句告知。",
        "双方约定可接受的回复节奏。"
      ],
      "quote": "“有事说事是成年人最后的体面，‘在吗’二字实乃赛博时代的生化疑云！即刻起，凡发‘在吗’者，天下共诛之！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "尊重延迟回复的空间，避免由两字推定恶意。"
      ],
      "quote": "“不被消息绑架，才是数字时代的真正自由。让对话自然流淌，别给每一个像素都强加生死存亡的戏码。”"
    }
  },
  {
    "id": "case-boba-diet-fraud",
    "title": "微糖奶茶加五料自称减肥案",
    "caseNumber": "【互破初字第20261117-12号】",
    "category": "猎奇幽默",
    "tags": [
      "预置排练",
      "热量欺诈",
      "虚假自律",
      "奶茶玄学"
    ],
    "summary": "同住减肥期间，钱微糖每天点三分微糖奶茶，另加波霸、布丁、麻薯、红豆和双倍厚乳芝士奶盖，并称自己严格控糖。郑热量认为她忽略小料后反复抱怨体重，打扰共同打卡。实际热量未检测。",
    "plaintiffName": "郑热量",
    "plaintiffTitle": "原告 · 数字务实但不越界",
    "defendantName": "钱微糖",
    "defendantTitle": "被告 · 爱快乐小料",
    "coreClash": "微糖奶茶狂加小料，属于合理心理自我安慰，还是公然挑衅科学与室友智商的欺诈犯罪？",
    "agents": {
      "plaintiff": {
        "id": "case-boba-diet-fraud-plaintiff",
        "name": "郑热量",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。数字务实但不越界，拒绝情绪客服工作",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-boba-diet-fraud-defendant",
        "name": "钱微糖",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。爱快乐小料，能分开食物选择与共同约定",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-boba-diet-fraud-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    },
    "evidences": [
      {
        "id": "ev-1201",
        "name": "加料奶茶照片与订单",
        "description": "订单列出三分糖、波霸、布丁、麻薯、红豆、双倍厚乳芝士奶盖；照片不能测定全杯热量。",
        "icon": "🥤",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1202",
        "name": "钱微糖的心理代偿笔记",
        "description": "自我安慰的文字，无科研或减肥功效证据。",
        "icon": "📜",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1201",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "微糖是糖度选项，不是全杯热量鉴定。原告说清楚共同打卡出了什么问题。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-1202",
        "speaker": "plaintiff",
        "speakerName": "郑热量",
        "avatar": "👩‍💼",
        "text": "我们约好一起打卡。她选微糖，却加了五种小料，晚上又对我喊“连糖都不吃怎么还长肉”。我要求别把我当体重秤客服。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 20,
        "danmaku": []
      },
      {
        "id": "turn-1203",
        "speaker": "defendant",
        "speakerName": "钱微糖",
        "avatar": "👨‍💼",
        "text": "小料确实是我选的。奶茶是我下班后的快乐，三分糖也是我愿意做的控制，我没逼他跟着喝。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -20,
        "danmaku": []
      },
      {
        "id": "turn-1204",
        "speaker": "plaintiff",
        "speakerName": "郑热量",
        "avatar": "👩‍💼",
        "text": "这张照片里吸管都能立住，但我不能只靠照片报热量。我烦的是你一边说严格控糖，一边让我每天分析原因。",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1201",
          "name": "加料奶茶照片与订单",
          "description": "订单列出三分糖、波霸、布丁、麻薯、红豆、双倍厚乳芝士奶盖；照片不能测定全杯热量。",
          "icon": "🥤",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1205",
        "speaker": "defendant",
        "speakerName": "钱微糖",
        "avatar": "👨‍💼",
        "text": "我那份心理代偿报告是自我安慰，没有科研依据。我可以停止拉他复盘体重，但这杯快乐我想自己决定。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-1202",
          "name": "钱微糖的心理代偿笔记",
          "description": "自我安慰的文字，无科研或减肥功效证据。",
          "icon": "📜",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1206",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "本庭不凭照片估算卡路里。争议在共同约定与情绪劳动，个人饮食选择也应被尊重。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "停止把微糖选项等同于全杯低热量。",
        "体重焦虑先征求对方是否愿意倾听。"
      ],
      "quote": "“你可以大口喝粥，但不能欺骗脂肪！每一粒吸进肚子里的波霸，都会在秤砣上诚实地兑现因果报应！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "饮食选择由本人决定，共同打卡可以重新协商。"
      ],
      "quote": "“生活已经如此微苦，何必再与三两波霸斤斤计较？快乐是唯一的熵减，嚼就完事了！”"
    }
  },
  {
    "id": "case-microwave-stinky-tofu",
    "title": "微波炉热螺蛳粉加臭豆腐案",
    "caseNumber": "【互破初字第20261117-13号】",
    "category": "职场黑洞",
    "tags": [
      "预置排练",
      "生化武器",
      "嗅觉创伤",
      "茶水间暴行"
    ],
    "summary": "段重味用公共微波炉高火加热螺蛳粉与臭豆腐7分钟，未盖盒盖，汤汁溅出。何清香称气味影响办公和后续使用，要求清洁并约定使用规则；段重味反对把个人口味当作过错。",
    "plaintiffName": "何清香",
    "plaintiffTitle": "原告 · 克制务实",
    "defendantName": "段重味",
    "defendantTitle": "被告 · 热爱地方美食",
    "coreClash": "在公司密闭空间加热极致发酵食品，是打工人的午餐自由还是生化恐袭？",
    "agents": {
      "plaintiff": {
        "id": "case-microwave-stinky-tofu-plaintiff",
        "name": "何清香",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。克制务实，关心清洁和公共空间",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-microwave-stinky-tofu-defendant",
        "name": "段重味",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。热爱地方美食，反对歧视也承担清洁",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-microwave-stinky-tofu-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    },
    "evidences": [
      {
        "id": "ev-1301",
        "name": "微波炉使用后照片",
        "description": "可见炉壁汤汁残留；没有空气检测或设备损坏鉴定。",
        "icon": "🧫",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1302",
        "name": "段重味的风味说明",
        "description": "被告说明个人饮食偏好，不是任何国际组织背书。",
        "icon": "📜",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1301",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "先开窗，再开庭。本案审公共设备怎么用，不评哪种地方美食高贵。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-1302",
        "speaker": "plaintiff",
        "speakerName": "何清香",
        "avatar": "👩‍💼",
        "text": "他高火热了7分钟，还没盖盖。汤汁溅满炉壁，我后面热牛奶也闻到酸笋味。我要求清洁，别让下一位继承午餐。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1303",
        "speaker": "defendant",
        "speakerName": "段重味",
        "avatar": "👨‍💼",
        "text": "我承认盒子没盖好。但螺蛳粉和臭豆腐是正常食物，不能因为你不爱闻，就说我吃的是生化武器。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1304",
        "speaker": "plaintiff",
        "speakerName": "何清香",
        "avatar": "👩‍💼",
        "text": "我没要求你戒口。这张现场照片里是实打实的汤汁，公共设备用完清理，和歧视口味是两回事。",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1301",
          "name": "微波炉使用后照片",
          "description": "可见炉壁汤汁残留；没有空气检测或设备损坏鉴定。",
          "icon": "🧫",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1305",
        "speaker": "defendant",
        "speakerName": "段重味",
        "avatar": "👨‍💼",
        "text": "清理我认。那份风味说明只能解释我为什么爱吃，不能抵消别人受影响；以后重味午餐我会先沟通。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-1302",
          "name": "段重味的风味说明",
          "description": "被告说明个人饮食偏好，不是任何国际组织背书。",
          "icon": "📜",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1306",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "气味感受与设备残留分别记录。未经检测不能宣称有毒或通风系统瘫痪，本庭依据已提交材料裁决。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "清洁使用后留下的炉壁汤汁。",
        "共同约定加盖、清理及重味午餐的使用方式。"
      ],
      "quote": "“你可以深爱酸笋，但不能把全办公室当成生化试验场！自由以不侵犯他人的呼吸道为不可逾越之红线！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "不贬低地方饮食，公共设备的清洁责任仍要遵守。"
      ],
      "quote": "“真正的包容，是能容得下酸笋的浓烈，也能品得出人间的烟火。愿世间少一些嗅觉偏见，多一份舌尖大同。”"
    }
  },
  {
    "id": "case-elevator-fart-blame",
    "title": "电梯偷放无声臭屁抢先瞪人案",
    "caseNumber": "【互破初字第20261117-14号】",
    "category": "当代玄学",
    "tags": [
      "预置排练",
      "恶人先告状",
      "生化嫁祸",
      "影帝演技"
    ],
    "summary": "八人同乘晚高峰电梯时出现异味，戴影帝捂鼻看向方老实，引得其他乘客跟着看。方老实怀疑对方先放屁再嫁祸，要求澄清；监控只有动作、没有气味信息，尚不能确认来源。",
    "plaintiffName": "方老实",
    "plaintiffTitle": "原告 · 委屈谨慎",
    "defendantName": "戴影帝",
    "defendantTitle": "被告 · 反应快、幽默",
    "coreClash": "放屁嫁祸他人属于自保本能，还是极度阴险狡诈的道德谋杀？",
    "agents": {
      "plaintiff": {
        "id": "case-elevator-fart-blame-plaintiff",
        "name": "方老实",
        "model": "预置排练",
        "persona": "你是原告本人，以第一人称陈述。委屈谨慎，分清怀疑与证据",
        "avatar": "👩‍💼"
      },
      "defendant": {
        "id": "case-elevator-fart-blame-defendant",
        "name": "戴影帝",
        "model": "预置排练",
        "persona": "你是被告本人，以第一人称回应。反应快、幽默，要求不凭动作定责",
        "avatar": "👨‍💼"
      },
      "judge": {
        "id": "case-elevator-fart-blame-judge",
        "name": "赛博破事大法官",
        "model": "预置排练",
        "persona": "主持质询，区分事实与主张，依据案卷裁决；根据真人陪审投票宣读裁决。",
        "avatar": "👨‍⚖️"
      }
    },
    "evidences": [
      {
        "id": "ev-1401",
        "name": "电梯监控慢放",
        "description": "八人同乘，能看见侧身、微笑、捂鼻和视线变化；不能记录气味或证明来源。",
        "icon": "📹",
        "owner": "plaintiff"
      },
      {
        "id": "ev-1402",
        "name": "戴影帝的现场说明",
        "description": "被告自述转头是寻找气味来源，属于其解释，不是生理鉴定。",
        "icon": "👁️",
        "owner": "defendant"
      }
    ],
    "turns": [
      {
        "id": "turn-1401",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "监控录得到动作，录不到气味。今天先把已见事实与各自猜测分开。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      },
      {
        "id": "turn-1402",
        "speaker": "plaintiff",
        "speakerName": "方老实",
        "avatar": "👩‍💼",
        "text": "他先捂鼻看我，其他七个人里也有人跟着盯我。我连解释机会都没有。我怀疑是他放的，更想让他澄清：他并不知道是谁。",
        "emotion": "angry",
        "shout": "TAKE_THAT",
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1403",
        "speaker": "defendant",
        "speakerName": "戴影帝",
        "avatar": "👨‍💼",
        "text": "我确实看向他，但那不是宣布破案。电梯里八个人，我闻到味就转头，不能因为我先皱眉就认定是我。",
        "emotion": "confident",
        "shout": "OBJECTION",
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1404",
        "speaker": "plaintiff",
        "speakerName": "方老实",
        "avatar": "👩‍💼",
        "text": "慢放能看到你先侧身、再笑、再捂鼻。我觉得像在演，但也承认这些动作不能单独证明气味来源。你为什么一直看我？",
        "emotion": "shocked",
        "shout": "HOLD_IT",
        "evidence": {
          "id": "ev-1401",
          "name": "电梯监控慢放",
          "description": "八人同乘，能看见侧身、微笑、捂鼻和视线变化；不能记录气味或证明来源。",
          "icon": "📹",
          "owner": "plaintiff"
        },
        "tiltChange": 25,
        "danmaku": []
      },
      {
        "id": "turn-1405",
        "speaker": "defendant",
        "speakerName": "戴影帝",
        "avatar": "👨‍💼",
        "text": "侧身是腰酸，笑是想到别的事，这些也只是我的解释。我可以明确说：我没有证据指认他。欲加之罪，何患无屁。",
        "emotion": "smug",
        "shout": "TAKE_THAT",
        "evidence": {
          "id": "ev-1402",
          "name": "戴影帝的现场说明",
          "description": "被告自述转头是寻找气味来源，属于其解释，不是生理鉴定。",
          "icon": "👁️",
          "owner": "defendant"
        },
        "tiltChange": -15,
        "danmaku": []
      },
      {
        "id": "turn-1406",
        "speaker": "judge",
        "speakerName": "赛博破事大法官",
        "avatar": "👨‍⚖️",
        "text": "双方都不能凭一个眼神锁定来源。是否形成误导、如何澄清仍可讨论，本庭不会把推测写成已查明事实。",
        "emotion": "gavel",
        "shout": "ORDER",
        "tiltChange": 0,
        "danmaku": []
      }
    ],
    "plaintiffVerdict": {
      "result": "【排练示例】依据陪审票决，支持原告的主要诉求。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "向同梯人员澄清没有证据指认方老实。",
        "不再用目光或暗示带动无依据的指责。"
      ],
      "quote": "“放屁事小，栽赃事大！你可以放纵肠胃的喧嚣，但绝不能以他人的清白作为掩护自己尴尬的挡箭牌！”"
    },
    "defendantVerdict": {
      "result": "【排练示例】依据陪审票决，支持被告的主要回应。这是娱乐裁决，不代表所有事实均已查明。",
      "penalty": [
        "不凭微表情认定气味来源，双方停止公开猜测。"
      ],
      "quote": "“在无声的微风中，每个人都在寻找替罪羊。与其追究风的来向，不如学会更快地捂住鼻腔。”"
    }
  }
];
