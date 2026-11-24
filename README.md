# 潮汐羽球 · 开发与复验

## 版本

- 板级底座为 FoloToy/ai-passport，main 提交 808081a9e27e98502d4fc67413f6c75bb7a32229。
- 六轴驱动由 Hwzlovedz 提供，采用屏幕坐标映射 (Y, X, −Z)。
- 美术包含原创球场封面和程序化实时球场，Three.js 0.160.1 的许可随前端源码提供。

## 游戏源码

打开 source/game/index.html 即可试玩。运行以下命令可复验对局和动作识别，并生成可在其他电脑直接打开的单文件。

```sh
node source/tests/match.cjs
python3 source/build_pages.py offline Tideline-Club.html
```

## 固件源码与构建

firmware-source/ 包含构建所需的 CMake 工程、板级驱动、主程序、版本锁和已嵌入的游戏。主要入口是 main/tideline.c。准备 ESP-IDF v5.5.3 和锁定的托管组件；启动已配置的 ESP-IDF 终端后，可直接构建。下面的命令在开发包根目录执行。

```sh
python3 source/build_pages.py controller firmware-source/main/game.html.gz
cd firmware-source
idf.py build
idf.py merge-bin -o Tideline-QMI8658A-full.bin
```

在 firmware-source/ 下运行 bash tools/validate.sh，复验板级驱动、主机测试与固件构建。

## 控制器链路

设备创建一个仅允许一台终端连接的 WPA2 Wi-Fi 热点。主页从 Flash 返回 gzip 压缩的完整 HTML，页面随后在同一地址建立 /motion WebSocket。板端只保留一个待发送任务，优先取最近采样，并对控制连接开启 TCP_NODELAY。当前串流周期为 20 ms，QMI8658A 的 6 轴输出配置为 224.2 Hz。页面物理步长为 1/120 秒，画面随浏览器刷新。

消息为 JSON 数组 [版本, 序号, 设备毫秒, 有效IMU, 屏幕X角速度, 屏幕Y角速度, 屏幕Z角速度, 累计按键数, 最近按键]。角速度单位为 °/s。按键 0/1/2 对应上、下、确定。静止校准用 48 个有效样本。有效挥拍阈值为 110 °/s，快速动作可在首帧触发，较轻动作再取一帧估计力度。回落到安静区后才重新允许触发。真实佩戴方向、力度阈值和端到端延迟以实板测试为准。
