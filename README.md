# 潮汐羽球 1.2.0-duel.1

游戏在电脑或 iPad 的浏览器中运行。每只手柄通过低功耗蓝牙配对到运行游戏的设备，使用标准键盘输入报告发送挥拍。手柄端以 50 Hz 读取陀螺仪和加速度计，识别每拍力度和落点。在人机、双人模式中，接球前 260 毫秒内的输入可保留到球进入可击范围，最后一次够球后还有 100 毫秒容差。

## 在另一台电脑接着开发

在深圳电脑的终端运行以下命令，然后用 Codex 打开 `tideline-club` 文件夹。仓库公开，下载源码无需登录。第一次克隆请选一个新目录，保留已有的本地改动。

```sh
git clone --branch codex/playtest-baseline https://github.com/FoloToy/tideline-club.git
cd tideline-club
git switch -c codex/shenzhen-next
```

两台电脑同步某个工作分支时，先在改代码的电脑提交，经确认后用 `git push -u origin 分支名` 上传。在另一台电脑执行 `git fetch origin`，切到同名分支，再运行 `git pull --ff-only`。向公司仓库推送需要有写权限的 GitHub 账号。初次使用的试玩版本可以随时从 Git 历史找回。

| 想做什么 | 从哪里开始 |
| --- | --- |
| 直接试玩当前交付版 | 打开 [球场](playtest/Tideline-Club.html) 或 [玩家上手指南](playtest/玩家上手指南.html)。安装手柄固件见 [部署教程](playtest/给Codex的部署教程.md)。 |
| 改球场、击球时机或双人玩法 | 修改 `source/game/`。判定规则在 `match.js`，输入与首页状态在 `app.js`，渲染在 `arena.js`。打开 `source/game/index.html` 即可试玩修改后的源码。 |
| 改手柄识别或蓝牙连接 | `firmware-source/main/stroke.c` 识别挥拍，`paddle.c` 发送蓝牙键盘报告，`tideline.c` 处理采样、按键与 P1/P2。采集及导出在 `capture_*.c` 和 `firmware-source/tools/export_motion.py`。 |
| 了解两轮试玩间具体改了什么 | 从 Git 历史的首个提交（Mac mini 原试玩包）与当前提交对比。板级工程基于 `FoloToy/ai-passport@808081a9e27e98502d4fc67413f6c75bb7a32229`，QMI8658A 六轴驱动由 Hwzlovedz 提供。 |

### 先验证手里的起点

在仓库根目录执行以下命令。需要 Node.js、Python 3.10 或更新版本和 C 编译器。前两项测试覆盖比赛与双人回合，第三项把四组去标识样本回放给固件实际使用的 C 识别器。组 1、2 用于调参，组 3、4 用于验证。

```sh
node source/tests/match.cjs
node source/tests/duel.cjs
python3 evaluation/verify_onboard.py
python3 source/build_pages.py offline dist/Tideline-Club.html
```

初始版本生成的单文件网页与 `playtest/Tideline-Club.html` 字节一致，可用 `cmp dist/Tideline-Club.html playtest/Tideline-Club.html` 核对。修改代码后打开 `dist/Tideline-Club.html` 试玩。手柄首页输入和比赛流程还有一项浏览器测试，在装有 Chrome 和 Node 模块 Playwright 的 Mac 上运行 `node source/tests/browser-duel.cjs dist/Tideline-Club.html`。

需要改固件时，在已启用 ESP-IDF 5.5.3 的终端运行 `(cd firmware-source && bash tools/validate.sh --all)`。已验证的分区刷机包随 `playtest/` 提供，该目录是这次可玩的发布快照。Mac 单只手柄已经完成配对和玩家试玩，双实体手柄同时连接、iPad 真机对战仍待验证。

## 开始比赛

1. Mac 双击 Tideline-Club.html。iPad 试玩时，先让 Mac 与 iPad 接入同一局域网，在 Mac 双击「iPad球场.command」，把显示的网址输入 iPad Safari。载入球场后可以关闭 Mac 的分享窗口。手柄应直接配对到运行游戏的 Mac 或 iPad。使用电视时将游戏画面投屏或通过 HDMI 输出。
2. 在游戏设备的系统蓝牙设置中，按每只手柄屏幕显示的 Tideline 名称分别配对。打开游戏的「手柄检测」。手柄短按上键选 P1、下键选 P2，再短按确认启用。手柄静放一秒后各挥一拍，检查两侧计数。手柄会记住上次启用的玩家位置。长按下键停止发送输入并返回选边；连接中断后按确认重新启用。
3. 选择「人机」或「双人」，点「开始比赛」。P1 守近场，P2 守远场。得分方发下一球，先到 7 分获胜。P1 也可用空格或触屏击球。手柄短按上、下、确认键分别打左、右、中路。
4. 比赛页面须保持在前台。两只手柄以不同键位区分玩家，系统可能把它们显示为蓝牙键盘。离开游戏前可长按手柄下键停止发送输入。

## 采集

1. 在手柄主页长按确认键进入「挥拍采集」，短按确认键开始。
2. 上下键选择正手或反手，短按确认键进入录制。先静置一秒，再以自然力度挥五次，每拍间停一下并自然收拍。
3. 第五拍后短按确认保存。屏幕显示已保存和总组数。再按确认，默认切换到另一手。可重复录制。长按确认退出，未确认的当前组会丢弃。
4. 每组最长 30 秒。超时后自动停止采样，五拍均在限时内完成才按确认保存；尚未完成请用上下键重录。每组的“五拍”来自人的确认。设备不以旧算法的识别次数结束采集。
5. 最多 64 组。已确认的组可断电保存。只向空白槽写入，掉电打断的槽可能占用容量。导出不删除记录。可以按人依次录制，另记每位同学对应组号，无需姓名。

## 导出

确认最后一组已保存，再用 USB 数据线连接。用 ESP-IDF 5.5 的 Python 运行以下命令，端口以实际设备为准。读 Flash 会重启手柄。

    python firmware-source/tools/export_motion.py --port /dev/cu.usbmodem101

导出目录包含原始日志分区、编译分区表读回和 motion.json。已有原始分区时也可运行：

    python3 firmware-source/tools/export_motion.py --image motionlog.bin

采样目标 50 Hz，逐帧保存设备相对时间、原生轴向的三轴加速度和三轴角速度、原始按键按下标记、样本有效位、帧序号。分组存储类型、人工标注数、有效帧数和校验和。旧游戏的屏幕陀螺仪坐标是 Y、X、负 Z；原应用按整数角速度计算。数据格式和单位见导出文件及 main/capture_log.h。

## 构建

firmware-source 是基于上游 808081a 的完整 ESP-IDF 工程，source 是浏览器游戏前端。用 ESP-IDF v5.5.3 激活工具链后，在 firmware-source 运行 bash tools/validate.sh。比赛回归可在本目录运行 node source/tests/match.cjs 和 node source/tests/duel.cjs。日志分区位于 0x600000，占 2 MiB，分区刷机包只写入启动程序、分区表和应用。
