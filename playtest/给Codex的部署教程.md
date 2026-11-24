# 给 Codex 的部署教程 · 潮汐羽球 1.3.0-court.1

目标是让玩家在自己电脑的球场完成配对，并在手柄小屏看到由网页传回的发球提示和比分。

## 打开球场

1. 解压试玩包，在含 `SHA256SUMS` 的目录校验文件。macOS 用 `shasum -a 256 -c SHA256SUMS`；Windows 用 `Get-FileHash -Algorithm SHA256` 逐项核对。
2. 用桌面 Chrome 或 Edge 打开 `Tideline-Club.html`。Mac 可运行 `open -a "Google Chrome" ./Tideline-Club.html`。首页显示「配对 P1」，手柄就绪后才能开始。
3. 固件包名为 `Tideline-QMI8658A-1.3.0-court.1-partitions.zip`。本版开机显示 `AI CONTROLLER` 和设备名。显示旧版 `UP: P1` 时，升级到随包版本才能完成双向配对。

### iPad 运行游戏

让 Mac 和 iPad 接入同一局域网。在 Mac 双击「iPad球场.command」或运行 `python3 "./iPad球场.command"`。在 Mac Chrome 配对页连接手柄，将终端里第二个「iPad Safari 球场」网址完整输入 iPad Safari。整个比赛期间保持 Mac 启动器和 Chrome 配对页开启。按 Ctrl+C 关闭服务。若手动选择有线网卡或 Wi-Fi，给启动器传入 `--bind 本机局域网IPv4`。Windows 安装 Python 3 后，可用 `py -3 ".\iPad球场.command" --bind 本机局域网IPv4 --no-open`，再用 Chrome 手动打开终端里的本机配对页。

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

1. 开启电脑蓝牙，手柄开机，从小屏读取 `Tideline-XXXX`。在游戏网页点「配对 P1」，选择同名设备并确认系统配对提示。手柄平放后，网页应显示绿色「已配对 · 体感就绪」，小屏显示 P1。若选择器没有设备，先检查手柄版本、是否已连另一台电脑、浏览器和系统的蓝牙权限。升级后若系统仍缓存旧键盘服务，可移除该手柄的旧配对，重启手柄后从网页重配。
2. 请玩家在首页挥一拍。自己的挥拍计数应增加，并显示 °/s。在「人机」中开始比赛，小屏应显示 0 : 0 和「轻挥发球」。第一球由 P1 发。
3. 得分时网页与手柄分别显示该分和比分。两只手柄时在网页选「双人」，第二只在 P2 栏配对。P1 左屏、P2 右屏，各自面对对手。两只小屏上的比分顺序相反，都把自己的分数放在前面。
4. 中途断开一只参赛手柄，比赛应暂停。网页重新配对后点「继续比赛」，验证比分保留。还没有实机时，可运行仓库的模拟测试，并将模拟结果与设备实测分别记录。
