# notes-clipboard-sync

一个面向 macOS `Notes.app` 的本地同步小工具：轮询备忘录内容，只提取新增整条内容或尾部追加文本，并把这些增量写进系统剪贴板。

适合把 Notes 当作移动端输入入口，再在桌面端快速粘贴到别的应用里。

## 特性

- 只同步增量，不重复刷整篇笔记
- 新建备忘时直接复制正文
- 原有备忘录尾部追加时，只复制追加段落
- `watch` 模式下没有新内容时保持静默，不刷 CLI 输出
- 剪贴板 payload 在未消费前会持续累积
- 可选监听全局粘贴快捷键，best-effort 标记 payload 已消费

## 运行要求

- macOS
- 已安装 `pnpm`
- 允许终端控制 `Notes.app`
- 如果要启用粘贴消费监听，还需要授予 Accessibility 权限

## 安装

```bash
pnpm install
```

## 快速开始

首次运行先建立基线，避免把历史备忘全部塞进剪贴板：

```bash
pnpm notes init
```

查看权限状态：

```bash
pnpm notes permissions
```

执行一次同步：

```bash
pnpm notes once
```

持续监听：

```bash
pnpm notes watch --interval 60
```

开发时的快捷命令：

```bash
pnpm start
```

`pnpm start` 会主动检查并请求 Accessibility 权限。若复检后仍未授权，进程会直接退出，不会继续运行 `watch`。

## 工作方式

程序会读取指定 Notes 账户下的所有备忘，与本地状态文件比较后生成增量：

- 新备忘：复制整段正文
- 旧备忘有尾部追加：只复制追加部分
- 非尾部修改：记为 conflict，不会盲目覆盖进剪贴板

默认情况下：

- 读取账户是 `iCloud`
- 轮询间隔是 `1` 秒
- 去抖延迟是 `2` 秒
- 状态文件路径是 `~/Library/Application Support/notes-clipboard-sync/state.json`

`watch` 模式下，如果连续多次有新增内容但你还没“消费”当前剪贴板，新的增量会继续追加到同一份 payload。监听到一次全局 `Cmd/Ctrl+V` 后，当前 payload 会被标记为已消费；这是 best-effort 行为，不保证目标应用一定完成粘贴。

## 命令

```bash
pnpm notes init
pnpm notes once
pnpm notes permissions
pnpm notes watch --interval 60 --debounce 1
pnpm notes watch --interval 60 --prompt-accessibility --require-accessibility
pnpm notes once --account "iCloud"
pnpm notes once --state "/path/to/state.json"
```

## 权限说明

首次运行 `pnpm notes init` / `pnpm notes once` / `pnpm notes watch` 时，macOS 可能弹出自动化权限提示。若 `watch` 模式需要在粘贴后清空当前 payload，还需要到系统设置中为运行该命令的终端宿主应用授予 Accessibility 权限。`pnpm start` 默认会主动请求这项权限，并在拿不到授权时直接退出。

### 中文

需要两类权限：

- `Notes` 自动化权限：允许当前终端宿主应用读取 `Notes.app`
- `Accessibility` 辅助功能权限：允许程序监听全局 `Cmd+V` / `Ctrl+V`

如果没有开启，会发生什么：

- 没有 `Notes` 权限：
  - `pnpm notes init`
  - `pnpm notes once`
  - `pnpm notes watch`
  都无法读取备忘录内容，命令会直接失败。
- 没有 `Accessibility` 权限：
  - 程序仍然可以轮询 Notes 并把增量写进剪贴板
  - 但无法在你粘贴后把当前 payload 标记为已消费
  - 结果是旧内容可能和新内容一起累积，剪贴板越来越长
  - 使用 `pnpm start` 时，程序会直接退出，不继续运行

如何开启：

1. 先确认你实际在哪里运行命令。
2. 打开“系统设置 > 隐私与安全性”。
3. 开启 `Notes` 自动化权限：
   进入“自动化”，找到运行命令的宿主应用，例如 `Terminal`、`iTerm`、`Warp`、`VS Code` 或 `Cursor`，允许它控制 `Notes`。
4. 开启 `Accessibility` 权限：
   进入“辅助功能”，为同一个宿主应用打开权限。
5. 重新运行：
   ```bash
   pnpm notes permissions
   pnpm start
   ```

### English

Two permissions are required:

- `Notes` automation permission: allows the current host app to read `Notes.app`
- `Accessibility` permission: allows the app to listen for global `Cmd+V` / `Ctrl+V`

What happens if they are not enabled:

- Without `Notes` permission:
  - `pnpm notes init`
  - `pnpm notes once`
  - `pnpm notes watch`
  all fail because the app cannot read note content.
- Without `Accessibility` permission:
  - the app can still poll Notes and write deltas into the clipboard
  - but it cannot mark the current payload as consumed after you paste
  - old clipboard content may accumulate together with new content
  - when using `pnpm start`, the process exits instead of continuing

How to enable them:

1. Confirm which host app is actually running the command.
2. Open `System Settings > Privacy & Security`.
3. Enable `Notes` automation:
   Go to `Automation`, find the host app running the command, such as `Terminal`, `iTerm`, `Warp`, `VS Code`, or `Cursor`, and allow it to control `Notes`.
4. Enable `Accessibility`:
   Go to `Accessibility` and enable the same host app.
5. Run:
   ```bash
   pnpm notes permissions
   pnpm start
   ```

## launchd

仓库包含一个示例 plist，可按需改成你自己的路径后放进 `launchd`：

- [docs/notes-clipboard-sync.plist](./docs/notes-clipboard-sync.plist)

## 开发

```bash
pnpm typecheck
```
