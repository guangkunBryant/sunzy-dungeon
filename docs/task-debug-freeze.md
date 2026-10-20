# 调试任务：游戏启动死锁（阻断性）—— 已解决（2026-10-21）

## 结论：根因不是死锁，是测试脚本缺了两次点击
"冻结"证据链全部成立（截图逐字节相同、零错误、主 JS 线程存活），但解释错了：
1. **startBtn 点击坐标偏了**：竖屏布局下 startBtn 实际 span 是 (280-440, 1194-1236)，脚本点 (360,1186) 落在按钮上方 8px 空白处，没触发 onClick。
2. **剧情介绍页挡在路上**：首次进入游戏时 InterlevelScene 显示 descend 剧情文本 + "Continue" 按钮（页面坐标约 360,748），画面静止等待玩家点击。之前的 v1/v2 "UI 消失冻结"截图其实就是这个剧情页（底部 UI 因场景切换消失，背景还是英雄立绘）。
3. 修复 a69497e（InterlevelScene.loadLevel 在 web 上内联执行）是必要且正确的：插桩确认 LOAD_BEGIN→LOAD_END 内联完成，随后 GAMESCENE_CREATE → ACTOR_THREAD_STARTED → ACTOR_PROCESS_BEGIN 全部触发。

## 验证结果（trace 8 条全通过，0 error）
标题→选战士→start(360,1215)→Continue(360,748)→第 1 层地牢完整渲染（英雄/告示牌/木桶/草/水/墙/UI/提示文字），点击地砖英雄寻路移动、镜头跟随，水面动画活跃（间隔截图 MD5 不同）。trace: START_BTN_RAW→START_CLICKED→LOAD_BEGIN→LOAD_END→GAMESCENE_CREATE_BEGIN→ACTOR_THREAD_STARTING/STARTED→ACTOR_PROCESS_BEGIN。

## 经验教训
- 插桩用 System.out.println 有效（backend-web 下输出到浏览器 console），但 step.mjs 最初只打印最后 25 条消息 + Fatal 过滤，TRACE 被吞——现在有专门的 trace search。
- toDataURL 的 canvas_updating 探针对 WebGL 不可靠（静止画面/部分驱动下误报 false）；判定存活用间隔 1-6 秒两张截图的 MD5 对比。
- "UI 消失"不等于冻结：先截图看清当前场景再下结论。

## 原始复现步骤（存档）
1. 标题画面点击 Enter the Dungeon（absClick 360,833）
2. 英雄卡片（absClick 185,1240）选中战士
3. 点击 startBtn（absClick 360,1215）
4. 剧情页点击 Continue（absClick 360,748）
5. 进入第 1 层

## 测试工具（已就绪）
- `tests/step.mjs`：从 tests/ 目录运行 `node step.mjs actions.json`
- 操作序列文件 `tests/actions.json`，JSON 数组格式：
  `[["absClick",360,833],["wait",4000],["shot","name"],["key","Enter"],["reload"]]`
- 截图输出在 `tests/screenshots/`；脚本末尾会打印 errors 数、canvas_updating 检测、trace/fatal 检索、全部 console 消息
- 构建：JAVA_HOME=C:/Users/sunzy/AppData/Local/Temp/opencode/jdk-21.0.12.1+1（bin 加入 PATH），`./gradlew.bat :desktop:classes :web:webBuild`
- 每轮构建约 1.5 分钟；构建后门禁 `node --check web\build\dist\webapp\app.js`

## 相关提交
- a69497e "Fix TeaVM freeze entering the dungeon"（InterlevelScene web 内联加载，必要修复）
- d8c3fcc "Set localStoragePrefix so IndexedDB save DB is named explicitly"

