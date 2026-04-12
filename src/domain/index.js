// ====== 领域层：纯 JS，不依赖任何框架 ======

const SUDOKU_SIZE = 9;
const BOX_SIZE = 3;

function normalizeCellValue(value) {
	const normalized = Number(value ?? 0);

	if (!Number.isInteger(normalized) || normalized < 0 || normalized > 9) {
		throw new TypeError('Sudoku cell values must be integers between 0 and 9');
	}

	return normalized;
}

function assertGridShape(grid, name = 'grid') {
	if (!Array.isArray(grid) || grid.length !== SUDOKU_SIZE) {
		throw new TypeError(`${name} must be a 9x9 grid`);
	}

	for (const row of grid) {
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new TypeError(`${name} must be a 9x9 grid`);
		}
	}

	return grid;
}

function cloneGrid(grid) {
	assertGridShape(grid);
	return grid.map((row) => row.map((value) => normalizeCellValue(value)));
}

function createEmptyGrid() {
	return Array.from({ length: SUDOKU_SIZE }, () => Array(SUDOKU_SIZE).fill(0));
}

function normalizeIndex(index, name) {
	if (!Number.isInteger(index) || index < 0 || index >= SUDOKU_SIZE) {
		throw new TypeError(`${name} must be an integer between 0 and 8`);
	}

	return index;
}

function normalizeMove(move) {
	if (!move || typeof move !== 'object') {
		throw new TypeError('move must be an object');
	}

	return {
		row:   normalizeIndex(move.row, 'row'),
		col:   normalizeIndex(move.col, 'col'),
		value: normalizeCellValue(move.value),
	};
}

function normalizeSudokuInput(input) {
	if (Array.isArray(input)) {
		const grid = cloneGrid(input);
		return {
			initialGrid: grid,
			currentGrid: cloneGrid(grid),
		};
	}

	if (!input || typeof input !== 'object') {
		throw new TypeError('Sudoku input must be a 9x9 grid or a serialized snapshot');
	}

	const initialSource = Array.isArray(input.initialGrid) ? input.initialGrid : input.grid;
	const currentSource = Array.isArray(input.currentGrid) ? input.currentGrid : initialSource;

	if (!initialSource || !currentSource) {
		throw new TypeError('Serialized sudoku must include initialGrid/currentGrid or grid');
	}

	return {
		initialGrid: cloneGrid(initialSource),
		currentGrid: cloneGrid(currentSource),
	};
}

// 在一组单元格中找出重复数字，将冲突坐标加入 invalidKeys
function collectConflicts(cells, invalidKeys) {
	const grouped = new Map();

	for (const cell of cells) {
		if (cell.value === 0) continue;

		if (!grouped.has(cell.value)) {
			grouped.set(cell.value, []);
		}

		grouped.get(cell.value).push(cell);
	}

	for (const duplicates of grouped.values()) {
		if (duplicates.length < 2) continue;

		for (const duplicate of duplicates) {
			invalidKeys.add(`${duplicate.row},${duplicate.col}`);
		}
	}
}

function toCellList(cellKeys) {
	return Array.from(cellKeys, (key) => {
		const [row, col] = key.split(',').map(Number);
		return { row, col };
	});
}

function createFormattedBoard(grid) {
	const border = '+-------+-------+-------+';
	const lines = [border];

	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		const parts = [];

		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			if (col % BOX_SIZE === 0) {
				parts.push('|');
			}

			parts.push(grid[row][col] === 0 ? '.' : String(grid[row][col]));
		}

		parts.push('|');
		lines.push(parts.join(' '));

		if ((row + 1) % BOX_SIZE === 0) {
			lines.push(border);
		}
	}

	return lines.join('\n');
}

// 历史记录条目的深拷贝，格式：{row, col, before, after}
function cloneTransition(entry) {
	if (!entry || typeof entry !== 'object') {
		throw new TypeError('History entry must be an object');
	}

	return {
		row:    normalizeIndex(entry.row, 'row'),
		col:    normalizeIndex(entry.col, 'col'),
		before: normalizeCellValue(entry.before),
		after:  normalizeCellValue(entry.after),
	};
}

// ====== Sudoku 领域对象：持有题面 + 当前棋盘，提供填数、校验、序列化 ======
export function createSudoku(input) {
	const normalized = normalizeSudokuInput(input);
	const initialGrid = normalized.initialGrid;
	const currentGrid = normalized.currentGrid;
	const fixedCells = initialGrid.map((row) => row.map((value) => value !== 0));

	function isFixedCell(row, col) {
		normalizeIndex(row, 'row');
		normalizeIndex(col, 'col');
		return fixedCells[row][col];
	}

	function getCell(row, col) {
		normalizeIndex(row, 'row');
		normalizeIndex(col, 'col');
		return currentGrid[row][col];
	}

	// 分别按行、列、3×3 宫检查重复，返回所有冲突格的坐标列表
	function getInvalidCells() {
		const invalidKeys = new Set();

		for (let row = 0; row < SUDOKU_SIZE; row += 1) {
			collectConflicts(
				currentGrid[row].map((value, col) => ({ row, col, value })),
				invalidKeys,
			);
		}

		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			collectConflicts(
				currentGrid.map((row, rowIndex) => ({ row: rowIndex, col, value: row[col] })),
				invalidKeys,
			);
		}

		for (let boxRow = 0; boxRow < SUDOKU_SIZE; boxRow += BOX_SIZE) {
			for (let boxCol = 0; boxCol < SUDOKU_SIZE; boxCol += BOX_SIZE) {
				const boxCells = [];

				for (let row = boxRow; row < boxRow + BOX_SIZE; row += 1) {
					for (let col = boxCol; col < boxCol + BOX_SIZE; col += 1) {
						boxCells.push({ row, col, value: currentGrid[row][col] });
					}
				}

				collectConflicts(boxCells, invalidKeys);
			}
		}

		return toCellList(invalidKeys);
	}

	function isSolved() {
		for (let row = 0; row < SUDOKU_SIZE; row += 1) {
			for (let col = 0; col < SUDOKU_SIZE; col += 1) {
				if (currentGrid[row][col] === 0) {
					return false;
				}
			}
		}

		return getInvalidCells().length === 0;
	}

	return {
		getGrid() {
			return cloneGrid(currentGrid);
		},

		getInitialGrid() {
			return cloneGrid(initialGrid);
		},

		getCell,

		isFixedCell,

		getInvalidCells,

		isSolved,

		guess(move) {
			const normalizedMove = normalizeMove(move);

			if (isFixedCell(normalizedMove.row, normalizedMove.col)) {
				return false;
			}

			currentGrid[normalizedMove.row][normalizedMove.col] = normalizedMove.value;
			return true;
		},

		clone() {
			return createSudoku({
				initialGrid,
				currentGrid,
			});
		},

		toJSON() {
			return {
				initialGrid: cloneGrid(initialGrid),
				currentGrid: cloneGrid(currentGrid),
			};
		},

		toString() {
			return createFormattedBoard(currentGrid);
		},
	};
}

export function createSudokuFromJSON(json) {
	return createSudoku(json);
}

// ====== Game 领域对象：包裹 Sudoku，管理撤销/重做历史栈 ======
function buildGame({ sudoku, past = [], future = [] }) {
	const pastTransitions = past.map(cloneTransition);
	const futureTransitions = future.map(cloneTransition);

	return {
		// 返回防御性副本，外部无法通过它修改内部状态
		getSudoku() {
			return sudoku.clone();
		},

		// 只读查询——Game 作为 facade 代理 Sudoku 的读取接口，
		// adapter 层优先使用这些方法，避免不必要的 clone 开销
		getGrid()        { return sudoku.getGrid(); },
		getInitialGrid() { return sudoku.getInitialGrid(); },
		getCell(row, col){ return sudoku.getCell(row, col); },
		isFixedCell(r, c){ return sudoku.isFixedCell(r, c); },
		getInvalidCells(){ return sudoku.getInvalidCells(); },
		isSolved()       { return sudoku.isSolved(); },

		guess(move) {
			const normalizedMove = normalizeMove(move);
			const before = sudoku.getCell(normalizedMove.row, normalizedMove.col);

			if (before === normalizedMove.value) {
				return false;
			}

			const applied = sudoku.guess(normalizedMove);
			if (!applied) {
				return false;
			}

			// 记录可逆转换，并清空 redo 栈（新操作使旧的 redo 失效）
			pastTransitions.push({
				row:    normalizedMove.row,
				col:    normalizedMove.col,
				before,
				after: normalizedMove.value,
			});
			futureTransitions.length = 0;
			return true;
		},

		undo() {
			if (pastTransitions.length === 0) {
				return false;
			}

			const transition = pastTransitions.pop();
			sudoku.guess({
				row:   transition.row,
				col:   transition.col,
				value: transition.before,
			});
			futureTransitions.push(transition);
			return true;
		},

		redo() {
			if (futureTransitions.length === 0) {
				return false;
			}

			const transition = futureTransitions.pop();
			sudoku.guess({
				row:   transition.row,
				col:   transition.col,
				value: transition.after,
			});
			pastTransitions.push(transition);
			return true;
		},

		canUndo() {
			return pastTransitions.length > 0;
		},

		canRedo() {
			return futureTransitions.length > 0;
		},

		toJSON() {
			return {
				sudoku: sudoku.toJSON(),
				history: {
					past:   pastTransitions.map(cloneTransition),
					future: futureTransitions.map(cloneTransition),
				},
			};
		},
	};
}

export function createGame({ sudoku }) {
	if (!sudoku || typeof sudoku.clone !== 'function') {
		throw new TypeError('createGame expects a Sudoku-like object');
	}

	return buildGame({
		sudoku: sudoku.clone(),
	});
}

export function createGameFromJSON(json) {
	const sudoku = createSudokuFromJSON(json?.sudoku ?? { initialGrid: createEmptyGrid(), currentGrid: createEmptyGrid() });
	const past = json?.history?.past ?? [];
	const future = json?.history?.future ?? [];

	return buildGame({
		sudoku,
		past,
		future,
	});
}
