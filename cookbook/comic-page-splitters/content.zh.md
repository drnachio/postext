# 一页三种分格

## 《珀斯科夫灯塔》第12页 · 版式校样

同一页的三种分格方案，供作者挑选。三种方案用的是同样的五幅画面和同样的对白，只有页面的分割不同，画面的裁切和对话框都随之改变。

**方案A，第2页。** 三层，中间一层分成三格。

:::paragraphs{style="split" dir=ltr}
split="30 / 35 [\* | \* | \*] / \*"
:::

**方案B，第3页。** 两栏，左栏两格，右栏三格。

:::paragraphs{style="split" dir=ltr}
split="60 [\* / \*] | \* [\* / \* / \*]"
:::

**方案C，第4页。** 上层占30%，按30 | 20 | 其余分成三格，下面是一格高画面；猫是叠在玛雅那一格上的小插格。

:::paragraphs{style="split" dir=ltr}
split="30 [30 | 20 | \*] / \*"
:::

:::paragraphs{style="imprint"}
为Postext食谱编写的故事与嵌字。画面由扩散模型生成。对白字体：站酷快乐体与站酷庆科黄油体（SIL OFL）。
:::

:::page{split="30 / 35 [* | * | *] / *"}
::panel{art=lh-arrive}
caption: 每年夏天，玛雅都会来灯塔住上一个星期。
maya: 外公！我来啦！
::panel{art=lh-radio}
tomas: 来得正好。收音机没声了，
tomas: 暴风雨要来了。
::panel{art=lh-maya}
maya: 外公……我好像找到问题了。
::panel{art=lh-biscuit}
sfx{rotate=-6}: 呼噜噜
::panel{art=lh-beam}
tomas: 收音机好了，灯也亮了。
maya: 饼干也找到新床了。
:::

:::page{split="60 [* / *] | * [* / * / *]"}
::panel{art=lh-arrive}
caption: 每年夏天，玛雅都会来灯塔住上一个星期。
maya: 外公！我来啦！
::panel{art=lh-radio}
tomas: 来得正好。收音机没声了，
tomas: 暴风雨要来了。
::panel{art=lh-maya}
maya: 外公……我好像找到问题了。
::panel{art=lh-biscuit}
sfx{rotate=-6}: 呼噜噜
::panel{art=lh-beam}
tomas: 收音机好了，灯也亮了。
maya: 饼干也找到新床了。
:::

:::page{split="30 [30 | 20 | *] / *"}
::panel{art=lh-arrive}
caption: 每年夏天，玛雅都会来灯塔住上一个星期。
maya: 外公！我来啦！
::panel{art=lh-radio}
tomas{break}: 来得正好。收音机没声了，
tomas: 暴风雨要来了。
::panel{art=lh-maya}
maya: 外公……我好像找到问题了。
::panel{art=lh-biscuit inset="50 50 46 46"}
sfx{rotate=-6}: 呼噜噜
::panel{art=lh-beam}
tomas: 收音机好了，灯也亮了。
maya: 饼干也找到新床了。
:::
