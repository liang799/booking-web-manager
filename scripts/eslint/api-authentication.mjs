import fs from "node:fs";
import path from "node:path";
import tseslint from "typescript-eslint";

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
// GET sessions uses its own stage-aware authenticated discovery action. The other
// exceptions are public metadata/readiness, a Stripe signature, or a cron secret.
const exceptions = new Set([
  "GET /api/sessions", "GET /api/openapi", "GET /api/health", "POST /api/webhooks/stripe", "GET /api/cron/commitments",
]);
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const nameOf = (node) => node?.name ?? node?.value;
const unwrap = (node) => ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSInstantiationExpression", "ChainExpression"].includes(node?.type)
  ? unwrap(node.expression) : node;
const memberName = (node) => node.computed
  ? node.property.type === "Literal" ? node.property.value : undefined
  : nameOf(node.property);
function bindings(pattern) {
  if (pattern.type === "Identifier") return [pattern];
  if (pattern.type === "ObjectPattern") return pattern.properties.flatMap((property) => bindings(property.type === "RestElement" ? property.argument : property.value));
  if (pattern.type === "ArrayPattern") return pattern.elements.flatMap((element) => element ? bindings(element) : []);
  if (pattern.type === "AssignmentPattern") return bindings(pattern.left);
  if (pattern.type === "RestElement") return bindings(pattern.argument);
  return [];
}

/**
 * A deliberately small provenance check, not a JavaScript security verifier.
 * Follow immutable imports/aliases and straight-line factory wrappers to the
 * shared authentication boundary. Unknown shapes fail closed. Authentication
 * implementations and actor/ownership policy still need behavioral tests.
 */
export default {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      unguarded: "{{method}} {{route}} must use createAuthenticatedActions().get/json through an immutable, verifiable factory. Public or independently authenticated endpoints need an exact method/path exception.",
      reexport: "API routes cannot use unverifiable wildcard or CommonJS exports; export each HTTP method explicitly.",
    },
  },
  create(context) {
    const root = context.cwd;
    const relative = path.relative(root, context.filename).split(path.sep)
      .filter((segment) => !/^\([^)]*\)$/.test(segment));
    if (relative[0] !== "app" || relative[1] !== "api" || !/^route\.[cm]?[jt]sx?$/.test(relative.at(-1))) return {};
    const route = `/${relative.slice(1, -1).join("/")}`;
    const boundary = path.join(root, "app/http/authenticated-action.ts");
    const modules = new Map();
    const tracked = new Map();

    function moduleInfo(file, parsed) {
      const info = { file, ast: parsed.ast, parents: new WeakMap(), variables: new WeakMap(), references: [], kinds: new Map(), resolving: new Set() };
      function walk(node) {
        for (const key of parsed.visitorKeys[node.type] ?? []) {
          const value = node[key];
          for (const child of Array.isArray(value) ? value : [value]) {
            if (!child?.type) continue;
            info.parents.set(child, node);
            walk(child);
          }
        }
      }
      walk(info.ast);
      for (const scope of parsed.scopeManager.scopes) {
        for (const variable of scope.variables) {
          for (const id of variable.identifiers) info.variables.set(id, variable);
        }
        for (const reference of scope.references) {
          info.references.push(reference);
          if (reference.resolved) info.variables.set(reference.identifier, reference.resolved);
        }
      }
      modules.set(file, info);
      return info;
    }

    function resolveFile(specifier, from) {
      if (typeof specifier !== "string") return null;
      const base = specifier.startsWith("@/") ? path.resolve(root, specifier.slice(2))
        : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
      if (!base || !path.relative(root, base).startsWith(`app${path.sep}`)) return null;
      return [base, ...extensions.map((extension) => base + extension), ...extensions.map((extension) => path.join(base, `index${extension}`))]
        .find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
    }

    function readModule(file) {
      if (modules.has(file)) return modules.get(file);
      try {
        return moduleInfo(file, tseslint.parser.parseForESLint(fs.readFileSync(file, "utf8"), {
          filePath: file, loc: true, range: true, ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true },
        }));
      } catch {
        return null;
      }
    }

    function exported(file, name, seen = new Set()) {
      if (file === boundary && name === "createAuthenticatedActions") return "creator";
      const key = `${file}:${name}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const info = readModule(file);
      if (!info) return null;
      for (const statement of info.ast.body) {
        if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") continue;
        const declaration = statement.declaration;
        if (declaration?.type === "VariableDeclaration") {
          const value = declaration.declarations.find((item) => nameOf(item.id) === name);
          if (value) return resolve(value.id, info);
        }
        if (declaration?.type === "FunctionDeclaration" && nameOf(declaration.id) === name) return resolve(declaration.id, info);
        const specifier = statement.specifiers.find((item) => item.exportKind !== "type" && nameOf(item.exported) === name);
        if (!specifier) continue;
        const target = statement.source && resolveFile(statement.source.value, file);
        return statement.source ? target && exported(target, nameOf(specifier.local), seen) : resolve(specifier.local, info);
      }
      return null;
    }

    function wrapper(node, info) {
      if (node.async || node.generator || node.params.some((parameter) => parameter.type !== "Identifier")) return null;
      if (node.body.type !== "BlockStatement") return resolve(node.body, info) === "handler" ? "factory" : null;
      const statements = node.body.body;
      for (const statement of statements.slice(0, -1)) {
        if (statement.type !== "VariableDeclaration" || statement.kind !== "const"
          || statement.declarations.some((declaration) => !resolve(declaration.id, info))) return null;
      }
      const last = statements.at(-1);
      return last?.type === "ReturnStatement" && resolve(last.argument, info) === "handler" ? "factory" : null;
    }

    function resolve(expression, info) {
      const node = unwrap(expression);
      if (!node) return null;
      if (node.type === "Identifier") {
        const variable = info.variables.get(node);
        if (!variable || variable.defs.length !== 1) return null;
        tracked.set(variable, info);
        if (info.kinds.has(variable)) return info.kinds.get(variable);
        if (info.resolving.has(variable)) return null;
        info.resolving.add(variable);
        const definition = variable.defs[0];
        let kind = null;
        if (definition.type === "ImportBinding" && definition.node.type === "ImportSpecifier"
          && definition.node.importKind !== "type" && definition.parent.importKind !== "type") {
          const target = resolveFile(definition.parent.source.value, info.file);
          if (target) kind = exported(target, nameOf(definition.node.imported));
        } else if (definition.type === "Variable" && definition.parent.kind === "const"
          && definition.node.id.type === "Identifier") {
          kind = resolve(definition.node.init, info);
        } else if (definition.type === "FunctionName") {
          kind = wrapper(definition.node, info);
        }
        info.resolving.delete(variable);
        info.kinds.set(variable, kind);
        return kind;
      }
      if (["FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return wrapper(node, info);
      if (node.type === "MemberExpression" && !node.optional && ["get", "json"].includes(memberName(node))) {
        return resolve(node.object, info) === "actions" ? "factory" : null;
      }
      if (node.type === "CallExpression" && !node.optional) {
        const kind = resolve(node.callee, info);
        return kind === "creator" ? "actions" : kind === "factory" ? "handler" : null;
      }
      return null;
    }

    function safeReference(identifier, kind, info) {
      let node = identifier;
      let parent = info.parents.get(node);
      while (parent && unwrap(parent) === unwrap(node)) {
        node = parent;
        parent = info.parents.get(node);
      }
      if (parent?.type === "ExportSpecifier" && parent.local === node) return true;
      if (parent?.type === "VariableDeclarator" && parent.init === node) {
        return resolve(parent.id, info) === kind;
      }
      if (parent?.type === "ReturnStatement") return kind === "handler";
      if (parent?.type === "CallExpression" && parent.callee === node && !parent.optional) {
        return kind === "creator" || kind === "factory";
      }
      if (parent?.type === "MemberExpression" && parent.object === node && kind === "actions"
        && !parent.optional && ["get", "json"].includes(memberName(parent))) {
        return safeReference(parent, "factory", info);
      }
      return false;
    }

    function safeBindings() {
      // Inspect aliases too, including aliases not used by the exported handler:
      // `const leaked = actions; leaked.get = unsafe` must invalidate actions.
      for (const [variable, info] of tracked) {
        const kind = info.kinds.get(variable);
        if (!kind) return false;
        for (const reference of variable.references) {
          if (reference.isTypeReference && !reference.isValueReference) continue;
          if (reference.isWrite()) {
            if (!reference.init) return false;
          } else if (!safeReference(reference.identifier, kind, info)) return false;
        }
      }
      return true;
    }

    return {
      "Program:exit"(ast) {
        const info = moduleInfo(context.filename, { ast, visitorKeys: context.sourceCode.visitorKeys, scopeManager: context.sourceCode.scopeManager });
        function check(node, method, expression, source) {
          if (!methods.has(method) || exceptions.has(`${method} ${route}`)) return;
          tracked.clear();
          // Do not reuse provenance caches between exports: every method must
          // collect and validate its complete chain of bindings independently.
          for (const module of modules.values()) module.kinds.clear();
          const target = source && resolveFile(source.value, info.file);
          const kind = source ? target && exported(target, nameOf(expression)) : resolve(expression, info);
          if (kind !== "handler" || !safeBindings()) context.report({ node, messageId: "unguarded", data: { method, route } });
        }
        // Route entrypoints use ESM. Reject CommonJS globals even when passed
        // to another function or assigned to an alias we cannot verify.
        for (const reference of info.references) {
          if (["exports", "module"].includes(reference.identifier.name) && !reference.resolved?.defs.length) {
            context.report({ node: reference.identifier, messageId: "reexport" });
          }
        }
        for (const statement of ast.body) {
          if (statement.type === "TSExportAssignment") context.report({ node: statement, messageId: "reexport" });
          if (statement.type === "ExportAllDeclaration" && statement.exportKind !== "type") context.report({ node: statement, messageId: "reexport" });
          if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") continue;
          const declaration = statement.declaration;
          if (declaration?.type === "VariableDeclaration") {
            for (const value of declaration.declarations) {
              for (const identifier of bindings(value.id)) check(value, identifier.name, identifier);
            }
          } else if (declaration?.id) check(declaration, nameOf(declaration.id), declaration.id);
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind !== "type") check(specifier, nameOf(specifier.exported), specifier.local, statement.source);
          }
        }
      },
    };
  },
};
