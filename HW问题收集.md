## HW 问题收集
### 已解决

1. 如何避免 UI 绕过 `Game` 直接修改 `Sudoku`？

   1. **上下文**：HW1 的实现中，`Game.getSudoku()` 曾经直接返回内部的 `Sudoku` 实例。这样外部代码如果调用 `game.getSudoku().guess(...)`，就可以绕过 `Game` 的 undo/redo 历史记录，导致棋盘状态和历史栈不一致。

   2. **解决手段**：阅读 review 后重新调整 `Game` 的聚合边界。现在 `createGame({ sudoku })` 会先 clone 传入的 `Sudoku`，`getSudoku()` 也返回 clone，外部拿到的不是内部真实对象。同时给 `Game` 增加 `getGrid()`、`getInitialGrid()`、`getInvalidCells()`、`isSolved()` 等只读 facade 方法，让 UI adapter 不需要直接拿内部 `Sudoku`。

2. 如何让领域对象真实接入 Svelte，而不是只在测试中存在？

   1. **上下文**：HW1.1 的核心要求是让真实界面使用 `Sudoku` / `Game`。原来的旧逻辑更像是组件和 store 直接操作二维数组，领域对象没有成为游戏主流程的一部分。

   2. **解决手段**：采用 store adapter 的方案，新增 `gameSession` 作为中间层。它内部持有真正的 `Game` 对象，对外发布 `baseGrid`、`userGrid`、`invalidCells`、`canUndo`、`canRedo`、`won` 等快照状态。开局、渲染、输入、Undo/Redo 和胜利判定都通过这个 adapter 进入领域对象。

3. 为什么对象内部变化不能直接触发 Svelte 页面更新？

   1. **上下文**：接入 Svelte 时，我一开始以为只要 `Game` 或 `Sudoku` 内部棋盘变了，页面就会自动刷新。但实际上，直接修改对象内部字段并不会自动通知 Svelte。

   2. **解决手段**：通过查阅 Svelte store 资料和阅读项目代码，理解了 Svelte 3 的 store 更新机制。现在 `gameSession` 每次执行 `guess`、`undo`、`redo`、`loadPuzzle` 后都会重新生成 snapshot，并调用 `session.set(snapshot)`。组件通过 `$store` 订阅这些状态，所以能够刷新界面。

### 未解决

1. 反序列化时还没有完全维护题面固定格不可变这个不变量。

   1. **上下文**：review 指出 `normalizeSudokuInput` 只是分别拷贝 `initialGrid` 和 `currentGrid`，没有检查 `currentGrid` 在固定格上的值是否必须和 `initialGrid` 一致。也就是说，如果 JSON 数据被篡改，可能构造出一个“题面固定格已经被改过，但仍被当成固定格”的非法 `Sudoku`。

   2. **尝试解决手段**：阅读了 `normalizeSudokuInput`、`createSudokuFromJSON` 和 `createGameFromJSON` 的代码，已经理解这个问题属于领域对象不变量校验不足。后续需要在反序列化时增加检查：凡是 `initialGrid[row][col] !== 0` 的格子，`currentGrid[row][col]` 必须等于 `initialGrid[row][col]`，否则应该显式报错。

2. Hint 的业务语义还不够稳定。

   1. **上下文**：review 指出当前 `applyHint` 是对当前用户局面 `game.getGrid()` 求解，而不是基于原始题面或预先保存的标准答案。如果玩家已经填入错误数字，当前局面可能被污染，Hint 可能失败或给出不稳定结果。

   2. **尝试解决手段**：查看了 `gameSession.applyHint(...)` 的调用链，理解它现在更像 adapter 层临时拼出来的功能，还没有真正进入领域模型。后续更合理的做法可能是：开局时保存题目的标准解，或者把 Hint 建模为 `Game` 的领域操作，由 `Game` 决定能否提示、提示哪个格子、是否消耗 hint 次数。

3. Notes 模式和棋盘状态之间还有耦合问题。

   1. **上下文**：review 指出 `Keyboard.svelte` 在 notes 模式下添加或删除笔记时，会执行 `userGrid.set($cursor, 0)`。如果当前位置原本有用户填写的数字，切到 notes 后按数字可能会把原值清空。这里笔记状态和棋盘填写状态没有完全分离。

   2. **尝试解决手段**：阅读了 `Keyboard.svelte`、`stores/keyboard.js` 和 `stores/candidates.js`。目前理解到 candidates/notes 应该更像独立的 UI 辅助状态，不应该无条件修改 `userGrid`。后续需要重新梳理 notes 模式的交互语义，例如只有在空格上允许编辑 notes，或者让 note 操作完全不影响当前填写值。
