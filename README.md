# 潮汐羽球 1.3.0-court.1

一只 QMI8658A 版 AI Passport 即可和电脑打单打。两只手柄可以在同一场比赛中左右分屏，各从自己的第一人称看球。网页和固件通过 BLE GATT 双向通信，无需摄像头。离线试玩入口在 [playtest/Tideline-Club.html](playtest/Tideline-Club.html)。

## 在另一台电脑接着开发

第一次同步时，在另一台 Mac 的终端运行以下命令。`tideline-club-shenzhen` 是新建的项目目录，如果这个名字已使用，请换一个新目录名。

```sh
git clone --branch codex/shenzhen-next https://github.com/FoloToy/tideline-club.git tideline-club-shenzhen
cd tideline-club-shenzhen
(cd playtest && shasum -a 256 -c SHA256SUMS)
open -a "Google Chrome" playtest/Tideline-Club.html
```

用 Codex 打开新目录即可接着开发。以后在 `codex/shenzhen-next` 分支运行 `git pull --ff-only` 获取更新。如果另一台 Mac 已有基于试玩基线创建的同名本地分支，在该项目运行 `git switch codex/shenzhen-next` 和 `git pull --ff-only origin codex/shenzhen-next`。固件和刷机教程都在 `playtest/`。

| 想做什么 | 从哪里开始 |
| --- | --- |
| 直接试玩当前交付版 | 打开 [球场](playtest/Tideline-Club.html) 或 [玩家上手指南](playtest/玩家上手指南.html)。安装手柄固件见 [部署教程](playtest/给Codex的部署教程.md)。 |
| 改球场、击球时机或双人玩法 | 修改 `source/game/`。判定规则在 `match.js`，蓝牙协议在 `pad.js`，输入与首页状态在 `app.js`，渲染在 `arena.js`。打开 `source/game/index.html` 即可试玩修改后的源码。 |
| 改手柄识别或蓝牙连接 | `firmware-source/main/stroke.c` 识别挥拍，`paddle.c` 管理蓝牙广播和配对，`gamepad.c` 传输角速度、按键和小屏内容。采集及导出在 `capture_*.c` 和 `firmware-source/tools/export_motion.py`。 |
| 了解两轮试玩间具体改了什么 | 从 Git 历史的首个提交（Mac mini 原试玩包）与当前提交对比。板级工程基于 `FoloToy/ai-passport@808081a9e27e98502d4fc67413f6c75bb7a32229`，QMI8658A 六轴驱动由 Hwzlovedz 提供。 |

### 先验证手里的起点

在仓库根目录执行以下命令。需要 Node.js、Python 3.10 或更新版本和 C 编译器。前三项测试覆盖比赛、双人回合和难度曲线，第四项把四组去标识样本回放给固件实际使用的 C 识别器。组 1、2 用于调参，组 3、4 用于验证。

```sh
node source/tests/match.cjs
node source/tests/duel.cjs
node source/tests/balance.cjs
python3 evaluation/verify_onboard.py
python3 source/build_pages.py offline dist/Tideline-Club.html
```

用 `cmp dist/Tideline-Club.html playtest/Tideline-Club.html` 校验发布页。在装有 Chrome 和 Playwright 的 Mac 上运行 `node source/tests/browser-duel.cjs playtest/Tideline-Club.html`。浏览器测试在蓝牙 API 边界模拟两只手柄，使用实际页面、3D 渲染和本地 HTTP 中继。可用 `CHROME_BIN` 指定 Chrome 路径。

在已启用 ESP-IDF 5.5.3 的终端运行 `(cd firmware-source && bash tools/validate.sh --all)`。发布包是 `playtest/Tideline-QMI8658A-1.3.0-court.1-partitions.zip`。本版等待真实手柄配对、小屏显示、无线延迟和 iPad 真机验证。

## 开始比赛

1. 给 QMI8658A 版手柄安装随包 1.3 固件。打开电脑蓝牙，用桌面 Chrome 或 Edge 打开球场。手柄开机会显示自己的 `Tideline-XXXX` 名称。
2. 网页点「配对 P1」，选与手柄屏幕同名的设备，按系统提示确认配对。平放手柄，等页面显示绿色「已配对 · 体感就绪」。可以先挥一拍，首页会显示角速度和计数。单人只需 P1；双人选择「双人」后，用另一只配对 P2。
3. 点击「开始比赛」。人物自动跑位，先拿 7 分获胜。轻挥吊前场，快挥增加球速与深度，在高点击球可扣杀。左右挥控制落点。双人左屏 P1、右屏 P2，各自面对球网。每个手柄的小屏都把自己的分数排在前面。断开手柄会暂停，重连后点「继续比赛」。
4. iPad Safari 由同网 Mac 转接。在 Mac 双击 `iPad球场.command`，在自动打开的 Chrome 本机配对页连接手柄，在 iPad 打开终端给出的「iPad Safari 球场」完整地址。比赛时保持启动器和 Mac 配对页开启，完成后 Ctrl+C。电视可用 HDMI 或投屏。

## 手柄协议

页面以自定义服务 `97c10001-46f9-4b71-b6df-0c6cde4117a0` 选择设备。相同 UUID 后缀的 `97c10002` 提供通知，`97c10003` 接收带响应的写入。双方使用加密的 BLE 连接。以下字节以十六进制表示。

| 方向 | 消息 | 内容 |
| --- | --- | --- |
| 网页 → 手柄 | `01 01 slot` | 认领 P1 或 P2（1 或 2），每 2.5 秒续约 |
| 手柄 → 网页 | `01 01 slot flags` | 回执及状态。位 0 有 IMU，位 1 已校准，位 2 正在采集 |
| 手柄 → 网页 | `02 lo hi aim` | 识别时的角速度（小端无符号整数，°/s）和方向（127 为中线） |
| 手柄 → 网页 | `03 key` | 上、下、确认分别为 0、1、2 |
| 网页 → 手柄 | `10 rev text`、`11 rev text`、`12 rev text` | 标题、值和提示。每行最多 18 个 UTF-8 字节，同一修订的三行到齐才换屏 |

另一款游戏可复用 `source/game/pad.js` 收取输入、调用 `display([标题, 值, 提示])`。手柄固件没有羽球计分逻辑。固件提供 ASCII、比赛用中文和 LVGL 常用中日韩字库；数字值用大字显示。每一行可以使用最多 6 个汉字或 18 个 ASCII 字符。断线或会话过期后回到连接页。

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
