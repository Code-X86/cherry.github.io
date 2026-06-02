(function (global) {
  'use strict';

  const TT = {
    NUM: 'NUM',
    FLOAT: 'FLOAT',
    STR: 'STR',
    BOOL: 'BOOL',
    NONE: 'NONE',
    IDENT: 'IDENT',
    PLUS: '+',
    MINUS: '-',
    STAR: '*',
    SLASH: '/',
    PERCENT: '%',
    EQ: '==',
    NEQ: '!=',
    LT: '<',
    LTE: '<=',
    GT: '>',
    GTE: '>=',
    AND: '&&',
    OR: '||',
    BANG: '!',
    ASSIGN: '=',
    LPAREN: '(',
    RPAREN: ')',
    LBRACE: '{',
    RBRACE: '}',
    COMMA: ',',
    DOT: '.',
    NEWLINE: 'NL',
    EOF: 'EOF',
    KW_LET: 'KW_LET',
    KW_MUT: 'KW_MUT',
    KW_FN: 'KW_FN',
    KW_IF: 'KW_IF',
    KW_ELSE: 'KW_ELSE',
    KW_WHILE: 'KW_WHILE',
    KW_RETURN: 'KW_RETURN',
    KW_IMPORT: 'KW_IMPORT',
    KW_PRINT: 'KW_PRINT',
  };

  const KW_MAP = {
    let: TT.KW_LET,
    mut: TT.KW_MUT,
    fn: TT.KW_FN,
    if: TT.KW_IF,
    else: TT.KW_ELSE,
    while: TT.KW_WHILE,
    return: TT.KW_RETURN,
    import: TT.KW_IMPORT,
    print: TT.KW_PRINT,
  };

  class CherryEmulatorError extends Error {
    constructor(message, line, column) {
      super(message);
      this.name = 'CherryEmulatorError';
      this.line = line || 0;
      this.column = column || 0;
    }
  }

  class ReturnSignal {
    constructor(value) {
      this.value = value;
    }
  }

  function lex(source) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let column = 1;
    const peek = (offset = 0) => source[i + offset];
    const advance = () => {
      const ch = source[i++];
      if (ch === '\n') {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      return ch;
    };
    const push = (type, start, value, raw) => tokens.push({ type, value, raw, line: start.line, column: start.column });

    while (i < source.length) {
      if (/[ \t\r]/.test(source[i])) {
        advance();
        continue;
      }
      if (source[i] === '#' || (source[i] === '/' && peek(1) === '/')) {
        while (i < source.length && source[i] !== '\n') advance();
        continue;
      }
      if (source[i] === '\n') {
        push(TT.NEWLINE, { line, column });
        advance();
        continue;
      }

      const start = { line, column };
      if (source[i] === '"') {
        advance();
        let value = '';
        while (i < source.length && source[i] !== '"') {
          if (source[i] === '\\') {
            advance();
            const escaped = advance();
            value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
          } else {
            value += advance();
          }
        }
        if (source[i] !== '"') throw new CherryEmulatorError('unterminated string', start.line, start.column);
        advance();
        push(TT.STR, start, value);
        continue;
      }

      if (/[0-9]/.test(source[i])) {
        let raw = '';
        let isFloat = false;
        while (i < source.length && /[0-9]/.test(source[i])) raw += advance();
        if (source[i] === '.' && /[0-9]/.test(peek(1))) {
          isFloat = true;
          raw += advance();
          while (i < source.length && /[0-9]/.test(source[i])) raw += advance();
        }
        push(isFloat ? TT.FLOAT : TT.NUM, start, isFloat ? parseFloat(raw) : parseInt(raw, 10), raw);
        continue;
      }

      if (/[A-Za-z_]/.test(source[i])) {
        let value = '';
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) value += advance();
        if (value === 'true' || value === 'false') {
          push(TT.BOOL, start, value === 'true', value);
          continue;
        }
        if (value === 'none') {
          push(TT.NONE, start, null, value);
          continue;
        }
        push(KW_MAP[value] || TT.IDENT, start, KW_MAP[value] ? undefined : value, value);
        continue;
      }

      const two = source[i] + source[i + 1];
      const twoMap = { '==': TT.EQ, '!=': TT.NEQ, '<=': TT.LTE, '>=': TT.GTE, '&&': TT.AND, '||': TT.OR };
      if (twoMap[two]) {
        push(twoMap[two], start, undefined, two);
        advance();
        advance();
        continue;
      }
      const oneMap = {
        '+': TT.PLUS,
        '-': TT.MINUS,
        '*': TT.STAR,
        '/': TT.SLASH,
        '%': TT.PERCENT,
        '<': TT.LT,
        '>': TT.GT,
        '!': TT.BANG,
        '=': TT.ASSIGN,
        '(': TT.LPAREN,
        ')': TT.RPAREN,
        '{': TT.LBRACE,
        '}': TT.RBRACE,
        ',': TT.COMMA,
        '.': TT.DOT,
      };
      if (oneMap[source[i]]) {
        push(oneMap[source[i]], start, undefined, source[i]);
        advance();
        continue;
      }
      throw new CherryEmulatorError(`unexpected character '${source[i]}'`, line, column);
    }

    tokens.push({ type: TT.EOF, line, column });
    return tokens;
  }

  function parse(tokens) {
    let current = 0;
    const peek = (offset = 0) => tokens[Math.min(current + offset, tokens.length - 1)];
    const skipNewlines = () => {
      while (peek().type === TT.NEWLINE) current += 1;
    };
    const check = (type) => {
      skipNewlines();
      return peek().type === type;
    };
    const eat = (type) => {
      skipNewlines();
      const token = peek();
      if (token.type !== type) {
        throw new CherryEmulatorError(`expected ${type} but got '${token.raw || token.value || token.type}'`, token.line, token.column);
      }
      current += 1;
      return token;
    };

    function program() {
      const body = [];
      while (true) {
        skipNewlines();
        if (peek().type === TT.EOF) break;
        body.push(statement());
      }
      return { type: 'Program', body };
    }

    function statement() {
      skipNewlines();
      const token = peek();
      if (token.type === TT.KW_LET) return letStatement();
      if (token.type === TT.KW_FN) return fnStatement();
      if (token.type === TT.KW_IF) return ifStatement();
      if (token.type === TT.KW_WHILE) return whileStatement();
      if (token.type === TT.KW_RETURN) return returnStatement();
      if (token.type === TT.KW_IMPORT) return importStatement();
      if (token.type === TT.KW_PRINT) return printStatement();
      return exprOrAssign();
    }

    function letStatement() {
      const token = peek();
      current += 1;
      let mutable = false;
      if (peek().type === TT.KW_MUT) {
        mutable = true;
        current += 1;
      }
      const name = eat(TT.IDENT).value;
      eat(TT.ASSIGN);
      return { type: 'Let', name, mutable, value: expression(), line: token.line, column: token.column };
    }

    function fnStatement() {
      const token = peek();
      current += 1;
      const name = eat(TT.IDENT).value;
      eat(TT.LPAREN);
      const params = [];
      while (!check(TT.RPAREN) && peek().type !== TT.EOF) {
        params.push(eat(TT.IDENT).value);
        if (peek().type === TT.COMMA) current += 1;
      }
      eat(TT.RPAREN);
      return { type: 'Fn', name, params, body: block(), line: token.line, column: token.column };
    }

    function block() {
      eat(TT.LBRACE);
      const body = [];
      while (!check(TT.RBRACE) && peek().type !== TT.EOF) body.push(statement());
      eat(TT.RBRACE);
      return body;
    }

    function ifStatement() {
      const token = peek();
      current += 1;
      const condition = expression();
      const thenBranch = block();
      let elseBranch = null;
      skipNewlines();
      if (peek().type === TT.KW_ELSE) {
        current += 1;
        elseBranch = block();
      }
      return { type: 'If', condition, thenBranch, elseBranch, line: token.line, column: token.column };
    }

    function whileStatement() {
      const token = peek();
      current += 1;
      return { type: 'While', condition: expression(), body: block(), line: token.line, column: token.column };
    }

    function returnStatement() {
      const token = peek();
      current += 1;
      if (check(TT.RBRACE) || peek().type === TT.EOF) return { type: 'Return', value: null, line: token.line, column: token.column };
      return { type: 'Return', value: expression(), line: token.line, column: token.column };
    }

    function importStatement() {
      const token = peek();
      current += 1;
      return { type: 'Import', name: eat(TT.IDENT).value, line: token.line, column: token.column };
    }

    function printStatement() {
      const token = peek();
      current += 1;
      eat(TT.LPAREN);
      const value = expression();
      eat(TT.RPAREN);
      return { type: 'Print', value, line: token.line, column: token.column };
    }

    function exprOrAssign() {
      const target = expression();
      if (peek().type === TT.ASSIGN) {
        current += 1;
        return { type: 'Assign', target, value: expression(), line: target.line, column: target.column };
      }
      return { type: 'ExprStmt', expression: target, line: target.line, column: target.column };
    }

    function expression() {
      return or();
    }
    function or() {
      let expr = and();
      while (peek().type === TT.OR) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: and(), line: op.line, column: op.column };
      }
      return expr;
    }
    function and() {
      let expr = equality();
      while (peek().type === TT.AND) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: equality(), line: op.line, column: op.column };
      }
      return expr;
    }
    function equality() {
      let expr = relational();
      while ([TT.EQ, TT.NEQ].includes(peek().type)) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: relational(), line: op.line, column: op.column };
      }
      return expr;
    }
    function relational() {
      let expr = additive();
      while ([TT.LT, TT.LTE, TT.GT, TT.GTE].includes(peek().type)) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: additive(), line: op.line, column: op.column };
      }
      return expr;
    }
    function additive() {
      let expr = multiplicative();
      while ([TT.PLUS, TT.MINUS].includes(peek().type)) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: multiplicative(), line: op.line, column: op.column };
      }
      return expr;
    }
    function multiplicative() {
      let expr = unary();
      while ([TT.STAR, TT.SLASH, TT.PERCENT].includes(peek().type)) {
        const op = peek();
        current += 1;
        expr = { type: 'BinOp', op: op.type, left: expr, right: unary(), line: op.line, column: op.column };
      }
      return expr;
    }
    function unary() {
      if ([TT.BANG, TT.MINUS].includes(peek().type)) {
        const op = peek();
        current += 1;
        return { type: 'Unary', op: op.type, expression: unary(), line: op.line, column: op.column };
      }
      return call();
    }
    function call() {
      let expr = primary();
      while (true) {
        if (peek().type === TT.DOT) {
          current += 1;
          const prop = eat(TT.IDENT);
          if (peek().type === TT.LPAREN) {
            current += 1;
            const args = argsList();
            eat(TT.RPAREN);
            expr = { type: 'MethodCall', object: expr, method: prop.value, args, line: prop.line, column: prop.column };
          } else {
            expr = { type: 'Member', object: expr, prop: prop.value, line: prop.line, column: prop.column };
          }
        } else if (peek().type === TT.LPAREN && expr.type === 'Ident') {
          current += 1;
          const args = argsList();
          eat(TT.RPAREN);
          expr = { type: 'Call', callee: expr.name, args, line: expr.line, column: expr.column };
        } else {
          break;
        }
      }
      return expr;
    }
    function argsList() {
      const args = [];
      while (!check(TT.RPAREN) && peek().type !== TT.EOF) {
        args.push(expression());
        if (peek().type === TT.COMMA) current += 1;
      }
      return args;
    }
    function primary() {
      skipNewlines();
      const token = peek();
      if ([TT.NUM, TT.FLOAT, TT.STR, TT.BOOL, TT.NONE].includes(token.type)) {
        current += 1;
        return { type: 'Literal', value: token.value, line: token.line, column: token.column };
      }
      if (token.type === TT.IDENT) {
        current += 1;
        return { type: 'Ident', name: token.value, line: token.line, column: token.column };
      }
      if (token.type === TT.LPAREN) {
        current += 1;
        const expr = expression();
        eat(TT.RPAREN);
        return expr;
      }
      throw new CherryEmulatorError(`unexpected '${token.raw || token.value || token.type}'`, token.line, token.column);
    }

    return program();
  }

  const nativePackages = {
    mathplus: {
      add: (a, b) => assertNumberPair('mathplus.add', a, b, () => a + b),
      mul: (a, b) => assertNumberPair('mathplus.mul', a, b, () => a * b),
    },
  };

  function assertNumberPair(name, a, b, op) {
    if (typeof a !== 'number' || typeof b !== 'number') throw new CherryEmulatorError(`${name}: expected two numbers`);
    const result = op();
    return Number.isInteger(a) && Number.isInteger(b) ? result | 0 : result;
  }

  async function interpret(ast, io) {
    const print = io.print || (() => {});
    const input = io.input || (async () => '');
    const globals = { vars: {}, mutable: {}, fns: {}, parent: null };
    const packages = {};

    for (const stmt of ast.body) {
      if (stmt.type === 'Fn') globals.fns[stmt.name] = stmt;
      else if (stmt.type === 'Import') {
        if (!nativePackages[stmt.name]) throw new CherryEmulatorError(`unknown package '${stmt.name}'`, stmt.line, stmt.column);
        packages[stmt.name] = nativePackages[stmt.name];
      } else if (stmt.type === 'Let') {
        globals.vars[stmt.name] = await evalExpr(stmt.value, globals);
        globals.mutable[stmt.name] = stmt.mutable;
      }
    }

    if (globals.fns.main) await callFn(globals.fns.main, [], globals);
    else {
      for (const stmt of ast.body) {
        if (!['Fn', 'Import', 'Let'].includes(stmt.type)) await execStmt(stmt, globals);
      }
    }

    async function execBlock(stmts, parent) {
      const env = { vars: {}, mutable: {}, fns: {}, parent };
      for (const stmt of stmts) {
        const result = await execStmt(stmt, env);
        if (result instanceof ReturnSignal) return result;
      }
      return null;
    }

    async function execStmt(stmt, env) {
      if (stmt.type === 'Let') {
        env.vars[stmt.name] = await evalExpr(stmt.value, env);
        env.mutable[stmt.name] = stmt.mutable;
      } else if (stmt.type === 'Assign') {
        if (stmt.target.type !== 'Ident') throw new CherryEmulatorError('unsupported assignment target', stmt.line, stmt.column);
        const target = findEnv(stmt.target.name, env);
        if (!target) throw new CherryEmulatorError(`undefined variable '${stmt.target.name}'`, stmt.line, stmt.column);
        if (!target.mutable[stmt.target.name]) throw new CherryEmulatorError(`cannot assign to immutable variable '${stmt.target.name}'`, stmt.line, stmt.column);
        target.vars[stmt.target.name] = await evalExpr(stmt.value, env);
      } else if (stmt.type === 'ExprStmt') {
        await evalExpr(stmt.expression, env);
      } else if (stmt.type === 'Print') {
        print(cherryString(await evalExpr(stmt.value, env)));
      } else if (stmt.type === 'If') {
        if (await evalExpr(stmt.condition, env)) return await execBlock(stmt.thenBranch, env);
        if (stmt.elseBranch) return await execBlock(stmt.elseBranch, env);
      } else if (stmt.type === 'While') {
        let loops = 0;
        while (await evalExpr(stmt.condition, env)) {
          loops += 1;
          if (loops > 10000) throw new CherryEmulatorError('loop limit exceeded (10000 iterations)', stmt.line, stmt.column);
          const result = await execBlock(stmt.body, env);
          if (result instanceof ReturnSignal) return result;
        }
      } else if (stmt.type === 'Return') {
        return new ReturnSignal(stmt.value ? await evalExpr(stmt.value, env) : null);
      } else if (stmt.type === 'Fn') {
        env.fns[stmt.name] = stmt;
      }
      return null;
    }

    async function callFn(fn, args, callerEnv) {
      const env = { vars: {}, mutable: {}, fns: {}, parent: globals };
      for (let i = 0; i < fn.params.length; i += 1) {
        env.vars[fn.params[i]] = args[i] === undefined ? null : args[i];
        env.mutable[fn.params[i]] = true;
      }
      const result = await execBlock(fn.body, env);
      return result instanceof ReturnSignal ? result.value : null;
    }

    function findEnv(name, env) {
      if (!env) return null;
      if (Object.prototype.hasOwnProperty.call(env.vars, name)) return env;
      return findEnv(name, env.parent);
    }

    function findFn(name, env) {
      if (!env) return null;
      if (env.fns && Object.prototype.hasOwnProperty.call(env.fns, name)) return env.fns[name];
      return findFn(name, env.parent);
    }

    async function evalExpr(expr, env) {
      if (!expr) return null;
      if (expr.type === 'Literal') return expr.value;
      if (expr.type === 'Ident') {
        const found = findEnv(expr.name, env);
        if (found) return found.vars[expr.name];
        if (packages[expr.name]) return packages[expr.name];
        throw new CherryEmulatorError(`undefined variable '${expr.name}'`, expr.line, expr.column);
      }
      if (expr.type === 'Member') {
        const object = await evalExpr(expr.object, env);
        if (object && typeof object === 'object' && expr.prop in object) return object[expr.prop];
        throw new CherryEmulatorError(`no property '${expr.prop}'`, expr.line, expr.column);
      }
      if (expr.type === 'Call') {
        if (expr.callee === 'input') return await input(await inputPrompt(expr.args, env));
        if (expr.callee === 'input_int') return parseInputNumber(await input(await inputPrompt(expr.args, env)), true, expr);
        if (expr.callee === 'input_float') return parseInputNumber(await input(await inputPrompt(expr.args, env)), false, expr);
        if (expr.callee === 'str') return cherryString(await evalExpr(expr.args[0], env));
        if (expr.callee === 'int') return parseInputNumber(await evalExpr(expr.args[0], env), true, expr);
        if (expr.callee === 'float') return parseInputNumber(await evalExpr(expr.args[0], env), false, expr);
        const fn = findFn(expr.callee, env) || globals.fns[expr.callee];
        if (!fn) throw new CherryEmulatorError(`undefined function '${expr.callee}'`, expr.line, expr.column);
        const args = [];
        for (const arg of expr.args) args.push(await evalExpr(arg, env));
        return await callFn(fn, args, env);
      }
      if (expr.type === 'MethodCall') {
        const object = await evalExpr(expr.object, env);
        const fn = object && object[expr.method];
        if (typeof fn !== 'function') throw new CherryEmulatorError(`no method '${expr.method}'`, expr.line, expr.column);
        const args = [];
        for (const arg of expr.args) args.push(await evalExpr(arg, env));
        return fn(...args);
      }
      if (expr.type === 'Unary') {
        const value = await evalExpr(expr.expression, env);
        if (expr.op === TT.BANG) return !value;
        if (expr.op === TT.MINUS) return -value;
      }
      if (expr.type === 'BinOp') {
        const left = await evalExpr(expr.left, env);
        const right = await evalExpr(expr.right, env);
        return binary(expr.op, left, right, expr);
      }
      return null;
    }

    async function inputPrompt(args, env) {
      if (!args.length) return null;
      return cherryString(await evalExpr(args[0], env));
    }
  }

  function parseInputNumber(value, integer, expr) {
    if (typeof value === 'number') return integer ? Math.trunc(value) : value;
    const parsed = integer ? parseInt(value, 10) : parseFloat(value);
    if (Number.isNaN(parsed)) throw new CherryEmulatorError(`${integer ? 'int' : 'float'}(): cannot convert '${value}'`, expr.line, expr.column);
    return parsed;
  }

  function binary(op, left, right, expr) {
    switch (op) {
      case TT.PLUS:
        return typeof left === 'string' || typeof right === 'string' ? cherryString(left) + cherryString(right) : left + right;
      case TT.MINUS:
        return left - right;
      case TT.STAR:
        return left * right;
      case TT.SLASH:
        if (right === 0) throw new CherryEmulatorError('division by zero', expr.line, expr.column);
        return Number.isInteger(left) && Number.isInteger(right) ? Math.trunc(left / right) : left / right;
      case TT.PERCENT:
        return left % right;
      case TT.EQ:
        return left === right;
      case TT.NEQ:
        return left !== right;
      case TT.LT:
        return left < right;
      case TT.LTE:
        return left <= right;
      case TT.GT:
        return left > right;
      case TT.GTE:
        return left >= right;
      case TT.AND:
        return left && right;
      case TT.OR:
        return left || right;
      default:
        return null;
    }
  }

  function cherryString(value) {
    if (value === null || value === undefined) return 'none';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return '[package]';
    return String(value);
  }

  async function run(source, options) {
    const io = options || {};
    const ast = parse(lex(source));
    return await interpret(ast, io);
  }

  global.CherryEmulator = { lex, parse, interpret, run, CherryEmulatorError };
})(window);
