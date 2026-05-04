/**
 * @fileoverview Clinic OS — design discipline rules (spacing cg-*, typography ds-*).
 * Keeps tokens meaningful: violations default to "warn" to allow incremental adoption.
 */

const SPACING_PREFIXES = [
  "p",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "m",
  "mx",
  "my",
  "mt",
  "mb",
  "ml",
  "mr",
  "gap",
  "space-x",
  "space-y",
];

/** Tailwind numeric / arbitrary spacing scale (not cg-*) */
const NON_CG_SPACING_RE = new RegExp(
  `\\b(?:${SPACING_PREFIXES.join("|")})-(?!cg-)(?:\\[\\S+?\\]|\\d+)\\b`,
  "g",
);

/** Forbidden raw palette utilities (prefer semantic: danger, success, warning, primary, …) */
const RAW_PALETTE_COLOR_RE =
  /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|accent|caret|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:\d{2,3})\b/g;

/** Typography: fixed Tailwind font sizes */
const NON_DS_TEXT_SIZE_RE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g;

/** Arbitrary font size */
const ARBITRARY_TEXT_SIZE_RE = /\btext-\[[^\]]+\]\b/g;

function collectStringPartsFromNode(node) {
  /** @type {string[]} */
  const parts = [];
  if (!node) return parts;

  if (node.type === "Literal" && typeof node.value === "string") {
    parts.push(node.value);
    return parts;
  }

  if (node.type === "TemplateLiteral") {
    for (const q of node.quasis) {
      if (q.value && q.value.cooked) parts.push(q.value.cooked);
    }
    return parts;
  }

  if (node.type === "CallExpression") {
    const callee = node.callee;
    const name =
      callee?.type === "Identifier"
        ? callee.name
        : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
          ? callee.property.name
          : null;
    if (name === "cn" || name === "clsx" || name === "cva" || name === "twMerge") {
      for (const arg of node.arguments) {
        if (arg.type === "Literal" && typeof arg.value === "string") {
          parts.push(arg.value);
        } else if (arg.type === "TemplateLiteral") {
          for (const q of arg.quasis) {
            if (q.value && q.value.cooked) parts.push(q.value.cooked);
          }
        } else if (arg.type === "ObjectExpression") {
          for (const prop of arg.properties) {
            if (prop.type === "Property" && prop.key.type === "Identifier" && prop.value.type === "Literal") {
              if (typeof prop.value.value === "string") parts.push(prop.value.value);
            }
          }
        }
      }
    }
  }

  return parts;
}

function reportMatches(context, node, re, source, messageId) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    context.report({ node, messageId, data: { match: m[0] } });
  }
}

const noNonCgSpacing = {
  meta: {
    type: "suggestion",
    docs: { description: "Use Clinic OS spacing scale: p-cg-*, gap-cg-*, m-cg-* (see tailwind.config)" },
    schema: [],
    messages: {
      default:
        "Clinic OS: use cg-* spacing tokens instead of default scale (found `{{match}}`). Example: `p-cg-4`, `gap-cg-2`.",
    },
  },
  create(context) {
    function checkClassSource(node, source) {
      if (!source || typeof source !== "string") return;
      NON_CG_SPACING_RE.lastIndex = 0;
      let m;
      while ((m = NON_CG_SPACING_RE.exec(source)) !== null) {
        context.report({ node, messageId: "default", data: { match: m[0] } });
      }
    }

    function visitJsxClassName(attr) {
      const v = attr.value;
      if (!v) return;
      if (v.type === "Literal" && typeof v.value === "string") {
        checkClassSource(attr, v.value);
        return;
      }
      if (v.type === "JSXExpressionContainer") {
        const expr = v.expression;
        if (expr.type === "Literal" && typeof expr.value === "string") {
          checkClassSource(attr, expr.value);
          return;
        }
        if (expr.type === "TemplateLiteral") {
          const combined = expr.quasis.map((q) => q.value.cooked || "").join("");
          checkClassSource(attr, combined);
          return;
        }
        for (const part of collectStringPartsFromNode(expr)) {
          checkClassSource(attr, part);
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name?.type !== "JSXIdentifier" || node.name.name !== "className") return;
        visitJsxClassName(node);
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        if (name !== "cva") return;
        for (const arg of node.arguments) {
          if (arg.type !== "ObjectExpression") continue;
          for (const prop of arg.properties) {
            if (prop.type !== "Property" || prop.value.type !== "Literal") continue;
            if (typeof prop.value.value !== "string") continue;
            checkClassSource(prop.value, prop.value.value);
          }
        }
      },
    };
  },
};

const noNonDsTypography = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer text-ds-* typography scale over text-xs/sm/…" },
    schema: [],
    messages: {
      size: "Clinic OS: use typography tokens (`text-ds-body`, `text-ds-small`, …) instead of `{{match}}`.",
      arbitrary: "Clinic OS: avoid arbitrary font sizes like `{{match}}`; use `text-ds-*`.",
    },
  },
  create(context) {
    function check(node, source) {
      if (!source || typeof source !== "string") return;
      reportMatches(context, node, NON_DS_TEXT_SIZE_RE, source, "size");
      reportMatches(context, node, ARBITRARY_TEXT_SIZE_RE, source, "arbitrary");
    }

    return {
      JSXAttribute(attr) {
        if (attr.name?.type !== "JSXIdentifier" || attr.name.name !== "className") return;
        const v = attr.value;
        if (v?.type === "Literal" && typeof v.value === "string") check(attr, v.value);
        else if (v?.type === "JSXExpressionContainer") {
          const expr = v.expression;
          if (expr.type === "Literal" && typeof expr.value === "string") check(attr, expr.value);
          else if (expr.type === "TemplateLiteral") {
            check(attr, expr.quasis.map((q) => q.value.cooked || "").join(""));
          } else {
            for (const part of collectStringPartsFromNode(expr)) check(attr, part);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        if (name !== "cva") return;
        for (const arg of node.arguments) {
          if (arg.type !== "ObjectExpression") continue;
          for (const prop of arg.properties) {
            if (prop.type !== "Property" || prop.value.type !== "Literal") continue;
            if (typeof prop.value.value !== "string") continue;
            check(prop.value, prop.value.value);
          }
        }
      },
    };
  },
};

const noRawPaletteColors = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer semantic colors (primary, danger, success, warning, info, muted)" },
    schema: [],
    messages: {
      default:
        "Clinic OS: use semantic colors instead of raw Tailwind palette (found `{{match}}`). Example: `bg-danger/20`, `text-primary`.",
    },
  },
  create(context) {
    function check(node, source) {
      if (!source || typeof source !== "string") return;
      reportMatches(context, node, RAW_PALETTE_COLOR_RE, source, "default");
    }

    return {
      JSXAttribute(attr) {
        if (attr.name?.type !== "JSXIdentifier" || attr.name.name !== "className") return;
        const v = attr.value;
        if (v?.type === "Literal" && typeof v.value === "string") check(attr, v.value);
        else if (v?.type === "JSXExpressionContainer") {
          const expr = v.expression;
          if (expr.type === "Literal" && typeof expr.value === "string") check(attr, expr.value);
          else if (expr.type === "TemplateLiteral") {
            check(attr, expr.quasis.map((q) => q.value.cooked || "").join(""));
          } else {
            for (const part of collectStringPartsFromNode(expr)) check(attr, part);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        if (name !== "cva") return;
        for (const arg of node.arguments) {
          if (arg.type !== "ObjectExpression") continue;
          for (const prop of arg.properties) {
            if (prop.type !== "Property" || prop.value.type !== "Literal") continue;
            if (typeof prop.value.value !== "string") continue;
            check(prop.value, prop.value.value);
          }
        }
      },
    };
  },
};

module.exports = {
  rules: {
    "no-non-cg-spacing": noNonCgSpacing,
    "no-non-ds-typography": noNonDsTypography,
    "no-raw-palette-colors": noRawPaletteColors,
  },
};
