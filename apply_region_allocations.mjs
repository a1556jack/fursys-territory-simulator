import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";

const allocations = new Map([
  ["\uac15\uc11c\uad6c", [
    { regionId: "11500", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc11c\uc6b8\ud2b9\ubcc4\uc2dc \uac15\uc11c\uad6c \uc5f0\uacb0" },
  ]],
  ["\ub3d9\uad6c", [
    { regionId: "28140", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc778\ucc9c\uad11\uc5ed\uc2dc \ub3d9\uad6c \uc5f0\uacb0" },
  ]],
  ["\uc11c\uad6c", [
    { regionId: "28260", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc778\ucc9c\uad11\uc5ed\uc2dc \uc11c\uad6c \uc5f0\uacb0" },
  ]],
  ["\uc911\uad6c", [
    { regionId: "11140", share: 0.9, status: "\uc911\uad6c \uc6d0\ubcf8 9:1 \ubd84\ubc30 (\uc11c\uc6b8 90%)" },
    { regionId: "28110", share: 0.1, status: "\uc911\uad6c \uc6d0\ubcf8 9:1 \ubd84\ubc30 (\uc778\ucc9c 10%)" },
  ]],
]);

const data = structuredClone(APP_DATA);
const regionById = new Map(data.regions.map((region) => [region.id, region]));
const remainingUnresolved = [];

for (const source of data.unresolved) {
  const rules = allocations.get(source.name);
  if (!rules) {
    remainingUnresolved.push(source);
    continue;
  }

  let remainingSales = source.sales;
  let remainingInstallCost = source.installCost;
  rules.forEach((rule, index) => {
    const region = regionById.get(rule.regionId);
    if (!region) throw new Error(`Allocation target not found: ${rule.regionId}`);
    const isLast = index === rules.length - 1;
    const sales = isLast ? remainingSales : Math.round(source.sales * rule.share);
    const installCost = isLast ? remainingInstallCost : Math.round(source.installCost * rule.share);
    region.sales = (region.sales || 0) + sales;
    region.installCost = (region.installCost || 0) + installCost;
    region.dataStatus = rule.status;
    remainingSales -= sales;
    remainingInstallCost -= installCost;
  });
}

data.unresolved = remainingUnresolved;
data.metadata.generatedAt = new Date().toISOString();
data.metadata.linkedSourceRows = data.metadata.sourceRows - remainingUnresolved.length;
data.metadata.linkedRegionCount = data.regions.filter((region) => region.sales !== null).length;
data.metadata.linkedSalesTotal = data.regions.reduce((sum, region) => sum + (region.sales || 0), 0);
data.metadata.linkedInstallTotal = data.regions.reduce((sum, region) => sum + (region.installCost || 0), 0);
data.metadata.unresolvedSalesTotal = remainingUnresolved.reduce((sum, row) => sum + row.sales, 0);
data.metadata.unresolvedInstallTotal = remainingUnresolved.reduce((sum, row) => sum + row.installCost, 0);
data.metadata.allocationNotes = [
  "\uc911\uad6c: \uc11c\uc6b8\ud2b9\ubcc4\uc2dc 90%, \uc778\ucc9c\uad11\uc5ed\uc2dc 10%",
  "\uac15\uc11c\uad6c: \uc11c\uc6b8\ud2b9\ubcc4\uc2dc",
  "\ub3d9\uad6c: \uc778\ucc9c\uad11\uc5ed\uc2dc",
  "\uc11c\uad6c: \uc778\ucc9c\uad11\uc5ed\uc2dc",
];

if (data.metadata.linkedSalesTotal + data.metadata.unresolvedSalesTotal !== data.metadata.sourceSalesTotal) {
  throw new Error("Sales allocation does not reconcile to the source total.");
}
if (data.metadata.linkedInstallTotal + data.metadata.unresolvedInstallTotal !== data.metadata.sourceInstallTotal) {
  throw new Error("Install-cost allocation does not reconcile to the source total.");
}

await fs.writeFile(
  new URL("./app/data.mjs", import.meta.url),
  `export const APP_DATA = ${JSON.stringify(data)};\n`,
  "utf8",
);

console.log(JSON.stringify({
  linkedSourceRows: data.metadata.linkedSourceRows,
  linkedRegionCount: data.metadata.linkedRegionCount,
  linkedSalesTotal: data.metadata.linkedSalesTotal,
  linkedInstallTotal: data.metadata.linkedInstallTotal,
  unresolved: remainingUnresolved.map((row) => row.name),
}));
