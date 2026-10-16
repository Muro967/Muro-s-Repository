import path from "node:path";

const aliasRuntimePattern = /^@\/server\/runtime(?:\/|$)/;
const absoluteRuntimeSegment = `${path.sep}src${path.sep}server${path.sep}runtime`;

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

function hasClientDirective(program) {
  return program.body.some(
    (node) => node.type === "ExpressionStatement" && node.directive === "use client",
  );
}

const noServerRuntimeInClient = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent client components from bypassing guarded server entry points",
    },
    schema: [],
    messages: {
      serverRuntimeInClient:
        "Client modules cannot import server runtime internals. Use a server action, route handler, or guarded server entry point.",
    },
  },
  create(context) {
    let isClientModule = false;

    function reportRestrictedSource(node, source) {
      if (
        isClientModule &&
        typeof source.value === "string" &&
        isServerRuntimeImport(source.value, context.physicalFilename)
      ) {
        context.report({
          node,
          messageId: "serverRuntimeInClient",
        });
      }
    }

    return {
      Program(node) {
        isClientModule = hasClientDirective(node);
      },
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

export default noServerRuntimeInClient;
