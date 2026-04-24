# Assets 说明

这个目录包含应用桌面图标、界面内 SVG 图标以及其他静态资源。

## 应用主图标

以下文件用于 Electron 打包与窗口图标：

- `icon.png` - Linux 主图标
- `icon.ico` - Windows 主图标
- `icon.icns` - macOS 主图标
- `icon_16x16.png` ~ `icon_1024x1024.png` - 多尺寸 PNG 变体
- `Fast Hardware.png` - 主视觉源图

## UI SVG 图标规范

项目内按钮和状态图标统一放在 `assets` 根目录，命名规则如下：

- 文件名格式：`icon-<name>.svg`
- 推荐风格：`Feather` 风格线性图标
- 推荐来源：`feathericons.com`
- 引用方式：在 HTML 中使用 `data-icon="<name>"`，由 `scripts/main.js` 自动解析为 `assets/icon-<name>.svg`

示例：

```html
<img src="" alt="复制" width="14" height="14" data-icon="copy">
```

上面的写法会自动映射到：

```text
assets/icon-copy.svg
```

## 当前已使用的 UI SVG 图标

- `icon-bot.svg`
- `icon-bolt.svg`
- `icon-chevron-left.svg`
- `icon-chevron-right.svg`
- `icon-chevron-up.svg`
- `icon-chevron-down.svg`
- `icon-close.svg`
- `icon-copy.svg`
- `icon-download.svg`
- `icon-edit.svg`
- `icon-eye.svg`
- `icon-eye-off.svg`
- `icon-folder-open.svg`
- `icon-git-branch.svg`
- `icon-info.svg`
- `icon-image.svg`
- `icon-keyboard.svg`
- `icon-key-round.svg`
- `icon-package.svg`
- `icon-refresh.svg`
- `icon-save.svg`
- `icon-share-2.svg`
- `icon-star.svg`
- `icon-send.svg`
- `icon-thumbs-up.svg`
- `icon-trash-2.svg`
- `icon-upload-cloud.svg`
- `icon-user.svg`

## 新增 SVG 图标步骤

1. 到 `Feather Icons` 图标库找到目标图标。
2. 下载或复制对应 SVG。
3. 保存到 `assets` 目录，名称改为 `icon-<name>.svg`。
4. 保持以下 SVG 属性风格一致：

```svg
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
```

5. 在页面中用 `data-icon="<name>"` 引用，不要写死绝对路径。
6. 如果图标出现在运行时动态插入的 DOM 中，需要在对应脚本里额外调用一次局部图标初始化逻辑。

## 资源维护建议

- 不要混用 emoji 和业务按钮图标，优先使用 SVG。
- 优先使用 `Feather` 风格，个别品牌或角色图标可按视觉效果单独保留。
- 如果新增资源引用方式，记得同步更新这里，方便下次继续扩展。
