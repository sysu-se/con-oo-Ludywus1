# con-oo-Ludywus1 - Review

## Review 结论

领域对象已经真实接入了 Svelte 的开局、渲染、输入、撤销重做和胜利判定主流程，整体不是“只在测试里有对象、界面仍走旧逻辑”的实现；但领域模型对关键不变量的保护还不够严，Hint/Notes 这两条交互链路也暴露出业务语义偏差，因此整体设计可用但离高质量 OOD 仍有明显差距。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | good |
| JS Convention | fair |
| Sudoku Business | fair |
| OOD | fair |

## 缺点

### 1. 反序列化没有维护题面 clue 不可变这个核心领域不变量

- 严重程度：core
- 位置：src/domain/index.js:59-83
- 原因：normalizeSudokuInput 对 initialGrid 和 currentGrid 只是分别深拷贝，没有校验 currentGrid 在固定格上必须与 initialGrid 一致。这样 createSudokuFromJSON 可以构造出“题面已被篡改但 fixedCells 仍视其为固定格”的非法 Sudoku，对数独业务建模来说这是核心漏洞。

### 2. Hint 依赖当前用户局面求解，业务语义不稳定

- 严重程度：major
- 位置：src/node_modules/@sudoku/stores/session.js:90-99
- 原因：applyHint 直接对 game.getGrid() 求解，而不是基于原始题面或已知解答。只要玩家当前填入了错误值或形成无解局面，Hint 就可能直接失败或受污染状态影响。这说明 Hint 没有被建模为稳定的游戏操作，而是被放在 adapter 层临时拼接。

### 3. Notes 模式会通过 UI 侧逻辑破坏当前填写值

- 严重程度：major
- 位置：src/components/Controls/Keyboard.svelte:10-25; src/node_modules/@sudoku/stores/keyboard.js:6-10
- 原因：keyboardDisabled 只禁止固定格，不禁止“已有用户输入的非固定格”。但 Keyboard 在 notes 模式下无论是加笔记还是删笔记都会执行 userGrid.set($cursor, 0)，因此用户只要在已填数字的格子里切到 notes，再按一个数字，就会把原值清空。笔记状态和棋盘状态被错误耦合，属于明显的业务流程问题。

### 4. 非法反序列化输入被静默降级为空棋盘

- 严重程度：minor
- 位置：src/domain/index.js:377-385
- 原因：createGameFromJSON 在 json.sudoku 缺失时不会 fail fast，而是悄悄创建一个 9x9 空局面。这会掩盖调用方或存档数据损坏的问题，也让领域层在错误输入下制造出并不合理的游戏状态，不符合 JS 生态中常见的显式报错习惯。

### 5. 手动订阅 store 但没有释放，偏离 Svelte 常见写法

- 严重程度：minor
- 位置：src/App.svelte:12-17
- 原因：App.svelte 在组件脚本顶层直接调用 gameWon.subscribe 并触发副作用，没有在 onMount/onDestroy 中管理订阅，也没有用 $gameWon 配合 reactive statement。根组件场景下短期问题不大，但在热更新、重复挂载或测试环境中容易产生重复订阅和重复弹窗。

## 优点

### 1. Game 基本形成了聚合根边界

- 位置：src/domain/index.js:221-265; src/domain/index.js:279-315
- 原因：Sudoku 负责棋盘、固定格、冲突检测和完成判定，Game 负责历史与写操作入口；getSudoku 返回 clone，guess/undo/redo 都围绕 transition 历史工作，避免了 UI 直接拿内部 Sudoku 引用绕过历史管理。

### 2. 使用 store adapter 把领域对象和 Svelte 响应式边界清晰分开

- 位置：src/node_modules/@sudoku/stores/session.js:24-106
- 原因：Game 实例被封装在闭包里，组件消费的是 publish 后的新快照，而不是直接依赖对象内部可变字段。这种“领域对象 + snapshot store”的接法符合题目对 Svelte 3 store/custom store 的推荐思路。

### 3. 真实游戏主流程已经接入领域对象

- 位置：src/node_modules/@sudoku/game.js:14-60; src/node_modules/@sudoku/stores/grid.js:36-64; src/components/Board/index.svelte:40-51
- 原因：开始新局通过 gameSession 重新创建 Game/Sudoku，Board 渲染读取的是 session 派生出的 grid/userGrid，键盘输入走 userGrid.set -> gameSession.guess -> Game.guess，撤销重做也走 Game.undo/redo；核心流程不是只在测试中调用领域对象。

### 4. 输入归一化、防御性拷贝和规则计算都做得比较扎实

- 位置：src/domain/index.js:6-83; src/domain/index.js:174-219
- 原因：格子值、坐标、9x9 形状都有显式校验，createSudoku/getGrid/getInitialGrid/toJSON 都在做防御性复制；冲突检测和 isSolved 也回到了领域层，而不是散落在组件里。

## 补充说明

- 本次结论完全基于静态阅读，未运行 tests，也未做浏览器交互验证；关于 Hint、Notes、GameOver 弹窗等行为判断来自代码路径分析。
- review 范围限制在 src/domain/* 及其直接 Svelte 接入链路，主要包括 src/node_modules/@sudoku/stores/session.js、src/node_modules/@sudoku/stores/grid.js、src/node_modules/@sudoku/game.js、src/App.svelte、Board/Keyboard 等直接消费点，未扩展评价无关目录。
- Undo/Redo、序列化、界面刷新是否“在运行时完全符合预期”，这里给出的都是静态审查结论，不等同于实际运行验证结果。
