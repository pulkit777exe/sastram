import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, 
        PageBreak, HeadingLevel, WidthType, BorderStyle, ShadingType, VerticalAlign, LevelFormat } from 'docx';
import fs from 'fs'

// Helper function for borders
const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const borders = { top: border, bottom: border, left: border, right: border };

// Helper function for headers
const createHeading = (text, level = HeadingLevel.HEADING_1) => {
  const sizes = { [HeadingLevel.HEADING_1]: 32, [HeadingLevel.HEADING_2]: 28, [HeadingLevel.HEADING_3]: 24 };
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 240, after: 120 }
  });
};

const createSubHeading = (text) => createHeading(text, HeadingLevel.HEADING_2);
const createSubSubHeading = (text) => createHeading(text, HeadingLevel.HEADING_3);

// Helper for code blocks
const createCodeBlock = (code) => new Paragraph({
  children: [new TextRun({ text: code, font: "Courier New", size: 18, color: "333333" })],
  shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
  spacing: { before: 120, after: 120 },
  border: { left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }
});

// Helper for bullet points
const createBullet = (text) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  children: [new TextRun(text)]
});

// Table helper
const createTable = (headers, rows) => {
  const headerCells = headers.map(h => new TableCell({
    borders,
    shading: { fill: "E8F0F7", type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })]
  }));

  const bodyCells = rows.map(row => new TableRow({
    children: row.map(cell => new TableCell({
      borders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun(cell)] })]
    }))
  }));

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: headers.map(() => 9360 / headers.length),
    rows: [new TableRow({ children: headerCells }), ...bodyCells]
  });
};

const content = [
  // Title
  new Paragraph({
    children: [new TextRun({ text: "PARSING TECHNIQUES & AUTOMATIC PARSER CONSTRUCTION", bold: true, size: 40 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 }
  }),
  new Paragraph({
    children: [new TextRun({ text: "Complete Study Guide: Basic Parsing & LR Parser Generation", size: 22, color: "666666" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }),

  // ==================== MODULE 1 ====================
  createHeading("MODULE 1: BASIC PARSING TECHNIQUES"),

  createSubHeading("1.1 What is a Parser?"),
  new Paragraph({
    children: [new TextRun("A parser is the second phase of compilation that takes a stream of tokens from the lexical analyzer and checks if they conform to the grammar of the programming language.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Input:", bold: true }), new TextRun(" Stream of tokens")]
  }),
  new Paragraph({
    children: [new TextRun({ text: "Output:", bold: true }), new TextRun(" Parse tree or Abstract Syntax Tree (AST)")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.2 Parser Classification"),

  new Paragraph({
    children: [new TextRun({ text: "1. Universal Parsers:", bold: true })]
  }),
  createBullet("Earley parser, CYK parser"),
  createBullet("Accept any CFG"),
  createBullet("O(n³) time complexity"),
  createBullet("Rarely used in practice (too slow)"),

  new Paragraph({
    children: [new TextRun({ text: "\n2. Top-Down Parsers:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Build parse tree from root to leaves"),
  createBullet("Predictive parsers (LL parsers)"),
  createBullet("Less powerful but faster"),
  createBullet("Examples: Recursive descent, LL(1), LL(k)"),

  new Paragraph({
    children: [new TextRun({ text: "\n3. Bottom-Up Parsers:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Build parse tree from leaves to root"),
  createBullet("More powerful than LL"),
  createBullet("Shift-reduce parsers (LR parsers)"),
  createBullet("Examples: SLR(1), LALR(1), LR(1)"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.3 Shift-Reduce Parsing"),

  new Paragraph({
    children: [new TextRun("Shift-reduce parsing is a bottom-up parsing technique that uses a stack to build the parse tree from leaves upward.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Basic Operations:", bold: true })]
  }),
  createBullet({ text: "Shift: Move next token from input to stack", run: {} }),
  createBullet({ text: "Reduce: Pop RHS of a production from stack, push LHS", run: {} }),
  createBullet({ text: "Accept: Parse successful", run: {} }),
  createBullet({ text: "Error: Invalid token/sequence", run: {} }),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Example: Parsing 'id + id'", bold: true })]
  }),
  createCodeBlock(`Grammar:
  E → E + T | T
  T → id

Parsing 'id + id':

Step  Stack       Input       Action
1     []         id + id $    Shift id
2     [id]       + id $       Reduce T → id
3     [T]        + id $       Reduce E → T
4     [E]        + id $       Shift +
5     [E, +]     id $         Shift id
6     [E, +, id] $            Reduce T → id
7     [E, +, T]  $            Reduce E → E + T
8     [E]        $            Accept`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.4 Conflicts in Shift-Reduce Parsing"),

  new Paragraph({
    children: [new TextRun({ text: "Shift-Reduce Conflict:", bold: true })]
  }),
  createBullet("Parser doesn't know whether to shift or reduce"),
  createBullet("Caused by ambiguous grammar"),
  createBullet("Example: Dangling else problem"),

  new Paragraph({
    children: [new TextRun({ text: "\nReduce-Reduce Conflict:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Multiple reduction options available"),
  createBullet("Parser has multiple production rules that could reduce"),
  createBullet("More serious than shift-reduce conflicts"),

  createCodeBlock(`Dangling Else Problem:
  stmt → if expr then stmt
       | if expr then stmt else stmt
       | other

Input: "if x then if y then z"
Question: Does else (if present) belong to inner or outer if?

This creates shift-reduce conflict.
Solution: Use precedence rules or rewrite grammar.`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.5 Operator Precedence Parsing"),

  new Paragraph({
    children: [new TextRun("Operator precedence parsing is a technique for parsing expressions based on operator precedence without explicitly using a full grammar.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Precedence Relations:", bold: true })]
  }),
  createBullet("a ⋖ b: a has lower precedence than b (shift)"),
  createBullet("a ≐ b: a has same precedence as b (reduce if left-assoc)"),
  createBullet("a ⋗ b: a has higher precedence than b (reduce)"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Precedence Table Example:", bold: true })]
  }),
  createTable(
    ["Operator", "+ -", "* /", "^"],
    [
      ["Lower precedence", "1", "2", "3"],
      ["+ -", "Left", "Shift ⋖", "Reduce ⋗"],
      ["* /", "Left", "Reduce ≐", "Reduce ⋗"],
      ["^", "Right", "Shift ⋖", "Shift ⋖"],
      ["id, (", "-", "-", "Shift"]
    ]
  ),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Advantages:", bold: true })]
  }),
  createBullet("Simpler than full parsing"),
  createBullet("Efficient for expressions"),
  createBullet("Easy to implement and modify"),

  new Paragraph({
    children: [new TextRun({ text: "\nDisadvantages:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Only for expressions"),
  createBullet("Limited error recovery"),
  createBullet("Not suitable for full programming language grammars"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.6 Top-Down Parsing / Recursive Descent"),

  new Paragraph({
    children: [new TextRun("Top-down parsing (recursive descent) starts with start symbol and tries to derive the input string.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Algorithm:", bold: true })]
  }),
  createBullet("For each non-terminal, write a function"),
  createBullet("Function tries each production rule"),
  createBullet("Recursively call functions for non-terminals on RHS"),
  createBullet("Match terminals with input stream"),
  createBullet("Backtrack if rule doesn't match"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Example Code for Grammar:", bold: true })]
  }),
  createCodeBlock(`Grammar:
  E → T + E | T
  T → F * T | F
  F → (E) | id

Pseudo-code:
parseE() {
  parseT()
  if (currentToken == '+') {
    consumeToken('+')
    parseE()
  }
}

parseT() {
  parseF()
  if (currentToken == '*') {
    consumeToken('*')
    parseT()
  }
}

parseF() {
  if (currentToken == '(') {
    consumeToken('(')
    parseE()
    consumeToken(')')
  } else if (currentToken == 'id') {
    consumeToken('id')
  } else {
    error()
  }
}`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Advantages:", bold: true })]
  }),
  createBullet("Easy to understand and implement"),
  createBullet("Good error recovery"),
  createBullet("No separate lexical analysis required"),

  new Paragraph({
    children: [new TextRun({ text: "\nDisadvantages:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Left recursion causes infinite loops"),
  createBullet("Backtracking can be inefficient"),
  createBullet("Limited to LL grammars"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("1.7 Predictive Parsers (LL Parsers)"),

  new Paragraph({
    children: [new TextRun("Predictive parsers use lookahead to determine which production rule to apply without backtracking.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LL(1) Grammar Requirements:", bold: true })]
  }),
  createBullet("No left recursion"),
  createBullet("Left-factored (no common prefixes)"),
  createBullet("For each non-terminal and lookahead token, at most one production rule applies"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LL Parser Implementation:", bold: true })]
  }),
  createBullet("Predictive parsing table: M[non-terminal][lookahead]"),
  createBullet("Stack-based parser with explicit control"),
  createBullet("No recursion needed"),

  createCodeBlock(`Parsing Table Construction:
For each production A → α:
  For each terminal 'a' in FIRST(α):
    M[A][a] = A → α
  If ε in FIRST(α):
    For each terminal 'b' in FOLLOW(A):
      M[A][b] = A → α

Example LL(1) Parser:
Stack: [#, Start]
Input: [id, +, id, #]

If top == Terminal: match with input
If top == Non-terminal: push production from M[top][lookahead]
If top == #: if input == #, accept; else error`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),

  // ==================== MODULE 2 ====================
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
  createHeading("MODULE 2: LR PARSERS - FUNDAMENTALS"),

  createSubHeading("2.1 LR Parser Overview"),

  new Paragraph({
    children: [new TextRun("LR parsing is a powerful bottom-up parsing technique that can parse a large class of context-free grammars. The 'L' means left-to-right input scanning, 'R' means right-most derivation (reversed).")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LR Parser Advantages:", bold: true })]
  }),
  createBullet("Can parse most programming language grammars"),
  createBullet("No backtracking needed"),
  createBullet("Efficient: O(n) time complexity"),
  createBullet("Can detect errors quickly"),
  createBullet("Automatic parser generation possible (YACC)"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("2.2 LR(0), SLR(1), LALR(1), LR(1) Comparison"),

  createTable(
    ["Parser Type", "Power", "Table Size", "Conflicts"],
    [
      ["LR(0)", "Weakest", "Small", "Many shifts-reduce conflicts"],
      ["SLR(1)", "Stronger", "Small", "Fewer conflicts than LR(0)"],
      ["LALR(1)", "Powerful", "Medium", "Fewer conflicts than SLR(1)"],
      ["LR(1)", "Strongest", "Large", "Resolves most conflicts"],
      ["LL(1)", "Weakest", "Small", "Cannot handle left recursion"]
    ]
  ),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("2.3 LR Parser Architecture"),

  createCodeBlock(`LR Parser Components:
1. Input buffer: Contains tokens to be parsed
2. Stack: Stores state numbers (and optionally values)
3. Parsing table: Two subtables
   - ACTION table[state][terminal]: What to do
   - GOTO table[state][non-terminal]: Next state
4. Driver: Uses stack and tables to control parsing

Parsing Algorithm:
1. Initialize stack with initial state (0)
2. Repeat:
   a. Look at top of stack (state s) and current input (token a)
   b. Consult ACTION[s][a]
   c. If shift: push token and next state
   d. If reduce: pop RHS, push LHS and state from GOTO
   e. If accept: parsing complete
   f. If error: syntax error

State Stack:        [0, 1, 3, 5]
Input Remaining:   [+, id, $]
Top State:         5
Current Symbol:    +
ACTION[5][+]:      Reduce by E → T`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("2.4 Items and Item Sets"),

  new Paragraph({
    children: [new TextRun("An LR(0) item is a production with a dot (•) indicating how much of the production has been seen.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`Production: E → E + T

Related items:
  E → •E + T      (haven't seen anything yet)
  E → E•+ T       (seen E)
  E → E +•T       (seen E +)
  E → E + T•      (seen entire RHS - reduce item)

Interpretation:
E → •E + T: Expecting to see E followed by + T
E → E•+ T: Seen E, expecting +
E → E +•T: Seen E and +, expecting T
E → E + T•: Reduce by this production`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Kernel Items vs Non-Kernel Items:", bold: true })]
  }),
  createBullet("Kernel: Non-initial items or initial item [S' → •S, $]"),
  createBullet("Non-kernel: Items generated by closures"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("2.5 Closure and Goto Operations"),

  new Paragraph({
    children: [new TextRun({ text: "Closure(I):", bold: true })]
  }),
  createBullet("Given a set of items I, add all items that logically follow"),
  createBullet("If A → •B α is in I, add all items B → •β for every production B → β"),
  createBullet("Repeat until no new items can be added"),

  createCodeBlock(`Example:
Initial item: E → •E + T

Closure({E → •E + T}):
Add: E → •E + T
       E → •T         (since E appears after •)
Add: T → •F * T      (since T appears after •)
       T → •F
Add: F → •(E)        (since F appears after •)
       F → •id

Result: Complete closure set of all items`),

  new Paragraph({
    children: [new TextRun({ text: "\nGoto(I, X):", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Shift dot over symbol X in items of set I"),
  createBullet("Return closure of resulting items"),

  createCodeBlock(`Goto({E → •E + T}, E):
Shift dot over E: E → E•+ T
Return closure: {E → E•+ T}

Goto({E → •E + T, E → •T, ...}, T):
Shift dot over T: E → T•
Return closure: {E → T•}`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("2.6 LR(0) Automaton"),

  new Paragraph({
    children: [new TextRun("The LR(0) automaton is a finite automaton recognizing viable prefixes of the grammar. States are item sets, transitions are goto operations.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Construction Algorithm:", bold: true })]
  }),
  createBullet("Start state: Closure({S' → •S, $}) where S' is augmented start symbol"),
  createBullet("For each state and symbol X: Compute goto(state, X)"),
  createBullet("Add new state if not already present"),
  createBullet("Repeat until no new states"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),

  // ==================== MODULE 3 ====================
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
  createHeading("MODULE 3: CANONICAL LR(0) ITEMS & PARSING TABLES"),

  createSubHeading("3.1 Canonical Collection of LR(0) Items"),

  new Paragraph({
    children: [new TextRun("The canonical collection is the set of all possible LR(0) item sets reachable from the initial item set.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Step-by-Step Construction:", bold: true })]
  }),
  createCodeBlock(`1. Create augmented grammar:
   Original: E → E + T | T
   Augmented: E' → E

2. Create initial state I₀:
   I₀ = Closure({E' → •E})
   = {E' → •E, E → •E + T, E → •T, T → •id}

3. For each state I and each symbol X:
   J = Goto(I, X)
   If J ∉ collection, add J

4. States become columns, symbols become rows
   in final state machine

Example State Collection (simplified):
I₀: {E' → •E, E → •E+T, E → •T, T → •id}
I₁: {E' → E•, E → E•+T}         (from I₀, symbol E)
I₂: {E → T•}                     (from I₀, symbol T)
I₃: {T → id•}                    (from I₀, symbol id)
...`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("3.2 SLR(1) Parsing Tables"),

  new Paragraph({
    children: [new TextRun("SLR(1) = Simple LR(1). Uses LR(0) item sets but uses FOLLOW sets to resolve reduce conflicts.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "SLR(1) Table Construction:", bold: true })]
  }),
  createBullet("ACTION table rules:"),
  createBullet("  - If A → α•a β in state i and goto(i,a) = j: action[i][a] = shift j"),
  createBullet("  - If A → α• in state i (A ≠ S'): for a ∈ FOLLOW(A): action[i][a] = reduce by A → α"),
  createBullet("  - If S' → S• in state i: action[i][$] = accept"),
  createBullet("GOTO table rules:"),
  createBullet("  - If goto(i, A) = j: goto[i][A] = j"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Example SLR(1) Table:", bold: true })]
  }),
  createCodeBlock(`Grammar:
  E' → E
  E → E + T | T
  T → T * F | F
  F → (E) | id

First/Follow Sets:
  FIRST(E) = {id, (}
  FOLLOW(E) = {$, +, )}
  FOLLOW(T) = {$, +, ), *}
  FOLLOW(F) = {$, +, ), *, /}

Simplified SLR(1) Table (showing key entries):

State  id    +    *    (    )    $    E    T    F
0      s5         s4                1    2    3
1                 s6         r1    acc  
2           r3         r3    r3
3           r5         r5    r5
4      s5         s4              8    2    3
5           r5         r5    r5
6      s5         s4              9    2    3

Actions:
s5 = shift to state 5
r1 = reduce by production 1 (E → E+T)
r3 = reduce by production 3 (T → T*F)
acc = accept

Goto values filled similarly`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("3.3 Canonical LR(1) Parsing Tables"),

  new Paragraph({
    children: [new TextRun("Canonical LR(1) uses lookahead symbol in items to resolve conflicts more precisely than SLR(1). More powerful but larger tables.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LR(1) Items:", bold: true })]
  }),
  createBullet("Include lookahead symbol: [A → α•β, a]"),
  createBullet("'a' is lookahead - the token that can follow this item"),
  createBullet("More information allows more precise shift/reduce decisions"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Closure for LR(1):", bold: true })]
  }),
  createCodeBlock(`If [A → α•B β, a] is in I:
For each production B → γ:
  For each terminal 'b' in FIRST(βa):
    Add [B → •γ, b] to I

Example:
[E → •T + E, $] in closure
T appears after •
For production T → id:
  FIRST(+E$) = {+}
  Add [T → •id, +]`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LR(1) Table Construction:", bold: true })]
  }),
  createBullet("For [A → α•aβ, b] with goto(state, a) = state':"),
  createBullet("  action[state][a] = shift state'"),
  createBullet("For [A → α•, a] where A ≠ S':"),
  createBullet("  action[state][a] = reduce by A → α"),
  createBullet("For [S' → S•, $]:"),
  createBullet("  action[state][$] = accept"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Advantages over SLR(1):", bold: true })]
  }),
  createBullet("More precise reduce decisions (uses specific lookahead)"),
  createBullet("Resolves shift-reduce conflicts SLR(1) cannot"),
  createBullet("Fewer conflicts in general"),

  new Paragraph({
    children: [new TextRun({ text: "\nDisadvantages:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Larger state machines (more states)"),
  createBullet("Larger parsing tables (more memory)"),
  createBullet("More complex to construct"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("3.4 LALR(1) Parsing Tables"),

  new Paragraph({
    children: [new TextRun("LALR(1) = LookAhead LR(1). Merges LR(1) states with same cores to reduce table size while maintaining most power of LR(1).")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Key Idea:", bold: true })]
  }),
  createBullet("LR(1) states often have same kernel items with different lookaheads"),
  createBullet("Merge states with same core (kernel items ignoring lookahead)"),
  createBullet("Combine lookaheads from merged states"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LALR Construction Algorithm:", bold: true })]
  }),
  createCodeBlock(`1. Build canonical LR(1) collection of items
2. For each pair of states:
   If cores are identical, merge them
   Combine lookaheads
3. Update goto and transition relations
4. Build ACTION and GOTO tables as in LR(1)

Trade-off:
- LR(1) might have 1000+ states
- LALR(1) might have 100-200 states
- But LALR(1) might create new conflicts
  (when merging creates shift/reduce ambiguity)`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "LALR(1) vs LR(1) vs SLR(1):", bold: true })]
  }),
  createTable(
    ["Aspect", "SLR(1)", "LALR(1)", "LR(1)"],
    [
      ["Power", "Weakest", "Strong", "Strongest"],
      ["Table Size", "Small", "Medium", "Large"],
      ["Conflicts", "More S/R", "Fewer S/R", "Resolved better"],
      ["Practical Use", "Simple langs", "Most real langs", "Very complex"],
      ["Tools", "Hand-made", "YACC, Bison", "Specialized"]
    ]
  ),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("3.5 Using Ambiguous Grammars"),

  new Paragraph({
    children: [new TextRun("Instead of rewriting grammar to make it unambiguous, we can use precedence/associativity declarations to resolve conflicts automatically.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Example: Arithmetic Expression Grammar (Ambiguous)", bold: true })]
  }),
  createCodeBlock(`Ambiguous Grammar:
  E → E + E
    | E * E
    | E ^ E
    | (E)
    | id

Resolving with Precedence:
%left +
%left *
%right ^

Precedence (low to high):
1. + (left associative)
2. * (left associative)
3. ^ (right associative)

With these declarations, + has lowest precedence,
^ has highest. Solves ambiguity: 2+3*4 = 2+(3*4)
and 2^3^4 = 2^(3^4) (right associative)`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Conflict Resolution Rules (in YACC/Bison):", bold: true })]
  }),
  createBullet("Shift-Reduce Conflict: Use operator's associativity/precedence"),
  createBullet("Reduce-Reduce Conflict: Reduce by rule that appears first in grammar"),
  createBullet("If operator has higher precedence, shift; lower, reduce; same, use associativity"),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),

  // ==================== MODULE 4 ====================
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
  createHeading("MODULE 4: AUTOMATIC PARSER GENERATOR (YACC/BISON)"),

  createSubHeading("4.1 YACC Overview"),

  new Paragraph({
    children: [new TextRun("YACC (Yet Another Compiler Compiler) is a tool that automatically generates LALR(1) parsers from grammar specifications. Bison is the modern GNU alternative.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "YACC Input File Structure:", bold: true })]
  }),
  createCodeBlock(`%{
  #include <stdio.h>
  int yylex();
  void yyerror(char *);
%}

%union {
  int ival;
  char *sval;
}

%token <ival> NUMBER
%token <sval> ID
%token PLUS MINUS TIMES DIVIDE

%left PLUS MINUS
%left TIMES DIVIDE
%right UMINUS

%type <ival> expr

%%

program : expr          { printf("Result: %d\\n", $1); }
        ;

expr    : expr PLUS expr   { $$ = $1 + $3; }
        | expr MINUS expr  { $$ = $1 - $3; }
        | expr TIMES expr  { $$ = $1 * $3; }
        | expr DIVIDE expr { $$ = $1 / $3; }
        | MINUS expr %prec UMINUS { $$ = -$2; }
        | LPAREN expr RPAREN       { $$ = $2; }
        | NUMBER                   { $$ = $1; }
        ;

%%

int main() {
  return yyparse();
}

void yyerror(char *s) {
  fprintf(stderr, "Parse error: %s\\n", s);
}`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("4.2 YACC Directives & Features"),

  createTable(
    ["Directive", "Purpose"],
    [
      ["%{...%}", "C code included in generated parser"],
      ["%union", "Define attribute types for semantic values"],
      ["%token", "Declare terminal symbols"],
      ["%type", "Declare non-terminal types"],
      ["%left", "Left-associative operators"],
      ["%right", "Right-associative operators"],
      ["%nonassoc", "Non-associative operators (no chaining)"],
      ["%prec", "Explicit precedence for production"],
      ["%%", "Separates prologue from grammar rules"],
      ["$1, $2, ...", "Semantic value of RHS symbols"],
      ["$$", "Semantic value of LHS symbol"],
      ["@1, @2, ...", "Location of RHS symbols"],
      ["@@", "Location of LHS symbol"]
    ]
  ),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("4.3 Semantic Actions"),

  new Paragraph({
    children: [new TextRun("Actions are C code executed when a production is reduced. Used to build parse tree, evaluate expressions, etc.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`expr : expr PLUS expr
       { 
         $$ = $1 + $3;     // $$ = result, $1 = left expr, $3 = right expr
         printf("Added %d + %d = %d\\n", $1, $3, $$);
       }
     ;

stmt : IF LPAREN expr RPAREN stmt
       {
         if ($3) execute_stmt($5);  // $3 is condition, $5 is statement
       }
     ;`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("4.4 Conflict Handling in YACC"),

  new Paragraph({
    children: [new TextRun("YACC automatically handles shift-reduce conflicts using precedence declarations.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`When YACC detects shift-reduce conflict on operator op:
1. Compare operator precedence in grammar vs production being reduced
2. If shift op has higher precedence: shift
3. If shift op has lower precedence: reduce
4. If same precedence: use associativity
   - %left: reduce (left associative)
   - %right: shift (right associative)

Example:
Input: 2 + 3 * 4
When seeing * after +3:
- + has lower precedence than *
- Shift the *, so 3*4 is done first
- Result: 2 + (3*4) = 14

Input: 2 ^ 3 ^ 4 (with %right ^)
When seeing ^ after 3:
- Same precedence
- %right means shift
- Result: 2 ^ (3^4)`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("4.5 YACC Compilation & Execution"),

  createCodeBlock(`Building:
$ yacc -d grammar.y          # -d generates y.tab.h with token definitions
$ lex lexical.l              # Generate lexer
$ gcc y.tab.c lex.yy.c -ly -ll -o parser

Or with modern Bison:
$ bison -d grammar.y
$ flex lexical.l
$ gcc y.tab.c lex.yy.c -o parser

Running:
$ ./parser < input.txt
$ echo "2+3*4" | ./parser

Key files generated:
y.tab.c   - Parser implementation
y.tab.h   - Token definitions
y.output  - Detailed parsing table dump (with -v flag)
lex.yy.c  - Lexer from LEX`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("4.6 Debugging YACC Programs"),

  createCodeBlock(`Using y.output file:
$ yacc -v grammar.y      # Generates y.output with detailed info

y.output contains:
- All states and transitions
- Shift/reduce conflicts found
- Reduce/reduce conflicts
- Final parsing table

Example from y.output:
state 5
  expr : expr . PLUS expr  (line 2)
  expr : expr . TIMES expr
  
  PLUS  shift, and go to state 6
  TIMES shift, and go to state 7
  PLUS  reduce 5  [conflict]
  TIMES reduce 5

This shows conflicts - parser chooses action (shift in this case)`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),

  // ==================== MODULE 5 ====================
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
  createHeading("MODULE 5: IMPLEMENTING LR PARSING TABLES"),

  createSubHeading("5.1 Parsing Table Data Structure"),

  new Paragraph({
    children: [new TextRun("LR parsing tables must store ACTION and GOTO information efficiently for runtime parsing.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`Two main representations:

1. Two-Dimensional Array (Dense):
   ACTION[state][terminal] - parsing action
   GOTO[state][non-terminal] - next state
   
   Pros: Fast access O(1)
   Cons: Memory waste for sparse tables
   
   Examples:
   ACTION[5]['+'] = (SHIFT, 8)
   ACTION[5]['*'] = (REDUCE, 1)
   GOTO[5][E] = 7

2. Sparse Representation (Hash Table):
   Store only non-empty entries
   
   Pros: Memory efficient
   Cons: Slower lookup
   
   Examples:
   hash[encode(5, '+')] = (SHIFT, 8)
   hash[encode(5, '*')] = (REDUCE, 1)`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("5.2 Action and Goto Records"),

  new Paragraph({
    children: [new TextRun("Each table entry is a record specifying the action to take.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`Action Types:
1. Shift n: Push token on stack, push state n
2. Reduce p: Pop RHS of production p, reduce by that production
3. Goto n: Push result on stack, push state n
4. Accept: Parsing successful
5. Error: Syntax error

C struct representation:
struct Action {
  enum { SHIFT, REDUCE, ACCEPT, ERROR } type;
  int value;  // state number for shift, production number for reduce
};

struct Entry {
  struct Action action;
  int goto_state;  // for non-terminals
};`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("5.3 Parsing Algorithm Implementation"),

  new Paragraph({
    children: [new TextRun({ text: "The core parsing loop:", bold: true })]
  }),
  createCodeBlock(`parse(tokens[]) {
  stack<int> states;           // Stack of state numbers
  stack<Value> values;         // Stack of semantic values
  
  states.push(0);              // Initial state
  int token_idx = 0;
  
  while (true) {
    int current_state = states.top();
    Token current_token = tokens[token_idx];
    
    Action action = ACTION[current_state][current_token];
    
    switch (action.type) {
      case SHIFT:
        values.push(current_token.value);
        states.push(action.value);
        token_idx++;
        break;
        
      case REDUCE: {
        Production p = get_production(action.value);
        // Pop RHS of production from stack
        for (int i = 0; i < p.rhs_count; i++) {
          values.pop();
          states.pop();
        }
        
        // Execute semantic action (if any)
        Value result = execute_action(p, values);
        
        // Prepare to push reduced non-terminal
        int return_state = states.top();
        int next_state = GOTO[return_state][p.lhs];
        
        values.push(result);
        states.push(next_state);
        break;
      }
      
      case ACCEPT:
        return values.top();  // Parsing successful
        
      case ERROR:
        error("Syntax error at " + current_token);
        break;
    }
  }
}`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("5.4 Handling Semantic Values"),

  new Paragraph({
    children: [new TextRun("Semantic values are computed during parsing and propagated through the stack.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  createCodeBlock(`struct StackEntry {
  int state;           // State number
  Value semantic_val;  // Semantic value
  Location loc;        // Location info (for errors)
};

When reducing by production A → X Y Z:
1. Pop 3 entries from value stack
2. Get values from popped entries: v1, v2, v3
3. Execute semantic action with these values
4. Compute result = action(v1, v2, v3)
5. Push result for non-terminal A

YACC semantic action: $$ = $1 + $3
Means: result_value = value_at_1 + value_at_3`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("5.5 Error Recovery in LR Parsers"),

  new Paragraph({
    children: [new TextRun("LR parsers have good error detection but limited error recovery.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "Panic Mode Recovery:", bold: true })]
  }),
  createBullet("Skip tokens until reaching a synchronizing token"),
  createBullet("Resume parsing from there"),
  createBullet("Synchronizing tokens: semicolon, }, for, if, etc."),

  new Paragraph({
    children: [new TextRun({ text: "\nPhrase Level Recovery:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Replace erroneous token with expected token"),
  createBullet("Continue parsing"),

  createCodeBlock(`Error recovery pseudocode:
if (action == ERROR) {
  report_error("Unexpected " + current_token);
  
  // Panic mode: skip tokens until we find one
  // that can start a statement
  while (current_token not in SYNC_SET) {
    token_idx++;
    current_token = tokens[token_idx];
  }
  
  // Try to recover
  if (can_recover()) {
    continue parsing
  } else {
    abort
  }
}`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),

  createSubHeading("5.6 Space Optimization of Parsing Tables"),

  new Paragraph({
    children: [new TextRun("LR parsing tables can be very large. Several techniques reduce memory usage.")]
  }),
  new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }),

  new Paragraph({
    children: [new TextRun({ text: "1. Table Compression:", bold: true })]
  }),
  createBullet("Use 1D array instead of 2D"),
  createBullet("Store only non-empty entries"),
  createBullet("Use hash functions for sparse entries"),

  new Paragraph({
    children: [new TextRun({ text: "\n2. Default Actions:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Store most common action as default"),
  createBullet("Only store exceptions"),
  createBullet("Reduces table size significantly"),

  new Paragraph({
    children: [new TextRun({ text: "\n3. State Merging:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("LALR merges LR(1) states (trade-off: some conflicts may return)"),
  createBullet("Reduces states from 1000+ to 100-200"),

  new Paragraph({
    children: [new TextRun({ text: "\n4. Sparse Matrix Storage:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Only store (row, col, value) tuples"),
  createBullet("Use efficient indexing"),

  createCodeBlock(`Memory comparison:
Dense 2D table:      1000 states × 100 symbols × 4 bytes = 400 KB
LALR sparse table:   200 states × avg 15 entries × 8 bytes = 24 KB
Reduction: ~94%`),

  new Paragraph({ children: [new TextRun("")], spacing: { after: 400 } }),

  // ==================== EXAM TIPS ====================
  new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } }),
  createHeading("EXAM TIPS & QUICK REFERENCE"),

  new Paragraph({
    children: [new TextRun({ text: "Key Parsing Techniques Summary:", bold: true })]
  }),
  createBullet("Shift-Reduce: Stack-based, bottom-up, handles shift/reduce conflicts"),
  createBullet("Operator Precedence: Simple, expression-specific, no full grammar"),
  createBullet("Top-Down (Recursive Descent): Recursive functions, easy to implement, needs LL grammar"),
  createBullet("Predictive (LL): Table-driven, no backtracking, requires LL(1) grammar"),

  new Paragraph({
    children: [new TextRun({ text: "\nLR Parser Hierarchy:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("LR(0): Weakest, smallest tables"),
  createBullet("SLR(1): Stronger than LR(0), same table size, uses FOLLOW sets"),
  createBullet("LALR(1): Merges LR(1) states, practical balance"),
  createBullet("LR(1): Strongest, largest tables"),

  new Paragraph({
    children: [new TextRun({ text: "\nKey Formulas & Definitions:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Item: Production with dot indicating progress [A → α•β, lookahead]"),
  createBullet("Closure: Add all items that logically follow from a set"),
  createBullet("Goto(I, X): Shift dot over X and return closure"),
  createBullet("Kernel items: Initial item and non-initial items"),
  createBullet("Core: Item without lookahead"),

  new Paragraph({
    children: [new TextRun({ text: "\nCommon Exam Questions:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Construct LR(0) items for a grammar"),
  createBullet("Build canonical collection of LR(0) items"),
  createBullet("Construct SLR(1), LALR(1), or LR(1) parsing table"),
  createBullet("Identify and resolve shift-reduce/reduce-reduce conflicts"),
  createBullet("Trace parsing of a string using LR table"),
  createBullet("Compare different parsing algorithms"),
  createBullet("Write YACC/Bison grammar with semantic actions"),
  createBullet("Handle ambiguous grammars with precedence"),

  new Paragraph({
    children: [new TextRun({ text: "\nPractical Tips:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Always augment grammar with S' → S"),
  createBullet("Compute FIRST/FOLLOW sets before constructing tables"),
  createBullet("For reduce items, only reduce on appropriate lookahead"),
  createBullet("Use y.output file from YACC to debug table issues"),
  createBullet("Merge states carefully in LALR to avoid new conflicts"),
  createBullet("Use precedence/associativity for ambiguous grammars instead of rewriting"),

  new Paragraph({
    children: [new TextRun({ text: "\nStudy Recommendations:", bold: true })],
    spacing: { before: 120 }
  }),
  createBullet("Practice constructing items and closure operations"),
  createBullet("Work through full parsing table construction examples"),
  createBullet("Understand why LR(1) > LALR(1) > SLR(1) > LR(0)"),
  createBullet("Code a simple LR parser with stack and table"),
  createBullet("Trace parsing steps for several input strings"),
  createBullet("Study conflict resolution in detail"),
  createBullet("Practice YACC/Bison programming"),
  createBullet("Understand relationship between parsing tables and actual parsing")
];

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      }
    ]
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } }
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E78" },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 }
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "44546A" },
        paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width: 12240,
            height: 15840
          },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: content
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/mnt/user-data/outputs/Parsing_Techniques_and_LR_Parsers.docx", buffer);
  console.log("Parsing guide document created successfully!");
});