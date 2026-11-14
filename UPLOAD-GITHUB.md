# 发布到 GitHub

将 `DesktopBilliards-GitHub` 作为本地仓库根目录。发布后，GitHub 首页应直接显示 `README.md`、`src/` 和 `assets/`。

## 用 GitHub Desktop 发布

1. 安装并登录 [GitHub Desktop](https://desktop.github.com/)。打开 **File → Add Local Repository**，选中整理好的 `DesktopBilliards-GitHub` 文件夹。
2. 如果软件提示它还不是 Git 仓库，点击 **Create a repository**。确认最终显示的仓库目录就是现有的 `DesktopBilliards-GitHub`。保留现有 README 和 `.gitignore`。
3. 在 **Changes** 查看文件，填写提交说明 `Initial release`，提交到当前分支。若创建仓库时已经生成初始提交，可以直接进入下一步。
4. 点击 **Publish repository**，填写仓库名，例如 `desktop-billiards`。勾选 **Keep this code private** 会发布为私有仓库，取消勾选会发布为公开仓库。确认后点击 **Publish Repository**。
5. 在网页打开新仓库。检查首页宣传图，并点 README 顶部的语言链接验证切换。

[GitHub Desktop 官方说明](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)

## 用 Git 命令发布

1. 打开 [GitHub 新建仓库页](https://github.com/new)，选好仓库名与可见性。创建空仓库，README、`.gitignore` 和 License 初始化选项都留空。
2. 在 `DesktopBilliards-GitHub` 文件夹里打开 PowerShell。将示例中的 `YOUR-USERNAME` 和仓库名换成自己的信息，再执行。

   ```powershell
   git init -b main
   git add .
   git status --short
   git commit -m "Initial release"
   git remote add origin https://github.com/YOUR-USERNAME/desktop-billiards.git
   git push -u origin main
   ```

3. 如果 Git 要求登录，按提示完成 GitHub 授权。若提示缺少提交者身份，先设置本仓库的 `git config user.name "你的名字"` 与 `git config user.email "你的邮箱"`，再重新提交和推送。

[GitHub 命令行发布指南](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## 给玩家提供免构建下载

仓库推送后，如果想让玩家直接下载 Windows 版，可从仓库右侧进入 **Releases → Draft a new release**，例如创建 `v0.4.0` 标签，把最新版 Windows x64 压缩包作为发布附件上传。仓库里的 README 提供从源码构建的步骤。
