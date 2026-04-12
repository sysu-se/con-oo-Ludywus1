# DESIGN.md

## 1. 总体设计

项目分为三层。最底下是领域层（`src/domain/index.js`），纯 JS ，不依赖 Svelte，负责数独规则和游戏逻辑。中间是 Svelte 适配层（`src/node_modules/@sudoku/stores/session.js`），负责把领域对象的状态转成 Svelte store 能消费的快照。最上面是 View 层，就是现有的 `.svelte` 组件，只管渲染和转发事件。

---

## 2. 领域对象职责边界

### `Sudoku`

`Sudoku` 表示一个数独局面。相比 HW1，我把它从"只有一份 grid 的简单对象"改成了"同时持有题面和当前局面"的对象。它内部有 `initialGrid`（开局题面，非 0 的格子是固定格）和 `currentGrid`（当前局面）。

`Sudoku` 能做的事情包括：保存棋盘数据、判断某个格子是不是固定的 clue、执行 `guess(...)`、通过 `getInvalidCells()` 计算冲突格、通过 `isSolved()` 判断是否完成、`toString()` / `toJSON()` 外表化、以及 `clone()` 深拷贝。 UI 不用自己维护题面和用户输入之间的关系，全交给领域对象管。

### `Game`

`Game` 表示一局游戏会话。它内部持有一个 `Sudoku`，但外部拿不到这个实例的可变引用。`Game` 管理撤销/重做历史，提供 `guess()`、`undo()`、`redo()` 这些写操作入口。

同时 `Game` 还充当 facade，代理了 `Sudoku` 的只读查询——`getGrid()`、`getInitialGrid()`、`getCell()`、`isFixedCell()`、`getInvalidCells()`、`isSolved()` 这些方法都可以直接在 `Game` 上调用，不需要先拿到 `Sudoku`。虽然 `getSudoku()` 还保留着（测试需要），但它返回的是 clone，改了也不影响 `Game` 内部状态。

`Game` 不关心 Svelte，也不关心组件，它只管游戏状态怎么演进。adapter 层通过这些 facade 方法读数据，不需要经过 `getSudoku()`。

---

## 3. 相比 HW1 的实质性改进

### 改进 1：`Sudoku` 同时保存题面和当前局面

HW1 里 `Sudoku` 只有当前 grid，UI 还得额外保留题面。现在 `Sudoku` 同时保存 `initialGrid` 和 `currentGrid`，题面、当前局面、固定格判断都在领域层里了，接入界面的时候自然很多。

### 改进 2：校验能力进入 `Sudoku`

HW1 里冲突检测放在旧的 Svelte store 里。现在由 `Sudoku.getInvalidCells()` 负责，"什么算非法局面"这件事属于领域规则而不是 View 规则。这样测试、store、UI 看到的是同一套规则，View 也不需要自己推导约束。

### 改进 3：history 从"旧值 move"升级为"可逆 transition"

HW1 的 history 记录的是旧值。现在 `Game` 存的是 `{ row, col, before, after }`，一条记录既能 undo 也能 redo，两个方向共用一份历史结构，对称很多。序列化格式也跟着改了，从 `{ sudoku, undoStack, redoStack }` 变成 `{ sudoku, history: { past, future } }`。

### 改进 4：Hint 操作通过领域对象保护

HW1 里 `applyHint` 直接改数组，不管成没成功都会消耗 hint 次数。现在 `applyHint` 走 `gameSession.guess()` → `Game.guess()` 链路，只有领域操作确实生效了才扣 hint。这是领域对象真正接入之后自然得到的一致性保障。

### 改进 5：`Game` 封装住 `Sudoku`，外部没法绕过历史管理

这个是 HW1 review 里指出的 core 级问题。之前 `getSudoku()` 直接返回内部 `Sudoku` 引用，外部调 `game.getSudoku().guess(...)` 就能绕过 `Game` 的历史管理，撤销重做记录就和真实局面对不上了。

现在做了两层保护。第一，`getSudoku()` 返回 `sudoku.clone()`，拿到的是独立副本，改了也不影响 `Game` 内部。第二，`Game` 加了 facade 代理方法（`getGrid()` 等），adapter 层直接调这些方法读数据，根本不走 `getSudoku()`。这样 `Game` 就真正成了 `Sudoku` 的聚合根，所有对局面的写操作都必须经过 `Game`。

---

## 4. Move / History 的设计

用户输入传给 `guess(...)` 的是 `{ row, col, value }` 这种值对象，它没有身份，只用内容区分。

但在 `Game` 内部，真正进入 history 的记录会变成 `{ row, col, before, after }` 这种 transition。原因是 undo/redo 本质上是在同一条状态跃迁上前后移动，只记录旧值虽然也能做，但 redo 得额外推导当前值，记 `before/after` 更直接。

---

## 5. 深拷贝策略

需要深拷贝的地方有这些：`createSudoku(input)` 里拷贝输入数组防止外部污染内部状态；`createGame({ sudoku })` 里调 `sudoku.clone()` 防止调用方继续持有原始引用绕过 `Game`；`getSudoku()` 返回 clone 防止外部通过返回值改内部状态；`getGrid()` / `getInitialGrid()` 拷贝防止 UI 拿到引用后直接改数组；`clone()` 保证副本独立；`toJSON()` 导出 plain data 避免共享引用。

不需要深拷贝的地方：`Game` 的 facade 代理方法内部委托给 `Sudoku` 的同名方法，`Sudoku` 那边已经拷贝过了，`Game` 不用再拷一次。history 记录只有数字字段，复制 transition 的时候复制 plain object 就够了。

浅拷贝的后果：UI 持有的二维数组和领域对象内部的是同一份引用，组件直接写数组元素绕过 `guess()` 和 `Game`，Undo/Redo 历史也会失真。

---

## 6. 序列化 / 反序列化设计

`Sudoku.toJSON()` 导出 `initialGrid` 和 `currentGrid`。`Game.toJSON()` 导出 `sudoku`、`history.past`、`history.future`，这三部分够恢复一局游戏的当前状态和撤销重做能力。

反序列化的时候通过 `createSudokuFromJSON(json)` 和 `createGameFromJSON(json)` 重建回领域对象，不是把 JSON 直接当对象用。

---

## 7. View 层如何消费领域对象

### View 层直接消费的是什么

View 层不直接拿 `Game` 实例，而是消费 Svelte 适配层的 store。核心是 `gameSession`，在它基础上又派生出 `grid`（题面）、`userGrid`（当前局面）、`invalidCells`（冲突格）、`canUndo`、`canRedo`、`gameWon` 这些组件实际用的 store。不是直接改领域对象的字段。

### View 层拿到的数据

`grid` 对应 `Sudoku.initialGrid`，`userGrid` 对应 `Sudoku.currentGrid`，`invalidCells` 由 `Sudoku.getInvalidCells()` 算出来，`canUndo` / `canRedo` 从 `Game` 的历史状态导出，`gameWon` 由 `Sudoku.isSolved()` 导出。

### 用户操作如何进入领域对象

每条路径都是从组件事件出发，经过 store 适配层，最后进入领域对象。

**开始游戏**：`Welcome.svelte` 里用户选难度，调 `startNew(diff)`（在 `game.js` 里定义），然后走 `grid.generate()` → `gameSession.loadPuzzle()` → 内部创建新的 `Game` 和 `Sudoku`。

**键盘输入**：`Keyboard.svelte` 监听按键，调 `userGrid.set(pos, value)`，这个方法内部调 `gameSession.guess(...)`，最终进入 `Game.guess({ row, col, value })`。

**Hint**：`Actions.svelte` 里点 hint 按钮，调 `userGrid.applyHint(pos)` → `gameSession.applyHint(...)` → 内部算出答案后调 `Game.guess(...)`。

**Undo / Redo**：`Actions.svelte` 里点按钮，调 `undoMove()` / `redoMove()`，走 `gameSession.undo()` / `.redo()`，最终进入 `Game.undo()` / `Game.redo()`。

**胜利检测**：`App.svelte` 里订阅 `gameWon` 这个 derived store，它从 `gameSession` 的 snapshot 里读 `won` 字段（来自 `Game.isSolved()` → `Sudoku.isSolved()`）。赢了之后暂停游戏并弹出 GameOver 弹窗。

---

## 8. Svelte的更新与响应机制

采用领域对象 + store adapter方案。

`gameSession`（`session.js`）内部把真正的 `Game` 对象放在闭包里，不直接暴露给组件。每次执行 `guess`、`undo`、`redo`、`loadPuzzle` 之后，适配层都会调 `publish()`，通过 `Game` 的 facade 方法读取当前状态，生成一份新的 snapshot

然后调 `session.set(snapshot)`。这份 snapshot 是全新的 plain object，里面的 grid 数据都是深拷贝。Svelte 组件通过 `$store` 订阅这些 store，`set(...)` 之后就会重新渲染。

这里 `createSnapshot` 直接调 `game.getGrid()` 这些 facade 方法，而不是 `game.getSudoku().getGrid()`。这样既不暴露 `Sudoku` 引用，也省掉了每次 publish 都创建一个用完就扔的 clone。

### 依赖的响应式机制

核心三个东西：Svelte 的 writable/derived store、组件里的 `$store` 自动订阅、以及每次状态变化后显式调 `set(...)`。没有用 `$:` reactive statement 来驱动领域逻辑，`$:` 只在组件内部做一些 UI 层面的派生（比如判断 hint 按钮是否可用）。

###  mutate 内部对象会产生的问题

假设试图绕过 `Game` 直接操作，这不会影响 `Game` 内部状态，因为 `getSudoku()` 返回的是 clone，改的是副本。
这不会触发 Svelte 更新，因为没调 store 的 `set(...)`，没产生新快照，Svelte 不追踪对象内部字段的变更，只追踪 store 引用的替换。

所以每次领域变化都必须走 `Game` → `publish()` → `session.set(newSnapshot)` 这条路，Svelte 才能感知到变化。这是 snapshot + `set(...)` 方案的核心。

---

## 9. 哪些状态暴露给 UI，哪些留在领域对象内部

暴露给 UI 的响应式状态是 `baseGrid`、`userGrid`、`invalidCells`、`canUndo`、`canRedo`、`won`。

留在领域对象内部的有 `Game` 实例本身、`Sudoku` 实例本身、history 的内部数组、fixed cell 判断规则、校验的实现细节。

这种边界的好处是 UI 只知道要显示什么和调用什么命令，不知道内部怎么存 history，也不会直接操作领域对象的可变结构。

---

## 10. Trade-off

好处是领域层和 UI 分开了，Svelte 响应式边界清楚，真实界面确实通过 `Game` / `Sudoku` 工作，测试和 UI 共用一套核心规则。

代价是每次 publish 都要通过 facade 方法重新导出一份 snapshot，有额外的深拷贝成本（每次 2 次 grid 深拷贝）。`getSudoku()` 返回 clone 是为了保护封装，频繁调的话也有开销，不过实际上 adapter 层用 facade 方法，不走这条路。另外比直接改二维数组多了一层适配代码。

但对这个项目规模来说可维护性和边界清晰度比拷贝开销重要得多。