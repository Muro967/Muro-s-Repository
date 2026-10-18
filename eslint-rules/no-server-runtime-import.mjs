import path from "node:path";

const aliasRuntimePattern = /^@\/server\/runtime(?:\/|$)/;
const absoluteRuntimeSegment = `${path.sep}src${path.sep}server${path.sep}runtime`;
const trustedRuntimeImporters = new Set([
  "src/server/db/client.ts",
  "src/server/env.ts",
  "src/server/auth.ts",
]);
const trustedRuntimeImporterRoots = [
  "src/server/runtime/",
  "scripts/",
  "tests/",
];

function toProjectPath(filename, cwd) {
  return path.relative(cwd, filename).split(path.sep).join("/");
}

function isTrustedRuntimeImporter(filename, cwd) {
  const projectPath = toProjectPath(filename, cwd);
  return (
    trustedRuntimeImporters.has(projectPath) ||
    trustedRuntimeImporterRoots.some((root) => projectPath.startsWith(root))
  );
}

function isServerRuntimeImport(importPath, filename) {
  if (aliasRuntimePattern.test(importPath)) {
    return true;
  }

  if (!importPath.startsWith(".") && !path.isAbsolute(importPath)) {
    return false;
  }

  const resolvedImport = path.resolve(path.dirname(filename), importPath);
  const runtimeIndex = resolvedImport.indexOf(absoluteRuntimeSegment);

  if (runtimeIndex === -1) {
    return false;
  }

  const boundaryIndex = runtimeIndex + absoluteRuntimeSegment.length;
  return (
    resolvedImport.length === boundaryIndex ||
    resolvedImport[boundaryIndex] === path.sep
  );
}

const noServerRuntimeImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Limit server runtime imports to explicit trusted entry points",
    },
    schema: [],
    messages: {
      serverRuntimeOutsideBoundary:
        "Server runtime internals may only be imported by guarded wrappers, runtime modules, trusted CLI scripts, or tests.",
    },
  },
  create(context) {
    const cwd = context.cwd ?? process.cwd();

    function reportRestrictedSource(node, source) {
      if (
        typeof source.value === "string" &&
        isServerRuntimeImport(source.value, context.physicalFilename) &&
        !isTrustedRuntimeImporter(context.physicalFilename, cwd)
      ) {
        context.report({
          node,
          messageId: "serverRuntimeOutsideBoundary",
        });
      }
    }

    return {
      ImportDeclaration(node) {
        reportRestrictedSource(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          reportRestrictedSource(node, node.source);
        }
      },
      ExportAllDeclaration(node) {
        reportRestrictedSource(node, node.source);
      },
      ImportExpression(node) {
        reportRestrictedSource(node, node.source);
      },
    };
  },
};

export default noServerRuntimeImport;
