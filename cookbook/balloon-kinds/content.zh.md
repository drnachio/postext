# 嵌字样式表

## 《珀斯科夫灯塔》第3期 · 第7页

脚本的一行就是一个对话框：说话人，不是普通对白时在花括号里写明类型，一个冒号，然后是台词。下面列出的样式就是第2页上用到的。

- **对白。** :chip[tomas: 两箱吧。]{style="code"} 椭圆形；尾巴停在说话人嘴边，不碰到嘴。
- **相连。** 连续两行 :chip[tomas:]{style="code"} 合成一个轮廓，只有一条尾巴。
- **心想。** :chip[biscuit{thought}:]{style="code"} 云朵形，一串小泡泡升向头部。
- **耳语。** :chip[maya{whisper}:]{style="code"} 虚线轮廓，字小一号。
- **大喊。** :chip[tomas{shout}:]{style="code"} 爆炸形，粗体，字大一号。
- **无线电。** 船长通过电台说话：角色表让每一行 :chip[skipper:]{style="code"} 都是锯齿轮廓和锯齿尾巴。
- **旁白框。** :chip[caption:]{style="code"} 黄色方框里的叙述，贴在格子的角上。
- **内心独白。** :chip[maya{inner}:]{style="code"} 没说出口的话：没有尾巴，灰色方框。
- **编者注。** :chip[note:]{style="code"} 小字，放在格子右下角。
- **拟声词。** :chip[sfx{at="16% 28%" rotate=-10}:]{style="code"} 没有对话框：红色的大字加白边，位置和角度由人指定。
- **画外音。** :chip[tomas{tail=end}:]{style="code"} 说话人在画面之外；尾巴伸到格子边上。
- **固定位置。** :chip[skipper{at="44% 22%"}:]{style="code"} 对话框的中心固定在画面的这个点上，不管怎么裁切。

:::paragraphs{style="imprint"}
为Postext食谱编写的故事与嵌字。画面由扩散模型生成。对白字体：站酷快乐体与站酷庆科黄油体（SIL OFL）。
:::

:::page{split="32 [58 | *] / 34 [42 | *] / * [40 | *]"}
::panel{art=bk-storm}
caption: 晚上十点。暴风雨已经扑到了海角。
skipper: 珀斯科夫灯塔，这里是“塘鹅号”。发动机熄火了。我们在漂。
tomas: “塘鹅号”，我听到了。坚持住。
note{at=bottom-end}: “塘鹅号”从珀斯科夫出海打鱼已经四十年了。——编者注
::panel{art=bk-whisper}
maya{whisper}: 别怕，饼干。外公以前也干过这种事。
biscuit{thought}: 真的吗？
::panel{art=bk-shout}
tomas{shout}: “塘鹅号”！朝着灯光开！别让它离开船头！
::panel{art=bk-sea}
sfx{at="16% 28%" rotate=-10}: 轰隆隆
skipper{at="44% 22%"}: 看到了……我们看到灯光了……
tomas{tail=end}: 慢点儿。慢慢掉头。
::panel{art=bk-window}
maya{inner}: 快点。快点。快点。
caption{at=bottom-start}: 他们花了两个小时。
::panel{art=bk-morning}
caption{at=top-start}: 第二天早上。
skipper{speech tail=bottom}: 谢谢你，守塔人！我欠你一箱鱼！
tomas: 两箱吧。
tomas: 一箱给猫。
maya: 饼干说要三箱。
:::
