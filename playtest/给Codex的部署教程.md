# 给 Codex 的部署教程 · 潮汐羽球

适用于试玩包 1.2.0-duel.1。请在玩家自己的电脑上使用本包。目标是让玩家打开球场，亲自短按一下手柄，并看到网页收到该玩家的输入。

玩家可把整包放进 Codex 对话，并说「请解压这个试玩包，按里面的部署教程帮我打开潮汐羽球。如果手柄还要刷机，先告诉我识别到了哪只手柄。」

## 先让玩家看到球场

1. 解压外层分享 ZIP 到本机普通文件夹，并以该文件夹为工作目录。文件名和命令均相对于它。内层 `-partitions.zip` 是手柄固件。
2. 校验同目录 `SHA256SUMS`。macOS 使用 `shasum -a 256 -c SHA256SUMS`。Windows 可逐行拆分“摘要、两个空格、文件名”，用 `Get-FileHash -Algorithm SHA256 -LiteralPath` 核对。网页应为 `de8b87c35fbf30fb36e03f51400e9196b6334448f415d60408146ad4f11d7947`，固件 ZIP 应为 `4af15225cb82f259c28f54bd477381357490f5c8d9b21fd0b0d66b909eb79d51`。
3. 在运行比赛的电脑上打开 `Tideline-Club.html`。Mac 可用 `open ./Tideline-Club.html`，Windows PowerShell 可用 `Start-Process .\Tideline-Club.html`。它是自包含页面。首页「控制器」初始文字为「短按手柄确认键」。只试玩网页时即可选「人机 → 开始比赛」，按空格发球。
4. 如果手柄开机已经显示 `TIDELINE CLUB`、`BLUETOOTH` 和 `UP: P1   DN: P2`，直接进入下文的「配对与验收」。先试现有固件。手柄缺少蓝牙对战固件、且玩家要安装时，再走 USB 刷写流程。

### iPad 运行游戏

让电脑和 iPad 接入可以互访的同一局域网。在 Mac 上从包目录运行 `python3 "./iPad球场.command"`，也可以双击启动器。Windows 安装了 Python 3 时，可运行 `py -3 ".\iPad球场.command" --bind <电脑的局域网IPv4地址>`，把占位符换成此机真实地址。Windows 需要显式提供地址。把终端打印的**完整网址（含端口）**交给玩家，在 iPad 的 Safari 打开。手柄在 iPad 的系统蓝牙设置里配对。保持窗口打开便于刷新，结束后按 Ctrl+C 关闭。这个启动器只提供游戏页面。电视可显示电脑或 iPad 投屏、HDMI 输出的画面。

## 需要安装固件时

**适用硬件为 FoloToy AI PASSPORT、ESP32-C3、8 MB Flash、QMI8658A 体感传感器。** 芯片与容量可从 USB 读取，传感器型号要结合硬件版本、已有日志或标识核实。请玩家用能传数据的 USB 线接入要刷的手柄。两只手柄逐只处理。

1. 优先使用本机已有的 esptool。下方命令按已验证的 **esptool 4.12.0** 编写。缺少工具时，可以用 Python 3 在独立虚拟环境中安装 `python -m pip install esptool==4.12.0`，下文的 `python` 指这个环境的解释器，无需编译固件。
2. 运行 `python -m serial.tools.list_ports -v`，通过插拔前后变化找到真实串口。以下 `PORT` 都要替换成实际端口，例如 macOS 的 `/dev/cu.usbmodem…` 或 Windows 的 `COM…`。读取 `python -m esptool --chip esp32c3 --port PORT flash_id` 和 `python -m esptool --chip esp32c3 --port PORT get_security_info`。核对芯片、8 MB 容量和 MAC 尾号。启用了安全启动或 Flash 加密的设备，需要其对应的签名或加密发布流程。
3. 把固件 ZIP 解到独立目录，以解压出的 `flasher_args.json` 所在目录为工作目录。核对内层 `SHA256SUMS`、`firmware-manifest.json` 和下表。读取设备当前分区表，例如 `python -m esptool --chip esp32c3 --port PORT read_flash 0x8000 0xC00 current-table.bin`。如果它和包里的表不同，解析旧表，检查旧数据分区与新写入扇区、以及新应用后续使用的日志区域是否重叠。涉及原有用户数据时，向机主说明要迁移或备份的具体分区后再继续。
4. 写入前让机主知道将替换手柄当前玩法，核对串口和 MAC 尾号。已有对这只设备、这个版本的明确刷写授权即可继续。备份包含设备身份的数据时，保存在机主本机私有目录，与分享包分开。

| 写入地址 | 包内文件 | 用途 |
| --- | --- | --- |
| `0x0000` | `bootloader/bootloader.bin` | 启动程序 |
| `0x8000` | `partition_table/partition-table.bin` | 分区表 |
| `0x10000` | `FoloToy-AI-Passport.bin` | 潮汐羽球手柄程序 |

本版本保护区间为 NVS 与 PHY 的 `[0x9000, 0x10000)`、设备身份的 `[0x356000, 0x35a000)`、挥拍日志的 `[0x600000, 0x800000)`。方括号一侧是起始地址，圆括号一侧是结束边界。使用下面的分段写入，保留这些扇区。整片擦除会破坏其中的数据。

在内层固件目录替换 `PORT` 后执行写入。

```sh
python -m esptool --chip esp32c3 --port PORT --baud 460800 --after no_reset --no-stub write_flash --flash_mode dio --flash_freq 80m --flash_size 8MB 0x0 bootloader/bootloader.bin 0x8000 partition_table/partition-table.bin 0x10000 FoloToy-AI-Passport.bin
```

核对相同地址、相同参数后重启。若串口速度不稳定，可改用 115200 重试。核对失败时保留具体报错。

```sh
python -m esptool --chip esp32c3 --port PORT --baud 460800 --after hard_reset verify_flash --flash_mode dio --flash_freq 80m --flash_size 8MB 0x0 bootloader/bootloader.bin 0x8000 partition_table/partition-table.bin 0x10000 FoloToy-AI-Passport.bin
```

命令语法可对照乐鑫文档。[分段写入与读取](https://docs.espressif.com/projects/esptool/en/release-v4/esp32c3/esptool/basic-commands.html) · [写入后核验](https://docs.espressif.com/projects/esptool/en/release-v4/esp32c3/esptool/advanced-commands.html)

## 配对与验收

1. 重启后请玩家读出手柄小屏上的 `Tideline-XXXX`。按**小屏显示的名字**在游戏主机的系统蓝牙设置里连接。这是标准蓝牙键盘输入设备，USB 芯片 MAC 尾号与蓝牙名称尾号可能不同。Mac 可用 `hidutil list` 按这个名字检查系统输入设备。
2. 让游戏页处于前台，点一下页面。手柄显示 `OK to play` 时，短按上键选 P1，再短按确认键启用。请玩家亲自操作，看网页首页显示「P1 已收到输入」。系统已配对、网页收到输入可以分别验收。
3. 在「手柄检测」中，让玩家静放手柄约一秒，看到 `MOTION READY` 后轻挥一次。对应玩家的挥拍计数应加一。再选「人机 → 开始比赛」试一次发球。双人时第二只也配对到同一游戏主机，在它上面短按下键选 P2、短按确认，分别检查两行计数后选「双人」。
4. 如果系统已连、网页无响应，确认打开的是本包 HTML，点回球场并刷新，再短按确认。小屏显示 `Hold DN to stop` 表示已启用，短按确认或轻挥可以重新让网页看到输入。要换边时长按下键回到选边状态。网页接收前台键盘事件，按电脑键盘只能证明浏览器输入逻辑工作。向机主如实说明已验证到哪一步，然后打开同目录的《玩家上手指南》。
