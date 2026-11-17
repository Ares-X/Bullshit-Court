# 像素演员素材

这组素材用于荒诞幽默的互联网法庭游戏平台，演员形象不会替换案件里的姓名或事实。

## 交付

| 剧组 | PNG | 法官 | 原告 / 被告 |
| --- | --- | --- | --- |
| everyday | `public/assets/casts/everyday-pixel.png` | 包薯：圆滚滚、一本正经的仓鼠 | 刺猬 / 松弛水豚 |
| city | `public/assets/casts/city-pixel.png` | 咕判：学院派眼镜猫头鹰女法官 | 企鹅 / 狐狸 |
| night | `public/assets/casts/night-pixel.png` | 骨班：捧茶杯、温柔疲惫的加班骷髅 | 黑猫 / 浣熊 |

每张 PNG 是 971 × 1619 的 RGBA 原创栅格图，三列依次为 plaintiff、judge、defendant，五行依次为 neutral、speaking、questioning、confident、shocked，共 45 个表情。透明 alpha 保留，未用 SVG 或 CSS 轮廓代替角色画作，也未对生成图片做代码绘图或像素化滤镜。

裁切坐标由实际 alpha > 64 的可见内容范围测量，并增加四像素安全边，位于 `src/data/pixelAtlases.ts`。生成输出中各角色姿势和边界并非机械等分，因此消费者应使用元数据，避免直接用画幅除以 3 或 5。非常低 alpha 的边缘噪点不参与可见内容测量。

## 生成和检查

使用内置 `image_gen.imagegen`（透明背景模式），一次并行生成三张，各一张选用。没有调用 API / CLI fallback，没有新增依赖。已目视检查三张完整 atlas：角色和五种表情对应、无文字、无背景场景、各列角色分离，像素阶梯轮廓和块状阴影可辨识。PNG alpha 范围均为 0–255。

读取 PNG 检查了所有 45 个裁切框非空（每框 alpha > 64 像素数超过 1000）、框在图片范围内、同一行的角色框不重叠。编译由主任务集成时验证。

## 最终 prompt set

### everyday

```text
Use case: stylized-concept. Asset type: production raster sprite atlas for a humorous courtroom browser game.
Create one TRANSPARENT PNG sprite sheet containing exactly 15 distinct waist-up character portraits, arranged in a rigorously regular THREE COLUMNS by FIVE ROWS grid. Canvas portrait aspect 3:5. All 15 cells have equal dimensions and each has large fully transparent gutters, including outer edges. No borders, no grid lines, no background, no text. Each portrait fully contained in its cell, same scale, consistent baseline.
This must be REAL low-resolution PIXEL ART: deliberate chunky square pixel clusters, hard stair-step silhouettes, limited 20-color palette, flat 2-3 tone shading, retro 16-bit adventure game sprites. Target visual resolution 96x96 pixels per character, visibly blocky pixel outlines enlarged with nearest-neighbor character. No antialiasing, no soft edges, no gradients, no painterly cartoon, no vector, no 3D, no chibi sticker gloss.
Columns from left to right: PLAINTIFF, JUDGE, DEFENDANT. Rows top to bottom: 1 neutral mouth closed; 2 speaking mouth open gesturing; 3 questioning suspicious raised eyebrow with curious gesture; 4 confident proud assertive pose; 5 shocked exaggerated wide eyes open mouth. Every row repeats EXACTLY the same 3 character identities and costumes with only expression and gesture changed. Humorous expressive faces must be readable at small size. Keep animal faces and small hands visible. No scenery or floating props crossing cells.
Characters: LEFT plaintiff is a neurotic brown hedgehog in mustard cardigan holding a little paper, bristly spines, comically indignant eyebrows. CENTER judge is a very round chubby golden hamster with tiny solemn eyes, oversized black judicial robe and small white collar, looking absurdly serious and dignified. RIGHT defendant is a relaxed tan capybara in pale turquoise casual shirt, sleepy half-lidded eyes, unbothered slacker personality. Warm cozy amber/coral/turquoise accents.
```

### city

```text
Use case: stylized-concept. Asset type: production raster sprite atlas for a humorous courtroom browser game.
Create one TRANSPARENT PNG sprite sheet containing exactly 15 distinct waist-up character portraits, arranged in a rigorously regular THREE COLUMNS by FIVE ROWS grid. Canvas portrait aspect 3:5. All 15 cells have equal dimensions and each has large fully transparent gutters, including outer edges. No borders, no grid lines, no background, no text. Each portrait fully contained in its cell, same scale, consistent baseline.
This must be REAL low-resolution PIXEL ART: deliberate chunky square pixel clusters, hard stair-step silhouettes, limited 20-color palette, flat 2-3 tone shading, retro 16-bit adventure game sprites. Target visual resolution 96x96 pixels per character, visibly blocky pixel outlines enlarged with nearest-neighbor character. No antialiasing, no soft edges, no gradients, no painterly cartoon, no vector, no 3D, no chibi sticker gloss.
Columns from left to right: PLAINTIFF, JUDGE, DEFENDANT. Rows top to bottom: 1 neutral mouth closed; 2 speaking mouth open gesturing; 3 questioning suspicious raised eyebrow with curious gesture; 4 confident proud assertive pose; 5 shocked exaggerated wide eyes open mouth. Every row repeats EXACTLY the same 3 character identities and costumes with only expression and gesture changed. Humorous expressive faces must be readable at small size. Keep animal faces and small hands visible. No scenery or floating props crossing cells.
Characters: LEFT plaintiff is an upright officious penguin in dark navy business vest and red tie clutching paperwork, absurdly earnest. CENTER judge is a talkative female owl professor judge, brown and cream feather face, large academic round spectacles, academic cap and black judicial robe with burgundy trim and white collar, bright witty eyes, theatrical scholarly wings. RIGHT defendant is a clever orange fox with white muzzle in indigo blazer over cream shirt, sly confident city hustler personality. Cool indigo/red/gold accents.
```

### night

```text
Use case: stylized-concept. Asset type: production raster sprite atlas for a humorous courtroom browser game.
Create one TRANSPARENT PNG sprite sheet containing exactly 15 distinct waist-up character portraits, arranged in a rigorously regular THREE COLUMNS by FIVE ROWS grid. Canvas portrait aspect 3:5. All 15 cells have equal dimensions and each has large fully transparent gutters, including outer edges. No borders, no grid lines, no background, no text. Each portrait fully contained in its cell, same scale, consistent baseline.
This must be REAL low-resolution PIXEL ART: deliberate chunky square pixel clusters, hard stair-step silhouettes, limited 20-color palette, flat 2-3 tone shading, retro 16-bit adventure game sprites. Target visual resolution 96x96 pixels per character, visibly blocky pixel outlines enlarged with nearest-neighbor character. No antialiasing, no soft edges, no gradients, no painterly cartoon, no vector, no 3D, no chibi sticker gloss.
Columns from left to right: PLAINTIFF, JUDGE, DEFENDANT. Rows top to bottom: 1 neutral mouth closed; 2 speaking mouth open gesturing; 3 questioning suspicious raised eyebrow with curious gesture; 4 confident proud assertive pose; 5 shocked exaggerated wide eyes open mouth. Every row repeats EXACTLY the same 3 character identities and costumes with only expression and gesture changed. Humorous expressive faces must be readable at small size. Keep animal faces and small hands visible. No scenery or floating props crossing cells.
Characters: LEFT plaintiff is a dramatic black cat with bright yellow eyes in rumpled purple hoodie, frazzled theatrical eyebrows. CENTER judge is a gentle exhausted overworked skeleton in loose black judicial robe with muted lavender collar, friendly eye sockets and tired slumped shoulders, holding a single small teal tea mug with both bony hands, funny tender late-night office worker mood. RIGHT defendant is a scruffy grey raccoon in moss-green nightshirt, dark eye mask, sheepish mischievous midnight-snack culprit personality. Muted plum/teal/moss accents.
```

## 资源归属与清理

项目仅新增这三张选定 PNG、一份元数据和本文档，没有启动服务或创建测试浏览器。内置生成器的原始输出保留在其默认的 Codex generated_images 目录；按工具明确要求未删除原始文件，项目运行只依赖 public 下的三张素材。旧版卡通图已从当前运行资源移除，仍保存在初始 Git 提交中。
