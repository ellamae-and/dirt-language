# Dirt Programming Language

A custom programming language built from scratch in TypeScript, featuring a hand-written lexer, recursive descent parser, tree-walk interpreter, and a browser-based IDE with Canvas graphics support.

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install Dependencies

```bash
npm install
```

### Run a Dirt Program (CLI)

```bash
npm run dirt -- path/to/program.dirt
```

### Start the Web IDE

Start the backend API server and the frontend dev server in two separate terminals:

```bash
# Terminal 1 — API server (handles saving/loading programs)
cd server
npm run dev

# Terminal 2 — Web IDE frontend
cd web
npm run dev
```

Then open the URL shown in Terminal 2 (usually `http://localhost:5173`).

### Run Unit Tests

```bash
npx tsx tests.ts
```

## Project Structure

```
project-ellaand/
├── dirt/                  # The Dirt language implementation
│   ├── cli/               #   CLI entry point — reads a .dirt file and runs it
│   │   └── main.ts
│   ├── lexer/             #   Lexer + Token definitions
│   │   ├── lexer.ts       #     Scans source code into a flat list of tokens
│   │   └── token.ts       #     TokenType enum and Token type definition
│   ├── parser/            #   Parser + AST node definitions
│   │   ├── parser.ts      #     Recursive descent parser — tokens to AST
│   │   └── ast.ts         #     TypeScript types for every AST node
│   ├── runtime/           #   Interpreter and supporting runtime
│   │   ├── interpreter.ts #     Tree-walk interpreter — executes AST nodes
│   │   ├── environment.ts #     Scope chain — variable storage with parent linking
│   │   ├── runProgram.ts  #     Entry point that wires lex → parse → interpret
│   │   └── errors.ts      #     Error classes and logging utilities
│   └── stdlib/            #   Built-in functions
│       └── builtins.ts    #     print, math, graphics, input, game loop
│
├── server/                # Backend API server
│   └── src/
│       ├── index.ts       #   Express REST API — CRUD endpoints for programs
│       ├── database.ts    #   SQLite wrapper class (Connect, Disconnect, Execute)
│       ├── program.ts     #   Program model — Save, Load, Delete, ListAll
│       └── validation.ts  #   Input validation and sanitization utilities
│
├── web/                   # Frontend — browser-based IDE
│   └── src/
│       ├── main.ts        #   IDE logic — editor, tabs, canvas, project management
│       ├── index.html     #   Page shell with clouds, grass, and layout
│       └── style.css      #   Full stylesheet — themes, animations, layout
│
├── data/                  # SQLite database file (auto-created at runtime)
├── dist/                  # Compiled output
├── planning-components/   # UML diagrams and planning documents
├── tests.ts               # Unit tests — run with: npx tsx tests.ts
├── package.json
├── tsconfig.json
└── README.md
```

## How the Language Works

A Dirt program goes through three stages:

1. **Lexer** (`dirt/lexer/`) — Scans the raw source text character by character and produces a flat array of tokens (e.g., `let`, `x`, `=`, `5`, `;`).

2. **Parser** (`dirt/parser/`) — Reads the token array and builds an Abstract Syntax Tree (AST) using recursive descent. Operator precedence is handled by the structure of the parsing functions themselves.

3. **Interpreter** (`dirt/runtime/`) — Walks the AST and executes each node. Variables live in an `Environment` scope chain. Functions are first-class values that capture their defining scope (closures). Return statements use a throw/catch mechanism (`ReturnSignal`) for control flow.

## Language Features

- Variables: `let x = 5;`
- Control flow: `if`/`else`, `while`
- Functions with closures: `fn add(a, b) { return a + b; }`
- Strings with escape sequences: `"hello\nworld"`
- Boolean logic: `&&`, `||`, `!`
- Math builtins: `abs`, `floor`, `ceil`, `round`, `sqrt`, `sin`, `cos`, `min`, `max`, `mod`, `random`
- Type conversion: `str()`, `num()`
- Canvas graphics: `clear`, `rect`, `circle`, `fillColor`, `canvasWidth`, `canvasHeight`
- Game loop: `onUpdate(fn)` — registers a function called every animation frame
- Keyboard input: `keyDown("ArrowLeft")`

## Database

The server uses SQLite (via `better-sqlite3`) to persist saved programs. The `Database` class in `server/src/database.ts` provides a reusable interface with `Connect()`, `Disconnect()`, and `Execute()` methods. The `Program` class in `server/src/program.ts` implements the Active Record pattern with full CRUD operations.

## Known Issues

**Error messages sometimes point to the wrong line.**
The lexer records token positions *after* advancing the cursor instead of before. I know exactly why it's broken. I do not know exactly how to fix it without breaking six other things. This is a tomorrow problem. It has been a tomorrow problem for three weeks.

**There are no arrays.**
If you need a list of things, you get to do what I did in the spirograph demo: `let p0x = 0; let p1x = 0; let p2x = 0; let p3x = 0;` and so on. It builds character.

**You can't do `x += 1`.**
It's `x = x + 1;` like our ancestors intended.

**Single-line `if` statements without braces will ruin your day.**
Just use the braces. Trust me.

**The server doesn't tell you if the port is already in use.**
It just doesn't start. You get to figure that one out yourself. Check port 3000.

**`node_modules` is committed to the repo.**
I know. I *know*.

## FAQ

**Does Dirt support arrays?**
No.

**Classes?**
No.

**Inheritance?**
You're getting ambitious. No.

**For loops?**
We have `while`. You'll survive.

**Why is there no `%` operator?**
Because I said so. Use `mod()`.

**Can I import other files?**
That sounds like a you problem. No.

**Why is it called Dirt?**
Because I named it that.

**Is it fast?**
It's a tree-walk interpreter. It's as fast as it needs to be. Don't benchmark it.

**Should I use this in production?**
I am begging you not to.

## Author

Ella Anderson — CSC 470 Final Project
