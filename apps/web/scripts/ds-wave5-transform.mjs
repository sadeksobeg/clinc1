import fs from "node:fs";
import path from "node:path";

const roots = [
  path.join(process.cwd(), "app/(app)/platform"),
  path.join(process.cwd(), "features/public"),
];

const steps = [
  ["space-y-8", "flex flex-col gap-cg-6"],
  ["space-y-6", "flex flex-col gap-cg-5"],
  ["space-y-4", "flex flex-col gap-cg-4"],
  ["space-y-3", "flex flex-col gap-cg-3"],
  ["space-y-2", "flex flex-col gap-cg-2"],
  ["space-y-1", "flex flex-col gap-cg-1"],
  ["space-y-0.5", "flex flex-col gap-cg-1"],
  ["gap-5", "gap-cg-5"],
  ["gap-4", "gap-cg-4"],
  ["gap-3", "gap-cg-3"],
  ["gap-2", "gap-cg-2"],
  ["gap-1", "gap-cg-1"],
  ["px-4", "px-cg-4"],
  ["py-4", "py-cg-4"],
  ["py-3", "py-cg-3"],
  ["px-3", "px-cg-3"],
  ["py-2", "py-cg-2"],
  ["px-2", "px-cg-2"],
  ["py-1", "py-cg-1"],
  ["py-6", "py-cg-5"],
  ["p-8", "p-cg-6"],
  ["p-6", "p-cg-5"],
  ["p-5", "p-cg-5"],
  ["p-4", "p-cg-4"],
  ["p-3", "p-cg-3"],
  ["p-2", "p-cg-2"],
  ["p-0", "p-cg-0"],
  ["mb-6", "mb-cg-5"],
  ["mb-4", "mb-cg-4"],
  ["mb-3", "mb-cg-3"],
  ["mb-2", "mb-cg-2"],
  ["mb-1", "mb-cg-1"],
  ["mt-6", "mt-cg-5"],
  ["mt-4", "mt-cg-4"],
  ["mt-3", "mt-cg-3"],
  ["mt-2", "mt-cg-2"],
  ["mt-1", "mt-cg-1"],
  ["mt-0.5", "mt-cg-1"],
  ["pb-2", "pb-cg-2"],
  ["pb-3", "pb-cg-3"],
  ["pt-2", "pt-cg-2"],
  ["pt-4", "pt-cg-4"],
  ["ps-5", "ps-cg-5"],
  ["pe-4", "pe-cg-4"],
  ["ms-2", "ms-cg-2"],
  ["text-[11px]", "text-ds-label"],
  ["text-4xl", "text-ds-h1"],
  ["text-3xl", "text-ds-h1"],
  ["text-2xl", "text-ds-h1"],
  ["text-xl", "text-ds-h3"],
  ["text-lg", "text-ds-h2"],
  ["text-base", "text-ds-h3"],
  ["text-sm", "text-ds-body"],
  ["text-xs", "text-ds-small"],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

for (const root of roots) {
  for (const file of walk(root)) {
    let s = fs.readFileSync(file, "utf8");
    const orig = s;
    for (const [a, b] of steps) {
      s = s.split(a).join(b);
    }
    if (s !== orig) {
      fs.writeFileSync(file, s, "utf8");
      console.log("updated", path.relative(process.cwd(), file));
    }
  }
}
